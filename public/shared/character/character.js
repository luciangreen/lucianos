// The LucianOS character: a talking photo (retromr's puppet) that hears spoken or typed commands
// and answers aloud with newos's voice and lip-sync. Any app can mount it:
//
//   import { mountCharacter } from '/shared/character/character.js';
//   const ch = await mountCharacter({ handle: async (cmd) => 'reply text' | null });
//   ch.say('Hello');
//
// cmd comes from parseCommand() (commands.js). Built in: greet, thanks, help, time, calc, quiet.
// The character (photo, name, voice) is saved once in the suite and shared by every app.
import { api } from '/shared/api.js';
import './tts.js';
import { evaluate } from '/desktop/calc.js';
import { HELP_TEXT, parseCommand } from './commands.js';
import { Puppet, placeholderFace, shrinkPhoto } from './puppet.js';
import { predict, remember } from './predict.js';

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./character.css', import.meta.url).href;
document.head.append(css);

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('aria-') || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...kids.filter((k) => k !== null && k !== undefined));
  return n;
};

export async function mountCharacter({ handle = async () => null, help = HELP_TEXT, greeting = null, parent = document.body, bottom = 16, here = () => '' } = {}) {
  const Voice = window.NewosVoice;
  const Listen = window.NewosListen;
  let cfg = { name: 'Lucian', image: null, landmarks: null, voice: '', rate: 1, minimised: undefined, pos: null, ...((await api.state.get('character').catch(() => null)) ?? {}) };
  const save = () => api.state.set('character', cfg).catch(() => {});

  const canvas = el('canvas', { className: 'lc-face', 'aria-hidden': 'true' });
  const nameEl = el('span', { className: 'lc-name', textContent: cfg.name });
  const micBtn = el('button', { className: 'lc-btn', title: 'Listen (talk to me)', textContent: '🎤' });
  const setBtn = el('button', { className: 'lc-btn', title: 'Choose photo, name and voice', textContent: '⚙' });
  const minBtn = el('button', { className: 'lc-btn', title: 'Minimise', textContent: '–' });
  const head = el('div', { className: 'lc-head' }, nameEl, el('span', { className: 'lc-spacer' }), micBtn, setBtn, minBtn);
  const heard = el('div', { className: 'lc-heard', 'aria-live': 'polite' });
  const said = el('div', { className: 'lc-said', 'aria-live': 'polite' });
  const input = el('input', { type: 'text', className: 'lc-input', placeholder: 'Type to me, or tap 🎤', 'aria-label': `Talk to ${cfg.name}` });
  const form = el('form', { className: 'lc-form' }, input, el('button', { className: 'lc-btn', textContent: '↵', title: 'Send' }));
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const nameIn = el('input', { type: 'text', value: cfg.name, 'aria-label': 'Name' });
  const voiceSel = el('select', { 'aria-label': 'Voice' });
  const rateIn = el('input', { type: 'range', min: '0.6', max: '1.6', step: '0.1', value: String(cfg.rate), 'aria-label': 'Speed' });
  const settings = el('div', { className: 'lc-settings hidden' },
    el('button', { type: 'button', textContent: 'Choose photo…', onclick: () => file.click() }),
    el('button', { type: 'button', textContent: 'Use the drawn face', onclick: () => usePlaceholder(true) }),
    el('label', {}, 'Name ', nameIn),
    el('label', {}, 'Voice ', voiceSel),
    el('label', {}, 'Speed ', rateIn),
    el('p', { className: 'lc-note', textContent: 'Your photo stays in the suite (state folder). It is never sent anywhere else.' }));
  const chips = el('div', { className: 'lc-chips', 'aria-label': 'Suggested commands' });
  const body = el('div', { className: 'lc-body' }, canvas, heard, said, chips, form, settings, file);
  const root = el('aside', { className: 'lc-char', 'aria-label': `${cfg.name}, your assistant` }, head, body);
  parent.append(root);

  const puppet = new Puppet(canvas);
  if (cfg.image) await puppet.setPhoto(cfg.image, cfg.landmarks).catch(() => usePlaceholder(false));
  else await usePlaceholder(false);
  if (cfg.pos) place(cfg.pos);
  else root.style.bottom = `${bottom}px`; // apps with a bottom bar lift it clear
  // phones start with just the face, unless you opened it before
  setMinimised(cfg.minimised ?? innerWidth < 760);

  async function usePlaceholder(saveIt) {
    const p = placeholderFace();
    await puppet.setPhoto(p.image, p.landmarks);
    if (saveIt) {
      cfg.image = null;
      cfg.landmarks = null;
      save();
    }
  }

  // ---------- predicted commands (tap one to put it in the box, change it if you like, then Enter) ----------
  let history = (await api.state.get('character-history').catch(() => null))?.items ?? [];
  function renderChips() {
    const items = predict(history, { here: here() });
    chips.replaceChildren(...items.map((p) => el('button', {
      type: 'button',
      className: 'lc-chip',
      textContent: p.text,
      title: `${p.why}. Tap to edit, then press Enter`,
      onclick: () => {
        input.value = p.text;
        input.focus();
        input.setSelectionRange(p.text.length, p.text.length);
      }
    })));
  }
  renderChips();

  // ---------- speaking ----------
  let quiet = false;
  async function say(text) {
    said.textContent = text;
    if (quiet) return;
    puppet.speaking = true;
    await Voice.speak(text, {
      voice: cfg.voice || undefined,
      rate: Number(cfg.rate) || 1,
      onMouth: (v) => (puppet.mouth = v),
      onBlocked: () => (said.textContent = `${text}  (tap me once so I can speak)`)
    });
    puppet.speaking = false;
    puppet.mouth = 0;
  }

  async function hear(text) {
    if (!text.trim()) return;
    heard.textContent = `You: ${text}`;
    puppet.hearing = true;
    setTimeout(() => (puppet.hearing = false), 700);
    const cmd = parseCommand(text);
    let reply;
    try {
      reply = await builtIn(cmd);
      if (reply === undefined) reply = await handle(cmd, text);
    } catch (err) {
      reply = `Sorry, that went wrong: ${err.message}`;
    }
    if (reply === null || reply === undefined) {
      reply = cmd.intent === 'unknown' ? `I didn't catch a command in "${text}". Say help to hear what I can do.` : "I can't do that here yet.";
    } else {
      history = remember(history, { text, intent: cmd.intent, here: here() });
      api.state.set('character-history', { items: history }).catch(() => {});
      renderChips();
    }
    if (reply) await say(reply);
  }

  async function builtIn(cmd) {
    switch (cmd.intent) {
      case 'none': return '';
      case 'help': return help;
      case 'greet': return `Hello! I'm ${cfg.name}. ${greeting ?? 'Say help to hear what I can do.'}`;
      case 'thanks': return "You're welcome.";
      case 'quiet':
        Voice.cancel();
        quiet = false;
        return '';
      case 'time': {
        const d = new Date();
        return `It's ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} on ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`;
      }
      case 'calc':
        try {
          return `${cmd.expr.replace(/\s*\*\s*/g, ' times ').replace(/\s*\/\s*/g, ' divided by ').replace(/\s*\^\s*/g, ' to the power ')} is ${evaluate(cmd.expr).text}.`;
        } catch (err) {
          return `I couldn't work that out: ${err.message}.`;
        }
      default:
        return undefined;
    }
  }

  // ---------- listening ----------
  let listening = false;
  function setListening(on) {
    listening = on && Listen.supported;
    micBtn.classList.toggle('on', listening);
    if (listening) {
      Listen.start({
        onFinal: (t) => hear(t),
        onInterim: (t) => {
          if (t) heard.textContent = `… ${t}`;
          puppet.hearing = !!t;
        },
        onState: (s) => {
          if (s === 'denied') {
            heard.textContent = 'The browser blocked the microphone. Type instead, or allow the microphone.';
            setListening(false);
          }
        }
      });
    } else {
      Listen.stop();
    }
  }
  micBtn.addEventListener('click', () => {
    unlockSpeech();
    if (!Listen.supported) {
      heard.textContent = "This browser can't listen. Type to me instead.";
      input.focus();
      return;
    }
    setListening(!listening);
  });

  // ---------- typing ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    unlockSpeech();
    const t = input.value;
    input.value = '';
    hear(t);
  });
  input.addEventListener('keydown', (e) => e.stopPropagation()); // keep app shortcuts out of the way

  function unlockSpeech() {
    try {
      if (window.speechSynthesis && !unlockSpeech.done) {
        speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        unlockSpeech.done = true;
      }
    } catch {}
  }
  root.addEventListener('pointerdown', unlockSpeech, { once: true });

  // ---------- settings ----------
  function fillVoices() {
    const voices = Voice.voices();
    voiceSel.replaceChildren(el('option', { value: '', textContent: 'Default voice' }),
      ...voices.map((v) => el('option', { value: v.name, textContent: `${v.name} (${v.lang})` })));
    voiceSel.value = cfg.voice || '';
  }
  fillVoices();
  if (window.speechSynthesis) speechSynthesis.addEventListener?.('voiceschanged', fillVoices);
  setBtn.addEventListener('click', () => settings.classList.toggle('hidden'));
  nameIn.addEventListener('change', () => {
    cfg.name = nameIn.value.trim() || 'Lucian';
    nameEl.textContent = cfg.name;
    save();
  });
  voiceSel.addEventListener('change', () => { cfg.voice = voiceSel.value; save(); say('This is my voice now.'); });
  rateIn.addEventListener('change', () => { cfg.rate = Number(rateIn.value); save(); });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const image = await shrinkPhoto(f);
    const landmarks = await puppet.setPhoto(image);
    cfg.image = image;
    cfg.landmarks = landmarks;
    save();
    settings.classList.add('hidden');
    say(landmarks.source === 'facedetector' ? 'That looks like me.' : 'I guessed where your eyes and mouth are. If the mouth moves in the wrong place, try a straight-on photo.');
  });

  // ---------- minimise and move ----------
  function setMinimised(on) {
    cfg.minimised = on;
    root.classList.toggle('min', on);
    minBtn.textContent = on ? '▢' : '–';
    minBtn.title = on ? 'Show' : 'Minimise';
  }
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMinimised(!cfg.minimised);
    save();
  });
  canvas.addEventListener('click', () => {
    if (cfg.minimised) {
      setMinimised(false);
      save();
    }
  });
  function place({ x, y }) {
    root.style.left = `${Math.max(0, Math.min(innerWidth - 80, x))}px`;
    root.style.top = `${Math.max(0, Math.min(innerHeight - 60, y))}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }
  head.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const r = root.getBoundingClientRect();
    const off = { x: e.clientX - r.left, y: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
    const move = (ev) => place({ x: ev.clientX - off.x, y: ev.clientY - off.y });
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      cfg.pos = { x: root.offsetLeft, y: root.offsetTop };
      save();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });

  return {
    say,
    hear,
    root,
    minimise: () => setMinimised(true),
    show: () => setMinimised(false),
    destroy: () => { setListening(false); puppet.destroy(); root.remove(); }
  };
}
