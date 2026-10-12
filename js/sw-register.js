// Registers the service worker for offline support and PWA installability
// on Android/Chrome (and, at the bottom, asks for persistent storage).
// Split out from app.js so the main app logic stays untouched by this. iOS Safari ignores service-worker-based install
// prompts but still benefits from the offline caching once a page is
// visited, and "Add to Home Screen" there is driven by the manifest +
// apple-touch-icon/meta tags in index.html instead.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {
      // Offline support is a progressive enhancement -- if registration
      // fails (unsupported browser, blocked, etc.) the site still works.
    });
  });
}

// Everything a guest has -- and a signed-in reader's not-yet-synced changes --
// lives in this site's storage. Ask the browser to keep it rather than clear
// it when the device runs low on space (granted silently to an installed
// app in Chrome and Safari; elsewhere it may simply be declined).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then(function (kept) {
    if (!kept) return navigator.storage.persist();
  }).catch(function () {});
}
