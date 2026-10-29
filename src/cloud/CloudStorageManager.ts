import { docs, queue } from '../lib/db';
import { buildPdf } from '../lib/pdf';
import type { ProviderId, QueueItem } from '../types';
import { googleDrive } from './google';
import { iCloudDrive, restoreICloudHandle } from './icloud';
import { oneDrive } from './onedrive';
import { AuthError, type CloudProvider } from './types';

export interface ManagerState {
  online: boolean;
  flushing: boolean;
  /** 0..1 upload progress by queue item id */
  progress: Record<string, number>;
  /** providers whose last attempt needs the user (reconnect / re-grant) */
  needsAttention: Partial<Record<ProviderId, string>>;
}

export type UploadEvent = { kind: 'uploaded' | 'failed'; docName: string; provider: ProviderId; message?: string };

const MAX_ATTEMPTS = 5;
const NETWORK_PROVIDERS: ProviderId[] = ['google', 'onedrive'];

/**
 * Multi-provider auth + durable upload queue.
 * - `enqueue()` persists work in IndexedDB first (works offline).
 * - `flush()` drains it whenever we're online and a provider is connected; it is triggered by
 *   the `online` event, Background Sync wake-ups from the service worker, reconnects and a retry timer.
 */
class CloudStorageManager {
  readonly providers: Record<ProviderId, CloudProvider> = { google: googleDrive, onedrive: oneDrive, icloud: iCloudDrive };

  private state: ManagerState = { online: navigator.onLine, flushing: false, progress: {}, needsAttention: {} };
  private subs = new Set<(s: ManagerState) => void>();
  private events = new Set<(e: UploadEvent) => void>();
  private retryTimer: number | undefined;
  private started = false;

  /* ---------- lifecycle ---------- */
  start() {
    if (this.started) return;
    this.started = true;
    void restoreICloudHandle().then(() => this.emit());
    window.addEventListener('online', () => { this.patch({ online: true }); void this.flush(); });
    window.addEventListener('offline', () => this.patch({ online: false }));
    navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'scanlio-flush-queue') void this.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.flush(); });
    void this.flush();
  }

  /* ---------- observable state ---------- */
  getState = () => this.state;
  subscribe(fn: (s: ManagerState) => void) { this.subs.add(fn); return () => void this.subs.delete(fn); }
  onEvent(fn: (e: UploadEvent) => void) { this.events.add(fn); return () => void this.events.delete(fn); }
  private patch(p: Partial<ManagerState>) { this.state = { ...this.state, ...p }; this.emit(); }
  private emit() { this.subs.forEach((f) => f(this.state)); }

  folderName() { try { return localStorage.getItem('scanlio.folder') || 'Scanlio'; } catch { return 'Scanlio'; } }
  setFolderName(n: string) { try { localStorage.setItem('scanlio.folder', n.trim() || 'Scanlio'); } catch { /* ignore */ } }

  /* ---------- auth ---------- */
  async connect(id: ProviderId) {
    await this.providers[id].connect();
    const na = { ...this.state.needsAttention }; delete na[id];
    this.patch({ needsAttention: na });
    void this.flush();
  }
  async disconnect(id: ProviderId) { await this.providers[id].disconnect(); this.emit(); }
  connectedProviders() { return (Object.keys(this.providers) as ProviderId[]).filter((p) => this.providers[p].isConnected()); }

  /* ---------- queue ---------- */
  async enqueue(docId: string, targets: ProviderId[]) {
    for (const p of targets) {
      await queue.add(docId, p);
      await docs.update(docId, (d) => { d.sync[p] = 'queued'; });
    }
    void this.requestBackgroundSync();
    void this.flush();
  }

  private async requestBackgroundSync() {
    try {
      const reg = await navigator.serviceWorker?.ready;
      await (reg as unknown as { sync?: { register(tag: string): Promise<void> } })?.sync?.register('scanlio-sync');
    } catch { /* Background Sync unsupported (Safari/Firefox): the online event + retry timer cover it */ }
  }

  async flush() {
    if (this.state.flushing) return;
    this.patch({ flushing: true });
    let retryNeeded = false;
    try {
      const items = (await queue.all()).sort((a, b) => a.createdAt - b.createdAt);
      for (const item of items) {
        const provider = this.providers[item.provider];
        if (NETWORK_PROVIDERS.includes(item.provider) && !navigator.onLine) continue;
        if (!provider.isConnected()) { this.attention(item.provider, 'Not signed in'); continue; }
        if (item.attempts >= MAX_ATTEMPTS) continue;
        const outcome = await this.run(item, provider);
        if (outcome === 'retry') retryNeeded = true;
      }
    } finally {
      this.patch({ flushing: false });
      window.clearTimeout(this.retryTimer);
      if (retryNeeded) this.retryTimer = window.setTimeout(() => void this.flush(), 8000);
    }
  }

  private attention(id: ProviderId, msg: string) {
    this.patch({ needsAttention: { ...this.state.needsAttention, [id]: msg } });
  }

  private async run(item: QueueItem, provider: CloudProvider): Promise<'done' | 'retry' | 'auth' | 'gone'> {
    const doc = await docs.get(item.docId);
    if (!doc) { await queue.remove(item.id); return 'gone'; }
    await docs.update(doc.id, (d) => { d.sync[item.provider] = 'uploading'; });
    try {
      const pdf = doc.pdf ?? (await buildPdf(doc.pages, doc.name));
      await provider.upload(
        { name: `${safeName(doc.name)}.pdf`, blob: pdf, mime: 'application/pdf' },
        this.folderName(),
        (f) => this.patch({ progress: { ...this.state.progress, [item.id]: f } })
      );
      await queue.remove(item.id);
      await docs.update(doc.id, (d) => { d.sync[item.provider] = 'done'; });
      this.events.forEach((f) => f({ kind: 'uploaded', docName: doc.name, provider: item.provider }));
      return 'done';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (err instanceof AuthError) {
        await docs.update(doc.id, (d) => { d.sync[item.provider] = 'queued'; });
        item.error = message;
        await queue.put(item);
        this.attention(item.provider, message);
        return 'auth';
      }
      item.attempts++;
      item.error = message;
      await queue.put(item);
      const gaveUp = item.attempts >= MAX_ATTEMPTS;
      await docs.update(doc.id, (d) => { d.sync[item.provider] = gaveUp ? 'error' : 'queued'; });
      if (gaveUp) this.events.forEach((f) => f({ kind: 'failed', docName: doc.name, provider: item.provider, message }));
      return 'retry';
    } finally {
      const { [item.id]: _drop, ...rest } = this.state.progress;
      void _drop;
      this.patch({ progress: rest });
    }
  }

  /** Re-arm items that exhausted their retries (user tapped "Retry"). */
  async retryFailed() {
    for (const q of await queue.all()) { q.attempts = 0; q.error = undefined; await queue.put(q); await docs.update(q.docId, (d) => { d.sync[q.provider] = 'queued'; }); }
    void this.flush();
  }
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Scan';

export const cloud = new CloudStorageManager();
