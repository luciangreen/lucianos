// Finding a file or folder again after it was renamed or moved outside LucianOS (in the
// Finder, a terminal, Dropbox). A rename on the same disk keeps the entry's identity, its
// device and inode numbers, so we look for that identity near where the entry used to be.
// (Saving with LucianOS replaces a file by renaming a new copy over it, which changes the
// inode, so after each save the client takes the new id from the reply.)
import fsp from 'node:fs/promises';
import path from 'node:path';

export const idOf = (stat) => `${stat.dev}:${stat.ino}`;

const SKIP = new Set(['.git', 'node_modules', '.Trash', 'Library']);

async function isDir(abs) {
  try {
    return (await fsp.stat(abs)).isDirectory();
  } catch {
    return false;
  }
}

const inside = (root, abs) => abs === root || abs.startsWith(root + path.sep);

// The absolute path of the entry with this id, or null. Searches the nearest folder above
// `abs` that still exists, a few levels deep, then up to two folders above that, never
// leaving `root`, and gives up after `limit` entries.
export async function findById(root, abs, id, { depth = 3, climb = 2, limit = 20000 } = {}) {
  if (!id || !inside(root, abs)) return null;
  let base = path.dirname(abs);
  while (base !== root && inside(root, base) && !(await isDir(base))) base = path.dirname(base);
  if (!inside(root, base)) return null;
  const searched = new Set();
  let seen = 0;
  for (let up = 0; up <= climb; up++) {
    let level = [base];
    for (let d = 0; d <= depth + up && level.length; d++) {
      const next = [];
      for (const dir of level) {
        if (searched.has(dir)) continue;
        searched.add(dir);
        let names;
        try {
          names = await fsp.readdir(dir);
        } catch {
          continue;
        }
        for (const name of names) {
          if (++seen > limit) return null;
          const p = path.join(dir, name);
          let st;
          try {
            st = await fsp.lstat(p);
          } catch {
            continue;
          }
          if (idOf(st) === id) return p;
          if (st.isDirectory() && !SKIP.has(name)) next.push(p);
        }
      }
      level = next;
    }
    if (base === root) break;
    base = path.dirname(base);
  }
  return null;
}
