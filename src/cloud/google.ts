/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuthError, RetryableError, type CloudProvider, type UploadFile } from './types';
import { clientIds, tokenStore } from './storage';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';   // app-created files only: least privilege
const GIS_SRC = 'https://accounts.google.com/gsi/client';
interface Tok { access_token: string; expires_at: number }

let gisP: Promise<void> | null = null;
const loadGis = () =>
  (gisP ??= new Promise<void>((res, rej) => {
    if ((window as any).google?.accounts?.oauth2) return res();
    const s = Object.assign(document.createElement('script'), { src: GIS_SRC, async: true });
    s.onload = () => res();
    s.onerror = () => { gisP = null; rej(new RetryableError('Could not load Google Identity Services')); };
    document.head.appendChild(s);
  }));

const folderCache = new Map<string, string>();

export const googleDrive: CloudProvider = {
  id: 'google',
  label: 'Google Drive',
  supported: () => true,
  isConnected: () => { const t = tokenStore.get<Tok>('google'); return !!t && t.expires_at > Date.now() + 30_000; },

  async connect() {
    const client_id = clientIds.get('google');
    if (!client_id) throw new AuthError('Add a Google OAuth client ID in Settings first.');
    await loadGis();
    const tok = await new Promise<Tok>((resolve, reject) => {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id,
        scope: SCOPE,
        callback: (r: any) => r.error ? reject(new AuthError(r.error_description || r.error)) :
          resolve({ access_token: r.access_token, expires_at: Date.now() + (r.expires_in ?? 3600) * 1000 }),
        error_callback: (e: any) => reject(new AuthError(e?.type || 'Sign-in cancelled')),
      });
      client.requestAccessToken({ prompt: tokenStore.get('google:seen') ? '' : 'consent' });
    });
    tokenStore.set('google', tok);
    tokenStore.set('google:seen', true);
  },

  async disconnect() {
    const t = tokenStore.get<Tok>('google');
    tokenStore.del('google');
    folderCache.clear();
    if (t) { try { await loadGis(); (window as any).google.accounts.oauth2.revoke(t.access_token); } catch { /* best effort */ } }
  },

  async upload(file: UploadFile, folder: string, onProgress) {
    const t = tokenStore.get<Tok>('google');
    if (!t || t.expires_at < Date.now()) throw new AuthError('Google Drive session expired — reconnect.');
    const headers = { Authorization: `Bearer ${t.access_token}` };
    const folderId = await ensureFolder(folder, headers);

    // Resumable upload: init session, then PUT the bytes (progress via XHR).
    const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.mime },
      body: JSON.stringify({ name: file.name, parents: [folderId], mimeType: file.mime }),
    });
    check(init);
    const location = init.headers.get('Location');
    if (!location) throw new RetryableError('Drive did not return an upload URL');
    await putWithProgress(location, file.blob, file.mime, onProgress);
  },
};

async function ensureFolder(name: string, headers: Record<string, string>): Promise<string> {
  const cached = folderCache.get(name);
  if (cached) return cached;
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers });
  check(res);
  let id: string | undefined = (await res.json()).files?.[0]?.id;
  if (!id) {
    const c = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    check(c);
    id = (await c.json()).id as string;
  }
  folderCache.set(name, id!);
  return id!;
}

function check(r: Response) {
  if (r.ok) return;
  if (r.status === 401 || r.status === 403) throw new AuthError(`Google Drive rejected the request (${r.status})`);
  throw new RetryableError(`Google Drive error ${r.status}`);
}

function putWithProgress(url: string, blob: Blob, mime: string, onProgress?: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', mime);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new RetryableError(`Upload failed (${x.status})`)));
    x.onerror = () => reject(new RetryableError('Network error during upload'));
    x.send(blob);
  });
}
