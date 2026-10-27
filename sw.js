// Service worker: makes the whole site work offline after the first visit.
// Strategy: precache every file on install; serve from cache first, refresh the cache in the background.
// Bump CACHE when files change so returning users get the new version.
const CACHE = "makan-v9";
const FILES = [
  "./", "index.html", "app.html", "game.html", "toolkit.html", "manifest.webmanifest",
  "css/layout.css", "css/workspace.css", "css/experience.css", "css/refined.css", "css/base.css", "css/app.css", "css/landing.css", "css/print.css",
  "js/tour.js", "js/foodart.js", "js/collection.js", "js/main.js", "js/icons.js", "js/foods.js", "js/storage.js", "js/week.js", "js/sim.js", "js/report.js",
  "js/planner.js", "js/checkin.js", "js/receipt.js", "js/classcode.js", "js/stalls.js", "js/realweek.js", "js/tools.js", "js/knowledge.js", "js/makan.js", "js/makanui.js", "js/app.js",
  "assets/food/kopitiam-hero.png", "assets/fonts/inter-latin-wght-normal.woff2", "assets/fonts/bricolage-grotesque-latin-wght-normal.woff2",
  "assets/fonts/ibm-plex-mono-latin-400-normal.woff2", "assets/fonts/ibm-plex-mono-latin-600-normal.woff2",
  "assets/favicon/favicon.svg?v=1.6.0", "assets/favicon/favicon.png?v=1.6.0", "assets/icons/app-192.png?v=1.6.0",
  "assets/favicon/favicon.svg", "assets/favicon/favicon.png", "assets/icons/app-192.png", "assets/icons/app-512.png"
];

// Files fetched only when needed (the OCR engine is 7 MB): cached the first time they are used.
const LAZY = /\/vendor\//;
const VENDOR_CACHE = "eft-vendor-1"; // kept across app versions: the libraries change rarely

if (typeof self !== "undefined") self.addEventListener("install", event => {
  // cache: "reload" skips the browser's HTTP cache, so a new version never precaches old files
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => { if (!self.registration.active) return self.skipWaiting(); })); // first install: take over at once
});

// An update waits until the page's "Reload now" banner asks for it
if (typeof self !== "undefined") self.addEventListener("message", event => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});

if (typeof self !== "undefined") self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== VENDOR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

if (typeof self !== "undefined") self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached && LAZY.test(req.url)) return cached; // big, versioned libraries: no background refresh
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(LAZY.test(req.url) ? VENDOR_CACHE : CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached || (req.mode === "navigate" ? caches.match("app.html") : undefined));
      return cached || network;
    })
  );
});

if (typeof module !== "undefined") module.exports = { FILES, CACHE, VENDOR_CACHE };
