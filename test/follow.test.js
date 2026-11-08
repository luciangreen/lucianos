// Files and folders renamed or moved outside LucianOS (in the Finder, say) are found again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findById, idOf } from '../src/locate.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lucianos-follow-')));

test('finds a renamed file, a file in a renamed folder, and a file moved one folder up', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'Desktop/untitled folder'), { recursive: true });
  const file = path.join(root, 'Desktop/untitled folder/a copy.txt');
  fs.writeFileSync(file, 'x');
  const id = idOf(fs.statSync(file));
  fs.renameSync(file, path.join(root, 'Desktop/untitled folder/notes.txt'));
  assert.equal(await findById(root, file, id), path.join(root, 'Desktop/untitled folder/notes.txt'));
  fs.renameSync(path.join(root, 'Desktop/untitled folder'), path.join(root, 'Desktop/Project'));
  assert.equal(await findById(root, file, id), path.join(root, 'Desktop/Project/notes.txt'));
  fs.renameSync(path.join(root, 'Desktop/Project/notes.txt'), path.join(root, 'notes.txt'));
  assert.equal(await findById(root, file, id), path.join(root, 'notes.txt'));
});

test('a deleted file is not found, and the search stays inside the root', async () => {
  const root = tmp();
  const file = path.join(root, 'gone.txt');
  fs.writeFileSync(file, 'x');
  const id = idOf(fs.statSync(file));
  fs.rmSync(file);
  assert.equal(await findById(root, file, id), null);
  assert.equal(await findById(root, '/etc/passwd', id), null);
  assert.equal(await findById(root, file, ''), null);
});

import { startServer } from './helpers.js';

test('saving follows a file whose folder was renamed in the Finder; a deleted folder gives a clear 404', async () => {
  const s = await startServer();
  try {
    const root = s.cfg.root;
    fs.mkdirSync(path.join(root, 'Desktop/untitled folder'), { recursive: true });
    const saved = (await s.request('PUT', '/api/files/write?path=Desktop/untitled%20folder/a%20copy.txt', { body: 'one' })).json;
    assert.ok(saved.id);
    fs.renameSync(path.join(root, 'Desktop/untitled folder'), path.join(root, 'Desktop/Plans'));
    // reading with the id finds it
    const read = (await s.request('GET', `/api/files/read?path=Desktop/untitled%20folder/a%20copy.txt&id=${saved.id}`)).json;
    assert.equal(read.path, 'Desktop/Plans/a copy.txt');
    assert.equal(read.movedFrom, 'Desktop/untitled folder/a copy.txt');
    // saving with the id (and the last mtime) goes to the new place
    const r = await s.request('PUT', '/api/files/write?path=Desktop/untitled%20folder/a%20copy.txt', { body: 'two', headers: { 'X-File-Id': read.id, 'X-Base-Mtime': String(read.mtimeMs) } });
    assert.equal(r.status, 200);
    assert.equal(r.json.path, 'Desktop/Plans/a copy.txt');
    assert.equal(fs.readFileSync(path.join(root, 'Desktop/Plans/a copy.txt'), 'utf8'), 'two');
    assert.ok(!fs.existsSync(path.join(root, 'Desktop/untitled folder')));
    // the folder deleted: a plain message, not a server error
    fs.rmSync(path.join(root, 'Desktop/Plans'), { recursive: true });
    const gone = await s.request('PUT', '/api/files/write?path=Desktop/Plans/a%20copy.txt', { body: 'three', headers: { 'X-File-Id': r.json.id } });
    assert.equal(gone.status, 404);
    assert.match(gone.json.error, /folder "Desktop\/Plans" is not there any more/);
    assert.doesNotMatch(gone.json.error, new RegExp(root));
  } finally {
    await s.close();
  }
});

test('a folder watch says where the folder went, or that it is gone', async () => {
  const s = await startServer();
  try {
    const root = s.cfg.root;
    fs.mkdirSync(path.join(root, 'w/inner'), { recursive: true });
    const events = async (p, act) => {
      const res = await s.request('GET', `/api/files/watch?path=${p}`, { raw: true });
      const reader = res.body.getReader();
      let text = '';
      setTimeout(act, 200);
      const until = Date.now() + 6000;
      while (!text.includes('event: gone') && Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      reader.cancel().catch(() => {});
      const m = text.match(/event: gone\ndata: (.*)\n/);
      return m && JSON.parse(m[1]);
    };
    assert.deepEqual(await events('w/inner', () => fs.renameSync(path.join(root, 'w/inner'), path.join(root, 'w/renamed'))), { path: 'w/inner', movedTo: 'w/renamed' });
    assert.deepEqual(await events('w/renamed', () => fs.rmSync(path.join(root, 'w/renamed'), { recursive: true })), { path: 'w/renamed', movedTo: null });
  } finally {
    await s.close();
  }
});
