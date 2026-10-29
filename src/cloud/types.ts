import type { ProviderId } from '../types';

export interface UploadFile { name: string; blob: Blob; mime: string }

export interface CloudProvider {
  id: ProviderId;
  label: string;
  /** True when this browser/environment can use the provider at all. */
  supported(): boolean;
  /** True when credentials (or a folder grant) are usable right now. */
  isConnected(): boolean;
  /** Needs a user gesture (popup / picker). */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  upload(file: UploadFile, folder: string, onProgress?: (f: number) => void): Promise<void>;
}

/** Thrown for failures that retrying won't fix without user action (auth expired, no config). */
export class AuthError extends Error {}
export class RetryableError extends Error {}
