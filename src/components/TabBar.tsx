import type { ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { GearIcon, HomeIcon, LibraryIcon, ScanIcon } from './Icons';

export type Tab = 'home' | 'scan' | 'library' | 'settings';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'scan', label: 'Scan', icon: <ScanIcon /> },
  { id: 'library', label: 'Library', icon: <LibraryIcon /> },
  { id: 'settings', label: 'Settings', icon: <GearIcon /> },
];

/** Floating frosted pill tab bar; each target is >= 44x44. */
export function TabBar({ tab, onChange, badge }: { tab: Tab; onChange: (t: Tab) => void; badge?: number }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-safe" aria-label="Main">
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5 shadow-float" role="tablist">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => { haptic('light'); onChange(t.id); }}
              className={`relative flex min-h-tap min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-500 ease-hig active:scale-95 ${
                active ? 'bg-accent/15 text-accent' : 'text-secondary'
              }`}
            >
              <span className="[&>svg]:h-[22px] [&>svg]:w-[22px]">{t.icon}</span>
              {t.label}
              {t.id === 'library' && !!badge && (
                <span className="absolute right-3 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
