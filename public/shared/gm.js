// General MIDI voices for the LucianOS suite, made with Web Audio (no sample files).
// Each of the 128 GM instruments has its own patch, and each GM drum note its own sound.
//   playNote(ctx, out, note, time)   note: { pitch, velocity, duration, program, volume, pan }
//   playDrum(ctx, out, note, time)   GM percussion (channel 10), by note number
//   makeReverb(ctx)                  a small room, to send voices to

export const GM_NAMES = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano', 'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)', 'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass', 'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)', 'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)', 'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)', 'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
];

// ---------------------------------------------------------------- patches
// Parts of a patch (all optional):
//   w        waveform: 'sine' | 'triangle' | 'square' | 'sawtooth' | [harmonic amplitudes]
//   layers   [{ w, r: frequency ratio, d: detune cents, g: gain }]   (default: one layer of w)
//   uni      [count, spread cents]: detuned copies of each layer (sections, pads)
//   partials [[ratio, gain, decay factor]]: sine partials, each decaying (struck and bell sounds)
//   perc     [ratio, gain, decay seconds]: a decaying partial on top of a sustained sound
//   fm       [ratio, index, decay seconds]: frequency modulation of the layers
//   ks       [loss per cycle, brightness 0–1]: a plucked string (Karplus-Strong)
//   chorus   cents: a second, detuned copy of partials or a plucked string
//   a d s r  attack, decay, sustain level (0 = it dies away like a struck note), release
//   kt       how much faster high notes die away (decay halves every 12/kt semitones)
//   lp       [cutoff × note frequency, Q, envelope amount, envelope decay]: low-pass filter
//   sweep    [rate Hz, depth]: a slow wobble of the low-pass filter
//   hp       high-pass Hz;  bp [Hz, Q] band-pass;  eq [[Hz, dB, Q]] body resonances
//   formants [[Hz, Q, gain]]: vowel filters (choirs, voices)
//   vib      [rate Hz, cents, delay s];  trem [rate Hz, depth 0–1]
//   noise    [gain, decay s (0 = sustained), 'bp'|'hp'|'lp', Hz or × note frequency if ≤ 20, Q]
//   pe       [semitones, seconds]: pitch starts this far off and glides to the note
//   drive    0–1 distortion;  echo [seconds, feedback];  swell: true (fades in over the note)
//   g        level;  rev reverb send (0–1)
const PIANO = [[1, 1, 1], [2, 0.55, 0.75], [3, 0.32, 0.55], [4, 0.2, 0.45], [5, 0.12, 0.35], [6, 0.08, 0.3], [7, 0.05, 0.25], [8, 0.03, 0.2]];
const stretched = (partials, b = 0.0004) => partials.map(([r, g, d]) => [r * Math.sqrt(1 + b * r * r), g, d]);
const AAH = [[730, 6, 1], [1090, 7, 0.55], [2440, 9, 0.3]];
const OOH = [[310, 6, 1], [870, 7, 0.35], [2250, 9, 0.15]];
const EH = [[600, 6, 1], [1040, 7, 0.5], [2250, 9, 0.3]];

