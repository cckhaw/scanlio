/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FolderRef } from '../types';
import { AuthError, RetryableError, type CloudProvider, type FolderEntry, type UploadFile } from './types';
import { clientIds, tokenStore } from './storage';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';   // only files/folders the app created or the user picked
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DEFAULT_FOLDER = 'Scanlio';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
interface Tok { access_token: string; expires_at: number }

const loadScript = (src: string, ready: () => boolean) =>
  new Promise<void>((res, rej) => {
    if (ready()) return res();
    const s = Object.assign(document.createElement('script'), { src, async: true });
    s.onload = () => res();
    s.onerror = () => rej(new RetryableError(`Could not load ${new URL(src).host}`));
    document.head.appendChild(s);
  });
const loadGis = () => loadScript(GIS_SRC, () => !!(window as any).google?.accounts?.oauth2);

const token = () => {
  const t = tokenStore.get<Tok>('google');
  if (!t || t.expires_at < Date.now()) throw new AuthError('Google Drive session expired — reconnect.');
  return t.access_token;
};
const auth = () => ({ Authorization: `Bearer ${token()}` });

const nameCache = new Map<string, string>();

export const googleDrive: CloudProvider = {
  id: 'google',
  label: 'Google Drive',
  configured: () => !!clientIds.get('google'),
  isConnected: () => { const t = tokenStore.get<Tok>('google'); return !!t && t.expires_at > Date.now() + 30_000; },

  async connect() {
    const client_id = clientIds.get('google');
    if (!client_id) throw new AuthError('Google Drive isn\'t available right now.');
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
    nameCache.clear();
    if (t) { try { await loadGis(); (window as any).google.accounts.oauth2.revoke(t.access_token); } catch { /* best effort */ } }
  },

  /* ----- folder selection ----- */
  // The Google Picker is the only way (with the narrow drive.file scope) to let users choose a folder they
  // already have; it needs an API key. Without one the in-app browser shows folders Scanlio itself created.
  canPickNatively: () => !!clientIds.get('googleKey') && !!clientIds.get('google'),

  async pickFolder(): Promise<FolderRef | null> {
    const t = token();
    await loadScript('https://apis.google.com/js/api.js', () => !!(window as any).gapi);
    await new Promise<void>((r) => (window as any).gapi.load('picker', () => r()));
    const g = (window as any).google.picker;
    return new Promise((resolve) => {
      const view = new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER_MIME);
      new g.PickerBuilder()
        .addView(view)
        .setOAuthToken(t)
        .setDeveloperKey(clientIds.get('googleKey'))
        .setAppId(clientIds.get('google').split('-')[0])
        .setTitle('Choose a folder for your scans')
        .setCallback((d: any) => {
          if (d.action === g.Action.PICKED) resolve({ id: d.docs[0].id, name: d.docs[0].name });
          else if (d.action === g.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
    });
  },

  async listFolders(parentId = 'root'): Promise<FolderEntry[]> {
    const q = encodeURIComponent(`'${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=200`, { headers: auth() });
    check(r);
    return (await r.json()).files ?? [];
  },

  async createFolder(name, parentId) {
    const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    });
    check(r);
    return r.json();
  },

  /* ----- upload ----- */
  async upload(file: UploadFile, folder, onProgress) {
    const headers = auth();
    const folderId = folder?.id ?? (await ensureNamedFolder(folder?.name ?? DEFAULT_FOLDER, headers));

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

async function ensureNamedFolder(name: string, headers: Record<string, string>): Promise<string> {
  const cached = nameCache.get(name);
  if (cached) return cached;
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers });
  check(res);
  let id: string | undefined = (await res.json()).files?.[0]?.id;
  if (!id) id = (await googleDrive.createFolder!(name)).id;
  nameCache.set(name, id!);
  return id!;
}

function check(r: Response) {
  if (r.ok) return;
  if (r.status === 401 || r.status === 403) throw new AuthError(`Google Drive rejected the request (${r.status})`);
  if (r.status === 404) throw new AuthError('That Drive folder is no longer accessible — choose a folder again.');
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
