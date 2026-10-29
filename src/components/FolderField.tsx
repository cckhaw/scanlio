import { useEffect, useState } from 'react';
import { cloud } from '../cloud/CloudStorageManager';
import { AuthError, type FolderEntry } from '../cloud/types';
import type { ProviderId } from '../types';
import { BottomSheet } from './BottomSheet';
import { ChevronIcon, PlusIcon } from './Icons';
import { useToast } from './Toast';
import { useCloudState } from './Settings';

/** "Folder · X ›" row: opens the provider's native picker, or the in-app browser when there isn't one. */
export function FolderField({ provider, compact }: { provider: ProviderId; compact?: boolean }) {
  useCloudState();                               // re-render when the chosen folder changes
  const toast = useToast();
  const [browse, setBrowse] = useState(false);

  const change = async () => {
    const p = cloud.providers[provider];
    try {
      if (p.canPickNatively()) { await cloud.pickFolderNative(provider); return; }
      if (!p.isConnected()) await cloud.connect(provider);
      if (p.listFolders) setBrowse(true);        // iCloud via share sheet has no folders to browse
    } catch (e) {
      if (!(e instanceof AuthError && /cancel/i.test(e.message))) toast(e instanceof Error ? e.message : 'Could not open folders', 'error');
    }
  };

  if (provider === 'icloud' && !cloud.providers.icloud.canPickNatively()) return null;
  return (
    <>
      <button onClick={() => void change()} aria-label={`Change ${cloud.providers[provider].label} folder`}
        className={`flex w-full items-center gap-2 text-left transition-colors duration-300 active:bg-label/10 ${compact ? 'min-h-tap px-4 pl-[52px] text-[13px]' : 'min-h-tap px-4 text-[15px]'}`}>
        <span className="text-secondary">Folder</span>
        <span className="min-w-0 flex-1 truncate text-right font-medium text-accent">{cloud.folderLabel(provider)}</span>
        <ChevronIcon width={16} height={16} className="shrink-0 text-tertiary" />
      </button>
      {browse && <FolderBrowser provider={provider} onClose={() => setBrowse(false)} />}
    </>
  );
}

function FolderBrowser({ provider, onClose }: { provider: ProviderId; onClose: () => void }) {
  const p = cloud.providers[provider];
  const toast = useToast();
  const [trail, setTrail] = useState<FolderEntry[]>([]);          // path from the root
  const [items, setItems] = useState<FolderEntry[] | null>(null);
  const parent = trail[trail.length - 1];
  const rootLabel = provider === 'google' ? 'My Drive' : 'OneDrive';

  useEffect(() => {
    let live = true;
    setItems(null);
    p.listFolders!(parent?.id).then((l) => live && setItems(l)).catch((e) => { toast(e.message, 'error'); live && setItems([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.id]);

  const create = async () => {
    const name = prompt('New folder name', 'Scans')?.trim();
    if (!name) return;
    try {
      const f = await p.createFolder!(name, parent?.id);
      setItems((l) => [...(l ?? []), f].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not create folder', 'error'); }
  };

  const choose = () => {
    cloud.setFolder(provider, parent ? { id: parent.id, name: parent.name } : { id: 'root', name: rootLabel });
    onClose();
    void cloud.flush();
  };

  return (
    <BottomSheet open onClose={onClose} title={`${p.label} folder`} full>
      <div className="flex min-h-full flex-col pb-4">
        <div className="no-scrollbar mb-2 flex items-center gap-1 overflow-x-auto text-[14px]">
          <button className="chip" onClick={() => setTrail([])}>{rootLabel}</button>
          {trail.map((t, i) => <button key={t.id} className="chip" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>)}
        </div>
        {provider === 'google' && (
          <p className="mb-2 px-1 text-[12px] text-secondary">Scanlio can only see folders it created. To pick any existing folder, add a Google API key in Settings → Developer credentials.</p>
        )}
        <div className="flex-1 overflow-hidden rounded-btn bg-label/[.07]">
          {items === null && <p className="p-4 text-[14px] text-secondary">Loading…</p>}
          {items?.length === 0 && <p className="p-4 text-[14px] text-secondary">No subfolders here.</p>}
          {items?.map((f, i) => (
            <button key={f.id} onClick={() => setTrail([...trail, f])}
              className={`flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-[16px] active:bg-label/10 ${i ? 'border-t hairline' : ''}`}>
              <span className="flex-1 truncate">{f.name}</span><ChevronIcon width={16} height={16} className="text-tertiary" />
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-glass" onClick={() => void create()}><PlusIcon width={18} height={18} /> New folder</button>
          <button className="btn-primary flex-1 truncate" onClick={choose}>Use “{parent?.name ?? rootLabel}”</button>
        </div>
        <button className="mt-2 min-h-tap text-[14px] text-secondary" onClick={() => { cloud.setFolder(provider, undefined); onClose(); }}>Use default “Scanlio” folder</button>
      </div>
    </BottomSheet>
  );
}
