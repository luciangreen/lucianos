import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyName, copyPlan } from '../public/desktop/copy-lib.js';

test('copy names follow the Finder', () => {
  assert.equal(copyName('notes.txt', new Set(['notes.txt'])), 'notes copy.txt');
  assert.equal(copyName('notes.txt', new Set(['notes.txt', 'notes copy.txt'])), 'notes copy 2.txt');
  assert.equal(copyName('notes copy.txt', new Set(['notes copy.txt', 'notes copy 2.txt'])), 'notes copy 3.txt');
  assert.equal(copyName('Projects', new Set(['Projects']), { isDir: true }), 'Projects copy');
  assert.equal(copyName('v1.2', new Set(['v1.2']), { isDir: true }), 'v1.2 copy');
  assert.equal(copyName('.env', new Set(['.env'])), '.env copy');
  assert.equal(copyName('Makefile', new Set(['Makefile'])), 'Makefile copy');
});

test('a copy plan keeps names where free and never copies a folder into itself', () => {
  const entries = [
    { path: 'Desktop/a.txt', name: 'a.txt', type: 'file' },
    { path: 'Desktop/b.txt', name: 'b.txt', type: 'file' },
    { path: 'Desktop/Projects', name: 'Projects', type: 'dir' }
  ];
  assert.deepEqual(copyPlan(entries, 'Docs', new Set(['b.txt'])), [
    { from: 'Desktop/a.txt', to: 'Docs/a.txt', name: 'a.txt' },
    { from: 'Desktop/b.txt', to: 'Docs/b copy.txt', name: 'b copy.txt' },
    { from: 'Desktop/Projects', to: 'Docs/Projects', name: 'Projects' }
  ]);
  // duplicating in place
  assert.deepEqual(copyPlan(entries.slice(0, 1), 'Desktop', new Set(['a.txt'])).map((p) => p.to), ['Desktop/a copy.txt']);
  // into itself
  assert.deepEqual(copyPlan(entries.slice(2), 'Desktop/Projects/inner', new Set()), []);
  // into the home folder
  assert.equal(copyPlan(entries.slice(0, 1), '', new Set())[0].to, 'a.txt');
});
