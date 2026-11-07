import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claudeInstructions, detectTests, makeTestFile, readmePrograms, relevantSources, sourcePrograms, testsFailed } from '../public/desktop/programs-lib.js';

// Shaped like the Algorithm-Writer-with-Lists README
const README = `# Algorithm Writer with Lists

* In Shell:
\`cd Algorithm-Writer-with-Lists\`
\`swipl\`
\`['algwriter-lists-mr.pl'].\`

* Enter \`algwriter(Algorithm),writeln1(Algorithm).\`

# Installing and Running Grammar and Logic to Algorithm

\`\`\`
['grammar_logic_to_alg.pl'].
\`\`\`

* Enter \`grammar_logic_to_alg1.\` (1)

\`\`\`
swipl -G100g -T20g -L2g
[grammar_logic_to_alg].
halt.
\`\`\`
`;

test('finds commands in a README', () => {
  const p = readmePrograms(README);
  assert.deepEqual(p.map((x) => x.kind === 'prolog' ? `${x.consult.join('+')} | ${x.goal}` : `$ ${x.command}`), [
    'algwriter-lists-mr.pl | algwriter(Algorithm),writeln1(Algorithm)',
    'grammar_logic_to_alg.pl | grammar_logic_to_alg1',
    '$ swipl -G100g -T20g -L2g'
  ]);
});

test('finds programs in source', () => {
  const p = sourcePrograms([
    { path: 'a.pl', text: ':- initialization(main).\nmain :- writeln(hi).\n' },
    { path: 'b.pl', text: '% run :- nothing.\nrun :- go.\ngo.\nhelper(X) :- X.\n' }
  ]);
  assert.deepEqual(p.map((x) => `${x.consult[0]}:${x.goal}`), ['a.pl:main', 'b.pl:run', 'b.pl:go']);
});

test('finds how to run the tests', () => {
  assert.equal(detectTests(['tests/run.pl', 'a.pl'], () => '').command, 'swipl -q -s tests/run.pl');
  const t = detectTests(['a.pl', 'a_tests.pl'], (f) => (f === 'a_tests.pl' ? ':- begin_tests(a).' : ''));
  assert.deepEqual(t.consult, ['a_tests.pl']);
  assert.equal(detectTests(['a.pl'], () => ''), null);
});

test('makes a PlUnit test file from the examples', () => {
  const f = makeTestFile('Algorithm-Writer-with-Lists', readmePrograms(README));
  assert.equal(f.name, 'algorithm_writer_with_lists_examples_tests.pl');
  assert.equal(f.count, 2);
  assert.match(f.text, /:- consult\(\['algwriter-lists-mr\.pl', 'grammar_logic_to_alg\.pl'\]\)\./);
  assert.match(f.text, /:- begin_tests\(algorithm_writer_with_lists_examples\)\./);
  assert.match(f.text, /test\(example_1, \[nondet\]\) :-\n {4}algwriter\(Algorithm\),writeln1\(Algorithm\)\./);
  assert.match(f.text, /:- end_tests\(algorithm_writer_with_lists_examples\)\./);
  assert.equal(makeTestFile('x', [{ kind: 'terminal', command: 'swipl' }]), null);
  assert.match(makeTestFile('x', [{ kind: 'prolog', goal: 'g', consult: ['a.pl'] }], { prefix: '../' }).text, /consult\(\['\.\.\/a\.pl'\]\)/);
});

test('knows when tests failed and writes instructions for Claude', () => {
  const out = '% PL-Unit: lists ..\nERROR: /r/tests/a_tests.pl:12:\n\ttest sums: failed\n% 1 test failed\n% 2 tests passed';
  assert.ok(testsFailed(0, out));
  assert.ok(testsFailed(1, 'whatever'));
  assert.ok(!testsFailed(0, '% All 5 tests passed'));
  const md = claudeInstructions({ repo: 'myrepo', testLabel: 'tests/run.pl', output: out, sources: [{ path: 'a.pl', text: 'sum(X,Y,Z) :- Z is X-Y.' }], when: new Date(2026, 10, 7) });
  assert.match(md, /^# Failing tests in myrepo/);
  assert.match(md, /Failing: sums\./);
  assert.match(md, /Do not weaken or delete tests/);
  assert.match(md, /```prolog\nsum\(X,Y,Z\) :- Z is X-Y\.\n```/);
  assert.deepEqual(relevantSources('error in a.pl line 3', ['a.pl', 'b.pl', 'tests/t.pl']), ['a.pl']);
  assert.deepEqual(relevantSources('nothing named', ['a.pl', 'tests/t.pl']), ['a.pl']);
});
