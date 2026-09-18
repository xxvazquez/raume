// Per-table personalisation -- a custom icon, a custom display name, and a
// custom running order for tables and categories -- layered over the Git-only
// vocabulary data. localStorage is the
// immediate source of truth so
// headers render without waiting on the network; when the flashcards feature
// reports a signed-in account it also syncs through Supabase (see
// js/flashcards/data-ops.js + bootstrap.js), so a chosen icon follows you to
// another device. Never touches the dataset or its validation.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.tableCustom = (function () {
  "use strict";

  var KEY = "raume-table-custom"; // old "sakura-table-custom" is moved across once by js/storage-migration.js
  var cache = null;
  var listeners = [];
  var remotePush = null;

  function load() {
    if (cache) return cache;
    try {
      var raw = window.localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : {};
    } catch (e) { cache = {}; }
    if (!cache || typeof cache !== "object") cache = {};
    return cache;
  }
  function persistLocal() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  }
  function announce() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // A local edit: write through to localStorage, tell the UI, and push the
  // whole object to the account if one is connected (last edit wins).
  function mutate(fn) {
    load();
    fn();
    persistLocal();
    announce();
    if (remotePush) { try { remotePush(getAll()); } catch (e) {} }
  }

  function entry(id) { return load()[String(id)] || {}; }
  function iconOf(id) { return entry(id).icon || ""; }
  function nameOf(id) { return entry(id).name || ""; }
  function getAll() { return JSON.parse(JSON.stringify(load())); }

  // Set (or, with a falsy value, clear) one field of a table's record, pruning
  // the record entirely once it holds nothing.
  function setField(id, field, value) {
    mutate(function () {
      var k = String(id);
      if (value) { cache[k] = cache[k] || {}; cache[k][field] = value; }
      else if (cache[k]) { delete cache[k][field]; if (!Object.keys(cache[k]).length) delete cache[k]; }
    });
  }
  function setIcon(id, icon) { setField(id, "icon", icon); }
  function setName(id, name) {
    setField(id, "name", typeof name === "string" ? name.trim().slice(0, 40) : "");
  }
  // Drop every customisation for one table (the Customize page's per-row reset).
  // Order lives under a separate key, so a table keeps its custom position.
  function clear(id) {
    mutate(function () { delete cache[String(id)]; });
  }

  // ---- Running order -------------------------------------------------------
  // One reserved record, "__order", holds the custom sequence the reader set
  // on the Customize page:
  //   { tables: { [categoryName]: [tableId, ...] },
  //     categories: { [sectionName]: [categoryName, ...] } }
  // A list only names the items the reader has moved; anything unlisted keeps
  // its default (A-Z) position after them. Table ids are never "__order", so
  // this can't collide with a real table's record.
  var ORDER_KEY = "__order";
  function orderRecord() {
    var o = load()[ORDER_KEY];
    return o && typeof o === "object" ? o : {};
  }
  function tableOrder(categoryName) {
    var t = orderRecord().tables || {};
    return Array.isArray(t[categoryName]) ? t[categoryName].map(String) : null;
  }
  function categoryOrder(sectionName) {
    var c = orderRecord().categories || {};
    return Array.isArray(c[sectionName]) ? c[sectionName].slice() : null;
  }
  function setTableOrder(categoryName, ids) {
    mutate(function () {
      var rec = cache[ORDER_KEY] && typeof cache[ORDER_KEY] === "object" ? cache[ORDER_KEY] : {};
      rec.tables = rec.tables || {};
      rec.tables[categoryName] = (ids || []).map(String);
      cache[ORDER_KEY] = rec;
    });
  }
  function setCategoryOrder(sectionName, names) {
    mutate(function () {
      var rec = cache[ORDER_KEY] && typeof cache[ORDER_KEY] === "object" ? cache[ORDER_KEY] : {};
      rec.categories = rec.categories || {};
      rec.categories[sectionName] = (names || []).slice();
      cache[ORDER_KEY] = rec;
    });
  }
  function hasCustomOrder() {
    var rec = orderRecord();
    return !!((rec.tables && Object.keys(rec.tables).length) || (rec.categories && Object.keys(rec.categories).length));
  }
  function resetOrder() {
    mutate(function () { delete cache[ORDER_KEY]; });
  }

  // Reconcile with the account's copy on sign-in. Per table: the account wins
  // for any table it already has (it's the shared source of truth across
  // devices), but a table customised locally that the account doesn't know
  // about yet -- e.g. set as a guest, before signing in -- is kept and pushed
  // up rather than dropped.
  function applyRemote(obj) {
    var remote = obj && typeof obj === "object" ? obj : {};
    load();
    var merged = {};
    Object.keys(cache).forEach(function (k) { merged[k] = cache[k]; });
    Object.keys(remote).forEach(function (k) { merged[k] = remote[k]; });
    var mergedJson = JSON.stringify(merged);
    var changedLocally = mergedJson !== JSON.stringify(cache);
    var addsToRemote = mergedJson !== JSON.stringify(remote);
    if (!changedLocally && !addsToRemote) return;
    if (changedLocally) {
      cache = JSON.parse(mergedJson);
      persistLocal();
      announce();
    }
    if (addsToRemote && remotePush) { try { remotePush(getAll()); } catch (e) {} }
  }

  function onChange(fn) { listeners.push(fn); }
  function setRemotePush(fn) { remotePush = fn; }

  return {
    iconOf: iconOf, nameOf: nameOf, entry: entry, getAll: getAll,
    setIcon: setIcon, setName: setName, clear: clear,
    tableOrder: tableOrder, categoryOrder: categoryOrder,
    setTableOrder: setTableOrder, setCategoryOrder: setCategoryOrder,
    hasCustomOrder: hasCustomOrder, resetOrder: resetOrder,
    applyRemote: applyRemote, onChange: onChange, setRemotePush: setRemotePush,
    STORAGE_KEY: KEY
  };
})();
