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
  var addVocabs = dataOps.addVocabs, archiveVocabs = dataOps.archiveVocabs;
  var refreshData = dataOps.refreshData;
  var saveFsrsSettings = dataOps.saveFsrsSettings, saveQueueSettings = dataOps.saveQueueSettings, saveDirectionSettings = dataOps.saveDirectionSettings;
  var getKanaFsrs = dataOps.getKanaFsrs, saveKanaFsrs = dataOps.saveKanaFsrs;
  var invalidateInsights = dashboard.invalidateInsights;

  // The app shell / tab routing live in the bootstrap module -- reached lazily
  // so this file does not depend on its load order.
  function rerender() { window.RaumeStudy.flashcards.render(); }

  var SAVED_FLASH_MS = 3000;
  var settingsSavedAt = 0; // timestamp of the last successful Settings save -- lets the "Saved ✓" note survive an unrelated re-render for a few seconds
  var manageFilter = "all"; // all | mine | archived
  var manageExpandedTables = {}; // tableId -> true; session-only UI state, collapsed (absent) by default
  // Same chevron used for every other collapse/expand control in the app
  // (sidebar groups, Overview rows) -- kept here rather than exported from
  // the vocab modules since it's a tiny, self-contained bit of markup.
  var CHEVRON_ICON = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7l4 4 4-4"/></svg>';

  // The per-table Manage actions. Each button carries both a text label and an
  // icon; CSS drops the label to icon-only on a narrow screen when a table
  // shows two of them, so they never wrap onto their own row.
  var SVG_OPEN = '<svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var TABLE_ACTIONS = {
    "add-table": {
      label: "Add table",
      title: "Adds every word in this table to your flashcards (skips any row you’ve hidden on the vocabulary page)",
      icon: SVG_OPEN + '<path d="M9 4v10M4 9h10"/></svg>'
    },
    "remove-table": {
      label: "Pause table",
      title: "Pause the whole table — its cards keep every bit of their progress and drop out of review until you resume it",
      icon: SVG_OPEN + '<path d="M6 4v10M12 4v10"/></svg>'
    },
    "resume-table": {
      label: "Resume table",
      title: "Resume this table — every card picks up its own progress exactly where it left off",
      icon: SVG_OPEN + '<path d="M3 9a6 6 0 1 1 1.8 4.3M3 13V9h4"/></svg>'
    },
    "restore-table": {
      label: "Restore table",
      title: "Un-pause every individually paused word in this table, progress intact",
      icon: SVG_OPEN + '<path d="M3 9a6 6 0 1 1 1.8 4.3M3 13V9h4"/></svg>'
    }
  };
  function tableActionBtn(action, tableId) {
    var a = TABLE_ACTIONS[action];
    return '<button type="button" class="fc-btn fc-btn-tableaction" data-table-action="' + action +
      '" data-table-id="' + tableId + '" title="' + esc(a.title) + '" aria-label="' + esc(a.label) + '">' +
      '<span class="fc-btn-ic" aria-hidden="true">' + a.icon + '</span>' +
      '<span class="fc-btn-tx">' + a.label + '</span></button>';
  }

  function renderHelp(panel) {
    panel.innerHTML =
      '<div class="fc-settings-section"><h3>Adding &amp; pausing vocabulary</h3>' +
      '<ul class="fc-help-list">' +
      '<li><span class="fc-legend-term">Add</span> starts studying a word — or a whole table at once, from the Manage tab, or from a vocabulary search result (the small <span class="fc-legend-term">+</span> beside it).</li>' +
      '<li><span class="fc-legend-term">Pause</span> stops reviewing a word but keeps every bit of its progress. Add it back any time and it resumes exactly where you left off. Paused words collect under the <span class="fc-legend-term">Archived</span> filter.</li>' +
      '<li><span class="fc-legend-term">Pause table</span> makes a whole table dormant in one step — it drops out of review and the stat tiles and only shows under <span class="fc-legend-term">All vocabulary</span> (as <em>Paused</em>, with a <span class="fc-legend-term">Resume table</span> button). Its cards aren\'t archived one by one, so a paused table never clutters the Archived list. Resume brings every card back exactly as it was.</li>' +
      '<li>Nothing is ever permanently deleted. A paused word or table keeps its full FSRS scheduling state and complete review history for good.</li>' +
      '<li>Using it without an account? Your progress lives only in this browser — <span class="fc-legend-term">Settings → Back up &amp; restore</span> saves it to a file and restores it from one, so clearing site data doesn\'t lose it.</li>' +
      '<li>Studying a word the built-in tables don\'t have? Add it under <span class="fc-legend-term">Your vocabulary</span> on the Customize page (the sliders icon) — one at a time or a paste / CSV import — then it\'s a normal word you can add here. Signed in, you can build whole tables of your own; editing or deleting a word or table you made there is a real change (there\'s no review history on the word itself to keep).</li>' +
      '</ul></div>' +
      '<div class="fc-settings-section"><h3>Status icons in Manage</h3>' +
      '<ul class="fc-help-list fc-help-status">' +
      '<li><span class="fc-status fc-status-none">' + STATUS_META.none.glyph + '</span> Not added</li>' +
      '<li><span class="fc-status fc-status-active">' + STATUS_META.active.glyph + '</span> In flashcards</li>' +
      '<li><span class="fc-status fc-status-due">' + STATUS_META.due.glyph + '</span> Due for review now</li>' +
      '<li><span class="fc-status fc-status-archived">' + STATUS_META.archived.glyph + '</span> Paused</li>' +
      '</ul></div>' +
      '<div class="fc-settings-section"><h3>Review sessions</h3>' +
      '<ul class="fc-help-list">' +
      '<li>Each rating is saved the moment you pick it, so <span class="fc-legend-term">End session</span> (top-right of the card) never loses anything — it just stops early and shows the wrap-up.</li>' +
      '<li>The wrap-up counts what you reviewed and how many you got right; <span class="fc-legend-term">Keep going</span> appears when more cards are ready.</li>' +
      '<li>Pronunciation plays automatically the moment an answer reveals, using a natural native-voice recording where one exists, and a speaker icon next to any Japanese text plays it again on click.</li>' +
      '</ul></div>' +
      '<div class="fc-settings-section"><h3>Review keyboard shortcuts</h3>' +
      '<ul class="fc-help-list">' +
      '<li><kbd>Space</kbd> or <kbd>Enter</kbd> — check your answer</li>' +
      '<li><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> — rate Again / Hard / Good / Easy (only after the answer is checked)</li>' +
      '</ul></div>' +
      '<div class="fc-settings-section"><h3>Dashboard</h3>' +
      '<ul class="fc-help-list">' +
      '<li><span class="fc-legend-term">Today</span> — cards reviewed today against your daily target (New cards per day, under Settings → Daily session).</li>' +
      '<li><span class="fc-legend-term">Next review</span> — when the next scheduled card is due, taken straight from the FSRS schedule.</li>' +
      '<li><span class="fc-legend-term">Due next 7 days</span> — how many cards come due on each of the coming days, from the same FSRS schedule. Anything overdue is counted under Today; cards further out are summarised as "N more after that". Paused words and tables, and directions you\'ve turned off, aren\'t counted.</li>' +
      '<li><span class="fc-legend-term">Missed today</span> — words you missed in today\'s reviews, most-missed first. Click one to practice it right away.</li>' +
      '<li><span class="fc-legend-term">Leeches</span> — words that keep slipping out of memory (forgotten 8 or more times after you\'d learned them). <span class="fc-legend-term">Pause</span> takes one out of review with its progress kept, or <span class="fc-legend-term">Keep</span> leaves it studied and stops flagging it until it slips 4 more times. Manage marks the same words with a <span class="fc-legend-term">Leech</span> tag. The card only appears when there\'s something to show.</li>' +
      '<li><span class="fc-legend-term">Words to Review</span> — words you get wrong repeatedly over time, shown as a normal vocabulary table you can sort, print, and hide columns on (the same Japanese / Furigana / English toggles as the reference pages) to quiz yourself.</li>' +
      '</ul></div>' +
      '<div class="fc-settings-section"><h3>Casual &amp; polite forms</h3>' +
      '<p class="fc-note">On the vocabulary tables, the <span class="fc-legend-term">Show polite</span> toggle switches verb columns between the plain / dictionary form and the polite <span lang="ja">〜ます</span> form. One form is shown at a time. Words with no distinct polite form are left unchanged.</p>' +
      '</div>' +
      '<div class="fc-settings-section"><h3>Study directions</h3>' +
      '<p class="fc-note">Settings → Study directions turns any of the four review directions on or off. Turning one off never deletes its cards or progress — it just leaves that direction out of review until you turn it back on.</p>' +
      '</div>' +
      '<div class="fc-settings-section"><h3>Syncing (signed in)</h3>' +
      '<p class="fc-note">Every rating is saved on this device first, then synced to your account. A chip under your name shows the state: a calm <em>Syncing…</em> while it works, and an amber <em>Offline</em> or <em>couldn\'t sync</em> with a <span class="fc-legend-term">Sync now</span> button if it stalls. Whenever something\'s queued, a <span class="fc-legend-term">What\'s pending?</span> link under the chip lists exactly which reviews, own-words changes, or table changes haven\'t reached your account yet. Your reviews are never lost — <span class="fc-legend-term">Sync now</span> just retries the queue. Guest mode keeps everything on this device and shows only the offline hint.</p>' +
      '</div>' +
      '<div class="fc-settings-section"><h3>Kana trainer</h3>' +
      '<p class="fc-note">The <span class="fc-legend-term">Kana</span> tab is a separate hiragana / katakana reading trainer, not built on the vocabulary. Choose the groups you want — gojūon, dakuten, handakuten, yōon (small-ya combinations), and sokuon (the doubling <span lang="ja">っ</span>, in short example words), per script — plus the directions: <em>kana → romaji</em> (type the reading) and <em>romaji → kana</em> (type the glyph — you\'ll want a kana keyboard). It uses the same review card, keyboard shortcuts, and FSRS scheduling as the vocabulary sessions, but keeps its own separate progress and settings. Saved locally in guest mode, synced to your account when signed in — same as the vocabulary flashcards.</p>' +
      '</div>';
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
    return '<span class="fc-status fc-status-' + s + '" title="' + esc(m.label) + '" aria-label="' + esc(m.label) + '">' + m.glyph + '</span>';
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
            : '<span class="fc-manage-table-progress' + (tableDone ? " fc-manage-progress-done" : "") + '">' + addedCount + " / " + table.ids.length + " added</span>";
          html += '<div class="fc-manage-table' + (expanded ? "" : " fc-manage-table-collapsed") + (tablePaused ? " fc-manage-table-paused" : "") + '">' +
            '<div class="fc-manage-table-head">' +
            '<button type="button" class="fc-manage-table-toggle" data-table-id="' + tableId + '" aria-expanded="' + expanded + '" aria-label="' + (expanded ? "Collapse" : "Expand") + " " + esc(displayTitle) + '">' + CHEVRON_ICON + "</button>" +
            '<span class="fc-manage-table-label">' + iconHtml + '<span class="fc-manage-table-title">' + esc(displayTitle) + '</span>' +
            progressHtml + "</span>";
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
            // The reading is still one column over (romaji, desktop).
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
      btn.addEventListener("click", function () { runVocabAction(btn.dataset.action, btn.dataset.vocabId); });
    });
  }
  async function runVocabAction(action, vocabId) {
    try {
      if (action === "add" || action === "restore") await addVocab(vocabId);
      else if (action === "remove") await archiveVocab(vocabId);
      await refreshData();
      invalidateInsights();
      rerender();
      refreshRowToggleButtons();
    } catch (e) {
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
        await addVocabs(targetIds);
      } else if (action === "remove-table") {
        await setTablePaused(tableId, true);
      } else if (action === "resume-table") {
        await setTablePaused(tableId, false);
      } else if (action === "restore-table") {
        await addVocabs(allIds.filter(function (id) { return vocabState(id) === "archived"; }));
      }
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
  function renderSettings(panel) {
    var s = getCache().settings;
    var k = getKanaFsrs();
    panel.innerHTML =
      '<div class="fc-settings-section"><h3>Study directions</h3><p class="fc-note">Which of the 4 directions "Study now" pulls cards from — turning one off never deletes its cards or progress, it is just left out of review until you turn it back on.</p>' +
      '<div class="fc-direction-checks">' + DIRECTIONS.map(function (d) {
        return '<label class="fc-direction-check"><input type="checkbox" data-direction="' + d + '" class="fc-dir-checkbox" ' + (s.enabled_directions[d] !== false ? "checked" : "") + ">" + esc(DIRECTION_LABEL[d]) + "</label>";
      }).join("") + "</div>" +
      '<div class="fc-auth-error" id="fcDirError" hidden>At least one direction has to stay on.</div></div>' +
      '<div class="fc-settings-section"><h3>FSRS scheduling</h3><p class="fc-note">Tunable knobs FSRS-6 itself supports — the trained algorithm and its weights never change.</p>' +
      settingsField("Desired retention (%)", '<input type="number" id="fcRetention" min="70" max="99" value="' + Math.round(s.fsrs_request_retention * 100) + '">',
        "The recall probability FSRS-6 aims for when each card comes due. Higher means shorter, more frequent reviews and stronger recall; lower means longer gaps but more forgetting in between. 90% is FSRS's own recommended default.") +
      settingsField("Maximum interval (days)", '<input type="number" id="fcMaxInterval" min="30" max="36500" value="' + s.fsrs_maximum_interval + '">',
        "A ceiling on the longest gap FSRS-6 will ever schedule, however well you know a card. 36500 (100 years) effectively means no ceiling.") +
      settingsField("Fuzz scheduled intervals", '<input type="checkbox" id="fcFuzz" ' + (s.fsrs_enable_fuzz ? "checked" : "") + ">",
        "Adds a small random wobble to each computed interval, so a batch of cards added on the same day don't all come due on exactly the same day too.") +
      "</div>" +
      '<div class="fc-settings-section"><h3>Daily session</h3><p class="fc-note">Not an FSRS setting — just how many brand-new cards a review session introduces per day.</p>' +
      settingsField("New cards per day", '<input type="number" id="fcNewPerDay" min="0" max="200" value="' + s.queue_new_cards_per_day + '">',
        "A cap on how many never-studied cards \"Study now\" introduces in one day, on top of anything already due for review. Doesn't affect scheduling, only pacing.") +
      "</div>" +
      '<div class="fc-settings-section"><h3>Kana trainer scheduling</h3><p class="fc-note">The same four knobs as the vocabulary blocks above — see there for what each does — kept on their own so the Kana tab can run a different schedule.</p>' +
      settingsField("Desired retention (%)", '<input type="number" id="fcKanaRetention" min="70" max="99" value="' + Math.round(k.fsrs_request_retention * 100) + '">') +
      settingsField("Maximum interval (days)", '<input type="number" id="fcKanaMaxInterval" min="30" max="36500" value="' + k.fsrs_maximum_interval + '">') +
      settingsField("Fuzz scheduled intervals", '<input type="checkbox" id="fcKanaFuzz" ' + (k.fsrs_enable_fuzz ? "checked" : "") + ">") +
      settingsField("New kana per day", '<input type="number" id="fcKanaNewPerDay" min="0" max="200" value="' + k.new_per_day + '">') +
      "</div>" +
      '<div class="fc-cta-row fc-cta-row-spaced fc-settings-save">' +
      '<button type="button" class="fc-btn fc-btn-primary" id="fcSaveSettings">Save settings</button>' +
      '<span class="fc-settings-saved" id="fcSettingsSaved" role="status"' +
      (Date.now() - settingsSavedAt < SAVED_FLASH_MS ? "" : " hidden") + ">Saved ✓</span></div>" +
      backupSectionHtml();
    wireBackup();

    // Every setting is written to the local cache before the remote call even
    // goes out (see saveFsrsSettings/saveDirectionSettings), so a failed sync
    // never loses the change -- this just makes sure a failure is reported
    // instead of vanishing as an unhandled rejection, like add/remove/delete.
    function reportSettingsError(e) {
      window.alert("Saved on this device, but couldn't sync — " + (e.message || "check your connection and try again."));
    }
    function clearSavedNote() {
      settingsSavedAt = 0;
      var n = document.getElementById("fcSettingsSaved");
      if (n) n.hidden = true;
    }
    // One Save for the whole tab -- no guessing which of three buttons a given
    // field belongs to, plus a visible acknowledgement. The ack is driven by a
    // timestamp (not just this node) so an unrelated re-render mid-save still
    // shows it.
    document.getElementById("fcSaveSettings").addEventListener("click", async function () {
      var saveBtn = document.getElementById("fcSaveSettings");
      var enabledMap = {};
      panel.querySelectorAll(".fc-dir-checkbox").forEach(function (cb) { enabledMap[cb.dataset.direction] = cb.checked; });
      if (!DIRECTIONS.some(function (d) { return enabledMap[d]; })) {
        document.getElementById("fcDirError").hidden = false;
        return;
      }
      document.getElementById("fcDirError").hidden = true;

      var retention = Math.min(0.99, Math.max(0.7, Number(document.getElementById("fcRetention").value) / 100));
      var maxInterval = Math.max(1, Number(document.getElementById("fcMaxInterval").value));
      var newPerDay = Math.max(0, Number(document.getElementById("fcNewPerDay").value));

      saveBtn.disabled = true;
      clearSavedNote();
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
        settingsSavedAt = Date.now();
        var note = document.getElementById("fcSettingsSaved");
        if (note) note.hidden = false;
        setTimeout(function () {
          if (Date.now() - settingsSavedAt >= SAVED_FLASH_MS) return;
          settingsSavedAt = 0;
          var n = document.getElementById("fcSettingsSaved");
          if (n) n.hidden = true;
        }, SAVED_FLASH_MS);
      } catch (e) {
        reportSettingsError(e);
      } finally {
        var b = document.getElementById("fcSaveSettings");
        if (b) b.disabled = false;
      }
    });
    // Any edit clears a lingering "Saved ✓" so it always reflects the current form.
    panel.addEventListener("input", clearSavedNote);
    panel.addEventListener("change", clearSavedNote);
  }
  // --- Back up & restore (guest mode) ---
  // Guest data lives only in this browser, so this is the one place a reader can
  // get it out (and back in). Signed-in progress is already in the account.
  function backupSectionHtml() {
    var backup = window.RaumeStudy.flashcards.backup;
    if (!backup) return "";
    if (!backup.available()) {
      return '<div class="fc-settings-section fc-backup-section"><h3>Back up &amp; restore</h3>' +
        '<p class="fc-note">Your progress is saved to your account, so there is nothing to back up here.</p></div>';
    }
    return '<div class="fc-settings-section fc-backup-section"><h3>Back up &amp; restore</h3>' +
      '<p class="fc-note">This device is the only copy of your flashcards, Kana progress, table names and icons, and any words you added — clearing this browser\'s site data loses them. Save a backup file now and then; restoring one replaces what is on this device with what was in the file.</p>' +
      '<div class="fc-cta-row">' +
      '<button type="button" class="fc-btn" id="fcBackupExport">Download backup</button>' +
      '<button type="button" class="fc-btn" id="fcBackupImport">Restore from a file…</button>' +
      '<input type="file" id="fcBackupFile" accept="application/json,.json" hidden></div>' +
      '<div class="fc-auth-error" id="fcBackupError" role="alert" hidden></div></div>';
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
  function settingsField(label, controlHtml, help) {
    return '<div class="fc-settings-field"><div class="fc-settings-field-row"><label>' + esc(label) + "</label>" + controlHtml + "</div>" +
      (help ? '<p class="fc-settings-help">' + esc(help) + "</p>" : "") + "</div>";
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