export const PATCHES = [
  // ---- piano 0–7
  { partials: stretched(PIANO), chorus: 1.5, a: 0.002, s: 0, d: 1.7, kt: 0.6, r: 0.3, lp: [9, 0.5], noise: [0.12, 0.015, 'bp', 3, 1], rev: 0.25 },
  { partials: stretched([[1, 1, 1], [2, 0.7, 0.8], [3, 0.5, 0.6], [4, 0.35, 0.5], [5, 0.25, 0.4], [6, 0.18, 0.35], [7, 0.12, 0.3], [8, 0.08, 0.25], [9, 0.05, 0.2]]), chorus: 2, a: 0.002, s: 0, d: 1.3, kt: 0.6, r: 0.25, lp: [16, 0.5], noise: [0.18, 0.012, 'bp', 4, 1], rev: 0.22 },
  { partials: [[1, 1, 1], [2, 0.6, 0.7], [3, 0.45, 0.5], [4, 0.3, 0.4], [5, 0.2, 0.3], [6, 0.12, 0.25]], chorus: 6, a: 0.002, s: 0, d: 1.5, kt: 0.5, r: 0.25, lp: [10, 0.6], rev: 0.25 },
  { partials: stretched(PIANO), chorus: 16, a: 0.002, s: 0, d: 1.2, kt: 0.6, r: 0.25, lp: [11, 0.5], noise: [0.12, 0.012, 'bp', 3, 1], rev: 0.2 },
  { partials: [[1, 1, 1], [2, 0.22, 0.5], [3, 0.07, 0.35], [14, 0.22, 0.04]], a: 0.002, s: 0, d: 2.2, kt: 0.5, r: 0.3, trem: [4.5, 0.12], rev: 0.3 },
  { layers: [{ w: 'sine' }], fm: [1, 2.6, 0.5], chorus: 7, perc: [14, 0.12, 0.05], a: 0.002, s: 0, d: 1.9, kt: 0.5, r: 0.3, rev: 0.3 },
  { ks: [0.9965, 1], hp: 180, a: 0.001, s: 1, r: 0.08, eq: [[2500, 4, 1]], rev: 0.25 },
  { ks: [0.993, 0.9], a: 0.001, s: 1, r: 0.04, lp: [7, 4], drive: 0.2, rev: 0.12 },
  // ---- chromatic percussion 8–15
  { partials: [[1, 1, 1], [4, 0.3, 0.3], [10, 0.08, 0.1]], a: 0.002, s: 0, d: 1.2, kt: 0.4, r: 0.4, noise: [0.06, 0.01, 'hp', 4000], rev: 0.4 },
  { partials: [[1, 1, 1], [2.76, 0.3, 0.3], [5.4, 0.15, 0.2], [8.93, 0.08, 0.12]], a: 0.001, s: 0, d: 1.6, kt: 0.3, r: 0.6, noise: [0.1, 0.006, 'hp', 6000], rev: 0.4 },
  { partials: [[1, 1, 1], [3, 0.22, 0.4], [5.8, 0.14, 0.2]], a: 0.001, s: 0, d: 1.0, kt: 0.3, r: 0.5, rev: 0.45 },
  { partials: [[1, 1, 1], [4, 0.35, 0.5], [10, 0.08, 0.2]], a: 0.002, s: 0, d: 2.6, kt: 0.3, r: 0.5, trem: [5.5, 0.35], noise: [0.05, 0.01, 'bp', 2, 1], rev: 0.4 },
  { partials: [[1, 1, 1], [4, 0.4, 0.15], [9.9, 0.12, 0.05]], a: 0.002, s: 0, d: 0.55, kt: 0.5, r: 0.15, noise: [0.12, 0.008, 'lp', 1500], rev: 0.25 },
  { partials: [[1, 1, 1], [3, 0.5, 0.3], [6, 0.25, 0.15], [9.4, 0.12, 0.08]], a: 0.001, s: 0, d: 0.35, kt: 0.4, r: 0.1, noise: [0.15, 0.006, 'hp', 3000], rev: 0.25 },
  { partials: [[1, 1, 1], [2, 0.6, 0.8], [3, 0.5, 0.7], [4.2, 0.4, 0.6], [5.4, 0.25, 0.5], [6.8, 0.2, 0.4]], a: 0.002, s: 0, d: 3.6, kt: 0.2, r: 1, noise: [0.12, 0.01, 'bp', 3, 1], rev: 0.5 },
  { ks: [0.997, 0.8], chorus: 9, a: 0.001, s: 1, r: 0.3, eq: [[2000, 3, 1]], rev: 0.3 },
  // ---- organ 16–23
  { layers: [{ w: [1, 0.8, 0.6, 0.35, 0.25, 0.15, 0.08, 0.12] }, { w: 'sine', r: 0.5, g: 0.55 }], a: 0.008, s: 1, r: 0.07, vib: [6.2, 7, 0], trem: [6.2, 0.12], noise: [0.08, 0.006, 'hp', 2500], rev: 0.25 },
  { layers: [{ w: [1, 0.7, 0.3, 0.2] }, { w: 'sine', r: 0.5, g: 0.5 }], perc: [3, 0.6, 0.25], a: 0.005, s: 1, r: 0.06, vib: [6.2, 6, 0], rev: 0.22 },
  { layers: [{ w: [1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.5] }, { w: 'sine', r: 0.5, g: 0.6 }], drive: 0.5, a: 0.006, s: 1, r: 0.06, vib: [7, 11, 0], trem: [7, 0.2], lp: [12, 0.7], rev: 0.25 },
  { layers: [{ w: [1, 0.6, 0.4, 0.25, 0.15, 0.1] }, { w: 'sine', r: 0.5, g: 0.6 }, { w: [1, 0.3, 0.1], r: 2, g: 0.4 }, { w: 'sine', r: 3, g: 0.18 }, { w: 'sine', r: 4, g: 0.12 }], uni: [2, 2], a: 0.09, s: 1, r: 0.6, rev: 0.7 },
  { w: 'sawtooth', a: 0.05, s: 1, r: 0.15, lp: [5, 0.7], vib: [5, 4, 0.2], g: 0.9, rev: 0.25 },
  { w: 'sawtooth', layers: [{ w: 'sawtooth', d: -12 }, { w: 'sawtooth', d: 12 }], a: 0.03, s: 1, r: 0.1, lp: [6, 1], vib: [5.5, 3, 0.2], eq: [[1400, 4, 1.5]], rev: 0.2 },
  { w: [1, 0.6, 0.55, 0.35, 0.3, 0.2, 0.15], a: 0.04, s: 1, r: 0.08, lp: [5, 2], vib: [5, 12, 0.25], noise: [0.05, 0, 'bp', 2, 1], rev: 0.2 },
  { layers: [{ w: 'sawtooth', d: -15 }, { w: 'sawtooth' }, { w: 'sawtooth', d: 15 }], a: 0.03, s: 1, r: 0.1, lp: [8, 1], eq: [[1800, 4, 1.5]], rev: 0.22 },
  // ---- guitar 24–31
  { ks: [0.996, 0.45], a: 0.001, s: 1, r: 0.15, lp: [7, 0.6], eq: [[200, 3, 1]], rev: 0.3 },
  { ks: [0.9975, 0.8], chorus: 3, a: 0.001, s: 1, r: 0.15, eq: [[3000, 3, 1]], rev: 0.3 },
  { ks: [0.9975, 0.35], a: 0.001, s: 1, r: 0.12, lp: [3.5, 0.7], rev: 0.25 },
  { ks: [0.998, 0.65], chorus: 8, a: 0.001, s: 1, r: 0.12, rev: 0.28 },
  { ks: [0.985, 0.4], a: 0.001, s: 1, r: 0.04, lp: [4, 0.8], rev: 0.15 },
  { ks: [0.999, 0.7], drive: 0.6, a: 0.001, s: 1, r: 0.12, lp: [8, 1], g: 0.8, rev: 0.25 },
  { ks: [0.999, 0.85], chorus: 6, drive: 0.92, a: 0.001, s: 1, r: 0.1, lp: [6, 1.2], g: 0.75, rev: 0.25 },
  { partials: [[1, 1, 1], [2, 0.15, 0.5], [3, 0.05, 0.3]], a: 0.002, s: 0, d: 2, kt: 0.3, r: 0.4, noise: [0.08, 0.01, 'hp', 3000], rev: 0.45 },
  // ---- bass 32–39
  { ks: [0.995, 0.25], a: 0.001, s: 1, r: 0.12, lp: [3, 0.8], noise: [0.1, 0.02, 'lp', 400], rev: 0.12 },
  { ks: [0.997, 0.4], a: 0.001, s: 1, r: 0.08, lp: [4, 0.8], rev: 0.1 },
  { ks: [0.997, 0.75], a: 0.001, s: 1, r: 0.06, lp: [7, 1], noise: [0.1, 0.008, 'bp', 6, 1], rev: 0.1 },
  { w: [1, 0.55, 0.28, 0.14, 0.07], a: 0.03, d: 0.5, s: 0.65, r: 0.12, lp: [3, 1.5, 3, 0.25], vib: [5, 8, 0.3], rev: 0.15 },
  { ks: [0.996, 1], a: 0.001, s: 1, r: 0.05, lp: [12, 1], drive: 0.2, noise: [0.2, 0.01, 'bp', 8, 1], rev: 0.1 },
  { ks: [0.995, 1], fm: [1, 0.6, 0.1], a: 0.001, s: 1, r: 0.05, lp: [10, 2, 2, 0.08], noise: [0.18, 0.008, 'hp', 2000], rev: 0.1 },
  { w: 'sawtooth', a: 0.004, d: 0.2, s: 0.6, r: 0.05, lp: [2.2, 7, 10, 0.15], drive: 0.2, rev: 0.08 },
  { layers: [{ w: 'square' }, { w: 'sawtooth', r: 0.5, g: 0.6 }], a: 0.005, d: 0.3, s: 0.8, r: 0.06, lp: [3, 3, 6, 0.25], rev: 0.08 },
  // ---- strings 40–47
  { w: 'sawtooth', a: 0.08, d: 0.2, s: 0.9, r: 0.2, lp: [7, 0.7], eq: [[3000, 6, 1], [300, 3, 1]], vib: [5.5, 18, 0.25], rev: 0.35 },
  { w: 'sawtooth', a: 0.09, d: 0.2, s: 0.9, r: 0.22, lp: [5, 0.7], eq: [[1600, 4, 1], [250, 3, 1]], vib: [5.2, 15, 0.3], rev: 0.35 },
  { w: 'sawtooth', a: 0.1, d: 0.2, s: 0.9, r: 0.25, lp: [4.5, 0.7], eq: [[250, 4, 1], [1200, 3, 1.5]], vib: [5, 14, 0.3], rev: 0.35 },
  { w: 'sawtooth', a: 0.12, d: 0.2, s: 0.9, r: 0.25, lp: [3.5, 0.7], eq: [[110, 4, 1], [700, 2, 1]], vib: [4.5, 10, 0.35], rev: 0.35 },
  { w: 'sawtooth', uni: [3, 10], a: 0.05, s: 1, r: 0.2, lp: [6, 0.6], trem: [12, 0.7], rev: 0.4 },
  { ks: [0.993, 0.35], chorus: 7, a: 0.001, s: 1, r: 0.1, lp: [5, 0.7], rev: 0.45 },
  { ks: [0.998, 0.55], a: 0.001, s: 1, r: 0.6, lp: [8, 0.5], eq: [[400, 3, 1]], rev: 0.5 },
  { partials: [[1, 1, 1], [1.5, 0.5, 0.7], [1.98, 0.35, 0.6], [2.44, 0.2, 0.5]], a: 0.004, s: 0, d: 1.6, kt: 0.2, r: 0.5, pe: [0.6, 0.05], noise: [0.3, 0.04, 'lp', 300], rev: 0.45 },
  // ---- ensemble 48–55
  { w: 'sawtooth', uni: [5, 14], a: 0.25, s: 1, r: 0.5, lp: [6, 0.6], vib: [5, 6, 0.4], eq: [[2500, 3, 1]], rev: 0.5 },
  { w: 'sawtooth', uni: [5, 12], a: 0.45, s: 1, r: 0.7, lp: [4.5, 0.6], vib: [4.8, 5, 0.5], rev: 0.55 },
  { w: 'sawtooth', uni: [4, 18], a: 0.2, s: 1, r: 0.5, lp: [5, 0.8, 3, 0.8], rev: 0.5 },
  { layers: [{ w: 'square', g: 0.6 }, { w: 'sawtooth' }], uni: [3, 22], a: 0.35, s: 1, r: 0.6, lp: [4, 0.7], trem: [0.3, 0.15], rev: 0.55 },
  { w: 'sawtooth', uni: [4, 10], formants: AAH, a: 0.3, s: 1, r: 0.5, vib: [5, 10, 0.3], rev: 0.55 },
  { w: 'triangle', layers: [{ w: 'sawtooth', g: 0.5 }, { w: 'triangle' }], uni: [3, 8], formants: OOH, a: 0.25, s: 1, r: 0.45, vib: [5, 8, 0.3], rev: 0.55 },
  { w: 'sawtooth', uni: [3, 15], formants: EH, lp: [6, 0.6], a: 0.3, s: 1, r: 0.6, rev: 0.6 },
  { layers: [{ w: 'sawtooth' }, { w: 'sawtooth', r: 1.5, g: 0.6 }, { w: 'square', r: 2, g: 0.4 }, { w: 'sawtooth', r: 0.5, g: 0.6 }], uni: [3, 25], a: 0.004, s: 0, d: 0.35, kt: 0, r: 0.2, lp: [10, 0.7], noise: [0.3, 0.08, 'bp', 3, 0.7], rev: 0.65 },
  // ---- brass 56–63
  { w: 'sawtooth', a: 0.03, d: 0.1, s: 0.85, r: 0.1, lp: [2, 0.8, 8, 0.12], pe: [-0.4, 0.04], eq: [[1200, 4, 1]], vib: [5.5, 10, 0.35], rev: 0.3 },
  { w: 'sawtooth', a: 0.05, d: 0.15, s: 0.85, r: 0.12, lp: [1.6, 0.8, 5, 0.15], pe: [-0.5, 0.06], eq: [[600, 3, 1]], vib: [5, 8, 0.4], rev: 0.3 },
  { w: 'sawtooth', layers: [{ w: 'sawtooth' }, { w: 'triangle', g: 0.6 }], a: 0.06, d: 0.15, s: 0.85, r: 0.15, lp: [1.2, 0.7, 3, 0.2], eq: [[160, 4, 1]], rev: 0.3 },
  { w: 'sawtooth', a: 0.02, d: 0.1, s: 0.8, r: 0.08, bp: [1500, 3], hp: 400, vib: [5.5, 8, 0.3], rev: 0.3 },
  { w: 'sawtooth', a: 0.08, d: 0.2, s: 0.85, r: 0.25, lp: [1.4, 0.7, 2.5, 0.25], vib: [5, 6, 0.4], rev: 0.45 },
  { w: 'sawtooth', uni: [3, 12], a: 0.05, d: 0.15, s: 0.85, r: 0.15, lp: [2.2, 0.8, 7, 0.15], pe: [-0.3, 0.05], rev: 0.35 },
  { w: 'sawtooth', uni: [2, 15], a: 0.02, d: 0.25, s: 0.8, r: 0.15, lp: [1.5, 3, 10, 0.25], rev: 0.3 },
  { layers: [{ w: 'square', g: 0.7 }, { w: 'sawtooth' }], uni: [2, 10], a: 0.06, d: 0.4, s: 0.85, r: 0.2, lp: [2, 2, 6, 0.4], rev: 0.3 },
  // ---- reed 64–71
  { w: 'sawtooth', a: 0.03, s: 1, r: 0.08, lp: [4, 1], eq: [[1800, 5, 1.2]], vib: [5.5, 12, 0.25], noise: [0.04, 0, 'bp', 3, 1], rev: 0.3 },
  { w: 'sawtooth', a: 0.03, s: 1, r: 0.08, lp: [3.2, 1.2], eq: [[1500, 5, 1], [450, 3, 1]], drive: 0.12, vib: [5.2, 14, 0.3], noise: [0.04, 0, 'bp', 3, 1], rev: 0.3 },
  { w: 'sawtooth', a: 0.035, s: 1, r: 0.1, lp: [2.6, 1.2], eq: [[1100, 5, 1], [350, 4, 1]], drive: 0.25, vib: [5, 13, 0.3], noise: [0.05, 0, 'bp', 3, 1], rev: 0.3 },
  { w: 'sawtooth', a: 0.04, s: 1, r: 0.1, lp: [2.2, 1], eq: [[700, 5, 1], [200, 4, 1]], drive: 0.2, vib: [4.8, 10, 0.35], rev: 0.3 },
  { w: [1, 0.7, 0.9, 0.6, 0.8, 0.4, 0.5, 0.3], a: 0.04, s: 1, r: 0.08, eq: [[1400, 7, 2]], lp: [8, 0.7], vib: [5.5, 10, 0.3], rev: 0.35 },
  { w: [1, 0.8, 0.8, 0.5, 0.6, 0.3, 0.3], a: 0.05, s: 1, r: 0.1, eq: [[1000, 6, 2]], lp: [4, 0.7], vib: [5.2, 9, 0.35], rev: 0.35 },
  { w: [1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2], a: 0.05, s: 1, r: 0.1, eq: [[500, 6, 2]], lp: [3, 0.7], vib: [5, 7, 0.4], rev: 0.35 },
  { w: [1, 0, 0.45, 0, 0.25, 0, 0.15, 0, 0.1], a: 0.04, s: 1, r: 0.08, lp: [4, 0.7], vib: [5, 6, 0.4], noise: [0.03, 0, 'bp', 2, 1], rev: 0.35 },
  // ---- pipe 72–79
  { w: [1, 0.12, 0.04], a: 0.03, s: 1, r: 0.08, vib: [5.5, 10, 0.2], noise: [0.1, 0, 'bp', 2, 1.5], rev: 0.35 },
  { w: [1, 0.25, 0.1, 0.05], a: 0.06, s: 1, r: 0.12, vib: [5, 12, 0.3], noise: [0.12, 0, 'hp', 2000], rev: 0.4 },
  { w: [1, 0.15, 0.2, 0.05], a: 0.03, s: 1, r: 0.06, vib: [5, 4, 0.4], noise: [0.06, 0, 'bp', 2, 2], rev: 0.35 },
  { w: 'sine', a: 0.08, s: 1, r: 0.2, vib: [5, 6, 0.3], noise: [0.25, 0, 'bp', 1.5, 1.5], rev: 0.5 },
  { w: 'sine', a: 0.1, s: 1, r: 0.2, noise: [0.4, 0, 'bp', 1, 8], rev: 0.45 },
  { w: [1, 0.2, 0.1], a: 0.1, s: 1, r: 0.25, pe: [-0.8, 0.12], vib: [4.5, 20, 0.4], noise: [0.3, 0, 'bp', 2, 1], rev: 0.5 },
  { w: 'sine', a: 0.02, s: 1, r: 0.06, vib: [6, 15, 0.15], noise: [0.03, 0, 'hp', 4000], rev: 0.35 },
  { w: [1, 0, 0.08], a: 0.05, s: 1, r: 0.12, vib: [5, 6, 0.3], noise: [0.05, 0, 'bp', 1, 2], rev: 0.45 },
  // ---- synth lead 80–87
  { w: 'square', a: 0.005, s: 0.9, d: 0.2, r: 0.06, lp: [10, 0.8], vib: [5.5, 6, 0.3], rev: 0.2 },
  { w: 'sawtooth', uni: [2, 8], a: 0.005, s: 0.9, d: 0.2, r: 0.06, lp: [10, 0.8], vib: [5.5, 6, 0.3], rev: 0.2 },
  { w: [1, 0.3, 0.15], a: 0.02, s: 1, r: 0.1, vib: [6, 10, 0.1], noise: [0.15, 0, 'bp', 2, 1], rev: 0.35 },
  { w: 'triangle', layers: [{ w: 'square', g: 0.4 }, { w: 'triangle' }], a: 0.005, s: 0.9, d: 0.2, r: 0.08, lp: [6, 0.8], noise: [0.35, 0.05, 'bp', 3, 1], rev: 0.25 },
  { w: 'sawtooth', uni: [2, 10], drive: 0.7, a: 0.004, s: 0.9, d: 0.2, r: 0.08, lp: [6, 1.5], g: 0.8, rev: 0.2 },
  { w: 'sawtooth', formants: AAH, a: 0.05, s: 1, r: 0.15, vib: [5, 15, 0.2], rev: 0.35 },
  { layers: [{ w: 'sawtooth' }, { w: 'sawtooth', r: 1.5, g: 0.7 }], a: 0.005, s: 0.9, d: 0.2, r: 0.08, lp: [8, 0.8], rev: 0.25 },
  { layers: [{ w: 'sawtooth' }, { w: 'square', r: 0.5, g: 0.8 }], a: 0.004, s: 0.85, d: 0.25, r: 0.06, lp: [6, 2, 4, 0.2], rev: 0.15 },
  // ---- synth pad 88–95
  { w: 'sawtooth', uni: [3, 10], perc: [2, 0.6, 1.2], a: 0.4, s: 1, r: 1, lp: [3, 0.7], rev: 0.6 },
  { w: 'sawtooth', uni: [4, 12], a: 0.6, s: 1, r: 1.2, lp: [2.5, 0.7], rev: 0.6 },
  { w: 'sawtooth', uni: [3, 15], a: 0.05, d: 0.6, s: 0.7, r: 0.6, lp: [3, 1, 4, 0.5], rev: 0.5 },
  { w: 'sawtooth', uni: [4, 12], formants: OOH, a: 0.8, s: 1, r: 1.2, rev: 0.7 },
  { w: 'sawtooth', uni: [3, 8], a: 0.7, s: 1, r: 1, lp: [2, 0.5, 2, 1.2], rev: 0.6 },
  { partials: [[1, 1, 1], [2.4, 0.5, 1], [3.9, 0.3, 1], [5.2, 0.2, 1]], chorus: 8, a: 0.3, s: 0.8, d: 1, r: 1.2, rev: 0.65 },
  { w: 'triangle', uni: [3, 10], formants: AAH, layers: [{ w: 'triangle' }, { w: 'sawtooth', g: 0.3 }], a: 1, s: 1, r: 1.5, rev: 0.75 },
  { w: 'sawtooth', uni: [3, 14], a: 0.5, s: 1, r: 1.2, lp: [2, 1.5], sweep: [0.15, 0.85], rev: 0.65 },
  // ---- synth effects 96–103
  { partials: [[1, 1, 1], [2.76, 0.4, 0.4], [5.4, 0.2, 0.2]], a: 0.002, s: 0, d: 0.6, kt: 0.3, r: 1, noise: [0.25, 0, 'hp', 5000], trem: [9, 0.4], rev: 0.6 },
  { w: 'sawtooth', uni: [4, 14], a: 1, s: 1, r: 1.5, lp: [2.5, 0.8], sweep: [0.08, 0.6], rev: 0.8 },
  { partials: [[1, 1, 1], [2, 0.3, 0.7], [2.76, 0.2, 0.35], [5.4, 0.1, 0.25]], chorus: 10, a: 0.002, s: 0, d: 2.5, kt: 0.2, r: 1, rev: 0.65 },
  { w: 'triangle', uni: [3, 10], perc: [3, 0.5, 0.6], a: 0.4, s: 1, r: 1.2, lp: [4, 0.6], rev: 0.7 },
  { w: 'sawtooth', uni: [3, 15], perc: [4, 0.4, 0.5], a: 0.3, s: 1, r: 1, lp: [10, 0.6], rev: 0.65 },
  { w: 'sawtooth', a: 0.8, s: 1, r: 1, lp: [2, 4], sweep: [0.5, 0.9], vib: [3, 30, 0.2], rev: 0.6 },
  { w: 'square', a: 0.01, s: 0.7, d: 0.3, r: 0.3, lp: [5, 0.7], echo: [0.33, 0.45], rev: 0.4 },
  { w: 'sine', fm: [2.5, 4, 2], a: 0.2, s: 1, r: 0.8, vib: [7, 40, 0.1], pe: [3, 0.4], rev: 0.6 },
  // ---- ethnic 104–111
  { ks: [0.998, 0.9], chorus: 10, drive: 0.3, a: 0.001, s: 1, r: 0.3, lp: [8, 4], eq: [[3000, 5, 2]], rev: 0.35 },
  { ks: [0.993, 0.95], a: 0.001, s: 1, r: 0.1, hp: 300, eq: [[2500, 6, 1]], rev: 0.2 },
  { ks: [0.994, 0.85], a: 0.001, s: 1, r: 0.1, hp: 250, eq: [[1800, 5, 2]], rev: 0.25 },
  { ks: [0.997, 0.6], a: 0.001, s: 1, r: 0.3, eq: [[1200, 4, 1]], rev: 0.4 },
  { partials: [[1, 1, 1], [6, 0.25, 0.1]], a: 0.001, s: 0, d: 0.9, kt: 0.3, r: 0.4, noise: [0.12, 0.01, 'bp', 2, 1], rev: 0.4 },
  { layers: [{ w: 'sawtooth' }, { w: 'sawtooth', r: 0.5, g: 0.35 }, { w: 'sawtooth', r: 0.25, g: 0.3 }], a: 0.02, s: 1, r: 0.06, lp: [6, 1], eq: [[1500, 6, 1.5]], drive: 0.2, rev: 0.3 },
  { w: 'sawtooth', a: 0.05, s: 0.9, d: 0.2, r: 0.12, lp: [7, 0.7], eq: [[2500, 5, 1]], vib: [6, 22, 0.15], drive: 0.1, rev: 0.3 },
  { w: [1, 0.8, 0.9, 0.7, 0.8, 0.5, 0.6, 0.4], a: 0.04, s: 1, r: 0.08, eq: [[1700, 8, 2]], vib: [6, 20, 0.2], rev: 0.3 },
  // ---- percussive 112–119
  { partials: [[1, 1, 1], [2.6, 0.6, 0.5], [4.9, 0.4, 0.3], [7.3, 0.3, 0.2]], a: 0.001, s: 0, d: 1.2, kt: 0.2, r: 0.5, rev: 0.45 },
  { partials: [[1, 1, 1], [2.4, 0.5, 0.4], [3.9, 0.3, 0.3]], a: 0.001, s: 0, d: 0.5, kt: 0.2, r: 0.2, rev: 0.35 },
  { partials: [[1, 1, 1], [2, 0.7, 0.6], [3, 0.25, 0.4], [4, 0.15, 0.3]], a: 0.002, s: 0, d: 1, kt: 0.4, r: 0.3, noise: [0.1, 0.01, 'lp', 1500], rev: 0.4 },
  { partials: [[1, 1, 1], [2.7, 0.3, 0.2]], a: 0.001, s: 0, d: 0.08, kt: 0, r: 0.05, noise: [0.4, 0.01, 'bp', 1.5, 3], rev: 0.25 },
  { partials: [[1, 1, 1], [1.6, 0.4, 0.5]], a: 0.002, s: 0, d: 0.8, kt: 0.2, r: 0.3, pe: [5, 0.05], noise: [0.5, 0.06, 'lp', 400], rev: 0.5 },
  { partials: [[1, 1, 1], [1.5, 0.3, 0.6]], a: 0.002, s: 0, d: 0.45, kt: 0.3, r: 0.2, pe: [4, 0.06], noise: [0.2, 0.03, 'lp', 800], rev: 0.35 },
  { w: 'sine', a: 0.002, s: 0, d: 0.4, kt: 0.2, r: 0.2, pe: [12, 0.12], rev: 0.35 },
  { noise: [1, 0, 'hp', 3000], swell: true, r: 0.05, rev: 0.5 },
  // ---- sound effects 120–127
  { noise: [1, 0.12, 'bp', 3, 6], pe: [3, 0.1], a: 0.005, s: 0, d: 0.15, kt: 0, r: 0.05, rev: 0.2 },
  { noise: [1, 0, 'bp', 2, 1], a: 0.1, s: 1, r: 0.25, rev: 0.35 },
  { noise: [1, 0, 'lp', 800], a: 1.5, s: 1, r: 2, trem: [0.15, 0.9], rev: 0.5 },
  { w: 'sine', a: 0.01, s: 1, r: 0.05, pe: [12, 0.05], vib: [14, 120, 0], trem: [12, 1], rev: 0.4 },
  { w: 'square', a: 0.005, s: 1, r: 0.05, lp: [4, 1], trem: [20, 1], rev: 0.25 },
  { noise: [1, 0, 'lp', 300], a: 0.3, s: 1, r: 0.4, trem: [12, 0.95], rev: 0.3 },
  { noise: [1, 0, 'bp', 2500, 0.6], a: 0.5, s: 1, r: 0.8, trem: [15, 0.6], rev: 0.5 },
  { noise: [1, 0.5, 'lp', 3000], w: 'sine', layers: [{ w: 'sine', r: 0.5, g: 0.8 }], pe: [12, 0.05], a: 0.001, s: 0, d: 0.3, kt: 0, r: 0.3, rev: 0.7 }
];

