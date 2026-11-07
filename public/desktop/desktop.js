// LucianOS desktop: icons, folder windows, apps in windows, spotlight, calculator, time converter.
import { api } from '/shared/api.js';
import { $, el } from './dom.js';
import { COMMON_ZONES, convertTime, evaluate, looksLikeSum } from './calc.js';
import { appInfo, displayName, glyphFor, kindOf, makeUrlFile, parseUrlFile, safeUrl } from './filetypes.js';
import { IconView, clearSelection, currentSelection, refreshFolder } from './icons.js';
import { activeWindow, createWindow, renderTabs, setOnChange, windows } from './wm.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? '⌘' : 'Ctrl+';
let info;
let state = { desktopFolder: null, positions: {}, windows: [], recent: [], calc: { input: '', history: [] }, time: {} };
let desktopView;
let restoring = false;

// ---------------- notices ----------------
function notice(text, kind = 'quiet') {
  $('notice').textContent = text;
  $('notice').className = `status ${kind}`;
  clearTimeout(notice.t);
  if (text) notice.t = setTimeout(() => ($('notice').textContent = ''), 7000);
}
const showError = (msg) => notice(msg, 'error');

// ---------------- saved state ----------------
let saveTimer;
function saveState() {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    state.windows = windows().map((w) => ({ ...w.data, kind: w.kind, geometry: w.geometry() }));
    api.state.set('lucianos-desktop', state).catch(() => {});
  }, 500);
}
setOnChange(saveState);

const positions = {
  get: (folder) => state.positions[folder] ?? {},
  save: (folder, map) => {
    state.positions[folder] = map;
    saveState();
  }
};

function rememberFolder(folder) {
  state.recent = [folder, ...state.recent.filter((f) => f !== folder)].slice(0, 10);
  buildGoMenu();
}

// ---------------- opening things ----------------
async function openEntry(entry) {
  if (entry.type === 'app') return openApp(entry.app);
  const kind = kindOf(entry);
  try {
    if (kind === 'dir') return openFolder(entry.path);
    if (kind === 'script') return openApp('shellrunscriptmaker', { open: entry.path, run: '1' });
    if (kind === 'url') {
      const { content } = await api.files.read(entry.path);
      const url = safeUrl(parseUrlFile(content));
      if (!url) return showError(`${entry.name} has no web address in it`);
      return openUrl(url, displayName(entry));
    }
    if (kind === 'text') return openApp('iedit', { open: entry.path });
    if (['image', 'audio', 'video', 'pdf'].includes(kind)) return openViewer(entry);
    if (confirm(`${entry.name} may not be a text file. Open it in iEdit anyway?`)) openApp('iedit', { open: entry.path });
  } catch (err) {
    showError(err.message);
  }
}

