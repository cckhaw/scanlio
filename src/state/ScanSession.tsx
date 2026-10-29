import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { detectDocument } from '../cv/detect';
import { applyFilter } from '../cv/filters';
import { insetQuad, scaleQuad } from '../cv/geometry';
import { warpDocument } from '../cv/warp';
import { uid } from '../lib/db';
import { canvasToBlob, dims, loadImage, toCanvas } from '../lib/image';
import type { AspectLock, DraftPage, FilterId, Quad } from '../types';

interface Session {
  pages: DraftPage[];
  activeId: string | null;
  aspect: AspectLock;
  setAspect: (a: AspectLock) => void;
  setActive: (id: string) => void;
  addPage: (blob: Blob, hint?: Quad | null) => Promise<DraftPage>;
  patchPage: (id: string, patch: Partial<DraftPage>) => void;
  removePage: (id: string) => void;
  movePage: (from: number, to: number) => void;
  rotatePage: (id: string) => Promise<void>;
  autoDetect: (id: string) => Promise<void>;
  renderFinal: (page: DraftPage) => Promise<Blob>;
  clear: () => void;
}

const Ctx = createContext<Session | null>(null);
export const useScan = () => { const c = useContext(Ctx); if (!c) throw new Error('useScan outside ScanProvider'); return c; };

const bitmaps = new Map<string, ImageBitmap | HTMLImageElement>();
const getBitmap = async (p: DraftPage) => bitmaps.get(p.id) ?? (bitmaps.set(p.id, await loadImage(p.source)), bitmaps.get(p.id)!);

/** Warp + filter. `maxSource` downsizes the source first for fast previews. */
export async function renderPageCanvas(p: DraftPage, filter: FilterId = p.filter, maxSource = Infinity) {
  const bmp = await getBitmap(p);
  const k = Math.min(1, maxSource / Math.max(p.width, p.height));
  const src = k < 1 ? toCanvas(bmp, p.width, p.height, maxSource) : bmp;
  const q = k < 1 ? scaleQuad(p.quad, k) : p.quad;
  const warped = warpDocument(src as CanvasImageSource & { width: number; height: number }, q, p.aspect);
  return applyFilter(warped, filter);
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectLock>('auto');
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const detectFor = useCallback(async (blob: Blob) => {
    const img = await loadImage(blob);
    const { width, height } = dims(img);
    const small = toCanvas(img, width, height, 640);
    const data = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
    const q = detectDocument(data);
    return { width, height, quad: q ? scaleQuad(q, width / small.width, height / small.height) : null, img };
  }, []);

  const addPage = useCallback(async (blob: Blob, hint?: Quad | null) => {
    const { width, height, quad, img } = await detectFor(blob);
    const page: DraftPage = {
      id: uid(), source: blob, sourceUrl: URL.createObjectURL(blob), width, height,
      quad: hint ?? quad ?? insetQuad(width, height), filter: 'color', aspect: aspectRef.current,
    };
    bitmaps.set(page.id, img);
    setPages((l) => [...l, page]);
    setActiveId((a) => a ?? page.id);
    return page;
  }, [detectFor]);

  const patchPage = useCallback((id: string, patch: Partial<DraftPage>) => {
    setPages((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const free = (p: DraftPage) => {
    URL.revokeObjectURL(p.sourceUrl);
    if (p.resultUrl) URL.revokeObjectURL(p.resultUrl);
    bitmaps.delete(p.id);
  };

  const removePage = useCallback((id: string) => {
    setPages((l) => {
      const i = l.findIndex((p) => p.id === id);
      if (i < 0) return l;
      free(l[i]);
      const next = l.filter((p) => p.id !== id);
      setActiveId((a) => (a === id ? next[Math.min(i, next.length - 1)]?.id ?? null : a));
      return next;
    });
  }, []);

  const movePage = useCallback((from: number, to: number) => {
    setPages((l) => {
      if (from === to || to < 0 || to >= l.length) return l;
      const n = [...l];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    });
  }, []);

  const rotatePage = useCallback(async (id: string) => {
    const p = pages.find((x) => x.id === id);
    if (!p) return;
    const img = await getBitmap(p);
    const c = document.createElement('canvas');
    c.width = p.height; c.height = p.width;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2);          // 90° clockwise
    ctx.drawImage(img, 0, 0);
    const blob = await canvasToBlob(c, 0.92);
    const [tl, tr, br, bl] = p.quad;
    const rot = ({ x, y }: { x: number; y: number }) => ({ x: p.height - y, y: x });
    URL.revokeObjectURL(p.sourceUrl);
    bitmaps.set(p.id, c as unknown as ImageBitmap);
    patchPage(id, { source: blob, sourceUrl: URL.createObjectURL(blob), width: c.width, height: c.height, quad: [rot(bl), rot(tl), rot(tr), rot(br)] });
  }, [pages, patchPage]);

  const autoDetect = useCallback(async (id: string) => {
    const p = pages.find((x) => x.id === id);
    if (!p) return;
    const { quad } = await detectFor(p.source);
    patchPage(id, { quad: quad ?? insetQuad(p.width, p.height, 0.02) });
  }, [pages, detectFor, patchPage]);

  const renderFinal = useCallback(async (p: DraftPage) => canvasToBlob(await renderPageCanvas(p), 0.88), []);

  const clear = useCallback(() => {
    setPages((l) => { l.forEach(free); return []; });
    setActiveId(null);
  }, []);

  const value = useMemo<Session>(() => ({
    pages, activeId, aspect, setAspect, setActive: setActiveId, addPage, patchPage, removePage, movePage, rotatePage, autoDetect, renderFinal, clear,
  }), [pages, activeId, aspect, addPage, patchPage, removePage, movePage, rotatePage, autoDetect, renderFinal, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
