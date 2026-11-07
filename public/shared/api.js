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
    trash: (path) => call('POST', '/api/files/trash', { path }),
    search: (q2, opts = {}) =>
      call('GET', `/api/files/search?${q({ q: q2, path: opts.path, contents: opts.contents ? 1 : undefined, regex: opts.regex ? 1 : undefined, case: opts.caseSensitive ? 1 : undefined })}`),
    watch: (path, onChange, recursive = false) => {
      const es = new EventSource(`/api/files/watch?${q({ path, recursive: recursive ? 1 : undefined })}`);
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
      const es = new EventSource(`/api/jobs/${id}/stream`);
      for (const name of ['status', 'output', 'end']) {
        es.addEventListener(name, (e) => {
          handlers[name]?.(JSON.parse(e.data));
          if (name === 'end') es.close();
        });
      }
      return () => es.close();
    }
  },

  state: {
    get: async (key) => (await call('GET', `/api/state/${encodeURIComponent(key)}`)).value,
    set: (key, value) => call('PUT', `/api/state/${encodeURIComponent(key)}`, { value })
  },

  events: {
    publish: (type, data) => call('POST', '/api/events', { type, data }),
    // types: e.g. ['job.finished', 'file.'] (a trailing dot matches a prefix)
    subscribe: (types, onEvent) => {
      const es = new EventSource(`/api/events?${q({ types: types.join(',') })}`);
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