function openUrl(url, title) {
  if (url.startsWith('/')) {
    const m = /^\/apps\/([^/?#]+)/.exec(url);
    if (m && info.apps.includes(m[1])) {
      const params = Object.fromEntries(new URL(url, location.origin).searchParams);
      return openApp(m[1], params);
    }
    return frameWindow({ kind: 'page', title: title ?? url, src: url, data: { url } });
  }
  window.open(url, '_blank', 'noopener');
}

function frameWindow({ kind, title, src, data, geometry, className = '' }) {
  const frame = el('iframe', { src, title });
  frame.setAttribute('allow', 'clipboard-read; clipboard-write; camera; microphone');
  const win = createWindow({ kind, title, body: frame, geometry, className: `framewin ${className}`, data });
  win.frame = frame;
  return win;
}

// Opens an app in a desktop window, or reuses its window: iEdit and shellrun take a message.
function openApp(id, params = {}, geometry = null) {
  if (!info.apps.includes(id)) return showError(`${appInfo(id).name} is not installed. Clone its repo into lucianos/apps/.`);
  const existing = windows().find((w) => w.kind === 'app' && w.data.app === id);
  if (existing) {
    existing.focus();
    if (params.open) existing.frame.contentWindow.postMessage({ type: `${id}.open`, path: params.open, run: params.run === '1', line: params.line }, location.origin);
    return existing;
  }
  const qs = new URLSearchParams(params).toString();
  const big = { x: 60, y: 24, w: Math.min(1100, innerWidth - 120), h: Math.min(720, innerHeight - 110) };
  return frameWindow({ kind: 'app', title: appInfo(id).name, src: `/apps/${id}/${qs ? `?${qs}` : ''}`, data: { app: id }, geometry: geometry ?? big });
}

function openViewer(entry, geometry) {
  const src = api.files.rawUrl(entry.path);
  const kind = kindOf(entry);
  let body;
  if (kind === 'image') body = el('div', { className: 'viewer' }, el('img', { src, alt: entry.name }));
  else if (kind === 'audio') body = el('div', { className: 'viewer' }, el('audio', { src, controls: true }));
  else if (kind === 'video') body = el('div', { className: 'viewer' }, el('video', { src, controls: true }));
  else body = el('iframe', { src, title: entry.name });
  return createWindow({ kind: 'viewer', title: entry.name, body, geometry, className: 'framewin', data: { path: entry.path, name: entry.name, type: 'file' } });
}

// ---------------- folder windows ----------------
function openFolder(path, geometry = null) {
  const existing = windows().find((w) => w.kind === 'folder' && w.data.path === path);
  if (existing) return existing.focus();
  const iconsBox = el('div', { className: 'iconsbox' });
  const crumbs = el('div', { className: 'crumbs' });
  const count = el('span', { className: 'quiet' });
  const toolbar = el('div', { className: 'toolbar' },
    el('button', { textContent: '↑', title: 'Up one folder', onclick: () => go(path.split('/').slice(0, -1).join('/')) }),
    crumbs,
    el('span', { className: 'spacer' }),
    el('button', { textContent: 'New folder', onclick: () => newFolder(view.folder) }),
    el('button', { className: 'danger', textContent: 'Delete', title: 'Move the selected items to the trash', onclick: trashSelection }));
  const win = createWindow({ kind: 'folder', title: '', body: iconsBox, toolbar, status: el('div', { className: 'statusline' }, count), geometry, data: { path } });
  const view = new IconView({ container: iconsBox, folder: path, onOpen: openEntry, onError: showError });
  let stopWatch = null;
  const show = () => {
    win.setTitle(path ? path.split('/').pop() : 'Home');
    crumbs.replaceChildren(el('button', { textContent: 'Home', onclick: () => go('') }),
      ...(path ? path.split('/') : []).map((p, i, a) => el('button', { textContent: p, onclick: () => go(a.slice(0, i + 1).join('/')) })));
    view.load().then(() => (count.textContent = `${view.entries.length} items`));
    stopWatch?.();
    let t;
    stopWatch = api.files.watch(path, () => {
      clearTimeout(t);
      t = setTimeout(() => view.load().then(() => (count.textContent = `${view.entries.length} items`)), 300);
    });
  };
  const go = (p) => {
    path = p;
    view.folder = p;
    iconsBox.dataset.folder = p;
    win.data.path = p;
    rememberFolder(p);
    show();
    saveState();
  };
  win.view = view;
  const close = win.close;
  win.close = async () => {
    stopWatch?.();
    view.destroy();
    await close();
  };
  rememberFolder(path);
  show();
  return win;
}

// Where "New folder" etc. go: the active folder window, else the desktop folder.
function targetFolder() {
  const w = activeWindow();
  if (w?.kind === 'folder') return w.data.path;
  return state.desktopFolder ?? '';
}

async function newFolder(folder = targetFolder()) {
  const name = prompt('New folder name', 'untitled folder');
  if (!name) return;
  try {
    await api.files.mkdir(folder ? `${folder}/${name}` : name);
    refreshFolder(folder);
  } catch (err) {
    showError(err.message);
  }
}

async function newTextFile(folder = targetFolder()) {
  const name = prompt('New text file name', 'untitled.txt');
  if (!name) return;
  const path = folder ? `${folder}/${name}` : name;
  try {
    const list = await api.files.list(folder);
    if (list.entries.some((e) => e.name === name)) return showError(`${name} already exists`);
    await api.files.write(path, '');
    refreshFolder(folder);
    openApp('iedit', { open: path });
  } catch (err) {
    showError(err.message);
  }
}

async function newUrlIcon(folder = targetFolder()) {
  const url = prompt('Web address (https://…) or suite path (/apps/iedit/)');
  if (!url) return;
  if (!safeUrl(url)) return showError('Use an address starting with https://, http:// or /');
  let name = prompt('Icon name', url.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '') || 'link');
  if (!name) return;
  name = name.replace(/\//g, '-');
  try {
    await api.files.write(folder ? `${folder}/${name}.url` : `${name}.url`, makeUrlFile(url));
    refreshFolder(folder);
  } catch (err) {
    showError(err.message);
  }
}

async function trashSelection() {
  const { view, entries } = currentSelection();
  const files = entries.filter((e) => e.type !== 'app');
  if (!files.length) return notice('Select something first');
  const names = files.map((f) => f.name);
  if (!confirm(`Move ${files.length === 1 ? `"${names[0]}"` : `${files.length} items`} to the trash?\n\nThey go to ~/.lucianos/trash, so you can get them back.`)) return;
  for (const f of files) {
    try {
      await api.files.trash(f.path);
    } catch (err) {
      showError(`${f.name}: ${err.message}`);
    }
  }
  clearSelection();
  refreshFolder(view.folder);
}

function renameSelection() {
  const { view, entries } = currentSelection();
  if (entries.length !== 1) return notice('Select one item to rename');
  view.rename(entries[0]);
}

function openSelection() {
  const { entries } = currentSelection();
  entries.slice(0, 8).forEach(openEntry);
}

// ---------------- calculator and time ----------------
function calculatorWindow(geometry = null) {
  const existing = windows().find((w) => w.kind === 'calc');
  if (existing) {
    existing.focus();
    existing.body.querySelector('input').focus();
    return existing;
  }
  const input = el('input', { type: 'text', className: 'mono calcinput', value: state.calc.input ?? '', placeholder: 'e.g. 2 (3 + 4) ^ 2   or   2h 30m + 45 min   or   90 min in h', 'aria-label': 'Sum' });
  const result = el('output', { className: 'calcresult', 'aria-live': 'polite' });
  const detail = el('div', { className: 'quiet mono' });
  const copyBtn = el('button', { textContent: 'Copy', title: 'Copy the answer' });
  const history = el('ol', { className: 'calchistory' });
  const show = () => {
    const text = input.value;
    state.calc.input = text;
    if (!text.trim()) {
      result.textContent = state.calc.last ?? '';
      result.classList.remove('error');
      detail.textContent = '';
      return;
    }
    try {
      const r = evaluate(text);
      result.textContent = r.text;
      result.classList.remove('error');
      detail.textContent = r.detail ?? '';
      state.calc.last = r.text;
    } catch (err) {
      result.textContent = err.message;
      result.classList.add('error');
      detail.textContent = '';
    }
    saveState();
  };
  const renderHistory = () => {
    history.replaceChildren(...(state.calc.history ?? []).map((h) =>
      el('li', { title: 'Use this sum again', onclick: () => { input.value = h.input; show(); input.focus(); } },
        el('span', { className: 'mono', textContent: h.input }), el('span', { className: 'mono', textContent: ` = ${h.result}` }))));
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !result.classList.contains('error') && result.textContent) {
      state.calc.history = [{ input: input.value, result: result.textContent }, ...(state.calc.history ?? []).filter((h) => h.input !== input.value)].slice(0, 30);
      renderHistory();
      saveState();
    }
  });
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(result.textContent).catch(() => {});
    notice(`Copied ${result.textContent}`, 'ok');
  });
  const body = el('div', { className: 'calc' },
    input,
    el('div', { className: 'row' }, result, el('span', { className: 'spacer' }), copyBtn),
    detail,
    el('p', { className: 'quiet small', textContent: 'Brackets ( ) [ ] { }, spaces, + − × ÷ ^ %, mod, !, sqrt( ), pi. Durations: 2h 30m, 90 min in h. Enter keeps the sum in the history. The answer stays here until you change it.' }),
    history);
  const win = createWindow({ kind: 'calc', title: 'Calculator', body, geometry: geometry ?? { x: innerWidth - 470, y: 40, w: 420, h: 420 }, data: {} });
  show();
  renderHistory();
  input.focus();
  return win;
}

