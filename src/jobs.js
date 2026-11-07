// Job runner: runs allowed commands as child processes, queues them, streams output.
// Used by shellrun, LucianOS workflows, fastos batches and diagnostics.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpError, openSse, readJson, sendJson } from './http-util.js';

const KEEP_FINISHED = 200;

export class JobRunner {
  constructor({ cfg, sandbox, bus }) {
    this.cfg = cfg;
    this.sandbox = sandbox;
    this.bus = bus;
    this.jobs = new Map();
    this.queue = [];
    this.running = 0;
  }

  // spec: { cmd, args?, cwd?, label?, stdin?: bool, tempDir?: bool, env?: {} }
  create(spec) {
    const { cmd, args = [], cwd = '', label, stdin = false, tempDir = false, env = {} } = spec ?? {};
    if (typeof cmd !== 'string' || !cmd) throw new HttpError(400, 'cmd is required');
    if (cmd.includes('/') || cmd.includes('\\')) throw new HttpError(400, 'cmd must be a bare command name, e.g. "swipl"');
    if (!this.cfg.allowedCommands.includes(cmd)) {
      throw new HttpError(403, `"${cmd}" is not in allowedCommands in config.json`);
    }
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      throw new HttpError(400, 'args must be a list of strings');
    }
    if (typeof env !== 'object' || Object.values(env).some((v) => typeof v !== 'string')) {
      throw new HttpError(400, 'env values must be strings');
    }
    const absCwd = this.sandbox.resolve(cwd);
    if (!fs.existsSync(absCwd) || !fs.statSync(absCwd).isDirectory()) throw new HttpError(400, 'cwd must be an existing folder');

    const job = {
      id: crypto.randomBytes(6).toString('hex'),
      label: label ?? [cmd, ...args].join(' ').slice(0, 120),
      cmd,
      args,
      cwd: this.sandbox.relative(absCwd),
      absCwd,
      env,
      wantStdin: !!stdin,
      wantTempDir: !!tempDir,
      status: 'queued',
      exitCode: null,
      signal: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      output: [], // [{ stream: 'stdout'|'stderr'|'system', text }]
      outputChars: 0,
      truncated: false,
      emitter: null,
      child: null
    };
    job.listeners = new Set();
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.bus.publish('job.queued', this.summary(job));
    this.pump();
    return job;
  }

  pump() {
    while (this.running < this.cfg.maxConcurrentJobs && this.queue.length) {
      const job = this.queue.shift();
      if (job.status === 'queued') this.start(job);
    }
  }

  start(job) {
    this.running++;
    job.status = 'running';
    job.startedAt = Date.now();
    let tmp = null;
    if (job.wantTempDir) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucianos-job-'));
      job.tempDir = tmp;
    }
    const env = { ...process.env, ...job.env, LUCIANOS_JOB_ID: job.id };
    if (tmp) env.LUCIANOS_TMP = tmp;
    let child;
    try {
      child = spawn(job.cmd, job.args, { cwd: job.absCwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      this.append(job, 'system', `Could not start: ${err.message}\n`);
      this.finish(job, 'failed', null, null);
      return;
    }
    job.child = child;
    if (!job.wantStdin) child.stdin.end();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (t) => this.append(job, 'stdout', t));
    child.stderr.on('data', (t) => this.append(job, 'stderr', t));
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      this.append(job, 'system', `Could not start: ${err.message}\n`);
      this.finish(job, 'failed', null, null);
    });
    child.on('close', (code, signal) => {
      const status = job.cancelRequested ? 'cancelled' : code === 0 ? 'done' : 'failed';
      this.finish(job, status, code, signal);
    });
    this.bus.publish('job.started', this.summary(job));
  }

  finish(job, status, code, signal) {
    if (job.endedAt) return; // 'error' and 'close' can both fire
    job.status = status;
    job.exitCode = code;
    job.signal = signal;
    job.endedAt = Date.now();
    job.child = null;
    if (job.killTimer) clearTimeout(job.killTimer);
    if (job.tempDir) {
      fs.rmSync(job.tempDir, { recursive: true, force: true });
      job.tempDirDeleted = true;
    }
    this.running--;
    for (const l of job.listeners) l('end', this.summary(job));
    this.bus.publish('job.finished', this.summary(job));
    this.prune();
    this.pump();
  }

  append(job, stream, text) {
    const limit = this.cfg.jobOutputLimit;
    job.output.push({ stream, text });
    job.outputChars += text.length;
    while (job.outputChars > limit && job.output.length > 1) {
      job.outputChars -= job.output.shift().text.length;
      job.truncated = true;
    }
    for (const l of job.listeners) l('output', { stream, text });
  }

  cancel(job) {
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.endedAt = Date.now();
      this.queue = this.queue.filter((j) => j !== job);
      for (const l of job.listeners) l('end', this.summary(job));
      this.bus.publish('job.finished', this.summary(job));
      return;
    }
    if (job.status !== 'running' || !job.child) return;
    job.cancelRequested = true;
    job.child.kill('SIGTERM');
    job.killTimer = setTimeout(() => job.child?.kill('SIGKILL'), 5000);
  }

  input(job, text) {
    if (job.status !== 'running' || !job.child) throw new HttpError(409, 'Job is not running');
    if (!job.wantStdin) throw new HttpError(409, 'Job was started without stdin: true');
    job.child.stdin.write(text);
  }

  prune() {
    const finished = [...this.jobs.values()].filter((j) => j.endedAt).sort((a, b) => a.endedAt - b.endedAt);
    while (finished.length > KEEP_FINISHED) this.jobs.delete(finished.shift().id);
  }

  get(id) {
    const job = this.jobs.get(id);
    if (!job) throw new HttpError(404, 'No such job');
    return job;
  }

  summary(job) {
    return {
      id: job.id,
      label: job.label,
      cmd: job.cmd,
      args: job.args,
      cwd: job.cwd,
      status: job.status,
      exitCode: job.exitCode,
      signal: job.signal,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      truncated: job.truncated,
      tempDirDeleted: job.tempDirDeleted ?? undefined
    };
  }
}

