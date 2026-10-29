import type { FilterId } from '../types';

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'color', label: 'Color Doc' },
  { id: 'bw', label: 'B&W Magic Scan' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'contrast', label: 'High Contrast' },
];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Returns a new canvas with `filter` applied; the input canvas is untouched. */
export function applyFilter(src: HTMLCanvasElement, filter: FilterId): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  if (filter === 'original') return out;

  const img = ctx.getImageData(0, 0, out.width, out.height);
  flattenIllumination(src, img);          // removes shadows / uneven lighting
  switch (filter) {
    case 'color': levels(img, false, 1.12); break;
    case 'gray': toGray(img); levels(img, false, 1.05); break;
    case 'contrast': toGray(img); levels(img, true, 1.0); break;
    case 'bw': toGray(img); adaptiveThreshold(img); break;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Divide by a heavily blurred copy (cheap blur = canvas down/up-scale) => flat white paper background. */
function flattenIllumination(src: HTMLCanvasElement, img: ImageData) {
  const k = Math.max(8, Math.round(Math.max(src.width, src.height) / 40));
  const sw = Math.max(2, Math.round(src.width / k)), sh = Math.max(2, Math.round(src.height / k));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const big = document.createElement('canvas');
  big.width = src.width; big.height = src.height;
  const bctx = big.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, big.width, big.height);
  const bg = bctx.getImageData(0, 0, big.width, big.height).data;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Bias the blurred background upward so text (which drags the local mean down) still reads as ink.
    d[i] = clamp((d[i] / Math.max(40, bg[i] * 1.06)) * 255);
    d[i + 1] = clamp((d[i + 1] / Math.max(40, bg[i + 1] * 1.06)) * 255);
    d[i + 2] = clamp((d[i + 2] / Math.max(40, bg[i + 2] * 1.06)) * 255);
  }
}

function toGray(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
}

/** Percentile levels stretch (+ optional S-curve) so paper -> white and ink -> dark. */
function levels(img: ImageData, sCurve: boolean, gamma: number) {
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 16) hist[(d[i] + d[i + 1] + d[i + 2]) / 3 | 0]++;
  const total = d.length / 16;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.35) { hi = v; break; } }  // >=35% brightest = paper
  hi = Math.max(hi, lo + 32);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let n = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    n = n ** gamma;
    if (sCurve) n = n * n * (3 - 2 * n), n = n * n * (3 - 2 * n);   // double smoothstep => crisp contrast
    lut[v] = n * 255;
  }
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
}

/** Local-mean (integral image) threshold: robust against uneven lighting. */
function adaptiveThreshold(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[(y * w + x) * 4];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(7, Math.round(Math.min(w, h) / 24));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = d[i] > mean * 0.9 - 4 ? 255 : 0;
    }
  }
}
