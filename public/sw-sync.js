// Imported into the Workbox-generated service worker (see vite.config.ts).
// OAuth tokens live only in the page, so the SW can't upload by itself: on a
// Background Sync event it wakes any open client and asks it to flush the queue.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'scanlio-sync') return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'scanlio-flush-queue' }));
    })
  );
});
