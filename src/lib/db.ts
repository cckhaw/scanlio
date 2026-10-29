import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocRecord, ProviderId, QueueItem } from '../types';

interface ScanlioDB extends DBSchema {
  docs: { key: string; value: DocRecord; indexes: { 'by-date': number } };
  queue: { key: string; value: QueueItem; indexes: { 'by-doc': string } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<ScanlioDB>> | null = null;
const db = () =>
  (dbp ??= openDB<ScanlioDB>('scanlio', 1, {
    upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'id' }).createIndex('by-date', 'createdAt');
      d.createObjectStore('queue', { keyPath: 'id' }).createIndex('by-doc', 'docId');
      d.createObjectStore('kv');
    },
  }));

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
/** Subscribe to any write; used by the library to refresh. */
export const onDbChange = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));

export const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export const docs = {
  async all(): Promise<DocRecord[]> { return (await (await db()).getAllFromIndex('docs', 'by-date')).reverse(); },
  async get(id: string) { return (await db()).get('docs', id); },
  async put(d: DocRecord) { await (await db()).put('docs', d); emit(); },
  /** Read-modify-write inside one transaction so concurrent OCR / sync updates can't clobber each other. */
  async update(id: string, fn: (d: DocRecord) => void) {
    const tx = (await db()).transaction('docs', 'readwrite');
    const d = await tx.store.get(id);
    if (d) { fn(d); await tx.store.put(d); }
    await tx.done;
    emit();
  },
  async remove(id: string) {
    const d = await db();
    const tx = d.transaction(['docs', 'queue'], 'readwrite');
    await tx.objectStore('docs').delete(id);
    for (const q of await tx.objectStore('queue').index('by-doc').getAll(id)) await tx.objectStore('queue').delete(q.id);
    await tx.done;
    emit();
  },
};

export const queue = {
  async all() { return (await db()).getAll('queue'); },
  async add(docId: string, provider: ProviderId) {
    const d = await db();
    const dup = (await d.getAllFromIndex('queue', 'by-doc', docId)).find((q) => q.provider === provider);
    if (dup) return dup;
    const item: QueueItem = { id: uid(), docId, provider, attempts: 0, createdAt: Date.now() };
    await d.put('queue', item);
    emit();
    return item;
  },
  async put(q: QueueItem) { await (await db()).put('queue', q); emit(); },
  async remove(id: string) { await (await db()).delete('queue', id); emit(); },
};

export const kv = {
  async get<T>(key: string) { return (await (await db()).get('kv', key)) as T | undefined; },
  async set(key: string, value: unknown) { await (await db()).put('kv', value, key); },
  async del(key: string) { await (await db()).delete('kv', key); },
};
