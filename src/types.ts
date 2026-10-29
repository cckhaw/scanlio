export interface Point { x: number; y: number }
/** Corner order is always: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export type FilterId = 'original' | 'color' | 'bw' | 'gray' | 'contrast';
export type ProviderId = 'google' | 'onedrive' | 'icloud';
export type AspectLock = 'auto' | 'a4' | 'letter' | 'square';

/** A page in the in-progress scan session (lives in memory until saved). */
export interface DraftPage {
  id: string;
  source: Blob;            // full-resolution capture
  sourceUrl: string;       // object URL of `source`
  width: number;
  height: number;
  quad: Quad;              // crop corners in source pixel space
  filter: FilterId;
  aspect: AspectLock;
  result?: Blob;           // warped + filtered output (JPEG)
  resultUrl?: string;
}

export type OcrStatus = 'pending' | 'running' | 'done' | 'failed';
export type SyncState = 'queued' | 'uploading' | 'done' | 'error';

export interface DocRecord {
  id: string;
  name: string;
  createdAt: number;
  tags: string[];
  pages: Blob[];           // processed JPEG pages
  thumb: Blob;
  pdf?: Blob;
  ocrText: string;
  ocrStatus: OcrStatus;
  sync: Partial<Record<ProviderId, SyncState>>;
}

export interface QueueItem {
  id: string;
  docId: string;
  provider: ProviderId;
  attempts: number;
  error?: string;
  createdAt: number;
}
