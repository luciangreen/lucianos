// Icon views: the desktop (icons placed freely, positions remembered) and folder windows (a grid).
// Click selects (Shift/⌘ adds), double-click opens, drag moves icons or drops them into a folder.
// Hold ⌥ Option (Alt) while dropping to copy instead. Drop files on an iEdit window to put
// their contents into it.
import { api } from '/shared/api.js';
import { copyPlan } from './copy-lib.js';
import { el } from './dom.js';
import { appInfo, displayName, glyphFor, kindOf } from './filetypes.js';

const CELL_W = 96;
const CELL_H = 92;
const views = new Set();
let selection = { view: null, keys: new Set() };

export function currentSelection() {
  const { view, keys } = selection;
  if (!view) return { view: null, entries: [] };
  return { view, entries: view.entries.filter((e) => keys.has(e.key)) };
}

export function clearSelection() {
  if (selection.view) for (const n of selection.view.container.querySelectorAll('.icon.selected')) n.classList.remove('selected');
  selection = { view: null, keys: new Set() };
}

function select(view, key, add) {
  if (selection.view !== view || !add) clearSelection();
  selection.view = view;
  if (add && selection.keys.has(key)) selection.keys.delete(key);
  else selection.keys.add(key);
  for (const n of view.container.querySelectorAll('.icon')) n.classList.toggle('selected', selection.keys.has(n.dataset.key));
}

export function viewsShowing(folder) {
  return [...views].filter((v) => v.folder === folder);
}

export function refreshFolder(folder) {
  for (const v of viewsShowing(folder)) v.load();
}

// Copies entries into `dest`, renaming to "name copy.ext" where a name is taken.
// Returns the names made, and reports failures through onError.
export async function copyEntries(entries, dest, onError = console.error) {
  const files = entries.filter((e) => e.type !== 'app');
  const taken = new Set((await api.files.list(dest).catch(() => ({ entries: [] }))).entries.map((e) => e.name));
  const made = [];
  const errors = [];
  for (const step of copyPlan(files, dest, taken)) {
    try {
      await api.files.copy(step.from, step.to);
      made.push(step.name);
    } catch (err) {
      errors.push(`${step.from.split('/').pop()}: ${err.message}`);
    }
  }
  if (errors.length) onError(`Could not copy:\n${errors.join('\n')}`);
  refreshFolder(dest);
  return made;
}

// ⌘C / ⌘V for files: remembers what to copy; pasting copies it into a folder.
let clipboard = [];
export function copySelection() {
  clipboard = currentSelection().entries.filter((e) => e.type !== 'app').map((e) => ({ path: e.path, name: e.name, type: e.type }));
  return clipboard.length;
}
export const clipboardCount = () => clipboard.length;
export function pasteInto(folder, onError) {
  return copyEntries(clipboard, folder, onError);
}

// Dropping files on an iEdit window (an iframe of /apps/iedit/) hands their paths to iEdit.
function ieditFrameAt(x, y) {
  const under = document.elementFromPoint(x, y);
  return under?.tagName === 'IFRAME' && /\/apps\/iedit\//.test(under.src) ? under : null;
}
let hoverFrame = null;
function dragOverIedit(x, y) {
  const frame = ieditFrameAt(x, y);
  if (hoverFrame && hoverFrame !== frame) {
    hoverFrame.closest('.win')?.classList.remove('drop-into');
    hoverFrame.contentWindow?.postMessage({ type: 'iedit.dragLeave' }, location.origin);
  }
  hoverFrame = frame;
  if (!frame) return false;
  const r = frame.getBoundingClientRect();
  frame.closest('.win')?.classList.add('drop-into');
  frame.contentWindow?.postMessage({ type: 'iedit.dragOver', x: x - r.left, y: y - r.top }, location.origin);
  return true;
}

export class IconView {
  // free: icons placed anywhere (desktop). positions: { get(folder) -> {name: {x,y}}, save(folder, map) }
  constructor({ container, folder, free = false, positions = null, extra = () => [], onOpen, onError }) {
    this.container = container;
    this.folder = folder;
    this.free = free;
    this.positions = positions;
    this.extra = extra;
    this.onOpen = onOpen;
    this.onError = onError ?? console.error;
    this.entries = [];
    container.classList.add(free ? 'icons-free' : 'icons-grid');
    container.dataset.folder = folder;
    container.addEventListener('pointerdown', (e) => {
      if (e.target === container) clearSelection();
    });
    views.add(this);
  }

