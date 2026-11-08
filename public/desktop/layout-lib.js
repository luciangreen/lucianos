// Icon layout: tidy grids that fit the space, and sort orders. No DOM here (tested in Node).

export const CELL_W = 96;
export const CELL_H = 100;
export const MARGIN = 12;

// How many icons fit in a column of this height (at least one).
export const rowsFor = (height) => Math.max(1, Math.floor((height - MARGIN) / CELL_H));

// The i-th grid cell, filling columns top to bottom; from the right edge when right is true.
export function slot(i, { rows, width, right = false }) {
  const col = Math.floor(i / rows);
  const row = i % rows;
  const x = right ? Math.max(MARGIN, width - MARGIN - CELL_W - col * CELL_W) : MARGIN + col * CELL_W;
  return { x, y: MARGIN + row * CELL_H };
}

// Clean up: every icon gets a cell that fits in width × height, in the given order. Files fill
// columns from the left, apps (right: true) from the right. Returns { key: {x, y} }.
export function cleanUp(items, { width, height }) {
  const rows = rowsFor(height);
  const map = {};
  let left = 0;
  let right = 0;
  for (const it of items) map[it.key] = it.right ? slot(right++, { rows, width, right: true }) : slot(left++, { rows, width });
  return map;
}

// Whether a remembered spot is still on screen (the window or the phone may be smaller now).
export const fits = (p, { width, height }) => !!p && p.x >= 0 && p.y >= 0 && p.x + CELL_W <= width + 4 && p.y + CELL_H <= height + 4;

// Places for every icon: remembered spots that still fit, and free cells for the rest (files
// from the left, apps from the right), never two in one cell. Nothing here is remembered, so
// turning the phone back finds the old places again.
export function placeAll(items, saved, box) {
  const rows = rowsFor(box.height);
  const cell = (p) => `${Math.round((p.x - MARGIN) / CELL_W)},${Math.round((p.y - MARGIN) / CELL_H)}`;
  const taken = new Set();
  const out = {};
  for (const it of items) {
    const p = saved[it.posKey ?? it.key];
    if (fits(p, box)) { out[it.key] = p; taken.add(cell(p)); }
  }
  const next = { left: 0, right: 0 };
  for (const it of items) {
    if (out[it.key]) continue;
    const side = it.right ? 'right' : 'left';
    let p;
    // when the screen is full, icons share the last cells rather than vanish
    for (let tries = 0; tries < 2000; tries++) {
      p = slot(next[side]++, { rows, width: box.width, right: it.right });
      if (!taken.has(cell(p))) break;
    }
    out[it.key] = p;
    taken.add(cell(p));
  }
  return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const extOf = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };

// Sort orders: name (file2 before file10), kind (folders, then by extension), date (newest first).
// Apps always stay first, in their own order.
export function sortEntries(entries, by = 'name') {
  const apps = entries.filter((e) => e.type === 'app');
  const rest = entries.filter((e) => e.type !== 'app');
  const byName = (a, b) => collator.compare(a.name, b.name);
  const compare = {
    name: byName,
    kind: (a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || collator.compare(extOf(a.name), extOf(b.name)) || byName(a, b),
    date: (a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || byName(a, b)
  }[by] ?? byName;
  return [...apps, ...rest.sort(compare)];
}