export function jobRoutes(router, runner) {
  router.get('/api/jobs', (req, res) => {
    const list = [...runner.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map((j) => runner.summary(j));
    sendJson(res, 200, { jobs: list, allowedCommands: runner.cfg.allowedCommands });
  });

  router.post('/api/jobs', async (req, res) => {
    const job = runner.create(await readJson(req));
    sendJson(res, 201, runner.summary(job));
  });

  router.get('/api/jobs/:id', (req, res, { params }) => {
    const job = runner.get(params.id);
    sendJson(res, 200, { ...runner.summary(job), output: job.output });
  });

  // Replays output so far, then streams the rest; ends with an "end" event.
  router.get('/api/jobs/:id/stream', (req, res, { params }) => {
    const job = runner.get(params.id);
    const send = openSse(req, res);
    send('status', runner.summary(job));
    for (const chunk of job.output) send('output', chunk);
    if (job.endedAt) {
      send('end', runner.summary(job));
      res.end();
      return;
    }
    const listener = (event, data) => {
      send(event, data);
      if (event === 'end') res.end();
    };
    job.listeners.add(listener);
    req.on('close', () => job.listeners.delete(listener));
  });

  router.post('/api/jobs/:id/cancel', (req, res, { params }) => {
    const job = runner.get(params.id);
    runner.cancel(job);
    sendJson(res, 200, runner.summary(job));
  });

  router.post('/api/jobs/:id/input', async (req, res, { params }) => {
    const { text } = await readJson(req);
    if (typeof text !== 'string') throw new HttpError(400, 'text is required');
    runner.input(runner.get(params.id), text);
    sendJson(res, 200, { ok: true });
  });
}