  destroy() {
    views.delete(this);
    if (selection.view === this) clearSelection();
  }

  async load() {
    let files = [];
    try {
      files = (await api.files.list(this.folder)).entries;
    } catch (err) {
      this.onError(`${this.folder || 'Home'}: ${err.message}`);
    }
    this.entries = [...this.extra(), ...files.map((f) => ({ ...f, key: f.path }))];
    this.render();
  }

  render() {
    const keep = selection.view === this ? selection.keys : new Set();
    const saved = this.free ? this.positions.get(this.folder) : {};
    const rows = Math.max(1, Math.floor((this.container.clientHeight - 16) / CELL_H));
    const taken = new Set(Object.values(saved).map((p) => `${Math.round(p.x / CELL_W)},${Math.round(p.y / CELL_H)}`));
    let slot = 0;
    const nextSlot = () => {
      for (;;) {
        const col = Math.floor(slot / rows);
        const row = slot % rows;
        slot++;
        if (!taken.has(`${col},${row}`)) return { x: 12 + col * CELL_W, y: 12 + row * CELL_H };
      }
    };
    const nodes = this.entries.map((entry) => {
      const node = this.iconNode(entry);
      if (keep.has(entry.key)) node.classList.add('selected');
      if (this.free) {
        const p = saved[entry.posKey ?? entry.name] ?? (entry.right ? null : nextSlot());
        const pos = p ?? { x: Math.max(12, this.container.clientWidth - CELL_W - 12), y: 12 + (entry.rightIndex ?? 0) * CELL_H };
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
      }
      return node;
    });
    this.container.replaceChildren(...nodes);
    if (!nodes.length && !this.free) this.container.append(el('p', { className: 'quiet emptyfolder', textContent: 'This folder is empty' }));
  }

