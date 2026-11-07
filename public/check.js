// Phase 0 check page: proves the shared platform works end to end.
// Browse and search files, open/edit/save with conflict detection, run a job with live output.
import { api, notify } from '/shared/api.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let folder = '';
let selected = null; // {path, type}
let open = null; // {path, mtimeMs}
let dirty = false;
let currentJob = null;

// Split "a 'b c' d" into ['a', 'b c', 'd'].
export function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function say(text, kind = 'quiet') {
  $('notice').textContent = text;
  $('notice').className = `status ${kind}`;
}

async function init() {
  const session = await api.session();
  $('mode').textContent = session.mode === 'local' ? 'local mode · this machine only' : 'remote mode';
  if (session.passwordRequired) $('logout').classList.remove('hidden');
  const info = await api.info();
  for (const c of info.allowedCommands) $('cmd').append(el('option', { value: c, textContent: c }));

  const saved = (await api.state.get('phase0')) ?? {};
  folder = saved.folder ?? '';
  await showFolder(folder).catch(() => showFolder(''));
  if (saved.draft?.path) {
    await openFile(saved.draft.path).catch(() => {});
    if (open?.path === saved.draft.path && saved.draft.text !== $('editor').value) {
      $('editor').value = saved.draft.text;
      markDirty(true, 'Restored unsaved changes');
    }
  }
}

async function remember() {
  const draft = dirty && open ? { path: open.path, text: $('editor').value } : null;
  await api.state.set('phase0', { folder, draft });
}

async function showFolder(path) {
  const data = await api.files.list(path);
  folder = data.path;
  selected = null;
  updateButtons();
  renderCrumbs();
  const list = $('files');
  list.replaceChildren();
  if (folder) {
    const up = folder.split('/').slice(0, -1).join('/');
    list.append(el('li', { onclick: () => showFolder(up) }, el('span', { className: 'icon', textContent: '↑' }), el('span', { className: 'name', textContent: '..' })));
  }
  for (const e of data.entries) list.append(fileRow(e));
  remember();
}

