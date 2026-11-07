#!/usr/bin/env node
// Starts the LucianOS suite server.  Usage: npm start   (or: node server.js)
import { loadConfig } from './src/config.js';
import { createApp } from './src/app.js';

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  console.error(`Config problem: ${err.message}`);
  process.exit(1);
}

const { server } = createApp(cfg);
server.listen(cfg.port, cfg.host, () => {
  const where = cfg.mode === 'local' ? `http://localhost:${cfg.port}/` : `${cfg.host}:${cfg.port} (reach it through your tunnel, e.g. tailscale serve --bg ${cfg.port})`;
  console.log(`LucianOS suite running in ${cfg.mode} mode at ${where}`);
  console.log(`Suite folder: ${cfg.root}`);
  console.log(`Data folder:  ${cfg.dataDir}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('Stopping.');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
