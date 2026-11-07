// Pure helpers for the workflow checklist (testable without a page).

export const STATUSES = [
  ['unknown', 'Profitable?'],
  ['not-yet', 'Not yet'],
  ['profitable', 'Profitable'],
  ['not-profitable', 'Not profitable']
];

export const KINDS = {
  script: 'shellrun script',
  url: 'Web address',
  app: 'App',
  gl: 'Grammar Logic',
  music: "Today's music",
  note: 'Note'
};

export const DEFAULT_SETTINGS = {
  awl: 'Dropbox/GitHub-private2/Algorithm-Writer-with-Lists',
  t2b: 'Dropbox/GitHub-private2/Text-to-Breasonings',
  music: 'Dropbox/GitHub-private2/Music-Composer',
  shortlist: 'Music/GarageBand shortlist',
  glFolder: 'LucianOS/gl',
  glChars: 4000,
  glTimes: '10:00, 15:00',
  breasoningScript: ''
};

const pad = (n) => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const stamp = (d = new Date()) => `${today(d)} ${pad(d.getHours())}${pad(d.getMinutes())}`;

export function newItem(fields, now = Date.now()) {
  return {
    id: `w${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: 'New workflow',
    kind: 'note',
    target: '',
    daily: false,
    finishedOn: null,
    status: 'unknown',
    comment: '',
    created: now,
    modified: now,
    hidden: false,
    parent: null,
    ...fields
  };
}

// Daily items count as finished only on the day they were ticked.
export function isFinished(item, day = today()) {
  if (!item.finishedOn) return false;
  return item.daily ? item.finishedOn === day : true;
}

export function dailyToRun(items, day = today()) {
  return items.filter((i) => i.daily && !i.hidden && !isFinished(i, day));
}

// Items in tree order (children under their parent), each with a depth.
export function ordered(items, showHidden = false) {
  const visible = items.filter((i) => showHidden || !i.hidden);
  const ids = new Set(visible.map((i) => i.id));
  const out = [];
  const walk = (parent, depth) => {
    for (const i of visible.filter((x) => (x.parent && ids.has(x.parent) ? x.parent : null) === parent)) {
      out.push({ item: i, depth });
      walk(i.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// "10:00, 3pm, 15:30" -> [{ h: 10, m: 0 }, { h: 15, m: 0 }, { h: 15, m: 30 }] (sorted, no repeats)
export function parseTimes(text) {
  const out = [];
  for (const part of String(text).split(/[,;]+/)) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(part);
    if (!m) continue;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] ?? '0', 10);
    if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) out.push({ h, m: min });
  }
  return out.sort((a, b) => a.h - b.h || a.m - b.m).filter((t, i, a) => !i || t.h !== a[i - 1].h || t.m !== a[i - 1].m);
}

export const timeKey = (t) => `${pad(t.h)}:${pad(t.m)}`;

// The latest reminder time that has passed today and not been handled yet.
export function dueReminder(times, now, handled = []) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const due = times.filter((t) => t.h * 60 + t.m <= mins && !handled.includes(timeKey(t)));
  return due.at(-1) ?? null;
}

export function prologString(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

// Runs Grammar Logic on a topic and prints each part of the result on its own line.
export function glGoal(topic, chars = 4000) {
  const n = Math.max(100, Math.min(100000, Math.round(Number(chars) || 4000)));
  return `grammar_logic_to_alg1(${prologString(topic)}, ${n}, R), term_to_atom(T, R), forall(member(X, T), (atomic(X) -> writeln(X) ; (term_to_atom(X, A), writeln(A))))`;
}

export const slug = (s) => String(s).trim().replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').slice(0, 60).trim() || 'untitled';

// Does a shellrun script need a person (pauses or interactive steps)?
export function needsPerson(script) {
  return (script.steps ?? []).some((s) => s.type === 'pause' || s.interactive);
}

export function isRecent(mtimeMs, now = Date.now(), days = 1) {
  return now - mtimeMs <= days * 86400000;
}
