// Public GitHub statistics for rewards (no token: public data only).
//   GET /api/github/stats?user=luciangreen -> { repos, stars, forks, pushedThisWeek, top: [...] }
import { HttpError, sendJson } from './http-util.js';

export function githubRoutes(router, cfg) {
  const base = cfg.githubApiUrl ?? 'https://api.github.com';
  let cache = { at: 0, user: '', data: null };
  router.get('/api/github/stats', async (req, res, { query }) => {
    const user = query.get('user') ?? '';
    if (!/^[A-Za-z0-9-]{1,39}$/.test(user)) throw new HttpError(400, 'Give a GitHub user name');
    if (cache.user === user && Date.now() - cache.at < 10 * 60 * 1000) return sendJson(res, 200, cache.data);
    let repos = [];
    try {
      for (let page = 1; page <= 3; page++) {
        const r = await fetch(`${base}/users/${user}/repos?per_page=100&sort=pushed&page=${page}`, {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'LucianOS' },
          signal: AbortSignal.timeout(15000)
        });
        if (!r.ok) throw new Error(`GitHub said ${r.status}`);
        const batch = await r.json();
        repos = repos.concat(batch);
        if (batch.length < 100) break;
      }
    } catch (err) {
      throw new HttpError(502, `Could not get GitHub statistics: ${err.message}`);
    }
    const week = Date.now() - 7 * 86400000;
    const data = {
      user,
      repos: repos.length,
      stars: repos.reduce((n, r) => n + (r.stargazers_count ?? 0), 0),
      forks: repos.reduce((n, r) => n + (r.forks_count ?? 0), 0),
      pushedThisWeek: repos.filter((r) => Date.parse(r.pushed_at) > week).length,
      top: repos.slice().sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)).slice(0, 5).map((r) => ({ name: r.name, stars: r.stargazers_count ?? 0, url: r.html_url })),
      recent: repos.filter((r) => Date.parse(r.pushed_at) > week).slice(0, 10).map((r) => r.name)
    };
    cache = { at: Date.now(), user, data };
    sendJson(res, 200, data);
  });
}