// Levels so each instrument sounds about as loud as the others: measured by rendering each one
// (its loudest moment, at low, middle and high notes) and evening them out.
export const LEVELS = [
  0.52, 0.50, 0.55, 0.68, 0.79, 1.01, 1.12, 0.47, 0.87, 0.75, 0.92, 0.81, 1.16, 1.35, 0.54, 0.97,
  0.96, 0.85, 0.42, 0.63, 1.23, 0.72, 1.09, 0.56, 1.17, 0.88, 1.24, 1.06, 1.48, 0.56, 0.71, 0.77,
  1.21, 1.25, 1.29, 1.17, 0.48, 1.40, 0.48, 0.86, 1.00, 0.98, 0.94, 1.04, 1.26, 1.06, 1.11, 0.72,
  1.12, 1.30, 1.03, 0.60, 1.45, 1.00, 1.30, 1.59, 1.17, 1.20, 0.66, 5.04, 1.31, 1.07, 1.16, 0.57,
  1.02, 0.33, 0.26, 0.26, 1.13, 1.05, 1.02, 0.74, 0.80, 0.81, 0.79, 0.81, 0.80, 0.81, 0.81, 0.75,
  0.76, 1.13, 0.87, 0.72, 0.60, 1.49, 1.08, 0.79, 1.02, 1.10, 1.19, 1.25, 1.16, 0.51, 2.16, 1.03,
  1.17, 1.20, 0.56, 0.81, 1.06, 1.21, 0.81, 0.81, 0.40, 1.02, 1.08, 0.92, 0.96, 0.35, 0.46, 1.24,
  0.76, 1.12, 0.80, 2.70, 0.96, 1.24, 1.38, 0.71, 6.00, 1.93, 1.54, 1.19, 1.06, 3.17, 1.25, 1.39
];

