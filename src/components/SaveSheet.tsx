import { useEffect, useState } from 'react';
import { cloud } from '../cloud/CloudStorageManager';
import { haptic } from '../lib/haptics';
import { exportPrefs } from '../lib/export';
import type { ExportOptions as Opts, ProviderId } from '../types';
import { ExportOptions } from './ExportOptions';
import { FolderField } from './FolderField';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, CloudUpIcon, TagIcon } from './Icons';

interface Props {
  open: boolean;
  pageCount: number;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { name: string; tags: string[]; destinations: ProviderId[]; export: Opts }) => void;
}

const LABELS: Record<ProviderId, string> = { google: 'Google Drive', onedrive: 'OneDrive', icloud: 'iCloud Drive' };
const defaultName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Scan ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

const readDest = (): ProviderId[] => { try { return JSON.parse(localStorage.getItem('scanlio.dest') || '[]'); } catch { return []; } };

export function SaveSheet({ open, pageCount, saving, onClose, onSave }: Props) {
  const [name, setName] = useState(defaultName);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [dest, setDest] = useState<ProviderId[]>(readDest);
  const [opts, setOpts] = useState<Opts>(exportPrefs.get);

  useEffect(() => { if (open) { setName(defaultName()); setTags([]); setDraft(''); setDest(readDest()); setOpts(exportPrefs.get()); } }, [open]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setDraft('');
  };
  const toggle = (p: ProviderId) => { haptic('light'); setDest((d) => (d.includes(p) ? d.filter((x) => x !== p) : [...d, p])); };

  const submit = () => {
    const finalTags = draft.trim() ? [...new Set([...tags, draft.trim().replace(/^#/, '').toLowerCase()])] : tags;
    try { localStorage.setItem('scanlio.dest', JSON.stringify(dest)); } catch { /* ignore */ }
    exportPrefs.set(opts);
    onSave({ name: name.trim() || defaultName(), tags: finalTags, destinations: dest, export: opts });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`Save ${pageCount} page${pageCount === 1 ? '' : 's'}`}>
      <div className="space-y-5 pb-4">
        <label className="block">
          <span className="mb-1.5 block px-1 text-[13px] font-medium text-secondary">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-tap w-full rounded-btn bg-label/[.07] px-4 text-[17px] outline-none focus:ring-2 focus:ring-accent" />
        </label>

        <div>
          <span className="mb-1.5 flex items-center gap-1.5 px-1 text-[13px] font-medium text-secondary"><TagIcon width={14} height={14} /> Tags</span>
          <div className="flex flex-wrap items-center gap-2 rounded-btn bg-label/[.07] p-2">
            {tags.map((t) => (
              <button key={t} className="chip !bg-accent !text-white" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>#{t} ×</button>
            ))}
            <input value={draft} placeholder={tags.length ? '' : 'receipts, physics, contract…'} enterKeyHint="done"
              onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(draft); } else if (e.key === 'Backspace' && !draft) setTags(tags.slice(0, -1)); }}
              className="min-h-[34px] min-w-[120px] flex-1 bg-transparent px-2 text-[16px] outline-none" />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block px-1 text-[13px] font-medium text-secondary">Export as</span>
          <ExportOptions value={opts} onChange={setOpts} pageCount={pageCount} />
        </div>

        <div>
          <span className="mb-1.5 flex items-center gap-1.5 px-1 text-[13px] font-medium text-secondary"><CloudUpIcon width={14} height={14} /> Upload to</span>
          <div className="overflow-hidden rounded-btn bg-label/[.07]">
            {(Object.keys(LABELS) as ProviderId[]).map((p, i) => {
              const on = dest.includes(p);
              const connected = cloud.providers[p].isConnected();
              return (
                <div key={p} className={i ? 'border-t hairline' : ''}>
                <button onClick={() => toggle(p)} role="checkbox" aria-checked={on}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors duration-300 active:bg-label/10">
                  <span className={`grid h-6 w-6 place-items-center rounded-full border-2 transition-all duration-300 ease-hig ${on ? 'border-accent bg-accent text-white' : 'border-label/25'}`}>
                    {on && <CheckIcon width={14} height={14} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-[16px] font-medium">{LABELS[p]}</span>
                  <span className={`text-[12px] ${connected ? 'text-success' : 'text-tertiary'}`}>{connected ? 'Connected' : on ? 'Queued until connected' : 'Not connected'}</span>
                </button>
                {on && <FolderField provider={p} compact />}
                </div>
              );
            })}
          </div>
          {!navigator.onLine && dest.length > 0 && <p className="mt-2 px-1 text-[12px] text-secondary">You're offline — scans are saved on this device and upload automatically when you're back online.</p>}
        </div>

        <button className="btn-primary w-full !min-h-[52px] text-[17px]" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : dest.length ? 'Save & Upload' : 'Save to Library'}
        </button>
      </div>
    </BottomSheet>
  );
}
