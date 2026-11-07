// GitHub statistics for the terminal's rewards, against a stand-in GitHub API.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { startServer } from './helpers.js';

let gh;
let s;
let calls = 0;
before(async () => {
  const now = Date.now();
  gh = http.createServer((req, res) => {
    calls++;
    const repos = [
      { name: 'mnns', description: 'Optimises Prolog', language: 'Prolog', stargazers_count: 5, forks_count: 1, html_url: 'https://github.com/x/mnns', pushed_at: new Date(now - 3600e3).toISOString() },
      { name: 'old', description: null, language: null, stargazers_count: 9, forks_count: 2, html_url: 'https://github.com/x/old', pushed_at: new Date(now - 40 * 86400e3).toISOString() },
      { name: 'fastos', description: 'Runs repos fast', language: 'JavaScript', stargazers_count: 0, forks_count: 0, html_url: 'https://github.com/x/fastos', pushed_at: new Date(now - 60e3).toISOString() }
    ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/users/x/') ? repos : []));
  });
  await new Promise((r) => gh.listen(0, '127.0.0.1', r));
  s = await startServer({ githubApiUrl: `http://127.0.0.1:${gh.address().port}` });
});
after(async () => { await s.close(); gh.close(); });

test('stats total stars and forks, list this week’s pushes newest first, and cache', async () => {
  const r = await s.request('GET', '/api/github/stats?user=x');
  assert.equal(r.status, 200);
  assert.equal(r.json.repos, 3);
  assert.equal(r.json.stars, 14);
  assert.equal(r.json.forks, 3);
  assert.equal(r.json.pushedThisWeek, 2);
  assert.deepEqual(r.json.recent.map((x) => x.name), ['fastos', 'mnns']);
  assert.equal(r.json.top[0].name, 'old');
  assert.equal(r.json.recent[1].description, 'Optimises Prolog');
  const n = calls;
  await s.request('GET', '/api/github/stats?user=x');
  assert.equal(calls, n);
  assert.equal((await s.request('GET', '/api/github/stats?user=../etc')).status, 400);
});
