import type { SVGProps } from 'react';

const I = ({ d, children, ...p }: SVGProps<SVGSVGElement> & { d?: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);
type P = SVGProps<SVGSVGElement>;

export const ScanIcon = (p: P) => <I {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></I>;
export const LibraryIcon = (p: P) => <I {...p}><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h4" /></I>;
export const GearIcon = (p: P) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>;
export const BoltIcon = ({ off, ...p }: P & { off?: boolean }) => <I {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" />{off && <path d="M3 3l18 18" />}</I>;
export const GridIcon = (p: P) => <I {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" /></I>;
export const ListIcon = (p: P) => <I {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></I>;
export const PhotoIcon = (p: P) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></I>;
export const CloseIcon = (p: P) => <I {...p} d="M6 6l12 12M18 6 6 18" />;
export const CheckIcon = (p: P) => <I {...p} d="m5 12.5 4.5 4.5L19 7.5" />;
export const TrashIcon = (p: P) => <I {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></I>;
export const RotateIcon = (p: P) => <I {...p}><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></I>;
export const WandIcon = (p: P) => <I {...p}><path d="m5 19 9-9M14 10l2-2M15 3v3M13.5 4.5h3M19 9v3M17.5 10.5h3M5 5v2M4 6h2" /></I>;
export const CloudIcon = (p: P) => <I {...p} d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10a4 4 0 0 1 0 8z" />;
export const CloudUpIcon = (p: P) => <I {...p}><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10a4 4 0 0 1 0 8" /><path d="m12 11-3 3m3-3 3 3m-3-3v9" /></I>;
export const ShareIcon = (p: P) => <I {...p}><path d="M12 3v12M8 7l4-4 4 4M6 12H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" /></I>;
export const SearchIcon = (p: P) => <I {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></I>;
export const ChevronIcon = (p: P) => <I {...p} d="m9 6 6 6-6 6" />;
export const PlusIcon = (p: P) => <I {...p} d="M12 5v14M5 12h14" />;
export const CropIcon = (p: P) => <I {...p}><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" /></I>;
export const SlidersIcon = (p: P) => <I {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></I>;
export const TextIcon = (p: P) => <I {...p} d="M5 6V4h14v2M12 4v16M9 20h6" />;
export const SunIcon = (p: P) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const MoonIcon = (p: P) => <I {...p} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />;
export const AutoIcon = (p: P) => <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></I>;
export const WifiOffIcon = (p: P) => <I {...p}><path d="M2 8.8a15 15 0 0 1 4-2.2M10 5.2A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 3-1.8M14 11a10 10 0 0 1 5 1.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" /></I>;
export const TagIcon = (p: P) => <I {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.3" /></I>;
export const DownloadIcon = (p: P) => <I {...p} d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />;
