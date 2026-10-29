// Small token store: access tokens live in sessionStorage only (never IndexedDB / localStorage).
export const tokenStore = {
  get<T>(k: string): T | null {
    try { const v = sessionStorage.getItem('scanlio.' + k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  },
  set(k: string, v: unknown) { try { sessionStorage.setItem('scanlio.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k: string) { try { sessionStorage.removeItem('scanlio.' + k); } catch { /* ignore */ } },
};

/** Client IDs: build-time env first, then user-supplied values saved from Settings. */
export const clientIds = {
  get(p: 'google' | 'microsoft'): string {
    const env = p === 'google' ? import.meta.env.VITE_GOOGLE_CLIENT_ID : import.meta.env.VITE_MS_CLIENT_ID;
    try { return (env as string) || localStorage.getItem(`scanlio.clientId.${p}`) || ''; } catch { return (env as string) || ''; }
  },
  set(p: 'google' | 'microsoft', v: string) { try { localStorage.setItem(`scanlio.clientId.${p}`, v.trim()); } catch { /* ignore */ } },
};
