// Service-worker offline test.
//
// jsdom has no Service Worker implementation, so this drives sw.js directly in
// a hand-rolled Worker global scope (fake `self` + Cache API, filesystem-backed
// `fetch`). It verifies the guarantee the PWA relies on:
//
//   fresh install -> SW precaches the versioned first-party shell
//   -> go offline -> the reference page and the Flashcards path still load
//   -> a redeploy (new ?v=) drops the old cache and does NOT serve it stale
//   -> with per-file content hashes stamped (scripts/stamp-asset-versions.js),
//      a redeploy downloads only the files that changed.
//
// No network and no dependencies. Direct file:// use does not involve a
// service worker at all and is verified separately (manually, in a browser).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ORIGIN = "https://raume.test";
const SCOPE = ORIGIN + "/";
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

let failures = 0;
function check(label, cond) {
  if (cond) console.log("  ok  " + label);
  else { console.error("  FAIL " + label); failures++; }
}

function resolveUrl(u) { return new URL(u, SCOPE).href; }

// Map an absolute request URL back to a file on disk (query string ignored for
// resolution only -- the cache still keys on the full URL). "/" -> index.html.
function fileFor(absUrl) {
  const p = new URL(absUrl).pathname.replace(/^\//, "");
  return path.join(ROOT, p === "" ? "index.html" : p);
}

// --- Fake Response -------------------------------------------------------
function makeResponse(body, ok) {
  return {
    ok: ok !== false,
    _body: body,
    clone() { return makeResponse(body, ok); },
    async text() { return body; },
  };
}

// --- Fake fetch (offline flag flips it to reject) -----------------------
let online = true;
let fetched = [];
const audioFetches = [];
// Files whose bytes a test pretends changed: served with this suffix.
const edited = new Set();
async function fakeFetch(input) {
  const url = typeof input === "string" ? resolveUrl(input) : input.url;
  if (!online) throw new Error("offline");
  fetched.push(url);
  const file = fileFor(url);
  // Pronunciation clips are real Responses (the worker slices byte ranges
  // out of them); asking for a range here would be a 206 the Cache API
  // refuses, so the worker must never send one.
  if (/\/audio\/.+\.mp3$/.test(url)) {
    audioFetches.push({ url, range: input && input.headers && input.headers.get ? input.headers.get("range") : null });
    return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200, headers: { "Content-Type": "audio/mpeg" } }) : new Response("", { status: 404 });
  }
  if (!fs.existsSync(file)) return makeResponse("", false);
  const body = fs.readFileSync(file, "utf8");
  return makeResponse(edited.has(path.relative(ROOT, file)) ? body + "\n// edited" : body, true);
}

// --- Fake Cache API ----------------------------------------------------
function keyOf(reqOrUrl) {
  const raw = typeof reqOrUrl === "string" ? reqOrUrl : reqOrUrl.url;
  return resolveUrl(raw);
}
class FakeCache {
  constructor() { this.entries = new Map(); }
  async addAll(urls) {
    for (const u of urls) {
      const res = await fakeFetch(u);
      if (!res.ok) throw new Error("addAll: request failed for " + u);
      this.entries.set(keyOf(u), res);
    }
  }
  async add(u) { await this.addAll([u]); }
  async put(req, res) { this.entries.set(keyOf(req), res); }
  async match(req) { return this.entries.get(keyOf(req)); }
}
class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }
  async keys() { return [...this.caches.keys()]; }
  async delete(name) { return this.caches.delete(name); }
  async match(req) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

