// Programs in a folder: commands found in its README and source, generated test files,
// and Claude-ready instructions when tests fail. Pure functions (tested in Node).

const CONSULT = /^\s*\[\s*((?:'[^']+'|"[^"]+"|[a-z][\w]*)(?:\s*,\s*(?:'[^']+'|"[^"]+"|[a-z][\w]*))*)\s*\]\s*\.\s*$/;
const GOAL = /^\s*([a-z][A-Za-z0-9_]*)\s*\(.*\)\s*\.\s*$|^\s*([a-z][A-Za-z0-9_]*)\s*\.\s*$/;
const NOT_GOALS = new Set(['halt', 'notrace', 'trace', 'make', 'listing']);

function consultFiles(m) {
  return m.split(/\s*,\s*/).map((f) => f.replace(/^['"]|['"]$/g, '')).map((f) => (/\.pl$/.test(f) ? f : `${f}.pl`));
}

// Code from README, in reading order: fenced blocks and `inline code`.
function codeChunks(md) {
  const chunks = [];
  const inlineOf = (text) => {
    for (const line of text.split('\n')) {
      const inline = [...line.matchAll(/`([^`\n]+)`/g)].map((x) => x[1]);
      if (inline.length) chunks.push(inline);
    }
  };
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = fence.exec(md))) {
    inlineOf(md.slice(last, m.index));
    chunks.push(m[1].split('\n'));
    last = fence.lastIndex;
  }
  inlineOf(md.slice(last));
  return chunks;
}

// [{ kind: 'prolog', goal, consult: [files], label } | { kind: 'terminal', command, label }]
export function readmePrograms(md) {
  const out = [];
  let consult = [];
  for (const lines of codeChunks(md)) {
    for (const raw of lines) {
      const line = raw.trim().replace(/^\?-\s*/, '');
      if (!line || line.startsWith('%') || line.startsWith('#')) continue;
      let m;
      if (/^swipl(\s|$)/.test(line) && !/^swipl\s*$/.test(line)) {
        out.push({ kind: 'terminal', command: line, label: line.length > 40 ? `${line.slice(0, 38)}…` : line });
      } else if ((m = CONSULT.exec(line))) {
        consult = consultFiles(m[1]);
      } else if ((m = GOAL.exec(line)) && !NOT_GOALS.has(m[1] ?? m[2]) && !/^(cd|git|ls|mkdir|sudo|brew|nano|export|gcc)\b/.test(line)) {
        const goal = line.replace(/\.\s*$/, '');
        out.push({ kind: 'prolog', goal, consult: [...consult], label: goal.length > 40 ? `${goal.slice(0, 38)}…` : goal });
      }
    }
  }
  return dedupe(out);
}

// From source: main/0, :- initialization(Goal), and 0-arity run/start/go/demo predicates.
export function sourcePrograms(files) {
  const out = [];
  for (const { path, text } of files) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/%.*$/gm, '');
    const init = /^:-\s*initialization\(\s*([a-z][\w]*)\s*(?:,\s*main\s*)?\)\s*\./m.exec(clean);
    if (init) out.push({ kind: 'prolog', goal: init[1], consult: [path], label: `${init[1]} (${path})` });
    for (const name of ['main', 'run', 'start', 'go', 'demo']) {
      if (new RegExp(`^${name}\\s*(:-|\\.)`, 'm').test(clean) && !(init && init[1] === name)) {
        out.push({ kind: 'prolog', goal: name, consult: [path], label: `${name} (${path})` });
      }
    }
  }
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((p) => {
    const k = p.kind === 'terminal' ? p.command : `${p.consult.join(',')}|${p.goal}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const isTestPath = (p) => /(^|\/)tests?\//i.test(p) || /(^|[/_-])test[^/]*\.pl$|_tests?\.pl$/i.test(p);

export function detectTests(files, read) {
  if (files.includes('tests/run.pl')) return { kind: 'terminal', command: 'swipl -q -s tests/run.pl', label: 'tests/run.pl' };
  const unit = files.filter((f) => isTestPath(f) && /:-\s*begin_tests\(/.test(read(f) ?? ''));
  if (unit.length) return { kind: 'prolog', goal: 'run_tests', consult: unit, label: `${unit.length} test file${unit.length === 1 ? '' : 's'}` };
  return null;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'repo';
const q = (f) => `'${f.replace(/'/g, "\\'")}'`;

// A PlUnit file with one test per README example (each must succeed). Edit to add expected answers.
export function makeTestFile(repoName, programs, { prefix = '' } = {}) {
  const goals = programs.filter((p) => p.kind === 'prolog');
  if (!goals.length) return null;
  const files = [...new Set(goals.flatMap((g) => g.consult))];
  const unit = `${slug(repoName)}_examples`;
  const lines = [
    `% Tests made by LucianOS from the examples in ${repoName}'s README and source.`,
    '% Each example must succeed. To check answers too, change a test to, for example:',
    '%   test(example_1, X == expected) :- goal(X).',
    '% Run: swipl -g run_tests -t halt <this file>',
    ''
  ];
  if (files.length) lines.push(`:- consult([${files.map((f) => q(prefix + f)).join(', ')}]).`, '');
  lines.push(`:- begin_tests(${unit}).`, '');
  goals.forEach((g, i) => {
    lines.push(`% from: ${g.goal.replace(/\n/g, ' ')}`);
    lines.push(`test(example_${i + 1}, [nondet]) :-`, `    ${g.goal}.`, '');
  });
  lines.push(`:- end_tests(${unit}).`, '');
  return { name: `${slug(repoName)}_examples_tests.pl`, text: lines.join('\n'), count: goals.length };
}

// Did a test run fail? Exit code, or PlUnit's own words.
export function testsFailed(code, output) {
  return code !== 0 || /\b(\d+ tests? failed|FAILED|ERROR:|Warning:.*goal \(directive\) failed)/.test(output);
}

// Markdown instructions you can hand to Claude (or read yourself) to fix failing tests.
export function claudeInstructions({ repo, testLabel, output, sources, when = new Date() }) {
  const trimmed = output.length > 6000 ? `${output.slice(0, 3000)}\n…\n${output.slice(-3000)}` : output;
  const failing = [...output.matchAll(/test (\w+)[^\n]*(?:failed|FAILED|received error[^\n]*)/g)].map((m) => m[1]);
  const parts = [
    `# Failing tests in ${repo}`,
    '',
    `Checked by LucianOS on ${when.toLocaleString()} with ${testLabel}.`,
    failing.length ? `Failing: ${[...new Set(failing)].join(', ')}.` : 'The test run did not pass.',
    '',
    '## What to do (instructions for Claude)',
    '',
    `You are helping fix a SWI-Prolog repository called ${repo}. The test output and the relevant source files are below.`,
    '1. Work out why each failing test fails. Quote the line that causes it.',
    '2. Propose the smallest change that makes the tests pass without changing what the code is for. Do not weaken or delete tests.',
    '3. Give the change as a unified diff, then one sentence on why it is right.',
    '4. If a test itself looks wrong, say so instead of changing the code.',
    '',
    '## Test output',
    '',
    '```',
    trimmed.trim(),
    '```',
    ''
  ];
  if (sources?.length) {
    parts.push('## Relevant source', '');
    for (const s of sources) {
      const text = s.text.length > 8000 ? `${s.text.slice(0, 8000)}\n% … (cut at 8000 characters)` : s.text;
      parts.push(`### ${s.path}`, '', '```prolog', text.trimEnd(), '```', '');
    }
  }
  return parts.join('\n');
}

// The source files most likely involved: mentioned in the output, else the consulted ones.
export function relevantSources(output, files, consulted = []) {
  const named = files.filter((f) => output.includes(f.split('/').pop()));
  const pick = named.length ? named : consulted.length ? consulted : files.filter((f) => !isTestPath(f));
  return [...new Set(pick)].slice(0, 4);
}
