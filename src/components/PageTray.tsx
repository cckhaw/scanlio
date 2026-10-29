import { useRef, useState } from 'react';
import { haptic } from '../lib/haptics';
import { useScan } from '../state/ScanSession';

const W = 64, GAP = 10, HOLD_MS = 320, DELETE_PX = 70;

/**
 * Horizontal page deck.
 *  - tap: select page
 *  - press-and-hold, then drag sideways: reorder
 *  - swipe a thumbnail upward: delete (rubber-bands and turns red past the threshold)
 */
export function PageTray() {
  const { pages, activeId, setActive, movePage, removePage } = useScan();
  const [drag, setDrag] = useState<{ id: string; mode: 'idle' | 'reorder' | 'delete'; dx: number; dy: number } | null>(null);
  const g = useRef<{ id: string; x: number; y: number; t: number; timer: number; mode: 'idle' | 'reorder' | 'delete'; index: number } | null>(null);

  const down = (e: React.PointerEvent, id: string, index: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const timer = window.setTimeout(() => {
      if (g.current && g.current.mode === 'idle') { g.current.mode = 'reorder'; haptic('medium'); setDrag((d) => d && { ...d, mode: 'reorder' }); }
    }, HOLD_MS);
    g.current = { id, x: e.clientX, y: e.clientY, t: Date.now(), timer, mode: 'idle', index };
    setDrag({ id, mode: 'idle', dx: 0, dy: 0 });
  };

  const moveEv = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (s.mode === 'idle' && Math.abs(dx) + Math.abs(dy) > 8) {
      if (dy < -10 && Math.abs(dy) > Math.abs(dx)) { s.mode = 'delete'; window.clearTimeout(s.timer); }
      else window.clearTimeout(s.timer);       // moved before the hold elapsed -> treat as scroll, not reorder
    }
    if (s.mode === 'reorder') {
      const target = Math.max(0, Math.min(pages.length - 1, s.index + Math.round(dx / (W + GAP))));
      if (target !== s.index) {
        movePage(s.index, target);
        s.x += (target - s.index) * (W + GAP);   // keep the thumbnail under the finger after the swap
        s.index = target;
        haptic('light');
      }
      setDrag({ id: s.id, mode: 'reorder', dx: e.clientX - s.x, dy: 0 });
    } else if (s.mode === 'delete') {
      setDrag({ id: s.id, mode: 'delete', dx: 0, dy: Math.min(0, dy) });
    }
  };

  const up = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    const dy = e.clientY - s.y;
    const moved = Math.hypot(e.clientX - s.x, dy);
    if (s.mode === 'delete' && dy < -DELETE_PX) { haptic('warning'); removePage(s.id); }
    else if (s.mode === 'idle' && moved < 8 && Date.now() - s.t < HOLD_MS) { setActive(s.id); haptic('light'); }
    g.current = null;
    setDrag(null);
  };

  return (
    <div className="no-scrollbar flex items-center overflow-x-auto px-4 py-3" style={{ gap: GAP, touchAction: drag?.mode === 'reorder' || drag?.mode === 'delete' ? 'none' : 'pan-x' }} role="list" aria-label="Pages">
      {pages.map((p, i) => {
        const d = drag?.id === p.id ? drag : null;
        const armed = d?.mode === 'delete' && d.dy < -DELETE_PX;
        return (
          <div key={p.id} role="listitem" aria-label={`Page ${i + 1}`}
            onPointerDown={(e) => down(e, p.id, i)} onPointerMove={moveEv} onPointerUp={up} onPointerCancel={up}
            className={`relative shrink-0 select-none rounded-xl ${activeId === p.id ? 'ring-2 ring-accent' : 'ring-1 ring-label/15'} ${d ? 'z-10 shadow-float' : 'transition-transform duration-300 ease-hig'}`}
            style={{
              width: W, height: 84,
              transform: d ? `translate(${d.dx}px, ${d.dy}px) scale(${d.mode === 'idle' ? 0.97 : 1.08})` : undefined,
              opacity: armed ? 0.55 : 1,
            }}>
            <img src={p.resultUrl ?? p.sourceUrl} alt="" draggable={false} className="pointer-events-none h-full w-full rounded-xl object-cover" />
            <span className="absolute bottom-1 left-1 grid h-5 min-w-5 place-items-center rounded-full bg-black/60 px-1 text-[11px] font-semibold text-white">{i + 1}</span>
            {armed && <span className="absolute inset-0 grid place-items-center rounded-xl bg-danger/70 text-[11px] font-bold text-white">Release</span>}
          </div>
        );
      })}
    </div>
  );
}
