/* Vendored unchanged from https://github.com/luciangreen/newos (web/tts.js), as used by retromr. */
/*  tts.js - newos speech: text-to-speech with lip-sync, and voice recognition.

    Shared by the newos chat page and by retromr (the talking photo).

    NewosVoice.speak(text, { rate, pitch, voice, onStart, onEnd, onMouth, onBlocked })
        Speaks text with the browser's speech synthesis.  onMouth(open)
        is called every animation frame with a mouth openness from 0
        (closed) to 1 (wide), worked out from the letters being spoken,
        so a face can lip-sync.  onBlocked() is called if the browser refuses
        to speak before the user has tapped the page.  Returns a Promise that
        resolves when done.
    NewosVoice.cancel()
    NewosVoice.voices()          the available voices
    NewosVoice.supported         true if the browser can speak

    NewosListen.start({ onFinal, onInterim, onState, lang })
        Continuous voice recognition (Chrome, Edge, Safari).  onFinal(text)
        gets each finished phrase.  Listening pauses while NewosVoice is
        speaking so the bot does not hear itself.
    NewosListen.stop()
    NewosListen.supported
*/
(function (global) {
  "use strict";

  const synth = global.speechSynthesis || null;
  const CPS = 14.5;                       // spoken characters per second at rate 1

  function shapeFor(ch) {
    if (!ch) return 0.05;
    const c = ch.toLowerCase();
    if ("ao".includes(c)) return 1.0;
    if ("eiuy".includes(c)) return 0.72;
    if ("mbp".includes(c)) return 0.0;     // lips together
    if ("fv".includes(c)) return 0.18;
    if ("wq".includes(c)) return 0.45;
    if (/[a-z0-9]/.test(c)) return 0.38;
    return 0.04;                           // spaces and punctuation
  }

  let speaking = false, current = null, rafId = 0;

  function pickVoice(pref) {
    if (!synth) return null;
    const vs = synth.getVoices();
    if (!vs.length) return null;
    if (pref) {
      const v = vs.find((x) => x.name === pref || x.voiceURI === pref);
      if (v) return v;
    }
    const lang = (navigator.language || "en").slice(0, 2);
    return vs.find((x) => x.lang && x.lang.startsWith(lang) && /natural|neural|google|samantha|daniel|karen/i.test(x.name))
        || vs.find((x) => x.lang && x.lang.startsWith(lang))
        || vs[0];
  }

  const NewosVoice = {
    supported: !!(synth && global.SpeechSynthesisUtterance),
    get speaking() { return speaking; },
    voices() { return synth ? synth.getVoices() : []; },
    cancel() {
      if (synth) synth.cancel();
      cancelAnimationFrame(rafId);
      speaking = false;
    },
    speak(text, opts = {}) {
      const clean = String(text || "").replace(/[•\[\]{}<>#*_]/g, " ").replace(/\s+/g, " ").trim();
      if (!clean) return Promise.resolve();
      if (!this.supported) return fakeSpeak(clean, opts);
      this.cancel();
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(clean);
        const v = pickVoice(opts.voice);
        if (v) u.voice = v;
        u.rate = opts.rate || 1;
        u.pitch = opts.pitch || 1;
        current = u;
        const rate = u.rate;
        let anchorChar = 0, anchorTime = 0, started = false, smoothed = 0;
        const frame = (now) => {
          if (!speaking) return;
          if (started) {
            const pos = Math.min(clean.length - 1, Math.floor(anchorChar + ((now - anchorTime) / 1000) * CPS * rate));
            const target = shapeFor(clean[pos]);
            // a little syllable flutter keeps long vowels alive
            const flutter = target > 0.3 ? 0.12 * Math.sin(now / 55) : 0;
            smoothed += (target + flutter - smoothed) * 0.35;
            if (opts.onMouth) opts.onMouth(Math.max(0, Math.min(1, smoothed)));
          }
          rafId = requestAnimationFrame(frame);
        };
        u.onstart = () => {
          started = true; speaking = true; anchorTime = performance.now();
          if (opts.onStart) opts.onStart();
          cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
        };
        u.onboundary = (e) => {
          if (typeof e.charIndex === "number") { anchorChar = e.charIndex; anchorTime = performance.now(); }
        };
        const done = () => {
          if (current !== u) return;
          speaking = false; current = null;
          cancelAnimationFrame(rafId);
          if (opts.onMouth) opts.onMouth(0);
          if (opts.onEnd) opts.onEnd();
          resolve();
        };
        u.onend = done;
        u.onerror = (e) => {
          if (e && e.error === "not-allowed" && opts.onBlocked) opts.onBlocked();
          done();
        };
        speaking = true;
        synth.speak(u);
        // Some browsers never fire onstart for the first utterance; drive the mouth anyway.
        setTimeout(() => { if (!started && current === u) u.onstart(); }, 450);
        // Safety net in case onend never arrives.
        setTimeout(done, 2000 + (clean.length / (CPS * rate)) * 1000 * 1.8);
      });
    },
  };

  //  When the browser cannot speak, still animate for roughly the right time.
  function fakeSpeak(text, opts) {
    return new Promise((resolve) => {
      speaking = true;
      if (opts.onStart) opts.onStart();
      const t0 = performance.now(), dur = (text.length / CPS) * 1000;
      let smoothed = 0;
      const frame = (now) => {
        const pos = Math.floor(((now - t0) / 1000) * CPS);
        if (pos >= text.length || !speaking) {
          speaking = false;
          if (opts.onMouth) opts.onMouth(0);
          if (opts.onEnd) opts.onEnd();
          resolve();
          return;
        }
        smoothed += (shapeFor(text[pos]) - smoothed) * 0.35;
        if (opts.onMouth) opts.onMouth(smoothed);
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
      setTimeout(() => { speaking = false; }, dur + 1500);
    });
  }

  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};

  // ---------- voice recognition ----------
  const Rec = global.SpeechRecognition || global.webkitSpeechRecognition || null;
  let rec = null, wanted = false, handlers = {};

  const NewosListen = {
    supported: !!Rec,
    get listening() { return wanted; },
    start(h = {}) {
      if (!Rec) { if (h.onState) h.onState("unsupported"); return false; }
      handlers = h;
      wanted = true;
      if (!rec) {
        rec = new Rec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = h.lang || navigator.language || "en-US";
        rec.onresult = (e) => {
          if (speaking) return;                       // ignore our own voice
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) {
              const t = r[0].transcript.trim();
              if (t && handlers.onFinal) handlers.onFinal(t);
            } else interim += r[0].transcript;
          }
          if (handlers.onInterim) handlers.onInterim(interim);
        };
        rec.onstart = () => handlers.onState && handlers.onState("listening");
        rec.onerror = (e) => {
          if (handlers.onState) handlers.onState(e.error === "not-allowed" ? "denied" : "error:" + e.error);
          if (e.error === "not-allowed" || e.error === "service-not-allowed") wanted = false;
        };
        rec.onend = () => {
          if (wanted) setTimeout(() => { try { rec.start(); } catch (err) { /* already started */ } }, 250);
          else if (handlers.onState) handlers.onState("stopped");
        };
      }
      try { rec.start(); } catch (err) { /* already running */ }
      return true;
    },
    stop() {
      wanted = false;
      if (rec) try { rec.stop(); } catch (err) { /* not running */ }
    },
  };

  global.NewosVoice = NewosVoice;
  global.NewosListen = NewosListen;
})(typeof window !== "undefined" ? window : globalThis);
