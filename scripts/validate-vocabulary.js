const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("data/vocabulary.js", "utf8");
const page = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/site.css", "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const tableList = (sandbox.window.RaumeStudy && sandbox.window.RaumeStudy.data.vocabularyTables) || [];
const tableCount = tableList.length;
const rowCount = tableList.reduce((total, t) => total + t.rows.length, 0);
const expectedTables = 24;
const expectedRows = 550;
if (tableCount !== expectedTables || rowCount !== expectedRows) {
  console.error("Vocabulary validation failed: found " + rowCount + " rows across " + tableCount + " tables; expected " + expectedRows + " rows across " + expectedTables + " tables.");
  process.exit(1);
}
if (!page.includes('role="status"') || !page.includes('aria-live="polite"')) { console.error("Accessibility validation failed: search results must use a live status region."); process.exit(1); }
if (!page.includes('aria-label="Search vocabulary"') || !css.includes(":focus-visible")) { console.error("Accessibility validation failed: search labeling or focus styling is missing."); process.exit(1); }
if (!/function\s+sortHeader/.test(fs.readFileSync("js/vocab/render.js", "utf8"))) { console.error("Accessibility validation failed: table headings must be rendered with sort controls."); process.exit(1); }
console.log("Vocabulary and accessibility validation passed: " + rowCount + " rows across " + tableCount + " tables.");

const japanesePattern = /[ぁ-ゖァ-ヺ一-龯々〆ヵヶ〜]/;
const seenVocabulary = new Set();
const seenIds = new Set();
const idPattern = /^v\d{4,}$/;

for (const table of tableList) {
  for (const row of table.rows) {
    if (!row.id || !idPattern.test(row.id)) {
      console.error("Vocabulary id validation failed: every row needs a permanent \"vNNNN\" id (" + table.title + "): " + JSON.stringify(row));
      process.exit(1);
    }
    if (seenIds.has(row.id)) {
      console.error("Vocabulary id validation failed: duplicate id " + row.id);
      process.exit(1);
    }
    seenIds.add(row.id);
  }
}
console.log("Vocabulary id validation passed: " + seenIds.size + " unique permanent ids.");

function jpText(segments) {
  return segments.map(seg => seg.kanji ? seg.kanji + seg.reading : (seg.text || seg.p || "")).join("");
}

for (const table of tableList) {
  for (const row of table.rows) {
    if (row.type === "verb-pair") {
      if (!row.forms || row.forms.length < 2 || !row.english) {
        console.error("Vocabulary quality validation failed: verb-pair rows need at least two forms and an English meaning (" + table.title + ").");
        process.exit(1);
      }
      for (const form of row.forms) {
        const jp = jpText(form.jp);
        if (!japanesePattern.test(jp)) {
          console.error("Vocabulary quality validation failed: verb-pair form must contain Japanese script: " + jp);
          process.exit(1);
        }
        if (!jp || !form.romaji) {
          console.error("Vocabulary quality validation failed: verb-pair form is missing text (" + table.title + ").");
          process.exit(1);
        }
      }
      const key = row.forms.map(f => jpText(f.jp)).join("/") + "|" + row.english;
      if (seenVocabulary.has(key)) { console.error("Vocabulary quality validation failed: duplicate entry: " + key); process.exit(1); }
      seenVocabulary.add(key);
      continue;
    }

    const jp = jpText(row.jp);
    if (!japanesePattern.test(jp)) {
      console.error("Vocabulary quality validation failed: Japanese cell must contain Japanese script: " + jp);
      process.exit(1);
    }
    if (!jp || !row.romaji || !row.english) {
      console.error("Vocabulary quality validation failed: romaji/polite form and English meaning cannot be empty (" + table.title + ").");
      process.exit(1);
    }
    const key = jp + "|" + row.english;
    if (seenVocabulary.has(key)) {
      console.error("Vocabulary quality validation failed: duplicate Japanese/meaning pair: " + key);
      process.exit(1);
    }
    seenVocabulary.add(key);
  }
}
console.log("Vocabulary quality validation passed: no empty fields, no missing Japanese script, no duplicate entries.");
