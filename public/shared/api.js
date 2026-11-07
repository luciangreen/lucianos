// Client library shared by every app in the suite.
// import { api } from '/shared/api.js';

async function call(method, url, body, headers = {}) {
  const opts = { method, headers: { 'X-LucianOS': '1', ...headers }, credentials: 'same-origin' };
  if (body !== undefined) {
    if (typeof body === 'string') {
      opts.body = body;
      opts.headers['Content-Type'] = 'text/plain; charset=utf-8';
    } else {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('Log in first');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();

// ---------------------------------------------------------------- live streams
// All live streams (folder watches, job output, events) share one connection per desktop:
// browsers allow only six connections per site over plain HTTP. App windows are
// same-origin frames, so they borrow the top page's hub.
function makeHub() {
  let id = null;
  let es = null;
  let seq = 0;
  const subs = new Map(); // sid -> { url, on(event, data), end(), resume }
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'X-LucianOS': '1', 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const openOne = (sid, s) =>
    post(`/api/mux/${id}/open`, { sid, url: s.url }).then(async (r) => {
      if (!r.ok) {
        const msg = (await r.json().catch(() => ({}))).error ?? r.statusText;
        s.on('error', JSON.stringify({ message: msg }));
        finish(sid);
      }
    }, () => {});
  const finish = (sid) => {
    const s = subs.get(sid);
    if (!s) return;
    subs.delete(sid);
    try { s.end(); } catch {}
  };
  function connect() {
    es = new EventSource('/api/mux');
    es.addEventListener('hello', (e) => {
      id = JSON.parse(e.data).id;
      for (const [sid, s] of subs) {
        if (s.opened && !s.resume) {
          // job output can't be resumed without repeating it
          s.on('error', JSON.stringify({ message: 'The connection to LucianOS was lost' }));
          finish(sid);
        } else {
          s.opened = true;
          openOne(sid, s);
        }
      }
    });
    es.addEventListener('x', (e) => {
      const m = JSON.parse(e.data);
      const s = subs.get(m.sid);
      if (!s) return;
      if (m.end) return finish(m.sid);
      try { s.on(m.event, m.data); } catch {}
    });
  }
  return {
    open(url, on, end, { resume = false } = {}) {
      if (!es) connect();
      const sid = `s${++seq}`;
      const s = { url, on, end, resume, opened: false };
      subs.set(sid, s);
      if (id) {
        s.opened = true;
        openOne(sid, s);
      }
      return () => {
        if (!subs.has(sid)) return;
        subs.delete(sid);
        if (id) post(`/api/mux/${id}/close`, { sid }).catch(() => {});
      };
    }
  };
}

function hub() {
  let top = null;
  try {
    if (window.top !== window && window.top.location.origin === location.origin) top = window.top;
  } catch {}
  const host = top ?? window;
  if (!host.__lucianosHub) host.__lucianosHub = makeHub();
  return host.__lucianosHub;
}

// An EventSource look-alike carried by the hub. Frames in a closed frame (iframe) stop with it.
function liveStream(url, { resume = false } = {}) {
  const handlers = new Map();
  let closed = false;
  const target = {
    onmessage: null,
    onerror: null,
    addEventListener(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    close() {
      closed = true;
      stop();
      removeEventListener('pagehide', target.close);
    }
  };
  const deliver = (event, data) => {
    if (closed) return;
    const e = { data, type: event };
    if (event === 'message') target.onmessage?.(e);
    if (event === 'error') target.onerror?.(e);
    for (const fn of handlers.get(event) ?? []) fn(e);
  };
  const stop = hub().open(url, deliver, () => {}, { resume });
  addEventListener('pagehide', target.close);
  return target;
}

export const api = {
  session: () => call('GET', '/api/session'),
  login: (password) => call('POST', '/api/login', { password }),
  logout: () => call('POST', '/api/logout', {}),
  info: () => call('GET', '/api/info'),

  files: {
    list: (path = '', hidden = false) => call('GET', `/api/files/list?${q({ path, hidden: hidden ? 1 : undefined })}`),
    read: (path) => call('GET', `/api/files/read?${q({ path })}`),
    rawUrl: (path) => `/api/files/raw?${q({ path })}`,
    // baseMtime: the mtimeMs from your last read; the save fails with status 409 if the file changed since.
    write: (path, content, { baseMtime, force, mkdirs } = {}) =>
      call('PUT', `/api/files/write?${q({ path, force: force ? 1 : undefined, mkdirs: mkdirs ? 1 : undefined })}`, content,
        baseMtime ? { 'X-Base-Mtime': String(baseMtime) } : {}),
    mkdir: (path) => call('POST', '/api/files/mkdir', { path }),
    move: (from, to) => call('POST', '/api/files/move', { from, to }),
    copy: (from, to) => call('POST', '/api/files/copy', { from, to }),
    trash: (path) => call('POST', '/api/files/trash', { path }),
    recent: (path = '', { days, limit } = {}) => call('GET', `/api/files/recent?${q({ path, days, limit })}`),
    search: (q2, opts = {}) =>
      call('GET', `/api/files/search?${q({ q: q2, path: opts.path, contents: opts.contents ? 1 : undefined, regex: opts.regex ? 1 : undefined, case: opts.caseSensitive ? 1 : undefined })}`),
    watch: (path, onChange, recursive = false) => {
      const es = liveStream(`/api/files/watch?${q({ path, recursive: recursive ? 1 : undefined })}`, { resume: true });
      es.addEventListener('change', (e) => onChange(JSON.parse(e.data)));
      return () => es.close();
    }
  },

  jobs: {
    list: () => call('GET', '/api/jobs'),
    // spec: { cmd, args, cwd, label, stdin, tempDir, env }
    start: (spec) => call('POST', '/api/jobs', spec),
    prolog: (spec) => call('POST', '/api/prolog', spec),
    get: (id) => call('GET', `/api/jobs/${id}`),
    cancel: (id) => call('POST', `/api/jobs/${id}/cancel`, {}),
    input: (id, text) => call('POST', `/api/jobs/${id}/input`, { text }),
    // handlers: { output({stream,text}), end(summary), status(summary) }
    stream: (id, handlers) => {
      const es = liveStream(`/api/jobs/${id}/stream`);
      for (const name of ['status', 'output', 'end']) {
        es.addEventListener(name, (e) => {
          handlers[name]?.(JSON.parse(e.data));
          if (name === 'end') es.close();
        });
      }
      return () => es.close();
    }
  },

  github: {
    stats: (user) => call('GET', `/api/github/stats?${q({ user })}`)
  },

  state: {
    get: async (key) => (await call('GET', `/api/state/${encodeURIComponent(key)}`)).value,
    set: (key, value) => call('PUT', `/api/state/${encodeURIComponent(key)}`, { value })
  },

  events: {
    publish: (type, data) => call('POST', '/api/events', { type, data }),
    // types: e.g. ['job.finished', 'file.'] (a trailing dot matches a prefix)
    subscribe: (types, onEvent) => {
      const es = liveStream(`/api/events?${q({ types: types.join(',') })}`, { resume: true });
      es.onmessage = (e) => onEvent(JSON.parse(e.data));
      return () => es.close();
    }
  }
};

// Notify when a job ends (system notification if allowed, else a callback).
export async function notify(title, body) {
  if ('Notification' in window) {
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
  }
  return false;
}
