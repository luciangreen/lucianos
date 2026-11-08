import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRect, combine, edgeScroll, hitsOf, modeOf, rectFrom, touches } from '../public/desktop/marquee-lib.js';

const icon = (key, left, top) => ({ key, rect: { left, top, right: left + 88, bottom: top + 80 } });
const icons = [icon('a', 10, 10), icon('b', 110, 10), icon('c', 210, 10), icon('d', 10, 110), icon('e', 110, 110)];

test('the rectangle is the same whichever way you drag', () => {
  assert.deepEqual(rectFrom({ x: 200, y: 150 }, { x: 50, y: 20 }), { left: 50, top: 20, right: 200, bottom: 150 });
  assert.deepEqual(rectFrom({ x: 50, y: 20 }, { x: 200, y: 150 }), rectFrom({ x: 200, y: 150 }, { x: 50, y: 20 }));
});

test('icons the rectangle touches are picked, even partly', () => {
  assert.deepEqual(hitsOf(rectFrom({ x: 0, y: 0 }, { x: 120, y: 20 }), icons), ['a', 'b']);
  assert.deepEqual(hitsOf(rectFrom({ x: 150, y: 150 }, { x: 60, y: 60 }), icons), ['a', 'b', 'd', 'e']);
  assert.deepEqual(hitsOf(rectFrom({ x: 99, y: 0 }, { x: 109, y: 300 }), icons), [], 'the gap between columns touches nothing');
  assert.equal(touches({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 }), false, 'edges meeting is not touching');
});

test('a plain drag replaces the selection, Shift adds to it, ⌘ or Ctrl flips it', () => {
  const base = new Set(['a', 'c']);
  assert.deepEqual([...combine(base, ['b', 'c'])], ['b', 'c']);
  assert.deepEqual([...combine(base, ['b', 'c'], 'add')].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...combine(base, ['b', 'c'], 'toggle')].sort(), ['a', 'b']);
  assert.deepEqual([...combine(base, [], 'replace')], [], 'a drag over nothing clears it');
  assert.equal(modeOf({ shiftKey: true }), 'add');
  assert.equal(modeOf({ metaKey: true, shiftKey: true }), 'toggle');
  assert.equal(modeOf({ ctrlKey: true }), 'toggle');
  assert.equal(modeOf({}), 'replace');
});

test('the rectangle stays inside its window, and the window scrolls near its edges', () => {
  assert.deepEqual(clampRect({ left: -20, top: 30, right: 500, bottom: 900 }, { left: 0, top: 50, right: 400, bottom: 600 }), { left: 0, top: 50, right: 400, bottom: 600 });
  assert.equal(edgeScroll(300, 100, 500), 0);
  assert.ok(edgeScroll(105, 100, 500) < 0 && edgeScroll(495, 100, 500) > 0);
  assert.equal(edgeScroll(-500, 100, 500), -18, 'never faster than the maximum');
  assert.ok(edgeScroll(560, 100, 500) > edgeScroll(490, 100, 500), 'faster the further past the edge');
});
