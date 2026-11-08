// A pop-up menu at a point (right-click, Control-click, or touch and hold). Items are
// { label, key?, icon?, action, disabled? } or null for a divider. Escape, a click outside,
// scrolling or resizing closes it; arrow keys and Enter work too.
import { el } from './dom.js';

let open = null;

export function closeContextMenu() {
  if (!open) return;
  open.remove();
  open = null;
  removeEventListener('pointerdown', outside, true);
  removeEventListener('keydown', keys, true);
  removeEventListener('resize', closeContextMenu);
  removeEventListener('blur', closeContextMenu);
}

function outside(e) {
  if (open && !open.contains(e.target)) closeContextMenu();
}

function keys(e) {
  if (!open) return;
  const buttons = [...open.querySelectorAll('button:not(:disabled)')];
  const i = buttons.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
}

export function showContextMenu(x, y, items) {
  closeContextMenu();
  const menu = el('div', { className: 'ctxmenu', role: 'menu' }, ...items.map((it) => it === null ? el('hr') :
    el('button', {
      role: 'menuitem',
      disabled: !!it.disabled,
      onclick: () => { closeContextMenu(); it.action(); }
    }, el('span', { className: 'withicon' }, ...(it.icon ? [it.icon] : []), it.label), el('span', { className: 'key', textContent: it.key ?? '' }))));
  document.body.append(menu);
  // keep it on screen: flip left or up when it would run off the edge
  const r = menu.getBoundingClientRect();
  const left = x + r.width > innerWidth - 4 ? Math.max(4, x - r.width) : x;
  const top = y + r.height > innerHeight - 4 ? Math.max(4, innerHeight - 4 - r.height) : y;
  Object.assign(menu.style, { left: `${left}px`, top: `${top}px` });
  open = menu;
  // listen after this event has finished, so the press that opened it does not close it
  setTimeout(() => {
    addEventListener('pointerdown', outside, true);
    addEventListener('keydown', keys, true);
    addEventListener('resize', closeContextMenu);
    addEventListener('blur', closeContextMenu);
  });
  return menu;
}