  iconNode(entry) {
    const isApp = entry.type === 'app';
    const label = el('span', { className: 'label', textContent: isApp ? appInfo(entry.app).name : displayName(entry) });
    const node = el('div', {
      className: 'icon',
      title: isApp ? appInfo(entry.app).name : entry.path,
      tabIndex: 0,
      'data-key': entry.key,
      'data-kind': isApp ? 'app' : kindOf(entry)
    }, el('span', { className: 'glyph', textContent: isApp ? appInfo(entry.app).glyph : glyphFor(entry) }), label);
    node.addEventListener('dblclick', () => this.onOpen(entry));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.onOpen(entry);
    });
    this.dragging(node, entry);
    return node;
  }

  dragging(node, entry) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.tagName === 'INPUT') return;
      e.stopPropagation();
      const wasSelected = selection.view === this && selection.keys.has(entry.key);
      if (!wasSelected || e.shiftKey || e.metaKey || e.ctrlKey) select(this, entry.key, e.shiftKey || e.metaKey || e.ctrlKey);
      // touch: tapping an icon that was already selected opens it
      if (e.pointerType === 'touch' && wasSelected && selection.keys.size === 1) {
        this.onOpen(entry);
        return;
      }
      const start = { x: e.clientX, y: e.clientY };
      let moving = null;
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moving) {
          if (Math.hypot(dx, dy) < 6) return;
          moving = [...this.container.querySelectorAll('.icon.selected')];
          moving.forEach((n) => n.classList.add('dragging'));
          document.body.classList.add('dragging-icons');
        }
        for (const n of moving) n.style.transform = `translate(${dx}px, ${dy}px)`;
        document.body.classList.toggle('copying', ev.altKey);
        document.body.classList.toggle('into-iedit', dragOverIedit(ev.clientX, ev.clientY));
      };
      const up = async (ev) => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        if (!moving) return;
        document.body.classList.remove('dragging-icons', 'copying', 'into-iedit');
        dragOverIedit(-1, -1);
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        for (const n of moving) {
          n.classList.remove('dragging');
          n.style.transform = '';
        }
        await this.drop(ev.clientX, ev.clientY, moving.map((n) => n.dataset.key), dx, dy, { copy: ev.altKey });
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
  }

  async drop(x, y, keys, dx, dy, { copy = false } = {}) {
    const under = document.elementFromPoint(x, y);
    const moved = this.entries.filter((e) => keys.includes(e.key));
    const frame = ieditFrameAt(x, y);
    if (frame) {
      const paths = moved.filter((e) => e.type === 'file').map((e) => e.path);
      if (!paths.length) return this.onError('Only files can go into iEdit: drop a file, not a folder or app.');
      const r = frame.getBoundingClientRect();
      frame.contentWindow.postMessage({ type: 'iedit.insertFiles', paths, x: x - r.left, y: y - r.top }, location.origin);
      return;
    }
    const folderIcon = under?.closest('.icon[data-kind="dir"]');
    const targetView = [...views].find((v) => v.container.contains(under));
    let dest = null;
    if (folderIcon && !keys.includes(folderIcon.dataset.key)) dest = folderIcon.dataset.key;
    else if (targetView && targetView !== this && targetView.folder !== this.folder) dest = targetView.folder;

    if (copy) {
      // ⌥-drop: copy into the folder or window under the pointer, or duplicate here
      const into = dest ?? (targetView ? targetView.folder : this.folder);
      const made = await copyEntries(moved, into, this.onError);
      if (into === this.folder && this.free && made.length) {
        // put the duplicates where they were dropped
        const map = { ...this.positions.get(this.folder) };
        const copied = moved.filter((e) => e.type !== 'app');
        made.forEach((name, i) => {
          const n = this.container.querySelector(`.icon[data-key="${CSS.escape(copied[i]?.key ?? '')}"]`);
          if (!n) return;
          map[name] = {
            x: Math.max(0, Math.min(this.container.clientWidth - CELL_W, parseInt(n.style.left, 10) + dx)),
            y: Math.max(0, Math.min(this.container.clientHeight - CELL_H, parseInt(n.style.top, 10) + dy))
          };
        });
        this.positions.save(this.folder, map);
        await this.load();
      }
      return;
    }
    if (dest !== null) {
      const files = moved.filter((e) => e.type !== 'app');
      const errors = [];
      for (const f of files) {
        if (dest === f.path || dest.startsWith(`${f.path}/`)) continue;
        try {
          await api.files.move(f.path, dest ? `${dest}/${f.name}` : f.name);
        } catch (err) {
          errors.push(`${f.name}: ${err.message}`);
        }
      }
      if (errors.length) this.onError(errors.join('\n'));
      clearSelection();
      refreshFolder(this.folder);
      refreshFolder(dest);
      return;
    }
    if (this.free && (targetView === this || under === this.container || this.container.contains(under))) {
      const map = { ...this.positions.get(this.folder) };
      for (const e of moved) {
        const n = this.container.querySelector(`.icon[data-key="${CSS.escape(e.key)}"]`);
        const x0 = parseInt(n.style.left, 10) + dx;
        const y0 = parseInt(n.style.top, 10) + dy;
        map[e.posKey ?? e.name] = {
          x: Math.max(0, Math.min(this.container.clientWidth - CELL_W, x0)),
          y: Math.max(0, Math.min(this.container.clientHeight - CELL_H, y0))
        };
      }
      this.positions.save(this.folder, map);
      this.render();
    }
  }

  // Inline rename of one icon.
  rename(entry) {
    if (entry.type === 'app') return;
    const node = this.container.querySelector(`.icon[data-key="${CSS.escape(entry.key)}"]`);
    if (!node) return;
    const label = node.querySelector('.label');
    const input = el('input', { type: 'text', className: 'renamer', value: entry.name });
    label.replaceWith(input);
    input.focus();
    const dot = entry.type === 'dir' ? -1 : entry.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
    let done = false;
    const finish = async (commit) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (commit && name && name !== entry.name && !name.includes('/')) {
        const to = this.folder ? `${this.folder}/${name}` : name;
        try {
          await api.files.move(entry.path, to);
          if (this.free) {
            const map = { ...this.positions.get(this.folder) };
            if (map[entry.name]) {
              map[name] = map[entry.name];
              delete map[entry.name];
              this.positions.save(this.folder, map);
            }
          }
        } catch (err) {
          this.onError(`Could not rename: ${err.message}`);
        }
      }
      refreshFolder(this.folder);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  selectAll() {
    clearSelection();
    selection.view = this;
    for (const e of this.entries) selection.keys.add(e.key);
    for (const n of this.container.querySelectorAll('.icon')) n.classList.add('selected');
  }
}
