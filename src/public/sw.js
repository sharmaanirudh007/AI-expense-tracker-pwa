const CACHE_NAME = 'ai-expense-tracker-v1.3.0'; // Increment this for each update
const STATIC_CACHE_NAME = 'ai-expense-tracker-static-v1.3.0';
const DYNAMIC_CACHE_NAME = 'ai-expense-tracker-dynamic-v1.3.0';
const BASE_PATH = '/AI-expense-tracker-pwa';

const STATIC_FILES = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/src/main.js`,
  `${BASE_PATH}/src/style.css`,
  `${BASE_PATH}/src/db.js`,
  `${BASE_PATH}/src/gemini.js`,
  `${BASE_PATH}/src/analyze.js`,
  `${BASE_PATH}/src/googleDrive.js`,
  `${BASE_PATH}/src/utils.js`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/favicon.svg`
];

// Install event - cache static files
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Skip waiting');
        return self.skipWaiting(); // Force activation of new SW
      })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches that don't match current version
          if (cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME &&
              cacheName.startsWith('ai-expense-tracker')) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim(); // Take control of all clients immediately
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request).then(fetchResponse => {
          // Cache dynamic content
          if (event.request.url.startsWith(self.location.origin)) {
            return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
              cache.put(event.request, fetchResponse.clone());
              return fetchResponse;
            });
          }
          return fetchResponse;
        });
      })
      .catch(() => {
        // Fallback for offline
        if (event.request.destination === 'document') {
          return caches.match(`${BASE_PATH}/index.html`);
        }
      })
  );
});

// Listen for update messages from main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
