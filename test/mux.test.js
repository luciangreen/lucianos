// Many live streams over one connection.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, waitForJob } from './helpers.js';

let s;
before(async () => { s = await startServer(); });
after(() => s.close());

// Reads the mux stream, collecting frames, until `until(frames)` is true.
async function openMux() {
  const ac = new AbortController();
  const res = await fetch(s.url + '/api/mux', { signal: ac.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const frames = [];
  let buf = '';
  let id = null;
  const waiters = [];
  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      buf += new TextDecoder().decode(value);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const f = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(f)?.[1];
        const data = /^data: (.*)$/m.exec(f)?.[1];
        if (!data) continue;
        const d = JSON.parse(data);
        d.json = () => { try { return JSON.parse(d.data); } catch { return {}; } };
        if (ev === 'hello') id = d.id;
        else frames.push(d);
        for (const w of [...waiters]) w();
      }
    }
  })();
  const until = (fn, ms = 5000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out; frames: ' + JSON.stringify(frames.map((x) => [x.sid, x.event, x.end, (x.data ?? '').slice(0, 60)])))), ms);
    const check = () => {
      let hit = false;
      try { hit = fn(frames, id); } catch {}
      if (hit) {
        clearTimeout(t);
        waiters.splice(waiters.indexOf(check), 1);
        resolve();
      }
    };
    waiters.push(check);
    check();
  });
  await until((_, i) => i);
  return { id: () => id, frames, until, cancel: () => ac.abort() };
}

test('job output, a folder watch and events share one connection', async () => {
  const m = await openMux();
  fs.mkdirSync(path.join(s.root, 'w'));
  const r = await s.request('POST', '/api/jobs', { body: { cmd: 'echo', args: ['hello-mux'] } });
  await waitForJob(s, r.json.id);
  assert.equal((await s.request('POST', `/api/mux/${m.id()}/open`, { body: { sid: 'job', url: `/api/jobs/${r.json.id}/stream` } })).status, 200);
  assert.equal((await s.request('POST', `/api/mux/${m.id()}/open`, { body: { sid: 'watch', url: '/api/files/watch?path=w' } })).status, 200);
  assert.equal((await s.request('POST', `/api/mux/${m.id()}/open`, { body: { sid: 'ev', url: '/api/events?types=app.' } })).status, 200);

  await m.until((f) => f.some((x) => x.sid === 'job' && x.end));
  const out = m.frames.filter((x) => x.sid === 'job' && x.event === 'output').map((x) => JSON.parse(x.data).text).join('');
  assert.match(out, /hello-mux/);
  assert.ok(m.frames.some((x) => x.sid === 'job' && x.event === 'end'));

  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(s.root, 'w', 'new.txt'), 'x');
  await m.until((f) => f.some((x) => x.sid === 'watch' && x.event === 'change' && x.json().path === 'w/new.txt'));

  await s.request('POST', '/api/events', { body: { type: 'app.test', data: { n: 1 } } });
  await m.until((f) => f.some((x) => x.sid === 'ev' && x.event === 'message' && x.json().type === 'app.test'));

  // closing one stream stops it without touching the others
  await s.request('POST', `/api/mux/${m.id()}/close`, { body: { sid: 'ev' } });
  const before = m.frames.length;
  await s.request('POST', '/api/events', { body: { type: 'app.test', data: { n: 2 } } });
  fs.writeFileSync(path.join(s.root, 'w', 'second.txt'), 'x');
  await m.until((f) => f.some((x) => x.sid === 'watch' && x.json().path === 'w/second.txt'));
  assert.ok(!m.frames.slice(before).some((x) => x.sid === 'ev'));
  m.cancel();
});

test('only stream routes can be opened, and errors arrive as frames', async () => {
  const m = await openMux();
  const bad = await s.request('POST', `/api/mux/${m.id()}/open`, { body: { sid: 'a', url: '/api/files/read?path=x' } });
  assert.equal(bad.status, 400);
  await s.request('POST', `/api/mux/${m.id()}/open`, { body: { sid: 'b', url: '/api/files/watch?path=../../etc' } });
  await m.until((f) => f.some((x) => x.sid === 'b' && x.end));
  assert.ok(m.frames.some((x) => x.sid === 'b' && x.event === 'error'));
  assert.equal((await s.request('POST', '/api/mux/nope/open', { body: { sid: 'c', url: '/api/events' } })).status, 404);
  m.cancel();
});
