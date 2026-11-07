// Workflows on the LucianOS desktop: the checklist, daily runs, Grammar Logic, breasoning,
// reminders and today's music. desktop.js passes in what it needs (ctx).
import { api } from '/shared/api.js';
import { midiStats, parseMidi, playMidi } from '/shared/midi.js';
import { bestMatch } from '/shared/character/commands.js';
import { el } from './dom.js';
import {
  DEFAULT_SETTINGS, KINDS, STATUSES, dailyToRun, dueReminder, glGoal, breasonGoal, loaderText, relPath, LOADER, isFinished, isRecent, needsPerson,
  newItem, ordered, parseTimes, slug, stamp, timeKey, today
} from './workflows-lib.js';

export function initWorkflows(ctx) {
  const { createWindow, windows, openApp, openUrl, notice, showError } = ctx;
  let st = { items: [], settings: { ...DEFAULT_SETTINGS }, lastDaily: null, handled: { day: null, times: [] }, showHidden: false, shortlist: [] };
  const running = new Map(); // item id -> 'running' | 'done' | 'failed'
  const say = (t) => ctx.character()?.say(t);
  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.state.set('workflows', st).catch(() => {}), 300);
  };
  const set = (item, fields) => {
    Object.assign(item, fields, { modified: Date.now() });
    save();
    renderChecklist();
  };
  const scriptsFolder = 'LucianOS/shellrun';

  async function load() {
    const saved = await api.state.get('workflows').catch(() => null);
    if (saved) st = { ...st, ...saved, settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) } };
    if (!saved) {
      // first time: the routine from the plan
      st.items = [
        newItem({ title: 'Grammar Logic', kind: 'gl', daily: true, comment: 'Topic, then breason and save the finished file' }),
        newItem({ title: "Listen to today's music", kind: 'music', daily: true, comment: 'Shortlist favourites for GarageBand' })
      ];
      const lib = await api.files.list(scriptsFolder).catch(() => ({ entries: [] }));
      const br = bestMatch('breasoning', lib.entries.filter((e) => e.name.endsWith('.shellrun.json')));
      if (br) st.items.push(newItem({ title: 'Breasoning (weekly)', kind: 'script', target: br.path }));
      save();
    }
  }

  // ------------------------------------------------------------ prompt bar
  // Questions stack under the menu bar; each goes away when answered.
  function prompt(text, buttons, key = text) {
    const box = document.getElementById('prompts') ?? document.body.appendChild(el('div', { id: 'prompts', className: 'prompts' }));
    box.querySelector(`[data-key="${CSS.escape(key)}"]`)?.remove();
    const bar = el('div', { className: 'promptbar', role: 'status' });
    bar.dataset.key = key;
    bar.append(el('span', { className: 'ptext', textContent: text }),
      ...buttons.map(([label, fn, primary]) => el('button', { className: primary ? 'primary' : '', textContent: label, onclick: () => { bar.remove(); fn?.(); } })),
      el('button', { className: 'pclose', textContent: '✕', title: 'Dismiss', onclick: () => bar.remove() }));
    box.append(bar);
  }

  // ------------------------------------------------------------ running items
  async function runItem(item) {
    try {
      switch (item.kind) {
        case 'script': return await runScript(item);
        case 'url': openUrl(item.target, item.title); return mark(item);
        case 'app': openApp(item.target); return mark(item);
        case 'note': openApp('iedit', { open: item.target }); return;
        case 'gl': return runGL(null, item);
        case 'music': return musicWindow();
        default: return showError(`Don't know how to run ${item.kind}`);
      }
    } catch (err) {
      showError(`${item.title}: ${err.message}`);
    }
  }

  function mark(item) {
    set(item, { finishedOn: today() });
  }

  async function runScript(item) {
    const { content } = await api.files.read(item.target);
    const script = JSON.parse(content);
    if (needsPerson(script)) {
      // pauses need you, so it runs in the shellrun window
      openApp('shellrunscriptmaker', { open: item.target, run: '1' });
      return 'opened';
    }
    const info = ctx.info();
    if (!info.apps.includes('shellrunscriptmaker')) throw new Error('shellrun is not installed');
    const job = await api.jobs.start({
      cmd: 'node',
      args: [`${info.appsDir}/shellrunscriptmaker/runner.mjs`, item.target],
      cwd: item.target.split('/').slice(0, -1).join('/'),
      stdin: true,
      tempDir: !!script.tempDir,
      label: `workflow: ${item.title}`
    });
    running.set(item.id, 'running');
    renderChecklist();
    return new Promise((resolve) => {
      api.jobs.stream(job.id, {
        end: (s) => {
          running.set(item.id, s.status === 'done' ? 'done' : 'failed');
          if (s.status === 'done') mark(item);
          else renderChecklist();
          resolve(s.status);
        }
      });
    });
  }

  async function runDaily() {
    const todo = dailyToRun(st.items);
    st.lastDaily = today();
    save();
    if (!todo.length) {
      say("Today's workflows are all done.");
      return 0;
    }
    checklistWindow();
    // scripts run side by side; the rest open in turn
    const scripts = todo.filter((i) => i.kind === 'script');
    const others = todo.filter((i) => i.kind !== 'script');
    say(`Starting ${todo.length} workflow${todo.length === 1 ? '' : 's'}: ${todo.map((i) => i.title).join(', ')}.`);
    for (const i of others) await runItem(i);
    await Promise.all(scripts.map((i) => runItem(i)));
    return todo.length;
  }

  // ------------------------------------------------------------ Grammar Logic
  async function runGL(topic = null, item = st.items.find((i) => i.kind === 'gl')) {
    const s = st.settings;
    topic = topic ?? window.prompt('Grammar Logic: what topic?', st.lastTopic ?? '');
    if (!topic?.trim()) return;
    topic = topic.trim();
    st.lastTopic = topic;
    save();
    try {
      await api.files.list(s.awl);
    } catch {
      return showError(`Can't find Algorithm-Writer-with-Lists at ${s.awl}. Set the folder in Workflow settings.`);
    }
    notice(`Grammar Logic on “${topic}”…`);
    say(`Running Grammar Logic on ${topic}.`);
    let job;
    try {
      job = await api.jobs.prolog({ goal: glGoal(topic), consult: [await writeLoader(s.awl)], cwd: s.awl, label: `Grammar Logic: ${topic}` });
    } catch (err) {
      return showError(`Grammar Logic couldn't start: ${err.message}`);
    }
    let out = '';
    let err = '';
    api.jobs.stream(job.id, {
      output: ({ stream, text }) => (stream === 'stdout' ? (out += text) : (err += text)),
      end: async (j) => {
        const glOut = out.trim();
        const lines = glOut ? [glOut] : [];
        if (j.status !== 'done' || !lines.length) {
          showError(`Grammar Logic didn't finish: ${(err || out || j.status).trim().split('\n').slice(-2).join(' ')}`);
          say("Grammar Logic didn't work this time. The message is at the top of the screen.");
          return;
        }
        const path = `${s.glFolder}/${slug(topic)} ${stamp()}.txt`;
        await api.files.write(path, lines.join('\n') + '\n', { mkdirs: true });
        if (item) set(item, { lastFile: path });
        openApp('iedit', { open: path });
        say(`Grammar Logic for ${topic} is open in iEdit. When you've finished it, I can breason it and save it.`);
        afterGL(path, item);
      }
    });
  }

  function afterGL(path, item) {
    prompt(`Grammar Logic is in ${path.split('/').pop()}. When it's finished:`, [
      ['Breason it', () => breason(path, item), true],
      ['Save finished copy…', () => saveFinished(path, item)]
    ]);
  }

  // The loader file that includes Text-to-Breasonings and Grammar Logic as find_char_map.pl does.
  // Returns its path from `cwd`, for consulting.
  async function writeLoader(cwd) {
    const s = st.settings;
    for (const [dir, file, what] of [[s.t2b, 'text_to_breasonings.pl', 'Text-to-Breasonings'], [s.awl, 'grammar_logic_to_alg1.pl', 'Algorithm-Writer-with-Lists']]) {
      const ok = await api.files.read(`${dir}/${file}`).then(() => true, () => false);
      if (!ok) throw new Error(`can't find ${file} in ${dir}. Set the ${what} folder in Workflow settings.`);
    }
    await api.files.write(LOADER, loaderText(s), { mkdirs: true });
    return relPath(cwd, LOADER);
  }

  // Breasons a Grammar Logic file in Text-to-Breasonings:
  // texttobr2(u,u,GL_out,Br,[auto,on]), texttobr(u,u,GL_out,u), with Br = 4*50*80.
  async function breason(path, item) {
    const t2b = st.settings.t2b;
    let job;
    try {
      job = await api.jobs.prolog({ goal: breasonGoal(relPath(t2b, path)), consult: [await writeLoader(t2b)], cwd: t2b, label: `Breasoning: ${path.split('/').pop()}` });
    } catch (err) {
      return showError(`Breasoning couldn't start: ${err.message}`);
    }
    say('Breasoning has started.');
    const out = el('pre', { className: 'output' });
    const stop = el('button', { textContent: 'Stop', onclick: () => api.jobs.cancel(job.id) });
    const state = el('span', { className: 'quiet', textContent: 'Running texttobr2 and texttobr…' });
    createWindow({ kind: 'breasoning', title: `Breasoning: ${path.split('/').pop()}`, body: el('div', { className: 'progwin' }, el('div', { className: 'row' }, state, el('span', { className: 'spacer' }), stop), out), geometry: { x: 220, y: 100, w: 620, h: 380 }, data: {} });
    api.jobs.stream(job.id, {
      output: ({ stream, text }) => {
        out.append(el('span', { className: stream, textContent: text }));
        out.scrollTop = out.scrollHeight;
      },
      end: (j) => {
        stop.disabled = true;
        if (j.status === 'done') {
          state.textContent = 'Finished.';
          say('Breasoning is finished.');
          prompt('Breasoning is finished. Save the finished Grammar Logic file?', [['Save finished copy…', () => saveFinished(path, item), true]]);
        } else {
          state.textContent = j.status === 'cancelled' ? 'Stopped.' : `Didn't finish (exit ${j.exitCode}).`;
          if (j.status !== 'cancelled') say("Breasoning didn't finish. The output is in its window.");
        }
      }
    });
  }

  async function saveFinished(path, item) {
    const name = path.split('/').pop();
    const dest = window.prompt('Save the finished Grammar Logic file to (folder/name inside the suite):', `${st.settings.glFolder}/finished/${name}`);
    if (!dest) return;
    try {
      await api.files.copy(path, dest.trim());
      notice(`Saved ${dest}`, 'ok');
      say('Saved. Grammar Logic is done for today.');
      if (item) mark(item);
    } catch (err) {
      showError(`Couldn't save: ${err.message}`);
    }
  }

  // ------------------------------------------------------------ reminders
  function checkReminders(now = new Date()) {
    const gl = st.items.find((i) => i.kind === 'gl' && !i.hidden);
    if (!gl || isFinished(gl)) return;
    if (st.handled.day !== today()) st.handled = { day: today(), times: [] };
    if (st.handled.skipToday) return;
    const t = dueReminder(parseTimes(st.settings.glTimes + (st.handled.extra ? `, ${st.handled.extra}` : '')), now, st.handled.times);
    if (!t) return;
    st.handled.times.push(timeKey(t));
    save();
    say(`It's ${timeKey(t)}. Time for Grammar Logic?`);
    prompt(`${timeKey(t)}: time for Grammar Logic?`, [
      ['Start now', () => runGL(null, gl), true],
      ['In an hour', () => { const d = new Date(Date.now() + 3600e3); st.handled.extra = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; save(); }],
      ['Not today', () => { st.handled.skipToday = true; save(); }]
    ]);
  }

  function morningQuestion() {
    if (st.lastDaily === today() || !dailyToRun(st.items).length) return;
    const gl = st.items.find((i) => i.kind === 'gl' && !i.hidden && !isFinished(i));
    prompt(`Good ${new Date().getHours() < 12 ? 'morning' : 'day'}. ${dailyToRun(st.items).length} daily workflows to do.`, [
      ["Run today's workflows", runDaily, true],
      ...(gl ? [['Grammar Logic now', () => runGL(null, gl)], [`Remind me (${st.settings.glTimes})`, () => { st.lastDaily = today(); save(); }]] : []),
      ['Not today', () => { st.lastDaily = today(); st.handled = { day: today(), times: [], skipToday: true }; save(); }]
    ]);
  }

  // ------------------------------------------------------------ checklist window
  let checklist = null;

  function checklistWindow(geometry = null) {
    const existing = windows().find((w) => w.kind === 'checklist');
    if (existing) {
      existing.focus();
      return existing;
    }
    const list = el('div', { className: 'checklist' });
    const hiddenToggle = el('input', { type: 'checkbox', checked: st.showHidden });
    hiddenToggle.addEventListener('change', () => { st.showHidden = hiddenToggle.checked; save(); renderChecklist(); });
    const collapse = el('button', { textContent: '–', title: 'Make it small' });
    const toolbar = el('div', { className: 'toolbar' },
      el('button', { className: 'primary', textContent: "▶ Run today's", title: "Run today's daily workflows", onclick: runDaily }),
      el('button', { textContent: '+ Add', onclick: () => addForm() }),
      el('button', { textContent: '⚙', title: 'Workflow settings', onclick: settingsWindow }),
      el('label', { className: 'quiet small' }, hiddenToggle, ' Show hidden'),
      el('span', { className: 'spacer' }),
      collapse);
    const win = createWindow({ kind: 'checklist', title: 'Checklist', body: list, toolbar, geometry: geometry ?? { x: 24, y: 24, w: 560, h: 420 }, data: {} });
    collapse.addEventListener('click', () => {
      const small = win.root.classList.toggle('collapsed');
      collapse.textContent = small ? '▢' : '–';
      collapse.title = small ? 'Show the list' : 'Make it small';
    });
    checklist = { win, list };
    const close = win.close;
    win.close = async () => { checklist = null; await close(); };
    renderChecklist();
    return win;
  }

  function renderChecklist() {
    if (!checklist) return;
    const day = today();
    const rows = ordered(st.items, st.showHidden).map(({ item, depth }) => {
      const done = el('input', { type: 'checkbox', checked: isFinished(item, day), title: item.daily ? 'Done today' : 'Finished' });
      done.addEventListener('change', () => set(item, { finishedOn: done.checked ? day : null }));
      const title = el('input', { type: 'text', className: 'wtitle', value: item.title, 'aria-label': 'Workflow name' });
      title.addEventListener('change', () => set(item, { title: title.value.trim() || item.title }));
      const status = el('select', { 'aria-label': 'Profitable status' }, ...STATUSES.map(([v, label]) => el('option', { value: v, textContent: label, selected: item.status === v })));
      status.addEventListener('change', () => set(item, { status: status.value }));
      status.dataset.status = item.status;
      const comment = el('input', { type: 'text', className: 'wcomment', value: item.comment ?? '', placeholder: 'Comment', 'aria-label': 'Comment' });
      comment.addEventListener('change', () => set(item, { comment: comment.value }));
      const daily = el('input', { type: 'checkbox', checked: item.daily, title: 'Run every day' });
      daily.addEventListener('change', () => set(item, { daily: daily.checked }));
      const state = running.get(item.id);
      const row = el('div', { className: `witem${isFinished(item, day) ? ' done' : ''}${item.hidden ? ' hiddenitem' : ''}`, 'data-id': item.id },
        el('div', { className: 'wline' }, done, title,
          el('span', { className: 'wkind', textContent: KINDS[item.kind] ?? item.kind }),
          state ? el('span', { className: `wstate ${state}`, textContent: { running: 'running…', done: 'done', failed: 'failed' }[state] }) : null,
          status,
          el('button', { textContent: '▶', title: 'Run it', onclick: () => runItem(item) }),
          el('button', { textContent: '＋', title: 'Add a child use', onclick: () => childUse(item) }),
          el('button', { textContent: item.hidden ? '👁' : '🙈', title: item.hidden ? 'Show' : 'Hide', onclick: () => set(item, { hidden: !item.hidden }) }),
          el('button', { textContent: '✕', title: 'Delete', onclick: () => remove(item) })),
        el('div', { className: 'wline sub' }, comment,
          el('label', { className: 'quiet small' }, daily, ' daily'),
          el('span', { className: 'quiet small', textContent: `made ${new Date(item.created).toLocaleDateString()} · changed ${new Date(item.modified).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` })));
      row.style.marginLeft = `${depth * 22}px`;
      return row;
    });
    checklist.list.replaceChildren(...rows);
    if (!rows.length) checklist.list.append(el('p', { className: 'quiet', textContent: 'No workflows yet. Press + Add.' }));
    const left = dailyToRun(st.items).length;
    checklist.win.setTitle(left ? `Checklist · ${left} to do today` : 'Checklist · all done today');
  }

  function remove(item) {
    if (!confirm(`Delete “${item.title}”${st.items.some((i) => i.parent === item.id) ? ' and its child uses' : ''}?`)) return;
    const gone = new Set([item.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of st.items) if (i.parent && gone.has(i.parent) && !gone.has(i.id)) { gone.add(i.id); grew = true; }
    }
    st.items = st.items.filter((i) => !gone.has(i.id));
    save();
    renderChecklist();
  }

  // The prompt button: what else could this be used for? It becomes a child, with a note to plan it.
  async function childUse(item) {
    const idea = window.prompt(`What else could “${item.title}” be used for?`);
    if (!idea?.trim()) return;
    const path = `LucianOS/workflows/${slug(idea)}.md`;
    const child = newItem({ title: idea.trim(), kind: 'note', target: path, parent: item.id });
    st.items.push(child);
    save();
    renderChecklist();
    const exists = await api.files.read(path).then(() => true, () => false);
    if (!exists) await api.files.write(path, `# ${idea.trim()}\n\nA use of: ${item.title}\n\n- First step: \n- Apps it needs: \n- Could it be profitable? \n`, { mkdirs: true });
    openApp('iedit', { open: path });
    say(`Added ${idea.trim()} under ${item.title}, and opened a page to plan it.`);
  }

  async function addForm() {
    const kind = el('select', {}, ...Object.entries(KINDS).map(([k, label]) => el('option', { value: k, textContent: label })));
    const title = el('input', { type: 'text', placeholder: 'Name' });
    const target = el('select', {});
    const targetText = el('input', { type: 'text', placeholder: 'https://… or /apps/…' });
    const daily = el('input', { type: 'checkbox' });
    const fill = async () => {
      const k = kind.value;
      targetText.classList.toggle('hidden', k !== 'url' && k !== 'note');
      targetText.placeholder = k === 'note' ? 'Folder/name.md inside the suite' : 'https://… or /apps/…';
      target.classList.toggle('hidden', k !== 'script' && k !== 'app');
      if (k === 'script') {
        const lib = await api.files.list(scriptsFolder).catch(() => ({ entries: [] }));
        const scripts = lib.entries.filter((e) => e.name.endsWith('.shellrun.json'));
        target.replaceChildren(...scripts.map((e) => el('option', { value: e.path, textContent: e.name.replace(/\.shellrun\.json$/, '') })));
        if (!scripts.length) target.append(el('option', { value: '', textContent: `No scripts in ${scriptsFolder}` }));
      }
      if (k === 'app') target.replaceChildren(...ctx.info().apps.map((a) => el('option', { value: a, textContent: a })));
      if (!title.value || title.dataset.auto) {
        title.value = { gl: 'Grammar Logic', music: "Listen to today's music" }[k] ?? '';
        title.dataset.auto = '1';
      }
    };
    title.addEventListener('input', () => delete title.dataset.auto);
    kind.addEventListener('change', fill);
    const form = el('form', { className: 'addform' }, kind, title, target, targetText, el('label', { className: 'quiet small' }, daily, ' daily'),
      el('button', { className: 'primary', textContent: 'Add' }), el('button', { type: 'button', textContent: 'Cancel', onclick: () => form.remove() }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const k = kind.value;
      const t = k === 'script' || k === 'app' ? target.value : targetText.value.trim();
      if ((k === 'script' || k === 'app' || k === 'url' || k === 'note') && !t) return showError('Choose or type what it opens');
      st.items.push(newItem({ title: title.value.trim() || KINDS[k], kind: k, target: k === 'note' && t && !t.includes('.') ? `${t}.md` : t, daily: daily.checked }));
      save();
      form.remove();
      renderChecklist();
    });
    checklistWindow();
    checklist.list.before(form);
    await fill();
    title.focus();
  }

  // ------------------------------------------------------------ settings
  function settingsWindow() {
    const existing = windows().find((w) => w.kind === 'wfsettings');
    if (existing) return existing.focus();
    const fields = [
      ['awl', 'Algorithm-Writer-with-Lists folder'],
      ['t2b', 'Text-to-Breasonings folder'],
      ['glFolder', 'Save Grammar Logic in'],
      ['glTimes', 'Remind me about Grammar Logic at'],
      ['music', 'Music-Composer folder'],
      ['shortlist', 'Copy shortlisted songs to']
    ];
    const inputs = {};
    const body = el('form', { className: 'wfsettings' },
      ...fields.map(([k, label]) => el('label', {}, el('span', { textContent: label }), (inputs[k] = el('input', { type: 'text', className: 'mono', value: String(st.settings[k] ?? '') })))),
      el('p', { className: 'quiet small', textContent: 'Folders are inside the suite folder (your home folder by default).' }),
      el('div', { className: 'row' }, el('span', { className: 'spacer' }), el('button', { className: 'primary', textContent: 'Save' })));
    const win = createWindow({ kind: 'wfsettings', title: 'Workflow settings', body, geometry: { x: 120, y: 60, w: 560, h: 520 }, data: {} });
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      for (const [k] of fields) st.settings[k] = inputs[k].value.trim();
      save();
      notice('Workflow settings saved', 'ok');
      win.close();
    });
  }

  // ------------------------------------------------------------ today's music
  let player = null;

  async function musicWindow(geometry = null) {
    const existing = windows().find((w) => w.kind === 'music');
    if (existing) {
      existing.focus();
      return existing;
    }
    const list = el('div', { className: 'musiclist' });
    const range = el('select', {}, el('option', { value: '1', textContent: 'Last day' }), el('option', { value: '7', textContent: 'Last 7 days' }), el('option', { value: '3650', textContent: 'All' }));
    const dest = el('input', { type: 'text', className: 'mono', value: st.settings.shortlist, 'aria-label': 'Copy the shortlist to' });
    const toolbar = el('div', { className: 'toolbar' }, el('span', { className: 'quiet small', textContent: 'Songs from' }), range, el('span', { className: 'spacer' }),
      el('button', { textContent: '⟳', title: 'Look again', onclick: () => fill() }));
    const foot = el('div', { className: 'statusline row' }, el('span', { className: 'small', textContent: '★ shortlist → ' }), dest,
      el('button', { className: 'primary', textContent: 'Copy shortlist', onclick: () => copyShortlist(dest.value.trim()) }),
      el('button', { textContent: 'Open in GarageBand', onclick: () => openInGarageBand(dest.value.trim()) }));
    const win = createWindow({ kind: 'music', title: "Today's music", body: list, toolbar, status: foot, geometry: geometry ?? { x: 160, y: 50, w: 600, h: 440 }, data: {} });
    range.addEventListener('change', () => fill());
    const close = win.close;
    win.close = async () => { player?.stop(); await close(); };

    async function fill() {
      const folder = st.settings.music;
      const found = [];
      for (const f of [folder, `${folder}/mid`]) {
        const r = await api.files.list(f).catch(() => null);
        if (r) found.push(...r.entries.filter((e) => e.type === 'file' && /\.midi?$/i.test(e.name)));
      }
      const days = Number(range.value);
      const songs = found.filter((e) => isRecent(e.mtimeMs, Date.now(), days)).sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (!found.length) {
        list.replaceChildren(el('p', { className: 'quiet', textContent: `No .mid files in ${folder}. Set the Music-Composer folder in Workflow settings (⚙ on the checklist).` }));
        return;
      }
      if (!songs.length) {
        list.replaceChildren(el('p', { className: 'quiet', textContent: `No new songs in the last ${days === 1 ? 'day' : `${days} days`}. Choose a longer time above.` }));
        return;
      }
      list.replaceChildren(...songs.map((e) => songRow(e)));
    }

    function songRow(e) {
      const play = el('button', { textContent: '▶', title: 'Play' });
      const star = el('button', { className: 'star', textContent: st.shortlist.includes(e.path) ? '★' : '☆', title: 'Shortlist it' });
      const info = el('span', { className: 'quiet small', textContent: new Date(e.mtimeMs).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) });
      const bar = el('div', { className: 'progress' }, el('span'));
      const comment = el('button', { textContent: '💬', title: 'What does the character think?' });
      play.addEventListener('click', async () => {
        if (player?.path === e.path) {
          player.stop();
          return;
        }
        player?.stop();
        const song = await readSong(e.path);
        const s = midiStats(song);
        info.textContent = `${Math.round(song.duration)} s · ${s.key ?? ''} · ${song.tempo} bpm`;
        const p = playMidi(song, { onProgress: (f) => (bar.firstChild.style.width = `${f * 100}%`) });
        player = { ...p, path: e.path };
        play.textContent = '■';
        p.done.then(() => {
          play.textContent = '▶';
          bar.firstChild.style.width = '0';
          if (player?.path === e.path) player = null;
        });
      });
      star.addEventListener('click', () => {
        st.shortlist = st.shortlist.includes(e.path) ? st.shortlist.filter((p) => p !== e.path) : [...st.shortlist, e.path];
        star.textContent = st.shortlist.includes(e.path) ? '★' : '☆';
        save();
      });
      comment.addEventListener('click', () => ctx.commentOn(e.path));
      return el('div', { className: 'song' }, play, star, el('span', { className: 'name', textContent: e.name }), info, bar, comment);
    }

    fill();
    return win;
  }

  async function readSong(path) {
    const res = await fetch(api.files.rawUrl(path), { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Couldn't read ${path}`);
    return parseMidi(new Uint8Array(await res.arrayBuffer()));
  }

  async function copyShortlist(dest) {
    if (!st.shortlist.length) return notice('Star some songs first');
    st.settings.shortlist = dest;
    save();
    let copied = 0;
    const skipped = [];
    for (const p of st.shortlist) {
      try {
        await api.files.copy(p, `${dest}/${p.split('/').pop()}`);
        copied++;
      } catch (err) {
        skipped.push(`${p.split('/').pop()} (${err.status === 409 ? 'already there' : err.message})`);
      }
    }
    notice(`Copied ${copied} song${copied === 1 ? '' : 's'} to ${dest}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`, 'ok');
    say(`Copied ${copied} to your GarageBand shortlist folder.`);
  }

  // Opening files in GarageBand needs macOS's "open" command in allowedCommands.
  async function openInGarageBand(dest) {
    if (!ctx.info().allowedCommands.includes('open')) {
      return showError('To open songs in GarageBand from here, add "open" to allowedCommands in config.json (macOS). Or drag them in from the shortlist folder.');
    }
    const names = st.shortlist.map((p) => p.split('/').pop());
    if (!names.length) return notice('Star some songs first');
    await copyShortlist(dest);
    await api.jobs.start({ cmd: 'open', args: ['-a', 'GarageBand', ...names], cwd: dest, label: 'Open in GarageBand' });
  }

  // ------------------------------------------------------------ character commands
  async function handleCommand(cmd) {
    if (cmd.intent === 'gl') {
      runGL(cmd.topic || null);
      return cmd.topic ? '' : 'What topic? Type it in the box.';
    }
    if (cmd.intent === 'workflows') {
      checklistWindow();
      if (cmd.run) {
        const n = await runDaily();
        return n ? '' : "Today's workflows are all done.";
      }
      const left = dailyToRun(st.items).length;
      return left ? `Here is your checklist. ${left} daily workflow${left === 1 ? '' : 's'} left today.` : 'Here is your checklist. Everything daily is done.';
    }
    if (cmd.intent === 'music') {
      musicWindow();
      return "Here's today's music. Star the ones you like for GarageBand.";
    }
    return undefined;
  }

  return {
    prompt,
    load,
    checklistWindow,
    musicWindow,
    settingsWindow,
    runDaily,
    runGL,
    breason,
    runItem,
    // run a checklist item by id (from the terminal's Today panel)
    async runById(id) {
      await load();
      const item = st.items.find((i) => i.id === id);
      if (item) return runItem(item);
    },
    handleCommand,
    start() {
      morningQuestion();
      setInterval(() => checkReminders(), 30000);
      checkReminders();
    },
    _state: () => st
  };
}
