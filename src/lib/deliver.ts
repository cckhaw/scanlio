import type { ExportFile } from './export';
import { downloadBlob } from './image';

export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'blocked';

export const canShareFiles = () => typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

/** Save files to the device (browser download / iOS Files). */
export function saveToDevice(files: ExportFile[]) {
  files.forEach((f, i) => setTimeout(() => downloadBlob(f.blob, f.name), i * 250));   // spaced so browsers don't drop multi-downloads
}

/**
 * Open the native share sheet with the files — from there the user can AirDrop, message, email,
 * "Save Image", or hand them to any cloud-storage app (Drive, Dropbox, iCloud Drive, OneDrive…).
 */
export async function shareFiles(files: ExportFile[], title: string): Promise<ShareResult> {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.mime }));
  if (!canShareFiles() || !navigator.canShare({ files: list })) return 'unsupported';
  try {
    await navigator.share({ files: list, title });
    return 'shared';
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'blocked';   // user-activation expired (slow export) — caller asks for another tap
    return 'unsupported';
  }
}
