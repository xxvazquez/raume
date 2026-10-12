// Flashcards -- the English -> Writing card's pad (RaumeStudy.flashcards.writeCard).
//
// The review card shows the English; this writes the word in kana under it,
// one kana at a time on one square pad, with a row of squares above it -- one
// per kana -- that fill in as each is finished. Every stroke is judged the way
// the kanji sheet's Write it judges one (RaumeStudy.kanjiWrite.judge against
// KanjiVG's centre-lines, data/kana-strokes.js): a right stroke snaps to its
// clean line, a wrong one shakes the pad and counts a miss, and after three
// misses on one stroke that stroke is shown as a hint. No outline -- this is
// the test. Show answer gives up.
//
// It only writes; the review flow (dashboard.js) owns the session. The state
// is kept per card (`key`), so a re-render of the review mid-word puts the
// pad back exactly as it was.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.writeCard = (function () {
  "use strict";

  var HINT_AFTER = 3;  // misses on one stroke before its hint shows (as Write it)
  var kw = window.RaumeStudy.kanjiWrite;
  var esc = window.RaumeStudy.shared.escapeHtml;
  var st = null;
  // Once a pen has drawn on the pad, touches there are a resting palm, not
  // strokes -- for the rest of the visit.
  var penSeen = false;

  function strokesOf(ch) { var k = (window.RaumeStudy.data.kanaStrokes || {})[ch]; return k ? k.p : []; }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function soClass(i) { return "so-" + Math.min(i + 1, 20); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function statusText() {
    return "Kana " + (st.ci + 1) + " of " + st.chars.length +
      (st.misses ? ' <span class="kw-misses">· ' + plural(st.misses, "miss", "misses") + "</span>" : "");
  }
  function slotsHtml() {
    return '<div class="fcw-slots" role="list" aria-label="' + plural(st.chars.length, "kana", "kana") + '">' +
      st.chars.map(function (ch, i) {
        var written = i < st.ci, now = !st.finished && i === st.ci;
        return '<span role="listitem" lang="ja" class="fcw-slot' + (written ? " fcw-slot-done" : "") + (now ? " fcw-slot-now" : "") + '"' +
          (now ? ' aria-current="step"' : "") + ">" + (written ? esc(ch) : "") + "</span>";
      }).join("") + "</div>";
  }
  function padHtml() {
    var strokes = strokesOf(st.chars[st.ci]), done = "";
    for (var i = 0; i < st.si; i++) done += '<path class="kw-stroke ' + soClass(i) + '" d="' + esc(strokes[i]) + '"/>';
    return '<div class="kw-pad-wrap fcw-pad-wrap"><svg class="kw-pad fcw-pad" viewBox="0 0 109 109" role="img" aria-label="Writing pad, kana ' +
      (st.ci + 1) + " of " + st.chars.length + '">' +
      '<g class="kw-grid"><path d="M54.5 4v101M4 54.5h101"/></g>' +
      '<g class="kw-done">' + done + "</g>" +
      '<g class="kw-hint"></g>' +
      '<path class="kw-live" d=""/></svg></div>' +
      '<p class="kw-status fcw-status" aria-live="polite">' + statusText() + "</p>" +
      '<div class="kw-actions"><button type="button" class="fc-btn fcw-undo"' + (st.ci || st.si ? "" : " disabled") + ">Undo</button>" +
      '<button type="button" class="fc-btn fcw-reveal">Show answer</button></div>';
  }
  // Once finished the review hides the pad and shows the answer instead.
  function render() {
    if (!st.host.isConnected) return;
    st.host.innerHTML = st.finished ? "" : '<div class="fcw">' + slotsHtml() + padHtml() + "</div>";
    if (!st.finished) wire();
  }

  function finish(revealed) {
    st.finished = true;
    render();
    st.onDone({ misses: st.misses, hints: st.hints, revealed: revealed });
  }

  // Hand a stroke to the judge: the one the reader drew, or (for the smoke
  // tests) any list of grid points.
  function submit(pts) {
    if (!st || st.finished) return null;
    var strokes = strokesOf(st.chars[st.ci]);
    var verdict = kw.judge(pts, strokes[st.si]);
    if (verdict.ok) {
      st.si++;
      st.onStroke = 0;
      if (st.si >= strokes.length) {
        st.ci++;
        st.si = 0;
        if (st.ci >= st.chars.length) { finish(false); return verdict; }
      }
      render();
    } else {
      st.misses++;
      st.onStroke++;
      var wrap = st.host.querySelector(".fcw-pad-wrap");
      if (wrap && !reducedMotion()) {
        wrap.classList.remove("kw-miss"); void wrap.offsetWidth; wrap.classList.add("kw-miss");
      }
      var status = st.host.querySelector(".fcw-status");
      if (status) status.innerHTML = statusText();
      if (st.onStroke >= HINT_AFTER) showHint();
    }
    return verdict;
  }
  // The stroke they're stuck on, drawn for them, then faded -- they still
  // have to draw it themselves. Counted once per stroke: a hint means the
  // word wasn't recalled.
  function showHint() {
    var g = st.host.querySelector(".kw-hint");
    if (!g) return;
    var at = st.ci + ":" + st.si;
    if (!st.hinted[at]) { st.hinted[at] = true; st.hints++; }
    g.innerHTML = '<path class="kw-hint-stroke ' + soClass(st.si) + '" pathLength="1" d="' + esc(strokesOf(st.chars[st.ci])[st.si]) + '"/>';
    var shown = st;
    setTimeout(function () { if (st === shown && st.ci + ":" + st.si === at && g.isConnected) g.innerHTML = ""; }, 1800);
  }

  function toGrid(svg, e) {
    var r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) / (r.width || 1) * 109, (e.clientY - r.top) / (r.height || 1) * 109];
  }
  function polyD(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
  }
  function wire() {
    var host = st.host, svg = host.querySelector(".fcw-pad"), live = host.querySelector(".kw-live");
    var pts = null, pointer = null;
    svg.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "pen") penSeen = true;
      else if (penSeen && e.pointerType === "touch") return;
      if (pts) return; // one stroke at a time
      e.preventDefault();
      pointer = e.pointerId;
      try { svg.setPointerCapture(pointer); } catch (err) { /* ignore */ }
      pts = [toGrid(svg, e)];
      live.setAttribute("d", polyD(pts));
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pts || e.pointerId !== pointer) return;
      // A pen reports far more often than a frame -- take every sample.
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (events.length ? events : [e]).forEach(function (ev) {
        var p = toGrid(svg, ev);
        var last = pts[pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
        pts.push(p);
      });
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
    svg.addEventListener("pointercancel", function (e) { if (e.pointerId === pointer) { pts = null; live.setAttribute("d", ""); } });
    host.querySelector(".fcw-undo").addEventListener("click", function () {
      if (st.si) st.si--;
      else if (st.ci) { st.ci--; st.si = strokesOf(st.chars[st.ci]).length - 1; }
      st.onStroke = 0;
      render();
    });
    host.querySelector(".fcw-reveal").addEventListener("click", function () { finish(true); });
  }

  // Puts the pad for one card in `host`. The same key picks up where it
  // left off (the review re-rendered); a new one starts fresh. onDone gets
  // { misses, hints, revealed } once the last kana is written or given up.
  function mount(host, key, chars, onDone) {
    if (!st || st.key !== key) {
      st = { key: key, chars: chars.slice(), ci: 0, si: 0, misses: 0, hints: 0, onStroke: 0, hinted: {}, finished: false };
    }
    st.host = host;
    st.onDone = onDone;
    render();
  }
  function reset() { st = null; }

  return { mount: mount, submit: submit, reset: reset };
})();