function timeWindow(geometry = null) {
  const existing = windows().find((w) => w.kind === 'time');
  if (existing) return existing.focus();
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const when = el('input', { type: 'datetime-local', value: state.time.when ?? local, 'aria-label': 'Date and time' });
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : COMMON_ZONES;
  const from = el('select', { 'aria-label': 'In time zone' }, ...zones.map((z) => el('option', { value: z, textContent: z.replace(/_/g, ' ') })));
  from.value = state.time.from ?? here;
  const nowBtn = el('button', { textContent: 'Now', onclick: () => { const d = new Date(); when.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); from.value = here; show(); } });
  const addZone = el('select', { 'aria-label': 'Add a time zone' }, el('option', { value: '', textContent: 'Add a place…' }), ...zones.map((z) => el('option', { value: z, textContent: z.replace(/_/g, ' ') })));
  const list = el('ul', { className: 'zones' });
  state.time.zones ??= COMMON_ZONES.filter((z) => z !== here);
  const show = () => {
    state.time.when = when.value;
    state.time.from = from.value;
    try {
      const rows = convertTime(when.value, from.value, state.time.zones);
      list.replaceChildren(...rows.map((r) => el('li', {},
        el('span', { className: 'zone', textContent: r.zone.replace(/_/g, ' ') }),
        el('span', { className: 'mono', textContent: r.text }),
        el('button', { textContent: '✕', title: 'Remove', onclick: () => { state.time.zones = state.time.zones.filter((z) => z !== r.zone); show(); } }))));
    } catch (err) {
      list.replaceChildren(el('li', { className: 'error', textContent: err.message }));
    }
    saveState();
  };
  when.addEventListener('input', show);
  from.addEventListener('change', show);
  addZone.addEventListener('change', () => {
    if (addZone.value && !state.time.zones.includes(addZone.value)) state.time.zones.push(addZone.value);
    addZone.value = '';
    show();
  });
  const body = el('div', { className: 'timeconv' },
    el('div', { className: 'row' }, when, el('span', { className: 'quiet', textContent: 'in' }), from, nowBtn),
    list,
    el('div', { className: 'row' }, addZone),
    el('p', { className: 'quiet small', textContent: 'For durations (2h 30m + 45 min, 90 min in h) use the Calculator.' }));
  const win = createWindow({ kind: 'time', title: 'Time converter', body, geometry: geometry ?? { x: innerWidth - 560, y: 80, w: 520, h: 460 }, data: {} });
  show();
  return win;
}

