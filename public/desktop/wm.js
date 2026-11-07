// Window manager for the LucianOS desktop: draggable, resizable windows.
// On narrow screens (iPhone) windows fill the screen and a tab strip switches between them.
import { el } from './dom.js';

let zTop = 100;
let active = null;
const all = [];
let onChange = () => {};

export function setOnChange(fn) {
  onChange = fn;
}

export function windows() {
  return [...all];
}

export function activeWindow() {
  return active;
}

const narrow = () => matchMedia('(max-width: 760px)').matches;

export function createWindow({ title, kind, body, toolbar = null, status = null, geometry = null, className = '', onClose = null, data = {} }) {
  const desk = document.getElementById('desktop');
  const titleEl = el('span', { className: 'title', textContent: title });
  const closeBtn = el('button', { className: 'close', title: 'Close', textContent: '✕' });
  const titlebar = el('div', { className: 'titlebar' }, titleEl, closeBtn);
  const root = el('section', { className: `win ${className}` }, titlebar, toolbar, el('div', { className: 'body' }, body), status);
  const win = { root, kind, titleEl, data, body };

  const d = desk.getBoundingClientRect();
  const n = all.length;
  const g = geometry ?? {
    x: 40 + (n % 8) * 30,
    y: 20 + (n % 8) * 30,
    w: Math.min(720, Math.max(320, d.width - 120)),
    h: Math.min(480, Math.max(260, d.height - 80))
  };
  place(win, g);
  desk.append(root);
  all.push(win);

  win.setTitle = (t) => {
    titleEl.textContent = t;
    renderTabs();
  };
  win.focus = () => focus(win);
  win.geometry = () => ({ x: root.offsetLeft, y: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight });
  win.close = async () => {
    if (onClose && (await onClose()) === false) return;
    root.remove();
    all.splice(all.indexOf(win), 1);
    if (active === win) {
      active = null;
      all.at(-1)?.focus();
    }
    renderTabs();
    onChange();
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    win.close();
  });
  root.addEventListener('pointerdown', () => focus(win), true);
  dragByTitle(win, titlebar);
  new ResizeObserver(() => onChange()).observe(root);
  focus(win);
  onChange();
  return win;
}

function place(win, g) {
  Object.assign(win.root.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
}

function focus(win) {
  if (active === win) return;
  active?.root.classList.remove('active');
  active = win;
  win.root.classList.add('active');
  win.root.style.zIndex = ++zTop;
  renderTabs();
}

function dragByTitle(win, bar) {
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || narrow()) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: win.root.offsetLeft, top: win.root.offsetTop };
    document.body.classList.add('dragging-window'); // stops iframes swallowing the pointer
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      win.root.style.left = `${Math.max(-win.root.offsetWidth + 100, start.left + ev.clientX - start.x)}px`;
      win.root.style.top = `${Math.max(0, start.top + ev.clientY - start.y)}px`;
    };
    const up = () => {
      document.body.classList.remove('dragging-window');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      onChange();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
}

export function renderTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.replaceChildren(
    el('button', { className: active ? '' : 'active', textContent: 'Desktop', onclick: () => { active?.root.classList.remove('active'); active = null; renderTabs(); } }),
    ...all.map((w) => el('button', { className: w === active ? 'active' : '', textContent: w.titleEl.textContent, onclick: () => focus(w) }))
  );
  document.body.classList.toggle('has-active-window', !!active);
}
