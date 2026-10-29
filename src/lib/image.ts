export const canvasToBlob = (c: HTMLCanvasElement, quality = 0.88): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', quality));

export async function loadImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export const dims = (i: ImageBitmap | HTMLImageElement) =>
  i instanceof HTMLImageElement ? { width: i.naturalWidth, height: i.naturalHeight } : { width: i.width, height: i.height };

/** Draw an image onto a canvas scaled so its longest side is <= max. */
export function toCanvas(src: CanvasImageSource, w: number, h: number, max = Infinity): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export const thumbnail = async (blob: Blob, max = 360) => {
  const img = await loadImage(blob);
  const { width, height } = dims(img);
  return canvasToBlob(toCanvas(img, width, height, max), 0.8);
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
