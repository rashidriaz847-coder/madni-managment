// ============================================================
// Madni EduManager — Service Worker
// Version: 2.0
// Features: Offline cache, Background Sync to Supabase
// ============================================================

const CACHE_NAME = 'madni-edu-v2';
const SYNC_TAG = 'madni-sync-supabase';

// Files to cache for offline use
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Montserrat:wght@400;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// ─── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing v2...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local files — external CDN failures are OK
      return cache.addAll(['./index.html', './manifest.json']).catch(err => {
        console.warn('[SW] Some assets failed to cache (OK):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating v2...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH — Network First, Cache Fallback ──────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API calls: network only (don't cache DB responses)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Net nahi — 503 return karo taake app offline queue use kare
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Device is offline. Data saved locally.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Google Fonts & CDN: cache first
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // HTML / local files: Network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Offline fallback: return main app
          return caches.match('./index.html');
        });
      })
  );
});

// ─── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync triggered:', SYNC_TAG);
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    // Notify all open tabs to run sync
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({ type: 'SW_BACKGROUND_SYNC', tag: SYNC_TAG });
    });
    console.log('[SW] Sync message sent to', clients.length, 'client(s)');
  } catch (err) {
    console.warn('[SW] Background sync error:', err);
  }
}

// ─── PUSH NOTIFICATIONS (future use) ────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json().catch(() => ({ title: 'Madni EduManager', body: event.data.text() }));
  event.waitUntil(
    data.then(payload =>
      self.registration.showNotification(payload.title || 'Madni EduManager', {
        body: payload.body || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        dir: 'rtl',
        lang: 'ur',
        tag: 'madni-notif',
        renotify: true,
        data: payload.url || './'
      })
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || './')
  );
});

// ─── MESSAGE from main app ───────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'REGISTER_SYNC') {
    self.registration.sync.register(SYNC_TAG).catch(err =>
      console.warn('[SW] Could not register sync:', err)
    );
  }
});
