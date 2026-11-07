import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertTime, evaluate, formatDuration, looksLikeSum, wallTimeToDate, zoneOffset } from '../public/desktop/calc.js';

const v = (s) => evaluate(s).text;

test('arithmetic with brackets and spaces', () => {
  assert.equal(v('2 + 3 * 4'), '14');
  assert.equal(v('( 2 + 3 ) * 4'), '20');
  assert.equal(v('2 (3 + 4) ^ 2'), '98');
  assert.equal(v('[1 + 2] * {3 - 1}'), '6');
  assert.equal(v('2 ^ 3 ^ 2'), '512');
  assert.equal(v('-3 ^ 2'), '-9');
  assert.equal(v('10 / 4'), '2.5');
  assert.equal(v('0.1 + 0.2'), '0.3');
  assert.equal(v('7 mod 3'), '1');
  assert.equal(v('5!'), '120');
  assert.equal(v('2 × 3 ÷ 4'), '1.5');
});

test('grouped numbers, percent, functions, constants', () => {
  assert.equal(v('1 000 000 / 4'), '250000');
  assert.equal(v('1,500 + 1'), '1501');
  assert.equal(evaluate('1 000 000 / 4').detail, '250,000');
  assert.equal(v('15% of 80'), '12');
  assert.equal(v('200 * 10%'), '20');
  assert.equal(v('sqrt(16) + abs(-2)'), '6');
  assert.equal(v('2pi'), String(Number((2 * Math.PI).toPrecision(12))));
  assert.equal(v('round(2.5)'), '3');
});

test('readable errors', () => {
  assert.throws(() => evaluate('(1 + 2'), /Missing "\)"/);
  assert.throws(() => evaluate('1 + 2)'), /Extra "\)"/);
  assert.throws(() => evaluate('(1 + 2]'), /closed by/);
  assert.throws(() => evaluate('1 / 0'), /Division by zero/);
  assert.throws(() => evaluate('foo(2)'), /Unknown word/);
  assert.throws(() => evaluate('alert(1)'), /Unknown word/);
  assert.throws(() => evaluate(''), /Type a sum/);
});

test('durations and conversions', () => {
  assert.equal(v('2h 30m + 45 min'), '3 h 15 min');
  assert.equal(evaluate('2h 30m + 45 min').detail, '195 min · 11700 s');
  assert.equal(v('90 min in h'), '1.5 h');
  assert.equal(v('3 days - 4 h'), '2 d 20 h');
  assert.equal(v('1.5 h * 3'), '4 h 30 min');
  assert.throws(() => evaluate('5 in h'), /Only durations/);
  assert.equal(formatDuration(0), '0 s');
});

test('looksLikeSum for spotlight', () => {
  assert.ok(looksLikeSum('2+2'));
  assert.ok(looksLikeSum('2h + 30m'));
  assert.ok(!looksLikeSum('notes'));
  assert.ok(!looksLikeSum('2026'));
  assert.ok(!looksLikeSum('text_to_breasonings.pl'));
});

test('time zones', () => {
  // Sydney is UTC+11 in November (daylight saving)
  assert.equal(zoneOffset('Australia/Sydney', new Date('2026-11-07T00:00:00Z')), 660);
  assert.equal(zoneOffset('UTC', new Date()), 0);
  assert.equal(wallTimeToDate('2026-11-07T15:30', 'Australia/Sydney').toISOString(), '2026-11-07T04:30:00.000Z');
  const [london] = convertTime('2026-11-07T15:30', 'Australia/Sydney', ['Europe/London']);
  assert.match(london.text, /4:30\s?am/i);
});
