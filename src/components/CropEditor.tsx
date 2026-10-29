import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';
import type { DraftPage, Point, Quad } from '../types';

const LOUPE = 128;       // loupe diameter (px)
const ZOOM = 3;          // magnification inside the loupe
const HANDLE = 44;       // minimum touch target

interface Props { page: DraftPage; onChange: (q: Quad) => void }

/**
 * 4-point quad editor. The image is letterboxed ("contain") into the stage; handles live in
 * display space and are converted to source pixels on every move. While a handle is held a
 * magnifier loupe floats above the finger so the exact page corner can be placed.
 */
export function CropEditor({ page, onChange }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ i: number; at: Point } | null>(null);

  useLayoutEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // image rect inside the stage (object-contain)
  const k = Math.min(box.w / page.width, box.h / page.height) || 1;
  const iw = page.width * k, ih = page.height * k;
  const ox = (box.w - iw) / 2, oy = (box.h - ih) / 2;
  const toDisp = useCallback((p: Point): Point => ({ x: ox + p.x * k, y: oy + p.y * k }), [ox, oy, k]);
  const pts = page.quad.map(toDisp);

  const drawLoupe = useCallback((src: Point) => {
    const c = loupe.current, im = img.current;
    if (!c || !im || !im.complete) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== LOUPE * dpr) { c.width = c.height = LOUPE * dpr; }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    ctx.save();
    ctx.beginPath(); ctx.arc(LOUPE / 2, LOUPE / 2, LOUPE / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, LOUPE, LOUPE);
    // source window: LOUPE/(k*ZOOM) source px wide, centred on the corner
    const sw = LOUPE / (k * ZOOM);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, src.x - sw / 2, src.y - sw / 2, sw, sw, 0, 0, LOUPE, LOUPE);
    // crosshair
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(LOUPE / 2, 10); ctx.lineTo(LOUPE / 2, LOUPE - 10); ctx.moveTo(10, LOUPE / 2); ctx.lineTo(LOUPE - 10, LOUPE / 2); ctx.stroke();
    ctx.strokeStyle = '#0A84FF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(LOUPE / 2, LOUPE / 2, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }, [k]);

  useEffect(() => { if (drag) drawLoupe(page.quad[drag.i]); }, [drag, page.quad, drawLoupe]);

  const move = (i: number, e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const sx = Math.min(page.width, Math.max(0, (dx - ox) / k));
    const sy = Math.min(page.height, Math.max(0, (dy - oy) / k));
    const next = page.quad.map((p, j) => (j === i ? { x: sx, y: sy } : p)) as Quad;
    onChange(next);
    setDrag({ i, at: { x: dx, y: dy } });
  };

  const dragPos = drag ? toDisp(page.quad[drag.i]) : null;
  // keep the loupe on-screen: above the finger by default, below if too close to the top
  const loupeStyle = dragPos && {
    left: Math.min(Math.max(dragPos.x - LOUPE / 2, 4), box.w - LOUPE - 4),
    top: dragPos.y - LOUPE - 52 < 0 ? dragPos.y + 52 : dragPos.y - LOUPE - 52,
  };

  const mask = `M0 0H${box.w}V${box.h}H0Z M${pts.map((p) => `${p.x} ${p.y}`).join(' L')}Z`;

  return (
    <div ref={stage} className="relative h-full w-full touch-none select-none overflow-hidden">
      <img ref={img} src={page.sourceUrl} alt="Captured page" draggable={false}
        className="pointer-events-none absolute" style={{ left: ox, top: oy, width: iw, height: ih }} />
      <svg className="pointer-events-none absolute inset-0" width={box.w} height={box.h}>
        <path d={mask} fill="rgba(0,0,0,.55)" fillRule="evenodd" />
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>

      {pts.map((p, i) => (
        <button
          key={i}
          aria-label={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner'}
          className="absolute grid touch-none place-items-center"
          style={{ left: p.x - HANDLE / 2, top: p.y - HANDLE / 2, width: HANDLE, height: HANDLE }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); haptic('light'); move(i, e); }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && move(i, e)}
          onPointerUp={() => { setDrag(null); haptic('light'); }}
          onPointerCancel={() => setDrag(null)}
        >
          <span className={`h-[22px] w-[22px] rounded-full border-[3px] border-white bg-accent/80 shadow-float transition-transform duration-300 ease-hig ${drag?.i === i ? 'scale-125' : ''}`} />
        </button>
      ))}

      {drag && (
        <canvas ref={loupe} width={LOUPE} height={LOUPE} style={{ ...loupeStyle, width: LOUPE, height: LOUPE }}
          className="pointer-events-none absolute animate-fade-in rounded-full border-[3px] border-white shadow-float" />
      )}
    </div>
  );
}
