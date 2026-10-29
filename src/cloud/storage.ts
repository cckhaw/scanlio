// Small token store: access tokens live in sessionStorage only (never IndexedDB / localStorage).
export const tokenStore = {
  get<T>(k: string): T | null {
    try { const v = sessionStorage.getItem('scanlio.' + k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  },
  set(k: string, v: unknown) { try { sessionStorage.setItem('scanlio.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k: string) { try { sessionStorage.removeItem('scanlio.' + k); } catch { /* ignore */ } },
};

export type CredKey = 'google' | 'googleKey' | 'microsoft';
const ENV: Record<CredKey, string | undefined> = {
  google: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  googleKey: import.meta.env.VITE_GOOGLE_API_KEY,
  microsoft: import.meta.env.VITE_MS_CLIENT_ID,
};

/** OAuth client IDs / API key come from build-time configuration only (Vercel env vars); users never enter them. */
export const clientIds = { get: (k: CredKey): string => ENV[k] ?? '' };
