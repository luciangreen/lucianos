// Wires the services together and returns an http.Server (not yet listening).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth, guardApi } from './auth.js';
import { ClaudeBridge, claudeRoutes } from './claude.js';
import { githubRoutes } from './github.js';
import { EventBus, eventRoutes } from './events.js';
import { fileRoutes } from './files.js';
import { HttpError, readJson, sendJson, sendText } from './http-util.js';
import { JobRunner, jobRoutes } from './jobs.js';
import { muxRoutes } from './mux.js';
import { prologRoutes } from './prolog.js';
import { Router } from './router.js';
import { Sandbox } from './sandbox.js';
import { StateStore, stateRoutes } from './state.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '..', 'public');
const APPS_DIR = path.resolve(HERE, '..', 'apps');
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};
// Requests that browsers make without custom headers (EventSource, <img>, <audio>). All are read-only GETs.
const STREAM_PATHS = [/^\/api\/mux$/, /^\/api\/events$/, /^\/api\/jobs\/[^/]+\/stream$/, /^\/api\/files\/watch$/, /^\/api\/files\/raw$/];
const OPEN_PATHS = ['/login.html', '/login.js', '/api/login', '/api/session', '/shared/style.css'];

export function createApp(cfg) {
  const bus = new EventBus();
  const sandbox = new Sandbox(cfg.root);
  const auth = new Auth(cfg);
  const state = new StateStore(cfg.dataDir);
  const jobs = new JobRunner({ cfg, sandbox, bus });
  const router = new Router();

  router.get('/api/session', (req, res) => {
    sendJson(res, 200, { mode: cfg.mode, loggedIn: auth.isLoggedIn(req), passwordRequired: auth.required });
  });
  router.post('/api/login', async (req, res) => {
    if (!auth.required) return sendJson(res, 200, { ok: true });
    const { password } = await readJson(req);
    auth.login(req, res, password);
    sendJson(res, 200, { ok: true });
  });
  router.post('/api/logout', (req, res) => {
    auth.logout(req, res);
    sendJson(res, 200, { ok: true });
  });
  router.get('/api/info', (req, res) => {
    sendJson(res, 200, {
      mode: cfg.mode,
      rootName: path.basename(cfg.root),
      allowedCommands: cfg.allowedCommands,
      maxConcurrentJobs: cfg.maxConcurrentJobs,
      swiplStackLimit: cfg.swiplStackLimit,
      appsDir: APPS_DIR,
      apps: fs.existsSync(APPS_DIR)
        ? fs.readdirSync(APPS_DIR).filter((n) => fs.existsSync(path.join(APPS_DIR, n, 'index.html')))
        : []
    });
  });

  fileRoutes(router, { sandbox, bus, cfg });
  jobRoutes(router, jobs);
  prologRoutes(router, jobs, cfg);
  stateRoutes(router, state, bus);
  eventRoutes(router, bus);
  const claude = new ClaudeBridge(cfg, bus);
  claudeRoutes(router, claude);
  githubRoutes(router, cfg);
  muxRoutes(router);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    try {
      const isApi = pathname.startsWith('/api/');
      if (isApi) guardApi(req, cfg, { isStream: req.method === 'GET' && STREAM_PATHS.some((r) => r.test(pathname)) });
      else if (cfg.mode === 'local') guardApi(req, cfg, { isStream: true }); // host check for pages too

      if (!OPEN_PATHS.includes(pathname) && !auth.isLoggedIn(req)) {
        if (isApi) throw new HttpError(401, 'Log in first');
        res.writeHead(302, { Location: '/login.html' });
        return res.end();
      }

      if (isApi) {
        const found = router.match(req.method, pathname);
        if (!found) throw new HttpError(404, 'No such API route');
        if (found.methodNotAllowed) throw new HttpError(405, 'Method not allowed');
        await found.handler(req, res, { params: found.params, query: url.searchParams });
        return;
      }
      serveStatic(req, res, pathname);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      if (err.code === 'EACCES' || err.code === 'EPERM') return sendJson(res, 403, { error: 'Permission denied by the operating system' });
      // something was moved or deleted while we worked on it (in the Finder, say)
      if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'Not found: it was moved, renamed or deleted while LucianOS was using it' });
      console.error(err);
      sendJson(res, 500, { error: 'Server error: ' + err.message });
    }
  });

  return { server, bus, jobs, state, sandbox, auth, claude };
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let base = PUBLIC_DIR;
  let rel = pathname;
  if (pathname.startsWith('/apps/')) {
    base = APPS_DIR;
    rel = pathname.slice('/apps'.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(base, '.' + decodeURIComponent(rel));
  if (!abs.startsWith(base + path.sep)) throw new HttpError(403, 'Forbidden');
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return sendText(res, 404, 'Not found');
  }
  const type = STATIC_TYPES[path.extname(abs)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    // Apps may be shown inside LucianOS desktop windows (same origin only).
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'"
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}
