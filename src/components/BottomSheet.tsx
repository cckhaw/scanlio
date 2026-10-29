import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props { open: boolean; onClose: () => void; title?: string; children: ReactNode; full?: boolean }

/** Thumb-first modal sheet: drag the grabber (or tap the scrim / press Esc) to dismiss. */
export function BottomSheet({ open, onClose, title, children, full }: Props) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!open) return null;
  // Portaled to <body>: backdrop-filter on a parent sheet would otherwise trap nested `fixed` sheets.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <div
        className={`card relative w-full max-w-xl animate-sheet-up rounded-b-none ${full ? 'h-[94dvh]' : 'max-h-[88dvh]'} flex flex-col`}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: start.current == null ? 'transform .4s cubic-bezier(0.16,1,0.3,1)' : 'none' }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5"
          onPointerDown={(e) => { start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => start.current != null && setDy(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => { if (dy > 110) onClose(); start.current = null; setDy(0); }}
        >
          <div className="h-1.5 w-10 rounded-full bg-label/25" />
        </div>
        {title && <h2 className="px-5 pb-2 pt-1 text-center text-[17px] font-semibold">{title}</h2>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe">{children}</div>
      </div>
    </div>,
    document.body
  );
}
