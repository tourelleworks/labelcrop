// Service Worker – network-first: online kommt immer die aktuelle Version,
// offline (oder als installierte App ohne Netz) die zuletzt geladene aus dem
// Cache. Gecacht werden nur die eigenen Dateien; PDFs des Nutzers berührt
// der Service Worker nie (sie laufen über Blob-URLs, nicht über fetch).
const CACHE_VERSION = "labelcrop-v2";   // bei jedem Release hochzählen
const FILES = [
  "index.html",
  "style.css",
  "app.js",
  "cropper.js",
  "profiles.js",
  "manifest.json",
  "vendor/pdf-lib.min.js",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "icons/favicon.svg",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Nur eigene GET-Anfragen behandeln.
  if (event.request.method !== "GET") { return; }
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) { return; }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) { return cached; }
          // Startseite unter "/" wurde vielleicht nie direkt gecacht – dann index.html nehmen.
          if (event.request.mode === "navigate") { return caches.match("index.html"); }
          return Response.error();
        })
      )
  );
});
