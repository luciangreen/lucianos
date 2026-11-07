// Loads and validates the suite's configuration.
// Config file: ./config.json (copy config.example.json). Every field has a default.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  mode: 'local',            // 'local' = this machine only; 'remote' = reachable through a tunnel, password required
  port: 4170,
  host: null,               // local mode always uses 127.0.0.1; remote mode defaults to 127.0.0.1 behind `tailscale serve`
  root: '~',                // sandbox root: every file path and job cwd must stay inside it
  dataDir: '~/.lucianos',   // state, trash and sessions live here
  passwordHash: null,       // set with `npm run set-password`; required in remote mode
  secureCookie: false,      // true when served over HTTPS (e.g. `tailscale serve`)
  sessionDays: 30,
  maxConcurrentJobs: 4,
  jobOutputLimit: 1000000,  // characters of output kept per job
  allowedCommands: ['swipl', 'node', 'git', 'ls', 'echo', 'cat', 'cp', 'mv', 'mkdir', 'pwd'],
  swiplStackLimit: '54G'
};

export function expandHome(p) {
  if (typeof p !== 'string') return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadConfig({ file, overrides = {} } = {}) {
  let fromFile = {};
  const configPath = file ?? process.env.LUCIANOS_CONFIG ?? path.resolve('config.json');
  if (fs.existsSync(configPath)) {
    fromFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  const cfg = { ...DEFAULTS, ...fromFile, ...overrides, configPath };
  return finalise(cfg);
}

export function finalise(cfg) {
  if (!['local', 'remote'].includes(cfg.mode)) {
    throw new Error(`config.mode must be "local" or "remote", got ${JSON.stringify(cfg.mode)}`);
  }
  cfg.root = fs.realpathSync(path.resolve(expandHome(cfg.root)));
  cfg.dataDir = path.resolve(expandHome(cfg.dataDir));
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  if (cfg.mode === 'local') {
    cfg.host = '127.0.0.1';
  } else {
    // Default stays on this machine: `tailscale serve` forwards tunnel traffic to it over HTTPS.
    cfg.host = cfg.host ?? '127.0.0.1';
    if (!cfg.passwordHash) {
      throw new Error('Remote mode needs a suite password. Run: npm run set-password');
    }
  }
  if (!Array.isArray(cfg.allowedCommands)) throw new Error('config.allowedCommands must be a list');
  return cfg;
}
