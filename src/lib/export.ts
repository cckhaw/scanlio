import type { DocRecord, ExportOptions } from '../types';
import { loadImage, dims, toCanvas } from './image';
import { buildPdf } from './pdf';

export interface ExportFile { name: string; blob: Blob; mime: string }

const KEY = 'scanlio.export';
const DEFAULTS: ExportOptions = { format: 'pdf', pdfMode: 'combined' };

export const exportPrefs = {
  get(): ExportOptions {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
  },
  set(o: ExportOptions) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } },
};

export const safeName = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Scan';

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' } as const;

async function toPng(jpeg: Blob): Promise<Blob> {
  const img = await loadImage(jpeg);
  const { width, height } = dims(img);
  const c = toCanvas(img, width, height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
}

/** Turn a stored document into the file(s) the user asked for. Names are deterministic (retry-safe). */
export async function buildExportFiles(doc: DocRecord, opts: ExportOptions): Promise<ExportFile[]> {
  const base = safeName(doc.name);
  const n = doc.pages.length;
  const pageName = (i: number, ext: string) => (n === 1 ? `${base}.${ext}` : `${base} - Page ${i + 1}.${ext}`);

  if (opts.format === 'pdf') {
    if (opts.pdfMode === 'combined' || n === 1) {
      return [{ name: `${base}.pdf`, blob: doc.pdf ?? (await buildPdf(doc.pages, doc.name)), mime: MIME.pdf }];
    }
    const out: ExportFile[] = [];
    for (let i = 0; i < n; i++) out.push({ name: pageName(i, 'pdf'), blob: await buildPdf([doc.pages[i]], `${doc.name} - Page ${i + 1}`), mime: MIME.pdf });
    return out;
  }
  const out: ExportFile[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ name: pageName(i, opts.format), blob: opts.format === 'png' ? await toPng(doc.pages[i]) : doc.pages[i], mime: MIME[opts.format] });
  }
  return out;
}

export const describeExport = (o: ExportOptions, pages: number) =>
  o.format === 'pdf'
    ? pages > 1 ? (o.pdfMode === 'combined' ? `1 PDF with ${pages} pages` : `${pages} separate PDFs`) : '1 PDF'
    : `${pages} ${o.format.toUpperCase()} image${pages === 1 ? '' : 's'}`;

