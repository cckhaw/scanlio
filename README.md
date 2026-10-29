# Scanlio — Paper Scanner PWA

Mobile-first document scanner: live edge detection, auto-capture, perspective crop with a magnifier loupe,
scan filters, multi-page decks, offline-first IndexedDB storage, background OCR search, PDF export and
cloud sync to **Google Drive**, **OneDrive** and **iCloud Drive** — styled after Apple's HIG with Light/Dark/System themes.

Stack: React 18 · Vite · TypeScript · Tailwind CSS 3 · `idb` · `pdf-lib` · `tesseract.js` · OpenCV.js (lazy CDN) · `vite-plugin-pwa`.

## Setup

```bash
npm install
cp .env.example .env      # OAuth client IDs: build-time configuration only (set as env vars in Vercel for production)
npm run dev               # camera needs HTTPS or localhost
npm run build && npm run preview
```

Camera access requires a secure context (`localhost` or HTTPS). To test on a phone, deploy (e.g. Vercel) or use an HTTPS tunnel.

### Cloud provider configuration

| Provider | What to create | Notes |
|---|---|---|
| Google Drive | Google Cloud → OAuth client (Web). Authorised JS origin = your app origin. Enable the Drive API. Optional: enable the **Picker API** and create an API key (`VITE_GOOGLE_API_KEY`) so users can choose any existing folder. | GIS token client, scope `drive.file`. Without the API key, the in-app folder browser only shows folders Scanlio created; default folder is `Scanlio`. |
| OneDrive | Azure → App registration, platform **SPA**, redirect URI `<origin>/oauth-callback.html`. Permissions: `Files.ReadWrite`, `offline_access`. | Auth-code + PKCE; in-app folder browser; chunked upload sessions. Default folder `Scanlio`. |
| iCloud Drive | Nothing to register (Apple has no web upload API). | Chromium: pick your iCloud Drive folder once (File System Access API). iOS/Safari: native share sheet → *Save to Files › iCloud Drive*; needs a tap, so it is completed from the document's **Share** button. |

## Routes

- `/` — static marketing/landing page (`index.html`, no JS, no login) — used for OAuth brand verification
- `/app` — the scanner PWA (`app.html`); opens on the Home tab, the camera starts only when you tap Scan
- `/privacy`, `/terms` — legal pages (`public/*.html`)

## Export & folders

Per save (and in Settings → Default export): **PDF / PNG / JPG**; for multi-page PDFs choose **one PDF** or **separate PDFs**; images are one file per page. Each cloud provider has its own destination folder (Google Picker / in-app browser, OneDrive browser, iCloud directory picker).

## Directory layout

```
public/
  oauth-callback.html     PKCE popup relay (postMessage to opener)
  sw-sync.js              Background Sync handler imported into the Workbox SW
  icon.svg, *.png         App icons (npm run icons regenerates the PNGs)
src/
  main.tsx, App.tsx       Providers + tab shell + save pipeline
  index.css               HIG colour tokens (CSS vars), glass / button / chip components
  theme/ThemeContext.tsx  Light / Dark / System, smooth transition, theme-color meta
  state/ScanSession.tsx   In-progress pages, rotate/reorder/delete, render pipeline
  cv/
    opencv.ts             Lazy OpenCV.js loader
    detect.ts             Quad detection (OpenCV Canny/contours, pure-JS Otsu fallback)
    warp.ts               Perspective warp (cv.warpPerspective or bilinear JS homography)
    filters.ts            Original · Color Doc · B&W Magic Scan · Grayscale · High Contrast
    geometry.ts           Corner ordering, homography solver, motion metric
  cloud/
    CloudStorageManager.ts  Provider registry + durable upload queue + retry/online/BG-sync
    google.ts onedrive.ts icloud.ts  Providers
  lib/  db.ts (idb) · pdf.ts · ocr.ts · image.ts · haptics.ts
  components/
    CameraScanner.tsx     Fullscreen viewport, HUD, auto-capture ring
    CropEditor.tsx        4-point warp editor with loupe
    FilterCarousel.tsx, PageTray.tsx (reorder + swipe-to-delete), Editor.tsx, SaveSheet.tsx
    Library.tsx, DocViewer.tsx, Settings.tsx, TabBar.tsx, BottomSheet.tsx, Toast.tsx
tailwind.config.js        HIG tokens → CSS variables, radii, easing, animations
```

## How the key pieces work

- **Auto-capture** – every ~110 ms a 360 px frame is analysed; the quad counts as stable while no corner drifts more than 1.8 % of the frame diagonal. After 1.5 s the shutter fires (a progress ring shows the countdown). It re-arms only once the document leaves or moves.
- **Offline-first** – saving writes the scan, PDF and thumbnail to IndexedDB before anything else; uploads are queue items that flush on `online`, tab focus, Background Sync wake-ups and a retry timer. OCR runs in the background (Tesseract fetches language data on first use; the service worker then caches it).
- **Tokens** live in `sessionStorage` only; Google/Microsoft sessions must be reconnected after the browser session ends, and queued items wait (flagged in Settings) until you do.

## Known limits

- OpenCV.js and Tesseract assets load from CDNs on first use; the app uses a pure-JS detector/warp until OpenCV is available.
- Torch/flash and vibration depend on browser support (Android Chrome; iOS Safari has neither, so animations stand in for haptics).
- iCloud on iOS cannot be uploaded to unattended — Apple requires a tap for the share sheet.
- OAuth flows (Google/Microsoft), OCR and Background Sync were not exercised end-to-end (they need real credentials/network); the scan → crop → filter → save → library path was smoke-tested in headless Chromium.
