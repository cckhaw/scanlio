import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { CheckIcon, CloseIcon } from './Icons';

type Kind = 'success' | 'error' | 'info';
interface T { id: number; text: string; kind: Kind }
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    haptic(kind === 'success' ? 'success' : kind === 'error' ? 'warning' : 'light');
    setItems((l) => [...l.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3600);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 pt-safe px-4" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="glass pointer-events-auto flex max-w-sm animate-toast-in items-center gap-2.5 rounded-full py-2 pl-2.5 pr-4 text-[14px] font-medium shadow-float">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-white ${t.kind === 'success' ? 'bg-success' : t.kind === 'error' ? 'bg-danger' : 'bg-accent'}`}>
              {t.kind === 'error' ? <CloseIcon width={14} height={14} strokeWidth={2.6} /> : <CheckIcon width={14} height={14} strokeWidth={2.6} />}
            </span>
            <span className="line-clamp-2">{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
