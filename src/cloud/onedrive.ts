import { AuthError, RetryableError, type CloudProvider, type FolderEntry, type UploadFile } from './types';
import { clientIds, tokenStore } from './storage';

// Authorization-code flow + PKCE (the supported flow for SPAs; implicit grant is deprecated).
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
// Files.ReadWrite is required so users can pick any of their own folders. Scanlio only lists folder names while
// browsing and writes the files you export; it never reads existing file contents.
const SCOPE = 'Files.ReadWrite offline_access';
const DEFAULT_FOLDER = 'Scanlio';
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const REDIRECT = () => `${location.origin}/oauth-callback.html`;
const CHUNK = 320 * 1024 * 10;   // must be a multiple of 320 KiB

interface Tok { access_token: string; refresh_token?: string; expires_at: number }

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)).buffer);

async function tokenRequest(body: Record<string, string>): Promise<Tok> {
  const r = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientIds.get('microsoft'), scope: SCOPE, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new AuthError(j.error_description || j.error || 'Microsoft sign-in failed');
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 };
}

/** Valid access token, refreshing silently with the refresh token when possible. */
async function accessToken(): Promise<string> {
  const t = tokenStore.get<Tok>('ms');
  if (t && t.expires_at > Date.now() + 30_000) return t.access_token;
  if (t?.refresh_token) {
    try {
      const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
      tokenStore.set('ms', { ...n, refresh_token: n.refresh_token ?? t.refresh_token });
      return n.access_token;
    } catch { /* fall through */ }
  }
  throw new AuthError('OneDrive session expired — reconnect.');
}

export const oneDrive: CloudProvider = {
  id: 'onedrive',
  label: 'OneDrive',
  supported: () => true,
  isConnected: () => { const t = tokenStore.get<Tok>('ms'); return !!t && (t.expires_at > Date.now() || !!t.refresh_token); },

  async connect() {
    const client_id = clientIds.get('microsoft');
    if (!client_id) throw new AuthError('Add a Microsoft application (client) ID in Settings first.');
    const verifier = rand(48), state = rand(12);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const url = `${AUTH}/authorize?` + new URLSearchParams({
      client_id, response_type: 'code', redirect_uri: REDIRECT(), response_mode: 'query', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    // Open synchronously within the user gesture (Safari blocks later popups).
    const popup = window.open(url, 'scanlio-ms', 'width=480,height=680');
    if (!popup) throw new AuthError('Popup blocked — allow popups and retry.');
    const params = await new Promise<Record<string, string>>((resolve, reject) => {
      const done = (fn: () => void) => { window.removeEventListener('message', onMsg); clearInterval(timer); fn(); };
      const onMsg = (e: MessageEvent) => {
        if (e.origin !== location.origin || e.data?.type !== 'scanlio-oauth') return;
        done(() => resolve(e.data.params));
      };
      const timer = setInterval(() => popup.closed && done(() => reject(new AuthError('Sign-in cancelled'))), 500);
      window.addEventListener('message', onMsg);
    });
    if (params.state !== state) throw new AuthError('OAuth state mismatch');
    if (!params.code) throw new AuthError(params.error_description || params.error || 'Sign-in failed');
    const tok = await tokenRequest({ grant_type: 'authorization_code', code: params.code, redirect_uri: REDIRECT(), code_verifier: verifier });
    tokenStore.set('ms', tok);
  },

  async disconnect() { tokenStore.del('ms'); },

  canPickNatively: () => false,

  async listFolders(parentId): Promise<FolderEntry[]> {
    const token = await accessToken();
    const base = parentId ? `${GRAPH}/items/${parentId}` : `${GRAPH}/root`;
    const out: FolderEntry[] = [];
    let url: string | undefined = `${base}/children?$select=id,name,folder&$top=200`;
    while (url) {
      const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) throw new AuthError('OneDrive rejected the token');
      if (!r.ok) throw new RetryableError(`OneDrive error ${r.status}`);
      const j = await r.json();
      out.push(...(j.value as { id: string; name: string; folder?: unknown }[]).filter((i) => i.folder).map((i) => ({ id: i.id, name: i.name })));
      url = j['@odata.nextLink'];
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async createFolder(name, parentId): Promise<FolderEntry> {
    const token = await accessToken();
    const r = await fetch(`${parentId ? `${GRAPH}/items/${parentId}` : `${GRAPH}/root`}/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
    if (!r.ok) throw new RetryableError(`Could not create folder (${r.status})`);
    const j = await r.json();
    return { id: j.id, name: j.name };
  },

  async upload(file: UploadFile, folder, onProgress) {
    const token = await accessToken();
    const name = encodeURIComponent(file.name);
    const target = folder?.id && folder.id !== 'root' ? `${GRAPH}/items/${folder.id}:/${name}:` : folder?.id === 'root' ? `${GRAPH}/root:/${name}:` : `${GRAPH}/root:/${encodeURIComponent(folder?.name ?? DEFAULT_FOLDER)}/${name}:`;
    const sess = await fetch(`${target}/createUploadSession`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    });
    if (sess.status === 401) throw new AuthError('OneDrive rejected the token');
    if (sess.status === 404) throw new AuthError('That OneDrive folder no longer exists — choose a folder again.');
    if (!sess.ok) throw new RetryableError(`OneDrive error ${sess.status}`);
    const { uploadUrl } = await sess.json();

    // Chunked PUTs; the upload URL is pre-authorised so no Authorization header is sent.
    const total = file.blob.size;
    for (let start = 0; start < total; start += CHUNK) {
      const end = Math.min(start + CHUNK, total);
      const r = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${total}` },
        body: file.blob.slice(start, end),
      });
      if (!r.ok && r.status !== 202) throw new RetryableError(`OneDrive upload failed (${r.status})`);
      onProgress?.(end / total);
    }
  },
};
