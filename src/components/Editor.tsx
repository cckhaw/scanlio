import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';
import { canvasToBlob } from '../lib/image';
import { renderPageCanvas, useScan } from '../state/ScanSession';
import { CloseIcon, CropIcon, PlusIcon, RotateIcon, SlidersIcon, TrashIcon, WandIcon } from './Icons';
import { CropEditor } from './CropEditor';
import { FilterCarousel } from './FilterCarousel';
import { PageTray } from './PageTray';

type Mode = 'crop' | 'enhance';

interface Props { onAddPage: () => void; onSave: () => void; onDiscard: () => void }

export function Editor({ onAddPage, onSave, onDiscard }: Props) {
  const { pages, activeId, patchPage, removePage, rotatePage, autoDetect } = useScan();
  const page = pages.find((p) => p.id === activeId) ?? pages[0];
  const [mode, setMode] = useState<Mode>('crop');
  const [preview, setPreview] = useState<string>();
  const [rendering, setRendering] = useState(false);
  const seq = useRef(0);

  // Live preview (and tray thumbnail) of the corrected + filtered page, debounced while the crop is being dragged.
  useEffect(() => {
    if (!page) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setRendering(true);
      const c = await renderPageCanvas(page, page.filter, mode === 'enhance' ? 1400 : 420);
      const blob = await canvasToBlob(c, 0.8);
      if (my !== seq.current) return;
      const url = URL.createObjectURL(blob);
      setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; });
      if (page.resultUrl) URL.revokeObjectURL(page.resultUrl);
      patchPage(page.id, { resultUrl: url });
      setRendering(false);
    }, mode === 'crop' ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.quad, page?.filter, page?.aspect, page?.source, mode]);

  if (!page) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-base">
      <header className="pt-safe flex items-center justify-between gap-2 px-3 pb-2">
        <button className="btn-glass !px-3" onClick={onDiscard} aria-label="Discard scan"><CloseIcon /></button>
        <div className="glass flex rounded-full p-1" role="tablist">
          {([['crop', 'Crop', <CropIcon key="c" width={18} height={18} />], ['enhance', 'Enhance', <SlidersIcon key="s" width={18} height={18} />]] as const).map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => { setMode(id); haptic('light'); }}
              className={`flex min-h-tap items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-all duration-500 ease-hig ${mode === id ? 'bg-accent text-white' : 'text-secondary'}`}>
              {icon}{label}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={onSave}>Save{pages.length > 1 ? ` (${pages.length})` : ''}</button>
      </header>

      <main className="relative min-h-0 flex-1">
        {mode === 'crop' ? (
          <CropEditor page={page} onChange={(quad) => patchPage(page.id, { quad })} />
        ) : (
          <div className="grid h-full place-items-center p-4">
            {preview && <img src={preview} alt="Enhanced page preview" className={`max-h-full max-w-full rounded-lg object-contain shadow-float transition-opacity duration-300 ${rendering ? 'opacity-60' : ''}`} />}
          </div>
        )}
      </main>

      <footer className="glass rounded-t-card pb-safe">
        {mode === 'crop' ? (
          <div className="flex items-center justify-center gap-2 px-3 py-3">
            <button className="btn-tinted" onClick={() => void autoDetect(page.id)}><WandIcon width={20} height={20} /> Auto</button>
            <button className="btn-tinted" onClick={() => patchPage(page.id, { quad: [{ x: 0, y: 0 }, { x: page.width, y: 0 }, { x: page.width, y: page.height }, { x: 0, y: page.height }] })}>Full</button>
            <button className="btn-tinted" aria-label="Rotate 90 degrees" onClick={() => void rotatePage(page.id)}><RotateIcon width={20} height={20} /></button>
            <button className="btn-danger" aria-label="Delete page" onClick={() => { removePage(page.id); if (pages.length === 1) onDiscard(); }}><TrashIcon width={20} height={20} /></button>
          </div>
        ) : (
          <FilterCarousel page={page} onPick={(filter) => patchPage(page.id, { filter })} />
        )}
        <div className="flex items-center">
          <div className="min-w-0 flex-1"><PageTray /></div>
          <button className="btn-glass mr-4 shrink-0 !px-3" aria-label="Scan another page" onClick={onAddPage}><PlusIcon /></button>
        </div>
      </footer>
    </div>
  );
}
