import { useEffect, useState } from 'react';
import { cloud } from '../cloud/CloudStorageManager';
import { docs } from '../lib/db';
import { downloadBlob } from '../lib/image';
import { enqueueOcr } from '../lib/ocr';
import { buildPdf } from '../lib/pdf';
import { useObjectUrls } from '../lib/useObjectUrl';
import type { DocRecord, ProviderId } from '../types';
import { BottomSheet } from './BottomSheet';
import { CloseIcon, CloudUpIcon, DownloadIcon, ShareIcon, TagIcon, TextIcon, TrashIcon } from './Icons';
import { useToast } from './Toast';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'google', label: 'Google Drive' }, { id: 'onedrive', label: 'OneDrive' }, { id: 'icloud', label: 'iCloud Drive' },
];

/** Full-screen reader: pages rendered from the stored scans; PDF is generated with pdf-lib on demand. */
export function DocViewer({ doc, onClose }: { doc: DocRecord | null; onClose: () => void }) {
  const toast = useToast();
  const urls = useObjectUrls(doc?.pages ?? []);
  const [sheet, setSheet] = useState<null | 'upload' | 'text' | 'tags'>(null);
  const [name, setName] = useState('');
  const [tagText, setTagText] = useState('');
  const [current, setCurrent] = useState(0);

  useEffect(() => { if (doc) { setName(doc.name); setTagText(doc.tags.join(', ')); setCurrent(0); } else setSheet(null); }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;

  const getPdf = async () => {
    if (doc.pdf) return doc.pdf;
    const pdf = await buildPdf(doc.pages, doc.name);
    await docs.update(doc.id, (d) => { d.pdf = pdf; });
    return pdf;
  };
  const fileName = `${doc.name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;

  const share = async () => {
    const pdf = await getPdf();
    const file = new File([pdf], fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: doc.name });
        // Sharing to "Save to Files → iCloud Drive" is how iOS delivers iCloud uploads.
        if (doc.sync.icloud === 'queued') await docs.update(doc.id, (d) => { d.sync.icloud = 'done'; });
      } catch { /* cancelled */ }
    } else downloadBlob(pdf, fileName);
  };

  const rename = async () => { if (name.trim() && name !== doc.name) await docs.update(doc.id, (d) => { d.name = name.trim(); d.pdf = undefined; }); };

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in flex-col bg-base">
      <header className="pt-safe glass flex items-center gap-2 border-x-0 border-t-0 px-3 pb-2">
        <button className="btn-glass !px-3" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void rename()} aria-label="Document name"
          className="min-h-tap min-w-0 flex-1 bg-transparent text-center text-[17px] font-semibold outline-none" />
        <span className="w-[56px] text-right text-[13px] tabular-nums text-secondary">{current + 1}/{doc.pages.length}</span>
      </header>

      <div className="flex-1 snap-y space-y-4 overflow-y-auto px-4 py-4"
        onScroll={(e) => { const el = e.currentTarget; setCurrent(Math.min(doc.pages.length - 1, Math.round((el.scrollTop / el.scrollHeight) * doc.pages.length))); }}>
        {urls.map((u, i) => (
          <img key={u} src={u} alt={`Page ${i + 1}`} className="mx-auto w-full max-w-2xl snap-start rounded-lg bg-white shadow-glass" style={{ touchAction: 'pan-y pinch-zoom' }} />
        ))}
      </div>

      <nav className="glass pb-safe flex justify-around rounded-t-card px-2 pt-2">
        <Action icon={<ShareIcon />} label="Share" onClick={() => void share()} />
        <Action icon={<DownloadIcon />} label="PDF" onClick={async () => downloadBlob(await getPdf(), fileName)} />
        <Action icon={<CloudUpIcon />} label="Upload" onClick={() => setSheet('upload')} />
        <Action icon={<TextIcon />} label="Text" onClick={() => setSheet('text')} />
        <Action icon={<TagIcon />} label="Tags" onClick={() => setSheet('tags')} />
        <Action icon={<TrashIcon />} label="Delete" danger onClick={async () => { if (confirm(`Delete “${doc.name}”?`)) { await docs.remove(doc.id); onClose(); toast('Deleted', 'info'); } }} />
      </nav>

      <BottomSheet open={sheet === 'upload'} onClose={() => setSheet(null)} title="Upload to">
        <div className="space-y-2 pb-4">
          {PROVIDERS.map((p) => (
            <button key={p.id} className="btn-glass w-full justify-between" onClick={async () => { setSheet(null); await cloud.enqueue(doc.id, [p.id]); toast(navigator.onLine ? `Uploading to ${p.label}…` : `Queued for ${p.label} — will sync when online`, 'info'); }}>
              <span>{p.label}</span><span className="text-[12px] font-normal text-secondary">{doc.sync[p.id] === 'done' ? 'Uploaded ✓' : cloud.providers[p.id].isConnected() ? '' : 'Not connected'}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'text'} onClose={() => setSheet(null)} title="Recognized text">
        <div className="space-y-3 pb-4">
          {doc.ocrStatus === 'done' ? (
            <>
              <p className="select-text whitespace-pre-wrap text-[15px] leading-relaxed">{doc.ocrText || 'No text found.'}</p>
              <button className="btn-tinted w-full" onClick={() => { void navigator.clipboard.writeText(doc.ocrText); toast('Copied', 'success'); }}>Copy text</button>
            </>
          ) : (
            <>
              <p className="text-[15px] text-secondary">{doc.ocrStatus === 'running' ? 'Recognizing text…' : 'Text recognition is waiting (it needs a connection the first time).'}</p>
              <button className="btn-tinted w-full" onClick={() => { enqueueOcr(doc.id); toast('Recognizing in background', 'info'); }}>Run OCR now</button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'tags'} onClose={() => setSheet(null)} title="Tags">
        <div className="space-y-3 pb-4">
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="comma, separated, tags"
            className="min-h-tap w-full rounded-btn bg-label/[.07] px-4 text-[17px] outline-none focus:ring-2 focus:ring-accent" />
          <button className="btn-primary w-full" onClick={async () => {
            const tags = [...new Set(tagText.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))];
            await docs.update(doc.id, (d) => { d.tags = tags; });
            setSheet(null);
          }}>Done</button>
        </div>
      </BottomSheet>
    </div>
  );
}

function Action({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex min-h-tap min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition-transform duration-300 ease-hig active:scale-90 ${danger ? 'text-danger' : 'text-accent'}`}>
      {icon}{label}
    </button>
  );
}
