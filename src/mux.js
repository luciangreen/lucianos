// One live connection per browser tab, carrying many streams.
// Browsers allow only six connections per site over plain HTTP; each folder watch, job
// output and event feed is a long-lived stream, so a desktop with a few windows would
// otherwise stall every other request. The page opens GET /api/mux once, then asks for
// streams with POST /api/mux/:id/open {sid, url}; frames come back tagged with sid.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { HttpError, openSse, readJson, sendJson } from './http-util.js';

const STREAMS = [/^\/api\/events$/, /^\/api\/jobs\/[^/]+\/stream$/, /^\/api\/files\/watch$/];
const MAX_STREAMS = 200;

// A response stand-in that turns what a stream route writes into tagged frames.
class FrameSink extends EventEmitter {
  constructor(onFrame, onEnd) {
    super();
    this.headersSent = false;
    this.buffer = '';
    this.onFrame = onFrame;
    this.onEnd = onEnd;
    this.ended = false;
  }
  writeHead(status) {
    this.headersSent = true;
    this.status = status;
    return this;
  }
  setHeader() {}
  write(chunk) {
    this.buffer += String(chunk);
    let i;
    while ((i = this.buffer.indexOf('\n\n')) >= 0) {
      const frame = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      let event = 'message';
      const data = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data.push(line.slice(6));
      }
      if (data.length) this.onFrame(event, data.join('\n'));
    }
    return true;
  }
  end(chunk) {
    if (this.ended) return;
    if (chunk) {
      // a JSON error body from a route that refused the stream
      if (this.status && this.status >= 400) {
        let message = String(chunk);
        try { message = JSON.parse(chunk).error ?? message; } catch {}
        this.onFrame('error', JSON.stringify({ message }));
      } else this.write(chunk);
    }
    this.ended = true;
    this.onEnd();
  }
}

export function muxRoutes(router) {
  const conns = new Map();

  router.get('/api/mux', (req, res) => {
    const id = crypto.randomBytes(12).toString('hex');
    const send = openSse(req, res);
    const conn = { send, streams: new Map(), req };
    conns.set(id, conn);
    send('hello', { id });
    req.on('close', () => {
      for (const s of conn.streams.values()) s.close();
      conns.delete(id);
    });
  });

  const connFor = (id) => {
    const c = conns.get(id);
    if (!c) throw new HttpError(404, 'That live connection has closed');
    return c;
  };

  router.post('/api/mux/:id/open', async (req, res, { params }) => {
    const conn = connFor(params.id);
    const { sid, url } = await readJson(req);
    if (typeof sid !== 'string' || !/^[\w.-]{1,40}$/.test(sid)) throw new HttpError(400, 'sid is required');
    if (typeof url !== 'string') throw new HttpError(400, 'url is required');
    const u = new URL(url, 'http://localhost');
    if (!STREAMS.some((r) => r.test(u.pathname))) throw new HttpError(400, 'Not a stream');
    if (conn.streams.size >= MAX_STREAMS) throw new HttpError(429, 'Too many streams');
    if (conn.streams.has(sid)) throw new HttpError(409, 'sid in use');
    const found = router.match('GET', u.pathname);
    if (!found || found.methodNotAllowed) throw new HttpError(404, 'No such stream');

    const fakeReq = new EventEmitter();
    fakeReq.method = 'GET';
    fakeReq.url = u.pathname + u.search;
    fakeReq.headers = req.headers;
    fakeReq.socket = req.socket;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      fakeReq.emit('close'); // stops the route's watchers, listeners and keep-alive timer
    };
    const done = () => {
      close();
      if (!conn.streams.has(sid)) return;
      conn.streams.delete(sid);
      conn.send('x', { sid, end: true });
    };
    const sink = new FrameSink((event, data) => conn.send('x', { sid, event, data }), done);
    conn.streams.set(sid, { close, sink });
    sendJson(res, 200, { ok: true });
    try {
      await found.handler(fakeReq, sink, { params: found.params, query: u.searchParams });
    } catch (err) {
      conn.send('x', { sid, event: 'error', data: JSON.stringify({ message: err.message }) });
      done();
    }
  });

  router.post('/api/mux/:id/close', async (req, res, { params }) => {
    const conn = connFor(params.id);
    const { sid } = await readJson(req);
    const s = conn.streams.get(sid);
    if (s) {
      conn.streams.delete(sid);
      s.close();
    }
    sendJson(res, 200, { ok: true });
  });

  return { count: () => conns.size };
}
