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

// ---------------------------------------------------------------- Grammar Logic and breasoning
// These follow br_16k_args_algs in find_char_map.pl (private repo) exactly:
//   As is 4*50, Br is As*80,
//   grammar_logic_to_alg1(Essay_0,As,GL_out1), term_to_atom(GL_out1,GL_out2), string_atom(GL_out,GL_out2)
//   (in Algorithm-Writer-with-Lists), then in Text-to-Breasonings:
//   texttobr2(u,u,GL_out,Br,[auto,on]), texttobr(u,u,GL_out,u)
// with the files find_char_map.pl gets through cgpt_combophil_analogy.pl:
//   Text-to-Breasonings/text_to_breasonings.pl and Algorithm-Writer-with-Lists/grammar_logic_to_alg1.pl

export const GL_AS = 4 * 50; // As
export const BR = GL_AS * 80; // Br

// A Prolog string; unlike prologString, keeps new lines.
export function prologText(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

// Essay_03 in find_char_map.pl: the text on its own line, repeated ceiling(200/Words) times
// (Prolog then truncates it to 200 words with truncate1).
export function glEssay(topic) {
  const text = String(topic).trim();
  const words = Math.max(1, text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length);
  return `${text}\n`.repeat(Math.ceil(200 / words));
}

export function glGoal(topic) {
  return [
    `Essay_03 = ${prologText(glEssay(topic))}`,
    'truncate1(string,Essay_03,200,Essay_0)',
    'As is 4*50',
    'grammar_logic_to_alg1(Essay_0,As,GL_out1)',
    'term_to_atom(GL_out1,GL_out2)',
    'string_atom(GL_out,GL_out2)',
    'write(GL_out), nl'
  ].join(', ');
}

// Breasons a Grammar Logic file (read as GL_out), run in Text-to-Breasonings.
export function breasonGoal(fileFromT2b) {
  return [
    `read_file_to_string(${prologText(fileFromT2b)},GL_text,[])`,
    'split_string(GL_text,"","\\s\\t\\n\\r",[GL_out])',
    'As is 4*50',
    'Br is As*80',
    'texttobr2(u,u,GL_out,Br,[auto,on])',
    'texttobr(u,u,GL_out,u)'
  ].join(', ');
}

// A path from folder `from` to `to` (both inside the suite).
export function relPath(from, to) {
  const a = from.split('/').filter(Boolean);
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/') || '.';
}

// The loader LucianOS writes: one program that includes both files, as cgpt_combophil_analogy.pl does,
// so shared files (truncate.pl, listprolog) are loaded once.
export const LOADER = 'LucianOS/prolog/gl_and_breasoning.pl';
export function loaderText({ awl, t2b }, loader = LOADER) {
  const dir = loader.split('/').slice(0, -1).join('/');
  return [
    '% Written by LucianOS. Loads Grammar Logic and Text-to-Breasonings the way find_char_map.pl does',
    '% (through cgpt_combophil_analogy.pl). Change the folders in Workflow settings, not here.',
    `:-include('${relPath(dir, `${t2b}/text_to_breasonings.pl`)}').`,
    `:-include('${relPath(dir, `${awl}/grammar_logic_to_alg1.pl`)}').`,
    ''
  ].join('\n');
}

export const slug = (s) => String(s).trim().replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').slice(0, 60).trim() || 'untitled';

// Does a shellrun script need a person (pauses or interactive steps)?
export function needsPerson(script) {
  return (script.steps ?? []).some((s) => s.type === 'pause' || s.interactive);
}

export function isRecent(mtimeMs, now = Date.now(), days = 1) {
  return now - mtimeMs <= days * 86400000;
}
