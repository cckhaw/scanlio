import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg', 'oauth-callback.html', 'privacy.html', 'terms.html'],
      workbox: {
        importScripts: ['sw-sync.js'],
        navigateFallbackDenylist: [/^\/oauth-callback\.html/, /^\/privacy/, /^\/terms/],
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
        start_url: '/',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Scan', url: '/?tab=scan' }, { name: 'Library', url: '/?tab=library' }],
      },
    }),
  ],
});
