// Madni EduManager — Service Worker v1.0
// PWA ke liye offline caching aur background sync

const CACHE_NAME = 'mdsi-cache-v1';
const OFFLINE_URL = '/';

// Ye files hamesha cache mein rahein
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Montserrat:wght@400;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Madni EduManager Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets...');
      // Main app file zaroor cache karo — baqi CDN files fail ho sakti hain
      return cache.add('/').catch(() => {
        console.log('[SW] Could not cache some assets, continuing...');
      });
    })
  );
  // Foran activate karo — wait mat karo
  self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Madni EduManager Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Purane cache delete karo
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Sabhi pages ko foran control karo
  self.clients.claim();
});

// ===== FETCH (Network First, Cache Fallback) =====
self.addEventListener('fetch', (event) => {
  // Sirf GET requests handle karo
  if (event.request.method !== 'GET') return;

  // Supabase API calls ko bypass karo — hamesha network se
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  // Chrome extensions ignore karo
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Network se mila — cache mein bhi save karo
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Sirf same-origin aur CDN resources cache karo
            if (
              event.request.url.startsWith(self.location.origin) ||
              event.request.url.includes('googleapis.com') ||
              event.request.url.includes('jsdelivr.net') ||
              event.request.url.includes('cloudflare.com')
            ) {
              cache.put(event.request, responseClone);
            }
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network fail — cache se do
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Cache mein bhi nahi — offline page do
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline - Data not available', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// ===== BACKGROUND SYNC (future use) =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-mdsi-data') {
    console.log('[SW] Background sync triggered');
    // Supabase sync aapka main app handle karta hai
  }
});

// ===== PUSH NOTIFICATIONS (future use) =====
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title || 'Madni EduManager', {
      body: data.body || 'Naya update!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      dir: 'rtl',
      lang: 'ur'
    });
  }
});
