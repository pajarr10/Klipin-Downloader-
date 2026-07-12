"use strict";

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
  "/manifest.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
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
  var req = event.request;

  // Never cache API requests — always go to network.
  if (req.url.indexOf("/api/") !== -1) {
    return;
  }

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkFetch = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var resClone = res.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, resClone);
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
      return cached || networkFetch;
    })
  );
});
