// Runs in <head>, before first paint, so the page never flashes the wrong
// theme. Two attributes on <html>: data-theme-choice is what the user picked
// ("system" | "light" | "dark"; absent storage = system), data-theme is the
// resolved light/dark that the CSS actually keys off. The rest of the theme
// logic (the toggle, live OS-change following, persistence) lives in
// js/vocab/interactions.js.
(function () {
  "use strict";
  var choice;
  try {
    // js/storage-migration.js (the <head> script before this one) has already
    // moved this off the old "sakura-theme" name if it was there.
    choice = window.localStorage && localStorage.getItem("raume-theme");
  } catch (e) { choice = null; }
  if (choice !== "light" && choice !== "dark") choice = "system";
  var resolved = choice === "system"
    ? ((window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light")
    : choice;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-choice", choice);
})();

// iOS Safari zooms the page whenever a text field under 16px gets focus,
// which used to force every field in the app up to 16px -- bigger than the
// 14px text around it. maximum-scale=1 turns that auto-zoom off; since iOS 10
// Safari ignores it for the user's own pinch-zoom, so zooming stays
// available. Added on iOS only: elsewhere maximum-scale can block pinch-zoom,
// and nothing else auto-zooms on focus anyway.
(function () {
  "use strict";
  var ua = navigator.userAgent || "";
  var iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!iOS) return;
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta && !/maximum-scale/.test(meta.content)) meta.content += ",maximum-scale=1";
})();
