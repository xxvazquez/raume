// The Customize page (RaumeStudy.customize) -- one place to give any
// vocabulary table a custom name, icon, and running order. Reached from the
// gear in the masthead (#customize); routing and show/hide live in
// js/vocab/interactions.js.
//
// It writes through RaumeStudy.tableCustom, the same per-table personalisation
// store the inline section-header icon picker uses, so a change here shows up on
// the vocabulary page and in Flashcards > Manage, and syncs across devices while
// signed in. The names/icons/order never touch the dataset.
//
// The "Your vocabulary" block writes through RaumeStudy.customVocab
// (js/vocab/custom-vocab.js) instead -- the reader's own rows and tables, which
// that module merges into RaumeStudy.data.vocabularyTables at render time.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.customize = (function () {
  "use strict";

  var esc = window.RaumeStudy.shared.escapeHtml;
  var hostEl = null;
  var wired = false;
  var pendingFocus = null;
  // A one-shot status line for the "Add a word" / import forms -- survives the
  // re-render that follows the mutation, then clears.
  var cvFlash = null;
  // One-shot: the skipped lines left in the import box after a partial import.
  var cvImportLeftover = null;
  // Which table each form's <select> points at -- kept across the re-render a
  // mutation triggers, so importing / adding several words into one table
  // doesn't reset the picker to the first option every time.
  var cvTarget = { add: "", import: "" };
  // Set around a customize-originated custom-vocab mutation so its onChange
  // doesn't double-render mid-action (the action re-renders itself).
  var cvSelfMutating = false;
  // id of the custom-vocab row currently open for editing, if any -- unlike
  // cvFlash this isn't one-shot, it stays open across renders until saved or
  // cancelled.
  var cvEditingId = null;
  var cvEditError = null;
  // Whether each info popover is open -- like the group open/close state
  // below, these survive a re-render (they're plain module vars, not rebuilt
  // from scratch each time) but default closed on first render.
  var czInfoMainOpen = false;
  var cvInfoVocabOpen = false;
  var cvInfoImportOpen = false;
  // Every collapsible <details> on this page -- category groups, the Your
  // vocabulary action cards, one per custom table in Words you've added --
  // shares one open/close mechanism: each carries a data-open-key, and
  // render() (see there) reads the live DOM's open states into this map
  // right before throwing it away, then reapplies them after rebuilding, so
  // a native <summary> click survives an unrelated re-render (renaming a
  // table, say) without any per-element event wiring. A key with no entry
  // yet falls back to DETAILS_DEFAULT_OPEN, so what a reader has never
  // touched still opens (or stays closed) the way the page intends by
  // default -- everything collapsed except the one primary action.
  var czDetailsOpen = {};
  var DETAILS_DEFAULT_OPEN = { add: true };

  var SECTION_LABEL = { vocabulary: "Vocabulary", grammar: "Grammar", phrases: "Phrases", travel: "Travel" };

  function tc() { return window.RaumeStudy.tableCustom; }
  function cv() { return window.RaumeStudy.customVocab; }
  function V() { return window.RaumeStudy.vocab; }
  function tables() { return window.RaumeStudy.data.vocabularyTables || []; }

  var ARROW_UP = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 13.5V4.5M4.5 9 9 4.5 13.5 9"/></svg>';
  var ARROW_DOWN = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5v9M4.5 9 9 13.5 13.5 9"/></svg>';

  // Section (fixed: Vocabulary / Grammar / Travel) > category (custom order,
  // then A-Z) > table (custom order, then A-Z) -- the exact sequence the
  // vocabulary page and the table directory now lay out in.
  function grouped() {
    var bySec = { vocabulary: [], grammar: [], phrases: [], travel: [] };
    tables().forEach(function (t) { bySec[V().sectionOf(t.category)].push(t); });
    var out = [];
    ["vocabulary", "grammar", "phrases", "travel"].forEach(function (sec) {
      var byCat = {};
      bySec[sec].forEach(function (t) {
        var c = t.category || "Tables";
        (byCat[c] = byCat[c] || []).push(t);
      });
      var names = V().orderedCategoryNames(Object.keys(byCat), sec);
      names.forEach(function (name, i) {
        out.push({
          section: sec, name: name,
          canMoveUp: names.length > 1 && i > 0,
          canMoveDown: names.length > 1 && i < names.length - 1,
          tables: V().orderTables(name, byCat[name])
        });
      });
    });
    return out;
  }

  function iconSlot(id) { return V().tableIconGlyph ? V().tableIconGlyph(id) : ""; }
  function isCustomised(id) {
    var e = tc() ? tc().entry(id) : {};
    return !!(e.icon || e.name);
  }
  function moveBtns(kind, key, canUp, canDown) {
    return '<span class="cz-move">' +
      '<button type="button" class="cz-move-btn cz-move-up" data-move="' + kind + '" data-key="' + esc(String(key)) +
        '" data-dir="-1"' + (canUp ? "" : " disabled") + ' aria-label="Move up" title="Move up">' + ARROW_UP + "</button>" +
      '<button type="button" class="cz-move-btn cz-move-down" data-move="' + kind + '" data-key="' + esc(String(key)) +
        '" data-dir="1"' + (canDown ? "" : " disabled") + ' aria-label="Move down" title="Move down">' + ARROW_DOWN + "</button>" +
      "</span>";
  }

  function rowHtml(t, canUp, canDown) {
    var name = tc() ? tc().nameOf(t.id) : "";
    return '<li class="cz-row" data-table-id="' + t.id + '">' +
      moveBtns("table", t.id, canUp, canDown) +
      '<button type="button" class="section-icon-btn cz-row-icon" data-icon-for="' + t.id +
        '" title="Choose an icon" aria-label="Choose an icon for ' + esc(name || t.title) + '">' +
        '<span class="section-icon' + (tc() && tc().iconOf(t.id) ? "" : " section-icon-empty") + '">' + iconSlot(t.id) + "</span></button>" +
      '<label class="cz-row-field">' +
        '<input type="text" class="cz-row-name" maxlength="40" autocomplete="off" ' +
          'aria-label="Custom name for ' + esc(t.title) + '" placeholder="' + esc(t.title) + '"' +
          (name ? ' value="' + esc(name) + '"' : "") + ">" +
        '<span class="cz-row-original"' + (name ? "" : " hidden") + ">Originally " + esc(t.title) + "</span>" +
      "</label>" +
      '<button type="button" class="cz-row-reset" data-reset-for="' + t.id + '"' +
        (isCustomised(t.id) ? "" : " disabled") + ' title="Restore this table’s original name and icon">Reset</button>' +
      "</li>";
  }

  // ---- custom vocabulary (the reader's own rows/tables) -----------------

  var TRASH_ICON = '<svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h10M7.5 5V3.5h3V5M6 5l.6 9h4.8L12 5"/></svg>';
  var EDIT_ICON = '<svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.3 3.7 14.3 5.7 6 14H4v-2z"/></svg>';
  var INFO_ICON = '<svg viewBox="0 0 18 18" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="7"/><path d="M9 8.4v4"/><circle cx="9" cy="5.6" r="1" fill="currentColor" stroke="none"/></svg>';

  // A small "i" button that shows/hides a block of explanatory text next to
  // it, so the text doesn't sit on the page permanently. `open` is this
  // instance's current state; `key` matches a data-info value the click
  // handler below switches on.
  function infoButtonHtml(key, open, label) {
    return '<button type="button" class="info-btn" data-info="' + key + '" aria-expanded="' +
      (open ? "true" : "false") + '" aria-controls="info-' + key + '" aria-label="' + esc(label) + '">' + INFO_ICON + "</button>";
  }
  function infoPanelHtml(key, open, innerHtml) {
    return '<div class="info-panel" id="info-' + key + '"' + (open ? "" : " hidden") + ">" + innerHtml + "</div>";
  }

  // The reverse of parseFurigana -- segments back to the single-line
  // "japanese(furigana),romaji,english" form the add-word / import forms use,
  // so editing a row starts from text in the same format you'd type to add it.
  function segmentsToText(jp) {
    return (jp || []).map(function (s) { return s.kanji ? s.kanji + "(" + s.reading + ")" : (s.text || ""); }).join("");
  }

  // <select> of every table a custom row can be attached to: built-in tables
  // grouped by category, then the reader's own custom tables.
  function targetSelect(cls, selected) {
    selected = selected == null ? "" : String(selected);
    var opt = function (val, label) {
      return '<option value="' + esc(val) + '"' + (val === selected ? " selected" : "") + ">" + esc(label) + "</option>";
    };
    var opts = "";
    grouped().forEach(function (g) {
      opts += '<optgroup label="' + esc(g.name) + '">';
      g.tables.forEach(function (t) {
        if (t.__custom) return; // custom tables get their own group below
        opts += opt(String(t.id), V().tableTitle ? V().tableTitle(t.id, t.title) : t.title);
      });
      opts += "</optgroup>";
    });
    var mine = cv() ? cv().customTables() : [];
    if (mine.length) {
      opts += '<optgroup label="Your tables">';
      mine.forEach(function (t) { opts += opt(t.id, V().tableTitle ? V().tableTitle(t.id, t.title) : t.title); });
      opts += "</optgroup>";
    }
    return '<select class="' + cls + '">' + opts + "</select>";
  }

  // In-place edit form for one custom-vocab row, same single-line format as
  // "Add a word": japanese(furigana), romaji, english.
  function editRowHtml(r) {
    var text = segmentsToText(r.jp) + ", " + r.romaji + ", " + r.english;
    return '<li class="cv-owned-row cv-owned-row-edit">' +
      '<input type="text" class="cv-edit-input" data-row="' + esc(r.id) + '" autocomplete="off" spellcheck="false" value="' + esc(text) + '">' +
      '<span class="cv-owned-actions">' +
      '<button type="button" class="cv-btn cv-edit-save" data-row="' + esc(r.id) + '">Save</button>' +
      '<button type="button" class="cv-edit-cancel">Cancel</button>' +
      "</span>" +
      (cvEditError ? '<div class="cv-preview cv-preview-bad cv-edit-error">' + esc(cvEditError) + "</div>" : "") +
      "</li>";
  }

  // The reader's rows, grouped by the table they sit in (built-in or
  // custom) -- one collapsed-by-default <details> per table, so a long list
  // (hundreds of words across many tables) stays a list of tables to open,
  // not one scroll through every word at once.
  function customListHtml() {
    var byTable = [];
    tables().forEach(function (t) {
      var rows = (t.rows || []).filter(function (r) { return r.__custom; });
      if (!rows.length && !t.__custom) return;
      byTable.push({ table: t, rows: rows });
    });
    if (!byTable.length) return '<p class="cv-empty">You haven’t added any words yet.</p>';
    return byTable.map(function (grp) {
      var t = grp.table;
      var title = esc(V().tableTitle ? V().tableTitle(t.id, t.title) : t.title);
      var count = grp.rows.length + (grp.rows.length === 1 ? " word" : " words");
      var summary = '<summary class="cv-owned-head disclosure-caret"><span class="cv-owned-title">' + title +
        (t.__custom ? ' <span class="cv-owned-tag">your table</span>' : "") + "</span>" +
        '<span class="cv-owned-count">' + count + "</span>" +
        (t.__custom ? '<button type="button" class="cv-del-table" data-table="' + esc(t.id) + '">Delete table</button>' : "") + "</summary>";
      var rows = grp.rows.length
        ? grp.rows.map(function (r) {
            if (r.id === cvEditingId) return editRowHtml(r);
            return '<li class="cv-owned-row">' +
              '<span class="cv-owned-jp" lang="ja">' + V().jpSegmentsHtml(r.jp, false) + "</span>" +
              '<span class="cv-owned-ro">' + esc(r.romaji) + "</span>" +
              '<span class="cv-owned-en">' + esc(r.english) + "</span>" +
              '<span class="cv-owned-actions">' +
              '<button type="button" class="cv-edit-row" data-row="' + esc(r.id) + '" aria-label="Edit this word" title="Edit this word">' + EDIT_ICON + "</button>" +
              '<button type="button" class="cv-del-row" data-row="' + esc(r.id) + '" aria-label="Delete this word" title="Delete this word">' + TRASH_ICON + "</button>" +
              "</span></li>";
          }).join("")
        : '<li class="cv-owned-row cv-owned-row-empty">No words in this table yet.</li>';
      return '<details class="cv-owned-group" data-open-key="owned:' + esc(t.id) + '">' + summary + '<ul class="cv-owned-list">' + rows + "</ul></details>";
    }).join("");
  }

  function customVocabSection() {
    var signedIn = !!(cv() && cv().isSignedIn());
    return '<section class="cv-section">' +
      '<h2>Your vocabulary' + infoButtonHtml("vocab", cvInfoVocabOpen, "About your vocabulary") + "</h2>" +
      infoPanelHtml("vocab", cvInfoVocabOpen,
        '<p>Add your own words to any table, or build a table of your own. Write Japanese with each kanji’s reading in parentheses right after it — <code>帰(かえ)る</code>, <code>お茶(ちゃ)</code>, <code>醤油(しょうゆ)</code>. Kana-only words need no parentheses.' +
        (signedIn ? " Saved to your account and synced to your other devices." : " Saved in this browser. Sign in on the Flashcards page to sync them and to create your own tables.") + "</p>") +

      '<details class="cv-card" data-open-key="add">' +
      '<summary class="cv-card-summary disclosure-caret">Add a word</summary>' +
      '<label class="cv-field"><span>Table</span>' + targetSelect("cv-add-target", cvTarget.add) + "</label>" +
      '<label class="cv-field"><span>Word</span>' +
      '<input type="text" class="cv-add-input" autocomplete="off" spellcheck="false" placeholder="帰(かえ)る, kaeru, to return"></label>' +
      '<div class="cv-preview" hidden></div>' +
      '<div class="cv-add-actions"><button type="button" class="cv-btn cv-add-btn">Add word</button>' +
      '<span role="status" aria-live="polite">' + flashHtml("add") + "</span></div>" +
      "</details>" +

      (signedIn
        ? '<details class="cv-card" data-open-key="new">' +
          '<summary class="cv-card-summary disclosure-caret">New table</summary>' +
          '<label class="cv-field"><span>Name</span><input type="text" class="cv-new-title" maxlength="60" autocomplete="off" placeholder="e.g. Restaurant phrases"></label>' +
          '<label class="cv-field"><span>Category</span><input type="text" class="cv-new-cat" maxlength="60" autocomplete="off" placeholder="My vocabulary"></label>' +
          '<div class="cv-add-actions"><button type="button" class="cv-btn cv-new-btn">Create table</button></div></details>'
        : "") +

      '<details class="cv-card" data-open-key="import">' +
      '<summary class="cv-card-summary disclosure-caret">Import a list' + infoButtonHtml("import", cvInfoImportOpen, "Import format") + "</summary>" +
      infoPanelHtml("import", cvInfoImportOpen,
        '<p class="cv-hint">One word per line, three columns: <code>japanese(furigana),romaji,english</code> (same furigana format as above). The English column may contain commas. A first line of <code>japanese,romaji,english</code> is treated as a header. Bad rows are skipped and listed — fix and re-import just those.</p>') +
      '<label class="cv-field"><span>Into table</span>' + targetSelect("cv-import-target", cvTarget.import) + "</label>" +
      '<textarea class="cv-import-text" rows="5" spellcheck="false" placeholder="茄子(なす),nasu,eggplant&#10;人参(にんじん),ninjin,carrot">' + esc(cvImportLeftover || "") + "</textarea>" +
      '<div class="cv-add-actions">' +
      '<label class="cv-file-btn">Choose a .csv / .txt file…<input type="file" class="cv-import-file" accept=".csv,.txt,text/csv,text/plain"></label>' +
      '<button type="button" class="cv-btn cv-import-btn">Import</button></div>' +
      flashHtml("import") +
      "</details>" +

      '<div class="cv-card cv-owned"><h3>Words you’ve added</h3>' + customListHtml() + "</div>" +
      "</section>";
  }

  // grouped() is flat (section, then category, in order) -- bucket it back
  // into runs of consecutive same-section entries so each section can carry
  // its own eyebrow label and colour. A section with exactly one category
  // sharing the section's own name (Grammar, Phrases, Travel today -- each
  // ships as a single category literally called "Grammar" etc.) skips the
  // redundant eyebrow-then-identical-row and renders as one merged heading
  // instead; Vocabulary's three real subcategories keep both levels, since
  // there they're each telling you something the eyebrow doesn't.
  function sectionRuns() {
    var runs = [];
    grouped().forEach(function (g) {
      var last = runs[runs.length - 1];
      if (!last || last.section !== g.section) { last = { section: g.section, items: [] }; runs.push(last); }
      last.items.push(g);
    });
    return runs;
  }

  // A category (or a merged solo section) is a native <details> -- collapsed
  // unless render() finds it was already open on the DOM it's about to
  // replace (see there). No JS needed for the disclosure itself, just the
  // move buttons inside <summary> need e.preventDefault() so an arrow click
  // doesn't also toggle it (wired in the click handler below).
  function html() {
    var groups = sectionRuns().map(function (run) {
      var label = SECTION_LABEL[run.section] || run.section;
      var solo = run.items.length === 1 && run.items[0].name === label;
      var eyebrow = solo ? "" : '<h3 class="cz-section-label" data-section="' + run.section + '">' + esc(label) + "</h3>";
      var body = run.items.map(function (g) {
        var rows = g.tables.map(function (t, i) {
          return rowHtml(t, i > 0, i < g.tables.length - 1);
        }).join("");
        var displayName = solo ? label : g.name;
        var summary = '<summary class="cz-group-title disclosure-caret' + (solo ? " cz-group-title-solo" : "") + '" data-section="' + run.section + '">' +
          (g.canMoveUp || g.canMoveDown ? moveBtns("category", g.name, g.canMoveUp, g.canMoveDown) : "") +
          '<span class="cz-group-name">' + esc(displayName) + "</span>" +
          '<span class="cz-group-count">' + g.tables.length + "</span></summary>";
        return '<details class="cz-group" data-open-key="' + esc("cat:" + g.section + "|" + g.name) + '">' +
          summary + '<ul class="cz-list">' + rows + "</ul></details>";
      }).join("");
      return '<section class="cz-section-block">' + eyebrow + body + "</section>";
    }).join("");
    var canResetOrder = tc() && tc().hasCustomOrder();
    return '<div class="cz-intro">' +
      "<h2>Customize tables" + infoButtonHtml("main", czInfoMainOpen, "What this page does") + "</h2>" +
      (canResetOrder ? '<button type="button" class="cz-reset-order" data-reset-order>Reset order</button>' : "") +
      infoPanelHtml("main", czInfoMainOpen,
        '<p>Give any vocabulary table your own name and icon, and put the tables and categories in the order you want. Changes save as you make them and show up everywhere the table appears — its section header, the “Jump to a table” list, and Flashcards › Manage.</p>' +
        "<ul class=\"cz-tips\">" +
          "<li><strong>Icon</strong> — click the icon on a row to open the picker (~165 line icons, plus “Upload image…” for your own).</li>" +
          "<li><strong>Name</strong> — type in the field. Leave it empty to keep the original (shown in grey).</li>" +
          "<li><strong>Order</strong> — the ▲▼ buttons move a table within its category, or a category within its section.</li>" +
          "<li><strong>Reset</strong> puts a single table’s name and icon back to how it shipped.</li>" +
          "<li>Signed in on the Flashcards page? Your changes sync to your other devices. As a guest they’re saved in this browser only.</li>" +
        "</ul>") +
      "</div>" + groups + (cv() ? customVocabSection() : "");
  }

  // ---- moves --------------------------------------------------------------
  function categoriesInSection(sec) {
    var names = {};
    tables().forEach(function (t) {
      if (V().sectionOf(t.category) === sec) names[t.category || "Tables"] = 1;
    });
    return V().orderedCategoryNames(Object.keys(names), sec);
  }
  function moveOne(list, item, dir) {
    var i = list.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return null;
    list.splice(i, 1);
    list.splice(j, 0, item);
    return list;
  }
  function moveTable(id, dir) {
    var t = tables().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!t) return;
    var cat = t.category || "Tables";
    var sameCat = tables().filter(function (x) { return (x.category || "Tables") === cat; });
    var ids = V().orderTables(cat, sameCat).map(function (x) { return String(x.id); });
    if (moveOne(ids, String(id), dir)) {
      pendingFocus = '.cz-row[data-table-id="' + id + '"] .cz-move-btn:not([disabled])';
      tc().setTableOrder(cat, ids);
    }
  }
  function moveCategory(name, dir) {
    var sec = V().sectionOf(name);
    var names = categoriesInSection(sec);
    if (moveOne(names, name, dir)) {
      pendingFocus = '.cz-group-title .cz-move-btn[data-key="' + cssAttr(name) + '"]:not([disabled])';
      tc().setCategoryOrder(sec, names);
    }
  }
  function cssAttr(v) { return String(v).replace(/["\\]/g, "\\$&"); }

  function commitName(input) {
    var row = input.closest(".cz-row");
    if (row) tc().setName(row.dataset.tableId, input.value);
  }

  // ---- lifecycle --------------------------------------------------------
  function wire(host) {
    // A committed name edit (blur / Enter) -- "change", not "input", so this
    // doesn't write to storage (and push to the account) on every keystroke.
    host.addEventListener("change", function (e) {
      if (e.target.classList.contains("cz-row-name")) commitName(e.target);
    });
    host.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList.contains("cz-row-name")) {
        e.preventDefault();
        commitName(e.target);
        e.target.blur();
      }
    });
    host.addEventListener("click", function (e) {
      var move = e.target.closest && e.target.closest(".cz-move-btn");
      if (move && !move.disabled) {
        // A category's move buttons sit inside its <summary> -- without this
        // the click would also toggle the <details> open/closed as a side effect.
        e.preventDefault();
        var dir = Number(move.dataset.dir);
        if (move.dataset.move === "table") moveTable(move.dataset.key, dir);
        else moveCategory(move.dataset.key, dir);
        return;
      }
      var info = e.target.closest && e.target.closest(".info-btn");
      if (info) {
        e.preventDefault(); // the Import card's info button sits inside its <summary>
        var infoKey = info.dataset.info;
        if (infoKey === "main") czInfoMainOpen = !czInfoMainOpen;
        else if (infoKey === "vocab") cvInfoVocabOpen = !cvInfoVocabOpen;
        else if (infoKey === "import") cvInfoImportOpen = !cvInfoImportOpen;
        pendingFocus = '.info-btn[data-info="' + infoKey + '"]';
        render(host);
        return;
      }
      var reset = e.target.closest && e.target.closest(".cz-row-reset");
      if (reset && tc()) { tc().clear(reset.dataset.resetFor); return; }
      if (e.target.closest && e.target.closest(".cz-reset-order") && tc()) tc().resetOrder();
      if (e.target.closest && e.target.closest(".cv-add-btn")) { addWord(host); return; }
      if (e.target.closest && e.target.closest(".cv-new-btn")) { createTable(host); return; }
      if (e.target.closest && e.target.closest(".cv-import-btn")) { runImport(host); return; }
      var delRow = e.target.closest && e.target.closest(".cv-del-row");
      if (delRow && cv()) { cv().deleteRow(delRow.dataset.row); return; }
      var delTable = e.target.closest && e.target.closest(".cv-del-table");
      if (delTable && cv()) {
        e.preventDefault(); // sits inside its table's <summary> -- don't also toggle it
        if (window.confirm("Delete this table and every word in it? This can’t be undone.")) cv().deleteTable(delTable.dataset.table);
        return;
      }
      var editRow = e.target.closest && e.target.closest(".cv-edit-row");
      if (editRow) { cvEditingId = editRow.dataset.row; cvEditError = null; pendingFocus = ".cv-edit-input"; render(host); return; }
      if (e.target.closest && e.target.closest(".cv-edit-cancel")) { cvEditingId = null; cvEditError = null; render(host); return; }
      var editSave = e.target.closest && e.target.closest(".cv-edit-save");
      if (editSave) { saveEdit(host, editSave.dataset.row); return; }
      // .section-icon-btn is handled by the delegated picker hook in
      // interactions.js.
    });
    host.addEventListener("input", function (e) {
      if (e.target.classList.contains("cv-add-input")) updatePreview(host);
    });
    host.addEventListener("change", function (e) {
      if (e.target.classList.contains("cv-import-file")) readImportFile(host, e.target);
      if (e.target.classList.contains("cv-add-target")) cvTarget.add = e.target.value;
      if (e.target.classList.contains("cv-import-target")) cvTarget.import = e.target.value;
    });
    host.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList.contains("cv-add-input")) { e.preventDefault(); addWord(host); }
      if (e.target.classList.contains("cv-edit-input")) {
        if (e.key === "Enter") { e.preventDefault(); saveEdit(host, e.target.dataset.row); }
        else if (e.key === "Escape") { cvEditingId = null; cvEditError = null; render(host); }
      }
    });
    if (tc()) tc().onChange(function () { if (hostEl) render(hostEl); });
    if (cv()) cv().onChange(function () {
      if (cvSelfMutating) return; // the action re-renders itself
      if (hostEl && document.body.dataset.activePage === "customize") render(hostEl);
    });
  }

  // ---- custom vocab actions -------------------------------------------
  // Wrap a customize-page mutation so its store onChange doesn't re-render
  // mid-action -- we re-render once here, after the flash message is set.
  function cvMutate(host, fn) {
    cvSelfMutating = true;
    try { fn(); } finally { cvSelfMutating = false; }
    render(host);
  }
  function firstParsed(text) {
    var res = cv().parseImport(text);
    if (res.rows.length) return { row: res.rows[0] };
    return { error: (res.skipped[0] && res.skipped[0].reason) || "couldn’t read that line" };
  }
  function updatePreview(host) {
    var input = host.querySelector(".cv-add-input");
    var box = host.querySelector(".cv-preview");
    if (!input || !box) return;
    var val = input.value.trim();
    if (!val) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    var p = firstParsed(val);
    if (p.error) { box.className = "cv-preview cv-preview-bad"; box.textContent = p.error; return; }
    box.className = "cv-preview";
    box.innerHTML = '<span lang="ja">' + V().jpSegmentsHtml(p.row.segments, false) + "</span>" +
      '<span class="cv-preview-sep">·</span>' + esc(p.row.romaji) +
      '<span class="cv-preview-sep">·</span>' + esc(p.row.english);
  }
  function addWord(host) {
    var input = host.querySelector(".cv-add-input");
    var target = host.querySelector(".cv-add-target");
    if (!input || !target) return;
    var p = firstParsed(input.value.trim());
    if (p.error) { cvFlash = { scope: "add", ok: false, text: p.error }; render(host); return; }
    var tableId = target.value;
    cvTarget.add = tableId;
    cvMutate(host, function () {
      try {
        cv().addRow(tableId, p.row);
        cvFlash = { scope: "add", ok: true, text: "Added." };
        pendingFocus = ".cv-add-input";
      } catch (err) {
        cvFlash = { scope: "add", ok: false, text: err.message || "Couldn’t add that word." };
      }
    });
  }
  function saveEdit(host, id) {
    var input = host.querySelector('.cv-edit-input[data-row="' + id + '"]');
    if (!input) return;
    var p = firstParsed(input.value.trim());
    if (p.error) { cvEditError = p.error; render(host); return; }
    cvMutate(host, function () {
      try {
        cv().updateRow(id, p.row);
        cvEditingId = null; cvEditError = null;
      } catch (err) {
        cvEditError = err.message || "Couldn’t save that word.";
      }
    });
  }
  function createTable(host) {
    var title = host.querySelector(".cv-new-title");
    var catf = host.querySelector(".cv-new-cat");
    if (!title || !title.value.trim()) { if (title) title.focus(); return; }
    var name = title.value, category = catf ? catf.value : "";
    cvMutate(host, function () {
      try { cv().createTable(name, category); pendingFocus = ".cv-add-input"; }
      catch (err) { window.alert(err.message); }
    });
  }
  function readImportFile(host, fileInput) {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var ta = host.querySelector(".cv-import-text");
      if (ta) ta.value = String(reader.result || "");
    };
    reader.readAsText(file);
  }
  function runImport(host) {
    var ta = host.querySelector(".cv-import-text");
    var target = host.querySelector(".cv-import-target");
    if (!ta || !target) return;
    var res = cv().parseImport(ta.value);
    var tableId = target.value;
    cvTarget.import = tableId;
    cvMutate(host, function () {
      var added = 0;
      if (res.rows.length) {
        try { added = cv().addRows(tableId, res.rows).length; }
        catch (err) { cvFlash = { scope: "import", error: err.message }; return; }
      }
      cvFlash = { scope: "import", added: added, skipped: res.skipped };
      // Leave only the rows that didn't import in the box, ready to fix.
      if (added) cvImportLeftover = res.skipped.map(function (s) { return s.raw; }).join("\n");
      pendingFocus = ".cv-import-text";
    });
  }
  function flashHtml(scope) {
    if (!cvFlash || cvFlash.scope !== scope) return "";
    if (scope === "add") {
      return '<span class="cv-add-msg ' + (cvFlash.ok ? "cv-add-msg-ok" : "cv-add-msg-bad") + '">' + esc(cvFlash.text) + "</span>";
    }
    // import
    if (cvFlash.error) return '<div class="cv-import-result cv-import-result-bad">' + esc(cvFlash.error) + "</div>";
    var n = cvFlash.added, sk = cvFlash.skipped || [];
    var out = '<div class="cv-import-result"><strong>' + n + (n === 1 ? " word" : " words") + " added.</strong>";
    if (sk.length) {
      out += '<p class="cv-skip-head">' + sk.length + (sk.length === 1 ? " row skipped:" : " rows skipped:") + "</p><ul class=\"cv-skip-list\">" +
        sk.map(function (s) { return '<li><span class="cv-skip-reason">' + esc(s.reason) + '</span> <span class="cv-skip-raw">' + esc(s.raw) + "</span></li>"; }).join("") + "</ul>";
    }
    return out + "</div>";
  }

  function render(host) {
    host = host || hostEl;
    if (!host) return;
    hostEl = host;
    // Snapshot which <details> are open before html() throws the DOM away
    // and rebuilds it (always collapsed, see the "no open attribute" note
    // in html()) -- a native <summary> click never goes through this
    // module's state, so this is the only record of it.
    host.querySelectorAll("details[data-open-key]").forEach(function (d) { czDetailsOpen[d.dataset.openKey] = d.open; });
    host.innerHTML = html();
    host.querySelectorAll("details[data-open-key]").forEach(function (d) {
      var key = d.dataset.openKey;
      d.open = (key in czDetailsOpen) ? czDetailsOpen[key] : !!DETAILS_DEFAULT_OPEN[key];
    });
    cvFlash = null; cvImportLeftover = null; // one-shot -- consumed by the html() just built
    if (!wired) { wire(host); wired = true; }
    if (pendingFocus) {
      var el = host.querySelector(pendingFocus);
      if (el) el.focus();
      pendingFocus = null;
    }
  }

  return { render: render };
})();
