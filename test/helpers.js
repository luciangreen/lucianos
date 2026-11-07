import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { finalise } from '../src/config.js';

export async function startServer(overrides = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lucianos-test-'));
  const root = path.join(base, 'root');
  fs.mkdirSync(root);
  const cfg = finalise({
    mode: 'local',
    port: 0,
    host: null,
    root,
    dataDir: path.join(base, 'data'),
    passwordHash: null,
    secureCookie: false,
    sessionDays: 1,
    maxConcurrentJobs: 2,
    jobOutputLimit: 100000,
    allowedCommands: ['node', 'echo', 'ls', 'swipl'],
    swiplStackLimit: '1G',
    ...overrides
  });
  const app = createApp(cfg);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const port = app.server.address().port;
  const url = `http://127.0.0.1:${port}`;
  let cookie = '';

  async function request(method, p, { body, headers = {}, raw = false } = {}) {
    const h = { 'X-LucianOS': '1', ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      h['Content-Type'] = typeof body === 'string' ? 'text/plain' : 'application/json';
    }
    const res = await fetch(url + p, { method, headers: h, body: payload, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }

  return {
    cfg, app, url, root, base, request,
    close: () => new Promise((r) => {
      app.server.closeAllConnections?.();
      app.server.close(() => { fs.rmSync(base, { recursive: true, force: true }); r(); });
    })
  };
}

export async function waitForJob(s, id, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await s.request('GET', `/api/jobs/${id}`);
    if (json.endedAt) return json;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
}

export const outputText = (job) => job.output.map((o) => o.text).join('');
