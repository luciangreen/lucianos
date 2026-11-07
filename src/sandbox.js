// Keeps every path inside the configured root folder.
// Paths from the browser are relative to the root ("Dropbox/GitHub/file.txt").
// Absolute paths are accepted only if they are already inside the root.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-util.js';

export class Sandbox {
  constructor(root) {
    this.root = root; // already realpath'd by config
  }

  // Returns an absolute path inside the root, or throws 403.
  resolve(userPath = '') {
    if (typeof userPath !== 'string') throw new HttpError(400, 'path must be a string');
    if (userPath.includes('\0')) throw new HttpError(400, 'Invalid path');
    const candidate = path.isAbsolute(userPath)
      ? path.resolve(userPath)
      : path.resolve(this.root, userPath);
    if (!this.inside(candidate)) throw new HttpError(403, 'Path is outside the suite folder');
    // Follow symlinks on the part that exists, so a link cannot point outside the root.
    const real = realpathOfExisting(candidate);
    if (!this.inside(real)) throw new HttpError(403, 'Path links outside the suite folder');
    return candidate;
  }

  inside(abs) {
    return abs === this.root || abs.startsWith(this.root + path.sep);
  }

  relative(abs) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }
}

// realpath of the deepest existing ancestor, with the missing tail re-attached.
function realpathOfExisting(abs) {
  let current = abs;
  const tail = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
      const parent = path.dirname(current);
      if (parent === current) return abs;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}
