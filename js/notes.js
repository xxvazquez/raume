// The Notes screen (RaumeStudy.notes) -- the reader's own class notes, as
// HTML files they add, kept private to their account and listed by lesson
// date. A nav tab (#notes, one note at #notes/<id>), where Travel was;
// routing and show/hide live in js/vocab/interactions.js.
//
// Storage: the Supabase `notes` table (supabase/schema.sql), one row per
// note holding the file's whole text, behind the same owner-only row-level
// security as everything else -- nothing is ever in Git or on the public
// site. Signed out there are no notes. Each note is also kept on the device
// (IndexedDB, per account) so the list and every note open offline; signing
// out clears that copy.
//
// Showing a note, two ways:
// - A lesson note (made with scripts/note_kit.py: <meta name="raume-note">,
//   markup in rn-* classes, no styles or scripts of its own) is drawn by
//   raume itself -- its cards, type, dark mode -- after an allowlist pass
//   keeps only plain text markup and simple SVG. Its study controls (Quiz,
//   and Romaji / English / Furigana in ⋯), tap-to-reveal and tap-to-hear
//   are raume's own code here.
// - Any other HTML never touches raume's page: it goes into
//   notes-frame.html inside an <iframe sandbox> with no allow-scripts, whose
//   own policy lets the note's styles work while nothing in it can run. The
//   frame grows to the note's height so the page scrolls as one.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.notes = (function () {
  "use strict";

  var shared = window.RaumeStudy.shared;
  var esc = shared.escapeHtml;
  var fc = window.RaumeStudy.flashcards || {};
  var dataOps = fc.dataOps;

  var MAX_BYTES = 5 * 1024 * 1024; // matches the notes_html_size check
  var STUDY_KEY = "raume-notes-study";
  var META = "id,title,note_date,size,created_at,updated_at";

  var hostEl = null;
  var openId = null;          // the note on screen, or null for the list
  var shownId = null;         // the note the reader actually has open
  var notes = null;           // [{ id, title, note_date, size, created_at, updated_at }], null = not loaded
  var listFor = null;         // which account `notes` belongs to
  var loading = false;
  var offline = false;        // the list came from the device copy
  var flash = null;           // one-shot status line under the title
  var listScroll = 0;         // where the list was when a note opened
  var cameFromList = false;   // Back pops history rather than pushing #notes

  var DOC_ICON = '<svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 1.8h6l3 3v11.4h-9z"/><path d="M10.5 1.8v3h3M6.8 9h4.4M6.8 12h4.4"/></svg>';
  var PLUS_ICON = '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 3.5v11M3.5 9h11"/></svg>';
  var BACK_ICON = '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 3.5 6 9l5.5 5.5"/></svg>';
  var MENU_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="4" cy="9" r="1.45"/><circle cx="9" cy="9" r="1.45"/><circle cx="14" cy="9" r="1.45"/></svg>';
  var CHECK_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8"/></svg>';
  var MENU_ICONS = {
    rename: '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.3 3.7 14.3 5.7 6 14H4v-2z"/></svg>',
    date: '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="13" height="12" rx="2"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/></svg>',
    replace: '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a6 6 0 0 1 10.3-4.2L15 6.5M15 2.8v3.7h-3.7M15 9a6 6 0 0 1-10.3 4.2L3 11.5M3 15.2v-3.7h3.7"/></svg>',
    delete: '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h12M7 5V3.3h4V5M4.6 5l.8 10h7.2l.8-10M7.6 8v4.5M10.4 8v4.5"/></svg>'
  };

  function vocab() { return window.RaumeStudy.vocab || {}; }
  function user() { return dataOps && dataOps.currentUser ? dataOps.currentUser() : null; }
  function client() { return dataOps && dataOps.getClient ? dataOps.getClient() : null; }
  function timed(p, label) { return dataOps && dataOps.withTimeout ? dataOps.withTimeout(p, label, 20000) : p; }
  function problem(err, fallback) { return (err && err.message) || fallback || "check your connection."; }

  // ---------------------------------------------------------------------
  // The device copy (IndexedDB "raume-notes"): one record per note per
  // account -- the list's columns, plus `html` once it has been fetched.
  // Every call resolves (null / [] on failure): the copy is only ever a
  // fallback, never a reason to fail.
  // ---------------------------------------------------------------------
  var dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve) {
        try {
          if (!window.indexedDB) return resolve(null);
          var req = window.indexedDB.open("raume-notes", 1);
          req.onupgradeneeded = function () { req.result.createObjectStore("notes", { keyPath: "key" }); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }
    return dbPromise;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var t = d.transaction("notes", mode), out = { value: null };
          fn(t.objectStore("notes"), out);
          t.oncomplete = function () { resolve(out.value); };
          t.onerror = t.onabort = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  function keyOf(uid, id) { return uid + ":" + id; }
  function deviceList(uid) {
    return tx("readonly", function (s, out) {
      var r = s.getAll();
      r.onsuccess = function () { out.value = (r.result || []).filter(function (n) { return n.uid === uid; }); };
    }).then(function (v) { return v || []; });
  }
  function deviceGet(uid, id) {
    return tx("readonly", function (s, out) {
      var r = s.get(keyOf(uid, id));
      r.onsuccess = function () { out.value = r.result || null; };
    });
  }
  function devicePut(uid, rec) {
    var copy = Object.assign({}, rec, { key: keyOf(uid, rec.id), uid: uid });
    return tx("readwrite", function (s) { s.put(copy); });
  }
  function deviceDelete(uid, id) { return tx("readwrite", function (s) { s.delete(keyOf(uid, id)); }); }
  // The server's list replaces the device's: notes gone from the account go,
  // and a note whose content changed (updated_at) loses its stale html.
  function deviceSync(uid, rows) {
    return deviceList(uid).then(function (have) {
      var byId = {};
      have.forEach(function (n) { byId[n.id] = n; });
      return tx("readwrite", function (s) {
        var keep = {};
        rows.forEach(function (row) {
          keep[row.id] = true;
          var old = byId[row.id];
          var rec = Object.assign({}, row, { key: keyOf(uid, row.id), uid: uid });
          if (old && old.html != null && old.updated_at === row.updated_at) rec.html = old.html;
          s.put(rec);
        });
        have.forEach(function (n) { if (!keep[n.id]) s.delete(n.key); });
      });
    });
  }
  function deviceClear(uid) {
    return deviceList(uid).then(function (have) {
      return tx("readwrite", function (s) { have.forEach(function (n) { s.delete(n.key); }); });
    });
  }

  // ---------------------------------------------------------------------
  // The account's notes
  // ---------------------------------------------------------------------
  function metaOf(n) {
    return { id: n.id, title: n.title, note_date: n.note_date, size: n.size, created_at: n.created_at, updated_at: n.updated_at };
  }
  function loadList() {
    var u = user(), c = client();
    if (!u || !c || loading) return;
    loading = true;
    var uid = u.id;
    timed(dataOps.fetchAllRows(function () { return c.from("notes").select(META).eq("user_id", uid); }), "Loading your notes")
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      })
      .then(function (rows) {
        if (!user() || user().id !== uid) return;
        notes = rows; listFor = uid; offline = false;
        return deviceSync(uid, rows).then(prefetch);
      }, function (err) {
        if (!user() || user().id !== uid) return;
        return deviceList(uid).then(function (have) {
          listFor = uid; offline = true;
          notes = have.map(metaOf);
          if (!have.length) flash = { text: "Couldn’t load your notes — " + problem(err), error: true };
        });
      })
      .then(function () { loading = false; if (!openId || shownId !== openId) rerender(); }, function () { loading = false; });
  }
  // Every note's text, fetched once into the device copy, so the whole set
  // opens offline -- one at a time, in the background.
  function prefetch() {
    var u = user();
    if (!u) return;
    var uid = u.id;
    deviceList(uid).then(function (have) {
      var missing = have.filter(function (n) { return n.html == null; });
      (function next() {
        var n = missing.shift();
        if (!n || !user() || user().id !== uid) return;
        fetchNoteHtml(n.id).then(next, function () { /* offline again: next time */ });
      })();
    });
  }
  function fetchNoteHtml(id) {
    var u = user(), c = client();
    if (!u || !c) return Promise.reject(new Error("sign in to open your notes."));
    var uid = u.id;
    return timed(c.from("notes").select(META + ",html").eq("id", id).single(), "Loading the note").then(function (res) {
      if (res.error) throw res.error;
      return devicePut(uid, res.data).then(function () { return res.data; });
    });
  }
  // The note's text: the device copy when it's current, else the server;
  // offline, whatever copy the device has.
  function noteHtml(id) {
    var u = user();
    if (!u) return Promise.reject(new Error("sign in to open your notes."));
    var meta = findNote(id);
    return deviceGet(u.id, id).then(function (rec) {
      if (rec && rec.html != null && (!meta || meta.updated_at === rec.updated_at)) return rec;
      return fetchNoteHtml(id).catch(function (err) {
        if (rec && rec.html != null) return rec;
        throw err;
      });
    });
  }
  function findNote(id) {
    return (notes || []).filter(function (n) { return n.id === id; })[0] || null;
  }

  // ---------------------------------------------------------------------
  // Reading a file
  // ---------------------------------------------------------------------
  function readFile(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  }
  function byteLength(s) {
    try { return new Blob([s]).size; } catch (e) { return s.length; }
  }
  function parse(html) { return new DOMParser().parseFromString(String(html || ""), "text/html"); }
  function metaContent(doc, name) {
    var m = doc.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute("content") || "").trim() : "";
  }
  // What a file is called and when its lesson was: the note's own <title>
  // and raume-note-date when it has them, else the file's name and date.
  function describeFile(html, fileName, lastModified) {
    var doc = parse(html);
    var title = (doc.title || "").trim() || String(fileName || "Untitled").replace(/\.x?html?$/i, "");
    var date = metaContent(doc, "raume-note-date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = isoDate(lastModified ? new Date(lastModified) : new Date());
    // Lesson pages are named by their date, like the ones note_kit.py makes.
    if (isKitOriginal(doc)) title = lessonName(date);
    return { title: title.slice(0, 200), date: date };
  }
  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dateOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // ---------------------------------------------------------------------
  // A lesson note, drawn by raume
  // ---------------------------------------------------------------------
  // Only plain text markup and simple drawings survive; every attribute but
  // a handful goes, and so does anything that runs, loads or links.
  var KEEP_TAGS = ("article header section footer h1 h2 h3 h4 p div span b strong i em s u small sub sup mark code br " +
    "ruby rt rp ul ol li table thead tbody tr th td svg g path rect circle ellipse line polyline polygon").split(" ");
  var KEEP_ATTRS = { "class": 1, "lang": 1, "data-tile": 1, "aria-hidden": 1, "aria-label": 1, "colspan": 1, "rowspan": 1 };
  var SVG_ATTRS = ("viewbox width height d x y cx cy r rx ry x1 y1 x2 y2 points transform").split(" ");
  var TILES = { blue: 1, green: 1, orange: 1, purple: 1, teal: 1, indigo: 1, amber: 1, clay: 1, slate: 1 };
  function isLessonNote(doc) { return !!doc.querySelector('meta[name="raume-note"]') && !!doc.querySelector("article.rn"); }

  // The reader's lesson pages from before raume drew them (the standalone
  // lesson kit: a .toolbar of study buttons, main.page, .st stacks, its own
  // zoomed stylesheet and script). The same content in other class names:
  // turned into a lesson note here so it reads -- and studies -- like one
  // instead of sitting in the frame at its own size with dead buttons.
  var KIT_CLASSES = {
    st: "rn-st", ans: "rn-ans", tag: "rn-tag", jp: "rn-jp", ro: "rn-ro", en: "rn-en", card: "rn-card", pad: "rn-pad",
    list: "rn-list", qa: "rn-qa", one: "rn-one", r: "rn-r", hdr: "rn-hdr", lead: "rn-lead", em: "rn-em", num: "rn-num", lbl: "rn-lbl",
    cols2: "rn-cols2", tiles: "rn-tiles", c3: "rn-c3", c4: "rn-c4", tile: "rn-tile", ic: "rn-ic", formula: "rn-formula", fl: "rn-fl",
    lab: "rn-lab", fj: "rn-fj", fr: "rn-fr", slot: "rn-slot", two: "rn-two", kind: "rn-kind", "kind-sub": "rn-kind-sub",
    tips: "rn-tips", tip: "rn-tip", dot: "rn-dot", ok: "rn-ok", x: "rn-x", hl: "rn-hl",
    pk: "pk", "pk-line": "pk-line", "pk-on": "pk-on", "pk-dot": "pk-dot", "pk-dash": "pk-dash", "pk-halo": "pk-halo"
  };
  var KIT_HUES = { blue: "blue", green: "green", orange: "orange", purple: "purple", teal: "teal", pink: "clay" };
  function isKitOriginal(doc) {
    return !doc.querySelector("article.rn") && !!doc.querySelector("main.page .st .jp") && !!doc.querySelector(".tb-group [data-pref]");
  }
  // 2026-11-21 -> "Sat, Nov 21st 2026" (scripts/note_kit.py lesson_name).
  function lessonName(iso) {
    var d = dateOf(iso);
    if (!d) return "Lesson";
    var n = d.getDate(), m = n % 100;
    var suffix = m >= 11 && m <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th";
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
    return wd + ", " + mo + " " + n + suffix + " " + d.getFullYear();
  }
  function fromKit(doc) {
    var main = doc.querySelector("main.page");
    var top = main.querySelector(".top");
    if (top) {
      top.className = "rn-top";
      top.querySelectorAll(".howto").forEach(function (el) { el.remove(); }); // the speaker glyphs say it now
      var eb = top.querySelector(".eyebrow"); if (eb) eb.className = "rn-eyebrow";
      var desc = top.querySelector(".desc"); if (desc) desc.className = "rn-desc";
    }
    main.querySelectorAll("section").forEach(function (sec) {
      var hue = (sec.className.match(/\bc-(\w+)/) || [])[1];
      sec.className = "rn-sec";
      if (KIT_HUES[hue]) sec.setAttribute("data-tile", KIT_HUES[hue]);
      var head = sec.querySelector(":scope > .sec-head");
      if (!head) return;
      var h2 = doc.createElement("h2");
      h2.className = "rn-sec-head";
      var num = head.querySelector(".sec-num"), title = head.querySelector("h2"), sub = title && title.querySelector(".sub");
      if (sub) sub.remove();
      h2.innerHTML = '<span class="rn-sec-num" aria-hidden="true"></span><span></span><span class="rn-sub"></span>';
      h2.children[0].textContent = num ? num.textContent : "";
      if (title) while (title.firstChild) h2.children[1].appendChild(title.firstChild);
      if (sub) while (sub.firstChild) h2.children[2].appendChild(sub.firstChild);
      head.replaceWith(h2);
    });
    main.querySelectorAll("h3").forEach(function (h) { h.className = "rn-h3"; });
    main.querySelectorAll(".list.qa").forEach(function (l) { if (l.querySelector(".lbl")) l.classList.add("rn-labelled"); });
    main.querySelectorAll("[class]").forEach(function (el) {
      if (/^rn-/.test(el.className) || el.classList.contains("rn-labelled")) {
        if (!el.classList.contains("rn-labelled")) return;
      }
      var keep = [];
      Array.prototype.forEach.call(el.classList, function (c) {
        if (/^rn-/.test(c)) keep.push(c);
        else if (KIT_CLASSES[c]) keep.push(KIT_CLASSES[c]);
      });
      el.setAttribute("class", keep.join(" "));
    });
    var article = doc.createElement("article");
    article.className = "rn";
    while (main.firstChild) article.appendChild(main.firstChild);
    doc.body.innerHTML = "";
    doc.body.appendChild(article);
    return doc;
  }
  function cleanLesson(doc) {
    var root = doc.querySelector("article.rn");
    (function walk(el) {
      Array.prototype.slice.call(el.children).forEach(function (child) {
        var tag = child.localName;
        if (KEEP_TAGS.indexOf(tag) === -1) {
          // Drop what runs or embeds outright; unwrap anything else so its text stays.
          if (/^(script|style|iframe|frame|object|embed|template|link|meta|base|form|input|button|textarea|select|img|video|audio|source|picture|canvas|foreignobject|use|image)$/i.test(tag)) { child.remove(); return; }
          walk(child);
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        var isSvg = child.namespaceURI === "http://www.w3.org/2000/svg";
        Array.prototype.slice.call(child.attributes).forEach(function (a) {
          var n = a.name.toLowerCase();
          var ok = KEEP_ATTRS[n] || (isSvg && SVG_ATTRS.indexOf(n) !== -1);
          if (n === "data-tile" && !TILES[a.value]) ok = false;
          if (!ok) child.removeAttribute(a.name);
        });
        walk(child);
      });
    })(root);
    return root;
  }
  var study = (function () {
    var d = { romaji: true, english: true, furigana: true, quiz: false };
    try { Object.assign(d, JSON.parse(localStorage.getItem(STUDY_KEY) || "{}")); } catch (e) {}
    return d;
  })();
  function saveStudy() { try { localStorage.setItem(STUDY_KEY, JSON.stringify(study)); } catch (e) {} }
  function applyStudy() {
    var body = hostEl && hostEl.querySelector(".rn");
    if (!body) return;
    body.classList.toggle("rn-no-romaji", !study.romaji);
    body.classList.toggle("rn-no-english", !study.english);
    body.classList.toggle("rn-no-furigana", !study.furigana);
    body.classList.toggle("rn-quiz", !!study.quiz);
    hostEl.querySelectorAll("[data-study]").forEach(function (b) { b.setAttribute("aria-checked", String(!!study[b.dataset.study])); });
    var quiz = hostEl.querySelector("#notesQuiz");
    if (quiz) { quiz.setAttribute("aria-pressed", String(!!study.quiz)); quiz.classList.toggle("fc-btn-primary", !!study.quiz); }
  }
  function setStudy(key, on) {
    study[key] = on;
    saveStudy();
    // Changing what's hidden starts the reveal over.
    if (hostEl) hostEl.querySelectorAll(".rn-st.rn-shown").forEach(function (s) { s.classList.remove("rn-shown"); });
    applyStudy();
  }
  function hidden(el) {
    if (!el || !el.closest(".rn")) return false;
    var body = el.closest(".rn"), st = el.closest(".rn-st");
    if (st && st.classList.contains("rn-shown")) return false;
    if (el.classList.contains("rn-ro") || el.classList.contains("rn-fr")) return body.classList.contains("rn-no-romaji");
    if (el.classList.contains("rn-en")) return body.classList.contains("rn-no-english");
    if (el.classList.contains("rn-jp")) return body.classList.contains("rn-quiz") && !!st && st.classList.contains("rn-ans");
    return false;
  }
  // Tap a covered line to uncover its whole item; tap the Japanese to hear it.
  function onLessonClick(e) {
    var st = e.target.closest(".rn-st");
    if (st && !st.classList.contains("rn-shown")) {
      var covered = Array.prototype.some.call(st.querySelectorAll(".rn-jp, .rn-ro, .rn-en"), hidden);
      if (covered) { st.classList.add("rn-shown"); return; }
    }
    var jp = e.target.closest(".rn-st .rn-jp");
    if (jp) speak(jp);
  }
  // What a Japanese line says: each kanji as its furigana reading, as the
  // reference tables' speakers do -- a voice reading the bare kanji can
  // pick the wrong reading (上 alone as "jō").
  function spokenText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll("ruby").forEach(function (ruby) {
      var reading = Array.prototype.map.call(ruby.querySelectorAll("rt"), function (rt) { return rt.textContent; }).join("");
      if (!reading) { ruby.querySelectorAll("rp").forEach(function (n) { n.remove(); }); reading = ruby.textContent; }
      ruby.replaceWith(document.createTextNode(reading));
    });
    return clone.textContent.replace(/[●Ｘ]/g, "").replace(/\s+/g, " ").trim();
  }
  // What it shows: the line without its furigana.
  function shownText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll("rt, rp").forEach(function (n) { n.remove(); });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }
  function speak(el) {
    var text = spokenText(el);
    if (!text || text === "—" || !shared.speech) return;
    hostEl.querySelectorAll(".rn-speaking").forEach(function (n) { n.classList.remove("rn-speaking"); });
    el.classList.add("rn-speaking");
    setTimeout(function () { el.classList.remove("rn-speaking"); }, 1200);
    shared.speech.speak(text);
  }
  function showLesson(doc, into) {
    var root = cleanLesson(doc);
    var body = document.createElement("div");
    body.className = "rn";
    Array.prototype.slice.call(root.childNodes).forEach(function (n) { body.appendChild(document.importNode(n, true)); });
    // Each Japanese line says it plays (the tap is only a bigger target for this).
    body.querySelectorAll(".rn-st .rn-jp").forEach(function (jp) {
      jp.setAttribute("lang", "ja");
      jp.setAttribute("role", "button");
      jp.setAttribute("tabindex", "0");
      jp.setAttribute("aria-label", "Play " + shownText(jp));
    });
    into.replaceWith(body);
    body.addEventListener("click", onLessonClick);
    body.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("rn-jp")) { e.preventDefault(); onLessonClick(e); }
    });
    applyStudy();
  }

  // ---------------------------------------------------------------------
  // Any other note, inside the sealed frame
  // ---------------------------------------------------------------------
  var DROP = "script, iframe, frame, frameset, object, embed, applet, meta, base, portal, link:not([rel~='stylesheet' i])";
  // Parse the note (inert: DOMParser runs nothing and loads nothing), then
  // drop everything that runs, navigates or embeds -- the frame couldn't run
  // it anyway; this keeps the copy tidy and its links sensible.
  function cleanNote(html) {
    var doc = parse(html);
    doc.querySelectorAll(DROP).forEach(function (el) { el.remove(); });
    doc.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var n = a.name.toLowerCase();
        if (n.indexOf("on") === 0 || n === "srcdoc" || n === "formaction" || n === "action" || n === "ping") el.removeAttribute(a.name);
        else if ((n === "src" || n === "href" || n === "xlink:href") && /^\s*(javascript|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
      });
    });
    // Links: within the note they scroll to the spot; out to the web they
    // open in Safari; anything else (a relative link to another file of the
    // export) has nowhere to go, so it reads as plain text.
    doc.querySelectorAll("a[href], area[href]").forEach(function (a) {
      var href = a.getAttribute("href").trim();
      if (href.charAt(0) === "#") a.setAttribute("target", "_self");
      else if (/^(https?:|mailto:|tel:)/i.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
      else a.removeAttribute("href");
    });
    return doc;
  }
  // The frame's height, drawn through one constructed sheet so nothing
  // carries a style="" attribute (as shared.js swipeRows does).
  var heightSheet = null;
  function setFrameHeight(frame, px) {
    var h = Math.max(120, Math.ceil(px));
    if (!heightSheet && "adoptedStyleSheets" in document && typeof CSSStyleSheet === "function") {
      try {
        heightSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([heightSheet]);
      } catch (e) { heightSheet = null; }
    }
    if (heightSheet) heightSheet.replaceSync(".note-frame { height: " + h + "px; }");
    else frame.style.height = h + "px";
  }
  function frameDoc(frame) {
    try { return frame.contentDocument; } catch (e) { return null; }
  }
  function measure(frame) {
    var doc = frameDoc(frame);
    if (!doc || !doc.body) return;
    var b = doc.body, view = doc.defaultView || window, cs = view.getComputedStyle(b);
    var h = b.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    setFrameHeight(frame, Math.max(h, b.scrollHeight || 0));
  }
  // Copies a cleaned note into the frame: its stylesheets into the frame's
  // <head> (beside the frame's own base styles, which every rule beats), its
  // <html> attributes and its body. Returns false when the frame can't be
  // reached (raume opened from a file, where every frame is a stranger).
  function fillFrame(frame, html) {
    var doc = frameDoc(frame);
    if (!doc || !doc.head || !doc.body) return false;
    var src = cleanNote(html);
    doc.querySelectorAll("[data-note-head]").forEach(function (el) { el.remove(); });
    src.head.querySelectorAll("style, link[rel~='stylesheet' i]").forEach(function (el) {
      var copy = doc.importNode(el, true);
      copy.setAttribute("data-note-head", "");
      doc.head.appendChild(copy);
    });
    ["lang", "dir", "class", "style"].forEach(function (n) {
      var v = src.documentElement.getAttribute(n);
      if (v != null) doc.documentElement.setAttribute(n, v);
    });
    doc.documentElement.replaceChild(doc.importNode(src.body, true), doc.body);
    // A link within the note scrolls this page (the frame never scrolls
    // itself -- it's as tall as the note).
    doc.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a[href^='#'], area[href^='#']");
      if (!a) return;
      e.preventDefault();
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      var target = id ? (doc.getElementById(id) || doc.getElementsByName(id)[0]) : null;
      var offset = target ? target.getBoundingClientRect().top : 0;
      var top = frame.getBoundingClientRect().top + offset + (window.scrollY || 0) - 96;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    });
    var again = function () { measure(frame); };
    doc.addEventListener("load", again, true); // images, stylesheets
    if (window.ResizeObserver) {
      try { var ro = new ResizeObserver(again); ro.observe(doc.body); ro.observe(frame); } catch (e) {}
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(again, function () {});
    again();
    return true;
  }
  function showInFrame(html, into) {
    var frame = document.createElement("iframe");
    frame.className = "note-frame";
    frame.hidden = true;
    frame.title = into.dataset.title || "Note";
    frame.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.addEventListener("load", function () {
      if (!frame.isConnected || !/notes-frame\.html$/.test(frame.src)) return;
      frame.hidden = false; // measured as it fills, so it must be laid out
      if (fillFrame(frame, html)) { into.remove(); return; }
      frame.hidden = true;
      into.textContent = "This note opens only when raume runs from its web address, not from a file.";
    });
    into.after(frame);
    frame.src = "notes-frame.html";
  }

  // ---------------------------------------------------------------------
  // Sheets: a name or a date, in the same iOS alert as confirmSheet
  // ---------------------------------------------------------------------
  // o: { title, message?, label, type?, value, confirm, onConfirm(value) }
  function fieldSheet(o) {
    var old = document.querySelector(".ios-confirm");
    if (old) old.remove();
    var opener = document.activeElement;
    var host = document.createElement("div");
    host.className = "ios-confirm";
    host.innerHTML = '<div class="ios-confirm-scrim"></div>' +
      '<form class="ios-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="notesFieldTitle">' +
      '<div class="ios-confirm-group"><div class="ios-confirm-msg">' +
      '<p class="ios-confirm-title" id="notesFieldTitle">' + esc(o.title) + "</p>" +
      (o.message ? "<p>" + esc(o.message) + "</p>" : "") +
      '<input class="ios-confirm-field" id="notesField" type="' + (o.type || "text") + '" autocomplete="off" required aria-label="' + esc(o.label) + '">' +
      "</div>" +
      '<button type="submit" class="ios-confirm-go">' + esc(o.confirm) + "</button></div>" +
      '<button type="button" class="ios-confirm-cancel">Cancel</button></form>';
    document.body.appendChild(host);
    var field = host.querySelector("#notesField");
    field.value = o.value || "";
    function close() {
      document.removeEventListener("keydown", onKey);
      host.remove();
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    host.querySelector(".ios-confirm-scrim").addEventListener("click", close);
    host.querySelector(".ios-confirm-cancel").addEventListener("click", close);
    host.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = field.value.trim();
      if (!v) return;
      close();
      o.onConfirm(v);
    });
    field.focus();
    if (field.select && field.type === "text") field.select();
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  function pickFiles(multiple, then) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".html,.htm,text/html";
    input.multiple = !!multiple;
    input.className = "notes-file-input";
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.remove();
      if (files.length) then(files);
    });
    document.body.appendChild(input);
    input.click();
  }
  function isHtmlFile(file) { return /\.x?html?$/i.test(file.name) || /html/.test(file.type || ""); }
  function upload(files) {
    var u = user(), c = client();
    if (!u || !c) return;
    var uid = u.id, added = 0, problems = [];
    flash = { text: "Adding " + (files.length === 1 ? "your note" : files.length + " notes") + "…", busy: true };
    rerender();
    files.reduce(function (chain, file) {
      return chain.then(function () {
        if (!isHtmlFile(file)) { problems.push("“" + file.name + "” isn’t an HTML file"); return; }
        return readFile(file).then(function (html) {
          var size = byteLength(html);
          if (size > MAX_BYTES) { problems.push("“" + file.name + "” is over 5 MB"); return; }
          var d = describeFile(html, file.name, file.lastModified);
          return timed(c.from("notes").insert({ title: d.title, note_date: d.date, html: html, size: size }).select(META).single(), "Adding a note")
            .then(function (res) {
              if (res.error) throw res.error;
              added++;
              if (user() && user().id === uid) {
                notes = (notes || []).concat([res.data]);
                return devicePut(uid, Object.assign({}, res.data, { html: html }));
              }
            });
        }).catch(function (err) { problems.push("“" + file.name + "” — " + problem(err, "couldn’t be added")); });
      });
    }, Promise.resolve()).then(function () {
      flash = problems.length
        ? { text: (added ? added + (added === 1 ? " note added. " : " notes added. ") : "") + problems.join("; ") + ".", error: true }
        : null;
      rerender();
    });
  }
  function patch(note, fields) {
    var u = user(), c = client();
    if (!u || !c) return;
    var uid = u.id;
    timed(c.from("notes").update(fields).eq("id", note.id).select(META).single(), "Saving the note").then(function (res) {
      if (res.error) throw res.error;
      Object.assign(note, res.data);
      return deviceGet(uid, note.id).then(function (rec) { if (rec) return devicePut(uid, Object.assign(rec, res.data)); });
    }).then(function () {
      flash = null;
      // In the reader only its title and date change -- the note stays
      // where you were reading it.
      var h1 = openId === note.id && hostEl && hostEl.querySelector(".notes-title-tx");
      if (!h1) { rerender(); return; }
      h1.textContent = note.title;
      var tb = hostEl.querySelector("#notesTitle");
      if (tb) tb.setAttribute("aria-label", "Rename “" + note.title + "”");
      var when = hostEl.querySelector(".notes-reader-date");
      if (when) when.textContent = readerDate(note);
    }, function (err) {
      flash = { text: "Couldn’t save — " + problem(err), error: true };
      rerender();
    });
  }
  function rename(note) {
    fieldSheet({
      title: "Rename note", label: "Name", value: note.title, confirm: "Rename",
      onConfirm: function (v) { if (v !== note.title) patch(note, { title: v.slice(0, 200) }); }
    });
  }
  function redate(note) {
    fieldSheet({
      title: "Lesson date", message: "Notes are listed by this date, newest first.",
      label: "Lesson date", type: "date", value: note.note_date, confirm: "Save",
      onConfirm: function (v) { if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== note.note_date) patch(note, { note_date: v }); }
    });
  }
  function replace(note) {
    pickFiles(false, function (files) {
      var file = files[0], u = user(), c = client();
      if (!u || !c) return;
      var uid = u.id;
      (isHtmlFile(file) ? readFile(file) : Promise.reject(new Error("“" + file.name + "” isn’t an HTML file"))).then(function (html) {
        var size = byteLength(html);
        if (size > MAX_BYTES) throw new Error("“" + file.name + "” is over 5 MB");
        return timed(c.from("notes").update({ html: html, size: size, updated_at: new Date().toISOString() }).eq("id", note.id).select(META).single(), "Replacing the note")
          .then(function (res) {
            if (res.error) throw res.error;
            Object.assign(note, res.data);
            return devicePut(uid, Object.assign({}, res.data, { html: html }));
          });
      }).then(function () { flash = null; rerender(); }, function (err) {
        flash = { text: "Couldn’t replace it — " + problem(err), error: true };
        rerender();
      });
    });
  }
  function remove(note) {
    shared.confirmSheet({
      title: "Delete “" + note.title + "”?",
      message: "It’s removed from your account on every device. This can’t be undone.",
      confirm: "Delete Note",
      onConfirm: function () {
        var u = user(), c = client();
        if (!u || !c) return;
        var uid = u.id;
        timed(c.from("notes").delete().eq("id", note.id), "Deleting the note").then(function (res) {
          if (res.error) throw res.error;
          notes = (notes || []).filter(function (n) { return n.id !== note.id; });
          return deviceDelete(uid, note.id);
        }).then(function () {
          flash = null;
          if (openId === note.id) back(); else rerender();
        }, function (err) {
          flash = { text: "Couldn’t delete it — " + problem(err), error: true };
          rerender();
        });
      }
    });
  }
  function openNote(id) {
    listScroll = window.scrollY || 0;
    cameFromList = true;
    if (vocab().showNotesPage) vocab().showNotesPage({ noteId: id });
  }
  function back() {
    if (cameFromList) { cameFromList = false; history.back(); return; }
    if (vocab().showNotesPage) vocab().showNotesPage();
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function shortDate(iso) {
    var d = dateOf(iso);
    return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";
  }
  function longDate(iso) {
    var d = dateOf(iso);
    if (!d) return "";
    var o = { weekday: "long", day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString(undefined, o);
  }
  function monthLabel(iso) {
    var d = dateOf(iso);
    return d ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "No date";
  }
  // Newest lesson first; the same day, the newest added first.
  function byDate(a, b) {
    if (a.note_date !== b.note_date) return a.note_date < b.note_date ? 1 : -1;
    return String(b.created_at).localeCompare(String(a.created_at));
  }
  function flashHtml() {
    if (offline && !flash) return '<p class="notes-flash" role="status">Offline — showing the notes saved on this device.</p>';
    if (!flash) return '<p class="notes-flash" role="status" hidden></p>';
    return '<p class="notes-flash' + (flash.error ? " notes-flash-error" : "") + '" role="status">' + esc(flash.text) + "</p>";
  }
  function emptyCard(title, sub, button) {
    return '<div class="notes-empty">' +
      '<span class="help-tile" data-tile="indigo" aria-hidden="true">' + DOC_ICON + "</span>" +
      '<p class="notes-empty-title">' + esc(title) + "</p>" +
      '<p class="notes-empty-sub">' + esc(sub) + "</p>" + (button || "") + "</div>";
  }
  function listHtml() {
    var u = user();
    var addBtn = u ? '<button type="button" class="fc-titlebar-btn notes-add" id="notesAdd" aria-label="Add notes">' + PLUS_ICON + "Add</button>" : "";
    var head = '<div class="fc-titlebar notes-titlebar"><h1>Notes</h1>' + addBtn + "</div>" + flashHtml();
    if (!u) {
      var ready = !dataOps || !dataOps.authState || dataOps.authState.ready;
      if (!ready) return head;
      return head + emptyCard("Your class notes, in raume",
        "Sign in to add notes as HTML files. They’re private to your account and open on every device you sign in on — even offline.",
        '<button type="button" class="fc-btn fc-btn-primary" id="notesSignIn">Sign in</button>');
    }
    if (!notes) return head + '<p class="notes-loading" role="status">Loading your notes…</p>';
    if (!notes.length) {
      return head + emptyCard("No notes yet",
        "Add an HTML file — notes from class, a handout, a summary. Only you can see them.",
        '<button type="button" class="fc-btn fc-btn-primary" data-notes-add>Add notes</button>');
    }
    var months = [], byMonth = {};
    notes.slice().sort(byDate).forEach(function (n) {
      var k = String(n.note_date || "").slice(0, 7);
      if (!byMonth[k]) { byMonth[k] = []; months.push(k); }
      byMonth[k].push(n);
    });
    return head + months.map(function (k) {
      var label = monthLabel(byMonth[k][0].note_date);
      return '<h2 class="help-head notes-group-head">' + esc(label) + "</h2>" +
        '<ul class="notes-card" aria-label="' + esc(label) + '">' + byMonth[k].map(function (n) {
          return '<li><button type="button" class="notes-row" data-note="' + esc(n.id) + '">' +
            '<span class="set-tile" data-tile="indigo" aria-hidden="true">' + DOC_ICON + "</span>" +
            '<span class="notes-row-tx"><span class="notes-row-title">' + esc(n.title) + "</span>" +
            '<span class="notes-row-sub">' + esc(shortDate(n.note_date)) + "</span></span></button></li>";
        }).join("") + "</ul>";
    }).join("");
  }
  // A note named by its date says it again on the line under it -- there the
  // lesson's topic (its first heading, from the device copy) reads better,
  // the way Notes shows a preview line. Filled in once the copy answers.
  function topicOf(html) {
    var doc = parse(html);
    var h = doc.querySelector(".rn-top h1, main.page .top h1, h1");
    return h ? h.textContent.replace(/\s+/g, " ").trim() : "";
  }
  function showTopics(host) {
    var u = user();
    if (!u || !notes) return;
    deviceList(u.id).then(function (have) {
      have.forEach(function (rec) {
        var note = findNote(rec.id);
        if (!note || rec.html == null || note.title !== lessonName(note.note_date)) return;
        var topic = topicOf(rec.html);
        var row = host.querySelector('.notes-row[data-note="' + rec.id + '"] .notes-row-sub');
        if (topic && row) row.textContent = topic;
      });
    });
  }
  // The date under the title -- unless the title already is it.
  function readerDate(note) { return note.title === lessonName(note.note_date) ? "" : longDate(note.note_date); }
  function menuItem(action, label, danger) {
    return '<button type="button" class="notes-menu-item' + (danger ? " notes-menu-danger" : "") + '" role="menuitem" data-note-action="' + action + '">' +
      '<span class="menu-item-ic" aria-hidden="true">' + MENU_ICONS[action] + '</span><span class="menu-item-tx">' + label + "</span></button>";
  }
  function checkItem(key, label) {
    return '<button type="button" class="notes-check-item" role="menuitemcheckbox" aria-checked="' + !!study[key] + '" data-study="' + key + '" hidden>' +
      '<span class="menu-item-check">' + CHECK_ICON + '</span><span class="menu-item-tx">' + label + "</span></button>";
  }
  function readerHtml(note) {
    var head = '<button type="button" class="fc-back" id="notesBack">' + BACK_ICON + "Notes</button>";
    if (!note) {
      return head + '<div class="fc-titlebar fc-titlebar-pushed notes-titlebar"><h1>Note</h1></div>' + flashHtml() +
        '<p class="notes-loading" role="status">' + (notes ? "This note isn’t in your account any more." : "Loading…") + "</p>";
    }
    return head +
      // The title is the rename control, as a document's title is on iOS.
      '<div class="fc-titlebar fc-titlebar-pushed notes-titlebar"><h1><button type="button" class="notes-title" id="notesTitle" aria-label="Rename “' + esc(note.title) + '”">' +
      '<span class="notes-title-tx">' + esc(note.title) + "</span>" + MENU_ICONS.rename.replace("<svg ", '<svg class="notes-title-pen" aria-hidden="true" ') + "</button></h1></div>" +
      '<div class="notes-reader-bar"><p class="notes-reader-date">' + esc(readerDate(note)) + "</p>" +
      '<div class="notes-tools">' +
      // Quiz: the study action you take mid-note, so it's a button of its
      // own; the display options it pairs with sit in ⋯. Both show only for
      // a lesson note (showLesson unhides them).
      '<button type="button" class="fc-btn notes-quiz" id="notesQuiz" aria-pressed="false" hidden>Quiz</button>' +
      '<div class="section-menu notes-menu">' +
      '<button type="button" class="section-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Note options">' + MENU_ICON + "</button>" +
      '<div class="section-menu-list" role="menu" hidden>' +
      checkItem("romaji", "Romaji") + checkItem("english", "English") + checkItem("furigana", "Furigana") +
      menuItem("rename", "Rename") + menuItem("date", "Lesson date") + menuItem("replace", "Replace with a new file") + menuItem("delete", "Delete", true) +
      "</div></div></div></div>" +
      flashHtml() +
      '<p class="notes-loading" role="status" id="notesReaderStatus" data-title="' + esc(note.title) + '">Opening…</p>';
  }
  function showInReader(note) {
    var want = note.id;
    noteHtml(want).then(function (rec) {
      var status = document.getElementById("notesReaderStatus");
      if (openId !== want || !status) return;
      var doc = parse(rec.html);
      if (isKitOriginal(doc)) fromKit(doc);
      if (isLessonNote(doc) || doc.querySelector("article.rn")) {
        hostEl.querySelectorAll("#notesQuiz, [data-study]").forEach(function (el) { el.hidden = false; });
        showLesson(doc, status);
      } else {
        showInFrame(rec.html, status);
      }
    }, function (err) {
      var status = document.getElementById("notesReaderStatus");
      if (status && openId === want) status.textContent = "Couldn’t open this note — " + problem(err);
    });
  }

  function rerender() {
    if (!hostEl || hostEl.hidden) return;
    render(hostEl, { noteId: openId, keepScroll: true });
  }
  // host: #notesPage. opts.noteId: the note to show (else the list).
  function render(host, opts) {
    opts = opts || {};
    hostEl = host = host || hostEl;
    if (!host) return;
    var wasNote = openId;
    openId = opts.noteId || null;
    var u = user();
    if (u && listFor !== u.id) { notes = null; listFor = null; }
    if (u && !notes && !loading) loadList();
    if (openId) {
      var note = findNote(openId);
      host.innerHTML = '<div class="notes-wrap">' + readerHtml(note) + "</div>";
      shownId = note ? openId : null;
      if (note) showInReader(note);
    } else {
      shownId = null;
      host.innerHTML = '<div class="notes-wrap">' + listHtml() + "</div>";
      showTopics(host);
      // Back from a note: the list where you left it.
      if (wasNote && !opts.keepScroll) window.scrollTo(0, listScroll);
    }
    if (flash && !flash.busy) flash = null; // said once
    if (!wired) { wire(host); wired = true; }
  }

  var wired = false;
  function closeMenu(from) {
    var list = from.closest(".section-menu-list");
    if (!list) return;
    list.hidden = true;
    var b = list.parentElement.querySelector(".section-menu-btn");
    if (b) b.setAttribute("aria-expanded", "false");
  }
  function wire(host) {
    host.addEventListener("click", function (e) {
      var t = e.target, el;
      if (!t || !t.closest) return;
      if ((el = t.closest(".notes-row"))) { openNote(el.dataset.note); return; }
      if (t.closest("#notesAdd, [data-notes-add]")) { pickFiles(true, upload); return; }
      if (t.closest("#notesBack")) { back(); return; }
      if (t.closest("#notesQuiz")) { setStudy("quiz", !study.quiz); return; }
      if ((el = t.closest("[data-study]"))) { setStudy(el.dataset.study, !study[el.dataset.study]); return; }
      if (t.closest("#notesSignIn")) {
        if (vocab().showFlashcardsPage) vocab().showFlashcardsPage();
        if (fc.openAccount) fc.openAccount();
        return;
      }
      if (t.closest("#notesTitle")) { var named = findNote(openId); if (named) rename(named); return; }
      if ((el = t.closest("[data-note-action]"))) {
        closeMenu(el);
        var note = findNote(openId);
        if (!note) return;
        ({ rename: rename, date: redate, replace: replace, delete: remove })[el.dataset.noteAction](note);
      }
    });
  }

  // Signing in, out or across accounts: the list belongs to whoever is
  // signed in now, and the device copy of someone who signed out goes.
  var lastUid = null;
  if (dataOps && dataOps.onAuthChange) {
    dataOps.onAuthChange(function (state) {
      var uid = state.session ? state.session.user.id : null;
      if (lastUid && lastUid !== uid) deviceClear(lastUid);
      if (uid !== lastUid) { notes = null; listFor = null; offline = false; flash = null; }
      lastUid = uid;
      rerender();
    });
  }
  window.addEventListener("online", function () { if (offline) { notes = null; listFor = null; rerender(); } });

  return {
    render: render,
    __testHooks: {
      cleanNote: cleanNote, fillFrame: fillFrame, describeFile: describeFile, isLessonNote: isLessonNote,
      isKitOriginal: isKitOriginal, fromKit: function (html) { return fromKit(parse(html)); },
      // Draws a lesson note from its HTML into a placeholder, as the reader does.
      showLessonHtml: function (html, into) { hostEl = hostEl || into.parentElement; showLesson(parse(html), into); }
    }
  };
})();
