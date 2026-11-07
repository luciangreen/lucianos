// MIDI for the LucianOS suite: read .mid files, describe them, and play them with Web Audio
// (browsers cannot play MIDI by themselves).
//   const song = parseMidi(bytes);   // { notes: [{ time, duration, pitch, velocity, channel }], duration, tempo, ... }
//   midiStats(song)                  // numbers simplug turns into words
//   const p = playMidi(song); p.stop(); await p.done;

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (p) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

export function parseMidi(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pos = 0;
  const u8 = () => b[pos++];
  const u16 = () => (b[pos++] << 8) | b[pos++];
  const u32 = () => ((b[pos++] << 24) >>> 0) + (b[pos++] << 16) + (b[pos++] << 8) + b[pos++];
  const str = (n) => String.fromCharCode(...b.subarray(pos, (pos += n)));
  const vlq = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const c = u8();
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  const hlen = u32();
  const format = u16();
  const ntracks = u16();
  const division = u16();
  pos = 8 + hlen;
  if (division & 0x8000) throw new Error('SMPTE timing is not supported');
  const tpb = division;

  const events = []; // { tick, type: 'on'|'off'|'tempo', ... }
  for (let t = 0; t < ntracks && pos < b.length; t++) {
    if (str(4) !== 'MTrk') throw new Error('Damaged MIDI track');
    const len = u32();
    const end = pos + len;
    let tick = 0;
    let status = 0;
    while (pos < end) {
      tick += vlq();
      let s = b[pos];
      if (s & 0x80) pos++;
      else s = status; // running status
      if (s === 0xff) {
        const type = u8();
        const l = vlq();
        if (type === 0x51 && l === 3) events.push({ tick, type: 'tempo', usPerBeat: (b[pos] << 16) | (b[pos + 1] << 8) | b[pos + 2] });
        pos += l;
        if (type === 0x2f) break;
      } else if (s === 0xf0 || s === 0xf7) {
        pos += vlq();
      } else {
        status = s;
        const kind = s >> 4;
        const ch = s & 0x0f;
        if (kind === 0x9 || kind === 0x8) {
          const pitch = u8();
          const vel = u8();
          events.push({ tick, type: kind === 0x9 && vel > 0 ? 'on' : 'off', pitch, vel, ch });
        } else if (kind === 0xc || kind === 0xd) pos += 1;
        else pos += 2;
      }
    }
    pos = end;
  }
  events.sort((a, c) => a.tick - c.tick || (a.type === 'tempo' ? -1 : 0) - (c.type === 'tempo' ? -1 : 0));

  // ticks -> seconds through the tempo map
  let usPerBeat = 500000;
  let lastTick = 0;
  let seconds = 0;
  let firstTempo = null;
  const open = new Map();
  const notes = [];
  for (const e of events) {
    seconds += ((e.tick - lastTick) * usPerBeat) / tpb / 1e6;
    lastTick = e.tick;
    if (e.type === 'tempo') {
      usPerBeat = e.usPerBeat;
      firstTempo ??= e.usPerBeat;
    } else if (e.type === 'on') {
      const key = `${e.ch}:${e.pitch}`;
      if (!open.has(key)) open.set(key, []);
      open.get(key).push({ time: seconds, velocity: e.vel, pitch: e.pitch, channel: e.ch });
    } else {
      const stack = open.get(`${e.ch}:${e.pitch}`);
      const n = stack?.shift();
      if (n) notes.push({ ...n, duration: Math.max(0.01, seconds - n.time) });
    }
  }
  for (const stack of open.values()) for (const n of stack) notes.push({ ...n, duration: Math.max(0.05, seconds - n.time) });
  notes.sort((a, c) => a.time - c.time);
  const duration = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
  return { format, tracks: ntracks, ticksPerBeat: tpb, tempo: Math.round(60e6 / (firstTempo ?? 500000)), notes, duration };
}

// Krumhansl-Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / 12;
  const mb = b.reduce((s, x) => s + x, 0) / 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function guessKey(notes) {
  const weight = new Array(12).fill(0);
  for (const n of notes) if (n.channel !== 9) weight[n.pitch % 12] += n.duration;
  let best = { tonic: 'C', mode: 'major', score: -2 };
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', MAJOR], ['minor', MINOR]]) {
      const rotated = prof.map((_, i) => prof[(i - k + 12) % 12]);
      const score = correlate(weight, rotated);
      if (score > best.score) best = { tonic: NAMES[k], mode, score };
    }
  }
  return best;
}