// ---------------------------------------------------------------- shared helpers
const cache = new WeakMap();
function store(ctx) {
  if (!cache.has(ctx)) cache.set(ctx, { waves: new Map(), curves: new Map(), ks: new Map(), noise: null });
  return cache.get(ctx);
}

function noiseBuffer(ctx) {
  const s = store(ctx);
  if (!s.noise) {
    const len = Math.floor(ctx.sampleRate * 2);
    s.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = s.noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  return s.noise;
}

function setWave(ctx, osc, w) {
  if (typeof w === 'string') {
    osc.type = w;
    return;
  }
  const s = store(ctx);
  const key = w.join(',');
  if (!s.waves.has(key)) {
    const real = new Float32Array(w.length + 1);
    const imag = new Float32Array(w.length + 1);
    w.forEach((a, i) => (imag[i + 1] = a));
    s.waves.set(key, ctx.createPeriodicWave(real, imag));
  }
  osc.setPeriodicWave(s.waves.get(key));
}

function driveCurve(ctx, amount) {
  const s = store(ctx);
  const k = Math.round(amount * 100);
  if (!s.curves.has(k)) {
    const n = 1024;
    const c = new Float32Array(n);
    const drive = 1 + amount * 20;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    s.curves.set(k, c);
  }
  return s.curves.get(k);
}

// A plucked string: Karplus-Strong, worked out once per pitch and kept.
function ksBuffer(ctx, freq, loss, bright, seconds = 3) {
  const s = store(ctx);
  const sr = ctx.sampleRate;
  const period = Math.max(2, Math.round(sr / freq));
  const key = `${period}:${loss}:${bright}`;
  // the averaging in the loop delays it by half a sample: a cycle is period + 0.5 samples
  const rate = (freq * (period + 0.5)) / sr;
  if (s.ks.has(key)) return { buffer: s.ks.get(key), rate };
  const len = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(1, len, sr);
  const y = buffer.getChannelData(0);
  // the pluck: noise, softened for darker strings
  let seed = period * 7919 + 1;
  let prev = 0;
  const smooth = 1 - bright * 0.92;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    seed = (seed * 16807) % 2147483647;
    const r = (seed / 2147483647) * 2 - 1;
    prev = prev * smooth + r * (1 - smooth);
    y[i] = prev;
    mean += prev;
  }
  mean /= period;
  for (let i = 0; i < period; i++) y[i] -= mean;
  // the string: each cycle averages neighbours and loses a little
  for (let i = period; i < len; i++) y[i] = loss * 0.5 * (y[i - period] + y[i - period - 1 >= 0 ? i - period - 1 : 0]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < len; i++) y[i] /= peak;
  if (s.ks.size > 160) s.ks.delete(s.ks.keys().next().value);
  s.ks.set(key, buffer);
  return { buffer, rate };
}

