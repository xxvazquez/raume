// Helpers shared across more than one feature, published as RaumeStudy.shared.
// Deliberately tiny -- formatting that belongs to a single feature stays with
// that feature. See the load-order comment in index.html.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.shared = (function () {
  "use strict";

  // Escape text for safe interpolation into an HTML string (the vocab and
  // flashcards renderers both build markup as strings).
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Spoken pronunciation. Prefers a prerendered native-voice clip (see
  // scripts/generate-audio.js -- VOICEVOX, generated offline, never at
  // runtime) and falls back to the browser's own Web Speech API for anything
  // without one: custom/imported vocab, or before the manifest has loaded.
  var speech = (function () {
    // Must match AUDIO_GEN_VERSION in scripts/generate-audio.js -- bump both
    // together if the voice or synthesis params ever change, so old and new
    // audio never collide under the same hash.
    var AUDIO_GEN_VERSION = "v1";
    function hash(str) {
      var input = AUDIO_GEN_VERSION + "|" + str;
      var h = 0x811c9dc5;
      for (var i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(36);
    }
    // null until the fetch resolves (a lookup misses harmlessly during that
    // window and falls back to Web Speech); empty Set if the manifest is
    // missing or unreachable (e.g. previewing from file://).
    var audioManifest = null;
    function loadAudioManifest() {
      // Guarded rather than assumed: this runs from file:// during local
      // preview and inside jsdom in scripts/smoke-test.js, where fetch of a
      // relative path can be missing or throw synchronously instead of
      // rejecting -- either way it's just "no prerendered audio available".
      if (typeof fetch !== "function") { audioManifest = new Set(); return Promise.resolve(false); }
      try {
        return fetch("audio/manifest.json")
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (list) { audioManifest = new Set(list); return audioManifest.size > 0; })
          .catch(function () { audioManifest = new Set(); return false; });
      } catch (e) {
        audioManifest = new Set();
        return Promise.resolve(false);
      }
    }
    function getVoices() {
      return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    }
    function japaneseVoices() {
      return getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    }
    // Known-good Japanese system voices, most reliable first. Taking the bare
    // first `ja` voice getVoices() returns is a trap on current macOS / iOS:
    // the list often leads with the "novelty" set (Eddy, Grandma, Rocko, ...),
    // some of which are on-demand downloads that stay silent until fetched.
    // Prefer a real one by name, then any local ja-JP voice, then any local
    // voice, and only then whatever's first.
    var GOOD_JA_VOICE = /kyoko|otoya|o-?ren|hattori|sayaka|nanami|haruka|ayumi|ichiro|keita|(google).*(日本語|japanese)/i;
    function findJapaneseVoice() {
      var ja = japaneseVoices();
      if (!ja.length) return null;
      var byName = null, localJP = null, anyLocal = null;
      for (var i = 0; i < ja.length; i++) {
        var v = ja[i];
        if (!byName && GOOD_JA_VOICE.test(v.name || "")) byName = v;
        if (!localJP && v.localService && /^ja-JP$/i.test(v.lang)) localJP = v;
        if (!anyLocal && v.localService) anyLocal = v;
      }
      return byName || localJP || anyLocal || ja[0];
    }
    function hasJapaneseVoice() { return japaneseVoices().length > 0; }
    // getVoices() is empty until the browser populates its voice list --
    // synchronous on some browsers, only ready after the async "voiceschanged"
    // event on others (notably Chrome). callback fires once a Japanese voice
    // is actually confirmed present, and never otherwise -- a caller uses this
    // to reveal a play control rather than show one that would silently do
    // nothing, or speak in the wrong voice, on a device with no ja voice.
    function onJapaneseVoiceReady(callback) {
      var synth = window.speechSynthesis;
      if (!synth) return;
      if (hasJapaneseVoice()) { callback(); return; }
      var fired = false;
      synth.addEventListener("voiceschanged", function handler() {
        if (fired || !hasJapaneseVoice()) return;
        fired = true;
        synth.removeEventListener("voiceschanged", handler);
        callback();
      });
    }
    // Kept alive outside speakWebSpeech()'s own scope on purpose: Chrome
    // garbage-collects a SpeechSynthesisUtterance that nothing still
    // references, which silently kills speech partway through (sometimes
    // before a sound is ever heard) with no error anywhere -- a long-
    // documented Chrome bug, not a Web Speech API requirement. A module-level
    // reference is the standard workaround.
    var currentUtterance = null;
    function speakWebSpeech(text) {
      var synth = window.speechSynthesis;
      if (!synth || !text || typeof SpeechSynthesisUtterance === "undefined") return;
      var utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;
      utterance.lang = "ja-JP";
      // A mobile Japanese voice at the default rate (1) reads noticeably
      // faster than its desktop counterpart -- clear for a native ear, a
      // blur for a learner sounding out an unfamiliar word.
      utterance.rate = 0.8;
      var voice = findJapaneseVoice();
      if (voice) utterance.voice = voice;
      // No UI for either of these -- just console breadcrumbs, so a report
      // of "silent, no error visible" can actually be told apart from a real
      // engine failure (e.g. "not-allowed", "synthesis-failed") next time.
      utterance.onerror = function (e) { console.error("Speech synthesis failed:", e.error); };
      // A second, worse failure mode than an error event: on some Chrome /
      // macOS system-voice combinations, speak() neither starts nor errors
      // -- speechSynthesis.speaking just stays true forever, dead silent,
      // for *every* voice (confirmed against both a local and a network
      // voice) -- a broken speech engine, not anything this call got wrong.
      // cancel() reliably un-wedges it for the *next* click (stopAll() above
      // already does this before every speak), so this isn't a functional
      // dead-end, just silent -- this is only about making that failure
      // mode visible in the console instead of indistinguishable from
      // "nothing happened".
      var started = false;
      utterance.onstart = function () { started = true; };
      setTimeout(function () {
        if (started || utterance !== currentUtterance) return;
        console.warn("Speech synthesis produced no start/error event within 1.2s -- the browser's speech engine is likely wedged (a known Chrome/macOS issue with some system voices); quitting and reopening the browser usually clears it.");
      }, 1200);
      synth.speak(utterance);
      // Chrome can strand the engine in a paused state after an earlier
      // cancel(); a resume() when it isn't paused is a harmless no-op.
      if (synth.paused) synth.resume();
    }
    // Kept alive the same way as currentUtterance, and for the same reason:
    // an <audio> element with nothing still referencing it can be GC'd and
    // stop mid-playback on some engines.
    var currentAudio = null;
    function playPrerendered(text) {
      if (!audioManifest) return false;
      var h = hash(text);
      if (!audioManifest.has(h)) return false;
      var audio = new Audio("audio/" + h + ".mp3");
      // VOICEVOX's default synthesis speed reads quick and clipped for a
      // learner -- match the same 0.8 slowdown applied to the Web Speech
      // fallback below, so pronunciation sounds equally natural whichever
      // path a given word takes.
      audio.playbackRate = 0.8;
      currentAudio = audio;
      // Falls back to Web Speech rather than staying silent if the file is
      // somehow missing/corrupt despite being listed in the manifest.
      audio.play().catch(function () { speakWebSpeech(text); });
      return true;
    }
    // Interrupts whatever's still playing so a second click doesn't queue up
    // behind the first -- covers both paths since a click can land on either
    // one depending on whether this word has a prerendered clip.
    function stopAll() {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      var synth = window.speechSynthesis;
      if (synth && (synth.speaking || synth.pending)) synth.cancel();
    }
    function speak(text) {
      if (!text) return;
      stopAll();
      if (!playPrerendered(text)) speakWebSpeech(text);
    }
    return {
      hasJapaneseVoice: hasJapaneseVoice,
      onJapaneseVoiceReady: onJapaneseVoiceReady,
      loadAudioManifest: loadAudioManifest,
      speak: speak
    };
  })();
  // Runs once at load: as soon as pronunciation is confirmed available from
  // *either* source, mark it on the document so css/site.css can reveal
  // every speaker button at once -- one check governs the whole app instead
  // of each button re-deriving the same answer. Prerendered audio doesn't
  // depend on the device having any Japanese voice installed, so it's
  // checked independently rather than gating on Web Speech alone.
  function markSpeechReady() { document.body.classList.add("ja-voice-ready"); }
  speech.onJapaneseVoiceReady(markSpeechReady);
  speech.loadAudioManifest().then(function (hasAny) { if (hasAny) markSpeechReady(); });

  return { escapeHtml: escapeHtml, speech: speech };
})();
