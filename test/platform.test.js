import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { prologJobSpec, quoteAtom } from '../src/prolog.js';
import { outputText, startServer, waitForJob } from './helpers.js';

describe('local mode guards', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('API calls need the X-LucianOS header', async () => {
    const r = await s.request('GET', '/api/info', { headers: { 'X-LucianOS': '' } });
    assert.equal(r.status, 403);
  });

  test('requests for another host name are refused (DNS rebinding)', async () => {
    // fetch() drops a custom Host header, so use a raw request.
    const port = s.app.server.address().port;
    const status = await new Promise((r) =>
      http.get({ host: '127.0.0.1', port, path: '/api/info', headers: { Host: 'evil.example.com', 'X-LucianOS': '1' } }, (res) => {
        res.resume();
        r(res.statusCode);
      }));
    assert.equal(status, 403);
  });

  test('requests started by another website are refused, even read-only ones', async () => {
    await s.request('PUT', '/api/files/write?path=secret.txt', { body: 'private' });
    const r = await s.request('GET', '/api/files/raw?path=secret.txt', { headers: { 'X-LucianOS': '', 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(r.status, 403);
    const ok = await s.request('GET', '/api/files/raw?path=secret.txt', { headers: { 'X-LucianOS': '', 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(ok.status, 200);
  });

  test('no password needed locally', async () => {
    const r = await s.request('GET', '/api/session');
    assert.equal(r.json.loggedIn, true);
    assert.equal(r.json.passwordRequired, false);
  });

  test('check page and shared files are served with a CSP', async () => {
    const res = await s.request('GET', '/', { raw: true });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    const api = await s.request('GET', '/shared/api.js', { raw: true });
    assert.equal(api.status, 200);
  });

  test('static paths cannot escape the public folder', async () => {
    const r = await s.request('GET', '/..%2f..%2fpackage.json');
    assert.notEqual(r.status, 200);
  });
});

describe('sandboxed files', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('write, read, list', async () => {
    let r = await s.request('PUT', '/api/files/write?path=notes/a.txt&mkdirs=1', { body: 'hello\nworld' });
    assert.equal(r.status, 200);
    r = await s.request('GET', '/api/files/read?path=notes/a.txt');
    assert.equal(r.json.content, 'hello\nworld');
    r = await s.request('GET', '/api/files/list?path=notes');
    assert.deepEqual(r.json.entries.map((e) => e.name), ['a.txt']);
  });

  test('paths outside the root are refused', async () => {
    for (const p of ['../outside.txt', '/etc/passwd', 'notes/../../x']) {
      const r = await s.request('GET', `/api/files/read?path=${encodeURIComponent(p)}`);
      assert.equal(r.status, 403, p);
    }
  });

  test('symlinks pointing outside the root are refused', async () => {
    fs.symlinkSync('/etc', path.join(s.root, 'link'));
    const r = await s.request('GET', '/api/files/list?path=link');
    assert.equal(r.status, 403);
  });

  test('stale save is refused with 409, force overrides', async () => {
    await s.request('PUT', '/api/files/write?path=b.txt', { body: 'v1' });
    const first = await s.request('GET', '/api/files/read?path=b.txt');
    fs.writeFileSync(path.join(s.root, 'b.txt'), 'changed elsewhere');
    fs.utimesSync(path.join(s.root, 'b.txt'), new Date(), new Date(Date.now() + 5000));
    let r = await s.request('PUT', '/api/files/write?path=b.txt', { body: 'v2', headers: { 'X-Base-Mtime': String(first.json.mtimeMs) } });
    assert.equal(r.status, 409);
    r = await s.request('PUT', '/api/files/write?path=b.txt&force=1', { body: 'v2', headers: { 'X-Base-Mtime': String(first.json.mtimeMs) } });
    assert.equal(r.status, 200);
    assert.equal(fs.readFileSync(path.join(s.root, 'b.txt'), 'utf8'), 'v2');
  });

  test('move refuses to overwrite; trash keeps the file', async () => {
    await s.request('PUT', '/api/files/write?path=c.txt', { body: 'c' });
    await s.request('PUT', '/api/files/write?path=d.txt', { body: 'd' });
    let r = await s.request('POST', '/api/files/move', { body: { from: 'c.txt', to: 'd.txt' } });
    assert.equal(r.status, 409);
    r = await s.request('POST', '/api/files/move', { body: { from: 'c.txt', to: 'e.txt' } });
    assert.equal(r.status, 200);
    r = await s.request('POST', '/api/files/trash', { body: { path: 'e.txt' } });
    assert.equal(r.status, 200);
    assert.equal(fs.existsSync(path.join(s.root, 'e.txt')), false);
    const trashed = fs.readdirSync(path.join(s.cfg.dataDir, 'trash'));
    assert.ok(trashed.some((n) => n.endsWith('__e.txt')));
  });

  test('copy makes a second file and refuses to overwrite', async () => {
    await s.request('PUT', '/api/files/write?path=song.mid', { body: 'MThd' });
    let r = await s.request('POST', '/api/files/copy', { body: { from: 'song.mid', to: 'short/song.mid' } });
    assert.equal(r.status, 200);
    assert.equal(fs.readFileSync(path.join(s.root, 'short/song.mid'), 'utf8'), 'MThd');
    r = await s.request('POST', '/api/files/copy', { body: { from: 'song.mid', to: 'short/song.mid' } });
    assert.equal(r.status, 409);
    r = await s.request('POST', '/api/files/copy', { body: { from: 'song.mid', to: '../x.mid' } });
    assert.equal(r.status, 403);
  });

  test('search by name and by contents', async () => {
    await s.request('PUT', '/api/files/write?path=deep/x/needle.pl&mkdirs=1', { body: 'a.\nfind_me(1).\n' });
    let r = await s.request('GET', '/api/files/search?q=needle');
    assert.ok(r.json.results.some((x) => x.path === 'deep/x/needle.pl'));
    r = await s.request('GET', '/api/files/search?q=find_me&contents=1');
    const hit = r.json.results.find((x) => x.match === 'contents');
    assert.equal(hit.line, 2);
  });

  test('raw download works without the custom header (for <img>, <audio>)', async () => {
    await s.request('PUT', '/api/files/write?path=raw.txt', { body: 'raw!' });
    const r = await s.request('GET', '/api/files/raw?path=raw.txt', { headers: { 'X-LucianOS': '' } });
    assert.equal(r.status, 200);
    assert.equal(r.text, 'raw!');
  });
});

describe('job runner', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('runs an allowed command and captures output', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'node', args: ['-e', 'console.log("hi"); console.error("oops")'] } });
    assert.equal(r.status, 201);
    const job = await waitForJob(s, r.json.id);
    assert.equal(job.status, 'done');
    assert.equal(job.exitCode, 0);
    assert.match(outputText(job), /hi/);
    assert.ok(job.output.some((o) => o.stream === 'stderr' && o.text.includes('oops')));
  });

  test('jobs receive the suite rules so app runners can apply them', async () => {
    const r = await s.request('POST', '/api/jobs', {
      body: { cmd: 'node', args: ['-e', 'console.log(process.env.LUCIANOS_ROOT + "|" + process.env.LUCIANOS_ALLOWED_COMMANDS)'] }
    });
    const job = await waitForJob(s, r.json.id);
    assert.equal(outputText(job).trim(), `${s.root.startsWith('/') ? fs.realpathSync(s.root) : s.root}|node,echo,ls,swipl`);
  });

  test('refuses commands not in the allowlist, and paths as commands', async () => {
    for (const cmd of ['rm', 'bash', '/bin/sh', '../node']) {
      const r = await s.request('POST', '/api/jobs', { body: { cmd, args: [] } });
      assert.ok([400, 403].includes(r.status), cmd);
    }
  });

  test('arguments are not run through a shell', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'echo', args: ['$(whoami); ls'] } });
    const job = await waitForJob(s, r.json.id);
    assert.equal(outputText(job).trim(), '$(whoami); ls');
  });

  test('cwd must stay in the sandbox', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'ls', cwd: '..' } });
    assert.equal(r.status, 403);
  });

  test('non-zero exit is reported as failed', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'node', args: ['-e', 'process.exit(3)'] } });
    const job = await waitForJob(s, r.json.id);
    assert.equal(job.status, 'failed');
    assert.equal(job.exitCode, 3);
  });

  test('interrupt stops a running job', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'node', args: ['-e', 'setInterval(() => {}, 1000)'] } });
    await new Promise((res) => setTimeout(res, 300));
    await s.request('POST', `/api/jobs/${r.json.id}/cancel`);
    const job = await waitForJob(s, r.json.id);
    assert.equal(job.status, 'cancelled');
  });

  test('stdin input reaches the program', async () => {
    const r = await s.request('POST', '/api/jobs', {
      body: { cmd: 'node', stdin: true, args: ['-e', 'process.stdin.once("data", d => { console.log("got " + d.toString().trim()); process.exit(0); })'] }
    });
    await new Promise((res) => setTimeout(res, 300));
    await s.request('POST', `/api/jobs/${r.json.id}/input`, { body: { text: 'ping\n' } });
    const job = await waitForJob(s, r.json.id);
    assert.match(outputText(job), /got ping/);
  });

  test('temp folder exists during the job and is deleted after', async () => {
    const r = await s.request('POST', '/api/jobs', {
      body: { cmd: 'node', tempDir: true, args: ['-e', 'const fs=require("fs");fs.writeFileSync(process.env.LUCIANOS_TMP+"/t.txt","x");console.log(process.env.LUCIANOS_TMP)'] }
    });
    const job = await waitForJob(s, r.json.id);
    const tmp = outputText(job).trim();
    assert.ok(tmp.includes('lucianos-job-'));
    assert.equal(fs.existsSync(tmp), false);
    assert.equal(job.tempDirDeleted, true);
  });

  test('concurrency limit queues extra jobs', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await s.request('POST', '/api/jobs', { body: { cmd: 'node', args: ['-e', 'setTimeout(() => {}, 400)'] } });
      ids.push(r.json.id);
    }
    const list = (await s.request('GET', '/api/jobs')).json.jobs.filter((j) => ids.includes(j.id));
    assert.ok(list.some((j) => j.status === 'queued'));
    for (const id of ids) assert.equal((await waitForJob(s, id)).status, 'done');
  });

  test('stream replays output and ends', async () => {
    const r = await s.request('POST', '/api/jobs', { body: { cmd: 'echo', args: ['streamed'] } });
    await waitForJob(s, r.json.id);
    const res = await s.request('GET', `/api/jobs/${r.json.id}/stream`, { raw: true, headers: { 'X-LucianOS': '' } });
    const text = await res.text();
    assert.match(text, /event: output/);
    assert.match(text, /streamed/);
    assert.match(text, /event: end/);
  });
});

