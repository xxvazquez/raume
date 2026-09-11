// Generates prerendered Japanese pronunciation audio for every vocabulary
// reading, via a local VOICEVOX engine (https://voicevox.hiroshiba.jp/) --
// free, no account, no API key. This never runs as part of the app or the
// Pages deploy: it's a heavy, occasional job driven by
// .github/workflows/generate-audio.yml, triggered manually from the Actions
// tab whenever data/vocabulary.js gains new/changed readings.
//
// Output: audio/<hash>.mp3 (one per unique reading) + audio/manifest.json
// (the sorted list of hashes that exist). js/shared.js computes the same
// hash at runtime and plays audio/<hash>.mp3 when the manifest lists it,
// falling back to the Web Speech API otherwise -- which is the only option
// for custom/imported vocab, since it never appears in data/vocabulary.js.
//
// AUDIO_GEN_VERSION must match the copy in js/shared.js -- bump both
// together whenever the voice or synthesis params change, so old and new
// audio never collide under the same hash.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ENGINE_URL = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";
const AUDIO_GEN_VERSION = "v1";
const AUDIO_DIR = path.join(__dirname, "..", "audio");

// Same FNV-1a used by js/shared.js -- only needs to be a stable, collision-
// unlikely filename, not cryptographically strong.
function hash(str) {
  var input = AUDIO_GEN_VERSION + "|" + str;
  var h = 0x811c9dc5;
  for (var i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Mirrors js/vocab/render.js's jpReadingOf -- kept independent (this script
// runs outside the browser, before any RaumeStudy namespace exists) rather
// than shared, per the project's no-modules/no-bundler constraint.
function jpReadingOf(segments) {
  return segments.map((seg) => seg.reading || seg.kanji || seg.text || seg.p || "").join("");
}

function collectReadings() {
  const source = fs.readFileSync(path.join(__dirname, "..", "data", "vocabulary.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const tables = (sandbox.window.RaumeStudy && sandbox.window.RaumeStudy.data.vocabularyTables) || [];
  const readings = new Set();
  for (const table of tables) {
    for (const row of table.rows) {
      if (row.jp) readings.add(jpReadingOf(row.jp));
      if (row.forms) for (const f of row.forms) if (f.jp) readings.add(jpReadingOf(f.jp));
    }
  }
  readings.delete("");
  return Array.from(readings);
}

// A small, fixed sample spanning short/long readings, spoken in a handful of
// candidate voices so a person can compare them before committing to one for
// the full run. The voice list itself is asked from the running engine
// (GET /speakers) rather than hardcoded here -- style ids are stable within
// a VOICEVOX version but the id-to-character mapping lives in the compiled
// voice library, not anywhere this script can otherwise see, so guessing
// names in source would risk documenting (and crediting) the wrong one.
const PREVIEW_READINGS = ["こんにちは", "ありがとうございます", "こうちゃ", "だいがく", "いってきます"];
const PREVIEW_VOICE_COUNT = 4;

async function pickPreviewSpeakers() {
  const speakers = await fetch(ENGINE_URL + "/speakers").then((r) => r.json());
  // Every character offers several styles (Normal, Sweet, Tsundere, ...) --
  // this app wants one clear, plain reading voice, so prefer whichever style
  // is literally named "ノーマル" (Normal) and take one per character.
  const picks = [];
  for (const character of speakers) {
    const style = character.styles.find((s) => s.name === "ノーマル") || character.styles[0];
    picks.push({ id: style.id, label: character.name + " / " + style.name });
    if (picks.length >= PREVIEW_VOICE_COUNT) break;
  }
  return picks;
}

async function synthesize(text, speakerId) {
  const query = await fetch(
    ENGINE_URL + "/audio_query?speaker=" + speakerId + "&text=" + encodeURIComponent(text),
    { method: "POST" }
  ).then((r) => {
    if (!r.ok) throw new Error("audio_query " + r.status + " for " + JSON.stringify(text));
    return r.json();
  });
  const wav = await fetch(ENGINE_URL + "/synthesis?speaker=" + speakerId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  }).then((r) => {
    if (!r.ok) throw new Error("synthesis " + r.status + " for " + JSON.stringify(text));
    return r.arrayBuffer();
  });
  return Buffer.from(wav);
}

function wavToMp3(wavBuf, mp3Path) {
  const wavPath = mp3Path.replace(/\.mp3$/, ".wav");
  fs.writeFileSync(wavPath, wavBuf);
  execFileSync("ffmpeg", ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-qscale:a", "6", mp3Path], {
    stdio: "ignore",
  });
  fs.unlinkSync(wavPath);
}

async function runPreview() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const speakers = await pickPreviewSpeakers();
  console.log("Generating preview clips: " + PREVIEW_READINGS.length + " readings x " + speakers.length + " voices.");
  for (const speaker of speakers) {
    for (const text of PREVIEW_READINGS) {
      const name = "preview-speaker" + speaker.id + "-" + hash(text) + ".mp3";
      const wavBuf = await synthesize(text, speaker.id);
      wavToMp3(wavBuf, path.join(AUDIO_DIR, name));
      console.log("  " + name + "  (" + text + ")");
    }
  }
  // Names come straight from the engine, not guessed -- this is the
  // authoritative id-to-character mapping to read before picking one for
  // "full" mode (and for the required VOICEVOX credit line in README.md).
  fs.writeFileSync(path.join(AUDIO_DIR, "PREVIEW_SPEAKERS.txt"),
    speakers.map((s) => "speaker id " + s.id + " = " + s.label).join("\n") + "\n");
  console.log("Preview done. Listen to the clips (see PREVIEW_SPEAKERS.txt for names), pick a speaker id, then re-run in \"full\" mode with that id.");
}

async function runFull(speakerId) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const readings = collectReadings();
  console.log("Found " + readings.length + " unique readings. Using speaker " + speakerId + ".");

  const manifestPath = path.join(AUDIO_DIR, "manifest.json");
  const existing = new Set(fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : []);

  let generated = 0;
  const keepHashes = new Set();
  for (const text of readings) {
    const h = hash(text);
    keepHashes.add(h);
    const mp3Path = path.join(AUDIO_DIR, h + ".mp3");
    if (existing.has(h) && fs.existsSync(mp3Path)) continue;
    const wavBuf = await synthesize(text, speakerId);
    wavToMp3(wavBuf, mp3Path);
    generated++;
    if (generated % 25 === 0) console.log("  generated " + generated + "...");
  }

  // Drop audio for readings no longer in the vocabulary (renamed/removed rows)
  // or left over from a previous AUDIO_GEN_VERSION/speaker.
  let pruned = 0;
  for (const file of fs.readdirSync(AUDIO_DIR)) {
    if (!file.endsWith(".mp3") || file.startsWith("preview-")) continue;
    const h = file.slice(0, -4);
    if (!keepHashes.has(h)) { fs.unlinkSync(path.join(AUDIO_DIR, file)); pruned++; }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(Array.from(keepHashes).sort()));
  console.log("Generated " + generated + " new/changed clips, pruned " + pruned + ", " + keepHashes.size + " total in manifest.");
}

const mode = process.argv.includes("--preview") ? "preview" : "full";
const speakerId = Number(process.env.VOICEVOX_SPEAKER || 2);

(mode === "preview" ? runPreview() : runFull(speakerId)).catch((err) => {
  console.error(err);
  process.exit(1);
});
