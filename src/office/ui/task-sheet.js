// "Giao việc": giving Claude work from the group chat (server/tasks.mjs runs it on the Mac). A sheet over the chat: who
// it goes to (a conversation, carried on with its whole context as a branch of it, or a new conversation in a folder
// sessions have worked in), what to do (typed, or spoken: 🎤 in the office's language), photos (from the camera or the
// gallery, made smaller here before they go). From a phone only once the Mac allows it (the phone window).
import { el } from '../core/env.js';
import { icon } from './icons.js';
import { toast } from './activity.js';
import { avatar } from './chat-avatars.js';
import { who } from './group-chat.js';
import { TOKEN } from '../net/live.js';
import { t as tr, locale } from '../../i18n/index.js';

const q = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
let sheet = null;
let workflowRefresh = null;

export function taskProviderRequest(provider, payload) {
  return provider === 'codex-cli' ? { url: '/api/codex/runs', body: { dir: payload.dir, text: payload.text, expectedArtifacts: payload.expectedArtifacts || [] } }
    : { url: '/api/tasks', body: payload };
}

/* ---------- speaking instead of typing: the browser's speech recognition, in the office's language ---------- */
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canDictate = () => !!SR && window.isSecureContext;
/** 🎤 on a button: speak, and the words go into the field as they come; again to stop. -> stop() */
export function dictate(btn, field, onChange) {
  if (!canDictate()) { toast(tr('chat.task.noMic'), 6000); return null; }
  const rec = new SR(), start = field.value, sep = start && !/\s$/.test(start) ? ' ' : '';
  rec.lang = locale() === 'vi-VN' ? 'vi-VN' : 'en-US'; rec.interimResults = true; rec.continuous = true;
  let done = '';
  rec.onresult = (e) => {
    let live = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) done += e.results[i][0].transcript; else live += e.results[i][0].transcript; }
    field.value = `${start}${sep}${done}${live}`.slice(0, 4000); onChange?.();
  };
  const end = () => { btn.classList.remove('is-rec'); btn.setAttribute('aria-pressed', 'false'); };
  rec.onend = end; rec.onerror = (e) => { end(); if (e.error === 'not-allowed') toast(tr('chat.task.micBlocked'), 6000); };
  try { rec.start(); } catch { end(); return null; }
  btn.classList.add('is-rec'); btn.setAttribute('aria-pressed', 'true');
  return () => { try { rec.stop(); } catch { /* stopped */ } end(); };
}

/* ---------- photos: made smaller here (1600 px, JPEG) so they go quickly over a phone's connection ---------- */
export async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  let url = c.toDataURL('image/jpeg', 0.82);
  if (url.length > 480_000) url = c.toDataURL('image/jpeg', 0.6);   // (under what the group chat shows too)
  return url;
}

