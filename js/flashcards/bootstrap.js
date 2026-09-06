// Flashcards -- bootstrap controller (RaumeStudy.flashcards, root).
//
// FSRS-6 spaced repetition on top of the existing vocabulary, split across
// js/flashcards/*.js (store -> vocab-index -> scheduling -> data-ops ->
// dashboard -> views -> this file; see the load-order comment in index.html).
// This module owns the app shell: which entry screen or tab panel is showing,
// the sign-in form, the active-tab state, and the one-time DOMContentLoaded
// init. It publishes render()/setActiveTab()/getActiveTab() for the view
// modules to call back into.
//
// Two independent ways to use Flashcards, the user's choice:
//   - Signed in: Supabase is the sole authoritative store for learning data.
//     localStorage there is only a read-through cache and an offline outbox.
//   - Guest mode: no account, no network -- localStorage *is* the record,
//     under its own separate key. Every feature works the same in both.
// No vocabulary *content* is ever stored anywhere; only each row's permanent
// id is referenced (and in guest mode it never leaves the browser at all).
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
(function () {
  "use strict";

  var S = window.RaumeStudy.flashcards;
  var store = S.store, vidx = S.vocabIndex, sched = S.scheduling;
  var dataOps = S.dataOps, dashboard = S.dashboard, views = S.views, kana = S.kana;
  var esc = window.RaumeStudy.shared.escapeHtml;

  var isGuestMode = store.isGuestMode, setStoredMode = store.setStoredMode, loadCache = store.loadCache;
  var loadKanaCache = store.loadKanaCache;
  var fetchKanaFromServer = dataOps.fetchKanaFromServer, syncKanaOutbox = dataOps.syncKanaOutbox;
  var computeStats = sched.computeStats;
  var authState = dataOps.authState;
  var configured = dataOps.configured, currentUser = dataOps.currentUser;
  var signUp = dataOps.signUp, signIn = dataOps.signIn, signOut = dataOps.signOut;
  var resetPassword = dataOps.resetPassword, updatePassword = dataOps.updatePassword;
  var clearPasswordRecovery = dataOps.clearPasswordRecovery;
  var initAuth = dataOps.initAuth, onAuthChange = dataOps.onAuthChange;
  var fetchAllFromServer = dataOps.fetchAllFromServer, syncOutbox = dataOps.syncOutbox;
  var syncNow = dataOps.syncNow;
  var onSyncStateChange = dataOps.onSyncStateChange, getSyncState = dataOps.getSyncState;
  var renderDashboard = dashboard.renderDashboard, invalidateInsights = dashboard.invalidateInsights;
  var renderManage = views.renderManage, renderSettings = views.renderSettings, renderHelp = views.renderHelp;
  var refreshRowToggleButtons = views.refreshRowToggleButtons;

  // -----------------------------------------------------------------------
  // App shell / tab routing
  // -----------------------------------------------------------------------
  var activeTab = "dashboard";

  function root() { return document.getElementById("flashcardsPage"); }

  function render() {
    var el = root();
    if (!el) return;
    // A password-reset email link lands here with a recovery session already
    // established (see initAuth in data-ops.js) -- show "set a new password"
    // before anything else, even ahead of guest mode, so an old link clicked
    // from a guest-mode browser still completes the reset it's for.
    if (authState.passwordRecovery) { renderPasswordRecovery(el); return; }
    // Guest mode never needs to wait on a network auth check -- it's a
    // stored on-device preference, not a session. Only fall through to
    // "is there an account session?" when guest mode hasn't been chosen.
    if (isGuestMode()) { renderShell(el); return; }
    if (!authState.ready) { el.innerHTML = "<h2>Flashcards</h2><p class=\"fc-lede\">Loading…</p>"; return; }
    if (authState.session) { renderShell(el); return; }
    renderEntryChoice(el);
  }

  var authMode = "signin"; // signin | signup | reset
  var authError = "";
  var authNotice = ""; // a non-error confirmation, e.g. "check your email" -- quiet, not red
  function authFormHtml() {
    if (authMode === "reset") {
      // Email only -- resetPasswordForEmail doesn't need (and Supabase never
      // reveals through it) whether the address has an account at all.
      return '<form class="fc-auth" id="fcAuthForm">' +
        (authError ? '<div class="fc-auth-error">' + esc(authError) + "</div>" : "") +
        (authNotice ? '<p class="fc-note">' + esc(authNotice) + "</p>" : "") +
        '<div class="fc-auth-field"><label for="fcEmail">Email</label><input id="fcEmail" type="email" required autocomplete="email"></div>' +
        '<button type="submit" class="fc-btn">Send reset link</button>' +
        '<div class="fc-auth-switch"><button type="button" id="fcAuthBack">Back to sign in</button></div>' +
        "</form>";
    }
    return '<form class="fc-auth" id="fcAuthForm">' +
      (authError ? '<div class="fc-auth-error">' + esc(authError) + "</div>" : "") +
      (authNotice ? '<p class="fc-note">' + esc(authNotice) + "</p>" : "") +
      '<div class="fc-auth-field"><label for="fcEmail">Email</label><input id="fcEmail" type="email" required autocomplete="email"></div>' +
      '<div class="fc-auth-field"><label for="fcPassword">Password</label><input id="fcPassword" type="password" required autocomplete="' + (authMode === "signup" ? "new-password" : "current-password") + '" minlength="6"></div>' +
      (authMode === "signin" ? '<button type="button" class="fc-auth-forgot" id="fcForgotPassword">Forgot password?</button>' : "") +
      '<button type="submit" class="fc-btn">' + (authMode === "signup" ? "Sign up" : "Sign in") + "</button>" +
      '<div class="fc-auth-switch">' + (authMode === "signup" ? "Already have an account? " : "Need an account? ") +
      '<button type="button" id="fcAuthSwitch">' + (authMode === "signup" ? "Sign in" : "Sign up") + "</button></div>" +
      "</form>";
  }
  function bindAuthForm() {
    document.getElementById("fcAuthForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      authError = ""; authNotice = "";
      var email = document.getElementById("fcEmail").value.trim();
      try {
        if (authMode === "reset") {
          var resetRes = await resetPassword(email);
          if (resetRes.error) throw resetRes.error;
          authNotice = "If an account exists for that email, a link to reset your password is on its way.";
          authMode = "signin";
          render();
          return;
        }
        var password = document.getElementById("fcPassword").value;
        var res = authMode === "signup" ? await signUp(email, password) : await signIn(email, password);
        if (res.error) throw res.error;
        if (authMode === "signup" && res.data && !res.data.session) {
          authError = "Check your email to confirm your account, then sign in.";
          authMode = "signin";
          render();
        }
        // A successful sign-in re-renders via onAuthChange once the session
        // lands -- nothing else to do here.
      } catch (e) {
        authError = e.message || String(e);
        render();
      }
    });
    var switchBtn = document.getElementById("fcAuthSwitch");
    if (switchBtn) switchBtn.addEventListener("click", function () {
      authMode = authMode === "signup" ? "signin" : "signup";
      authError = ""; authNotice = "";
      render();
    });
    var forgotBtn = document.getElementById("fcForgotPassword");
    if (forgotBtn) forgotBtn.addEventListener("click", function () {
      authMode = "reset";
      authError = ""; authNotice = "";
      render();
    });
    var backBtn = document.getElementById("fcAuthBack");
    if (backBtn) backBtn.addEventListener("click", function () {
      authMode = "signin";
      authError = ""; authNotice = "";
      render();
    });
  }

  // Landed here from a "reset your password" email link -- initAuth() (in
  // data-ops.js) already turned the token in the URL into a real session, so
  // this is just "pick a new password", not a second sign-in. Cancel signs
  // the recovery session back out rather than leaving it live unintended.
  var recoveryError = "";
  function renderPasswordRecovery(el) {
    el.innerHTML = "<h2>Flashcards</h2>" +
      '<div class="fc-entry-card fc-recovery-card">' +
      "<h3>Set a new password</h3>" +
      '<p class="fc-note">You followed a password-reset link. Choose a new password to finish signing in.</p>' +
      '<form class="fc-auth" id="fcRecoveryForm">' +
      (recoveryError ? '<div class="fc-auth-error">' + esc(recoveryError) + "</div>" : "") +
      '<div class="fc-auth-field"><label for="fcNewPassword">New password</label><input id="fcNewPassword" type="password" required autocomplete="new-password" minlength="6"></div>' +
      '<button type="submit" class="fc-btn fc-btn-primary">Set new password</button>' +
      "</form>" +
      '<div class="fc-auth-switch"><button type="button" id="fcRecoveryCancel">Cancel</button></div>' +
      "</div>";
    document.getElementById("fcRecoveryForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      recoveryError = "";
      var newPassword = document.getElementById("fcNewPassword").value;
      try {
        var res = await updatePassword(newPassword);
        if (res.error) throw res.error;
        clearPasswordRecovery();
        render(); // now an ordinary signed-in session -> falls into renderShell
      } catch (e) {
        recoveryError = e.message || String(e);
        render();
      }
    });
    document.getElementById("fcRecoveryCancel").addEventListener("click", function () {
      recoveryError = "";
      signOut(); // also clears passwordRecovery; onAuthChange re-renders
    });
  }

  // Two equally valid ways in -- no account needed at all, or sign in for
  // cross-device sync. Guest mode works even without a Supabase project
  // configured; syncing obviously doesn't.
  function renderEntryChoice(el) {
    el.innerHTML = "<h2>Flashcards</h2>" +
      '<p class="fc-lede">Add vocabulary to your flashcards and track your reviews. Use it right here on this device, or sign in to keep it synced everywhere.</p>' +
      '<div class="fc-entry-grid">' +
      '<div class="fc-entry-card"><h3>This device only</h3>' +
      '<p class="fc-note">Stored in this browser — nothing to set up, nothing sent anywhere. Clearing site data or switching browsers loses it.</p>' +
      '<button type="button" class="fc-btn" id="fcUseGuest">Continue without an account</button></div>' +
      '<div class="fc-entry-card"><h3>Sync across devices</h3>' +
      (configured()
        ? '<p class="fc-note">Free account, backed by Supabase. Only you can see your data.</p>' + authFormHtml()
        : '<p class="fc-note">Needs a one-time setup — see <code>SUPABASE_SETUP.md</code> in the project, then fill in <code>js/config.js</code>.</p>') +
      "</div></div>";
    document.getElementById("fcUseGuest").addEventListener("click", function () {
      setStoredMode("guest");
      invalidateInsights();
      render();
      refreshRowToggleButtons(); // the vocabulary page's own "added" icons switch to this mode's (empty, at first) cache too
    });
    if (configured()) bindAuthForm();
  }

  var initialSyncDone = false;
  var kanaSyncedFor = null;
  function renderShell(el) {
    if (!isGuestMode() && !initialSyncDone) {
      initialSyncDone = true;
      fetchAllFromServer().then(function () { invalidateInsights(); syncOutbox(); render(); }).catch(function (e) { console.error("Flashcards: could not load from Supabase", e); render(); });
    }
    // Kana trainer: pull its cards + picker prefs once per signed-in user
    // (re-runs after a sign-out/in), then flush any offline reviews.
    var uid = !isGuestMode() && currentUser() ? currentUser().id : null;
    if (uid && kanaSyncedFor !== uid) {
      kanaSyncedFor = uid;
      fetchKanaFromServer().then(function () { syncKanaOutbox(); render(); }).catch(function (e) { console.error("Flashcards: could not load kana progress from Supabase", e); });
    }
    var stats = computeStats(new Date());
    var identityHtml = isGuestMode()
      ? '<div class="fc-signed-in-as">Using this device only — not backed up <button type="button" id="fcGoAccount">Sign in to sync</button></div>'
      : '<div class="fc-signed-in-as">Signed in as ' + esc(currentUser().email) + ' <button type="button" id="fcSignOut">Sign out</button></div>';
    el.innerHTML =
      "<h2>Flashcards</h2>" +
      identityHtml +
      '<div class="fc-sync-chip" id="fcSyncChip" hidden><span class="fc-sync-chip-text" role="status" aria-live="polite"></span></div>' +
      '<div class="fc-tabs" role="tablist">' +
      [["dashboard", "Dashboard"], ["manage", "Manage"], ["kana", "Kana"], ["settings", "Settings"], ["help", "Help"]].map(function (t) {
        return '<button type="button" class="fc-tab' + (activeTab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '" role="tab" aria-selected="' + (activeTab === t[0]) + '">' + t[1] + "</button>";
      }).join("") +
      "</div>" +
      '<div class="fc-tabpanel"' + (activeTab === "dashboard" ? "" : " hidden") + ' id="fcPanelDashboard"></div>' +
      '<div class="fc-tabpanel"' + (activeTab === "manage" ? "" : " hidden") + ' id="fcPanelManage"></div>' +
      '<div class="fc-tabpanel"' + (activeTab === "kana" ? "" : " hidden") + ' id="fcPanelKana"></div>' +
      '<div class="fc-tabpanel"' + (activeTab === "settings" ? "" : " hidden") + ' id="fcPanelSettings"></div>' +
      '<div class="fc-tabpanel"' + (activeTab === "help" ? "" : " hidden") + ' id="fcPanelHelp"></div>';

    if (isGuestMode()) {
      // Leaves the guest cache exactly as it is (own localStorage key) --
      // this only forgets the "use guest mode" preference so render() falls
      // through to the sign-in/sign-up choice again.
      document.getElementById("fcGoAccount").addEventListener("click", function () { setStoredMode(null); invalidateInsights(); render(); refreshRowToggleButtons(); });
    } else {
      document.getElementById("fcSignOut").addEventListener("click", function () { signOut(); });
    }
    el.querySelectorAll(".fc-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeTab = btn.dataset.tab;
        dashboard.setSession(null);
        if (kana) kana.clearSession();
        render();
      });
    });

    if (activeTab === "dashboard") renderDashboard(document.getElementById("fcPanelDashboard"), stats);
    else if (activeTab === "manage") renderManage(document.getElementById("fcPanelManage"));
    else if (activeTab === "kana") kana.renderKana(document.getElementById("fcPanelKana"));
    else if (activeTab === "help") renderHelp(document.getElementById("fcPanelHelp"));
    else renderSettings(document.getElementById("fcPanelSettings"));

    updateSyncChip();
  }

  // Offline / pending-sync chip -- sits under the identity line, its text
  // announced via aria-live. Offline reads first (it applies in guest mode too,
  // where there's nothing queued); otherwise it counts reviews still in the
  // outbox and stays hidden once everything's synced. When a sync has stopped
  // draining on its own, it turns amber and grows a "Sync now" button.
  function reviewCount(n) { return n + (n === 1 ? " review" : " reviews"); }
  function updateSyncChip() {
    var chip = document.getElementById("fcSyncChip");
    if (!chip) return;
    var st = getSyncState();
    var text = "", cls = "", showBtn = false;
    if (!st.online) {
      text = "Offline — reviews are saved on this device";
      cls = " fc-sync-chip-offline";
    } else if (st.pending > 0) {
      if (st.syncing) {
        text = "Syncing " + reviewCount(st.pending) + "…";
        cls = " fc-sync-chip-syncing";
      } else if (st.stalled) {
        text = reviewCount(st.pending) + " couldn't sync";
        cls = " fc-sync-chip-offline";
        showBtn = true;
      } else {
        text = reviewCount(st.pending) + " to sync";
        cls = " fc-sync-chip-syncing";
        showBtn = true;
      }
    }
    chip.className = "fc-sync-chip" + cls;
    chip.hidden = !text;
    var span = chip.querySelector(".fc-sync-chip-text");
    if (span) span.textContent = text;
    var btn = chip.querySelector(".fc-sync-now");
    if (showBtn && !btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fc-sync-now";
      btn.textContent = "Sync now";
      btn.addEventListener("click", function () { syncNow(); });
      chip.appendChild(btn);
    } else if (!showBtn && btn) {
      btn.remove();
    }
  }
  onSyncStateChange(updateSyncChip);

  // While offline (or between a review and its sync) the Dashboard computes its
  // history -- "Today", the weekly chart, "Words to review" -- from the local
  // outbox (see dashboard.js). Once the outbox drains, or we reconnect with
  // nothing queued, those caches are stale: refresh them from the server.
  var lastSyncPending = null;
  onSyncStateChange(function (st) {
    var drained = st.online && st.pending === 0 && lastSyncPending !== null && lastSyncPending !== 0;
    lastSyncPending = st.pending;
    if (drained && !isGuestMode() && activeTab === "dashboard" &&
        !dashboard.getSession() && document.body.dataset.activePage === "flashcards") {
      invalidateInsights();
      render();
    }
  });

  // Called back into by the view modules (dashboard.js, views.js).
  S.render = render;
  S.setActiveTab = function (t) { activeTab = t; };
  S.getActiveTab = function () { return activeTab; };

  onAuthChange(function () { invalidateInsights(); render(); refreshRowToggleButtons(); });

  // Vocabulary-page table icons: while signed in, a local pick is pushed to
  // the account (fetchAllFromServer pulls them back the other way on sign-in).
  if (window.RaumeStudy.tableCustom) {
    window.RaumeStudy.tableCustom.setRemotePush(function (obj) {
      if (authState.session) dataOps.saveTableCustomRemote(obj).catch(function () {});
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadCache();
    loadKanaCache();
    initAuth();
    render();
    refreshRowToggleButtons();
  });

  // Pure-logic hooks for scripts/smoke-test.js -- exposes nothing sensitive
  // (no network/auth/cache access), just lets answer-checking / vocab-index
  // behavior be tested without a live Supabase project.
  S.__testHooks = {
    normalizeAnswer: vidx.normalizeAnswer, checkAnswer: vidx.checkAnswer,
    getVocabIndex: vidx.getVocabIndex, directionsForEntry: vidx.directionsForEntry,
    isRomajiUsable: vidx.isRomajiUsable, promptFor: vidx.promptFor
  };
})();
