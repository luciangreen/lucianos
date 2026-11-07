// Ask Claude from any app. Shows exactly what will be sent and asks first (unless that is turned off).
//   import { askClaude, claudeSettings } from '/shared/claude.js';
//   const text = await askClaude({ purpose: 'Fill gaps in notes.md', prompt, system }); // null if cancelled
import { api } from '/shared/api.js';

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./claude.css', import.meta.url).href;
document.head.append(css);

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('aria-') || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...kids.filter((k) => k !== null && k !== undefined));
  return n;
};

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-LucianOS': '1' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const claudeStatus = () => call('GET', '/api/claude');

function confirmDialog({ purpose, prompt, system, status }) {
  return new Promise((resolve) => {
    const tokens = Math.ceil(((system ?? '').length + prompt.length) / 3.5);
    const dlg = el('dialog', { className: 'cl-dialog' },
      el('form', { method: 'dialog' },
        el('h2', { textContent: 'Send this to Claude?' }),
        el('p', { className: 'cl-meta', textContent: `${purpose} · ${status.model} · about ${tokens.toLocaleString()} tokens · ${status.used.toLocaleString()} of ${status.monthlyTokenCap.toLocaleString()} used this month` }),
        system ? el('details', {}, el('summary', { textContent: 'Instructions sent with it' }), el('pre', { className: 'cl-pre', textContent: system })) : null,
        el('pre', { className: 'cl-pre', textContent: prompt }),
        el('p', { className: 'cl-meta', textContent: 'This text leaves your computer and goes to Anthropic. Nothing else is sent.' }),
        el('div', { className: 'cl-row' },
          el('button', { value: 'cancel', textContent: 'Cancel' }),
          el('button', { value: 'send', className: 'primary', textContent: 'Send' }))));
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'send');
      dlg.remove();
    });
    dlg.showModal();
  });
}

// Returns Claude's reply text, or null if you cancelled. Throws a readable Error otherwise.
export async function askClaude({ purpose = 'Request', prompt, system, maxTokens }) {
  const status = await claudeStatus();
  if (!status.enabled) throw new Error('Claude is off. Add an API key in Tools ▸ Claude settings on the LucianOS desktop.');
  let confirmed = false;
  if (status.confirmBeforeSend) {
    confirmed = await confirmDialog({ purpose, prompt, system, status });
    if (!confirmed) return null;
  }
  const r = await call('POST', '/api/claude/ask', { prompt, system, maxTokens, purpose, confirmed });
  return r.text;
}

// Settings form, for a window on the desktop.
export function claudeSettings(container) {
  const key = el('input', { type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': 'API key' });
  const temporary = el('input', { type: 'checkbox' });
  const model = el('select', { 'aria-label': 'Model' });
  const cap = el('input', { type: 'number', min: '0', step: '100000', 'aria-label': 'Monthly token limit' });
  const confirmBox = el('input', { type: 'checkbox' });
  const statusLine = el('p', { className: 'cl-meta' });
  const message = el('p', { className: 'cl-meta' });
  const form = el('form', { className: 'cl-settings' },
    statusLine,
    el('label', {}, el('span', { textContent: 'API key (from console.anthropic.com)' }), key),
    el('label', { className: 'cl-check' }, temporary, ' Use it for this session only (not saved; gone when the suite restarts)'),
    el('label', {}, el('span', { textContent: 'Model' }), model),
    el('label', {}, el('span', { textContent: 'Monthly limit (tokens)' }), cap),
    el('label', { className: 'cl-check' }, confirmBox, ' Show me what will be sent and ask first'),
    el('p', { className: 'cl-meta', textContent: 'Claude is the only part of LucianOS that sends text off your computer, and only when you ask. Background checks never send anything; they write instructions you can send yourself.' }),
    el('div', { className: 'cl-row' },
      el('button', { type: 'button', textContent: 'Turn off and forget the key', onclick: () => save({ forget: true }) }),
      el('button', { className: 'primary', textContent: 'Save' })),
    message);
  async function refresh() {
    const s = await claudeStatus();
    statusLine.textContent = s.enabled ? `On (${s.temporary ? 'key for this session only' : 'key saved on this computer'}). ${s.used.toLocaleString()} tokens used this month in ${s.requests} request${s.requests === 1 ? '' : 's'}.` : 'Off: no key yet.';
    model.replaceChildren(...s.models.map((m) => el('option', { value: m, textContent: m, selected: m === s.model })));
    cap.value = s.monthlyTokenCap;
    confirmBox.checked = s.confirmBeforeSend;
  }
  async function save(extra = {}) {
    try {
      await call('PUT', '/api/claude/settings', { ...(key.value ? { apiKey: key.value, temporary: temporary.checked } : {}), model: model.value, monthlyTokenCap: Number(cap.value), confirmBeforeSend: confirmBox.checked, ...extra });
      key.value = '';
      message.textContent = extra.forget ? 'Claude is off and the key is forgotten.' : 'Saved.';
    } catch (err) {
      message.textContent = err.message;
    }
    refresh();
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  container.append(form);
  refresh();
  return form;
}
