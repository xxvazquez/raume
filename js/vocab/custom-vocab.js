// Custom vocabulary -- the reader's own words and tables, layered over the
// Git-only dataset the same way js/vocab/table-custom.js layers icons/names.
//
// Two ways in: a single row added to any table, or a whole table of my own
// (signed-in only). Bulk import parses a paste / CSV in the format
//   japanese(furigana),romaji,english
// where each kanji run carries its reading in ( ) straight after it --
// "帰(かえ)る", "お茶(ちゃ)" -> お + 茶(ちゃ), "醤油(しょうゆ)" (one run).
// A verb can come with its polite form, both columns split by " / ":
//   帰(かえ)る / 帰(かえ)ります,kaeru / kaerimasu,to go home
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
  // Only for a stored table that somehow has no category -- every table is
  // filed under a category its owner picked.
  var DEFAULT_CATEGORY = "Other";

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
  // A verb of my own carries its polite form too, like the built-in verbs:
  // verb = { jp: the -masu form's segments, romaji, verbClass }.
  var VERB_CLASSES = { godan: 1, ichidan: 1, irregular: 1 };
  function cleanVerb(v) {
    if (!v || typeof v !== "object" || !VERB_CLASSES[v.verbClass]) return null;
    var jp = cleanSegments(v.jp), romaji = String(v.romaji || "").trim();
    return jp.length && romaji ? { jp: jp, romaji: romaji, verbClass: v.verbClass } : null;
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
      var row = { id: r.id, tableId: r.tableId, jp: cleanSegments(r.jp), romaji: String(r.romaji), english: String(r.english), sort: Number(r.sort) || 0 };
      var verb = cleanVerb(r.verb);
      if (verb) row.verb = verb;
      return row;
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

  // "食(た)べる / 食(た)べます" with "taberu / tabemasu": a verb and its polite
  // form. Its group follows from the pair -- する / 来る are irregular, a る
  // verb whose ます form just swaps the る is a ru-verb, the rest u-verbs
  // (帰る -> 帰ります says u-verb, which the plain form alone can't).
  function plainOf(segs) { return segs.map(function (s) { return s.kanji || s.text || ""; }).join(""); }
  function verbClassOf(plain, polite) {
    if ((/する$/.test(plain) && /します$/.test(polite)) ||
        (/(くる|来る)$/.test(plain) && /(きます|来ます)$/.test(polite))) return "irregular";
    if (/る$/.test(plain) && polite === plain.slice(0, -1) + "ます") return "ichidan";
    return "godan";
  }
  function parseVerbPair(jpText, roText) {
    var jps = jpText.split(/\s*[\/／]\s*/), ros = roText.split(/\s*\/\s*/);
    if (jps.length !== 2 || ros.length !== 2) return null;
    var a = parseFurigana(jps[0]), b = parseFurigana(jps[1]);
    if (a.error) return a;
    if (b.error) return b;
    if (!/ます$/.test(plainOf(b.segments)) || !/masu$/i.test(ros[1])) return { error: "a verb pair is its plain form, then its ます form" };
    return { segments: a.segments, romaji: ros[0], verb: { jp: b.segments, romaji: ros[1], verbClass: verbClassOf(plainOf(a.segments), plainOf(b.segments)) } };
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
  // A line with tabs in it (cells copied from a spreadsheet) splits on its
  // tabs instead. Returns { rows:[{segments,romaji,english}], skipped:[{line,raw,reason}] }.
  function parseImport(text) {
    var out = { rows: [], skipped: [] };
    String(text || "").split(/\r?\n/).forEach(function (raw, idx) {
      var line = raw.trim();
      if (!line) return;
      var sep = line.indexOf("\t") !== -1 ? "\t" : ",";
      var c1 = line.indexOf(sep);
      var c2 = c1 === -1 ? -1 : line.indexOf(sep, c1 + 1);
      if (c1 === -1 || c2 === -1) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "needs three columns, separated by commas" });
        return;
      }
      var jp = stripQuotes(line.slice(0, c1));
      var ro = stripQuotes(line.slice(c1 + 1, c2));
      var en = stripQuotes(line.slice(c2 + 1).split("\t")[0]); // a spreadsheet's further columns aren't the English
      if (jp.toLowerCase() === "japanese" && ro.toLowerCase() === "romaji" && en.toLowerCase() === "english") return;
      if (!jp || !ro || !en) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "a column is empty" });
        return;
      }
      var pair = /[\/／]/.test(jp) ? parseVerbPair(jp, ro) : null;
      var fp = pair || parseFurigana(jp);
      if (fp.error) { out.skipped.push({ line: idx + 1, raw: line, reason: fp.error }); return; }
      if (!isRomajiUsable(ro)) {
        out.skipped.push({ line: idx + 1, raw: line, reason: "the romaji column has Japanese characters in it" });
        return;
      }
      var parsed = { segments: fp.segments, romaji: pair ? pair.romaji : ro, english: en };
      if (pair) parsed.verb = pair.verb;
      out.rows.push(parsed);
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

  // A table of my own has no way to say up front "this is going to be
  // whole sentences, not headwords" (unlike the built-in Phrases table,
  // which is simply authored with tableClass: "vocab-sentences"). Guess it
  // instead from what actually ended up in it -- a real sentence runs past
  // the longest built-in headwords (よろしくおねがいします is 11) and/or
  // carries 。/、, which no built-in word ever does. The whole table goes
  // stacked only when most of its rows are sentences: a word table with a
  // few greetings or phrases in it stays a word table, laid out exactly like
  // the built-in ones (Greetings holds よろしくおねがいします as a word row).
  var SENTENCE_PUNCTUATION = /[。、]/;
  function looksLikeSentence(jp) {
    var text = (jp || []).map(function (s) { return s.kanji || s.text || ""; }).join("");
    return text.length > 11 || SENTENCE_PUNCTUATION.test(text);
  }

  // Merge every custom table + row into RaumeStudy.data.vocabularyTables in
  // place. Idempotent -- strips whatever it injected last time first (marked
  // __custom), so it's safe to call on every change and after every sync.
  // A word of my own takes the JLPT level of the same word in raume's
  // tables -- written the same (先生), or, failing that, read the same when
  // that reading has one level only (せんせい). Every class word is also in
  // raume's own tables, so a class table is levelled like the rest; a word
  // raume doesn't have stays unlevelled, as its own unlisted words do.
  function builtInLevels(all) {
    var byText = {}, byReading = {};
    // The same writing twice keeps its easier level; a reading shared by
    // words of different levels (はし) is no answer at all.
    function note(map, k, n, ambiguousToZero) {
      if (!k) return;
      if (!(k in map)) map[k] = n;
      else if (map[k] !== n) map[k] = ambiguousToZero ? 0 : Math.max(map[k], n);
    }
    all.forEach(function (t) {
      if (t.__custom) return;
      t.rows.forEach(function (row) {
        var n = Number(row.jlpt);
        if (row.__custom || !(n >= 1 && n <= 5)) return;
        var jp = row.type === "verb-pair" && row.forms ? row.forms[0].jp : row.jp;
        note(byText, plainOf(jp || []), n, false);
        note(byReading, readingOf(jp || []), n, true);
      });
    });
    return function (jp) {
      var text = plainOf(jp || []);
      if (byText[text]) return byText[text];
      return byReading[readingOf(jp || [])] || 0;
    };
  }
  function readingOf(segs) { return segs.map(function (s) { return s.reading || s.text || ""; }).join(""); }
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
    var levelOf = builtInLevels(all);
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
      // A verb becomes a verb pair like the built-in ones (both forms in the
      // table, its group, the Verb -> conjugated form cards); it keeps jp / romaji
      // for the lists that show one line per word.
      var row = r.verb
        ? { id: r.id, type: "verb-pair", forms: [{ jp: r.jp, romaji: r.romaji }, { jp: r.verb.jp, romaji: r.verb.romaji }],
            verbClass: r.verb.verbClass, jp: r.jp, romaji: r.romaji, english: r.english, __custom: true }
        : { id: r.id, type: "word", jp: r.jp, romaji: r.romaji, english: r.english, __custom: true };
      var lv = levelOf(r.jp);
      if (lv) row.jlpt = lv;
      target.rows.push(row);
      if (!target.__custom) target.__hasCustomRows = true;
    });
    Object.keys(customById).forEach(function (id) {
      var t = customById[id];
      var n = t.rows.filter(function (r) { return looksLikeSentence(r.jp); }).length;
      if (n * 2 > t.rows.length) t.tableClass = "vocab-sentences";
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
    var row = {
      id: "cv-" + uuid(), tableId: String(tableId),
      jp: cleanSegments(parsed.segments), romaji: String(parsed.romaji || "").trim(),
      english: String(parsed.english || "").trim(), sort: nextSort()
    };
    var verb = cleanVerb(parsed.verb);
    if (verb) row.verb = verb;
    return row;
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

  // A category is a group inside a section, so it needs a name and can't
  // take a section's own -- a "Vocabulary" group on the Vocabulary page
  // reads as two names for one idea.
  var SECTION_NAMES = { vocabulary: 1, grammar: 0, kanji: 1, "n5 kanji": 1, notes: 1, practice: 1 };
  function cleanCategory(category) {
    var c = String(category || "").trim().slice(0, 60);
    if (!c) throw new Error("Choose a category for this table.");
    if (SECTION_NAMES[c.toLowerCase()]) throw new Error("“" + c + "” is the name of a page. Give the category another name.");
    return c;
  }

  function createTable(title, category) {
    if (!isSignedIn()) throw new Error("Sign in on the Practice page to create your own tables.");
    var t = {
      id: "ct-" + uuid(),
      title: String(title || "").trim().slice(0, 60) || "Untitled table",
      category: cleanCategory(category),
      sort: nextSort()
    };
    load().tables.push(t);
    persist();
    refreshApp();
    if (remote) { try { remote.addTable(t); } catch (e) { console.warn("custom vocab: table sync failed", e); } }
    return t;
  }

  // File one of the reader's own tables under another category -- an
  // existing one (it joins that group) or a new name. Blank = the default.
  function setTableCategory(id, category) {
    var t = load().tables.filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error("That table no longer exists.");
    var next = cleanCategory(category);
    if (next === t.category) return t;
    t.category = next;
    persist();
    refreshApp();
    if (remote) { try { remote.addTable(t); } catch (e) { console.warn("custom vocab: table sync failed", e); } }
    return t;
  }

  // parsed: {segments, romaji, english} from parseFurigana / parseImport --
  // same shape addRow takes, replacing the row's content in place (its id,
  // table, and sort position are untouched).
  function updateRow(id, parsed) {
    var row = load().rows.filter(function (r) { return r.id === id; })[0];
    if (!row) throw new Error("That word no longer exists.");
    row.jp = cleanSegments(parsed.segments);
    row.romaji = String(parsed.romaji || "").trim();
    row.english = String(parsed.english || "").trim();
    var verb = cleanVerb(parsed.verb);
    if (verb) row.verb = verb; else delete row.verb;
    persist();
    refreshApp();
    if (remote) { try { remote.addRows([row]); } catch (e) { console.warn("custom vocab: row sync failed", e); } }
    return row;
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
  // Undo a delete: the same rows back under their own ids and places, so
  // any flashcards made from them (kept by id, never deleted with the word)
  // pick up exactly where they were. A row whose table has gone stays gone.
  function restoreRows(rows) {
    var c = load(), have = {};
    c.rows.forEach(function (r) { have[r.id] = true; });
    var back = (rows || []).filter(function (r) { return r && !have[r.id] && tableExists(r.tableId); });
    if (!back.length) return [];
    c.rows = c.rows.concat(back);
    persist();
    refreshApp();
    if (remote) { try { remote.addRows(back); } catch (e) { console.warn("custom vocab: row sync failed", e); } }
    return back;
  }

  function deleteTable(id) {
    var c = load();
    var rowIds = c.rows.filter(function (r) { return r.tableId === id; }).map(function (r) { return r.id; });
    c.tables = c.tables.filter(function (t) { return t.id !== id; });
    c.rows = c.rows.filter(function (r) { return r.tableId !== id; });
    persist();
    // Its name / icon / colour / order go with it (synced like any edit).
    if (window.RaumeStudy.tableCustom && window.RaumeStudy.tableCustom.forget) window.RaumeStudy.tableCustom.forget(id);
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
    addRow: addRow, addRows: addRows, updateRow: updateRow,
    createTable: createTable, setTableCategory: setTableCategory,
    deleteRow: deleteRow, deleteRows: deleteRows, restoreRows: restoreRows, deleteTable: deleteTable,
    setRemote: setRemote, applyRemote: applyRemote, onChange: onChange,
    isSignedIn: isSignedIn, tableExists: tableExists,
    customTables: customTables, customRows: customRows, hasAny: hasAny,
    DEFAULT_CATEGORY: DEFAULT_CATEGORY,
    sanitize: sanitize, GUEST_KEY: GUEST_KEY
  };
})();
