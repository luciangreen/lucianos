// Predicted commands: what you are likely to say next, with values you can edit before running.
// History entries: { text, intent, time (ms), here (folder) }
//   remember(history, entry) -> new history (newest last, at most 300)
//   predict(history, { now, here, limit }) -> [{ text, why }]

const HALF_LIFE = 7 * 86400000; // a week
const SKIP = new Set(['unknown', 'none', 'help', 'greet', 'thanks', 'quiet']);
const norm = (t) => t.trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');

export function remember(history, entry, max = 300) {
  if (!entry?.text?.trim() || SKIP.has(entry.intent)) return history;
  return [...history, { text: entry.text.trim(), intent: entry.intent, time: entry.time ?? Date.now(), here: entry.here ?? '' }].slice(-max);
}

export function predict(history, { now = Date.now(), here = '', limit = 4 } = {}) {
  if (!history.length) return [];
  const scores = new Map();
  const add = (h, score, why) => {
    const k = norm(h.text);
    const cur = scores.get(k) ?? { text: h.text, score: 0, why: new Set() };
    cur.score += score;
    why && cur.why.add(why);
    if (h.time >= (cur.time ?? 0)) {
      cur.text = h.text; // the latest wording wins
      cur.time = h.time;
    }
    scores.set(k, cur);
  };
  const hour = new Date(now).getHours();
  for (const h of history) {
    const age = Math.max(0, now - h.time);
    const recency = 0.5 ** (age / HALF_LIFE);
    add(h, recency, null);
    const hh = new Date(h.time).getHours();
    if (Math.abs(hh - hour) <= 1 || Math.abs(hh - hour) === 23) add(h, 0.6 * recency, 'usual at this time');
    if (here && h.here === here) add(h, 0.5 * recency, 'often here');
  }
  // what usually comes next after the last command, in the same sitting (within 2 hours)
  const SITTING = 2 * 3600000;
  const last = history.at(-1);
  for (let i = 0; i < history.length - 1 && now - last.time < SITTING; i++) {
    if (history[i + 1].time - history[i].time > SITTING) continue;
    if (norm(history[i].text) === norm(last.text) && norm(history[i + 1].text) !== norm(last.text)) {
      add(history[i + 1], 1.5 * 0.5 ** (Math.max(0, now - history[i + 1].time) / HALF_LIFE), `often after “${last.text}”`);
    }
  }
  // the command you just ran is less likely to be next
  const lastKey = norm(last.text);
  if (scores.has(lastKey) && now - last.time < 10 * 60000) scores.get(lastKey).score *= 0.3;
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.time - a.time)
    .slice(0, limit)
    .map((s) => ({ text: s.text, why: [...s.why][0] ?? 'recent' }));
}

export function recent(history, limit = 10) {
  const seen = new Set();
  const out = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i--) {
    const k = norm(history[i].text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(history[i]);
  }
  return out;
}