describe('prolog bridge', () => {
  test('builds a non-interactive swipl command', () => {
    const spec = prologJobSpec({ goal: "texttobr(u,\"file.txt\",u,u).", consult: ["text_to_breasonings.pl"], cwd: 'T2B' }, { swiplStackLimit: '54G' });
    assert.equal(spec.cmd, 'swipl');
    assert.deepEqual(spec.args, ['--stack-limit=54G', '-g', "consult(['text_to_breasonings.pl']), (texttobr(u,\"file.txt\",u,u))", '-t', 'halt']);
  });
  test('quotes atoms safely', () => {
    assert.equal(quoteAtom("it's"), "'it\\'s'");
  });
  test('rejects odd stack limits', () => {
    assert.throws(() => prologJobSpec({ goal: 'true', stackLimit: '1G; rm' }, { swiplStackLimit: '1G' }));
  });
});

describe('state store and events', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('state round-trips and rejects bad keys', async () => {
    await s.request('PUT', '/api/state/iedit-windows', { body: { value: { open: ['a.txt'] } } });
    const r = await s.request('GET', '/api/state/iedit-windows');
    assert.deepEqual(r.json.value, { open: ['a.txt'] });
    const bad = await s.request('GET', '/api/state/..%2Fsecret');
    assert.ok([400, 404].includes(bad.status));
  });

  test('events reach subscribers; apps can only publish app.* events', async () => {
    const res = await fetch(`${s.url}/api/events?types=app.`);
    const reader = res.body.getReader();
    await new Promise((r) => setTimeout(r, 100));
    let r = await s.request('POST', '/api/events', { body: { type: 'job.finished', data: {} } });
    assert.equal(r.status, 400);
    r = await s.request('POST', '/api/events', { body: { type: 'app.idea', data: { text: 'hi' } } });
    assert.equal(r.status, 200);
    let got = '';
    while (!got.includes('app.idea')) got += new TextDecoder().decode((await reader.read()).value);
    assert.match(got, /"text":"hi"/);
    await reader.cancel();
  });
});

