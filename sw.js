const CACHE_NAME = 'cricket-dynasty-v1';
const STATIC_ASSETS = [
  '/',
  '/static/css/custom.css',
  '/static/js/dashboard.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let network handle API requests live
  if (e.request.url.includes('/api/')) {
    return;
  }
});