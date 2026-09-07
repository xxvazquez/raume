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

  // Spoken pronunciation via the browser's own Web Speech API -- no audio
  // files, no server, nothing to precache. Read live off window.speechSynthesis
  // on every call rather than caching it once, so a page that gains the API
  // later (or a test that stubs it in) is picked up without a reload.
  var speech = (function () {
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
    // Kept alive outside speak()'s own scope on purpose: Chrome garbage-
    // collects a SpeechSynthesisUtterance that nothing still references,
    // which silently kills speech partway through (sometimes before a sound
    // is ever heard) with no error anywhere -- a long-documented Chrome bug,
    // not a Web Speech API requirement. A module-level reference is the
    // standard workaround.
    var currentUtterance = null;
    function speak(text) {
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
      // No UI for this -- just a console breadcrumb so a report of "silent,
      // no error visible" can actually be told apart from a real engine
      // failure (e.g. "not-allowed", "synthesis-failed") next time.
      utterance.onerror = function (e) { console.error("Speech synthesis failed:", e.error); };
      // Interrupt a still-speaking utterance so a second click doesn't queue up
      // behind the first -- but *only* then. Calling cancel() unconditionally
      // right before speak() is what leaves the queue wedged in some Chromium
      // builds, so the new utterance never starts and nothing plays.
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(utterance);
      // Chrome can strand the engine in a paused state after an earlier
      // cancel(); a resume() when it isn't paused is a harmless no-op.
      if (synth.paused) synth.resume();
    }
    return { hasJapaneseVoice: hasJapaneseVoice, onJapaneseVoiceReady: onJapaneseVoiceReady, speak: speak };
  })();
  // Runs once at load: as soon as a Japanese voice is confirmed available,
  // mark it on the document so css/site.css can reveal every speaker button
  // at once -- one check governs the whole app instead of each button
  // re-deriving the same answer.
  speech.onJapaneseVoiceReady(function () {
    document.body.classList.add("ja-voice-ready");
  });

  return { escapeHtml: escapeHtml, speech: speech };
})();