describe('remote mode password', () => {
  let s;
  before(async () => { s = await startServer({ mode: 'remote', passwordHash: hashPassword('correct horse') }); });
  after(() => s.close());

  test('hash verifies only the right password', () => {
    const h = hashPassword('abcdefgh');
    assert.equal(verifyPassword('abcdefgh', h), true);
    assert.equal(verifyPassword('abcdefgx', h), false);
  });

  test('API and pages need login; login page does not', async () => {
    assert.equal((await s.request('GET', '/api/info')).status, 401);
    const page = await s.request('GET', '/', { raw: true });
    assert.equal(page.status, 302);
    assert.equal((await s.request('GET', '/login.html', { raw: true })).status, 200);
  });

  test('wrong password refused, right one gives a session cookie', async () => {
    assert.equal((await s.request('POST', '/api/login', { body: { password: 'nope' } })).status, 401);
    const r = await s.request('POST', '/api/login', { body: { password: 'correct horse' } });
    assert.equal(r.status, 200);
    assert.equal((await s.request('GET', '/api/info')).status, 200);
    await s.request('POST', '/api/logout', { body: {} });
    assert.equal((await s.request('GET', '/api/info')).status, 401);
  });

  test('too many failures are rate-limited', async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await s.request('POST', '/api/login', { body: { password: 'bad' } });
    assert.equal(last.status, 429);
  });

  test('remote mode refuses to start without a password', async () => {
    await assert.rejects(startServer({ mode: 'remote', passwordHash: null }), /set-password/);
  });
});

test('recent files: newest first, within the days asked, skipping hidden folders', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { startServer } = await import('./helpers.js');
  const s = await startServer();
  try {
    fs.mkdirSync(path.join(s.root, 'a/b'), { recursive: true });
    fs.mkdirSync(path.join(s.root, '.git'));
    fs.writeFileSync(path.join(s.root, 'a/old.txt'), 'x');
    const old = (Date.now() - 10 * 86400000) / 1000;
    fs.utimesSync(path.join(s.root, 'a/old.txt'), old, old);
    fs.writeFileSync(path.join(s.root, 'a/b/one.txt'), 'x');
    fs.writeFileSync(path.join(s.root, '.git/HEAD'), 'x');
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(path.join(s.root, 'a/two.txt'), 'x');
    const r = await s.request('GET', '/api/files/recent?days=3');
    assert.deepEqual(r.json.results.map((e) => e.path), ['a/two.txt', 'a/b/one.txt']);
    const escape = await s.request('GET', '/api/files/recent?path=../');
    assert.equal(escape.status, 403);
  } finally {
    await s.close();
  }
});
