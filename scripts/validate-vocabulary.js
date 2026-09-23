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
const expectedTables = 32;
const expectedRows = 661;
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

// Adjective classification guard. An い-adjective (adj: "i") must end in い; a
// な-adjective (adj: "na") that *sounds* like it ends in い (きれい, 嫌い, 有名)
// and an い-adjective that conjugates oddly (いい, かっこいい → よくない) are the
// two traps, so each must carry an adjNote explaining itself (the outlined badge
// + footnote in the UI). adjNote is meaningless without an adj.
// い-adjectives that merely end in いい but conjugate regularly (かわいくない) --
// everything else ending in いい is the irregular いい family (よくない).
const REGULAR_II_ADJECTIVES = ["かわいい"];
function readingOf(row) {
  return row.jp.map(seg => seg.reading || seg.text || seg.p || "").join("").replace(/[\s\/].*$/, "");
}
for (const table of tableList) {
  for (const row of table.rows) {
    if (row.adj === undefined && row.adjNote === undefined) continue;
    const label = table.title + " " + row.id;
    if (row.adj !== "i" && row.adj !== "na") {
      console.error("Adjective validation failed: adj must be \"i\" or \"na\" (" + label + ").");
      process.exit(1);
    }
    const reading = readingOf(row);
    if (row.adj === "i" && !reading.endsWith("い")) {
      console.error("Adjective validation failed: an い-adjective's reading must end in い, got \"" + reading + "\" (" + label + ") -- is it really a な-adjective?");
      process.exit(1);
    }
    if (row.adj === "na" && reading.endsWith("い") && !row.adjNote) {
      console.error("Adjective validation failed: a な-adjective whose reading ends in い (" + reading + ", " + label + ") needs an adjNote saying it takes な.");
      process.exit(1);
    }
    if (row.adj === "i" && reading.endsWith("いい") && !REGULAR_II_ADJECTIVES.includes(reading) && !row.adjNote) {
      console.error("Adjective validation failed: an い-adjective ending in いい (" + reading + ", " + label + ") conjugates irregularly (よくない) and needs an adjNote.");
      process.exit(1);
    }
  }
}
console.log("Adjective classification validation passed: " + tableList.reduce((n, t) => n + t.rows.filter(r => r.adj).length, 0) + " adjectives, " + tableList.reduce((n, t) => n + t.rows.filter(r => r.adjNote).length, 0) + " irregular.");

// Verb classification guard, the same idea as the adjective one above but for
// every verb-pair's group: 五段 (godan), 一段 (ichidan) or 変格 (irregular:
// する/来る). Godan vs. ichidan isn't visible from spelling alone (both include
// verbs ending in -eru/-iru), but the two forms already in the data settle
// it: an ichidan verb's polite form is its plain form with the final る
// swapped for ます, nothing else touched. A godan verb ending in -eru/-iru
// (切る, 帰る) looks ichidan and would be mistaken for one, so it needs a
// verbNote explaining the exception (the outlined badge + footnote in the UI).
const IE_ROW_KANA = ["い", "き", "し", "ち", "に", "ひ", "み", "り", "ぎ", "じ", "ぢ", "び", "ぴ",
  "え", "け", "せ", "て", "ね", "へ", "め", "れ", "げ", "ぜ", "で", "べ", "ぺ"];
function verbFormReading(row, idx) {
  return row.forms[idx].jp.map(seg => seg.reading || seg.text || "").join("");
}
for (const table of tableList) {
  for (const row of table.rows) {
    if (row.type !== "verb-pair") continue;
    const label = table.title + " " + row.id;
    if (row.verbClass !== "godan" && row.verbClass !== "ichidan" && row.verbClass !== "irregular") {
      console.error("Verb validation failed: verbClass must be \"godan\", \"ichidan\" or \"irregular\" (" + label + ").");
      process.exit(1);
    }
    const plain = verbFormReading(row, 0), polite = verbFormReading(row, 1);
    if (row.verbClass === "ichidan" && (!plain.endsWith("る") || polite !== plain.slice(0, -1) + "ます")) {
      console.error("Verb validation failed: " + plain + " is marked ichidan but its polite form " + polite + " isn't " + plain.slice(0, -1) + "ます (" + label + ").");
      process.exit(1);
    }
    if (row.verbClass === "godan" && !row.verbNote && plain.endsWith("る") && IE_ROW_KANA.includes(plain[plain.length - 2])) {
      console.error("Verb validation failed: " + plain + " looks ichidan (ends -eru/-iru) but is marked godan -- needs a verbNote explaining the exception (" + label + ").");
      process.exit(1);
    }
  }
}
console.log("Verb classification validation passed: " + tableList.reduce((n, t) => n + t.rows.filter(r => r.type === "verb-pair" && r.verbClass).length, 0) + " verbs, " + tableList.reduce((n, t) => n + t.rows.filter(r => r.type === "verb-pair" && r.verbNote).length, 0) + " irregular.");

