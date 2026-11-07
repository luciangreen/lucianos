#!/usr/bin/env node
// Sets the suite password (needed for remote mode). Stores only a scrypt hash in config.json.
// Usage: npm run set-password
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { hashPassword } from '../src/auth.js';

const configPath = process.env.LUCIANOS_CONFIG ?? path.resolve('config.json');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide what is typed.
  rl._writeToOutput = (s) => {
    if (s.includes(question)) rl.output.write(s);
  };
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    process.stdout.write('\n');
    resolve(answer);
  }));
}

const first = await ask('New suite password: ');
const second = await ask('Type it again: ');
if (first !== second) {
  console.error('The two passwords differ. Nothing changed.');
  process.exit(1);
}
let hash;
try {
  hash = hashPassword(first);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
cfg.passwordHash = hash;
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
console.log(`Password saved (as a hash) in ${configPath}`);
