import { PDFDocument } from 'pdf-lib';
import { loadImage, dims } from './image';

/** Build a PDF with one JPEG page per blob; page size = image size at 150 dpi (points). */
export async function buildPdf(pages: Blob[], title: string): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('Scanlio');
  pdf.setCreator('Scanlio');
  for (const blob of pages) {
    const jpg = await pdf.embedJpg(await blob.arrayBuffer());
    const img = await loadImage(blob);
    const { width, height } = dims(img);
    const k = 72 / 150;
    const page = pdf.addPage([width * k, height * k]);
    page.drawImage(jpg, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
