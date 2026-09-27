// Assigns a permanent, opaque id ("v0001", "v0002", ...) to every vocabulary
// row in data/vocabulary.js that doesn't already have one. Ids are plain
// incrementing tokens -- never derived from romaji/English/position -- so
// they stay valid forever no matter how the row's content or place in the
// file changes later. Idempotent: re-running only fills in ids for rows that
// are missing one (e.g. freshly added vocab); existing ids are never touched
// or reassigned. Flashcards (in Supabase) reference this id, never the
// row's content directly -- see js/flashcards/data-ops.js.
//
// This is a one-off/occasional maintenance script, not part of the site's
// runtime. Run it with `npm run generate:vocab-ids` after adding new rows to
// data/vocabulary.js, then commit the result.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "vocabulary.js");
const ROW_TYPES = ['"type":"word"', '"type":"verb-pair"', '"type":"kanji"'];

function main() {
  const text = fs.readFileSync(FILE, "utf8");
  const lines = text.split("\n");

  // First pass: find every id already in use, so freshly assigned ids never collide.
  let maxN = 0;
  const idPattern = /"id":"v(\d+)"/;
  for (const line of lines) {
    const m = line.match(idPattern);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }

  let assigned = 0;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    const isRow = ROW_TYPES.some((t) => trimmed.includes(t));
    if (!isRow || trimmed.startsWith('{"id"')) return line;

    const indent = line.slice(0, line.length - line.trimStart().length);
    const hasTrailingComma = trimmed.endsWith(",");
    const jsonText = hasTrailingComma ? trimmed.slice(0, -1) : trimmed;

    let row;
    try {
      row = JSON.parse(jsonText);
    } catch (e) {
      throw new Error("Could not parse vocabulary row line: " + line + "\n" + e.message);
    }
    if (row.id) return line; // already has one, leave untouched

    maxN += 1;
    assigned += 1;
    const id = "v" + String(maxN).padStart(4, "0");
    const withId = Object.assign({ id }, row);
    return indent + JSON.stringify(withId) + (hasTrailingComma ? "," : "");
  });

  if (assigned === 0) {
    console.log("Every vocabulary row already has an id. Nothing to do.");
    return;
  }
  fs.writeFileSync(FILE, out.join("\n"));
  console.log("Assigned " + assigned + " new vocabulary id(s) (up to v" + String(maxN).padStart(4, "0") + ").");
}

main();
