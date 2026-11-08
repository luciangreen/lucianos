// Marquee (rubber-band) selection: the rectangle between where you pressed and where the pointer
// is now, which icons it touches, and how that combines with what was already selected.

// The rectangle between two points, whichever way you drag.
export const rectFrom = (a, b) => ({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) });

// Touching counts, as in the Finder: an icon is picked as soon as the rectangle overlaps it.
export const touches = (r, s) => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;

// Keys of the icons the rectangle touches: icons is [{ key, rect }].
export const hitsOf = (rect, icons) => icons.filter((i) => touches(rect, i.rect)).map((i) => i.key);

// The new selection: replace it (a plain drag), add to it (Shift), or flip the icons under the
// rectangle (⌘ or Ctrl). `base` is what was selected when the drag began.
export function combine(base, hits, mode = 'replace') {
  if (mode === 'add') return new Set([...base, ...hits]);
  if (mode === 'toggle') { const out = new Set(base); for (const k of hits) (base.has(k) ? out.delete(k) : out.add(k)); return out; }
  return new Set(hits);
}
export const modeOf = (e) => (e.metaKey || e.ctrlKey ? 'toggle' : e.shiftKey ? 'add' : 'replace');

// The rectangle as drawn: kept inside the window (or desktop) it is in.
export const clampRect = (r, b) => ({ left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom) });

// How fast to scroll when the pointer is near or past an edge of a scrolling window: up to
// `max` pixels a step, more the further out it is (0 when well inside).
export function edgeScroll(y, top, bottom, { zone = 24, max = 18 } = {}) {
  if (y < top + zone) return -Math.min(max, Math.ceil((top + zone - y) / 2));
  if (y > bottom - zone) return Math.min(max, Math.ceil((y - (bottom - zone)) / 2));
  return 0;
}
