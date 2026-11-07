import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predict, recent, remember } from '../public/shared/character/predict.js';

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

test('remembers real commands only, newest last, capped', () => {
  let h = [];
  h = remember(h, { text: 'go home', intent: 'home', time: 1 });
  h = remember(h, { text: 'blah', intent: 'unknown', time: 2 });
  h = remember(h, { text: 'hello', intent: 'greet', time: 3 });
  assert.deepEqual(h.map((x) => x.text), ['go home']);
  for (let i = 0; i < 400; i++) h = remember(h, { text: `go to f${i}`, intent: 'goto', time: i });
  assert.equal(h.length, 300);
});

test('predicts what usually comes next', () => {
  const h = [];
  for (const d of [1, 2, 3, 4]) {
    h.push({ text: 'go to GitHub-private2', intent: 'goto', time: at(d, 9), here: '' });
    h.push({ text: 'grammar logic on meditation', intent: 'gl', time: at(d, 9, 5), here: 'Dropbox/GitHub-private2' });
    h.push({ text: "play today's music", intent: 'music', time: at(d, 17), here: '' });
  }
  h.push({ text: 'go to GitHub-private2', intent: 'goto', time: at(5, 9), here: '' });
  const p = predict(h, { now: at(5, 9, 1), here: 'Dropbox/GitHub-private2' });
  assert.equal(p[0].text, 'grammar logic on meditation');
  assert.match(p[0].why, /often after|usual|often here/);
  assert.notEqual(p.at(-1).text, undefined);
  assert.ok(p.findIndex((x) => x.text === 'go to GitHub-private2') !== 0, 'just ran it, so not first');
});

test('the time of day matters', () => {
  const h = [];
  for (const d of [1, 2, 3]) {
    h.push({ text: 'show me the checklist', intent: 'workflows', time: at(d, 8), here: '' });
    h.push({ text: "play today's music", intent: 'music', time: at(d, 17), here: '' });
  }
  assert.equal(predict(h, { now: at(4, 17, 10) })[0].text, "play today's music");
  assert.equal(predict(h, { now: at(5, 8, 10) })[0].text, 'show me the checklist');
});

test('latest wording wins, and recent lists each command once', () => {
  const h = [
    { text: 'Go Home', intent: 'home', time: 1 },
    { text: 'go home.', intent: 'home', time: 5 },
    { text: 'go up', intent: 'up', time: 6 }
  ];
  assert.ok(predict(h, { now: 10 }).some((p) => p.text === 'go home.'));
  assert.deepEqual(recent(h).map((x) => x.text), ['go up', 'go home.']);
  assert.deepEqual(predict([], {}), []);
});