/** Opens the sheet inside the chat window; to: { sid } (a conversation) or { dir } (a folder) to start with; text. */
export async function openTaskSheet(host, { to = null, text = '' } = {}) {
  clearInterval(workflowRefresh); workflowRefresh = null;
  sheet?.remove();
  let stopMic = null;
  const [r, wr] = await Promise.all([
    fetch(`/api/tasks${q()}`).then((x) => x.json()).catch(() => null),
    fetch(`/api/workflows${q()}`).then((x) => x.json()).catch(() => null),
  ]);
  sheet = el('div', 'zc-task'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', tr('chat.task.title'));
  const head = el('div', 'zc-task-head'), close = el('button', 'zc-ib'); close.type = 'button'; close.title = tr('chat.close'); close.append(icon('x'));
  close.addEventListener('click', () => { stopMic?.(); clearInterval(workflowRefresh); workflowRefresh = null; sheet.remove(); sheet = null; });
  head.append(el('b', null, `📋 ${tr('chat.task.title')}`), close);
  sheet.append(head);
  if (!r?.ok) { sheet.append(el('p', 'zc-task-note', tr('drawer.unreachable'))); host.append(sheet); return; }
  if (!r.allowed) { sheet.append(el('p', 'zc-task-note', tr('chat.task.notAllowed'))); host.append(sheet); return; }
  // who it goes to: the conversations (their folder), then "a new one in…" each folder
  const toSid = to?.id ? r.sessions.find((s) => s.id === to.id)?.sid : to?.sid;
  let pick = toSid ? { sid: toSid } : to?.dir ? { dir: to.dir } : r.sessions[0] ? { sid: r.sessions[0].sid } : r.projects[0] ? { dir: r.projects[0].dir } : null;
  const list = el('div', 'zc-task-list');
  const option = (key, label, sub, face, sel) => {
    const b = el('button', `zc-task-o${sel ? ' is-on' : ''}`); b.type = 'button';
    const t = el('span', 'zc-men-t'); t.append(el('b', null, label), el('small', null, sub)); b.append(face, t);
    b.addEventListener('click', () => { pick = key; for (const x of list.querySelectorAll('.zc-task-o')) x.classList.toggle('is-on', x === b); sync(); });
    return b;
  };
  if (r.sessions.length) list.append(el('small', 'zc-task-h', tr('chat.task.conversations')));
  for (const s of r.sessions) list.append(option({ sid: s.sid }, s.name, `📁 ${s.dir}`, avatar({ ...(who(s.id) || {}), key: s.id, name: s.name }, 30), pick?.sid === s.sid));
  if (r.projects.length) list.append(el('small', 'zc-task-h', tr('chat.task.newIn')));
  for (const p of r.projects) { const f = el('span', 'zc-task-folder', '📁'); list.append(option({ dir: p.dir }, p.name, p.dir, f, pick?.dir === p.dir && !pick.sid)); }
  const workflowPanel = el('div', 'zc-task-list');
  const drawWorkflows = (items = []) => {
    workflowPanel.replaceChildren(el('small', 'zc-task-h', tr('chat.task.workflows')));
    if (!items.length) workflowPanel.append(el('p', 'zc-task-note', tr('chat.task.noWorkflows')));
    for (const w of items.slice(0, 8)) {
      const card = el('div', 'zc-task-o');
      const summary = el('span', 'zc-men-t'); summary.append(el('b', null, `${w.name} · ${w.status}`), el('small', null, w.tasks.map((t) => `${t.title}: ${t.status}`).join(' · '))); card.append(summary);
      const actions = el('div', 'zc-task-tools');
      if (['draft', 'interrupted'].includes(w.status)) { const start = el('button', 'zc-task-tool', tr('chat.task.startWorkflow')); start.type = 'button'; start.addEventListener('click', () => workflowAction(`/api/workflows/${w.id}/start`, {}, tr('chat.task.workflowStarted'))); actions.append(start); }
      if (w.status === 'running') { const cancel = el('button', 'zc-task-tool', tr('chat.task.cancelWorkflow')); cancel.type = 'button'; cancel.addEventListener('click', () => workflowAction(`/api/workflows/${w.id}/cancel`, {}, tr('chat.task.workflowCancelled'))); actions.append(cancel); }
      for (const task of w.tasks) {
        const row = el('div', 'zc-task-tools'), label = el('small', 'zc-task-note', `${task.title} · ${task.status}`), show = el('button', 'zc-task-tool', tr('chat.task.logs'));
        show.type = 'button'; show.addEventListener('click', async () => {
          const log = await fetch(`/api/workflows/${w.id}/tasks/${task.id}/logs${q()}`).then((x) => x.json()).catch(() => null);
          let pre = row.querySelector('pre'); if (!pre) { pre = el('pre', 'zc-task-log'); row.append(pre); }
          pre.textContent = log ? [log.result, log.stderr, log.output].filter(Boolean).join('\n') || tr('chat.task.noLogs') : tr('drawer.unreachable');
        });
        row.append(label, show);
        if (['failed', 'incomplete', 'timeout', 'interrupted'].includes(task.status) && task.attempt < task.maxAttempts) {
          const retry = el('button', 'zc-task-tool', tr('chat.task.retryTask')); retry.type = 'button'; retry.addEventListener('click', () => workflowAction(`/api/workflows/${w.id}/tasks/${task.id}/retry`, {}, tr('chat.task.workflowStarted'))); row.append(retry);
        }
        card.append(row);
      }
      card.append(actions); workflowPanel.append(card);
    }
  };
  const workflowAction = async (url, body, okText) => {
    const result = await fetch(`${url}${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (result?.ok) { toast(okText, 4000); refreshWorkflows(); } else toast(result?.message || tr('drawer.unreachable'), 5000);
  };
  const refreshWorkflows = async () => {
    const data = await fetch(`/api/workflows${q()}`).then((x) => x.json()).catch(() => null);
    if (sheet && data?.workflows) drawWorkflows(data.workflows);
  };
  drawWorkflows(wr?.workflows || []);
  // what to do: typed or spoken, and photos
  const field = el('textarea', 'zc-task-in'); field.rows = 4; field.maxLength = 4000; field.placeholder = tr('chat.task.placeholder'); field.value = text;
  const artifactField = el('input', 'zc-task-in'); artifactField.placeholder = tr('chat.task.expectedArtifacts'); artifactField.setAttribute('aria-label', tr('chat.task.expectedArtifacts'));
  field.addEventListener('keydown', (e) => e.stopPropagation());
  let provider = 'claude';
  const providers = el('div', 'zc-task-tools');
  const claudeChoice = el('button', 'zc-task-tool is-on', 'Claude'); claudeChoice.type = 'button';
  const codexChoice = el('button', 'zc-task-tool', 'Codex CLI'); codexChoice.type = 'button';
  const providerHint = el('small', 'zc-task-note', 'Codex CLI runs are separate from Codex App sessions.');
  const chooseProvider = (next) => { provider = next; claudeChoice.classList.toggle('is-on', next === 'claude'); codexChoice.classList.toggle('is-on', next === 'codex-cli'); providerHint.hidden = next !== 'codex-cli'; artifactField.hidden = next !== 'codex-cli'; sync(); };
  claudeChoice.addEventListener('click', () => chooseProvider('claude'));
  codexChoice.addEventListener('click', () => chooseProvider('codex-cli'));
  providers.append(claudeChoice, codexChoice);
  const photos = [], thumbs = el('div', 'zc-task-thumbs');
  const drawThumbs = () => thumbs.replaceChildren(...photos.map((u, i) => { const t = el('span', 'zc-task-thumb'), img = el('img'), x = el('button', null, '✕'); img.src = u; x.type = 'button'; x.addEventListener('click', () => { photos.splice(i, 1); drawThumbs(); sync(); }); t.append(img, x); return t; }));
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
  file.addEventListener('change', async () => { for (const f of [...file.files].slice(0, 4 - photos.length)) { try { photos.push(await shrink(f)); } catch { /* not an image it can read */ } } file.value = ''; drawThumbs(); sync(); });
  const mic = el('button', 'zc-task-tool'); mic.type = 'button'; mic.title = tr('chat.task.mic'); mic.append(icon('mic'), el('span', null, tr('chat.task.mic')));
  mic.addEventListener('click', () => { if (stopMic) { stopMic(); stopMic = null; } else stopMic = dictate(mic, field, sync); });
  const cam = el('button', 'zc-task-tool'); cam.type = 'button'; cam.title = tr('chat.task.photo'); cam.append(icon('image'), el('span', null, tr('chat.task.photo')));
  cam.addEventListener('click', () => file.click());
  const tools = el('div', 'zc-task-tools'); tools.append(mic, cam, file);
  let mode = 'task', taskNumber = 0;
  const modes = el('div', 'zc-task-tools'), taskMode = el('button', 'zc-task-tool is-on', tr('chat.task.singleTask')), workflowMode = el('button', 'zc-task-tool', tr('chat.task.workflowMode'));
  taskMode.type = workflowMode.type = 'button'; modes.append(taskMode, workflowMode);
  const workflowBox = el('div', 'zc-task-list'); workflowBox.hidden = true;
  const workflowName = el('input', 'zc-task-in'); workflowName.maxLength = 120; workflowName.placeholder = tr('chat.task.workflowName');
  const workflowTaskList = el('div', 'zc-task-list'), addWorkflowTask = el('button', 'zc-task-tool', tr('chat.task.addTask')); addWorkflowTask.type = 'button';
  const workflowRows = [];
  const renderWorkflowTasks = () => {
    workflowTaskList.replaceChildren();
    for (const row of workflowRows) {
      const box = el('div', 'zc-task-list');
      row.title.setAttribute('aria-label', tr('chat.task.taskTitle')); row.description.setAttribute('aria-label', tr('chat.task.taskDescription'));
      row.provider.setAttribute('aria-label', tr('chat.task.taskProvider')); row.dependencies.setAttribute('aria-label', tr('chat.task.dependencies')); row.expected.setAttribute('aria-label', tr('chat.task.expectedArtifacts'));
      row.expected.hidden = row.providerValue !== 'codex-cli';
      const providerChoices = [['claude', 'Claude'], ['codex-cli', 'Codex CLI']].map(([value, label]) => { const op = el('option', null, label); op.value = value; return op; });
      row.provider.replaceChildren(...providerChoices); row.provider.value = row.providerValue;
      const deps = workflowRows.filter((x) => x !== row).map((x) => { const op = el('option', null, x.title.value.trim() || x.id); op.value = x.id; return op; });
      row.dependencies.replaceChildren(...deps); for (const op of row.dependencies.options) op.selected = row.dependsOn.has(op.value);
      const remove = el('button', 'zc-task-tool', tr('chat.task.removeTask')); remove.type = 'button'; remove.addEventListener('click', () => { workflowRows.splice(workflowRows.indexOf(row), 1); for (const x of workflowRows) x.dependsOn.delete(row.id); renderWorkflowTasks(); sync(); });
      row.provider.onchange = () => { row.providerValue = row.provider.value; sync(); };
      row.title.oninput = () => { for (const other of workflowRows) for (const op of other.dependencies.options) if (op.value === row.id) op.textContent = row.title.value.trim() || row.id; sync(); };
      row.description.oninput = row.expected.oninput = sync; row.dependencies.onchange = () => { row.dependsOn = new Set([...row.dependencies.selectedOptions].map((x) => x.value)); sync(); };
      box.append(row.title, row.description, row.provider, row.expected, row.dependencies, remove); workflowTaskList.append(box);
    }
  };
  const newWorkflowTask = () => {
    if (workflowRows.length >= 10) return;
    workflowRows.push({ id: `task-${++taskNumber}`, title: el('input', 'zc-task-in'), description: el('textarea', 'zc-task-in'), provider: el('select', 'zc-task-in'), providerValue: 'claude', expected: el('input', 'zc-task-in'), dependencies: el('select', 'zc-task-in'), dependsOn: new Set() });
    workflowRows.at(-1).title.placeholder = tr('chat.task.taskTitle'); workflowRows.at(-1).description.placeholder = tr('chat.task.taskDescription');
    workflowRows.at(-1).expected.placeholder = tr('chat.task.expectedArtifacts');
    workflowRows.at(-1).description.rows = 3; workflowRows.at(-1).description.maxLength = 4000;
    workflowRows.at(-1).dependencies.multiple = true; workflowRows.at(-1).dependencies.size = 3;
    renderWorkflowTasks(); sync();
  };
  addWorkflowTask.addEventListener('click', newWorkflowTask);
  workflowName.addEventListener('input', sync);
  workflowBox.append(workflowName, workflowTaskList, addWorkflowTask, el('p', 'zc-task-note', tr('chat.task.workflowNote')));
  const go = el('button', 'zc-task-go', tr('chat.task.send')); go.type = 'button';
  const sync = () => { go.disabled = !pick || (mode === 'task' ? !field.value.trim() : !workflowName.value.trim() || !workflowRows.length || workflowRows.some((x) => !x.title.value.trim() || !x.description.value.trim())); };
  field.addEventListener('input', sync);
  const setMode = (next) => {
    mode = next; taskMode.classList.toggle('is-on', mode === 'task'); workflowMode.classList.toggle('is-on', mode === 'workflow');
    providers.hidden = providerHint.hidden = mode === 'workflow'; field.hidden = thumbs.hidden = tools.hidden = mode === 'workflow'; workflowBox.hidden = mode !== 'workflow';
    go.textContent = tr(mode === 'workflow' ? 'chat.task.createWorkflow' : 'chat.task.send'); sync();
  };
  taskMode.addEventListener('click', () => setMode('task')); workflowMode.addEventListener('click', () => setMode('workflow'));
  go.addEventListener('click', async () => {
    stopMic?.(); stopMic = null; go.disabled = true; go.textContent = tr('chat.task.sending');
    const pickedSession = pick?.sid && r.sessions.find((s) => s.sid === pick.sid);
    if (mode === 'workflow') {
      const body = { name: workflowName.value.trim(), dir: pick?.dir || pickedSession?.dir, tasks: workflowRows.map((x) => ({ id: x.id, title: x.title.value.trim(), description: x.description.value.trim(), provider: x.provider.value, expectedArtifacts: x.expected.value.split(',').map((p) => p.trim()).filter(Boolean), dependsOn: [...x.dependsOn] })) };
      const made = await fetch(`/api/workflows${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
      if (made?.ok) {
        const started = await fetch(`/api/workflows/${made.workflow.id}/start${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((x) => x.json()).catch(() => null);
        if (started?.ok) { toast(tr('chat.task.workflowStarted'), 5000); clearInterval(workflowRefresh); workflowRefresh = null; sheet.remove(); sheet = null; return; }
      }
      toast(made?.message || tr('drawer.unreachable'), 6000); go.textContent = tr('chat.task.createWorkflow'); sync(); return;
    }
    const payload = { ...pick, ...(provider === 'codex-cli' && !pick?.dir && pickedSession?.dir ? { dir: pickedSession.dir } : {}), text: field.value, expectedArtifacts: artifactField.value.split(',').map((p) => p.trim()).filter(Boolean), images: photos, fresh: !!pick.dir };
    const request = taskProviderRequest(provider, payload);
    const res = await fetch(`${request.url}${provider === 'claude' ? q() : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) }).then(async (x) => ({ ...(await x.json()), httpOk: x.ok })).catch(() => null);
    if (res?.ok) { toast(tr('chat.task.started'), 5000); clearInterval(workflowRefresh); workflowRefresh = null; sheet.remove(); sheet = null; return; }
    toast(res?.message || tr('drawer.unreachable'), 6000); go.textContent = tr('chat.task.send'); sync();
  });
  sheet.append(list, workflowPanel, modes, providers, providerHint, workflowBox, field, artifactField, thumbs, tools, el('p', 'zc-task-note', tr('chat.task.note')), go);
  providerHint.hidden = artifactField.hidden = true;
  if (r.running.length) sheet.append(el('p', 'zc-task-note', tr('chat.task.running', { n: r.running.length })));
  host.append(sheet);
  workflowRefresh = setInterval(refreshWorkflows, 3000); workflowRefresh.unref?.();
  if (!workflowRows.length) newWorkflowTask();
  sync(); setTimeout(() => field.focus({ preventScroll: true }), 50);
}
