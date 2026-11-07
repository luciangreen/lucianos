// Event bus: services publish events; apps subscribe over server-sent events.
import { EventEmitter } from 'node:events';
import { HttpError, openSse, readJson, sendJson } from './http-util.js';

export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    this.seq = 0;
  }

  publish(type, data = {}) {
    const event = { seq: ++this.seq, type, data, time: new Date().toISOString() };
    this.emit('event', event);
    return event;
  }
}

export function eventRoutes(router, bus) {
  // GET /api/events?types=job.finished,file.saved   (prefix match: types=job.)
  router.get('/api/events', (req, res, { query }) => {
    const filters = (query.get('types') ?? '').split(',').filter(Boolean);
    const send = openSse(req, res);
    const onEvent = (e) => {
      if (filters.length && !filters.some((f) => e.type === f || (f.endsWith('.') && e.type.startsWith(f)))) return;
      send('message', e); // every event arrives on EventSource.onmessage; e.type says which
    };
    bus.on('event', onEvent);
    req.on('close', () => bus.off('event', onEvent));
  });

  // Apps publish their own events; names must start with "app." so they cannot pose as system events.
  router.post('/api/events', async (req, res) => {
    const { type, data } = await readJson(req);
    if (typeof type !== 'string' || !/^app\.[a-z0-9._-]{1,80}$/.test(type)) {
      throw new HttpError(400, 'type must look like "app.<name>"');
    }
    sendJson(res, 200, bus.publish(type, data ?? {}));
  });
}
