// Names for copied files, as the Mac Finder does: "notes.txt" → "notes copy.txt" →
// "notes copy 2.txt". Folders and files without an extension get " copy" at the end.

function split(name, isDir) {
  const dot = name.lastIndexOf('.');
  if (isDir || dot <= 0) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

// A free name for a copy of `name` among `taken` (a Set of names already in the folder).
export function copyName(name, taken, { isDir = false } = {}) {
  let [base, ext] = split(name, isDir);
  // copying "notes copy.txt" again gives "notes copy 2.txt", not "notes copy copy.txt"
  const m = /^(.*) copy(?: (\d+))?$/.exec(base);
  if (m) base = m[1];
  for (let n = 1; ; n++) {
    const candidate = `${base} copy${n === 1 ? '' : ` ${n}`}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Where each entry goes when copied into `dest`: its own name if free, else a copy name.
// Returns [{ from, to, name }], skipping a folder copied into itself.
export function copyPlan(entries, dest, taken) {
  const names = new Set(taken);
  const plan = [];
  for (const e of entries) {
    if (e.type === 'dir' && (dest === e.path || dest.startsWith(`${e.path}/`))) continue;
    const name = names.has(e.name) ? copyName(e.name, names, { isDir: e.type === 'dir' }) : e.name;
    names.add(name);
    plan.push({ from: e.path, to: dest ? `${dest}/${name}` : name, name });
  }
  return plan;
}
