import { useEffect, useState } from 'react';
import { FILTERS } from '../cv/filters';
import { haptic } from '../lib/haptics';
import { renderPageCanvas } from '../state/ScanSession';
import type { DraftPage, FilterId } from '../types';

/** Apple-Photos-style horizontal strip; each tile is a live thumbnail of the current page with that filter. */
export function FilterCarousel({ page, onPick }: { page: DraftPage; onPick: (f: FilterId) => void }) {
  const [thumbs, setThumbs] = useState<Partial<Record<FilterId, string>>>({});

  useEffect(() => {
    let dead = false;
    const urls: string[] = [];
    setThumbs({});
    (async () => {
      for (const f of FILTERS) {
        const c = await renderPageCanvas(page, f.id, 360);
        if (dead) return;
        const url = c.toDataURL('image/jpeg', 0.7);
        urls.push(url);
        setThumbs((t) => ({ ...t, [f.id]: url }));
        await new Promise((r) => setTimeout(r, 0));   // yield so taps stay responsive
      }
    })();
    return () => { dead = true; };
    // regenerate when crop/rotation/aspect changes, not when only the chosen filter changes
  }, [page.id, page.quad, page.aspect, page.source]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 py-2" role="radiogroup" aria-label="Filters">
      {FILTERS.map((f) => {
        const active = page.filter === f.id;
        return (
          <button key={f.id} role="radio" aria-checked={active} onClick={() => { haptic('light'); onPick(f.id); }}
            className="flex w-[76px] shrink-0 snap-start flex-col items-center gap-1.5 transition-transform duration-300 ease-hig active:scale-95">
            <span className={`block h-[96px] w-[76px] overflow-hidden rounded-xl bg-label/10 ring-2 transition-all duration-300 ease-hig ${active ? 'scale-105 ring-accent' : 'ring-transparent'}`}>
              {thumbs[f.id] && <img src={thumbs[f.id]} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className={`text-center text-[11px] font-semibold leading-tight ${active ? 'text-accent' : 'text-secondary'}`}>{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}