function fileRow(entry) {
  const li = el('li', {},
    el('span', { className: 'icon', textContent: entry.type === 'dir' ? '📁' : '📄' }),
    el('span', { className: 'name', textContent: entry.name }),
    el('span', { className: 'quiet', textContent: entry.type === 'dir' ? '' : formatSize(entry.size) }));
  li.addEventListener('click', () => {
    document.querySelectorAll('#files li.selected').forEach((n) => n.classList.remove('selected'));
    li.classList.add('selected');
    selected = entry;
    updateButtons();
  });
  li.addEventListener('dblclick', () => (entry.type === 'dir' ? showFolder(entry.path) : openFile(entry.path)));
  return li;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderCrumbs() {
  const crumbs = $('crumbs');
  crumbs.replaceChildren(el('button', { textContent: 'Home', onclick: () => showFolder('') }));
  const parts = folder ? folder.split('/') : [];
  parts.forEach((name, i) => {
    crumbs.append(el('button', { textContent: name, onclick: () => showFolder(parts.slice(0, i + 1).join('/')) }));
  });
}

function updateButtons() {
  $('rename').disabled = !selected;
  $('trash').disabled = !selected;
}

async function openFile(path) {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  const f = await api.files.read(path);
  open = { path: f.path, mtimeMs: f.mtimeMs };
  $('editor').value = f.content;
  $('editor').disabled = false;
  $('openPath').textContent = f.path;
  markDirty(false, '');
}

function markDirty(value, message) {
  dirty = value;
  $('save').disabled = !open || !dirty;
  $('saveStatus').textContent = message ?? (dirty ? 'Unsaved' : 'Saved');
}

async function save(force = false) {
  try {
    const info = await api.files.write(open.path, $('editor').value, { baseMtime: open.mtimeMs, force });
    open.mtimeMs = info.mtimeMs;
    markDirty(false, 'Saved');
    remember();
  } catch (err) {
    if (err.status === 409 && confirm('The file changed on disk since you opened it. Overwrite it?')) return save(true);
    say(err.message, 'error');
  }
}

async function runCommand() {
  const out = $('output');
  out.replaceChildren();
  const text = $('args').value.trim();
  try {
    currentJob = $('isProlog').checked
      ? await api.jobs.prolog({ goal: text, cwd: folder })
      : await api.jobs.start({ cmd: $('cmd').value, args: splitArgs(text), cwd: folder });
  } catch (err) {
    out.append(el('span', { className: 'system', textContent: err.message + '\n' }));
    return;
  }
  $('run').disabled = true;
  $('cancel').disabled = false;
  out.append(el('span', { className: 'system', textContent: `$ ${currentJob.label}   (in ${currentJob.cwd || 'Home'})\n` }));
  api.jobs.stream(currentJob.id, {
    output: ({ stream, text: t }) => {
      out.append(el('span', { className: stream, textContent: t }));
      out.scrollTop = out.scrollHeight;
    },
    end: async (s) => {
      const msg = s.status === 'done' ? 'Finished' : s.status === 'cancelled' ? 'Interrupted' : `Failed (exit ${s.exitCode ?? s.signal})`;
      out.append(el('span', { className: 'system', textContent: `\n${msg}\n` }));
      $('run').disabled = false;
      $('cancel').disabled = true;
      currentJob = null;
      say(`${s.label}: ${msg}`, s.status === 'done' ? 'ok' : 'error');
      if (document.hidden) notify('LucianOS job', `${s.label}: ${msg}`);
    }
  });
}

// --- wiring ---
$('editor').addEventListener('input', () => {
  markDirty(true);
  clearTimeout(window.draftTimer);
  window.draftTimer = setTimeout(remember, 800);
});
$('save').addEventListener('click', () => save());
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && open) {
    e.preventDefault();
    save();
  }
});
$('logout').addEventListener('click', async () => {
  await api.logout();
  location.href = '/login.html';
});
$('newFile').addEventListener('click', async () => {
  const name = prompt('New file name');
  if (!name) return;
  const path = folder ? `${folder}/${name}` : name;
  try {
    await api.files.write(path, '');
    await showFolder(folder);
    await openFile(path);
  } catch (err) { say(err.message, 'error'); }
});
$('newFolder').addEventListener('click', async () => {
  const name = prompt('New folder name');
  if (!name) return;
  try {
    await api.files.mkdir(folder ? `${folder}/${name}` : name);
    await showFolder(folder);
  } catch (err) { say(err.message, 'error'); }
});
$('rename').addEventListener('click', async () => {
  const name = prompt('New name', selected.name);
  if (!name || name === selected.name) return;
  const to = folder ? `${folder}/${name}` : name;
  try {
    await api.files.move(selected.path, to);
    if (open?.path === selected.path) { open.path = to; $('openPath').textContent = to; }
    await showFolder(folder);
  } catch (err) { say(err.message, 'error'); }
});
$('trash').addEventListener('click', async () => {
  if (!confirm(`Move "${selected.name}" to the suite trash?`)) return;
  try {
    await api.files.trash(selected.path);
    await showFolder(folder);
  } catch (err) { say(err.message, 'error'); }
});
let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const text = $('search').value.trim();
    if (!text) return showFolder(folder);
    const { results, truncated } = await api.files.search(text, { path: folder, contents: $('searchContents').checked });
    const list = $('files');
    list.replaceChildren();
    for (const r of results) {
      const name = r.match === 'contents' ? `${r.path}:${r.line}  ${r.text.trim()}` : r.path;
      list.append(fileRow({ ...r, name, size: 0 }));
    }
    if (!results.length) list.append(el('li', { className: 'quiet', textContent: 'No matches' }));
    if (truncated) list.append(el('li', { className: 'quiet', textContent: 'More matches not shown' }));
  }, 300);
});
$('run').addEventListener('click', runCommand);
$('args').addEventListener('keydown', (e) => { if (e.key === 'Enter') runCommand(); });
$('cancel').addEventListener('click', () => currentJob && api.jobs.cancel(currentJob.id));
window.addEventListener('beforeunload', (e) => { if (dirty) { remember(); e.preventDefault(); } });

init().catch((err) => say(err.message, 'error'));
