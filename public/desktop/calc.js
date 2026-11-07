// Calculator and time tools for the LucianOS desktop. No eval: a small parser.
//   evaluate('2 (3 + 4) ^ 2')      -> { value: 98, text: '98' }
//   evaluate('1 000 000 / 4')      -> 250000          (spaces between digits group thousands)
//   evaluate('2h 30m + 45 min')    -> 3 h 15 min       (durations)
//   evaluate('90 min in h')        -> 1.5 h
//   evaluate('15% of 80')          -> 12

const UNITS = {
  w: 604800, wk: 604800, wks: 604800, week: 604800, weeks: 604800,
  d: 86400, day: 86400, days: 86400,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1
};
const UNIT_NAMES = { 604800: 'weeks', 86400: 'days', 3600: 'h', 60: 'min', 1: 's' };
const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  ln: Math.log, log: Math.log10, exp: Math.exp
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };
const OPEN = { '(': ')', '[': ']', '{': '}' };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    // number, allowing "1 000 000" and "1,000,000" grouping
    const num = /^(\d{1,3}(?:[ ,]\d{3})+(?!\d)(?:\.\d+)?|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (num) {
      tokens.push({ t: 'num', v: parseFloat(num[1].replace(/[ ,]/g, '')) });
      i += num[1].length;
      continue;
    }
    const word = /^[A-Za-zπ]+/.exec(s.slice(i));
    if (word) {
      const w = word[0];
      tokens.push({ t: 'word', v: w.toLowerCase() });
      i += w.length;
      continue;
    }
    if ('+-*/^%!'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (OPEN[c]) { tokens.push({ t: 'open', v: c }); i++; continue; }
    if (Object.values(OPEN).includes(c)) { tokens.push({ t: 'close', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  // "2h 30m" -> one duration token of 9000 seconds
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const u = tokens[k + 1];
    if (t.t === 'num' && u?.t === 'word' && UNITS[u.v] !== undefined) {
      const secs = t.v * UNITS[u.v];
      const prev = out.at(-1);
      if (prev?.t === 'dur' && !prev.closed) prev.v += secs;
      else out.push({ t: 'dur', v: secs });
      k++;
    } else {
      if (out.at(-1)?.t === 'dur') out.at(-1).closed = true;
      out.push(t);
    }
  }
  return out;
}

function parse(tokens) {
  let pos = 0;
  let usedDuration = false;
  const peek = () => tokens[pos];
  const isWord = (w) => peek()?.t === 'word' && peek().v === w;

  function expr() {
    let v = term();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = tokens[pos++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function startsFactor() {
    const t = peek();
    return t && (t.t === 'num' || t.t === 'dur' || t.t === 'open' || (t.t === 'word' && (FUNCS[t.v] || CONSTS[t.v] !== undefined)));
  }
  function term() {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        pos++;
        const r = unary();
        if (t.v === '/' && r === 0) throw new Error('Division by zero');
        v = t.v === '*' ? v * r : v / r;
      } else if (t?.t === 'word' && t.v === 'mod') {
        pos++;
        v %= unary();
      } else if (t?.t === 'word' && t.v === 'of') {
        pos++; // "15% of 80"
        v *= unary();
      } else if (startsFactor()) {
        v *= power(); // implicit: 2(3+4), 2pi
      } else {
        return v;
      }
    }
  }
  function unary() {
    const t = peek();
    if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
      pos++;
      const v = unary();
      return t.v === '-' ? -v : v;
    }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek()?.t === 'op' && peek().v === '^') {
      pos++;
      return base ** unary(); // right-associative: 2^3^2 = 2^9
    }
    return base;
  }
  function postfix() {
    let v = primary();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && t.v === '%') { pos++; v /= 100; }
      else if (t?.t === 'op' && t.v === '!') {
        pos++;
        if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error('Factorial needs a whole number from 0 to 170');
        let f = 1;
        for (let k = 2; k <= v; k++) f *= k;
        v = f;
      } else return v;
    }
  }
  function primary() {
    const t = tokens[pos++];
    if (!t) throw new Error('The sum ends too early');
    if (t.t === 'num') return t.v;
    if (t.t === 'dur') {
      usedDuration = true;
      return t.v;
    }
    if (t.t === 'open') {
      const v = expr();
      const c = tokens[pos++];
      if (!c || c.t !== 'close') throw new Error(`Missing "${OPEN[t.v]}"`);
      if (c.v !== OPEN[t.v]) throw new Error(`"${t.v}" is closed by "${c.v}"`);
      return v;
    }
    if (t.t === 'word') {
      if (FUNCS[t.v]) {
        if (peek()?.t !== 'open') throw new Error(`${t.v} needs brackets, e.g. ${t.v}(2)`);
        return FUNCS[t.v](primary());
      }
      if (CONSTS[t.v] !== undefined) return CONSTS[t.v];
      throw new Error(`Unknown word "${t.v}"`);
    }
    if (t.t === 'close') throw new Error(`Extra "${t.v}"`);
    throw new Error(`Unexpected "${t.v}"`);
  }

  const value = expr();
  return { value, usedDuration, pos };
}

