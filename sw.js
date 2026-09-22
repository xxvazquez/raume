// Offline / installability layer for the PWA.
//
// VERSION is stamped with the commit SHA at deploy time (the same
// __CACHEBUST__ replacement the deploy workflow applies to index.html -- see
// .github/workflows/pages.yml). Every first-party asset that index.html
// requests with a ?v=<sha> query is precached here under that *exact* URL, so
// a cache hit is always the right version and a redeploy's new URLs simply
// miss and refetch. The cache name carries VERSION too, so activating a new
// deploy drops the previous deploy's cache wholesale -- no stale entries, no
// unbounded growth, and no reliance on ignoreSearch.
const VERSION = '__CACHEBUST__';
const CACHE = 'raume-' + VERSION;
// Prerendered pronunciation clips (js/shared.js, scripts/generate-audio.js).
// Content-addressed by a hash of the text, so a given URL's bytes never
// change -- this cache is deliberately NOT tied to VERSION and survives a
// normal deploy instead of being dropped and re-downloaded every time.
const AUDIO_CACHE = 'raume-audio-v1';

// Requested by the browser WITHOUT a version query (navigation targets, the
// manifest, icons). Cached under their bare URLs.
const UNVERSIONED = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'fonts/InterVariable.woff2',
  'fonts/SpaceGrotesk.woff2',
];

// Requested by the browser WITH ?v=<sha> (see the <script>/<link> tags in
// index.html). Cached under the exact versioned URL. Keep this list in sync
// with index.html whenever a first-party script or stylesheet is added.
const VERSIONED = [
  'js/storage-migration.js',
  'js/theme-init.js',
  'css/site.css',
  'data/vocabulary.js',
  'js/config.js',
  'js/shared.js',
  'js/pull-refresh.js',
  'js/vocab/kana-romaji.js',
  'js/vocab/icons.js',
  'js/vocab/table-custom.js',
  'js/vocab/icon-picker.js',
  'js/vocab/custom-vocab.js',
  'js/vocab/render.js',
  'js/vocab/interactions.js',
  'js/vocab/customize.js',
  'vendor/ts-fsrs.js',
  'vendor/supabase.js',
  'js/flashcards/store.js',
  'js/flashcards/vocab-index.js',
  'js/flashcards/scheduling.js',
  'js/flashcards/data-ops.js',
  'js/flashcards/backup.js',
  'js/flashcards/dashboard.js',
  'js/flashcards/views.js',
  'js/flashcards/kana-data.js',
  'js/flashcards/kana.js',
  'js/flashcards/crosswords.js',
  'js/flashcards/bootstrap.js',
  'js/sw-register.js',
];

const PRECACHE = UNVERSIONED.concat(VERSIONED.map((p) => p + '?v=' + VERSION));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Every first-party asset (including both fonts) is same-origin and
  // precached above; the only cross-origin traffic left is the Supabase API
  // calls the account-sync path makes, which have to go straight to the
  // network regardless.
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === 'navigate';
  const isVersioned = url.searchParams.has('v');

  if (isNavigation) {
    // Network-first: always try to get the latest page (and therefore the
    // latest versioned asset URLs) when online; fall back to the cached
    // shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  if (url.pathname.indexOf('/audio/') !== -1 && url.pathname.endsWith('.mp3')) {
    // Cache-first with no revalidation: the hash in the filename guarantees
    // these bytes never change, so a cache hit never needs a network check.
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) => cache.match(req).then((cached) => cached || fetch(req).then((res) => {
        cache.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  if (isVersioned) {
    // Cache-first, exact match (no ignoreSearch): the query string changes
    // every deploy, so a cached hit is guaranteed to be the right version.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Everything else (icons, logo, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
