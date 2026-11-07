// Runs Grammar Logic and breasoning exactly as the desktop does, against real checkouts of
// Algorithm-Writer-with-Lists, Text-to-Breasonings and listprologinterpreter.
//   ROOT=<suite root> node scripts/check-gl-breasoning.mjs [topic]
// The repos must be in ROOT/Dropbox/GitHub-private2/ (as in Workflow settings).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { prologJobSpec } from '../src/prolog.js';
import { BR, DEFAULT_SETTINGS, LOADER, breasonGoal, glGoal, loaderText, relPath } from '../public/desktop/workflows-lib.js';

const root = path.resolve(process.env.ROOT ?? '.');
const topic = process.argv[2] ?? 'meditation';
const s = DEFAULT_SETTINGS;
const limit = process.env.STACK ?? '8G';

function run(label, spec, timeoutMs) {
  const job = prologJobSpec(spec, { swiplStackLimit: limit });
  console.log(`\n=== ${label}\n$ cd ${job.cwd} && swipl ${job.args.map((a) => (a.length > 300 ? `${a.slice(0, 300)}…` : a)).join(' ')}`);
  const started = Date.now();
  const r = spawnSync(job.cmd, job.args, { cwd: path.join(root, job.cwd), encoding: 'utf8', timeout: timeoutMs, input: '', maxBuffer: 1 << 28 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`exit ${r.status}${r.signal ? ` (${r.signal})` : ''} after ${secs}s`);
  console.log('--- stdout (end)\n' + (r.stdout ?? '').slice(-1500));
  console.log('--- stderr (end)\n' + (r.stderr ?? '').slice(-3000));
  return r;
}

fs.mkdirSync(path.join(root, path.dirname(LOADER)), { recursive: true });
fs.writeFileSync(path.join(root, LOADER), loaderText(s));
console.log(`Loader ${LOADER}:\n${loaderText(s)}`);

const gl = run(`Grammar Logic on "${topic}"`, { goal: glGoal(topic), consult: [relPath(s.awl, LOADER)], cwd: s.awl }, 10 * 60000);
const glOut = (gl.stdout ?? '').trim();
if (gl.status !== 0 || !glOut) {
  console.error('\nFAIL: Grammar Logic gave no output');
  process.exit(1);
}
const file = `${s.glFolder}/${topic} check.txt`;
fs.mkdirSync(path.join(root, s.glFolder), { recursive: true });
fs.writeFileSync(path.join(root, file), glOut + '\n');
console.log(`\nPASS Grammar Logic: ${glOut.length} characters, saved as ${file}`);

const br = run(`Breasoning ${file} (Br = ${BR})`, { goal: breasonGoal(relPath(s.t2b, file)), consult: [relPath(s.t2b, LOADER)], cwd: s.t2b }, Number(process.env.BR_TIMEOUT ?? 40 * 60000));
if (br.status !== 0) {
  console.error('\nFAIL: breasoning did not finish');
  process.exit(1);
}
console.log('\nPASS breasoning finished');
