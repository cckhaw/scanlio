import { useRef, useState } from 'react';
import { cloud } from '../cloud/CloudStorageManager';
import { useObjectUrl } from '../lib/useObjectUrl';
import type { DocRecord } from '../types';
import { DocViewer } from './DocViewer';
import { CloudUpIcon, FileIcon, LibraryIcon, PhotoIcon, ScanIcon } from './Icons';
import { useCloudState } from './Settings';
import { useDocs } from './Library';

interface Props { onScan: () => void; onImport: (files: FileList) => void; onLibrary: () => void; onSettings: () => void }

const STEPS = [
  { icon: <ScanIcon width={22} height={22} />, title: 'Capture', text: 'Point your camera at a page, or import photos you already have.' },
  { icon: <FileIcon width={22} height={22} />, title: 'Refine', text: 'Edges are found automatically. Adjust the corners, pick a filter.' },
  { icon: <CloudUpIcon width={22} height={22} />, title: 'Save & share', text: 'Export as PDF, PNG or JPG and send it to the cloud folder you choose.' },
];

/** App home: explains what Scanlio does and offers clear next actions — the camera only opens on request. */
export function Home({ onScan, onImport, onLibrary, onSettings }: Props) {
  const list = useDocs();
  const cs = useCloudState();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<DocRecord | null>(null);
  const connected = cloud.connectedProviders().length;
  const recent = (list ?? []).slice(0, 3);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32">
      <header className="pt-safe pb-6 pt-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">Scanlio</p>
        <h1 className="mt-1 text-[34px] font-bold leading-tight tracking-tight">Turn paper into searchable PDFs.</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-secondary">
          Scan receipts, contracts and book pages with your camera. Scanlio straightens and cleans them up, reads the text so you can search later,
          and saves to Google Drive, OneDrive or iCloud Drive — your scans stay on this device until you choose to upload.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-primary !min-h-[64px] justify-start gap-3 !px-5 text-[17px]" onClick={onScan}>
          <ScanIcon width={26} height={26} /> Scan with camera
        </button>
        <button className="btn-glass !min-h-[64px] justify-start gap-3 !px-5 text-[17px]" onClick={() => input.current?.click()}>
          <PhotoIcon width={26} height={26} /> Import photos
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) onImport(e.target.files); e.target.value = ''; }} />
      </div>

      <section className="mt-8" aria-label="How it works">
        <h2 className="mb-2 px-1 text-[13px] font-medium uppercase tracking-wide text-secondary">How it works</h2>
        <ol className="card divide-y divide-[color:var(--glass-border)] overflow-hidden">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">{s.icon}</span>
              <div><p className="font-semibold">{i + 1}. {s.title}</p><p className="text-[14px] text-secondary">{s.text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-label="Recent documents">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-secondary">Recent</h2>
          {recent.length > 0 && <button className="text-[14px] font-medium text-accent" onClick={onLibrary}>See all</button>}
        </div>
        {recent.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 text-[14px] text-secondary"><LibraryIcon /> Your scans will appear here.</div>
        ) : (
          <div className="flex flex-col gap-2">{recent.map((d) => <RecentRow key={d.id} d={d} onOpen={() => setOpen(d)} />)}</div>
        )}
      </section>

      <button onClick={onSettings} className="card mt-8 flex w-full items-center gap-3 p-4 text-left active:scale-[.98] transition-transform duration-500 ease-hig">
        <CloudUpIcon className="text-accent" />
        <span className="flex-1">
          <span className="block font-semibold">{connected ? `${connected} cloud account${connected === 1 ? '' : 's'} connected` : 'Connect cloud storage'}</span>
          <span className="block text-[13px] text-secondary">{cs.online ? 'Choose where scans are uploaded and in which format.' : 'Offline — uploads will resume automatically.'}</span>
        </span>
      </button>

      <p className="mt-8 text-center text-[12px] text-tertiary"><a href="/" className="underline">About</a> · <a href="/privacy" className="underline">Privacy</a> · <a href="/terms" className="underline">Terms</a></p>
      <DocViewer doc={open ? (list?.find((d) => d.id === open.id) ?? null) : null} onClose={() => setOpen(null)} />
    </div>
  );
}

function RecentRow({ d, onOpen }: { d: DocRecord; onOpen: () => void }) {
  const thumb = useObjectUrl(d.thumb);
  return (
    <button onClick={onOpen} className="card flex items-center gap-3 p-3 text-left transition-transform duration-500 ease-hig active:scale-[.98]">
      <div className="h-[56px] w-[44px] shrink-0 overflow-hidden rounded-lg bg-label/5">{thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}</div>
      <div className="min-w-0 flex-1"><p className="line-clamp-1 font-semibold">{d.name}</p><p className="text-[12px] text-secondary">{new Date(d.createdAt).toLocaleDateString()} · {d.pages.length} page{d.pages.length === 1 ? '' : 's'}</p></div>
    </button>
  );
}

