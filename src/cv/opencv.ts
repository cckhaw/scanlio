/* eslint-disable @typescript-eslint/no-explicit-any */
// Lazy OpenCV.js loader. The ~9 MB build is fetched once (then cached by the service worker);
// everything in /cv works without it through pure-JS fallbacks, so the camera is usable immediately.
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

let loading: Promise<any | null> | null = null;
let instance: any | null = null;

export const getCv = () => instance;

export function loadOpenCv(): Promise<any | null> {
  if (instance) return Promise.resolve(instance);
  return (loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = OPENCV_URL;
    s.onerror = () => { loading = null; resolve(null); };   // offline: stay on the JS fallback, retry later
    s.onload = () => {
      // opencv.js exposes `cv` as a thenable in some builds; awaiting it can recurse forever, so poll instead.
      const t0 = performance.now();
      const poll = () => {
        const cv = (window as any).cv;
        if (cv && cv.Mat && cv.imread) { instance = cv; resolve(cv); }
        else if (performance.now() - t0 > 60_000) { loading = null; resolve(null); }
        else setTimeout(poll, 60);
      };
      poll();
    };
    document.head.appendChild(s);
  }));
}
