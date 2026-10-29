import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `/` is the static marketing page; the scanner SPA lives at `/app` (app.html). Mirror Vercel's cleanUrls in dev.
const appRoute = (): Plugin => ({
  name: 'scanlio-app-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, qs] = (req.url ?? '').split('?');
      if (path === '/app') req.url = '/app.html' + (qs ? `?${qs}` : '');
      next();
    });
  },
});

export default defineConfig({
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app.html') } } },
  plugins: [
    appRoute(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg', 'oauth-callback.html', 'privacy.html', 'terms.html'],
      workbox: {
        importScripts: ['sw-sync.js'],
        navigateFallback: '/app.html',
        navigateFallbackAllowlist: [/^\/app/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // OpenCV.js + Tesseract assets: cache after first fetch so scanning works offline.
            urlPattern: /^https:\/\/(docs\.opencv\.org|cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'cv-ocr-assets', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      manifest: {
        name: 'Scanlio — Paper Scanner',
        short_name: 'Scanlio',
        description: 'Scan, enhance, OCR and sync paper documents to the cloud.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app',
        scope: '/',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Scan', url: '/app?tab=scan' }, { name: 'Library', url: '/app?tab=library' }],
      },
    }),
  ],
});
