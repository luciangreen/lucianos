// Prolog bridge: runs a goal in SWI-Prolog as a job, without an interactive prompt.
// Equivalent to typing at the ?- prompt:  ['a.pl'].  Goal.  halt.
import { HttpError, readJson, sendJson } from './http-util.js';

export function quoteAtom(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// spec: { goal, consult?: [files relative to cwd], cwd?, stackLimit?, label?, tempDir?, stdin? }
export function prologJobSpec(spec, cfg) {
  const { goal, consult = [], cwd = '', stackLimit, label, tempDir, stdin } = spec ?? {};
  if (typeof goal !== 'string' || !goal.trim()) throw new HttpError(400, 'goal is required');
  if (!Array.isArray(consult) || !consult.every((f) => typeof f === 'string')) {
    throw new HttpError(400, 'consult must be a list of file names');
  }
  const limit = stackLimit ?? cfg.swiplStackLimit;
  if (!/^\d+[KMG]?$/.test(String(limit))) throw new HttpError(400, 'stackLimit looks like 54G');
  const body = goal.trim().replace(/\.\s*$/, '');
  const fullGoal = consult.length ? `consult([${consult.map(quoteAtom).join(',')}]), (${body})` : `(${body})`;
  return {
    cmd: 'swipl',
    args: [`--stack-limit=${limit}`, '-g', fullGoal, '-t', 'halt'],
    cwd,
    label: label ?? `swipl: ${body.slice(0, 100)}`,
    tempDir,
    stdin
  };
}

export function prologRoutes(router, runner, cfg) {
  router.post('/api/prolog', async (req, res) => {
    const job = runner.create(prologJobSpec(await readJson(req), cfg));
    sendJson(res, 201, runner.summary(job));
  });
}
