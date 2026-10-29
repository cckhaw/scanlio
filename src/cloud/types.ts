import type { ProviderId, FolderRef } from '../types';

export interface UploadFile { name: string; blob: Blob; mime: string }
export interface FolderEntry { id: string; name: string }

export interface CloudProvider {
  id: ProviderId;
  label: string;
  /** False when the server-side configuration (client ID) for this provider is missing. */
  configured(): boolean;
  /** True when credentials (or a folder grant) are usable right now. */
  isConnected(): boolean;
  /** Needs a user gesture (popup / picker). */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** `folder` undefined => the provider's default "Scanlio" folder. */
  upload(file: UploadFile, folder: FolderRef | undefined, onProgress?: (f: number) => void): Promise<void>;

  /** Provider-native folder chooser (Google Picker / OS directory picker), when available. */
  canPickNatively(): boolean;
  pickFolder?(): Promise<FolderRef | null>;
  /** Otherwise the in-app folder browser uses these. */
  listFolders?(parentId?: string): Promise<FolderEntry[]>;
  createFolder?(name: string, parentId?: string): Promise<FolderEntry>;
}

/** Thrown for failures that retrying won't fix without user action (auth expired, no config). */
export class AuthError extends Error {}
export class RetryableError extends Error {}