// Particle guard. Every verb row must say what particles it takes (an empty
// list is a deliberate "none": 疲れる, 寝る, 泳ぐ, 起きる) so a new verb can't
// ship unclassified; every entry is a known particle (or "に / へ" style pairs)
// with a short role. 好き / 嫌い / 上手 / 下手 must take が.
const PARTICLES = ["が", "を", "に", "へ", "で", "と", "から", "まで"];
for (const table of tableList) {
  for (const row of table.rows) {
    const label = table.title + " " + row.id;
    if (row.type === "verb-pair" && !Array.isArray(row.particles)) {
      console.error("Particle validation failed: a verb needs a `particles` list (use [] for none) (" + label + ").");
      process.exit(1);
    }
    if (row.particles === undefined) continue;
    if (!Array.isArray(row.particles)) { console.error("Particle validation failed: particles must be a list (" + label + ")."); process.exit(1); }
    for (const q of row.particles) {
      const parts = String(q.p || "").split(/\s*\/\s*/);
      if (!q.p || !parts.every(x => PARTICLES.includes(x)) || !q.role || typeof q.role !== "string") {
        console.error("Particle validation failed: each entry needs a known particle and a role, got " + JSON.stringify(q) + " (" + label + ").");
        process.exit(1);
      }
    }
    if (row.type !== "verb-pair" && !row.adj) {
      console.error("Particle validation failed: particles belong on verbs and adjectives only (" + label + ").");
      process.exit(1);
    }
  }
}
const GA_ADJECTIVES = ["すき", "きらい", "じょうず", "へた"];
for (const table of tableList) {
  for (const row of table.rows) {
    if (row.type === "verb-pair" || !row.adj) continue;
    if (GA_ADJECTIVES.includes(readingOf(row)) && !(row.particles || []).some(q => q.p === "が")) {
      console.error("Particle validation failed: " + readingOf(row) + " takes が (" + table.title + " " + row.id + ").");
      process.exit(1);
    }
  }
}
console.log("Particle validation passed: " + tableList.reduce((n, t) => n + t.rows.filter(r => r.particles && r.particles.length).length, 0) + " words take particles.");

// Question / answer pairs (sentence tables like Self-introduction): a row is
// "qa": "q" or "qa": "a"; an answer names its question ("answers": id) and
// sits right after it (or after another answer to the same question), since
// the table keeps authored order and draws each pair as one unit. Every
// question needs at least one answer.
let qaPairs = 0;
for (const table of tableList) {
  const byId = new Map(table.rows.map(r => [r.id, r]));
  const answered = new Set();
  table.rows.forEach((row, i) => {
    const label = table.title + " " + row.id;
    if (row.qa === undefined) {
      if (row.answers !== undefined) { console.error("Q/A validation failed: `answers` needs \"qa\": \"a\" (" + label + ")."); process.exit(1); }
      return;
    }
    if (row.qa !== "q" && row.qa !== "a") { console.error("Q/A validation failed: qa must be \"q\" or \"a\" (" + label + ")."); process.exit(1); }
    if (row.qa === "q") {
      if (row.answers !== undefined) { console.error("Q/A validation failed: a question can't have `answers` (" + label + ")."); process.exit(1); }
      return;
    }
    const q = byId.get(row.answers);
    if (!q || q.qa !== "q") { console.error("Q/A validation failed: an answer must name a question in the same table (" + label + " -> " + row.answers + ")."); process.exit(1); }
    const prev = table.rows[i - 1];
    if (!prev || !(prev.id === q.id || (prev.qa === "a" && prev.answers === q.id))) {
      console.error("Q/A validation failed: an answer must come right after its question (" + label + ").");
      process.exit(1);
    }
    answered.add(q.id);
    qaPairs++;
  });
  for (const row of table.rows) {
    if (row.qa === "q" && !answered.has(row.id)) { console.error("Q/A validation failed: question " + row.id + " has no answer (" + table.title + ")."); process.exit(1); }
  }
}
console.log("Q/A validation passed: " + qaPairs + " answers, each after its question.");
