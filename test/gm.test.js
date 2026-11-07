// Every General MIDI instrument and drum has its own, complete sound.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRUM_LEVELS, DRUM_NAMES, DRUMS, GM_NAMES, LEVELS, PATCHES } from '../public/shared/gm.js';

test('128 instruments, each with its own patch and level', () => {
  assert.equal(GM_NAMES.length, 128);
  assert.equal(PATCHES.length, 128);
  assert.equal(LEVELS.length, 128);
  const seen = new Map();
  PATCHES.forEach((p, i) => {
    const name = `${i} ${GM_NAMES[i]}`;
    assert.ok(p.ks || p.partials || p.layers || p.w || p.noise, `${name} makes no sound`);
    assert.ok(LEVELS[i] > 0 && LEVELS[i] <= 6, `${name} level`);
    for (const k of ['a', 'd', 'r']) if (p[k] !== undefined) assert.ok(p[k] >= 0 && p[k] < 5, `${name} ${k}`);
    if (p.s !== undefined) assert.ok(p.s >= 0 && p.s <= 1, `${name} sustain`);
    if (p.ks) assert.ok(p.ks[0] > 0.9 && p.ks[0] < 1 && p.ks[1] >= 0 && p.ks[1] <= 1, `${name} pluck`);
    const key = JSON.stringify(p);
    assert.ok(!seen.has(key), `${name} is the same as ${seen.get(key)}`);
    seen.set(key, name);
  });
});

test('families get the right kind of sound', () => {
  const plucked = [24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 45, 46, 104, 105, 106, 107];
  for (const i of plucked) assert.ok(PATCHES[i].ks, `${GM_NAMES[i]} is plucked`);
  for (let i = 0; i < 16; i++) if (i !== 5 && i !== 6 && i !== 7 && i !== 15) assert.equal(PATCHES[i].s, 0, `${GM_NAMES[i]} dies away`);
  for (let i = 16; i < 24; i++) assert.ok((PATCHES[i].s ?? 1) === 1, `${GM_NAMES[i]} sustains`);
  for (const i of [52, 53, 54]) assert.ok(PATCHES[i].formants, `${GM_NAMES[i]} has vowels`);
  for (const i of [72, 73, 75, 77]) assert.ok(PATCHES[i].noise, `${GM_NAMES[i]} has breath`);
  for (const i of [40, 41, 42, 43]) assert.ok(PATCHES[i].vib, `${GM_NAMES[i]} has vibrato`);
});

test('every GM drum, 35 to 81, has its own sound', () => {
  for (let n = 35; n <= 81; n++) {
    assert.ok(DRUMS[n]?.length, `${n} ${DRUM_NAMES[n]}`);
    assert.ok(DRUM_NAMES[n], `${n} has a name`);
    assert.ok(DRUM_LEVELS[n] > 0, `${n} level`);
  }
  const kinds = new Set(Object.values(DRUMS).map((d) => JSON.stringify(d)));
  // toms share a shape but not a pitch, so all 47 differ
  assert.equal(kinds.size, 47);
});
