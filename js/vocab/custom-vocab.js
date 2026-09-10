// Custom vocabulary -- the reader's own words and tables, layered over the
// Git-only dataset the same way js/vocab/table-custom.js layers icons/names.
//
// Two ways in: a single row added to any table, or a whole table of your own
// (signed-in only). Bulk import parses a paste / CSV in the format
//   japanese(furigana),romaji,english
// where each kanji run carries its reading in ( ) straight after it --
// "帰(かえ)る", "お茶(ちゃ)" -> お + 茶(ちゃ), "醤油(しょうゆ)" (one run).
//
// Storage: Supabase is authoritative. Signed in, localStorage is only a
// read-through cache of the custom_tables / custom_rows tables; as a guest the
// localStorage key IS the record (rows only -- no custom tables without an
// account). Guest rows migrate up to the account on first sign-in, like guest
// flashcard progress. The dataset in data/vocabulary.js is never touched; a
// custom row is merged into RaumeStudy.data.vocabularyTables at render time as
// an ordinary type:"word" row with a "cv-"-prefixed permanent id, so every
// downstream feature (search, print, furigana, speech, flashcards, FSRS) sees
// it as just another word. See the load-order comment in index.html.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.customVocab = (function () {
  "use strict";

  var GUEST_KEY = "raume-custom-vocab-guest-v1";
  var CACHE_KEY = "raume-custom-vocab-cache-v1";
  var DEFAULT_CATEGORY = "My vocabulary";

  // A kanji (CJK ideograph) plus the iteration marks that behave like one
  // inside a word (時々 -> ときどき is a single run).
  var IDEOGRAPH = /[々-〇一-鿿豈-﫿]/;
  var KANA_ONLY = /^[぀-ヿーｦ-ﾟ]+$/;
  var JP_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ々-〇]/;

  var cache = null;
  var loadedKey = null;
  var listeners = [];
  // Set by the flashcards bootstrap once auth resolves: { addRows, deleteRows,
  // addTable, deleteTable } -> thin Supabase writes. Non-null means signed in.
  var remote = null;

  function isSignedIn() { return !!remote; }
  function key() { return isSignedIn() ? CACHE_KEY : GUEST_KEY; }

  function blank() { return { tables: [], rows: [] }; }

  function cleanSegments(segs) {
    return (Array.isArray(segs) ? segs : []).map(function (s) {
      if (s && typeof s.kanji === "string" && typeof s.reading === "string") return { kanji: s.kanji, reading: s.reading };
      if (s && typeof s.text === "string") return { text: s.text };
      return null;
    }).filter(Boolean);
  }
  function sanitize(obj) {
    if (!obj || typeof obj !== "object") return blank();
    var tables = (Array.isArray(obj.tables) ? obj.tables : []).filter(function (t) {
      return t && typeof t.id === "string" && typeof t.title === "string";
    }).map(function (t) {
      return {
        id: t.id,
        title: String(t.title).slice(0, 60),
        category: (typeof t.category === "string" && t.category.trim()) ? t.category.trim().slice(0, 60) : DEFAULT_CATEGORY,
        sort: Number(t.sort) || 0
      };
    });
    var rows = (Array.isArray(obj.rows) ? obj.rows : []).filter(function (r) {
      return r && typeof r.id === "string" && typeof r.tableId === "string" &&
        Array.isArray(r.jp) && typeof r.romaji === "string" && typeof r.english === "string";
    }).map(function (r) {
      return { id: r.id, tableId: r.tableId, jp: cleanSegments(r.jp), romaji: String(r.romaji), english: String(r.english), sort: Number(r.sort) || 0 };
    }).filter(function (r) { return r.jp.length && r.romaji && r.english; });
    return { tables: tables, rows: rows };
  }
  function load() {
    var k = key();
    if (cache && loadedKey === k) return cache;
    try {
      var raw = window.localStorage.getItem(k);
      cache = sanitize(raw ? JSON.parse(raw) : null);
    } catch (e) { cache = blank(); }
    loadedKey = k;
    return cache;
  }
  function readGuest() {
    try { return sanitize(JSON.parse(window.localStorage.getItem(GUEST_KEY) || "null")); }
    catch (e) { return blank(); }
  }
  function persist() {
    try { window.localStorage.setItem(key(), JSON.stringify(load())); } catch (e) {}
  }
  function snapshot() { return JSON.parse(JSON.stringify(load())); }
  function announce() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---- parsing ----------------------------------------------------------

  // "帰(かえ)る" -> [{kanji:"帰",reading:"かえ"},{text:"る"}].
  // Returns { segments } or { error: "<why>" }.
  function parseFurigana(input) {
    var str = String(input == null ? "" : input).trim().replace(/（/g, "(").replace(/）/g, ")");
    if (!str) return { error: "no Japanese given" };
    var segments = [], buf = "", i = 0;
    function flush() { if (buf) { segments.push({ text: buf }); buf = ""; } }
    while (i < str.length) {
      var ch = str[i];
      if (IDEOGRAPH.test(ch)) {
        var run = "";
        while (i < str.length && IDEOGRAPH.test(str[i])) { run += str[i]; i++; }
        if (str[i] !== "(") return { error: 'kanji "' + run + '" needs its reading in ( ) right after it' };
        var close = str.indexOf(")", i + 1);
        if (close === -1) return { error: 'unclosed ( ) after "' + run + '"' };
        var reading = str.slice(i + 1, close).trim();
        if (!reading || !KANA_ONLY.test(reading)) return { error: 'the reading for "' + run + '" must be kana' };
        flush();
        segments.push({ kanji: run, reading: reading });
        i = close + 1;
      } else if (ch === "(") {
        return { error: "( ) reading with no kanji before it" };
      } else {
        buf += ch; i++;
      }
    }
    flush();
    if (!segments.length) return { error: "no Japanese given" };
    var joined = segments.map(function (s) { return s.kanji || s.text; }).join("");
    if (!JP_SCRIPT.test(joined)) return { error: "no Japanese script -- did you paste the columns in the right order?" };
    return { segments: segments };
  }

  function isRomajiUsable(s) {
    var fc = window.RaumeStudy.flashcards;
    var fn = fc && fc.vocabIndex && fc.vocabIndex.isRomajiUsable;
    return fn ? fn(s) : !/[぀-ヿ㐀-鿿]/.test(String(s || ""));
  }
  function stripQuotes(s) {
    s = String(s == null ? "" : s).trim();
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') s = s.slice(1, -1).replace(/""/g, '"');
    return s.trim();
  }

  // A paste / CSV, one record per non-blank line, three columns:
  // japanese(furigana),romaji,english. English may contain commas, so only the
  // first two commas split -- romaji and the furigana field never carry one.
  // Returns { rows:[{segments,romaji,english}], skipped:[{line,raw,reason}] }.
  function parseImport(text) {
    var out = { rows: [], skipped: [] };
    String(text || "").split(/\r?\n/).forEach(function (raw, idx) {
      var line = raw.trim();
      if (!line) return;
      var c1 = line.indexOf(",");
      var c2 = c1 === -1 ? -1 : line.indexOf(",", c1 + 1);
      if (c1 === -1 || c2 === -1) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "needs three comma-separated columns" });
        return;
      }
      var jp = stripQuotes(line.slice(0, c1));
      var ro = stripQuotes(line.slice(c1 + 1, c2));
      var en = stripQuotes(line.slice(c2 + 1));
      if (jp.toLowerCase() === "japanese" && ro.toLowerCase() === "romaji" && en.toLowerCase() === "english") return;
      if (!jp || !ro || !en) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "a column is empty" });
        return;
      }
      var fp = parseFurigana(jp);
      if (fp.error) { out.skipped.push({ line: idx + 1, raw: line, reason: fp.error }); return; }
      if (!isRomajiUsable(ro)) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "the romaji column has Japanese characters in it" });
        return;
      }
      out.rows.push({ segments: fp.segments, romaji: ro, english: en });
    });
    return out;
  }

  // ---- dataset merge ---------------------------------------------------

  function bySort(a, b) { return (a.sort || 0) - (b.sort || 0); }
  function tableExists(tableId) {
    tableId = String(tableId);
    var data = window.RaumeStudy.data && window.RaumeStudy.data.vocabularyTables;
    var inData = !!data && data.some(function (t) { return !t.__custom && String(t.id) === tableId; });
    return inData || load().tables.some(function (t) { return t.id === tableId; });
  }

  // Merge every custom table + row into RaumeStudy.data.vocabularyTables in
  // place. Idempotent -- strips whatever it injected last time first (marked
  // __custom), so it's safe to call on every change and after every sync.
  function applyToDataset() {
    var data = window.RaumeStudy.data;
    if (!data || !Array.isArray(data.vocabularyTables)) return;
    var all = data.vocabularyTables;
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].__custom) { all.splice(i, 1); continue; }
      if (all[i].__hasCustomRows) {
        all[i].rows = all[i].rows.filter(function (r) { return !r.__custom; });
        delete all[i].__hasCustomRows;
      }
    }
    var c = load();
    var customById = {};
    c.tables.slice().sort(bySort).forEach(function (t) {
      var obj = { id: t.id, title: t.title, category: t.category || DEFAULT_CATEGORY, rows: [], __custom: true };
      customById[t.id] = obj;
      all.push(obj);
    });
    c.rows.slice().sort(bySort).forEach(function (r) {
      var target = customById[r.tableId];
      if (!target) {
        var hit = all.filter(function (t) { return !t.__custom && String(t.id) === String(r.tableId); });
        target = hit[0];
      }
      if (!target) return; // stale target table -- drop quietly
      target.rows.push({ id: r.id, type: "word", jp: r.jp, romaji: r.romaji, english: r.english, __custom: true });
      if (!target.__custom) target.__hasCustomRows = true;
    });
  }

  // Push the dataset change through to everything that already rendered.
  function refreshApp() {
    applyToDataset();
    var fc = window.RaumeStudy.flashcards;
    if (fc && fc.vocabIndex && fc.vocabIndex.resetIndex) fc.vocabIndex.resetIndex();
    var v = window.RaumeStudy.vocab;
    if (v && v.renderAllTables) v.renderAllTables();
    announce();
  }

  // ---- mutations ------------------------------------------------------

  // A monotonic sort key: milliseconds since epoch with a per-call counter in
  // the low digits, so rows added in the same millisecond (a bulk import) keep
  // a stable order that survives a round-trip through the integer sort_index
  // column and a re-fetch with no explicit ORDER BY.
  var sortSeq = 0;
  function nextSort() { return Date.now() * 1000 + (sortSeq++ % 1000); }

  function toRow(parsed, tableId) {
    return {
      id: "cv-" + uuid(), tableId: String(tableId),
      jp: cleanSegments(parsed.segments), romaji: String(parsed.romaji || "").trim(),
      english: String(parsed.english || "").trim(), sort: nextSort()
    };
  }

  // parsedList: [{segments, romaji, english}] from parseFurigana / parseImport.
  function addRows(tableId, parsedList) {
    if (!tableExists(tableId)) throw new Error("That table no longer exists.");
    var list = (parsedList || []).filter(function (p) { return p && p.segments && p.romaji && p.english; });
    if (!list.length) return [];
    var made = list.map(function (p) { return toRow(p, tableId); });
    load().rows = load().rows.concat(made);
    persist();
    refreshApp();
    if (remote) { try { remote.addRows(made); } catch (e) { console.warn("custom vocab: row sync failed", e); } }
    return made;
  }
  function addRow(tableId, parsed) { return addRows(tableId, [parsed])[0]; }

  function createTable(title, category) {
    if (!isSignedIn()) throw new Error("Sign in on the Flashcards page to create your own tables.");
    var t = {
      id: "ct-" + uuid(),
      title: String(title || "").trim().slice(0, 60) || "Untitled table",
      category: String(category || "").trim().slice(0, 60) || DEFAULT_CATEGORY,
      sort: nextSort()
    };
    load().tables.push(t);
    persist();
    refreshApp();
    if (remote) { try { remote.addTable(t); } catch (e) { console.warn("custom vocab: table sync failed", e); } }
    return t;
  }

  function deleteRows(ids) {
    var set = {};
    (ids || []).forEach(function (id) { set[id] = true; });
    var c = load();
    c.rows = c.rows.filter(function (r) { return !set[r.id]; });
    persist();
    refreshApp();
    if (remote && ids && ids.length) { try { remote.deleteRows(ids); } catch (e) { console.warn("custom vocab: delete sync failed", e); } }
  }
  function deleteRow(id) { return deleteRows([id]); }

  function deleteTable(id) {
    var c = load();
    var rowIds = c.rows.filter(function (r) { return r.tableId === id; }).map(function (r) { return r.id; });
    c.tables = c.tables.filter(function (t) { return t.id !== id; });
    c.rows = c.rows.filter(function (r) { return r.tableId !== id; });
    persist();
    refreshApp();
    if (remote) { try { remote.deleteTable(id, rowIds); } catch (e) { console.warn("custom vocab: delete sync failed", e); } }
  }

  // ---- sync ----------------------------------------------------------

  function setRemote(ops) {
    var was = isSignedIn();
    remote = ops || null;
    if (was !== isSignedIn()) { cache = null; loadedKey = null; applyToDataset(); }
  }

  // The account's rows/tables just came back from Supabase. Remote wins, but
  // anything held only locally -- guest rows added before sign-in, or a row
  // whose insert didn't reach the server yet (offline) -- is kept and pushed
  // back up, the same union-and-reconcile the paused-tables list uses.
  function applyRemote(obj) {
    var remoteData = sanitize(obj);
    var haveRow = {}, haveTable = {};
    remoteData.rows.forEach(function (r) { haveRow[r.id] = true; });
    remoteData.tables.forEach(function (t) { haveTable[t.id] = true; });
    var localPool = (isSignedIn() ? load().rows : []).concat(readGuest().rows);
    var extraRows = [];
    localPool.forEach(function (r) { if (!haveRow[r.id]) { haveRow[r.id] = true; extraRows.push(r); } });
    var extraTables = (isSignedIn() ? load().tables : []).filter(function (t) { return !haveTable[t.id]; });
    cache = { tables: remoteData.tables.concat(extraTables), rows: remoteData.rows.concat(extraRows) };
    loadedKey = CACHE_KEY;
    persist();
    refreshApp();
    if (remote) {
      extraTables.forEach(function (t) { try { remote.addTable(t); } catch (e) {} });
      if (extraRows.length) { try { remote.addRows(extraRows); } catch (e) {} }
    }
  }

  // ---- reads for the UI --------------------------------------------

  function customTables() { return load().tables.slice().sort(bySort); }
  function customRows() { return load().rows.slice().sort(bySort); }
  function hasAny() { return !!(load().tables.length || load().rows.length); }

  return {
    parseFurigana: parseFurigana, parseImport: parseImport,
    applyToDataset: applyToDataset,
    addRow: addRow, addRows: addRows,
    createTable: createTable,
    deleteRow: deleteRow, deleteRows: deleteRows, deleteTable: deleteTable,
    setRemote: setRemote, applyRemote: applyRemote, onChange: onChange,
    isSignedIn: isSignedIn, tableExists: tableExists,
    customTables: customTables, customRows: customRows, hasAny: hasAny,
    DEFAULT_CATEGORY: DEFAULT_CATEGORY
  };
})();
