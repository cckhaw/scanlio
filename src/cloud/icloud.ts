/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FolderRef } from '../types';
import { AuthError, type CloudProvider, type UploadFile } from './types';
import { kv } from '../lib/db';
import { downloadBlob } from '../lib/image';

/**
 * iCloud Drive has no web upload API. Two native paths instead:
 *  1. File System Access API (Chromium; macOS/Windows/Android): the user picks their "iCloud Drive"
 *     folder once, the handle is persisted in IndexedDB and files are written straight into it.
 *  2. Elsewhere (iOS/Safari): the native share sheet -> "Save to Files" -> iCloud Drive, else a plain download.
 */
const HANDLE_KEY = 'icloud-dir';
let handle: any | null = null;

const hasFsAccess = () => 'showDirectoryPicker' in window;

async function hasPermission(h: any, request = false) {
  const opts = { mode: 'readwrite' };
  if ((await h.queryPermission(opts)) === 'granted') return true;
  return request && (await h.requestPermission(opts)) === 'granted';
}

export const iCloudDrive: CloudProvider = {
  id: 'icloud',
  label: 'iCloud Drive',
  configured: () => true,      // always usable via share-sheet / download fallback
  isConnected: () => !hasFsAccess() || !!handle,

  async connect() {
    if (!hasFsAccess()) return;      // nothing to connect: the share sheet is chosen per upload
    try {
      handle = await (window as any).showDirectoryPicker({ id: 'scanlio-icloud', mode: 'readwrite', startIn: 'documents' });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new AuthError('Folder selection cancelled');
      throw e;
    }
    await kv.set(HANDLE_KEY, handle);
  },

  async disconnect() { handle = null; await kv.del(HANDLE_KEY); },

  // The directory the user picks IS the destination folder.
  canPickNatively: () => hasFsAccess(),
  async pickFolder(): Promise<FolderRef | null> {
    try { await iCloudDrive.connect(); } catch (e) { if (e instanceof AuthError) return null; throw e; }
    return { name: handle?.name ?? 'iCloud Drive' };
  },

  async upload(file: UploadFile, _folder, onProgress) {
    if (!handle && hasFsAccess()) {
      const saved = await kv.get<any>(HANDLE_KEY);
      if (saved && (await hasPermission(saved))) handle = saved;
      else if (saved) throw new AuthError('Re-grant access to your iCloud Drive folder in Settings.');
    }
    if (handle) {
      if (!(await hasPermission(handle))) throw new AuthError('Re-grant access to your iCloud Drive folder in Settings.');
      const f = await handle.getFileHandle(file.name, { create: true });
      const w = await f.createWritable();
      await w.write(file.blob);
      await w.close();
      onProgress?.(1);
      return;
    }
    // Fallback: native share sheet (must run in a user gesture on iOS) -> Save to Files -> iCloud Drive.
    const f = new File([file.blob], file.name, { type: file.mime });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: file.name }); onProgress?.(1); return; }
      catch (e: any) {
        if (e?.name === 'AbortError') throw new AuthError('Share cancelled');
        // iOS only opens the share sheet from a tap, never from the background queue.
        if (e?.name === 'NotAllowedError') throw new AuthError('Open the document and tap Save to Files to finish.');
      }
    }
    downloadBlob(file.blob, file.name);
    onProgress?.(1);
  },
};

export const iCloudFolderName = () => handle?.name as string | undefined;

/** Restore a previously granted folder handle on startup (permission may need re-prompting later). */
export async function restoreICloudHandle() {
  if (!hasFsAccess()) return;
  const saved = await kv.get<any>(HANDLE_KEY);
  if (saved && (await saved.queryPermission({ mode: 'readwrite' })) === 'granted') handle = saved;
}
