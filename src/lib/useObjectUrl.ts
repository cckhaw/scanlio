import { useEffect, useState } from 'react';

export function useObjectUrl(blob: Blob | undefined | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useObjectUrls(blobs: Blob[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = blobs.map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [blobs]);
  return urls;
}
