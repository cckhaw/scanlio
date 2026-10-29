import { useEffect, useMemo, useState } from 'react';
import { docs, onDbChange } from '../lib/db';
import { useObjectUrl } from '../lib/useObjectUrl';
import type { DocRecord, ProviderId } from '../types';
import { DocViewer } from './DocViewer';
import { CloudIcon, GridIcon, ListIcon, SearchIcon, WifiOffIcon } from './Icons';

export const PROVIDER_SHORT: Record<ProviderId, string> = { google: 'Drive', onedrive: 'OneDrive', icloud: 'iCloud' };

function useDocs() {
  const [list, setList] = useState<DocRecord[] | null>(null);
  useEffect(() => {
    const load = () => void docs.all().then(setList);
    load();
    return onDbChange(load);
  }, []);
  return list;
}

/** AND-match every search term against name, tags and OCR text. */
function matches(d: DocRecord, terms: string[]) {
  const hay = `${d.name} ${d.tags.join(' ')} ${d.ocrText}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function snippet(d: DocRecord, term: string) {
  const i = d.ocrText.toLowerCase().indexOf(term);
  if (i < 0) return null;
  const s = Math.max(0, i - 28);
  return (s ? '…' : '') + d.ocrText.slice(s, i + term.length + 48).replace(/\s+/g, ' ') + '…';
}

export function Library() {
  const list = useDocs();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('scanlio.view') as 'grid' | 'list') || 'grid');
  const [openId, setOpenId] = useState<string | null>(null);

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const allTags = useMemo(() => [...new Set((list ?? []).flatMap((d) => d.tags))].sort(), [list]);
  const shown = (list ?? []).filter((d) => (!tag || d.tags.includes(tag)) && matches(d, terms));
  const open = list?.find((d) => d.id === openId) ?? null;

  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 pb-32">
      <header className="pt-safe sticky top-0 z-10 -mx-4 bg-base/70 px-4 pb-2 backdrop-blur-glass">
        <div className="flex items-center justify-between pb-2 pt-1">
          <h1 className="text-[34px] font-bold tracking-tight">Library</h1>
          <div className="glass flex rounded-full p-1">
            {(['grid', 'list'] as const).map((v) => (
              <button key={v} aria-label={`${v} view`} aria-pressed={view === v} onClick={() => { setView(v); localStorage.setItem('scanlio.view', v); }}
                className={`grid min-h-tap min-w-tap place-items-center rounded-full transition-all duration-500 ease-hig ${view === v ? 'bg-accent text-white' : 'text-secondary'}`}>
                {v === 'grid' ? <GridIcon width={20} height={20} /> : <ListIcon width={20} height={20} />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-tap items-center gap-2 rounded-btn bg-label/[.08] px-3">
          <SearchIcon width={18} height={18} className="text-tertiary" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents or OCR text…" aria-label="Search documents or OCR text"
            className="min-h-tap flex-1 bg-transparent text-[17px] outline-none placeholder:text-tertiary" />
        </div>
        {allTags.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <button className="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
            {allTags.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}
          </div>
        )}
      </header>

      {list && shown.length === 0 && (
        <div className="grid place-items-center gap-2 py-24 text-center text-secondary">
          <p className="text-[17px] font-semibold text-label">{list.length ? 'No matches' : 'No documents yet'}</p>
          <p className="max-w-xs text-[14px]">{list.length ? 'Try a different word or tag.' : 'Scan your first page and it will appear here — searchable by its text.'}</p>
        </div>
      )}

      <div className={view === 'grid' ? 'mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3' : 'mt-3 flex flex-col gap-2'}>
        {shown.map((d) => <DocCard key={d.id} d={d} view={view} term={terms[0]} onOpen={() => setOpenId(d.id)} />)}
      </div>

      <DocViewer doc={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function SyncBadges({ d }: { d: DocRecord }) {
  const entries = Object.entries(d.sync) as [ProviderId, NonNullable<DocRecord['sync'][ProviderId]>][];
  if (!entries.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([p, s]) => (
        <span key={p} className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s === 'done' ? 'bg-success/15 text-success' : s === 'error' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'}`}>
          {s === 'queued' ? <WifiOffIcon width={10} height={10} /> : <CloudIcon width={10} height={10} />}
          {PROVIDER_SHORT[p]}{s === 'uploading' ? '…' : s === 'queued' ? ' · queued' : ''}
        </span>
      ))}
    </span>
  );
}

function DocCard({ d, view, term, onOpen }: { d: DocRecord; view: 'grid' | 'list'; term?: string; onOpen: () => void }) {
  const thumb = useObjectUrl(d.thumb);
  const date = new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const hit = term ? snippet(d, term) : null;
  const meta = (
    <>
      <p className="line-clamp-1 text-[15px] font-semibold">{d.name}</p>
      <p className="text-[12px] text-secondary">{date} · {d.pages.length} page{d.pages.length === 1 ? '' : 's'}{d.ocrStatus !== 'done' && ` · OCR ${d.ocrStatus === 'running' ? 'in progress' : d.ocrStatus === 'failed' ? 'waiting' : 'pending'}`}</p>
      {hit && <p className="mt-1 line-clamp-2 text-[12px] text-accent">{hit}</p>}
      {d.tags.length > 0 && <p className="mt-1 line-clamp-1 text-[12px] text-tertiary">{d.tags.map((t) => `#${t}`).join(' ')}</p>}
      <div className="mt-1.5"><SyncBadges d={d} /></div>
    </>
  );
  return view === 'grid' ? (
    <button onClick={onOpen} className="card overflow-hidden text-left transition-transform duration-500 ease-hig active:scale-[.97]">
      <div className="aspect-[3/4] bg-label/5">{thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}</div>
      <div className="p-3">{meta}</div>
    </button>
  ) : (
    <button onClick={onOpen} className="card flex items-center gap-3 p-3 text-left transition-transform duration-500 ease-hig active:scale-[.98]">
      <div className="h-[76px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-label/5">{thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}</div>
      <div className="min-w-0 flex-1">{meta}</div>
    </button>
  );
}