// ---------------- spotlight ----------------
let spotTimer;
let spotItems = [];
let spotIndex = 0;

async function spotlight(contents = false) {
  const q = $('spot').value.trim();
  const box = $('spotResults');
  if (!q) {
    box.classList.add('hidden');
    return;
  }
  const items = [];
  if (looksLikeSum(q)) {
    const r = evaluate(q);
    items.push({ glyph: '=', label: r.text, sub: 'Answer · Enter copies it', action: async () => { await navigator.clipboard.writeText(r.text).catch(() => {}); notice(`Copied ${r.text}`, 'ok'); } });
  }
  for (const id of info.apps) {
    if (appInfo(id).name.toLowerCase().includes(q.toLowerCase())) items.push({ glyph: appInfo(id).glyph, label: appInfo(id).name, sub: 'App', action: () => openApp(id) });
  }
  for (const [label, fn] of [['Calculator', calculatorWindow], ['Time converter', timeWindow]]) {
    if (label.toLowerCase().includes(q.toLowerCase())) items.push({ glyph: '🧮', label, sub: 'Tool', action: () => fn() });
  }
  spotItems = items;
  renderSpot(contents ? 'Searching names and contents…' : 'Searching…');
  try {
    const { results, truncated } = await api.files.search(q, { contents, path: '' });
    if ($('spot').value.trim() !== q) return; // typed on since
    for (const r of results.slice(0, 40)) {
      const entry = { type: r.type, path: r.path, name: r.path.split('/').pop(), size: 0 };
      items.push({
        glyph: glyphFor(entry),
        label: displayName(entry),
        sub: r.match === 'contents' ? `${r.path}:${r.line}  ${r.text.trim()}` : r.path,
        action: () => (r.match === 'contents' && kindOf(entry) === 'text' ? openApp('iedit', { open: r.path, line: String(r.line) }) : openEntry(entry))
      });
    }
    spotItems = items;
    renderSpot(truncated ? 'More matches not shown' : results.length ? '' : 'No files found');
  } catch (err) {
    renderSpot(err.message);
  }
  if (!contents) {
    $('spotResults').append(el('li', { className: 'spotmore', onclick: () => spotlight(true) }, el('span', { textContent: '🔎' }), el('span', { textContent: `Search inside files for “${q}”` })));
  }
}

