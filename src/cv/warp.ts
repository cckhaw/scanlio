/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AspectLock, Quad } from '../types';
import { dist, homography } from './geometry';
import { getCv } from './opencv';

const MAX_SIDE = 2200;
const RATIOS: Record<Exclude<AspectLock, 'auto'>, number> = { a4: 210 / 297, letter: 8.5 / 11, square: 1 };

export function outputSize(q: Quad, aspect: AspectLock) {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  if (aspect !== 'auto') {
    const r = RATIOS[aspect];
    const landscape = w > h && aspect !== 'square';
    const long = Math.max(w, h);
    if (landscape) { w = long; h = long * r; } else { h = long; w = long * r; }
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
}

/** Perspective-correct `quad` of `src` into an upright rectangle. Uses OpenCV when loaded, bilinear JS otherwise. */
export function warpDocument(src: CanvasImageSource & { width: number; height: number }, quad: Quad, aspect: AspectLock = 'auto'): HTMLCanvasElement {
  const { w, h } = outputSize(quad, aspect);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const cv = getCv();
  if (cv) { try { warpCv(cv, src, quad, out); return out; } catch { /* fall through to JS */ } }
  warpJs(src, quad, out);
  return out;
}

function warpCv(cv: any, src: CanvasImageSource & { width: number; height: number }, quad: Quad, out: HTMLCanvasElement) {
  const tmp = document.createElement('canvas');
  tmp.width = src.width; tmp.height = src.height;
  tmp.getContext('2d')!.drawImage(src, 0, 0);
  const mat = cv.imread(tmp), dst = new cv.Mat();
  const s = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]));
  const d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, out.width, 0, out.width, out.height, 0, out.height]);
  const M = cv.getPerspectiveTransform(s, d);
  cv.warpPerspective(mat, dst, M, new cv.Size(out.width, out.height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  cv.imshow(out, dst);
  [mat, dst, s, d, M].forEach((x) => x.delete());
}

function warpJs(src: CanvasImageSource & { width: number; height: number }, quad: Quad, out: HTMLCanvasElement) {
  const sc = document.createElement('canvas');
  sc.width = src.width; sc.height = src.height;
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(src, 0, 0);
  const sd = sctx.getImageData(0, 0, sc.width, sc.height);
  const { width: sw, height: sh, data: s } = sd;
  const { width: w, height: h } = out;
  // dst rectangle -> source quad
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad);
  const octx = out.getContext('2d')!;
  if (!H) { octx.drawImage(sc, 0, 0, w, h); return; }
  const od = octx.createImageData(w, h);
  const o = od.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = H[6] * x + H[7] * y + 1;
      const fx = (H[0] * x + H[1] * y + H[2]) / d, fy = (H[3] * x + H[4] * y + H[5]) / d;
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(fy)));
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const oi = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[oi + c] = (s[i00 + c] * (1 - tx) + s[i10 + c] * tx) * (1 - ty) + (s[i01 + c] * (1 - tx) + s[i11 + c] * tx) * ty;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
}
