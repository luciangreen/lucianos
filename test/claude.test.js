import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startServer } from './helpers.js';

// A stand-in for the Anthropic Messages API and the GitHub API.
let fake, fakeUrl, seen = [];
before(async () => {
  fake = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url.startsWith('/v1/messages')) {
      seen.push({ headers: req.headers, body: JSON.parse(body) });
      if (req.headers['x-api-key'] === 'sk-ant-badkey123456') {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'invalid x-api-key' } }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ content: [{ type: 'text', text: 'Here is a gap-fill.' }], usage: { input_tokens: 120, output_tokens: 30 } }));
    }
    if (req.url.startsWith('/users/luciangreen/repos')) {
      const now = new Date().toISOString();
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([
        { name: 'mnns', stargazers_count: 5, forks_count: 1, pushed_at: now, html_url: 'https://github.com/luciangreen/mnns' },
        { name: 'old', stargazers_count: 9, forks_count: 2, pushed_at: '2020-01-01T00:00:00Z', html_url: 'https://github.com/luciangreen/old' }
      ]));
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}`;
});
after(() => fake.close());

describe('Claude bridge', () => {
  let s;
  before(async () => { s = await startServer({ claudeApiUrl: `${fakeUrl}/v1/messages`, githubApiUrl: fakeUrl }); });
  after(() => s.close());

  test('is off until a key is added', async () => {
    const st = (await s.request('GET', '/api/claude')).json;
    assert.equal(st.enabled, false);
    const r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'hi', confirmed: true } });
    assert.equal(r.status, 409);
    assert.equal(seen.length, 0);
  });

  test('rejects things that are not keys, and never returns the key', async () => {
    assert.equal((await s.request('PUT', '/api/claude/settings', { body: { apiKey: 'hello' } })).status, 400);
    const r = await s.request('PUT', '/api/claude/settings', { body: { apiKey: 'sk-ant-goodkey123456', monthlyTokenCap: 3000 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.enabled, true);
    assert.equal(r.json.keySaved, true);
    assert.doesNotMatch(JSON.stringify(r.json), /goodkey/);
    assert.equal((fs.statSync(path.join(s.cfg.dataDir, 'claude.json')).mode & 0o777).toString(8), '600');
  });

  test('asks before sending, then sends with the key and model', async () => {
    let r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'Fill the gaps', system: 'Be brief' } });
    assert.equal(r.status, 428);
    r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'Fill the gaps', system: 'Be brief', confirmed: true } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.text, 'Here is a gap-fill.');
    assert.equal(r.json.used, 150);
    const sent = seen.at(-1);
    assert.equal(sent.headers['x-api-key'], 'sk-ant-goodkey123456');
    assert.equal(sent.headers['anthropic-version'], '2023-06-01');
    assert.equal(sent.body.model, 'claude-sonnet-5-5');
    assert.equal(sent.body.system, 'Be brief');
    assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'Fill the gaps' }]);
  });

  test('stops at the monthly token limit', async () => {
    const r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'x'.repeat(9000), confirmed: true, maxTokens: 500 } });
    assert.equal(r.status, 402);
    assert.match(r.json.error, /monthly limit/);
  });

  test('a this-session-only key is not saved to disk', async () => {
    await s.request('PUT', '/api/claude/settings', { body: { apiKey: 'sk-ant-sessionkey9999', temporary: true, monthlyTokenCap: 100000, confirmBeforeSend: false } });
    const saved = fs.readFileSync(path.join(s.cfg.dataDir, 'claude.json'), 'utf8');
    assert.doesNotMatch(saved, /sk-ant/);
    const st = (await s.request('GET', '/api/claude')).json;
    assert.equal(st.temporary, true);
    const r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'no confirm needed now' } });
    assert.equal(r.status, 200);
    assert.equal(seen.at(-1).headers['x-api-key'], 'sk-ant-sessionkey9999');
  });

  test('passes on a wrong key as a clear error, and forget turns it off', async () => {
    await s.request('PUT', '/api/claude/settings', { body: { apiKey: 'sk-ant-badkey123456' } });
    const r = await s.request('POST', '/api/claude/ask', { body: { prompt: 'x', confirmed: true } });
    assert.equal(r.status, 401);
    assert.match(r.json.error, /invalid x-api-key/);
    const f = await s.request('PUT', '/api/claude/settings', { body: { forget: true } });
    assert.equal(f.json.enabled, false);
  });

  test('GitHub statistics for rewards', async () => {
    const r = await s.request('GET', '/api/github/stats?user=luciangreen');
    assert.equal(r.status, 200);
    assert.equal(r.json.repos, 2);
    assert.equal(r.json.stars, 14);
    assert.equal(r.json.pushedThisWeek, 1);
    assert.deepEqual(r.json.top.map((t) => t.name), ['old', 'mnns']);
    assert.equal((await s.request('GET', '/api/github/stats?user=bad/user')).status, 400);
  });
});
