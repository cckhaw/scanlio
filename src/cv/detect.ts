/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Point, Quad } from '../types';
import { getCv } from './opencv';
import { isConvex, orderQuad, quadArea, scaleQuad } from './geometry';

const MIN_AREA = 0.12;  // quad must cover at least 12% of the frame
const MAX_AREA = 0.985;

/** Detect the document quad in `img`; returned corners are in `img` pixel space (TL,TR,BR,BL). */
export function detectDocument(img: ImageData): Quad | null {
  const cv = getCv();
  const q = cv ? detectWithOpenCv(cv, img) : null;
  return q ?? detectFallback(img);
}

function detectWithOpenCv(cv: any, img: ImageData): Quad | null {
  const mats: any[] = [];
  const m = <T,>(x: T) => (mats.push(x), x);
  try {
    const frameArea = img.width * img.height;
    const src = m(cv.matFromImageData(img));
    const gray = m(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const edges = m(new cv.Mat());
    cv.Canny(gray, edges, 40, 120);
    const kernel = m(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);   // close small gaps in the page border
    const contours = m(new cv.MatVector());
    const hierarchy = m(new cv.Mat());
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best: Quad | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > frameArea * MIN_AREA && area > bestArea) {
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
        if (approx.rows === 4) {
          const pts: Point[] = [];
          for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
          const quad = orderQuad(pts);
          if (isConvex(quad) && quadArea(quad) < frameArea * MAX_AREA) { best = quad; bestArea = area; }
        }
        approx.delete();
      }
      c.delete();
    }
    return best;
  } catch {
    return null;
  } finally {
    mats.forEach((x) => x.delete?.());
  }
}

/**
 * Pure-JS fallback: Otsu-threshold a downscaled, blurred luminance image, take the biggest
 * connected blob (paper is normally lighter than its surroundings) and use its extreme points.
 */
function detectFallback(img: ImageData): Quad | null {
  const scale = Math.min(1, 160 / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * scale)), h = Math.max(8, Math.round(img.height * scale));
  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
      lum[y * w + x] = (img.data[i] * 77 + img.data[i + 1] * 150 + img.data[i + 2] * 29) >> 8;
    }
  }
  const blur = boxBlur(lum, w, h);
  const t = otsu(blur);
  for (const invert of [false, true]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = (blur[i] > t) !== invert ? 1 : 0;
    const blob = largestBlob(mask, w, h);
    if (!blob) continue;
    const quad = orderQuad(blob.extremes);
    const qa = quadArea(quad);
    const frac = qa / (w * h);
    // Blob must fill most of its quad (i.e. be rectangle-like) and be a plausible size.
    if (frac > MIN_AREA && frac < MAX_AREA && blob.area / qa > 0.78 && isConvex(quad)) {
      return scaleQuad(quad, 1 / scale);
    }
  }
  return null;
}

function boxBlur(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += src[yy * w + xx]; n++; }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function otsu(g: Uint8Array): number {
  const hist = new Array(256).fill(0);
  g.forEach((v) => hist[v]++);
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  return thr;
}

function largestBlob(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length);
  let best: { area: number; extremes: Point[] } | null = null;
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let area = 0;
    let tl = s, tr = s, br = s, bl = s;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      area++;
      if (x + y < (tl % w) + Math.floor(tl / w)) tl = p;
      if (x + y > (br % w) + Math.floor(br / w)) br = p;
      if (x - y > (tr % w) - Math.floor(tr / w)) tr = p;
      if (x - y < (bl % w) - Math.floor(bl / w)) bl = p;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    if (!best || area > best.area) {
      const pt = (p: number): Point => ({ x: p % w, y: Math.floor(p / w) });
      best = { area, extremes: [tl, tr, br, bl].map(pt) };
    }
  }
  return best;
}