// --- Load sw.js into a fresh worker scope, sharing one CacheStorage ----
function loadServiceWorker(version, cacheStorage, source) {
  const listeners = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const sandbox = { self, caches: cacheStorage, fetch: fakeFetch, URL, Promise, console, Response };
  vm.runInNewContext((source || SW_SOURCE).replace(/__CACHEBUST__/g, version), sandbox);

  function dispatch(type, event) {
    const fn = listeners[type];
    if (!fn) return event;
    fn(event);
    return event;
  }
  return {
    async install() {
      const waits = [];
      dispatch("install", { waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    },
    async activate() {
      const waits = [];
      dispatch("activate", { waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    },
    // Resolves to the served Response, or undefined if the SW either didn't
    // call respondWith or the response it produced rejected (e.g. a cache
    // miss while offline).
    async handleFetch(request) {
      let responded;
      dispatch("fetch", { request, respondWith: (p) => { responded = p; }, waitUntil: () => {} });
      if (responded === undefined) return undefined;
      try { return await responded; } catch (e) { return undefined; }
    },
  };
}

function navRequest() { return { url: SCOPE, mode: "navigate", method: "GET" }; }
function assetRequest(pathWithQuery) { return { url: resolveUrl(pathWithQuery), mode: "cors", method: "GET" }; }

// The versioned first-party shell, exactly as index.html requests it.
const REFERENCE_SHELL = [
  "js/storage-migration.js",
  "js/theme-init.js",
  "css/site.css",
  "data/vocabulary.js",
  "data/kanji-strokes.js",
  "js/config.js",
  "js/shared.js",
  "js/pull-refresh.js",
  "js/vocab/kana-romaji.js",
  "js/vocab/icons.js",
  "js/vocab/table-custom.js",
  "js/vocab/kanji-known.js",
  "js/vocab/icon-picker.js",
  "js/vocab/custom-vocab.js",
  "js/vocab/render.js",
  "js/vocab/interactions.js",
  "js/vocab/kanji-write.js",
  "js/vocab/customize.js",
  "js/sw-register.js",
  "vendor/ts-fsrs.js",
  "vendor/supabase.js",
];
const FLASHCARDS_SHELL = ["js/flashcards/store.js", "js/flashcards/vocab-index.js", "js/flashcards/scheduling.js", "js/flashcards/data-ops.js", "js/flashcards/backup.js", "js/flashcards/puzzle-runs.js", "js/flashcards/dashboard.js", "js/flashcards/views.js", "js/flashcards/kana-data.js", "js/flashcards/kana.js", "js/flashcards/crosswords.js", "js/flashcards/puzzle-pdf.js", "js/flashcards/puzzle-stats.js", "js/flashcards/bootstrap.js"];

async function main() {
  const V1 = "sha-one-0000000000000000000000000000000000";
  const storage = new FakeCacheStorage();

  console.log("Fresh install precaches the versioned shell");
  const sw1 = loadServiceWorker(V1, storage);
  await sw1.install();
  await sw1.activate();

  const cacheNames = await storage.keys();
  check("exactly one cache, named for this version", cacheNames.length === 1 && cacheNames[0] === "raume-" + V1);
  const cache = await storage.open("raume-" + V1);
  check("index.html is precached (unversioned key)", cache.entries.has(resolveUrl("index.html")));
  check("root navigation target is precached", cache.entries.has(resolveUrl("./")));
  check("every maskable/app icon is precached", ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"].every((i) => cache.entries.has(resolveUrl(i))));
  check("the dedicated favicon is precached (not the master art)", cache.entries.has(resolveUrl("favicon.png")) && !cache.entries.has(resolveUrl("logo.png")));
  check("manifest is precached", cache.entries.has(resolveUrl("manifest.webmanifest")));
  check("the self-hosted Inter font is precached (bare URL)", cache.entries.has(resolveUrl("fonts/InterVariable.woff2")));
  check("the self-hosted Space Grotesk wordmark font is precached (bare URL)", cache.entries.has(resolveUrl("fonts/SpaceGrotesk.woff2")));
  REFERENCE_SHELL.concat(FLASHCARDS_SHELL).forEach((p) => {
    check("precached under its exact ?v= URL: " + p, cache.entries.has(resolveUrl(p + "?v=" + V1)));
    check("NOT precached under a bare (unversioned) URL: " + p, !cache.entries.has(resolveUrl(p)));
  });

  console.log("Offline: the reference page loads from cache");
  online = false;
  const navRes = await sw1.handleFetch(navRequest());
  check("navigation falls back to the cached shell", navRes && (await navRes.text()).includes("<title>raume</title>"));
  for (const p of REFERENCE_SHELL) {
    const res = await sw1.handleFetch(assetRequest(p + "?v=" + V1));
    check("offline hit for reference asset: " + p, !!res && typeof (await res.text()) === "string");
  }

  console.log("Offline: the Flashcards path loads from cache");
  for (const p of FLASHCARDS_SHELL) {
    const res = await sw1.handleFetch(assetRequest(p + "?v=" + V1));
    check("offline hit for flashcards asset: " + p, !!res && (await res.text()).length > 0);
  }

  console.log("Redeploy: new version replaces the old cache, no stale hits");
  online = true;
  const V2 = "sha-two-1111111111111111111111111111111111";
  const sw2 = loadServiceWorker(V2, storage);
  await sw2.install();
  await sw2.activate();
  const namesAfter = await storage.keys();
  check("old deploy's cache is deleted on activate", namesAfter.length === 1 && namesAfter[0] === "raume-" + V2);
  check("new cache holds the new versioned URLs", (await storage.open("raume-" + V2)).entries.has(resolveUrl("js/vocab/render.js?v=" + V2)));

  online = false;
  const staleRes = await sw2.handleFetch(assetRequest("js/vocab/render.js?v=" + V1));
  check("a request for the PREVIOUS ?v= URL misses (no ignoreSearch staleness)", staleRes === undefined);
  const freshRes = await sw2.handleFetch(assetRequest("js/vocab/render.js?v=" + V2));
  check("a request for the CURRENT ?v= URL still hits offline", !!freshRes);

  console.log("Per-file hashes: a redeploy downloads only what changed");
  online = true;
  const { stamp } = require("./stamp-asset-versions.js");
  const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const readAsset = (p) => (edited.has(p) ? fs.readFileSync(path.join(ROOT, p), "utf8") + "\n// edited" : fs.readFileSync(path.join(ROOT, p)));
  const deployA = stamp(INDEX_SOURCE, SW_SOURCE, readAsset);
  const pageUrls = (html) => [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => m[1]);
  check("every asset URL the stamped page requests carries a content hash, none the token", pageUrls(deployA.html).length === REFERENCE_SHELL.length + FLASHCARDS_SHELL.length
    && pageUrls(deployA.html).every((u) => /\?v=[0-9a-f]{12}$/.test(u)));
  const H1 = "sha-hash-a000000000000000000000000000000000";
  const swA = loadServiceWorker(H1, storage, deployA.sw);
  await swA.install();
  await swA.activate();
  const cacheA = await storage.open("raume-" + H1);
  check("the worker precaches exactly the URLs the stamped page requests", pageUrls(deployA.html).every((u) => cacheA.entries.has(resolveUrl(u))));

  edited.add("js/vocab/render.js");
  const deployB = stamp(INDEX_SOURCE, SW_SOURCE, readAsset);
  check("editing one file changes only its URL", deployB.versions["js/vocab/render.js"] !== deployA.versions["js/vocab/render.js"]
    && Object.keys(deployA.versions).filter((p) => deployA.versions[p] !== deployB.versions[p]).length === 1);
  fetched = [];
  const H2 = "sha-hash-b111111111111111111111111111111111";
  const swB = loadServiceWorker(H2, storage, deployB.sw);
  await swB.install();
  await swB.activate();
  const versionedFetches = fetched.filter((u) => /\?v=/.test(u));
  check("the next install downloads only the changed file", versionedFetches.length === 1 && versionedFetches[0] === resolveUrl("js/vocab/render.js?v=" + deployB.versions["js/vocab/render.js"]));
  check("...the page itself is always fetched fresh", fetched.includes(resolveUrl("index.html")));
  check("...and the fonts come over from the previous cache", !fetched.includes(resolveUrl("fonts/InterVariable.woff2")));
  const cacheB = await storage.open("raume-" + H2);
  check("the new cache still holds every URL the new page requests", pageUrls(deployB.html).every((u) => cacheB.entries.has(resolveUrl(u))));
  online = false;
  const editedRes = await swB.handleFetch(assetRequest("js/vocab/render.js?v=" + deployB.versions["js/vocab/render.js"]));
  check("offline, the changed file is served in its new version", !!editedRes && (await editedRes.text()).endsWith("// edited"));
  check("the previous deploy's cache is gone", (await storage.keys()).length === 1);

  console.log("Pronunciation clips: cached whole, served by byte range");
  online = true;
  const audioStorage = new FakeCacheStorage();
  const swAudio = loadServiceWorker(V2, audioStorage);
  const clip = fs.readdirSync(path.join(ROOT, "audio")).find((f) => f.endsWith(".mp3"));
  const clipBytes = fs.readFileSync(path.join(ROOT, "audio", clip));
  const audioReq = (name, range) => ({ url: resolveUrl("audio/" + name), method: "GET", mode: "no-cors", headers: new Headers(range ? { Range: range } : {}) });
  const first = await swAudio.handleFetch(audioReq(clip, "bytes=0-"));
  check("a player's range request is answered 206 with the whole clip", !!first && first.status === 206
    && first.headers.get("Content-Range") === "bytes 0-" + (clipBytes.length - 1) + "/" + clipBytes.length
    && Buffer.from(await first.arrayBuffer()).equals(clipBytes));
  check("...fetched from the network without a Range header (a 206 can't be cached)", audioFetches.length === 1 && !audioFetches[0].range);
  await new Promise((r) => setTimeout(r, 0));
  check("...and cached whole in the audio cache", !!(await (await audioStorage.open("raume-audio-v1")).match(resolveUrl("audio/" + clip))));
  online = false;
  const part = await swAudio.handleFetch(audioReq(clip, "bytes=2-9"));
  check("offline, a later range is cut from the cached clip", !!part && part.status === 206
    && Buffer.from(await part.arrayBuffer()).equals(clipBytes.subarray(2, 10)));
  const whole = await swAudio.handleFetch(audioReq(clip));
  check("...and a plain request gets the whole clip", !!whole && whole.status === 200);
  online = true;
  const missing = await swAudio.handleFetch(audioReq("nope-not-a-clip.mp3", "bytes=0-"));
  await new Promise((r) => setTimeout(r, 0));
  check("a missing clip passes its 404 through and is never cached", !!missing && missing.status === 404
    && !(await (await audioStorage.open("raume-audio-v1")).match(resolveUrl("audio/nope-not-a-clip.mp3"))));

  console.log(failures === 0 ? "\nService-worker test passed." : "\n" + failures + " service-worker check(s) failed.");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