// A small room: decaying noise, a little brighter at the start.
export function makeReverb(ctx, seconds = 2.2) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let seed = 1234 + ch * 777;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const r = (seed / 2147483647) * 2 - 1;
      const t = i / len;
      lp += (r - lp) * (0.9 - t * 0.7); // darker as it dies away
      d[i] = lp * (1 - t) ** 3 * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  conv.connect(wet);
  return { input: conv, output: wet };
}

const hz = (v, f) => (v <= 20 ? v * f : v);
const clampF = (ctx, f) => Math.max(30, Math.min(ctx.sampleRate * 0.45, f));

// ---------------------------------------------------------------- one note
// out: { dry, rev } AudioNodes. Returns the time the note's sound ends.
export function playNote(ctx, out, n, t) {
  const program = Math.max(0, Math.min(127, n.program ?? 0));
  const p = PATCHES[program];
  const f = 440 * 2 ** ((n.pitch - 69) / 12);
  const vel = Math.max(1, n.velocity ?? 90) / 127;
  const dur = Math.max(0.03, Math.min(n.duration ?? 0.5, 12));
  const peak = vel ** 1.5 * (p.g ?? 1) * LEVELS[program] * (n.volume ?? 1) * 0.6;
  const kt = 2 ** (-((n.pitch - 60) / 12) * (p.kt ?? 0));
  const decayT = (p.d ?? 1) * kt / 3; // time constant
  const stopAt = [];
  const sources = []; // nodes with detune, for vibrato and pitch glides

  // ---- the chain after the sources
  const pre = ctx.createGain();
  let node = pre;
  const link = (next) => {
    node.connect(next);
    node = next;
    return next;
  };
  if (p.formants) {
    const sum = ctx.createGain();
    for (const [fq, q, g] of p.formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g * 3;
      node.connect(bp).connect(gg).connect(sum);
    }
    node = sum;
  }
  if (p.drive) {
    const boost = link(ctx.createGain());
    boost.gain.value = 1 + p.drive * 3;
    const ws = link(ctx.createWaveShaper());
    ws.curve = driveCurve(ctx, p.drive);
    const trim = link(ctx.createGain());
    trim.gain.value = 1 / (1 + p.drive * 1.5);
  }
  if (p.lp) {
    const [mult, q = 0.7, env = 0, envDecay = 0.2] = p.lp;
    const lp = link(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.Q.value = q;
    const cut = clampF(ctx, f * mult * (0.55 + vel * 0.7));
    if (env) {
      lp.frequency.setValueAtTime(clampF(ctx, cut * (1 + env * vel)), t);
      lp.frequency.setTargetAtTime(cut, t + (p.a ?? 0.005), envDecay / 3);
    } else lp.frequency.value = cut;
    if (p.sweep) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.sweep[0];
      const lg = ctx.createGain();
      lg.gain.value = cut * p.sweep[1];
      lfo.connect(lg).connect(lp.frequency);
      lfo.start(t);
      stopAt.push(lfo);
    }
  }
  if (p.hp) {
    const hp = link(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = p.hp;
  }
  if (p.bp) {
    const bp = link(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = p.bp[0];
    bp.Q.value = p.bp[1];
  }
  for (const [fq, db, q] of p.eq ?? []) {
    const pk = link(ctx.createBiquadFilter());
    pk.type = 'peaking';
    pk.frequency.value = fq;
    pk.gain.value = db;
    pk.Q.value = q;
  }
  const amp = link(ctx.createGain());
  if (p.trem) {
    const tg = link(ctx.createGain());
    tg.gain.value = 1 - p.trem[1] / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.trem[0];
    const lg = ctx.createGain();
    lg.gain.value = p.trem[1] / 2;
    lfo.connect(lg).connect(tg.gain);
    lfo.start(t);
    stopAt.push(lfo);
  }
  let tail = 0;
  if (p.echo) {
    const [time, fb] = p.echo;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = time;
    const fbg = ctx.createGain();
    fbg.gain.value = fb;
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    node.connect(delay);
    delay.connect(fbg).connect(delay);
    delay.connect(wet);
    const sum = ctx.createGain();
    node.connect(sum);
    wet.connect(sum);
    node = sum;
    tail = time * 8;
  }
  let pan = node;
  if (ctx.createStereoPanner && n.pan) {
    pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, n.pan));
    node.connect(pan);
  }
  pan.connect(out.dry);
  if (out.rev && (p.rev ?? 0.2) > 0) {
    const send = ctx.createGain();
    send.gain.value = p.rev ?? 0.2;
    pan.connect(send).connect(out.rev);
  }

  // ---- the amplitude envelope
  const a = Math.max(0.001, p.a ?? 0.005);
  const r = Math.max(0.02, p.r ?? 0.1);
  const g = amp.gain;
  g.setValueAtTime(0, t);
  let end;
  if (p.swell) {
    g.linearRampToValueAtTime(peak, t + dur);
    g.setTargetAtTime(0, t + dur, r / 3);
    end = t + dur + r * 2;
  } else if ((p.s ?? 0.8) > 0) {
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(peak * p.s, t + a, (p.d ?? 0.2) / 3);
    const off = t + Math.max(dur, a);
    g.setTargetAtTime(0, off, r / 3);
    end = off + r * 2;
  } else {
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(0, t + a, decayT);
    const natural = t + a + decayT * 6;
    const off = t + Math.max(dur, a);
    if (off < natural) g.setTargetAtTime(0, off, r / 3);
    end = Math.min(natural, off + r * 2);
  }
  end += tail;

  // ---- the sources
  const osc = (freq, w, detune = 0) => {
    const o = ctx.createOscillator();
    setWave(ctx, o, w);
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    stopAt.push(o);
    sources.push(o);
    return o;
  };
  if (p.ks) {
    const copies = p.chorus ? [-p.chorus / 2, p.chorus / 2] : [0];
    for (const c of copies) {
      const { buffer, rate } = ksBuffer(ctx, f, p.ks[0], p.ks[1]);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.detune.value = c;
      const gg = ctx.createGain();
      gg.gain.value = 0.8 / Math.sqrt(copies.length);
      src.connect(gg).connect(pre);
      src.start(t);
      stopAt.push(src);
      sources.push(src);
    }
  }
  if (p.partials) {
    const copies = p.chorus ? [-p.chorus / 2, p.chorus / 2] : [0];
    for (const c of copies) {
      for (const [ratio, gain, df] of p.partials) {
        if (f * ratio > ctx.sampleRate * 0.45) continue;
        const o = osc(f * ratio, 'sine', c);
        const pg = ctx.createGain();
        const level = (gain * 0.5) / Math.sqrt(copies.length);
        pg.gain.setValueAtTime(level, t);
        if ((p.s ?? 0) === 0) pg.gain.setTargetAtTime(0, t, decayT * df);
        o.connect(pg).connect(pre);
      }
    }
  }
  const layers = p.layers ?? (p.w ? [{ w: p.w }] : []);
  const [count, spread] = p.uni ?? [1, 0];
  for (const L of layers) {
    for (let i = 0; i < count; i++) {
      const det = (L.d ?? 0) + (count > 1 ? (i / (count - 1) - 0.5) * 2 * spread : 0);
      const o = osc(f * (L.r ?? 1), L.w ?? p.w ?? 'sawtooth', det);
      const lg = ctx.createGain();
      lg.gain.value = ((L.g ?? 1) * 0.35) / Math.sqrt(count);
      o.connect(lg).connect(pre);
      if (p.fm) {
        const [ratio, index, fmDecay] = p.fm;
        const m = ctx.createOscillator();
        m.frequency.value = f * (L.r ?? 1) * ratio;
        const mg = ctx.createGain();
        const dev = index * f * (L.r ?? 1) * ratio * vel;
        mg.gain.setValueAtTime(dev, t);
        if (fmDecay) mg.gain.setTargetAtTime(dev * 0.15, t, fmDecay / 3);
        m.connect(mg).connect(o.frequency);
        m.start(t);
        stopAt.push(m);
      }
    }
  }
  if (p.perc) {
    const [ratio, gain, pd] = p.perc;
    const o = osc(f * ratio, 'sine');
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(gain * 0.4, t);
    pg.gain.setTargetAtTime(0, t, pd / 3);
    o.connect(pg).connect(pre);
  }
  if (p.noise) {
    const [gain, nd, type = 'bp', fq = 2, q = 1] = p.noise;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type === 'hp' ? 'highpass' : type === 'lp' ? 'lowpass' : 'bandpass';
    filt.frequency.value = clampF(ctx, hz(fq, f));
    filt.Q.value = q;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.6, t);
    if (nd) ng.gain.setTargetAtTime(0, t, nd / 3);
    // sustained breath follows the note's envelope; attack noises have their own
    src.connect(filt).connect(ng).connect(nd ? (p.drive ? pre : amp) : amp);
    src.start(t, Math.random() * 1.5);
    stopAt.push(src);
  }

  // ---- pitch: vibrato and glides
  if (p.vib && sources.length) {
    const [rate, cents, delay = 0] = p.vib;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(cents, t + delay + 0.2);
    lfo.connect(lg);
    for (const s of sources) lg.connect(s.detune);
    lfo.start(t);
    stopAt.push(lfo);
  }
  if (p.pe) {
    const [semis, time] = p.pe;
    for (const s of sources) {
      const base = s.detune.value;
      s.detune.setValueAtTime(base + semis * 100, t);
      s.detune.setTargetAtTime(base, t, time / 3);
    }
  }
  for (const s of stopAt) s.stop(end + 0.05);
  return end;
}

