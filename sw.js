/* =========================================================
   KLIPIN — sw.js
   Minimal service worker: caches the static app shell for
   faster repeat loads. Never intercepts /api requests, so the
   downloader always hits the network directly.
   ========================================================= */

var CACHE_NAME = "klipin-cache-v1";
var APP_SHELL = [
  "/",
  "/cara-penggunaan",
  "/larangan",
  "/adm",
  "/css/style.css",
  "/js/main.js",
  "/js/theme.js",
  "/js/pwa.js",
  "/js/adm.js",
  "/manifest.json",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        // Some assets (e.g. fonts not yet added) may fail; don't block install.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Never cache or intercept API calls — downloader must always be live.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      return fetch(event.request)
        .then(function (response) {
          if (response && response.status === 200) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
    })
  );
});
