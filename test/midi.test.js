import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeMidi, guessKey, midiStats, noteName, parseMidi } from '../public/shared/midi.js';

const scale = (start, steps, dur = 0.5) => {
  let p = start;
  return steps.map((s, i) => {
    p += s;
    return { time: i * dur, duration: dur * 0.9, pitch: p, velocity: 90 };
  });
};

test('round trip: notes, timing and tempo survive', () => {
  const notes = scale(59, [1, 2, 2, 1, 2, 2, 2, 1]); // C major from C4
  const song = parseMidi(encodeMidi(notes, { tempo: 100 }));
  assert.equal(song.notes.length, 8);
  assert.equal(song.tempo, 100);
  assert.equal(noteName(song.notes[0].pitch), 'C4');
  assert.ok(Math.abs(song.notes[3].time - 1.5) < 0.01);
  assert.ok(Math.abs(song.duration - (3.5 + 0.45)) < 0.02);
});

test('rejects files that are not MIDI', () => {
  assert.throws(() => parseMidi(new TextEncoder().encode('hello world, not midi')), /Not a MIDI file/);
});

test('key and melody statistics', () => {
  const major = scale(59, [1, 2, 2, 1, 2, 2, 2, 1, -1, -2, -2, -2, -1, -2, -2]);
  const s = midiStats(parseMidi(encodeMidi(major)));
  assert.equal(s.key, 'C major');
  assert.ok(s.stepRatio > 0.9, 'a scale moves by steps');
  assert.equal(s.range, 12);
  const leapy = [60, 72, 55, 67, 48, 76, 52].map((p, i) => ({ time: i * 0.25, duration: 0.2, pitch: p, velocity: 110 }));
  const l = midiStats(parseMidi(encodeMidi(leapy)));
  assert.ok(l.leapRatio > 0.9);
  assert.ok(l.density > 3);
  assert.equal(guessKey([57, 60, 64, 57, 60, 64, 69, 72].map((p, i) => ({ pitch: p, duration: 1, channel: 0, time: i }))).mode, 'minor');
});

test('drums on channel 10 are counted apart', () => {
  const notes = [{ time: 0, duration: 0.1, pitch: 36, velocity: 100, channel: 9 }, { time: 0, duration: 1, pitch: 60, velocity: 80 }];
  const s = midiStats(parseMidi(encodeMidi(notes)));
  assert.equal(s.drums, 1);
  assert.equal(s.notes, 2);
});