function renderSpot(message) {
  const box = $('spotResults');
  spotIndex = Math.min(spotIndex, Math.max(0, spotItems.length - 1));
  box.replaceChildren(...spotItems.map((it, i) => {
    const li = el('li', { className: i === spotIndex ? 'current' : '' }, el('span', { className: 'glyph', textContent: it.glyph }),
      el('span', { className: 'text' }, el('span', { textContent: it.label }), el('span', { className: 'quiet small', textContent: it.sub })));
    li.addEventListener('click', () => { closeSpot(); it.action(); });
    return li;
  }));
  if (message) box.append(el('li', { className: 'quiet small', textContent: message }));
  box.classList.remove('hidden');
}

function closeSpot() {
  $('spotResults').classList.add('hidden');
  $('spot').blur();
}

$('spot').addEventListener('input', () => {
  spotIndex = 0;
  clearTimeout(spotTimer);
  spotTimer = setTimeout(() => spotlight(false), 250);
});
$('spot').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { spotIndex = Math.min(spotItems.length - 1, spotIndex + 1); renderSpot(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { spotIndex = Math.max(0, spotIndex - 1); renderSpot(); e.preventDefault(); }
  if (e.key === 'Enter' && spotItems[spotIndex]) { const it = spotItems[spotIndex]; closeSpot(); it.action(); }
  if (e.key === 'Escape') closeSpot();
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.spotlight')) $('spotResults').classList.add('hidden');
});

// ---------------- menus ----------------
function buildMenu(name, items) {
  const box = document.querySelector(`.menu[data-menu="${name}"] .items`);
  box.replaceChildren(...items.map((it) => it === null ? el('hr') :
    el('button', { onclick: () => { closeMenus(); it.action(); } }, el('span', { textContent: it.label }), el('span', { className: 'key', textContent: it.key ?? '' }))));
}
function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}
for (const m of document.querySelectorAll('.menu')) {
  m.querySelector(':scope > button').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = m.classList.contains('open');
    closeMenus();
    if (!open) m.classList.add('open');
  });
}
document.addEventListener('click', closeMenus);

function buildGoMenu() {
  buildMenu('go', [
    { label: 'Home', action: () => openFolder('') },
    { label: 'Desktop folder', action: () => openFolder(state.desktopFolder ?? '') },
    { label: 'Choose desktop folder…', action: chooseDesktopFolder },
    null,
    ...state.recent.slice(0, 8).map((f) => ({ label: f || 'Home', action: () => openFolder(f) }))
  ]);
}

async function chooseDesktopFolder() {
  const f = prompt('Folder to show on the desktop (inside the suite folder, e.g. Desktop or Dropbox/GitHub)', state.desktopFolder ?? '');
  if (f === null) return;
  try {
    await api.files.list(f.trim());
  } catch (err) {
    return showError(err.message);
  }
  state.desktopFolder = f.trim();
  desktopView.folder = state.desktopFolder;
  desktopView.container.dataset.folder = state.desktopFolder;
  await desktopView.load();
  saveState();
}

