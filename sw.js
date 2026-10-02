// Offline / installability layer for the PWA.
//
// VERSION is stamped with the commit SHA at deploy time (see
// .github/workflows/pages.yml) and names the cache, so activating a new
// deploy drops the previous deploy's cache -- no unbounded growth.
// ASSET_VERSIONS is stamped just before it by scripts/stamp-asset-versions.js:
// each versioned file's content hash, the same ?v= index.html requests it
// with. Every such asset is precached under that *exact* URL, so a cache hit
// is always the right bytes (no ignoreSearch), and a file that didn't change
// keeps its URL -- install copies it over from the previous deploy's cache
// instead of downloading it again. In a checkout the map is empty and every
// file falls back to VERSION, matching index.html's literal token.
const VERSION = '__CACHEBUST__';
const ASSET_VERSIONS = /*__ASSET_VERSIONS__*/{};
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

// Requested by the browser WITH ?v=<hash> (see the <script>/<link> tags in
// index.html). Cached under the exact versioned URL. Keep this list in sync
// with index.html whenever a first-party script or stylesheet is added.
const VERSIONED = [
  'js/storage-migration.js',
  'js/theme-init.js',
  'css/site.css',
  'data/vocabulary.js',
  'data/kanji-strokes.js',
  'js/config.js',
  'js/shared.js',
  'js/pull-refresh.js',
  'js/vocab/kana-romaji.js',
  'js/vocab/icons.js',
  'js/vocab/table-custom.js',
  'js/vocab/kanji-known.js',
  'js/vocab/icon-picker.js',
  'js/vocab/custom-vocab.js',
  'js/vocab/render.js',
  'js/vocab/interactions.js',
  'js/vocab/kanji-write.js',
  'js/vocab/customize.js',
  'vendor/ts-fsrs.js',
  'vendor/supabase.js',
  'js/flashcards/store.js',
  'js/flashcards/vocab-index.js',
  'js/flashcards/scheduling.js',
  'js/flashcards/data-ops.js',
  'js/flashcards/backup.js',
  'js/flashcards/puzzle-runs.js',
  'js/flashcards/dashboard.js',
  'js/flashcards/views.js',
  'js/flashcards/kana-data.js',
  'js/flashcards/kana.js',
  'js/flashcards/crosswords.js',
  'js/flashcards/puzzle-pdf.js',
  'js/flashcards/puzzle-stats.js',
  'js/flashcards/bootstrap.js',
  'js/sw-register.js',
];

const PRECACHE = UNVERSIONED.concat(VERSIONED.map((p) => p + '?v=' + (ASSET_VERSIONS[p] || VERSION)));
// Always downloaded fresh on install: the page itself names this deploy's
// asset URLs. Everything else that's already cached under the same URL is
// reused -- a versioned URL's bytes never change, and the unversioned icons
// and fonts are refreshed by stale-while-revalidate whenever they're used.
const ALWAYS_FETCH = ['./', 'index.html', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) =>
        (ALWAYS_FETCH.indexOf(url) !== -1 ? Promise.resolve(undefined) : caches.match(url))
          .then((hit) => (hit ? cache.put(url, hit) : cache.add(url)))
      )))
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

// Answers a Range request (bytes=start-end, either end optional) from a
// whole-file response with the 206 a media element expects; anything else
// -- no Range, an already-partial or failed response -- passes through.
function rangeOf(req, res) {
  const range = req.headers && req.headers.get && req.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || !res.ok || res.status === 206 || (m[1] === '' && m[2] === '')) return res;
  return res.blob().then((blob) => {
    const size = blob.size;
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

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
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  if (url.pathname.indexOf('/audio/') !== -1 && url.pathname.endsWith('.mp3')) {
    // Cache-first with no revalidation: the hash in the filename guarantees
    // these bytes never change, so a cache hit never needs a network check.
    // An <audio> element asks for byte ranges, and the host answers those
    // with a 206 partial response the Cache API refuses to store -- so the
    // whole file is fetched (no Range) and cached instead, and the range the
    // player asked for is cut from it (WebKit won't play media without one).
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) => cache.match(url.href).then((cached) => cached || fetch(url.href).then((res) => {
        if (res.ok && res.status !== 206) cache.put(url.href, res.clone());
        return res;
      }))).then((res) => rangeOf(req, res))
    );
    return;
  }

  if (isVersioned) {
    // Cache-first, exact match (no ignoreSearch): the query string is the
    // file's content hash, so a cached hit is guaranteed to be the right
    // bytes -- across deploys too, for a file that didn't change.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Everything else (icons, logo, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