export function midiStats(song) {
  const pitched = song.notes.filter((n) => n.channel !== 9);
  const drums = song.notes.length - pitched.length;
  if (!pitched.length) return { notes: song.notes.length, drums, duration: song.duration, tempo: song.tempo, empty: true };
  const pitches = pitched.map((n) => n.pitch);
  const lowest = Math.min(...pitches);
  const highest = Math.max(...pitches);
  // melody line: the highest note starting at each moment
  const byTime = new Map();
  for (const n of pitched) {
    const t = Math.round(n.time * 20);
    byTime.set(t, Math.max(byTime.get(t) ?? 0, n.pitch));
  }
  const line = [...byTime.entries()].sort((a, c) => a[0] - c[0]).map(([, p]) => p);
  let steps = 0, leaps = 0, repeats = 0;
  for (let i = 1; i < line.length; i++) {
    const d = Math.abs(line[i] - line[i - 1]);
    if (d === 0) repeats++;
    else if (d <= 2) steps++;
    else leaps++;
  }
  const moves = Math.max(1, steps + leaps + repeats);
  const starts = new Set(pitched.map((n) => Math.round(n.time * 20))).size;
  const key = guessKey(pitched);
  return {
    notes: song.notes.length,
    drums,
    duration: song.duration,
    tempo: song.tempo,
    lowest,
    highest,
    range: highest - lowest,
    meanPitch: pitches.reduce((s, p) => s + p, 0) / pitches.length,
    density: pitched.length / Math.max(1, song.duration),
    chordiness: pitched.length / Math.max(1, starts),
    stepRatio: steps / moves,
    leapRatio: leaps / moves,
    repeatRatio: repeats / moves,
    meanVelocity: pitched.reduce((s, n) => s + n.velocity, 0) / pitched.length,
    key: `${key.tonic} ${key.mode}`,
    mode: key.mode,
    channels: new Set(song.notes.map((n) => n.channel)).size
  };
}

// Build a simple one-track MIDI file (used by tests and examples).
export function encodeMidi(notes, { tempo = 120, tpb = 480 } = {}) {
  const ev = [];
  for (const n of notes) {
    ev.push({ t: Math.round(n.time * (tempo / 60) * tpb), d: [0x90 | (n.channel ?? 0), n.pitch, n.velocity ?? 90] });
    ev.push({ t: Math.round((n.time + n.duration) * (tempo / 60) * tpb), d: [0x80 | (n.channel ?? 0), n.pitch, 0] });
  }
  ev.sort((a, b) => a.t - b.t || (a.d[0] & 0xf0) - (b.d[0] & 0xf0));
  const vlq = (v) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const us = Math.round(60e6 / tempo);
  const track = [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
  let last = 0;
  for (const e of ev) {
    track.push(...vlq(e.t - last), ...e.d);
    last = e.t;
  }
  track.push(0, 0xff, 0x2f, 0);
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (tpb >> 8) & 255, tpb & 255, 0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]);
}

// Play with simple synth voices. Returns { stop(), done: Promise }.
export function playMidi(song, { onProgress } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.1;
  const notes = song.notes.slice(0, 6000);
  for (const n of notes) {
    const start = t0 + n.time;
    const end = start + Math.min(n.duration, 4);
    const g = ctx.createGain();
    const v = (n.velocity / 127) * 0.9;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(v, start + 0.01);
    g.gain.setTargetAtTime(v * 0.6, start + 0.05, 0.2);
    g.gain.setTargetAtTime(0, end, 0.05);
    g.connect(master);
    if (n.channel === 9) {
      // drums: a short noise burst
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start(start);
    } else {
      const o = ctx.createOscillator();
      o.type = n.pitch < 48 ? 'sawtooth' : 'triangle';
      o.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
      o.connect(g);
      o.start(start);
      o.stop(end + 0.3);
    }
  }
  let timer = null;
  let finish;
  const done = new Promise((r) => (finish = r));
  const stop = () => {
    clearInterval(timer);
    ctx.close().catch(() => {});
    finish();
  };
  timer = setInterval(() => {
    const t = ctx.currentTime - t0;
    onProgress?.(Math.max(0, Math.min(1, t / Math.max(0.1, song.duration))));
    if (t > song.duration + 0.5) stop();
  }, 200);
  return { stop, done };
}