// ---------------------------------------------------------------- drums (channel 10)
export const DRUM_NAMES = {
  35: 'Acoustic Bass Drum', 36: 'Bass Drum 1', 37: 'Side Stick', 38: 'Acoustic Snare', 39: 'Hand Clap', 40: 'Electric Snare',
  41: 'Low Floor Tom', 42: 'Closed Hi-Hat', 43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat',
  47: 'Low-Mid Tom', 48: 'Hi-Mid Tom', 49: 'Crash Cymbal 1', 50: 'High Tom', 51: 'Ride Cymbal 1', 52: 'Chinese Cymbal',
  53: 'Ride Bell', 54: 'Tambourine', 55: 'Splash Cymbal', 56: 'Cowbell', 57: 'Crash Cymbal 2', 58: 'Vibraslap',
  59: 'Ride Cymbal 2', 60: 'Hi Bongo', 61: 'Low Bongo', 62: 'Mute Hi Conga', 63: 'Open Hi Conga', 64: 'Low Conga',
  65: 'High Timbale', 66: 'Low Timbale', 67: 'High Agogo', 68: 'Low Agogo', 69: 'Cabasa', 70: 'Maracas',
  71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro', 74: 'Long Guiro', 75: 'Claves', 76: 'Hi Wood Block',
  77: 'Low Wood Block', 78: 'Mute Cuica', 79: 'Open Cuica', 80: 'Mute Triangle', 81: 'Open Triangle'
};

