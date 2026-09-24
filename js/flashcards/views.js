// Flashcards -- Manage / Settings / Help tabs (RaumeStudy.flashcards.views).
//
// Manage: browse every vocab entry by category > table, add / pause / restore
// individually or a whole table at once. Settings: Study Directions, the FSRS
// knobs, and the daily new-card cap. Help: the reference card.
// Nothing here deletes a card or its history -- pause only archives.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.views = (function () {
  "use strict";

  var fc = window.RaumeStudy.flashcards;
  var store = fc.store, vidx = fc.vocabIndex, dataOps = fc.dataOps, dashboard = fc.dashboard, sched = fc.scheduling;
  var esc = window.RaumeStudy.shared.escapeHtml;

  var getCache = store.getCache, hasActiveSession = store.hasActiveSession, isTablePaused = store.isTablePaused;
  var setTablePaused = dataOps.setTablePaused;
  var DIRECTIONS = store.DIRECTIONS, DIRECTION_LABEL = store.DIRECTION_LABEL;
  var getVocabIndex = vidx.getVocabIndex;
  var addVocab = dataOps.addVocab, archiveVocab = dataOps.archiveVocab;
  var withTimeout = dataOps.withTimeout;
  var addVocabs = dataOps.addVocabs, archiveVocabs = dataOps.archiveVocabs;
  var refreshData = dataOps.refreshData;
  var saveFsrsSettings = dataOps.saveFsrsSettings, saveQueueSettings = dataOps.saveQueueSettings, saveDirectionSettings = dataOps.saveDirectionSettings;
  var getKanaFsrs = dataOps.getKanaFsrs, saveKanaFsrs = dataOps.saveKanaFsrs;
  var invalidateInsights = dashboard.invalidateInsights;

  // The app shell / tab routing live in the bootstrap module -- reached lazily
  // so this file does not depend on its load order.
  function rerender() { window.RaumeStudy.flashcards.render(); }

  var manageFilter = "all"; // all | mine | archived
  var manageExpandedTables = {}; // tableId -> true; session-only UI state, collapsed (absent) by default
  // Same chevron used for every other collapse/expand control in the app
  // (sidebar groups, Overview rows) -- kept here rather than exported from
  // the vocab modules since it's a tiny, self-contained bit of markup.
  var CHEVRON_ICON = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7l4 4 4-4"/></svg>';

  // The per-table Manage actions. Each carries a full label ("Pause table")
  // and a short one ("Pause") -- a phone shows the short word, never a bare
  // icon (no hover there to explain one), and it still leaves the table
  // name room. The icon stays in the markup for anything that wants it.
  var SVG_OPEN = '<svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var TABLE_ACTIONS = {
    "add-table": {
      label: "Add table", short: "Add",
      title: "Adds every word in this table to your flashcards (skips any row you’ve hidden on the vocabulary page)",
      icon: SVG_OPEN + '<path d="M9 4v10M4 9h10"/></svg>'
    },
    "remove-table": {
      label: "Pause table", short: "Pause",
      title: "Pause the whole table — its cards keep every bit of their progress and drop out of review until you resume it",
      icon: SVG_OPEN + '<path d="M6 4v10M12 4v10"/></svg>'
    },
    "resume-table": {
      label: "Resume table", short: "Resume",
      title: "Resume this table — every card picks up its own progress exactly where it left off",
      icon: SVG_OPEN + '<path d="M3 9a6 6 0 1 1 1.8 4.3M3 13V9h4"/></svg>'
    },
    "restore-table": {
      label: "Restore table", short: "Restore",
      title: "Un-pause every individually paused word in this table, progress intact",
      icon: SVG_OPEN + '<path d="M3 9a6 6 0 1 1 1.8 4.3M3 13V9h4"/></svg>'
    }
  };
  function tableActionBtn(action, tableId) {
    var a = TABLE_ACTIONS[action];
    return '<button type="button" class="fc-btn fc-btn-tableaction" data-table-action="' + action +
      '" data-table-id="' + tableId + '" title="' + esc(a.title) + '" aria-label="' + esc(a.label) + '">' +
      '<span class="fc-btn-ic" aria-hidden="true">' + a.icon + '</span>' +
      '<span class="fc-btn-tx">' + a.label + '</span>' +
      '<span class="fc-btn-tx-short" aria-hidden="true">' + a.short + '</span></button>';
  }

  // Same iOS list as the masthead Help page: a small grey header over a
  // white card of two-line rows -- the term, then one short plain line -- so
  // the screen scans instead of reading as paragraphs.
  function renderHelp(panel) {
    panel.innerHTML =
      '<h3 class="help-head">Adding &amp; pausing</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term">Add</span><span class="help-desc">A single word, or a whole table from Manage or a search result.</span></li>' +
      '<li><span class="help-term">Pause</span><span class="help-desc">Stops reviews but keeps every bit of progress. Paused words collect under Archived.</span></li>' +
      '<li><span class="help-term">Pause table</span><span class="help-desc">The whole table sleeps; Resume brings every card back exactly as it was.</span></li>' +
      '<li><span class="help-term">Nothing is deleted</span><span class="help-desc">Scheduling and review history are kept for good.</span></li>' +
      '<li><span class="help-term">Your own words</span><span class="help-desc">Add them under Customize › Your vocabulary, then study them like any other.</span></li>' +
      '</ul>' +
      '<h3 class="help-head">Manage icons</h3>' +
      '<ul class="help-rows help-card fc-help-status">' +
      '<li><span class="fc-status fc-status-none">' + STATUS_META.none.glyph + '</span> Not added</li>' +
      '<li><span class="fc-status fc-status-active">' + STATUS_META.active.glyph + '</span> In flashcards</li>' +
      '<li><span class="fc-status fc-status-due">' + STATUS_META.due.glyph + '</span> Due for review now</li>' +
      '<li><span class="fc-status fc-status-archived">' + STATUS_META.archived.glyph + '</span> Paused</li>' +
      '</ul>' +
      '<h3 class="help-head">Reviewing</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term"><kbd>Enter</kbd> or <kbd>Space</kbd></span><span class="help-desc">Check your answer.</span></li>' +
      '<li><span class="help-term"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></span><span class="help-desc">Again, Hard, Good, Easy — once the answer shows.</span></li>' +
      '<li><span class="help-term">End session</span><span class="help-desc">Every rating is already saved; this just stops early.</span></li>' +
      '<li><span class="help-term">Audio</span><span class="help-desc">Plays when the answer shows; the speaker icon plays it again.</span></li>' +
      '<li><span class="help-term">Study directions</span><span class="help-desc">Settings turns any of the four directions on or off — progress is kept.</span></li>' +
      '</ul>' +
      '<h3 class="help-head">Dashboard</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term">Cards to study</span><span class="help-desc">What Study now would start with: due reviews plus today’s new cards.</span></li>' +
      '<li><span class="help-term">Today</span><span class="help-desc">Reviews done against your daily new-card target.</span></li>' +
      '<li><span class="help-term">Next review</span><span class="help-desc">When the next card is due.</span></li>' +
      '<li><span class="help-term">Due next 7 days</span><span class="help-desc">How many cards come due each day; overdue counts as today.</span></li>' +
      '<li><span class="help-term">Missed today</span><span class="help-desc">Words you missed, most-missed first — tap one to practise it.</span></li>' +
      '<li><span class="help-term">Leeches</span><span class="help-desc">Words forgotten 8+ times after learning. Pause, or Keep studying.</span></li>' +
      '<li><span class="help-term">Words to review</span><span class="help-desc">Words you often miss, as a table you can sort and print; ⋯ hides a column.</span></li>' +
      '</ul>' +
      '<h3 class="help-head">Kana</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term">Groups</span><span class="help-desc">Gojūon, dakuten, handakuten, yōon and sokuon, for each script.</span></li>' +
      '<li><span class="help-term">Directions</span><span class="help-desc">Kana → romaji, or romaji → kana (needs a kana keyboard).</span></li>' +
      '<li><span class="help-term">Progress</span><span class="help-desc">Its own FSRS schedule and settings, separate from word cards.</span></li>' +
      '</ul>' +
      '<h3 class="help-head">Puzzles</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term">Source</span><span class="help-desc">Your flashcards or any tables. At least 6 words; no clues that give the answer away.</span></li>' +
      '<li><span class="help-term">Style · Script · Words</span><span class="help-desc">Crossword or arroword; romaji, Japanese, hiragana words only or katakana words only; and how many words.</span></li>' +
      '<li><span class="help-term">Solving</span><span class="help-desc">Tap a square or clue and type. Tap a crossing square again to switch direction.</span></li>' +
      '<li><span class="help-term">Check</span><span class="help-desc">Marks filled squares right or wrong. ⋯ reveals, clears or prints.</span></li>' +
      '</ul>' +
      '<h3 class="help-head">Syncing</h3>' +
      '<ul class="help-rows help-card">' +
      '<li><span class="help-term">Signed in</span><span class="help-desc">Saved on this device first, then synced to your account.</span></li>' +
      '<li><span class="help-term">Status</span><span class="help-desc"><em>Syncing…</em>, <em>Offline</em>, or <em>couldn’t sync</em> with Sync now to retry.</span></li>' +
      '<li><span class="help-term">What’s pending?</span><span class="help-desc">Lists exactly what hasn’t reached your account yet.</span></li>' +
      '<li><span class="help-term">Guest</span><span class="help-desc">Starts with Fruits added; everything stays in this browser — Settings › Back up &amp; restore saves a copy.</span></li>' +
      '</ul>';
  }

  // --- Manage: browse every vocab entry, add / pause / restore ---
  function cardsForVocab(vocabId) {
    return Object.keys(getCache().cards).map(function (id) { return getCache().cards[id]; }).filter(function (c) { return c.vocabId === vocabId; });
  }
  function vocabState(vocabId) {
    var cards = cardsForVocab(vocabId);
    if (!cards.length) return "none";
    if (cards.some(function (c) { return c.active; })) return "active";
    return "archived";
  }
  // A finer status for the Manage list's per-row indicator: like vocabState
  // but splitting "active" into whether anything is actually due right now.
  function vocabStatus(vocabId) {
    var state = vocabState(vocabId);
    if (state !== "active") return state; // none | archived
    var now = new Date();
    var due = cardsForVocab(vocabId).some(function (c) {
      return c.active && c.state !== 0 && new Date(c.due) <= now;
    });
    return due ? "due" : "active";
  }
  var STATUS_META = {
    none: { glyph: "○", label: "Not added" },
    active: { glyph: "●", label: "In flashcards" },
    due: { glyph: "◷", label: "Due for review" },
    archived: { glyph: "◌", label: "Paused" }
  };
  function statusIndicatorHtml(vocabId, tablePaused) {
    var s = vocabStatus(vocabId);
    // A word that's in your deck but its whole table is paused reads as
    // dormant, not "in flashcards" -- but a word never added still reads as
    // "not added" (○), so you can tell progress from a clean slate.
    if (tablePaused && s !== "none") s = "archived";
    var m = STATUS_META[s] || STATUS_META.none;
    return '<span class="fc-status fc-status-' + s + '" aria-label="' + esc(m.label) + '">' + m.glyph + '</span>';
  }

  // Rows currently hidden via the vocabulary page's own eye icon are read
  // straight from that page's own DOM (it's always fully rendered, just
  // hidden/shown by class -- see js/vocab/interactions.js) so a bulk table-add
  // here matches the same one on the vocabulary page exactly, regardless of
  // which page happens to be open right now.
  function visibleVocabIdsForTable(tableId) {
    var section = document.querySelector('.table-section[data-table="' + tableId + '"]');
    if (!section) return [];
    return [].slice.call(section.querySelectorAll("tbody tr:not(.row-hidden)"))
      .map(function (tr) { return tr.dataset.vocabId; }).filter(Boolean);
  }

  function renderManage(panel) {
    var index = getVocabIndex();
    var leechIds = {};
    sched.leechWords().forEach(function (w) { leechIds[w.vocabId] = true; });
    var ids = Object.keys(index);
    var filtered = ids.filter(function (id) {
      // A table paused as a unit is dormant -- it only appears under "All
      // vocabulary" (with a Resume table action), never in "My flashcards" or
      // "Archived". Individually paused words still show under "Archived".
      if (isTablePaused(index[id].tableId)) return manageFilter === "all";
      var state = vocabState(id);
      if (manageFilter === "mine") return state === "active";
      if (manageFilter === "archived") return state === "archived";
      return true;
    });
    // Category > table, the same grouping the vocabulary page itself uses --
    // tables are the natural unit to add/remove in bulk, not a flat word list.
    var byCategory = {};
    filtered.forEach(function (id) {
      var entry = index[id];
      var cat = entry.category || "Tables";
      byCategory[cat] = byCategory[cat] || {};
      var tables = byCategory[cat];
      var key = entry.tableId;
      (tables[key] = tables[key] || { title: entry.tableTitle, ids: [] }).ids.push(id);
    });
    var catNames = Object.keys(byCategory).sort(function (a, b) { return a.localeCompare(b); });

    var html = '<div class="fc-manage-filters">' +
      [["all", "All vocabulary"], ["mine", "My flashcards"], ["archived", "Archived"]].map(function (f) {
        return '<button type="button" data-filter="' + f[0] + '" class="' + (manageFilter === f[0] ? "active" : "") + '">' + f[1] + "</button>";
      }).join("") + "</div>";

    if (!catNames.length) {
      html += '<div class="fc-manage-list"><div class="fc-empty">Nothing here yet.</div></div>';
    } else {
      catNames.forEach(function (cat) {
        var tableIds = Object.keys(byCategory[cat]).sort(function (a, b) { return byCategory[cat][a].title.localeCompare(byCategory[cat][b].title); });
        var totalInCategory = tableIds.reduce(function (n, k) { return n + byCategory[cat][k].ids.length; }, 0);
        html += '<details open class="fc-manage-group"><summary class="fc-manage-group-title">' + window.RaumeStudy.vocab.categoryHeaderHtml(cat, totalInCategory) + "</summary>";
        // Bulk add for the whole category -- the "no way to add more than one
        // table at once" gap. Only worth showing when more than one table
        // still has words left to add.
        if (manageFilter === "all") {
          var partialTables = tableIds.filter(function (k) {
            if (isTablePaused(k)) return false; // resume it before bulk-adding
            var t = byCategory[cat][k];
            return t.ids.filter(function (id) { return vocabState(id) === "active"; }).length < t.ids.length;
          });
          if (partialTables.length > 1) {
            html += '<div class="fc-manage-cat-actions">' +
              '<button type="button" class="fc-btn" data-cat-action="add-cat" data-cat="' + esc(cat) + '" title="Adds every word from every table in this category (skips rows you’ve hidden on the vocabulary page)">Add all ' + partialTables.length + ' remaining tables</button></div>';
          }
        }
        tableIds.forEach(function (tableId) {
          var table = byCategory[cat][tableId];
          var tablePaused = isTablePaused(tableId);
          var addedCount = table.ids.filter(function (id) { return vocabState(id) === "active"; }).length;
          // Collapsed by default -- with 14 tables and a few hundred words,
          // showing every row of every table at once makes this an
          // enormous scroll for what's usually just a couple of clicks on
          // "Add table". A row list is only worth expanding when actually
          // picking through individual words, so that's opt-in per table.
          var expanded = !!manageExpandedTables[tableId];
          // Show the same custom name and icon the reader set on the vocabulary
          // page / Customize page, so a table reads identically in both places.
          var vocabNs = window.RaumeStudy.vocab;
          var displayTitle = vocabNs.tableTitle ? vocabNs.tableTitle(tableId, table.title) : table.title;
          var iconHtml = (vocabNs.tableIconValue && vocabNs.tableIconValue(tableId) && vocabNs.tableIconGlyph)
            ? '<span class="fc-manage-table-icon">' + vocabNs.tableIconGlyph(tableId) + "</span>" : "";
          // A fully-added table is the one thing this list exists to surface at
          // a glance -- flagged so the count can pick up the section accent
          // instead of reading identically to an untouched table's "0 / N".
          var tableDone = table.ids.length > 0 && addedCount === table.ids.length;
          var progressHtml = tablePaused
            ? '<span class="fc-manage-table-progress fc-manage-table-dormant">Paused</span>'
            : '<span class="fc-manage-table-progress' + (tableDone ? " fc-manage-progress-done" : "") + '" aria-label="' + addedCount + " of " + table.ids.length + ' added">' + addedCount + " / " + table.ids.length + "</span>";
          var tileKey = vocabNs.tableTile ? vocabNs.tableTile(tableId, cat) : "";
          html += '<div class="fc-manage-table' + (expanded ? "" : " fc-manage-table-collapsed") + (tablePaused ? " fc-manage-table-paused" : "") + '"' +
            (tileKey ? ' data-tile="' + tileKey + '"' : "") + '>' +
            '<div class="fc-manage-table-head">' +
            '<button type="button" class="fc-manage-table-toggle" data-table-id="' + tableId + '" aria-expanded="' + expanded + '" aria-label="' + (expanded ? "Collapse" : "Expand") + " " + esc(displayTitle) + '">' + CHEVRON_ICON + "</button>" +
            // Title over its count, iOS list-row style: the name gets the whole
            // width (and may wrap) instead of being cut off beside "0 / 19".
            '<span class="fc-manage-table-label">' + iconHtml + '<span class="fc-manage-table-text"><span class="fc-manage-table-title">' + esc(displayTitle) + '</span>' +
            progressHtml + "</span></span>";
          // Table-level actions per filter. A paused table (only ever shown
          // under "all") gets just Resume. Otherwise "all" shows only what
          // applies -- Add table until it's full, Pause table once something's
          // in -- so a fresh deck isn't 23 rows of dead buttons; "My flashcards"
          // gets Pause table; "Archived" gets Restore table (un-pause the words
          // paused one at a time).
          if (tablePaused) {
            html += '<div class="fc-manage-table-actions">' + tableActionBtn("resume-table", tableId) + "</div>";
          } else if (manageFilter === "all") {
            var actions = "";
            if (addedCount < table.ids.length) actions += tableActionBtn("add-table", tableId);
            if (addedCount) actions += tableActionBtn("remove-table", tableId);
            html += '<div class="fc-manage-table-actions">' + actions + "</div>";
          } else if (manageFilter === "mine" && addedCount) {
            html += '<div class="fc-manage-table-actions">' + tableActionBtn("remove-table", tableId) + "</div>";
          } else if (manageFilter === "archived") {
            html += '<div class="fc-manage-table-actions">' + tableActionBtn("restore-table", tableId) + "</div>";
          }
          html += "</div><div class=\"fc-manage-list\">";
          table.ids.forEach(function (id) {
            var entry = index[id];
            var state = vocabState(id);
            // Plain kanji here, not the furigana ruby the reference tables use:
            // Manage is a deck-management checklist, and ruby made every row a
            // different height so the status dots and buttons never lined up.
            // The reading comes as romaji right after it, small, on every
            // screen; the English sits on the line below.
            html += '<div class="fc-manage-row">' +
              statusIndicatorHtml(id, tablePaused) +
              '<span class="fc-manage-word">' +
              '<span class="fc-jp" lang="ja">' + esc(entry.jpPlain) + "</span>" +
              '<span class="fc-ro">' + esc(entry.romajiDisplay) + "</span>" +
              '<span class="fc-en">' + esc(entry.englishDisplay) + "</span>" +
              (entry.romajiUsable ? "" : '<span class="fc-tag">EN only</span>') +
              (leechIds[id] ? '<span class="fc-tag fc-tag-leech" title="You keep forgetting this word — consider pausing it">Leech</span>' : "") +
              "</span>" +
              // No per-word action while the whole table is paused -- resume it first.
              '<span class="fc-actions">' + (tablePaused ? "" : manageActionsFor(id, state)) + "</span></div>";
          });
          html += "</div></div>";
        });
        html += "</details>";
      });
    }
    panel.innerHTML = html;

    panel.querySelectorAll(".fc-manage-filters button").forEach(function (btn) {
      btn.addEventListener("click", function () { manageFilter = btn.dataset.filter; rerender(); });
    });
    bindManageActionButtons(panel);
    panel.querySelectorAll("[data-table-action]").forEach(function (btn) {
      btn.addEventListener("click", function () { runTableAction(btn.dataset.tableAction, btn.dataset.tableId, btn); });
    });
    panel.querySelectorAll("[data-cat-action]").forEach(function (btn) {
      btn.addEventListener("click", function () { runCategoryAdd(btn.dataset.cat, btn); });
    });
    panel.querySelectorAll(".fc-manage-table-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.tableId;
        manageExpandedTables[id] = !manageExpandedTables[id];
        rerender();
      });
    });
  }
  // The per-word Manage actions. Same icon + label shape as the table-level
  // actions (TABLE_ACTIONS): CSS ghosts "Add" at rest and drops all three
  // labels to icon-only on a narrow screen, so a long list of untouched rows
  // stays quiet instead of a ladder of buttons. Pause / Restore only archive
  // (active = false) -- nothing here ever deletes a card or its history.
  var VOCAB_ACTIONS = {
    add: {
      label: "Add",
      title: "Add this word to your flashcards",
      icon: SVG_OPEN + '<path d="M9 4v10M4 9h10"/></svg>'
    },
    remove: {
      label: "Pause",
      title: "Keeps its progress — add it back anytime to pick up where you left off",
      icon: SVG_OPEN + '<path d="M6 4v10M12 4v10"/></svg>'
    },
    restore: {
      label: "Restore",
      title: "Resumes reviewing this word with its previous progress intact",
      icon: SVG_OPEN + '<path d="M3 9a6 6 0 1 1 1.8 4.3M3 13V9h4"/></svg>'
    }
  };
  function vocabActionBtn(action, vocabId) {
    var a = VOCAB_ACTIONS[action];
    return '<button type="button" class="fc-btn fc-btn-vocabaction" data-action="' + action +
      '" data-vocab-id="' + esc(vocabId) + '" title="' + esc(a.title) + '" aria-label="' + esc(a.label) + '">' +
      '<span class="fc-btn-ic" aria-hidden="true">' + a.icon + '</span>' +
      '<span class="fc-btn-tx">' + a.label + '</span></button>';
  }
  function manageActionsFor(vocabId, state) {
    if (state === "active") return vocabActionBtn("remove", vocabId);
    if (state === "archived") return vocabActionBtn("restore", vocabId);
    return vocabActionBtn("add", vocabId);
  }
  function bindManageActionButtons(scope) {
    scope.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () { runVocabAction(btn.dataset.action, btn.dataset.vocabId, btn); });
    });
  }
  // The tap shows at once ("Adding…", disabled) -- signed in, the change
  // waits on the account, and a button that sat unchanged read as "nothing
  // happened". Every account round-trip is capped (dataOps.withTimeout, 20s),
  // so a stalled connection ends in a clear message instead of silence.
  var VOCAB_ACTION_PENDING = { add: "Adding…", remove: "Pausing…", restore: "Restoring…" };
  async function runVocabAction(action, vocabId, btn) {
    var label = btn && btn.querySelector(".fc-btn-tx");
    var originalLabel = label ? label.textContent : "";
    if (btn) btn.disabled = true;
    if (label) label.textContent = VOCAB_ACTION_PENDING[action] || "Working…";
    try {
      var change = action === "remove" ? archiveVocab(vocabId) : addVocab(vocabId);
      await withTimeout(change, "update");
      await withTimeout(refreshData(), "refresh");
      invalidateInsights();
      rerender();
      refreshRowToggleButtons();
    } catch (e) {
      if (btn) btn.disabled = false;
      if (label) label.textContent = originalLabel;
      window.alert("Couldn't update flashcards — " + (e.message || "check your connection and try again."));
    }
  }
  // Table-level actions -- the default way to manage a deck, per table:
  //  - Add table    : add every (non-hidden) word to flashcards
  //  - Pause table   : mark the whole table dormant -- an overlay, the cards
  //                    keep their own state (js/flashcards/data-ops setTablePaused)
  //  - Resume table  : lift that overlay
  //  - Restore table : un-archive the words paused one at a time (Archived view)
  // Nothing here ever hard-deletes.
  var TABLE_ACTION_PENDING = { "add-table": "Adding…", "remove-table": "Pausing…", "resume-table": "Resuming…", "restore-table": "Restoring…" };
  async function runTableAction(action, tableId, btn) {
    var index = getVocabIndex();
    var allIds = Object.keys(index).filter(function (id) { return String(index[id].tableId) === String(tableId); });
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = TABLE_ACTION_PENDING[action] || "Working…";
    try {
      if (action === "add-table") {
        var visible = visibleVocabIdsForTable(tableId);
        var targetIds = visible.length ? visible.filter(function (id) { return allIds.indexOf(id) !== -1; }) : allIds;
        await withTimeout(addVocabs(targetIds), "update");
      } else if (action === "remove-table") {
        await withTimeout(setTablePaused(tableId, true), "update");
      } else if (action === "resume-table") {
        await withTimeout(setTablePaused(tableId, false), "update");
      } else if (action === "restore-table") {
        await withTimeout(addVocabs(allIds.filter(function (id) { return vocabState(id) === "archived"; })), "update");
      }
      await withTimeout(refreshData(), "refresh");
      invalidateInsights();
      rerender();
      refreshRowToggleButtons();
    } catch (e) {
      btn.textContent = originalText;
      btn.disabled = false;
      window.alert("Couldn't update flashcards — " + (e.message || "check your connection and try again."));
    }
  }
  // Category-wide "Add all": every not-yet-active word across every table in
  // the category, skipping rows hidden on the vocabulary page (same rule as
  // "Add table"). Nothing to pause/restore at this level -- that stays per
  // table where the intent is unambiguous.
  async function runCategoryAdd(cat, btn) {
    var index = getVocabIndex();
    var tableIds = {};
    Object.keys(index).forEach(function (id) { if ((index[id].category || "Tables") === cat) tableIds[index[id].tableId] = true; });
    var targetIds = [];
    Object.keys(tableIds).forEach(function (tid) {
      var allIds = Object.keys(index).filter(function (id) { return String(index[id].tableId) === String(tid); });
      var visible = visibleVocabIdsForTable(tid);
      var ids = visible.length ? visible.filter(function (id) { return allIds.indexOf(id) !== -1; }) : allIds;
      ids.forEach(function (id) { if (vocabState(id) !== "active") targetIds.push(id); });
    });
    if (!targetIds.length) return;
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      await addVocabs(targetIds);
      await refreshData();
      invalidateInsights();
      rerender();
      refreshRowToggleButtons();
    } catch (e) {
      btn.textContent = originalText;
      btn.disabled = false;
      window.alert("Couldn't update flashcards — " + (e.message || "check your connection and try again."));
    }
  }

  // --- Settings ---
  // Settings follows iOS Settings: a grey group header, a white card of 44px
  // rows (label left, value or control right), and a short grey footnote
  // under the card -- instead of a paragraph under every field. Changes save
  // as you make them (a number when you leave its field, a switch or tick at
  // once); there's no Save button, same as iOS.
  function setNum(id, label, value, min, max, unit) {
    return '<label class="set-row"><span class="set-label">' + esc(label) + '</span><span class="set-value">' +
      '<input type="number" class="set-num" id="' + id + '" min="' + min + '" max="' + max + '" value="' + value + '" inputmode="numeric">' +
      (unit ? '<span class="set-unit' + (unit === "%" ? " set-unit-tight" : "") + '">' + unit + "</span>" : "") + "</span></label>";
  }
  function setSwitch(id, label, on) {
    return '<label class="set-row"><span class="set-label">' + esc(label) + '</span>' +
      '<input type="checkbox" class="set-switch" id="' + id + '"' + (on ? " checked" : "") + "></label>";
  }
  function setGroup(head, rowsHtml, foot) {
    return '<h3 class="help-head">' + head + '</h3><div class="help-card set-card">' + rowsHtml + "</div>" +
      (foot ? '<p class="set-foot">' + foot + "</p>" : "");
  }
  function renderSettings(panel) {
    var s = getCache().settings;
    var k = getKanaFsrs();
    panel.innerHTML =
      setGroup("Study directions", DIRECTIONS.map(function (d) {
        return '<label class="set-row fc-direction-check"><input type="checkbox" data-direction="' + d + '" class="fc-dir-checkbox" ' + (s.enabled_directions[d] !== false ? "checked" : "") + ">" + esc(DIRECTION_LABEL[d]) + "</label>";
      }).join(""), "Study now only draws from the ticked directions. Turning one off keeps its cards and progress.") +
      '<div class="fc-auth-error" id="fcDirError" hidden>At least one direction has to stay on.</div>' +
      setGroup("Word cards",
        setNum("fcRetention", "Desired retention", Math.round(s.fsrs_request_retention * 100), 70, 99, "%") +
        setNum("fcMaxInterval", "Maximum interval", s.fsrs_maximum_interval, 30, 36500, "days") +
        setNum("fcNewPerDay", "New cards per day", s.queue_new_cards_per_day, 0, 200, "") +
        setSwitch("fcFuzz", "Fuzz intervals", s.fsrs_enable_fuzz),
        "FSRS-6 brings a card back when your recall is expected to fall to this level — 90% is its default. 36,500 days means no cap. Fuzz spreads out cards added on the same day.") +
      setGroup("Kana cards",
        setNum("fcKanaRetention", "Desired retention", Math.round(k.fsrs_request_retention * 100), 70, 99, "%") +
        setNum("fcKanaMaxInterval", "Maximum interval", k.fsrs_maximum_interval, 30, 36500, "days") +
        setNum("fcKanaNewPerDay", "New kana per day", k.new_per_day, 0, 200, "") +
        setSwitch("fcKanaFuzz", "Fuzz intervals", k.fsrs_enable_fuzz),
        "Its own schedule, separate from word cards.") +
      '<p class="set-status" id="fcSettingsSaved" role="status" aria-live="polite"></p>' +
      backupSectionHtml();
    wireBackup();

    // Every setting is written to the local cache before the remote call even
    // goes out (see saveFsrsSettings/saveDirectionSettings), so a failed sync
    // never loses the change -- this just makes sure a failure is reported
    // instead of vanishing as an unhandled rejection, like add/remove/delete.
    function reportSettingsError(e) {
      window.alert("Saved on this device, but couldn't sync — " + (e.message || "check your connection and try again."));
    }
    // Saves run one after another, so two quick edits can't race each other.
    var saving = Promise.resolve();
    async function saveAll(changed) {
      var enabledMap = {};
      panel.querySelectorAll(".fc-dir-checkbox").forEach(function (cb) { enabledMap[cb.dataset.direction] = cb.checked; });
      if (!DIRECTIONS.some(function (d) { return enabledMap[d]; })) {
        // The last direction can't be turned off: put its tick back.
        if (changed && changed.classList.contains("fc-dir-checkbox")) changed.checked = true;
        document.getElementById("fcDirError").hidden = false;
        return;
      }
      document.getElementById("fcDirError").hidden = true;

      var retention = Math.min(0.99, Math.max(0.7, Number(document.getElementById("fcRetention").value) / 100));
      var maxInterval = Math.min(36500, Math.max(1, Number(document.getElementById("fcMaxInterval").value)));
      var newPerDay = Math.max(0, Number(document.getElementById("fcNewPerDay").value));
      try {
        await saveDirectionSettings(enabledMap);
        await saveFsrsSettings({
          fsrs_request_retention: retention,
          fsrs_maximum_interval: maxInterval,
          fsrs_enable_fuzz: document.getElementById("fcFuzz").checked
        });
        await saveQueueSettings({ queue_new_cards_per_day: newPerDay });
        // The Kana trainer's own knobs (saveKanaFsrs re-sanitises, so read it
        // back for the clamped values).
        await saveKanaFsrs({
          fsrs_request_retention: Number(document.getElementById("fcKanaRetention").value) / 100,
          fsrs_maximum_interval: Number(document.getElementById("fcKanaMaxInterval").value),
          fsrs_enable_fuzz: document.getElementById("fcKanaFuzz").checked,
          new_per_day: Number(document.getElementById("fcKanaNewPerDay").value)
        });
        var kSaved = getKanaFsrs();
        // Reflect any clamping (retention typed as 150 -> 99) back into the fields.
        document.getElementById("fcRetention").value = Math.round(retention * 100);
        document.getElementById("fcMaxInterval").value = maxInterval;
        document.getElementById("fcNewPerDay").value = newPerDay;
        document.getElementById("fcKanaRetention").value = Math.round(kSaved.fsrs_request_retention * 100);
        document.getElementById("fcKanaMaxInterval").value = kSaved.fsrs_maximum_interval;
        document.getElementById("fcKanaNewPerDay").value = kSaved.new_per_day;
        var note = document.getElementById("fcSettingsSaved");
        if (note) note.textContent = "Saved";
      } catch (e) {
        reportSettingsError(e);
      }
    }
    // A number saves when you leave its field (or press Return); a tick or
    // switch saves at once. Settings in the Back up card aren't settings.
    panel.addEventListener("change", function (e) {
      if (!e.target.closest(".set-card")) return;
      var target = e.target;
      saving = saving.then(function () { return saveAll(target); });
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList && e.target.classList.contains("set-num")) e.target.blur();
    });
  }
  // --- Back up & restore (guest mode) ---
  // Guest data lives only in this browser, so this is the one place a reader can
  // get it out (and back in). Signed-in progress is already in the account.
  function backupSectionHtml() {
    var backup = window.RaumeStudy.flashcards.backup;
    if (!backup) return "";
    if (!backup.available()) {
      return '<h3 class="help-head">Back up &amp; restore</h3><p class="set-foot set-foot-alone">Your progress is saved to your account, so there is nothing to back up here.</p>';
    }
    return '<h3 class="help-head">Back up &amp; restore</h3><div class="help-card set-card-actions">' +
      '<button type="button" class="set-row set-action" id="fcBackupExport">Download backup</button>' +
      '<button type="button" class="set-row set-action" id="fcBackupImport">Restore from a file…</button>' +
      '<input type="file" id="fcBackupFile" accept="application/json,.json" hidden></div>' +
      '<p class="set-foot">This device is the only copy of your flashcards, Kana progress, table customisations and your own words. Restoring replaces what\'s here with the file.</p>' +
      '<div class="fc-auth-error" id="fcBackupError" role="alert" hidden></div>';
  }
  function wireBackup() {
    var backup = window.RaumeStudy.flashcards.backup;
    var exportBtn = document.getElementById("fcBackupExport");
    if (!backup || !exportBtn) return;
    var importBtn = document.getElementById("fcBackupImport");
    var fileInput = document.getElementById("fcBackupFile");
    var errorBox = document.getElementById("fcBackupError");
    function showError(msg) { errorBox.textContent = msg; errorBox.hidden = !msg; }
    exportBtn.addEventListener("click", function () {
      showError("");
      try { backup.downloadBackup(); } catch (e) { showError("Couldn't create the backup file — " + (e.message || "try again.")); }
    });
    importBtn.addEventListener("click", function () { showError(""); fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      showError("");
      file.text().then(function (text) {
        var parsed = backup.parseBackup(text);
        if (!parsed.ok) { showError(parsed.error); return; }
        var sm = parsed.summary;
        var when = sm.exportedAt && !isNaN(Date.parse(sm.exportedAt)) ? " from " + new Date(sm.exportedAt).toLocaleDateString() : "";
        var parts = [sm.words + " word" + (sm.words === 1 ? "" : "s") + " in flashcards (" + sm.cards + " cards)"];
        if (sm.kanaCards) parts.push(sm.kanaCards + " Kana cards");
        if (sm.customWords) parts.push(sm.customWords + " of your own word" + (sm.customWords === 1 ? "" : "s"));
        if (sm.customisedTables) parts.push(sm.customisedTables + " customised table" + (sm.customisedTables === 1 ? "" : "s"));
        if (!window.confirm("Restore the backup" + when + "?\n\nIt holds " + parts.join(", ") + ".\n\nThis replaces everything Flashcards currently has on this device. Anything you've done since the backup was made will be lost.")) return;
        var applied = backup.applyBackup(parsed.backup);
        if (!applied.ok) { showError(applied.error); return; }
        window.location.reload();
      }, function () { showError("Couldn't read that file."); });
    });
  }

  // -----------------------------------------------------------------------
  // Row-level "add to flashcards" toggle. js/vocab/render.js draws a
  // .fc-toggle-btn on each reference row but CSS shows it only while a search
  // is running (body.is-searching) -- a permanent per-row icon was redundant
  // with this module's Manage tab and just took up space. Its + / check state
  // is refreshed here when a search starts and after every add/pause.
  // -----------------------------------------------------------------------
  function refreshRowToggleButtons() {
    document.querySelectorAll(".fc-toggle-btn").forEach(function (btn) {
      var state = vocabState(btn.dataset.vocabId);
      var added = state === "active";
      btn.classList.toggle("fc-added", added);
      btn.setAttribute("aria-pressed", String(added));
      btn.title = added ? "Pause (keeps its progress — add it back anytime)" : "Add to flashcards";
      btn.setAttribute("aria-label", btn.title);
    });
  }
  document.addEventListener("click", function (event) {
    var btn = event.target.closest && event.target.closest(".fc-toggle-btn");
    if (!btn) return;
    event.stopPropagation();
    if (!hasActiveSession()) {
      if (window.RaumeStudy.vocab.showFlashcardsPage) window.RaumeStudy.vocab.showFlashcardsPage();
      return;
    }
    var vocabId = btn.dataset.vocabId;
    var state = vocabState(vocabId);
    runVocabAction(state === "active" ? "remove" : (state === "archived" ? "restore" : "add"), vocabId);
  });

  // "Add table to flashcards" -- the common case (add everything at once)
  // instead of requiring one click per word. Skips rows currently hidden in
  // that table (the vocabulary page's own eye icon) -- if you've already
  // hidden a row because you know it, a bulk add shouldn't pull it back in.
  document.addEventListener("click", async function (event) {
    var btn = event.target.closest && event.target.closest(".fc-add-table-btn");
    if (!btn || btn.disabled) return;
    event.stopPropagation();
    if (!hasActiveSession()) {
      if (window.RaumeStudy.vocab.showFlashcardsPage) window.RaumeStudy.vocab.showFlashcardsPage();
      return;
    }
    var vocabIds = visibleVocabIdsForTable(btn.dataset.table);
    if (!vocabIds.length) return;
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      await addVocabs(vocabIds);
      await refreshData();
      invalidateInsights();
      refreshRowToggleButtons();
      var activeTab = window.RaumeStudy.flashcards.getActiveTab();
      if (activeTab === "dashboard" || activeTab === "manage") rerender();
      btn.textContent = "Added " + vocabIds.length + " word" + (vocabIds.length === 1 ? "" : "s");
      setTimeout(function () { btn.textContent = originalText; btn.disabled = false; }, 2000);
    } catch (e) {
      btn.textContent = originalText;
      btn.disabled = false;
      window.alert("Couldn't add this table to flashcards — " + (e.message || "check your connection and try again."));
    }
  });

  // Kept on the namespace root too, so dashboard.js (which redraws the
  // "Words to Review" table) can refresh the row toggles without importing
  // this whole module.
  window.RaumeStudy.flashcards.refreshRowToggleButtons = refreshRowToggleButtons;

  return {
    renderManage: renderManage, renderSettings: renderSettings, renderHelp: renderHelp,
    refreshRowToggleButtons: refreshRowToggleButtons
  };
})();
