const CACHE_NAME = 'ai-expense-tracker-v1';
const BASE_PATH = '/AI-expense-tracker-pwa';
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/src/main.js`,
  `${BASE_PATH}/src/style.css`,
  `${BASE_PATH}/src/db.js`,
  `${BASE_PATH}/src/gemini.js`,
  `${BASE_PATH}/src/analyze.js`,
  `${BASE_PATH}/src/googleDrive.js`,
  `${BASE_PATH}/src/utils.js`,
  `${BASE_PATH}/favicon.svg`
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Activate service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
