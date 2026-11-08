import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_H, CELL_W, MARGIN, cleanUp, fits, placeAll, rowsFor, slot, sortEntries } from '../public/desktop/layout-lib.js';

test('columns hold as many icons as fit, at least one', () => {
  assert.equal(rowsFor(MARGIN + CELL_H * 5), 5);
  assert.equal(rowsFor(MARGIN + CELL_H * 5 - 1), 4);
  assert.equal(rowsFor(10), 1);
});

test('clean up fits everything: files from the left, apps from the right, wrapping', () => {
  const height = MARGIN + CELL_H * 3; // 3 per column
  const width = 1000;
  const items = [...'abcde'].map((k) => ({ key: k })).concat([...'1234'].map((k) => ({ key: `app${k}`, right: true })));
  const map = cleanUp(items, { width, height });
  assert.deepEqual(map.a, { x: MARGIN, y: MARGIN });
  assert.deepEqual(map.d, { x: MARGIN + CELL_W, y: MARGIN }); // second column
  assert.deepEqual(map.app1, { x: width - MARGIN - CELL_W, y: MARGIN });
  assert.deepEqual(map.app4, { x: width - MARGIN - 2 * CELL_W, y: MARGIN }); // wraps leftwards
  for (const p of Object.values(map)) assert.ok(p.y + CELL_H <= height && p.x >= 0 && p.x + CELL_W <= width);
  assert.deepEqual(slot(7, { rows: 3, width }), { x: MARGIN + 2 * CELL_W, y: MARGIN + CELL_H });
});

test('spots that no longer fit go to free cells, never on top of another icon', () => {
  const box = { width: 400, height: MARGIN + CELL_H * 3 };
  assert.ok(fits({ x: 12, y: 12 }, box));
  assert.ok(!fits({ x: 1172, y: 12 }, box));
  const saved = { a: { x: MARGIN, y: MARGIN }, app1: { x: 1172, y: 12 }, app2: { x: 1172, y: 112 } };
  const items = [{ key: 'a' }, { key: 'b' }, { key: 'app1', right: true }, { key: 'app2', right: true }];
  const out = placeAll(items, saved, box);
  assert.deepEqual(out.a, saved.a); // kept
  assert.deepEqual(out.b, { x: MARGIN, y: MARGIN + CELL_H }); // next free on the left
  assert.equal(out.app1.x, 400 - MARGIN - CELL_W); // brought back on the right
  const cells = Object.values(out).map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(cells).size, cells.length);
  for (const p of Object.values(out)) assert.ok(fits(p, box));
});

test('sorting: natural names, kinds with folders first, newest first; apps stay first', () => {
  const es = [
    { type: 'file', name: 'file10.txt', mtimeMs: 3 },
    { type: 'app', name: 'writer' },
    { type: 'file', name: 'File2.txt', mtimeMs: 1 },
    { type: 'dir', name: 'zeta', mtimeMs: 2 },
    { type: 'file', name: 'a.pl', mtimeMs: 5 }
  ];
  const names = (by) => sortEntries(es, by).map((e) => e.name);
  assert.deepEqual(names('name'), ['writer', 'a.pl', 'File2.txt', 'file10.txt', 'zeta']);
  assert.deepEqual(names('kind'), ['writer', 'zeta', 'a.pl', 'File2.txt', 'file10.txt']);
  assert.deepEqual(names('date'), ['writer', 'a.pl', 'file10.txt', 'zeta', 'File2.txt']);
  assert.equal(es[0].name, 'file10.txt'); // the list given is left alone
});
