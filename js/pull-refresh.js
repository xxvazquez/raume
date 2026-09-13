// Global pull-to-refresh (touch only): pulling down at the very top of any
// page reloads it -- the same "everything's current now" a native app's
// pull-to-refresh gives you, not a background ping that leaves the page as
// it was. A plain reload already gets both halves on its own: sw.js's
// navigation handler is network-first, so it fetches whatever's actually
// deployed right now (a new git push included) instead of a cached shell;
// and that fresh page's own normal boot flow re-fetches a signed-in
// account's data from Supabase the same way every load already does. So
// this only needs to drive the gesture + a short "Refreshing…" hold, plus a
// best-effort nudge at the service worker so its own precache is current
// too (offline support for whatever just got fetched, not just this load).
//
// A known v1 limitation: this only checks the *document's* scroll position,
// not whether the touch started inside some nested scrollable panel (the
// mobile table-index sheet, a horizontally-scrolled table). Pulling down
// from inside one of those, while the page itself is scrolled to the top,
// will hijack the gesture. Accepted for now rather than special-casing
// every nested scroll area in the app.
window.RaumeStudy = window.RaumeStudy || {};
(function () {
  "use strict";

  var THRESHOLD = 64; // px of pull before release triggers a refresh
  var HOLD_MS = 500;  // minimum "Refreshing…" time before reload, so it never just flashes

  var startY = null;
  var state = "idle"; // idle | pulling | ready | busy
  var bar = null, textEl = null;

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "pull-refresh";
    bar.innerHTML =
      '<span class="pull-refresh-spinner" aria-hidden="true"></span>' +
      '<span class="pull-refresh-text" role="status" aria-live="polite"></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    textEl = bar.querySelector(".pull-refresh-text");
    return bar;
  }

  function setState(next, label) {
    state = next;
    ensureBar();
    bar.className = "pull-refresh" + (next === "idle" ? "" : " pull-refresh-" + next);
    textEl.textContent = label || "";
  }

  function onTouchStart(e) {
    // Ignore a new gesture while a refresh is already in flight (busy) --
    // the page is about to reload out from under it regardless.
    if (window.scrollY > 0 || e.touches.length !== 1 || state === "busy") {
      startY = null;
      return;
    }
    startY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (startY == null) return;
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) {
      startY = null;
      if (state === "pulling" || state === "ready") setState("idle");
      return;
    }
    // Only now is this clearly a downward pull at the top -- safe to take
    // over from the browser's own scroll/bounce for this gesture.
    e.preventDefault();
    setState(dy >= THRESHOLD ? "ready" : "pulling", dy >= THRESHOLD ? "Release to refresh" : "Pull to refresh");
  }

  function onTouchEnd() {
    if (state === "ready") runRefresh();
    else if (state === "pulling") setState("idle");
    startY = null;
  }

  function runRefresh() {
    setState("busy", "Refreshing…");
    // Best-effort: forces the browser to re-check sw.js right now instead of
    // waiting for its normal (up to 24h) background check, so a just-pushed
    // deploy's assets are precached for offline use too, not only fetched
    // for this one load. Never blocks the reload below on it -- the
    // network-first navigation fetch gets the latest page either way.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration()
        .then(function (reg) { if (reg) reg.update(); })
        .catch(function () {});
    }
    setTimeout(function () { window.location.reload(); }, HOLD_MS);
  }

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
})();
