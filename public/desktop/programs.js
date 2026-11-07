// The Programs strip in folder windows: programs found in the folder's README and source,
// a test-file maker, and test checks that write Claude-ready instructions when tests fail.
import { api } from '/shared/api.js';
import { askClaude } from '/shared/claude.js';
import { el } from './dom.js';
import { claudeInstructions, detectTests, isTestPath, makeTestFile, readmePrograms, relevantSources, sourcePrograms, testsFailed } from './programs-lib.js';

const HOUR = 3600000;

export function initPrograms(ctx) {
  const { createWindow, openApp, notice, showError, info } = ctx;
  let st = { remembered: {}, checks: {}, autoCheck: true };
  const loaded = api.state.get('programs').then((s) => { if (s) st = { ...st, ...s }; }).catch(() => {});
  const save = () => api.state.set('programs', st).catch(() => {});

  async function scan(folder) {
    const top = (await api.files.list(folder)).entries;
    const readme = top.find((e) => e.type === 'file' && /^readme(\.md|\.txt)?$/i.test(e.name));
    let files = top.filter((e) => e.type === 'file' && /\.pl$/i.test(e.name)).map((e) => e.name);
    const testsDir = top.find((e) => e.type === 'dir' && /^tests?$/i.test(e.name));
    if (testsDir) {
      const t = await api.files.list(testsDir.path).catch(() => ({ entries: [] }));
      files = files.concat(t.entries.filter((e) => /\.pl$/i.test(e.name)).map((e) => `${testsDir.name}/${e.name}`));
    }
    if (!readme && !files.length) return null;
    const texts = new Map();
    const read = async (f) => {
      if (!texts.has(f)) texts.set(f, await api.files.read(folder ? `${folder}/${f}` : f).then((r) => r.content, () => ''));
      return texts.get(f);
    };
    const sources = files.filter((f) => !isTestPath(f)).slice(0, 30);
    for (const f of [...sources, ...files.filter(isTestPath)]) await read(f);
    const programs = [
      ...(readme ? readmePrograms(await read(readme.name)) : []),
      ...sourcePrograms(sources.map((f) => ({ path: f, text: texts.get(f) })))
    ].slice(0, 14);
    const tests = detectTests(files, (f) => texts.get(f));
    return { folder, programs, tests, files, sources, texts, hasTestsDir: !!testsDir, testsDirName: testsDir?.name };
  }

  // ------------------------------------------------------------ running one program
  function programWindow(scanResult, p) {
    const key = `${scanResult.folder}|${p.label}`;
    const last = st.remembered[key] ?? {};
    const name = scanResult.folder.split('/').pop() || 'Home';
    const out = el('pre', { className: 'output progout' });
    const runBtn = el('button', { className: 'primary', textContent: 'Run' });
    const stopBtn = el('button', { textContent: 'Interrupt', disabled: true });
    let fields;
    if (p.kind === 'prolog') {
      fields = {
        consult: el('input', { type: 'text', className: 'mono', value: (last.consult ?? p.consult).join(', ') }),
        goal: el('input', { type: 'text', className: 'mono', value: last.goal ?? p.goal }),
        stack: el('input', { type: 'text', className: 'mono', value: last.stack ?? info().swiplStackLimit ?? '54G' })
      };
    } else {
      fields = { command: el('input', { type: 'text', className: 'mono', value: last.command ?? p.command }) };
    }
    const form = el('form', { className: 'progform' },
      ...(p.kind === 'prolog'
        ? [el('label', {}, 'Load', fields.consult), el('label', {}, 'Goal', fields.goal), el('label', {}, 'Stack', fields.stack)]
        : [el('label', {}, 'Command', fields.command)]),
      el('div', { className: 'row' }, el('span', { className: 'quiet small', textContent: `in ${scanResult.folder || 'Home'} · values you change are remembered` }), el('span', { className: 'spacer' }), stopBtn, runBtn));
    const body = el('div', { className: 'progwin' }, form, out);
    createWindow({ kind: 'program', title: `${name}: ${p.label}`, body, geometry: { x: 180, y: 80, w: 640, h: 420 }, data: {} });
    let job = null;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      out.replaceChildren();
      try {
        if (p.kind === 'prolog') {
          const consult = fields.consult.value.split(',').map((x) => x.trim()).filter(Boolean);
          st.remembered[key] = { consult, goal: fields.goal.value.trim(), stack: fields.stack.value.trim() };
          job = await api.jobs.prolog({ goal: fields.goal.value.trim(), consult, cwd: scanResult.folder, stackLimit: fields.stack.value.trim() || undefined });
        } else {
          const args = fields.command.value.trim().match(/"[^"]*"|'[^']*'|\S+/g).map((a) => a.replace(/^["']|["']$/g, ''));
          st.remembered[key] = { command: fields.command.value.trim() };
          job = await api.jobs.start({ cmd: args[0], args: args.slice(1), cwd: scanResult.folder });
        }
        save();
      } catch (err) {
        out.append(el('span', { className: 'stderr', textContent: err.message }));
        return;
      }
      runBtn.disabled = true;
      stopBtn.disabled = false;
      api.jobs.stream(job.id, {
        output: ({ stream, text }) => { out.append(el('span', { className: stream, textContent: text })); out.scrollTop = out.scrollHeight; },
        end: (s) => {
          out.append(el('span', { className: 'system', textContent: `\n${s.status === 'done' ? 'Finished' : s.status === 'cancelled' ? 'Interrupted' : `Failed (exit ${s.exitCode})`}\n` }));
          runBtn.disabled = false;
          stopBtn.disabled = true;
        }
      });
    });
    stopBtn.addEventListener('click', () => job && api.jobs.cancel(job.id));
  }

  // ------------------------------------------------------------ test file
  async function makeTests(scanResult) {
    const all = scanResult.programs;
    const inTests = scanResult.hasTestsDir;
    const file = makeTestFile(scanResult.folder.split('/').pop() || 'home', all, { prefix: inTests ? '../' : '' });
    if (!file) return notice('No Prolog examples found to turn into tests');
    const rel = inTests ? `${scanResult.testsDirName}/${file.name}` : file.name;
    const path = scanResult.folder ? `${scanResult.folder}/${rel}` : rel;
    const exists = await api.files.read(path).then(() => true, () => false);
    if (!exists) await api.files.write(path, file.text);
    openApp('iedit', { open: path });
    notice(exists ? `${rel} already exists; opened it` : `Made ${rel} with ${file.count} test${file.count === 1 ? '' : 's'}`, 'ok');
  }

  // ------------------------------------------------------------ checking tests
  async function check(scanResult, badge, { quiet = false } = {}) {
    const t = scanResult.tests;
    if (!t) {
      badge.replaceChildren(el('span', { className: 'quiet', textContent: 'No tests yet' }));
      return;
    }
    badge.replaceChildren(el('span', { className: 'quiet', textContent: 'Checking tests…' }));
    let job;
    try {
      if (t.kind === 'prolog') job = await api.jobs.prolog({ goal: 'run_tests', consult: t.consult, cwd: scanResult.folder, label: `check tests: ${scanResult.folder}` });
      else {
        const args = t.command.split(/\s+/);
        job = await api.jobs.start({ cmd: args[0], args: args.slice(1), cwd: scanResult.folder, label: `check tests: ${scanResult.folder}` });
      }
    } catch (err) {
      badge.replaceChildren(el('span', { className: 'error', textContent: err.message }));
      return;
    }
    let output = '';
    const started = Date.now();
    api.jobs.stream(job.id, {
      output: ({ text }) => { if (output.length < 200000) output += text; },
      end: async (s) => {
        const failed = testsFailed(s.exitCode ?? 1, output);
        const result = { at: Date.now(), failed, ms: Date.now() - started };
        if (failed) {
          const repo = scanResult.folder.split('/').pop() || 'Home';
          const consulted = t.kind === 'prolog' ? t.consult : [];
          const files = relevantSources(output, scanResult.sources, consulted.filter((f) => !isTestPath(f)));
          const md = claudeInstructions({
            repo,
            testLabel: t.label,
            output,
            sources: files.map((f) => ({ path: f, text: scanResult.texts.get(f) ?? '' }))
          });
          const d = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
          result.file = `LucianOS/diagnostics/${repo} ${stamp}.md`;
          await api.files.write(result.file, md, { mkdirs: true });
          if (!quiet) ctx.say?.(`The tests in ${repo} are failing. I've written instructions for fixing them.`);
        }
        st.checks[scanResult.folder] = result;
        save();
        showResult(scanResult, badge, result);
      }
    });
  }

  function showResult(scanResult, badge, r) {
    if (!r) return badge.replaceChildren();
    if (!r.failed) {
      badge.replaceChildren(el('span', { className: 'ok', textContent: `✓ tests pass · ${new Date(r.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` }));
      return;
    }
    badge.replaceChildren(
      el('span', { className: 'error', textContent: '⚠ tests failing' }),
      el('button', { textContent: 'Open instructions', onclick: () => openApp('iedit', { open: r.file }) }),
      el('button', { textContent: 'Send to Claude…', onclick: () => sendToClaude(r.file) }));
  }

  async function sendToClaude(file) {
    try {
      const { content } = await api.files.read(file);
      const reply = await askClaude({ purpose: `Fix failing tests (${file.split('/').pop()})`, prompt: content, maxTokens: 3000 });
      if (reply === null) return;
      const out = file.replace(/\.md$/, ' reply.md');
      await api.files.write(out, `# Claude's suggestion\n\nNot applied: check it, then make the change yourself.\n\n${reply}\n`);
      openApp('iedit', { open: out });
    } catch (err) {
      showError(err.message);
    }
  }

  // ------------------------------------------------------------ the strip
  async function attach(win, toolbar) {
    await loaded;
    const strip = el('div', { className: 'programs hidden' });
    toolbar.after(strip);
    let token = 0;
    return async function update(folder) {
      const mine = ++token;
      strip.classList.add('hidden');
      let r;
      try {
        r = await scan(folder);
      } catch {
        r = null;
      }
      if (mine !== token || !r) return;
      const badge = el('span', { className: 'badge' });
      const auto = el('input', { type: 'checkbox', checked: st.autoCheck });
      auto.addEventListener('change', () => { st.autoCheck = auto.checked; save(); });
      strip.replaceChildren(
        el('span', { className: 'quiet small', textContent: 'Programs:' }),
        ...r.programs.map((p) => el('button', { className: 'prog', textContent: `${p.kind === 'terminal' ? '$' : '▶'} ${p.label}`, title: p.kind === 'terminal' ? p.command : `${p.consult.join(', ')} → ${p.goal}`, onclick: () => programWindow(r, p) })),
        r.programs.length ? null : el('span', { className: 'quiet small', textContent: 'none found' }),
        el('span', { className: 'spacer' }),
        el('button', { textContent: '🧪 Make test file', title: 'Turn the examples above into a PlUnit test file', onclick: () => makeTests(r).then(() => update(folder)) }),
        el('button', { textContent: '🩺 Check tests', onclick: () => check(r, badge) }),
        el('label', { className: 'quiet small', title: 'Check tests when this folder opens, at most once an hour' }, auto, ' auto'),
        badge);
      strip.classList.remove('hidden');
      const last = st.checks[folder];
      showResult(r, badge, last);
      if (r.tests && st.autoCheck && (!last || Date.now() - last.at > HOUR)) check(r, badge, { quiet: true });
    };
  }

  return { attach, scan };
}
