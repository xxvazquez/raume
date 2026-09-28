// "Write it" -- stroke-order writing practice for one kanji, from the Kanji
// section's detail sheet (RaumeStudy.kanjiWrite). The sheet turns into a
// writing pad: draw each stroke in order with a finger or the mouse; a right
// stroke snaps to its clean KanjiVG line in its stroke-order colour, a wrong
// one shakes the pad and counts a miss, and after three misses on one stroke
// that stroke is shown as a hint. Practice only -- nothing here touches FSRS.
//
// Judging needs only KanjiVG's centre-lines (data/kanji-strokes.js): the
// drawn stroke and the expected one are both resampled to N evenly spaced
// points and compared -- the start and end must be near the right start and
// end (a stroke drawn backwards fails), and the average distance along the
// whole stroke must be small (so hooks and bends count, not just the ends).
// The parser and judge are pure functions, exported for the smoke tests.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.kanjiWrite = (function () {
  "use strict";

  var N = 24;          // points each stroke is resampled to
  var TOL = 14;        // in KanjiVG units (the grid is 109 wide): ~13% of the box
  var HINT_AFTER = 3;  // misses on one stroke before its hint shows

  // --- Paths: KanjiVG uses M, C/c and S/s only ---------------------------
  function parsePath(d) {
    var tokens = String(d).match(/[MmCcSsLl]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    var pts = [], i = 0, cmd = "", x = 0, y = 0, cx2 = 0, cy2 = 0, prev = "";
    function num() { return parseFloat(tokens[i++]); }
    function cubic(x1, y1, x2, y2, x3, y3) {
      for (var t = 1; t <= 8; t++) {
        var u = t / 8, v = 1 - u;
        pts.push([v * v * v * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
          v * v * v * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
      }
      cx2 = x2; cy2 = y2; x = x3; y = y3;
    }
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      var rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      if (cmd === "M" || cmd === "m") {
        x = ox + num(); y = oy + num(); pts.push([x, y]);
        cmd = rel ? "l" : "L";
      } else if (cmd === "L" || cmd === "l") {
        x = ox + num(); y = oy + num(); pts.push([x, y]); cx2 = x; cy2 = y;
      } else if (cmd === "C" || cmd === "c") {
        var a = [num(), num(), num(), num(), num(), num()];
        cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]);
      } else if (cmd === "S" || cmd === "s") {
        var b = [num(), num(), num(), num()];
        // The first control point mirrors the previous curve's second one.
        var mx = /[CcSs]/.test(prev) ? 2 * x - cx2 : x, my = /[CcSs]/.test(prev) ? 2 * y - cy2 : y;
        cubic(mx, my, ox + b[0], oy + b[1], ox + b[2], oy + b[3]);
      } else { i++; }
      prev = cmd;
    }
    return pts;
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function length(pts) { var l = 0; for (var i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]); return l; }
  // n points evenly spaced along the polyline.
  function resample(pts, n) {
    if (!pts.length) return [];
    if (pts.length === 1) { var out1 = []; for (var k = 0; k < n; k++) out1.push(pts[0].slice()); return out1; }
    var total = length(pts), step = total / (n - 1), out = [pts[0].slice()], acc = 0;
    var prev = pts[0];
    for (var i = 1; i < pts.length && out.length < n; i++) {
      var cur = pts[i], seg = dist(prev, cur);
      while (seg > 0 && acc + seg >= step * out.length - 1e-9 && out.length < n) {
        var t = (step * out.length - acc) / seg;
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      }
      acc += seg;
      prev = cur;
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out;
  }

  // { ok, reason: "short" | "reversed" | "start" | "end" | "shape" }
  function judge(drawn, expectedD) {
    var exp = parsePath(expectedD);
    // Lengths measured on the resampled lines, so a shaky hand's zigzag
    // doesn't read as a stroke twice as long.
    var eLen = length(resample(exp, N)), dLen = drawn.length > 1 ? length(resample(drawn, N)) : 0;
    // A tap is only right for a dot-sized stroke.
    if (drawn.length < 2 || dLen < Math.min(8, eLen * 0.5)) {
      if (eLen > 14) return { ok: false, reason: "short" };
    }
    if (dLen > Math.max(eLen * 2.6, 30)) return { ok: false, reason: "shape" };
    var a = resample(drawn, N), b = resample(exp, N);
    var tolEnd = TOL * 1.3;
    var startD = dist(a[0], b[0]), endD = dist(a[N - 1], b[N - 1]);
    if (startD > tolEnd || endD > tolEnd) {
      if (dist(a[0], b[N - 1]) < tolEnd && dist(a[N - 1], b[0]) < tolEnd) return { ok: false, reason: "reversed" };
      return { ok: false, reason: startD > tolEnd ? "start" : "end" };
    }
    // Overall direction: a short stroke drawn backwards can still land its
    // ends inside the tolerance, so the start-to-end headings must agree.
    var ex = b[N - 1][0] - b[0][0], ey = b[N - 1][1] - b[0][1];
    var dx = a[N - 1][0] - a[0][0], dy = a[N - 1][1] - a[0][1];
    var el = Math.hypot(ex, ey), dl = Math.hypot(dx, dy);
    if (el > 10 && dl > 4 && (ex * dx + ey * dy) / (el * dl) < 0.2) return { ok: false, reason: "reversed" };
    var sum = 0;
    for (var i = 0; i < N; i++) sum += dist(a[i], b[i]);
    return sum / N <= TOL ? { ok: true } : { ok: false, reason: "shape" };
  }

  // --- The pad -------------------------------------------------------------
  function esc(s) { return window.RaumeStudy.shared.escapeHtml(String(s)); }
  function strokesFor(ch) { var k = (window.RaumeStudy.data.kanjiStrokes || {})[ch]; return k ? k.p : null; }
  function rowFor(vocabId) {
    var tables = window.RaumeStudy.data.vocabularyTables || [];
    for (var i = 0; i < tables.length; i++) {
      for (var j = 0; j < tables[i].rows.length; j++) {
        if (tables[i].rows[j].id === vocabId) return { row: tables[i].rows[j], table: tables[i], at: j };
      }
    }
    return null;
  }
  // The next kanji in the same theme that has stroke data (wrapping round).
  function nextKanjiId(vocabId) {
    var hit = rowFor(vocabId);
    if (!hit) return null;
    var rows = hit.table.rows;
    for (var k = 1; k <= rows.length; k++) {
      var r = rows[(hit.at + k) % rows.length];
      if (r.type === "kanji" && strokesFor(r.jp[0].kanji)) return r.id;
    }
    return null;
  }

  var BACK_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3.5 5.5 9l5.5 5.5"/></svg>';
  var CLOSE_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
  var st = null;

  function reducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function soClass(i) { return "so-" + Math.min(i + 1, 20); }
  function doneStrokeHtml(i) {
    return '<path class="kw-stroke ' + soClass(i) + '" d="' + esc(st.strokes[i]) + '"/>';
  }

  function viewHtml() {
    var total = st.strokes.length;
    var guide = st.strokes.map(function (d) { return '<path d="' + esc(d) + '"/>'; }).join("");
    var done = "";
    for (var i = 0; i < st.i; i++) done += doneStrokeHtml(i);
    var finished = st.i >= total;
    var status = finished
      ? '<div class="kw-finish" role="status"><p class="kw-finish-big">' + total + " / " + total + " strokes</p>" +
        '<p class="kw-finish-meta">' + (st.misses ? st.misses + (st.misses === 1 ? " miss" : " misses") : "Clean run — no misses") + "</p>" +
        '<div class="kw-finish-actions"><button type="button" class="fc-btn kw-again">Again</button>' +
        (nextKanjiId(st.vocabId) ? '<button type="button" class="fc-btn fc-btn-primary kw-next">Next kanji</button>' : "") + "</div></div>"
      : '<p class="kw-status" aria-live="polite">Stroke ' + (st.i + 1) + " of " + total +
        (st.misses ? ' <span class="kw-misses">· ' + st.misses + (st.misses === 1 ? " miss" : " misses") + "</span>" : "") + "</p>";
    return '<div class="ks-grab" aria-hidden="true"></div>' +
      '<div class="kw-top"><button type="button" class="kw-back">' + BACK_ICON + "Back</button>" +
      '<h2 class="kw-title" id="kanjiSheetTitle">Write <span lang="ja">' + esc(st.ch) + "</span></h2>" +
      '<button type="button" class="ks-close" aria-label="Close">' + CLOSE_ICON + "</button></div>" +
      '<div class="ks-card kw-card">' +
      '<div class="kw-pad-wrap"><svg class="kw-pad' + (st.outline ? " kw-outline" : "") + (finished ? " kw-finished" : "") +
      '" viewBox="0 0 109 109" role="img" aria-label="Writing pad for ' + esc(st.ch) + '">' +
      '<g class="kw-grid"><path d="M54.5 4v101M4 54.5h101"/></g>' +
      '<g class="kw-guide">' + guide + "</g>" +
      '<g class="kw-done">' + done + "</g>" +
      '<g class="kw-hint"></g>' +
      '<path class="kw-live" d=""/></svg></div>' + status + "</div>" +
      '<div class="ks-card">' +
      '<label class="ks-row kw-switch-row"><span class="ks-label">Outline</span>' +
      '<input type="checkbox" class="set-switch kw-outline-switch"' + (st.outline ? " checked" : "") + "></label></div>" +
      // Undo / Clear only while writing -- the finish card has its own actions.
      (finished ? "" : '<div class="kw-actions">' +
        '<button type="button" class="fc-btn kw-undo"' + (st.i ? "" : " disabled") + ">Undo</button>" +
        '<button type="button" class="fc-btn kw-clear"' + (st.i ? "" : " disabled") + ">Clear</button></div>");
  }

  function render() {
    st.sheet.innerHTML = viewHtml();
    wire();
  }

  function toGrid(svg, e) {
    var r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) / (r.width || 1) * 109, (e.clientY - r.top) / (r.height || 1) * 109];
  }
  function polyD(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
  }

  // Hand a stroke to the judge: the one the reader drew, or (for the smoke
  // tests) any list of grid points.
  function submit(pts) {
    if (!st || st.i >= st.strokes.length) return null;
    var verdict = judge(pts, st.strokes[st.i]);
    if (verdict.ok) {
      st.i++;
      st.onStroke = 0;
      render();
    } else {
      st.misses++;
      st.onStroke++;
      var wrap = st.sheet.querySelector(".kw-pad-wrap");
      if (wrap && !reducedMotion()) {
        wrap.classList.remove("kw-miss"); void wrap.offsetWidth; wrap.classList.add("kw-miss");
      }
      var status = st.sheet.querySelector(".kw-status");
      if (status) status.innerHTML = "Stroke " + (st.i + 1) + " of " + st.strokes.length +
        ' <span class="kw-misses">· ' + st.misses + (st.misses === 1 ? " miss" : " misses") + "</span>";
      if (st.onStroke >= HINT_AFTER) showHint();
    }
    return verdict;
  }
  // The stroke they're stuck on, drawn for them (animated unless reduced
  // motion), then faded -- they still have to draw it themselves.
  function showHint() {
    var g = st.sheet.querySelector(".kw-hint");
    if (!g) return;
    g.innerHTML = '<path class="kw-hint-stroke ' + soClass(st.i) + '" pathLength="1" d="' + esc(st.strokes[st.i]) + '"/>';
    var shownFor = st.i;
    setTimeout(function () { if (st && st.i === shownFor && g.isConnected) g.innerHTML = ""; }, 1800);
  }

  function wire() {
    var sheet = st.sheet, svg = sheet.querySelector(".kw-pad"), live = sheet.querySelector(".kw-live");
    var pts = null, pointer = null;
    svg.addEventListener("pointerdown", function (e) {
      if (st.i >= st.strokes.length) return;
      e.preventDefault();
      pointer = e.pointerId;
      try { svg.setPointerCapture(pointer); } catch (err) { /* ignore */ }
      pts = [toGrid(svg, e)];
      live.setAttribute("d", polyD(pts));
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pts || e.pointerId !== pointer) return;
      var p = toGrid(svg, e);
      if (dist(p, pts[pts.length - 1]) < 0.8) return;
      pts.push(p);
      live.setAttribute("d", polyD(pts));
    });
    function end(e) {
      if (!pts || e.pointerId !== pointer) return;
      var drawn = pts;
      pts = null;
      live.setAttribute("d", "");
      submit(drawn);
    }
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", function () { pts = null; live.setAttribute("d", ""); });
    sheet.querySelector(".kw-outline-switch").addEventListener("change", function () {
      st.outline = this.checked;
      try { localStorage.setItem(OUTLINE_KEY, st.outline ? "1" : "0"); } catch (err) { /* ignore */ }
      svg.classList.toggle("kw-outline", st.outline);
    });
    var undo = sheet.querySelector(".kw-undo"), clear = sheet.querySelector(".kw-clear");
    if (undo) undo.addEventListener("click", function () { if (st.i) { st.i--; st.onStroke = 0; render(); } });
    if (clear) clear.addEventListener("click", function () { st.i = 0; st.onStroke = 0; render(); });
    sheet.querySelector(".kw-back").addEventListener("click", function () { var back = st.onBack, id = st.vocabId; st = null; back(id); });
    var again = sheet.querySelector(".kw-again");
    if (again) again.addEventListener("click", function () { start(st.sheet, st.vocabId, st.onBack); });
    var next = sheet.querySelector(".kw-next");
    if (next) next.addEventListener("click", function () { start(st.sheet, nextKanjiId(st.vocabId), st.onBack); });
  }

  // The Outline choice is remembered on this device (on by default: trace
  // first, then switch it off for the real test).
  var OUTLINE_KEY = "raume-kanji-write-outline";
  function outlinePref() {
    try { return localStorage.getItem(OUTLINE_KEY) !== "0"; } catch (e) { return true; }
  }
  // Opens the pad in the kanji sheet. onBack(vocabId) puts the sheet back.
  function start(sheet, vocabId, onBack) {
    var hit = rowFor(vocabId);
    var ch = hit && hit.row.type === "kanji" ? hit.row.jp[0].kanji : null;
    var strokes = ch && strokesFor(ch);
    if (!strokes) return false;
    st = { sheet: sheet, vocabId: vocabId, ch: ch, strokes: strokes, i: 0, misses: 0, onStroke: 0, outline: outlinePref(), onBack: onBack };
    render();
    var back = sheet.querySelector(".kw-back");
    if (back) back.focus();
    return true;
  }
  function isOpen() { return !!st; }
  function close() { st = null; }

  return {
    parsePath: parsePath, resample: resample, judge: judge, nextKanjiId: nextKanjiId,
    open: start, submit: submit, isOpen: isOpen, close: close, OUTLINE_KEY: OUTLINE_KEY
  };
})();