export function formatNumber(v) {
  if (!Number.isFinite(v)) throw new Error('The answer is not a finite number');
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const s = Number(v.toPrecision(12)).toString();
  return s.includes('e') ? v.toExponential(8).replace(/\.?0+e/, 'e') : s;
}

export function formatDuration(seconds) {
  const sign = seconds < 0 ? '-' : '';
  let rest = Math.abs(seconds);
  const parts = [];
  for (const [size, name] of [[86400, 'd'], [3600, 'h'], [60, 'min']]) {
    const n = Math.floor(rest / size + 1e-9);
    if (n) parts.push(`${n} ${name}`);
    rest -= n * size;
  }
  rest = Math.round(rest * 1000) / 1000;
  if (rest || !parts.length) parts.push(`${formatNumber(rest)} s`);
  return sign + parts.join(' ');
}

// Returns { value, text, detail? } or throws Error with a readable message.
export function evaluate(input) {
  const src = String(input).trim();
  if (!src) throw new Error('Type a sum');
  // "... in h" converts a duration to one unit
  const conv = /^(.*\S)\s+(?:in|to)\s+([A-Za-z]+)$/.exec(src);
  if (conv && UNITS[conv[2].toLowerCase()] !== undefined) {
    const r = evaluate(conv[1]);
    if (!r.duration) throw new Error('Only durations can be converted, e.g. 90 min in h');
    const size = UNITS[conv[2].toLowerCase()];
    const v = r.value / size;
    return { value: v, duration: false, text: `${formatNumber(v)} ${UNIT_NAMES[size]}` };
  }
  const tokens = tokenize(src);
  const { value, usedDuration, pos } = parse(tokens);
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new Error(t.t === 'close' ? `Extra "${t.v}"` : `Unexpected "${t.v}"`);
  }
  if (usedDuration) {
    return { value, duration: true, text: formatDuration(value), detail: `${formatNumber(value / 60)} min · ${formatNumber(value)} s` };
  }
  const text = formatNumber(value);
  const grouped = Math.abs(value) >= 10000 && Number.isFinite(value)
    ? value.toLocaleString('en-AU', { maximumFractionDigits: 10 })
    : null;
  return { value, duration: false, text, detail: grouped && grouped !== text ? grouped : undefined };
}

// Does this look like a sum (for spotlight)? Needs a digit and an operator or unit, or a function.
export function looksLikeSum(s) {
  const t = s.trim();
  if (!/\d|pi|π/.test(t)) return false;
  if (/^[\d.]+$/.test(t)) return false;
  try {
    evaluate(t);
    return true;
  } catch {
    return false;
  }
}

// ---------- time zones ----------
export const COMMON_ZONES = [
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Europe/London', 'Europe/Paris', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'
];

// Offset of a zone at an instant, in minutes east of UTC.
export function zoneOffset(zone, date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value; // "GMT+11:00" or "GMT"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10));
}

// "2026-11-07T15:30" read as wall-clock time in `zone` -> Date (the instant).
export function wallTimeToDate(local, zone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error('Use a date and time like 2026-11-07T15:30');
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = asUtc - zoneOffset(zone, new Date(asUtc)) * 60000;
  guess = asUtc - zoneOffset(zone, new Date(guess)) * 60000; // second pass settles daylight-saving edges
  return new Date(guess);
}

export function formatInZone(date, zone) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(date);
}

export function convertTime(local, fromZone, toZones) {
  const date = wallTimeToDate(local, fromZone);
  return toZones.map((z) => ({ zone: z, text: formatInZone(date, z) }));
}
