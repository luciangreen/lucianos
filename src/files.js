// File API: list, read, write, rename/move, mkdir, trash, search, raw download, watch.
// Every path goes through the sandbox. Deletes move to <dataDir>/trash, never rm.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError, openSse, readBody, readJson, sendJson } from './http-util.js';

const MAX_READ = 10 * 1024 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.Trash', 'Library']);
const MIME = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.pl': 'text/plain', '.js': 'text/javascript',
  '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.mid': 'audio/midi', '.midi': 'audio/midi', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf'
};

function entryInfo(sandbox, abs, stat) {
  return {
    name: path.basename(abs),
    path: sandbox.relative(abs),
    type: stat.isDirectory() ? 'dir' : 'file',
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
    birthtimeMs: Math.floor(stat.birthtimeMs)
  };
}

async function statOr404(abs) {
  try {
    return await fsp.stat(abs);
  } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(404, 'Not found');
    throw err;
  }
}

// Copies a file or folder, keeping modification times. Links are copied as links, so a
// copy never reaches outside the suite folder. (Not fs.cp, which is experimental in some
// Node versions and behaves differently between them.)
async function copyTree(from, to) {
  const st = await fsp.lstat(from);
  if (st.isSymbolicLink()) {
    await fsp.symlink(await fsp.readlink(from), to);
  } else if (st.isDirectory()) {
    await fsp.mkdir(to);
    for (const name of await fsp.readdir(from)) await copyTree(path.join(from, name), path.join(to, name));
  } else {
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
  }
  if (!st.isSymbolicLink()) await fsp.utimes(to, st.atime, st.mtime).catch(() => {});
}

async function moveAcrossDevices(from, to) {
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await copyTree(from, to);
    await fsp.rm(from, { recursive: true, force: true });
  }
}