// Each drum is a list of parts:
//   ['tone', wave, startHz, endHz, glide s, decay s, gain]
//   ['noise', 'bp'|'hp'|'lp', Hz, Q, decay s, gain, [burst times]]
//   ['metal', baseHz, hp Hz, decay s, gain]      (six square waves at cymbal ratios)
//   ['bell', [[Hz, gain, decay s]]]
const tom = (hz, decay) => [['tone', 'sine', hz * 1.6, hz, 0.08, decay, 1], ['tone', 'triangle', hz * 2.4, hz * 1.5, 0.05, decay * 0.4, 0.15], ['noise', 'lp', 900, 0.7, 0.05, 0.25]];
const conga = (hz, decay, slap = 0.2) => [['tone', 'sine', hz * 1.08, hz, 0.03, decay, 1], ['noise', 'bp', 2500, 1, 0.015, slap]];
const CLAP_BURSTS = [0, 0.011, 0.023, 0.034];
export const DRUMS = {
  35: [['tone', 'sine', 120, 42, 0.07, 0.35, 1.2], ['noise', 'lp', 2500, 0.7, 0.008, 0.35]],
  36: [['tone', 'sine', 160, 50, 0.05, 0.3, 1.2], ['noise', 'bp', 3000, 0.8, 0.006, 0.5]],
  37: [['tone', 'triangle', 1700, 1500, 0.01, 0.03, 0.6], ['noise', 'bp', 2200, 2, 0.025, 0.6]],
  38: [['tone', 'triangle', 200, 175, 0.03, 0.1, 0.6], ['tone', 'sine', 330, 310, 0.02, 0.06, 0.3], ['noise', 'hp', 1500, 0.7, 0.17, 0.85]],
  39: [['noise', 'bp', 1100, 1.5, 0.012, 0.9, CLAP_BURSTS], ['noise', 'bp', 1100, 1.2, 0.14, 0.6, [0.034]]],
  40: [['tone', 'triangle', 230, 190, 0.02, 0.08, 0.5], ['noise', 'bp', 4000, 0.8, 0.12, 0.9], ['noise', 'hp', 6000, 0.7, 0.05, 0.4]],
  41: tom(82, 0.38), 43: tom(98, 0.36), 45: tom(110, 0.34), 47: tom(131, 0.32), 48: tom(147, 0.3), 50: tom(175, 0.28),
  42: [['metal', 40, 7000, 0.045, 0.7], ['noise', 'hp', 8000, 0.7, 0.03, 0.3]],
  44: [['metal', 40, 7000, 0.06, 0.45], ['noise', 'hp', 7000, 0.7, 0.04, 0.2]],
  46: [['metal', 40, 7000, 0.45, 0.6], ['noise', 'hp', 8000, 0.7, 0.35, 0.3]],
  49: [['metal', 52, 5000, 1.6, 0.55], ['noise', 'hp', 5000, 0.7, 1.4, 0.55]],
  57: [['metal', 58, 6000, 1.9, 0.55], ['noise', 'hp', 6000, 0.7, 1.6, 0.5]],
  51: [['metal', 45, 4000, 1.4, 0.4], ['bell', [[5200, 0.12, 0.6]]], ['noise', 'hp', 7000, 0.7, 0.8, 0.15]],
  59: [['metal', 42, 3800, 1.5, 0.4], ['bell', [[4700, 0.12, 0.6]]], ['noise', 'hp', 6500, 0.7, 0.9, 0.15]],
  52: [['metal', 35, 3000, 1.2, 0.6], ['noise', 'bp', 3500, 0.8, 1, 0.5]],
  53: [['metal', 60, 2500, 0.8, 0.3], ['bell', [[2400, 0.5, 0.7], [3500, 0.25, 0.5]]]],
  54: [['noise', 'hp', 7000, 0.7, 0.06, 0.6, [0, 0.022, 0.045]], ['metal', 70, 9000, 0.18, 0.3]],
  55: [['metal', 62, 6000, 0.7, 0.5], ['noise', 'hp', 6000, 0.7, 0.6, 0.5]],
  56: [['tone', 'square', 540, 540, 0, 0.3, 0.35], ['tone', 'square', 800, 800, 0, 0.3, 0.35], ['noise', 'bp', 900, 3, 0.02, 0.2]],
  58: [['noise', 'bp', 3000, 4, 0.03, 0.6, Array.from({ length: 22 }, (_, i) => i * 0.035)]],
  60: conga(420, 0.15), 61: conga(300, 0.2),
  62: conga(330, 0.07, 0.4), 63: conga(330, 0.3), 64: conga(220, 0.35),
  65: [['tone', 'triangle', 620, 600, 0.02, 0.3, 0.7], ['noise', 'bp', 2500, 1, 0.1, 0.35]],
  66: [['tone', 'triangle', 440, 420, 0.02, 0.35, 0.7], ['noise', 'bp', 2000, 1, 0.1, 0.35]],
  67: [['bell', [[920, 0.8, 0.3], [2210, 0.4, 0.2], [3590, 0.2, 0.15]]]],
  68: [['bell', [[650, 0.8, 0.3], [1560, 0.4, 0.2], [2540, 0.2, 0.15]]]],
  69: [['noise', 'hp', 6000, 0.7, 0.07, 0.6]],
  70: [['noise', 'hp', 7000, 0.7, 0.04, 0.7]],
  71: [['tone', 'sine', 2350, 2350, 0, 0.12, 0.4, 0.12]],
  72: [['tone', 'sine', 2150, 2150, 0, 0.45, 0.4, 0.45]],
  73: [['noise', 'bp', 3500, 3, 0.012, 0.5, Array.from({ length: 8 }, (_, i) => i * 0.015)]],
  74: [['noise', 'bp', 3200, 3, 0.012, 0.5, Array.from({ length: 18 }, (_, i) => i * 0.022)]],
  75: [['tone', 'sine', 2500, 2500, 0, 0.045, 0.8], ['tone', 'sine', 5000, 5000, 0, 0.02, 0.2]],
  76: [['bell', [[1800, 0.7, 0.06], [4860, 0.2, 0.03]]], ['noise', 'bp', 1800, 3, 0.01, 0.3]],
  77: [['bell', [[1200, 0.7, 0.07], [3240, 0.2, 0.035]]], ['noise', 'bp', 1200, 3, 0.012, 0.3]],
  78: [['tone', 'sine', 600, 900, 0.08, 0.1, 0.6]],
  79: [['tone', 'sine', 500, 1100, 0.25, 0.3, 0.6]],
  80: [['bell', [[4600, 0.4, 0.12], [7400, 0.2, 0.08]]]],
  81: [['bell', [[4600, 0.4, 1.6], [7400, 0.2, 1.1], [10200, 0.1, 0.7]]]]
};
// Outside 35–81 (GM2 additions): sticks, shaker, castanets and surdo, else a click.
const EXTRA = {
  31: [['noise', 'bp', 3000, 2, 0.02, 0.6], ['tone', 'triangle', 2000, 2000, 0, 0.02, 0.3]],
  82: [['noise', 'hp', 6500, 0.7, 0.06, 0.6]],
  85: [['noise', 'bp', 2500, 3, 0.03, 0.7, [0, 0.018]]],
  86: tom(60, 0.2),
  87: tom(60, 0.6)
};
const CLICK = [['noise', 'bp', 2500, 2, 0.015, 0.5]];
export const DRUM_LEVELS = {35: 0.67, 36: 0.69, 37: 1.81, 38: 0.95, 39: 1.95, 40: 1.22, 41: 0.72, 42: 3, 43: 0.73, 44: 3, 45: 0.74, 46: 1.82, 47: 0.75, 48: 0.76, 49: 1, 50: 0.77, 51: 1.7, 52: 1.29, 53: 0.9, 54: 1.52, 55: 1.19, 56: 0.99, 57: 1.08, 58: 2.35, 59: 1.68, 60: 0.88, 61: 0.83, 62: 1.06, 63: 0.76, 64: 0.74, 65: 1, 66: 0.97, 67: 0.81, 68: 0.81, 69: 1.67, 70: 1.83, 71: 0.94, 72: 0.9, 73: 2.6, 74: 2.72, 75: 1.29, 76: 1.3, 77: 1.26, 78: 1.26, 79: 0.98, 80: 1.42, 81: 0.94};

