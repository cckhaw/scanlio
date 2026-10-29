import { docs } from './db';
import { dims, loadImage, toCanvas } from './image';

/* eslint-disable @typescript-eslint/no-explicit-any */
let workerP: Promise<any> | null = null;

async function getWorker(lang: string) {
  return (workerP ??= import('tesseract.js').then((T) => T.createWorker(lang)).catch((e) => { workerP = null; throw e; }));
}

const pending: string[] = [];
let running = false;

/** Queue background OCR for a stored document; results are written back to IndexedDB for search. */
export function enqueueOcr(docId: string, lang = 'eng') {
  if (!pending.includes(docId)) pending.push(docId);
  void drain(lang);
}

export function retryPendingOcr(lang = 'eng') {
  void docs.all().then((all) => {
    all.filter((d) => d.ocrStatus !== 'done').forEach((d) => pending.includes(d.id) || pending.push(d.id));
    void drain(lang);
  });
}

async function drain(lang: string) {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const id = pending.shift()!;
      const doc = await docs.get(id);
      if (!doc || doc.ocrStatus === 'done') continue;
      await docs.update(id, (d) => { d.ocrStatus = 'running'; });
      try {
        const worker = await getWorker(lang);
        const texts: string[] = [];
        for (const page of doc.pages) {
          const img = await loadImage(page);
          const { width, height } = dims(img);
          const c = toCanvas(img, width, height, 1800);
          const { data } = await worker.recognize(c);
          texts.push(data.text.trim());
        }
        await docs.update(id, (d) => { d.ocrText = texts.join('\n\n'); d.ocrStatus = 'done'; });
      } catch {
        // Typically offline (language data is fetched on first use). Leave as failed; retried when back online.
        await docs.update(id, (d) => { d.ocrStatus = 'failed'; });
      }
    }
  } finally { running = false; }
}
