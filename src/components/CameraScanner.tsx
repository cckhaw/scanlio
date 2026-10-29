import { useCallback, useEffect, useRef, useState } from 'react';
import { detectDocument } from '../cv/detect';
import { quadMotion } from '../cv/geometry';
import { loadOpenCv } from '../cv/opencv';
import { haptic } from '../lib/haptics';
import { canvasToBlob } from '../lib/image';
import { useScan } from '../state/ScanSession';
import type { AspectLock, Quad } from '../types';
import { BoltIcon, GridIcon, PhotoIcon } from './Icons';

const STABLE_MS = 1500;        // corners must stay put this long before auto-capture
const STABLE_TOL = 0.018;      // max corner drift (fraction of frame diagonal) still counted as "motionless"
const DETECT_W = 360;          // analysis width; detection cost stays flat regardless of camera resolution
const DETECT_EVERY_MS = 110;
const RING = 2 * Math.PI * 34;

const ASPECTS: { id: AspectLock; label: string; ratio?: number }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'a4', label: 'A4', ratio: 210 / 297 }, { id: 'letter', label: 'Letter', ratio: 8.5 / 11 }, { id: 'square', label: '1:1', ratio: 1 },
];

interface Props { onDone: () => void }

export function CameraScanner({ onDone }: Props) {
  const { pages, addPage, aspect, setAspect } = useScan();
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [grid, setGrid] = useState(true);
  const [auto, setAuto] = useState(true);
  const [progress, setProgress] = useState(0);        // 0..1 stable-corner countdown
  const [found, setFound] = useState(false);
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cvReady, setCvReady] = useState(false);

  // Mutable loop state (refs avoid re-rendering at detection rate)
  const live = useRef<{ quad: Quad | null; shown: Quad | null; anchor: Quad | null; since: number; armed: boolean; lost: number }>(
    { quad: null, shown: null, anchor: null, since: 0, armed: true, lost: 0 });
  const opts = useRef({ auto, grid, aspect, busy });
  opts.current = { auto, grid, aspect, busy };

  useEffect(() => { void loadOpenCv().then((cv) => setCvReady(!!cv)); }, []);

  /* ---------- camera lifecycle ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        const caps = (s.getVideoTracks()[0].getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchOk(!!caps.torch);
      } catch (e) {
        setError(e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera access is off. Enable it in your browser settings, or import a photo instead.'
          : 'No camera available. You can import photos instead.');
      }
    })();
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
      haptic('light');
    } catch { setTorchOk(false); }
  };

  /* ---------- capture ---------- */
  const capture = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth || opts.current.busy) return;
    setBusy(true);
    haptic('medium');
    setFlash((n) => n + 1);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const hint = live.current.quad;   // already-stable detection, in analysis-frame fractions
    try {
      const blob = await canvasToBlob(c, 0.92);
      await addPage(blob, hint ? (hint.map((p) => ({ x: p.x * c.width, y: p.y * c.height })) as Quad) : null);
      haptic('success');
    } finally {
      live.current = { ...live.current, anchor: null, since: 0, armed: false, lost: 0 };
      setProgress(0);
      setBusy(false);
    }
  }, [addPage]);

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const f of Array.from(files)) await addPage(f);
    setBusy(false);
    haptic('success');
  };

  /* ---------- detection + HUD loop ---------- */
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const v = video.current, o = overlay.current;
      if (!v || !o || !v.videoWidth) return;
      const L = live.current;

      if (t - last >= DETECT_EVERY_MS) {
        last = t;
        const w = DETECT_W, h = Math.round((w * v.videoHeight) / v.videoWidth);
        const wc = work.current;
        if (wc.width !== w) { wc.width = w; wc.height = h; }
        const ctx = wc.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const q = detectDocument(ctx.getImageData(0, 0, w, h));
        const norm = q ? (q.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad) : null;
        L.quad = norm;
        setFound(!!norm);

        const diag = Math.hypot(1, h / w);
        if (norm) {
          L.lost = 0;
          if (!L.armed && L.anchor && quadMotion(norm, L.anchor, diag) > 0.08) L.armed = true;
          if (!L.anchor || quadMotion(norm, L.anchor, diag) > STABLE_TOL) { L.anchor = norm; L.since = t; }
        } else if (++L.lost > 3) {
          L.anchor = null; L.since = 0; L.armed = true;
        }
        const p = L.anchor && L.armed && opts.current.auto ? Math.min(1, (t - L.since) / STABLE_MS) : 0;
        setProgress((prev) => (Math.abs(prev - p) > 0.02 || p === 0 ? p : prev));
        if (p >= 1 && !opts.current.busy) void capture();
      }

      // Smoothly ease the displayed quad toward the latest detection, then draw the HUD.
      const dpr = window.devicePixelRatio || 1;
      const cw = o.clientWidth, ch = o.clientHeight;
      if (o.width !== cw * dpr) { o.width = cw * dpr; o.height = ch * dpr; }
      const ctx = o.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      // object-cover mapping from video space to the viewport
      const s = Math.max(cw / v.videoWidth, ch / v.videoHeight);
      const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
      const map = (p: { x: number; y: number }) => ({ x: ox + p.x * v.videoWidth * s, y: oy + p.y * v.videoHeight * s });

      if (L.quad) {
        L.shown = L.shown ? (L.shown.map((p, i) => ({ x: p.x + (L.quad![i].x - p.x) * 0.35, y: p.y + (L.quad![i].y - p.y) * 0.35 })) as Quad) : L.quad;
      } else if (L.shown) {
        L.shown = null;
      }
      const stable = (L.anchor && L.armed && opts.current.auto ? Math.min(1, (t - L.since) / STABLE_MS) : 0) > 0.15;
      if (opts.current.grid) drawGuide(ctx, cw, ch, opts.current.aspect);
      if (L.shown) drawQuad(ctx, L.shown.map(map), stable);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [capture]);

  const last = pages[pages.length - 1];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
      {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 animate-flash bg-white" />}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-8 text-center">
          <div className="card max-w-xs space-y-4 p-6 text-label">
            <p className="text-[15px]">{error}</p>
            <button className="btn-primary w-full" onClick={() => fileInput.current?.click()}><PhotoIcon /> Import photos</button>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="pt-safe absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4">
        <div className="flex gap-2">
          <HudButton label={torchOn ? 'Flash on' : 'Flash off'} active={torchOn} disabled={!torchOk} onClick={toggleTorch}><BoltIcon off={!torchOn} /></HudButton>
          <HudButton label="Grid guide" active={grid} onClick={() => { setGrid(!grid); haptic('light'); }}><GridIcon /></HudButton>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => { setAuto(!auto); haptic('light'); }}
            aria-pressed={auto}
            className={`min-h-tap rounded-full px-4 text-[13px] font-semibold backdrop-blur-glass transition-colors duration-300 ${auto ? 'bg-warning/90 text-black' : 'bg-black/40 text-white'}`}
          >
            Auto {auto ? 'On' : 'Off'}
          </button>
          {!cvReady && <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] backdrop-blur-glass">Loading edge detector…</span>}
        </div>
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center">
        <span className={`rounded-full bg-black/45 px-4 py-1.5 text-[13px] font-medium backdrop-blur-glass transition-opacity duration-500 ${busy ? 'opacity-0' : 'opacity-100'}`}>
          {found ? (progress > 0.15 ? 'Hold still…' : 'Document found') : 'Align the page inside the frame'}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-[92px] flex flex-col items-center gap-4 pb-[env(safe-area-inset-bottom)]">
        <div className="flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur-glass" role="radiogroup" aria-label="Aspect ratio lock">
          {ASPECTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={aspect === a.id} onClick={() => { setAspect(a.id); haptic('light'); }}
              className={`min-h-[34px] min-w-[52px] rounded-full px-3 text-[12px] font-semibold transition-all duration-300 ease-hig ${aspect === a.id ? 'bg-white text-black' : 'text-white/80'}`}>
              {a.label}
            </button>
          ))}
        </div>

        <div className="grid w-full max-w-md grid-cols-3 items-center px-8">
          <button aria-label="Import photos" className="grid h-12 w-12 place-items-center justify-self-start rounded-full bg-black/40 backdrop-blur-glass active:scale-90 transition-transform duration-300 ease-hig" onClick={() => fileInput.current?.click()}>
            <PhotoIcon />
          </button>

          <button aria-label="Capture" onClick={() => void capture()} disabled={!!error} className="relative grid h-[84px] w-[84px] place-items-center justify-self-center active:scale-90 transition-transform duration-300 ease-hig disabled:opacity-40">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 84 84" aria-hidden>
              <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="4" />
              <circle cx="42" cy="42" r="34" fill="none" stroke="#30D158" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} style={{ transition: 'stroke-dashoffset .12s linear' }} />
            </svg>
            <span className={`h-[62px] w-[62px] rounded-full bg-white shadow-float transition-transform duration-300 ease-hig ${busy ? 'scale-75' : ''}`} />
          </button>

          <button
            onClick={onDone}
            disabled={!pages.length}
            aria-label={`Review ${pages.length} page${pages.length === 1 ? '' : 's'}`}
            className="relative h-14 w-14 justify-self-end overflow-hidden rounded-xl border-2 border-white/80 bg-black/40 transition-transform duration-300 ease-hig active:scale-90 disabled:opacity-30"
          >
            {last && <img src={last.sourceUrl} alt="" className="h-full w-full object-cover" />}
            {pages.length > 0 && <span key={pages.length} className="absolute -right-0 -top-0 grid h-6 min-w-6 animate-pop place-items-center rounded-bl-xl bg-accent px-1 text-[12px] font-bold">{pages.length}</span>}
          </button>
        </div>
      </div>

      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function HudButton({ children, label, active, disabled, onClick }: { children: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur-glass transition-all duration-300 ease-hig active:scale-90 disabled:opacity-30 ${active ? 'bg-warning/90 text-black' : 'bg-black/40 text-white'}`}>
      {children}
    </button>
  );
}

function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number, aspect: AspectLock) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) { ctx.moveTo((w * i) / 3, 0); ctx.lineTo((w * i) / 3, h); ctx.moveTo(0, (h * i) / 3); ctx.lineTo(w, (h * i) / 3); }
  ctx.stroke();
  const r = ASPECTS.find((a) => a.id === aspect)?.ratio;
  if (r) {   // framing box for the locked ratio
    let bw = w * 0.84, bh = bw / r;
    if (bh > h * 0.62) { bh = h * 0.62; bw = bh * r; }
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect((w - bw) / 2, (h - bh) / 2 - 20, bw, bh, 14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawQuad(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], stable: boolean) {
  const color = stable ? '#30D158' : '#0A84FF';
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = stable ? 'rgba(48,209,88,.22)' : 'rgba(10,132,255,.18)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}