export function fileRoutes(router, { sandbox, bus, cfg }) {
  const trashDir = path.join(cfg.dataDir, 'trash');
  fs.mkdirSync(trashDir, { recursive: true });

  router.get('/api/files/list', async (req, res, { query }) => {
    const abs = sandbox.resolve(query.get('path') ?? '');
    const stat = await statOr404(abs);
    if (!stat.isDirectory()) throw new HttpError(400, 'Not a folder');
    const showHidden = query.get('hidden') === '1';
    const names = await fsp.readdir(abs);
    const entries = [];
    for (const name of names) {
      if (!showHidden && name.startsWith('.')) continue;
      try {
        const child = path.join(abs, name);
        entries.push(entryInfo(sandbox, child, await fsp.stat(child)));
      } catch {
        // broken link or permission problem: skip it
      }
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    sendJson(res, 200, { path: sandbox.relative(abs), entries });
  });

  router.get('/api/files/read', async (req, res, { query }) => {
    const abs = sandbox.resolve(query.get('path'));
    const stat = await statOr404(abs);
    if (stat.isDirectory()) throw new HttpError(400, 'That is a folder');
    if (stat.size > MAX_READ) throw new HttpError(413, 'File is larger than 10 MB; use /api/files/raw');
    const content = await fsp.readFile(abs, 'utf8');
    sendJson(res, 200, { ...entryInfo(sandbox, abs, stat), content });
  });

  router.get('/api/files/raw', async (req, res, { query }) => {
    const abs = sandbox.resolve(query.get('path'));
    const stat = await statOr404(abs);
    if (stat.isDirectory()) throw new HttpError(400, 'That is a folder');
    const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(abs).pipe(res);
  });

  // PUT body = file text. Header X-Base-Mtime (from your last read) makes the save
  // fail with 409 if someone changed the file since, unless ?force=1.
  router.put('/api/files/write', async (req, res, { query }) => {
    const abs = sandbox.resolve(query.get('path'));
    const content = await readBody(req);
    const base = req.headers['x-base-mtime'];
    let existing = null;
    try {
      existing = await fsp.stat(abs);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (existing?.isDirectory()) throw new HttpError(400, 'That is a folder');
    if (base && existing && query.get('force') !== '1' && Math.floor(existing.mtimeMs) !== Number(base)) {
      throw new HttpError(409, 'The file changed on disk since you opened it');
    }
    if (query.get('mkdirs') === '1') await fsp.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.lucianos-${process.pid}-${Date.now()}.tmp`;
    await fsp.writeFile(tmp, content, 'utf8');
    await fsp.rename(tmp, abs);
    const stat = await fsp.stat(abs);
    const info = entryInfo(sandbox, abs, stat);
    bus.publish('file.saved', { path: info.path });
    sendJson(res, 200, info);
  });

  router.post('/api/files/mkdir', async (req, res) => {
    const { path: p } = await readJson(req);
    const abs = sandbox.resolve(p);
    await fsp.mkdir(abs, { recursive: true });
    bus.publish('file.created', { path: sandbox.relative(abs) });
    sendJson(res, 200, entryInfo(sandbox, abs, await fsp.stat(abs)));
  });

  // Rename and move are the same operation. Refuses to overwrite.
  router.post('/api/files/move', async (req, res) => {
    const { from, to } = await readJson(req);
    const src = sandbox.resolve(from);
    const dest = sandbox.resolve(to);
    if (src === sandbox.root) throw new HttpError(400, 'Cannot move the suite folder itself');
    await statOr404(src);
    if (fs.existsSync(dest)) throw new HttpError(409, 'Something with that name already exists');
    if (dest.startsWith(src + path.sep)) throw new HttpError(400, 'Cannot move a folder inside itself');
    await moveAcrossDevices(src, dest);
    const info = entryInfo(sandbox, dest, await fsp.stat(dest));
    bus.publish('file.moved', { from: sandbox.relative(src), to: info.path });
    sendJson(res, 200, info);
  });

  // Copy a file or folder. Refuses to overwrite.
  router.post('/api/files/copy', async (req, res) => {
    const { from, to } = await readJson(req);
    const src = sandbox.resolve(from);
    const dest = sandbox.resolve(to);
    await statOr404(src);
    if (fs.existsSync(dest)) throw new HttpError(409, 'Something with that name already exists');
    if (dest.startsWith(src + path.sep)) throw new HttpError(400, 'Cannot copy a folder inside itself');
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await copyTree(src, dest);
    const info = entryInfo(sandbox, dest, await fsp.stat(dest));
    bus.publish('file.created', { path: info.path });
    sendJson(res, 200, info);
  });

  router.post('/api/files/trash', async (req, res) => {
    const { path: p } = await readJson(req);
    const src = sandbox.resolve(p);
    if (src === sandbox.root) throw new HttpError(400, 'Cannot trash the suite folder itself');
    await statOr404(src);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(trashDir, `${stamp}__${path.basename(src)}`);
    await moveAcrossDevices(src, dest);
    fs.writeFileSync(`${dest}.origin`, sandbox.relative(src));
    bus.publish('file.trashed', { path: sandbox.relative(src) });
    sendJson(res, 200, { ok: true, trashedAs: path.basename(dest) });
  });

  // GET /api/files/recent?path=folder&days=3&limit=200 — files changed lately, newest first.
  router.get('/api/files/recent', async (req, res, { query }) => {
    const start = sandbox.resolve(query.get('path') ?? '');
    const days = Math.min(Math.max(Number(query.get('days')) || 3, 0.01), 365);
    const limit = Math.min(Number(query.get('limit')) || 200, 2000);
    const since = Date.now() - days * 86400000;
    const found = [];
    let visited = 0;
    const stack = [[start, 0]];
    while (stack.length && visited < 40000) {
      const [dir, depth] = stack.pop();
      let names;
      try {
        names = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of names) {
        if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
        const abs = path.join(dir, d.name);
        visited++;
        if (d.isDirectory()) {
          if (depth < 8) stack.push([abs, depth + 1]);
          continue;
        }
        if (!d.isFile()) continue;
        try {
          const stat = await fsp.stat(abs);
          if (stat.mtimeMs >= since) found.push(entryInfo(sandbox, abs, stat));
        } catch {}
      }
    }
    found.sort((a, b) => b.mtimeMs - a.mtimeMs);
    sendJson(res, 200, { results: found.slice(0, limit), truncated: visited >= 40000 });
  });

  // GET /api/files/search?q=word&path=folder&contents=1&regex=0&case=0
  router.get('/api/files/search', async (req, res, { query }) => {
    const q = query.get('q') ?? '';
    if (!q) throw new HttpError(400, 'q is required');
    const start = sandbox.resolve(query.get('path') ?? '');
    const contents = query.get('contents') === '1';
    const flags = query.get('case') === '1' ? '' : 'i';
    let re;
    try {
      re = query.get('regex') === '1' ? new RegExp(q, flags) : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch {
      throw new HttpError(400, 'Invalid regular expression');
    }
    const results = [];
    let visited = 0;
    const limit = Math.min(Number(query.get('limit')) || 200, 1000);
    const stack = [start];
    while (stack.length && results.length < limit && visited < 50000) {
      const dir = stack.pop();
      let names;
      try {
        names = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of names) {
        if (results.length >= limit) break;
        if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
        const abs = path.join(dir, d.name);
        visited++;
        if (d.isDirectory()) {
          stack.push(abs);
          if (re.test(d.name)) results.push({ path: sandbox.relative(abs), type: 'dir', match: 'name' });
          continue;
        }
        if (!d.isFile()) continue;
        if (re.test(d.name)) {
          results.push({ path: sandbox.relative(abs), type: 'file', match: 'name' });
          continue;
        }
        if (!contents) continue;
        try {
          const stat = await fsp.stat(abs);
          if (stat.size > 1024 * 1024) continue;
          const text = await fsp.readFile(abs, 'utf8');
          if (text.includes('\u0000')) continue; // binary
          const lines = text.split('\n');
          const i = lines.findIndex((l) => re.test(l));
          if (i >= 0) {
            results.push({ path: sandbox.relative(abs), type: 'file', match: 'contents', line: i + 1, text: lines[i].slice(0, 200) });
          }
        } catch {
          // unreadable: skip
        }
      }
    }
    sendJson(res, 200, { results, truncated: results.length >= limit });
  });

  // Live changes under a folder, as server-sent events.
  router.get('/api/files/watch', async (req, res, { query }) => {
    const abs = sandbox.resolve(query.get('path') ?? '');
    const stat = await statOr404(abs);
    if (!stat.isDirectory()) throw new HttpError(400, 'Not a folder');
    const send = openSse(req, res);
    let watcher;
    try {
      watcher = fs.watch(abs, { recursive: query.get('recursive') === '1' }, (kind, name) => {
        if (!name) return;
        send('change', { kind, path: sandbox.relative(path.join(abs, name.toString())) });
      });
    } catch (err) {
      send('error', { message: err.message });
      res.end();
      return;
    }
    req.on('close', () => watcher.close());
  });
}
