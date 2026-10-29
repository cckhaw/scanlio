import { useEffect, useState } from 'react';
import { cloud } from './cloud/CloudStorageManager';
import { CameraScanner } from './components/CameraScanner';
import { Editor } from './components/Editor';
import { WifiOffIcon } from './components/Icons';
import { Library, PROVIDER_SHORT } from './components/Library';
import { SaveSheet } from './components/SaveSheet';
import { Settings, useCloudState } from './components/Settings';
import { TabBar, type Tab } from './components/TabBar';
import { useToast } from './components/Toast';
import { docs, queue, uid } from './lib/db';
import { thumbnail } from './lib/image';
import { enqueueOcr, retryPendingOcr } from './lib/ocr';
import { buildPdf } from './lib/pdf';
import { useScan } from './state/ScanSession';
import type { DocRecord, ProviderId } from './types';

const initialTab = (): Tab => {
  const t = new URLSearchParams(location.search).get('tab');
  return t === 'library' || t === 'settings' ? t : 'scan';
};

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [step, setStep] = useState<'camera' | 'edit'>('camera');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const { pages, renderFinal, clear } = useScan();
  const toast = useToast();
  const cs = useCloudState();

  /* background services */
  useEffect(() => {
    cloud.start();
    const off = cloud.onEvent((e) =>
      e.kind === 'uploaded' ? toast(`“${e.docName}” uploaded to ${PROVIDER_SHORT[e.provider]}`, 'success')
        : toast(`Upload to ${PROVIDER_SHORT[e.provider]} failed: ${e.message}`, 'error'));
    const onOnline = () => retryPendingOcr();
    window.addEventListener('online', onOnline);
    retryPendingOcr();
    return () => { off(); window.removeEventListener('online', onOnline); };
  }, [toast]);

  useEffect(() => { void queue.all().then((q) => setPending(q.length)); }, [cs.flushing, cs.progress]);

  const save = async (v: { name: string; tags: string[]; destinations: ProviderId[] }) => {
    setSaving(true);
    try {
      const blobs: Blob[] = [];
      for (const p of pages) blobs.push(await renderFinal(p));
      const doc: DocRecord = {
        id: uid(), name: v.name, createdAt: Date.now(), tags: v.tags, pages: blobs,
        thumb: await thumbnail(blobs[0]), pdf: await buildPdf(blobs, v.name),
        ocrText: '', ocrStatus: 'pending', sync: {},
      };
      await docs.put(doc);                       // offline-first: durable in IndexedDB before anything else
      enqueueOcr(doc.id);                        // searchable text, in the background
      if (v.destinations.length) await cloud.enqueue(doc.id, v.destinations);
      clear();
      setSaveOpen(false);
      setStep('camera');
      setTab('library');
      toast(v.destinations.length ? (navigator.onLine ? 'Saved — uploading…' : 'Saved — will upload when online') : 'Saved to Library', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally { setSaving(false); }
  };

  const editing = tab === 'scan' && step === 'edit' && pages.length > 0;

  return (
    <div className="h-full">
      {!cs.online && (
        <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center">
          <span className="glass mt-1 flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-secondary"><WifiOffIcon width={14} height={14} /> Offline — scans are saved locally</span>
        </div>
      )}

      {tab === 'scan' && (editing ? (
        <Editor onAddPage={() => setStep('camera')} onSave={() => setSaveOpen(true)} onDiscard={() => { clear(); setStep('camera'); }} />
      ) : (
        <CameraScanner onDone={() => pages.length && setStep('edit')} />
      ))}
      {tab === 'library' && <div className="h-full overflow-y-auto"><Library /></div>}
      {tab === 'settings' && <div className="h-full overflow-y-auto"><Settings /></div>}

      {!editing && <TabBar tab={tab} onChange={setTab} badge={pending || undefined} />}
      <SaveSheet open={saveOpen} pageCount={pages.length} saving={saving} onClose={() => !saving && setSaveOpen(false)} onSave={save} />
    </div>
  );
}
