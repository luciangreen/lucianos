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
    everyDays: 0,
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

// Days from one YYYY-MM-DD to another.
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Daily items count as finished only on the day they were ticked; items that repeat every
// N days (everyDays, e.g. 7 for weekly) until N days have passed; others once ticked.
export function isFinished(item, day = today()) {
  if (!item.finishedOn) return false;
  if (item.daily) return item.finishedOn === day;
  if (item.everyDays > 0) return daysBetween(item.finishedOn, day) < item.everyDays;
  return true;
}

// Repeating items (daily or every N days) still to do today.
export function dailyToRun(items, day = today()) {
  return items.filter((i) => (i.daily || i.everyDays > 0) && !i.hidden && !isFinished(i, day));
}

export const repeatText = (item) => (item.daily ? 'daily' : item.everyDays === 7 ? 'weekly' : item.everyDays > 0 ? `every ${item.everyDays} days` : '');

// An app's own group of checklist items (lucianos.checklist): a parent item with group.key,
// and children matched by their key. Children are updated (title, kind, target, repeat,
// comment) but keep what you did with them (ticks, status, comments you wrote are replaced
// only if the app sends one); children the app no longer sends are hidden, not deleted.
const APP_FIELDS = ['title', 'kind', 'target', 'daily', 'everyDays', 'comment'];
export function upsertGroup(items, group, entries, now = Date.now()) {
  if (!group?.key || !Array.isArray(entries)) return items;
  const out = items.map((i) => ({ ...i }));
  const clean = (e) => Object.fromEntries(APP_FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, k === 'everyDays' ? Math.max(0, Math.floor(Number(e[k]) || 0)) : k === 'daily' ? !!e[k] : String(e[k]).slice(0, 300)]));
  let parent = out.find((i) => i.key === group.key && !i.parent);
  if (!parent) { parent = newItem({ key: group.key, kind: 'note', ...clean(group) }, now); out.push(parent); } else Object.assign(parent, clean(group), { hidden: false, modified: now });
  const keys = new Set();
  for (const e of entries) {
    if (!e?.key || !KINDS[e.kind ?? 'note']) continue;
    keys.add(e.key);
    const child = out.find((i) => i.parent === parent.id && i.key === e.key);
    if (child) Object.assign(child, clean(e), { hidden: !!e.hidden, modified: now });
    else out.push(newItem({ key: e.key, parent: parent.id, ...clean(e), hidden: !!e.hidden }, now));
  }
  for (const i of out) if (i.parent === parent.id && i.key && !keys.has(i.key) && !i.hidden) Object.assign(i, { hidden: true, modified: now });
  return out;
}

// Tick an app's item (by group and key) as done today.
export function finishKey(items, groupKey, key, day = today()) {
  const parent = items.find((i) => i.key === groupKey && !i.parent);
  return items.map((i) => (parent && i.parent === parent.id && i.key === key ? { ...i, finishedOn: day, modified: Date.now() } : i));
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
// These use the calls in br_16k_args_algs in find_char_map.pl (private repo), with one word:
//   As is 1, Br is As*80,
//   grammar_logic_to_alg1(Essay_0,As,GL_out1), written one word per line
//   (in Algorithm-Writer-with-Lists), then in Text-to-Breasonings:
//   texttobr2(u,u,GL_out,Br,[auto,on]), texttobr(u,u,GL_out,u)
// with the files find_char_map.pl gets through cgpt_combophil_analogy.pl:
//   Text-to-Breasonings/text_to_breasonings.pl and Algorithm-Writer-with-Lists/grammar_logic_to_alg1.pl

// Grammar Logic copies the first word of the topic (Essay_0) and adds 79 words to it, so the
// file has 80 words; breasoning then breasons out that file (Br is As*80 = 80 words).
export const GL_AS = 1; // As: one word
export const BR = GL_AS * 80; // Br: the word and its 79

// A Prolog string; unlike prologString, keeps new lines.
export function prologText(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

// Essay_0: the first word of the topic.
export function firstWord(topic) {
  return String(topic).trim().split(/[^\p{L}\p{N}'-]+/u).filter(Boolean)[0] ?? '';
}

// Loads the two files as one program, as cgpt_combophil_analogy.pl does, using absolute paths
// from the suite folder (LUCIANOS_ROOT, set for every job). Relative paths break when a folder,
// such as Dropbox on a Mac, is a link: ".." then climbs the real folder, not the link.
// Prolog writes the loader itself (LucianOS/prolog/gl_and_breasoning.pl), so you can see it.
export const LOADER = 'LucianOS/prolog/gl_and_breasoning.pl';
export function loadGoal({ awl, t2b }) {
  return [
    "getenv('LUCIANOS_ROOT',Root)",
    `atomic_list_concat([Root,'/',${prologText(t2b)},'/text_to_breasonings.pl'],T2B_file)`,
    `atomic_list_concat([Root,'/',${prologText(awl)},'/grammar_logic_to_alg1.pl'],GL_file)`,
    `atomic_list_concat([Root,'/',${prologText(LOADER)}],Loader)`,
    'file_directory_name(Loader,Loader_dir), make_directory_path(Loader_dir)',
    "open(Loader,write,Loader_s), format(Loader_s,'% Written by LucianOS: loads Grammar Logic and Text-to-Breasonings as find_char_map.pl does.~n:-include(~q).~n:-include(~q).~n',[T2B_file,GL_file]), close(Loader_s)",
    'consult(Loader)'
  ].join(', ');
}

export function glGoal(topic, folders) {
  return [
    loadGoal(folders),
    `Essay_0 = ${prologText(firstWord(topic))}`,
    'As is 1',
    'grammar_logic_to_alg1(Essay_0,As,GL_out1)',
    // GL_out1 is a quoted string holding the list of words: read it twice, then one word per line
    'term_to_atom(GL_list_text,GL_out1)',
    'term_string(GL_list,GL_list_text)',
    'forall(member(GL_word,GL_list),writeln(GL_word))'
  ].join(', ');
}

// Breasons a Grammar Logic file (`file`, from the suite folder), run in Text-to-Breasonings.
export function breasonGoal(file, folders) {
  return [
    loadGoal(folders),
    `atomic_list_concat([Root,'/',${prologText(file)}],GL_path)`,
    'read_file_to_string(GL_path,GL_text,[])',
    'split_string(GL_text,"","\\s\\t\\n\\r",[GL_out])',
    'As is 1',
    'Br is As*80',
    'texttobr2(u,u,GL_out,Br,[auto,on])',
    'texttobr(u,u,GL_out,u)'
  ].join(', ');
}

export const slug = (s) => String(s).trim().replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').slice(0, 60).trim() || 'untitled';

// Does a shellrun script need a person (pauses or interactive steps)?
export function needsPerson(script) {
  return (script.steps ?? []).some((s) => s.type === 'pause' || s.interactive);
}

export function isRecent(mtimeMs, now = Date.now(), days = 1) {
  return now - mtimeMs <= days * 86400000;
}