function buildMenus() {
  buildMenu('lucianos', [
    { label: 'About LucianOS', action: () => alert(`LucianOS suite (${info.mode} mode)\nSuite folder: ${info.rootName}\nApps: ${info.apps.map((a) => appInfo(a).name).join(', ') || 'none yet'}`) },
    { label: 'Platform check page', action: () => frameWindow({ kind: 'page', title: 'Platform check', src: '/check.html', data: { url: '/check.html' } }) },
    null,
    { label: 'Log out', action: async () => { await api.logout(); location.href = '/login.html'; } }
  ]);
  buildMenu('file', [
    { label: 'Open', key: `${MOD}O`, action: openSelection },
    { label: 'New folder', action: () => newFolder() },
    { label: 'New text file', action: () => newTextFile() },
    { label: 'New URL icon', action: () => newUrlIcon() },
    null,
    { label: 'Rename', key: 'Enter', action: renameSelection },
    { label: 'Move to trash', key: '⌫', action: trashSelection },
    null,
    { label: 'Close window', action: () => activeWindow()?.close() }
  ]);
  buildGoMenu();
  buildMenu('apps', info.apps.length ? info.apps.map((id) => ({ label: `${appInfo(id).glyph}  ${appInfo(id).name}`, action: () => openApp(id) }))
    : [{ label: 'No apps installed yet (clone them into lucianos/apps)', action: () => {} }]);
  buildMenu('tools', [
    { label: '🧮  Calculator', action: () => calculatorWindow() },
    { label: '🕒  Time converter', action: () => timeWindow() },
    { label: '🔎  Spotlight', key: `${MOD}K`, action: () => $('spot').focus() }
  ]);
}

// ---------------- keyboard ----------------
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  const mod = MAC ? e.metaKey : e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('spot').focus();
    $('spot').select();
    return;
  }
  if (typing) return;
  const { view } = currentSelection();
  if ((e.key === 'Delete' || e.key === 'Backspace') && view) { e.preventDefault(); trashSelection(); }
  else if (e.key === 'Enter' && view) { e.preventDefault(); renameSelection(); }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openSelection(); }
  else if (mod && e.key === 'ArrowDown') { e.preventDefault(); openSelection(); }
  else if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    const w = activeWindow();
    (w?.kind === 'folder' ? w.view : desktopView).selectAll();
  } else if (e.key === 'Escape') clearSelection();
});

// ---------------- clock ----------------
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// ---------------- start ----------------
async function init() {
  const session = await api.session();
  info = await api.info();
  document.body.classList.toggle('remote', session.mode === 'remote');
  const saved = await api.state.get('lucianos-desktop').catch(() => null);
  if (saved) state = { ...state, ...saved, calc: { ...state.calc, ...(saved.calc ?? {}) }, time: { ...(saved.time ?? {}) } };
  if (state.desktopFolder === null || state.desktopFolder === undefined) {
    const home = await api.files.list('');
    state.desktopFolder = home.entries.some((e) => e.type === 'dir' && e.name === 'Desktop') ? 'Desktop' : '';
  }
  buildMenus();
  tick();
  setInterval(tick, 15000);

  desktopView = new IconView({
    container: $('desktop-icons'),
    folder: state.desktopFolder,
    free: true,
    positions,
    extra: () => info.apps.map((id, i) => ({ type: 'app', app: id, key: `app:${id}`, name: id, posKey: `app:${id}`, right: true, rightIndex: i })),
    onOpen: openEntry,
    onError: showError
  });
  await desktopView.load();
  let t;
  api.files.watch(state.desktopFolder, () => {
    clearTimeout(t);
    t = setTimeout(() => desktopView.load(), 300);
  });
  addEventListener('resize', () => desktopView.render());

  // windows from last time
  restoring = true;
  for (const w of saved?.windows ?? []) {
    try {
      if (w.kind === 'folder') openFolder(w.path, w.geometry);
      else if (w.kind === 'app') openApp(w.app, {}, w.geometry);
      else if (w.kind === 'calc') calculatorWindow(w.geometry);
      else if (w.kind === 'time') timeWindow(w.geometry);
      else if (w.kind === 'page' && safeUrl(w.url)) frameWindow({ kind: 'page', title: w.url, src: w.url, data: { url: w.url }, geometry: w.geometry });
      else if (w.kind === 'viewer') openViewer({ path: w.path, name: w.name, type: 'file' }, w.geometry);
    } catch {}
  }
  restoring = false;
  renderTabs();

  const params = new URLSearchParams(location.search);
  if (params.get('open')) openEntry({ type: 'file', path: params.get('open'), name: params.get('open').split('/').pop(), size: 0 });
}

init().catch((err) => showError(err.message));
