// Password login for remote mode, and request guards for both modes.
import crypto from 'node:crypto';
import { HttpError } from './http-util.js';

const COOKIE = 'lucianos_session';
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Use a password of at least 8 characters');
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [kind, saltHex, keyHex] = stored.split(':');
  if (kind !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export class Auth {
  constructor(cfg) {
    this.cfg = cfg;
    this.sessions = new Map(); // token -> expiry ms
    this.failures = new Map(); // ip -> [timestamps]
  }

  get required() {
    return this.cfg.mode === 'remote';
  }

  isLoggedIn(req) {
    if (!this.required) return true;
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return false;
    const expiry = this.sessions.get(token);
    if (!expiry) return false;
    if (expiry < Date.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  login(req, res, password) {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    }
    if (!verifyPassword(password, this.cfg.passwordHash)) {
      recent.push(now);
      this.failures.set(ip, recent);
      throw new HttpError(401, 'Wrong password');
    }
    this.failures.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const maxAge = this.cfg.sessionDays * 24 * 3600;
    this.sessions.set(token, now + maxAge * 1000);
    res.setHeader('Set-Cookie', this.cookie(token, maxAge));
  }

  logout(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) this.sessions.delete(token);
    res.setHeader('Set-Cookie', this.cookie('', 0));
  }

  cookie(value, maxAge) {
    const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
    if (this.cfg.secureCookie) parts.push('Secure');
    return parts.join('; ');
  }
}

// Guards every /api request.
// 1. Host check (local mode): blocks DNS-rebinding attacks from web pages you visit.
// 2. Custom header on every API call: a page on another site cannot add it without a
//    CORS preflight, which this server never approves, so it cannot drive your files or jobs.
//    EventSource streams (GET, read-only) are exempt; browsers stop other sites reading them.
export function guardApi(req, cfg, { isStream }) {
  if (cfg.mode === 'local') {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
      throw new HttpError(403, 'Local mode only answers requests addressed to localhost');
    }
  }
  // Browsers label where a request came from; refuse anything another site started.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'Requests from other websites are refused');
  }
  if (!isStream && req.headers['x-lucianos'] !== '1') {
    throw new HttpError(403, 'Missing X-LucianOS header');
  }
}
