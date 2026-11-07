// Claude bridge: the only part of the suite that sends text off your machine.
// The API key stays on the server (never sent to the browser). Off until a key is added.
//   GET  /api/claude            status (no key)
//   PUT  /api/claude/settings   { apiKey?, temporary?, forget?, model?, monthlyTokenCap?, confirmBeforeSend? }
//   POST /api/claude/ask        { prompt, system?, maxTokens?, purpose?, confirmed? } -> { text, usage, used, cap }
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, readJson, sendJson } from './http-util.js';

export const MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
const DEFAULTS = { model: 'claude-sonnet-5-5', monthlyTokenCap: 1_000_000, confirmBeforeSend: true, usage: { month: '', input: 0, output: 0, requests: 0 } };
const month = () => new Date().toISOString().slice(0, 7);

export class ClaudeBridge {
  constructor(cfg, bus) {
    this.cfg = cfg;
    this.bus = bus;
    this.file = path.join(cfg.dataDir, 'claude.json');
    this.temporaryKey = null; // "for this session only": kept in memory, gone on restart
    this.data = { ...DEFAULTS };
    try {
      this.data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {}
    this.url = cfg.claudeApiUrl ?? 'https://api.anthropic.com/v1/messages';
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  get key() {
    return this.temporaryKey ?? this.data.apiKey ?? null;
  }

  usage() {
    if (this.data.usage.month !== month()) this.data.usage = { month: month(), input: 0, output: 0, requests: 0 };
    return this.data.usage;
  }

  status() {
    const u = this.usage();
    return {
      enabled: !!this.key,
      keySaved: !!this.data.apiKey,
      temporary: !!this.temporaryKey,
      model: this.data.model,
      models: MODELS,
      monthlyTokenCap: this.data.monthlyTokenCap,
      used: u.input + u.output,
      requests: u.requests,
      confirmBeforeSend: this.data.confirmBeforeSend
    };
  }

  update(body) {
    if (body.forget) {
      delete this.data.apiKey;
      this.temporaryKey = null;
    }
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const k = body.apiKey.trim();
      if (!/^sk-[A-Za-z0-9_-]{10,}$/.test(k)) throw new HttpError(400, 'That does not look like an Anthropic API key (it starts with sk-)');
      if (body.temporary) {
        this.temporaryKey = k;
        delete this.data.apiKey;
      } else {
        this.data.apiKey = k;
        this.temporaryKey = null;
      }
    }
    if (body.model !== undefined) {
      if (!MODELS.includes(body.model)) throw new HttpError(400, `Model must be one of ${MODELS.join(', ')}`);
      this.data.model = body.model;
    }
    if (body.monthlyTokenCap !== undefined) {
      const n = Number(body.monthlyTokenCap);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Monthly token limit must be a number');
      this.data.monthlyTokenCap = Math.round(n);
    }
    if (body.confirmBeforeSend !== undefined) this.data.confirmBeforeSend = !!body.confirmBeforeSend;
    this.save();
    return this.status();
  }

  async ask({ prompt, system, maxTokens = 1500, purpose = 'request', confirmed = false }) {
    if (!this.key) throw new HttpError(409, 'Claude is off. Add an API key in Tools ▸ Claude settings.');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new HttpError(400, 'Nothing to send');
    if (prompt.length > 200_000) throw new HttpError(413, 'That is too much text to send at once');
    if (this.data.confirmBeforeSend && !confirmed) throw new HttpError(428, 'Confirm before sending');
    const u = this.usage();
    const maxOut = Math.max(64, Math.min(8000, Number(maxTokens) || 1500));
    const estimateIn = Math.ceil(((system ?? '').length + prompt.length) / 3.5);
    if (u.input + u.output + estimateIn + maxOut > this.data.monthlyTokenCap) {
      throw new HttpError(402, `This would pass your monthly limit of ${this.data.monthlyTokenCap.toLocaleString()} tokens (${(u.input + u.output).toLocaleString()} used). Raise it in Claude settings.`);
    }
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.data.model,
          max_tokens: maxOut,
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(120_000)
      });
    } catch (err) {
      throw new HttpError(502, `Could not reach Claude: ${err.message}`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message ?? `${res.status} ${res.statusText}`;
      throw new HttpError(res.status === 401 ? 401 : 502, `Claude said: ${msg}`);
    }
    const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    u.input += body.usage?.input_tokens ?? estimateIn;
    u.output += body.usage?.output_tokens ?? Math.ceil(text.length / 3.5);
    u.requests++;
    this.save();
    this.bus.publish('claude.used', { purpose, tokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0) });
    return { text, usage: body.usage ?? null, used: u.input + u.output, cap: this.data.monthlyTokenCap };
  }
}

export function claudeRoutes(router, bridge) {
  router.get('/api/claude', (req, res) => sendJson(res, 200, bridge.status()));
  router.put('/api/claude/settings', async (req, res) => sendJson(res, 200, bridge.update(await readJson(req))));
  router.post('/api/claude/ask', async (req, res) => sendJson(res, 200, await bridge.ask(await readJson(req))));
}