let openHat = null; // closing the hi-hat cuts an open one short
export function playDrum(ctx, out, n, t) {
  const parts = DRUMS[n.pitch] ?? EXTRA[n.pitch] ?? CLICK;
  const vel = Math.max(1, n.velocity ?? 100) / 127;
  const bus = ctx.createGain();
  bus.gain.value = vel ** 1.3 * (n.volume ?? 1) * (DRUM_LEVELS[n.pitch] ?? 1) * 0.55;
  let target = bus;
  if (ctx.createStereoPanner && n.pan) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = n.pan;
    bus.connect(pn);
    target = pn;
  }
  (target === bus ? bus : target).connect(out.dry);
  if (out.rev) {
    const send = ctx.createGain();
    send.gain.value = 0.12;
    (target === bus ? bus : target).connect(send).connect(out.rev);
  }
  if ((n.pitch === 42 || n.pitch === 44) && openHat && openHat.until > t) {
    openHat.gain.gain.setTargetAtTime(0, t, 0.01);
    openHat = null;
  }
  let end = t;
  for (const part of parts) {
    const kind = part[0];
    if (kind === 'tone') {
      const [, wave, f0, f1, glide, decay, gain, hold = 0] = part;
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(f0, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.002);
      if (hold) {
        g.gain.setValueAtTime(gain, t + hold);
        g.gain.setTargetAtTime(0, t + hold, 0.02);
      } else g.gain.setTargetAtTime(0, t + 0.002, decay / 3);
      o.connect(g).connect(bus);
      o.start(t);
      const stop = t + (hold || decay * 2.5) + 0.1;
      o.stop(stop);
      end = Math.max(end, stop);
    } else if (kind === 'noise') {
      const [, type, fq, q, decay, gain, bursts = [0]] = part;
      for (const b of bursts) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        const filt = ctx.createBiquadFilter();
        filt.type = type === 'hp' ? 'highpass' : type === 'lp' ? 'lowpass' : 'bandpass';
        filt.frequency.value = fq;
        filt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + b);
        g.gain.linearRampToValueAtTime(gain, t + b + 0.001);
        g.gain.setTargetAtTime(0, t + b + 0.001, decay / 3);
        src.connect(filt).connect(g).connect(bus);
        src.start(t + b, Math.random() * 1.5);
        const stop = t + b + decay * 2.5 + 0.05;
        src.stop(stop);
        end = Math.max(end, stop);
      }
    } else if (kind === 'metal') {
      const [, base, hpf, decay, gain] = part;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = hpf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = Math.min(ctx.sampleRate * 0.45, hpf * 1.4);
      bpf.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.001);
      g.gain.setTargetAtTime(0, t + 0.001, decay / 3);
      hp.connect(bpf).connect(g).connect(bus);
      for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = base * ratio;
        const og = ctx.createGain();
        og.gain.value = 0.18;
        o.connect(og).connect(hp);
        o.start(t);
        o.stop(t + decay * 2.5 + 0.05);
      }
      end = Math.max(end, t + decay * 2.5);
      if (n.pitch === 46) openHat = { gain: g, until: t + decay * 2.5 };
    } else if (kind === 'bell') {
      for (const [fq, gain, decay] of part[1]) {
        const o = ctx.createOscillator();
        o.frequency.value = fq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.001);
        g.gain.setTargetAtTime(0, t + 0.001, decay / 3);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + decay * 2.5 + 0.05);
        end = Math.max(end, t + decay * 2.5);
      }
    }
  }
  return end;
}
