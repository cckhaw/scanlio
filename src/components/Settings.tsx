import { useEffect, useState, useSyncExternalStore } from 'react';
import { cloud } from '../cloud/CloudStorageManager';
import { queue } from '../lib/db';
import { haptic } from '../lib/haptics';
import { exportPrefs } from '../lib/export';
import type { ExportOptions as Opts } from '../types';
import { ExportOptions } from './ExportOptions';
import { FolderField } from './FolderField';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';
import type { ProviderId, QueueItem } from '../types';
import { AutoIcon, CheckIcon, MoonIcon, SunIcon } from './Icons';
import { useToast } from './Toast';

const THEMES: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <SunIcon width={18} height={18} /> },
  { id: 'dark', label: 'Dark', icon: <MoonIcon width={18} height={18} /> },
  { id: 'system', label: 'Auto', icon: <AutoIcon width={18} height={18} /> },
];

export function useCloudState() {
  return useSyncExternalStore((cb) => cloud.subscribe(cb), () => cloud.getState());
}

const Section = ({ title, children, footer }: { title: string; children: React.ReactNode; footer?: string }) => (
  <section className="mb-7">
    <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-secondary">{title}</h2>
    <div className="card divide-y divide-[color:var(--glass-border)] overflow-hidden">{children}</div>
    {footer && <p className="mt-2 px-4 text-[12px] text-secondary">{footer}</p>}
  </section>
);

export function Settings() {
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const cs = useCloudState();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [opts, setOpts] = useState<Opts>(exportPrefs.get);
  const [storage, setStorage] = useState('');

  useEffect(() => { void queue.all().then(setItems); }, [cs.flushing, cs.progress]);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => e.usage != null && setStorage(`${(e.usage / 1048576).toFixed(1)} MB used on this device`));
    void navigator.storage?.persist?.();    // ask the browser not to evict offline scans
  }, []);

  const toggle = async (id: ProviderId) => {
    setBusy(id);
    try {
      if (cloud.providers[id].isConnected() && !(id === 'icloud' && !('showDirectoryPicker' in window))) { await cloud.disconnect(id); toast(`Disconnected`, 'info'); }
      else { await cloud.connect(id); toast(`${cloud.providers[id].label} connected`, 'success'); }
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not connect', 'error'); }
    finally { setBusy(null); }
  };

  const nativeIcloud = 'showDirectoryPicker' in window;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32">
      <h1 className="pt-safe pb-4 pt-1 text-[34px] font-bold tracking-tight">Settings</h1>

      <Section title="Appearance">
        <div className="p-2">
          <div className="relative grid grid-cols-3 gap-1 rounded-btn bg-label/[.07] p-1" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={mode === t.id} onClick={() => { haptic('light'); setMode(t.id); }}
                className={`flex min-h-tap items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition-all duration-500 ease-hig ${mode === t.id ? 'bg-elevated text-label shadow-glass' : 'text-secondary'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Cloud storage" footer={nativeIcloud ? 'iCloud Drive: pick your iCloud Drive folder once; files are written there directly.' : 'iCloud Drive on this browser uses the share sheet — choose “Save to Files › iCloud Drive” when prompted.'}>
        {(['google', 'onedrive', 'icloud'] as ProviderId[]).filter((id) => cloud.providers[id].configured()).map((id) => {
          const p = cloud.providers[id];
          const connected = p.isConnected() && (id !== 'icloud' || nativeIcloud);
          const attention = cs.needsAttention[id];
          return (
            <div key={id}>
            <div className="flex min-h-[60px] items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold">{p.label}</p>
                <p className={`line-clamp-2 text-[12px] ${attention ? 'text-warning' : connected ? 'text-success' : 'text-secondary'}`}>
                  {attention ?? (connected ? (id === 'icloud' ? 'Folder linked' : 'Connected') : id === 'icloud' && !nativeIcloud ? 'Share sheet' : 'Not connected')}
                </p>
              </div>
              {!(id === 'icloud' && !nativeIcloud) && (
                <button className={connected && !attention ? 'btn-glass' : 'btn-tinted'} disabled={busy === id} onClick={() => void toggle(id)}>
                  {busy === id ? '…' : connected && !attention ? 'Disconnect' : attention ? 'Reconnect' : 'Connect'}
                </button>
              )}
            </div>
            {(connected || id === 'google' || id === 'onedrive') && <FolderField provider={id} />}
            </div>
          );
        })}
      </Section>

      <Section title="Default export" footer="Used when saving and uploading. You can change it per document in the save sheet.">
        <div className="p-3"><ExportOptions value={opts} onChange={(o) => { setOpts(o); exportPrefs.set(o); }} pageCount={2} /></div>
      </Section>

      <Section title="Sync queue" footer={cs.online ? undefined : 'Offline — pending uploads will resume automatically when a connection returns.'}>
        <div className="flex min-h-[52px] items-center justify-between px-4">
          <span className="text-[16px]">{items.length ? `${items.length} pending upload${items.length === 1 ? '' : 's'}` : 'All caught up'}</span>
          {items.length > 0 ? <button className="btn-tinted" onClick={() => void cloud.retryFailed()}>Sync now</button> : <CheckIcon className="text-success" />}
        </div>
        {items.filter((i) => i.error).map((i) => <p key={i.id} className="px-4 py-2 text-[12px] text-danger">{cloud.providers[i.provider].label}: {i.error}</p>)}
      </Section>

      {storage && <p className="text-center text-[12px] text-tertiary">{storage}</p>}
    </div>
  );
}
