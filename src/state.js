// Per-suite JSON state: open windows, unsaved buffers, recent folders, preferences.
// Each key is one file in <dataDir>/state/<key>.json, written atomically.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, readJson, sendJson } from './http-util.js';

const KEY = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;

export class StateStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'state');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  file(key) {
    if (!KEY.test(key) || key.includes('..')) throw new HttpError(400, 'Invalid state key');
    return path.join(this.dir, `${key}.json`);
  }

  get(key) {
    try {
      return JSON.parse(fs.readFileSync(this.file(key), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  set(key, value) {
    const target = this.file(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, target);
  }

  delete(key) {
    fs.rmSync(this.file(key), { force: true });
  }

  keys() {
    return fs.readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  }
}

export function stateRoutes(router, store, bus) {
  router.get('/api/state', (req, res) => sendJson(res, 200, { keys: store.keys() }));
  router.get('/api/state/:key', (req, res, { params }) => {
    sendJson(res, 200, { key: params.key, value: store.get(params.key) });
  });
  router.put('/api/state/:key', async (req, res, { params }) => {
    const { value } = await readJson(req);
    store.set(params.key, value ?? null);
    bus.publish('state.saved', { key: params.key });
    sendJson(res, 200, { ok: true });
  });
  router.post('/api/state/:key/delete', (req, res, { params }) => {
    store.delete(params.key);
    sendJson(res, 200, { ok: true });
  });
}
