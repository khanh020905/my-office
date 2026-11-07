// Writing to a session from its own page: a box under the conversation, the same way as the group chat's "Gửi tới"
// (POST /api/tasks { sid, text, images, chat: true }; a session at work asks first, then POST /api/tasks/steer).
// What was sent stays above the box with its progress, and the answer lands in the conversation above it.
import { state } from '../core/state.js';
import { el } from '../core/env.js';
import { icon } from './icons.js';
import { toast } from './activity.js';
import { dictate, shrink } from './task-sheet.js';
import { dn, sessions } from '../people/workers.js';
import { TOKEN } from '../net/live.js';
import { DEMO } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (path, body) => fetch(`${path}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
const sent = new Map();   // session id -> [{ text, task, st: 'send' | 'work' | 'done' | 'fail' | 'ask', note }]
let root, input, sendBtn, sentEl, noteEl, photoEl, fileEl, micBtn, stopMic = null, images = [], allowed = null, allowedAt = 0, poll = 0, onDone = () => {};
const sids = new Map();   // session id -> its conversation id (the pages' sessions don't carry it: GET /api/tasks lists them)

export const composeHeight = () => (root && !root.hidden ? root.offsetHeight : 0);
const phone = () => document.documentElement.classList.contains('is-phone');

export function setupCompose(host, refreshLog) {
  onDone = refreshLog;
  root = el('form', 'ds-compose'); root.id = 'ds-compose'; root.hidden = true;
  noteEl = el('p', 'ds-cmp-note'); sentEl = el('ul', 'ds-sent'); photoEl = el('div', 'ds-cmp-photos'); photoEl.hidden = true;
  const row = el('div', 'ds-cmp-row');
  fileEl = el('input'); fileEl.type = 'file'; fileEl.accept = 'image/*'; fileEl.multiple = true; fileEl.hidden = true;
  const pic = el('button', 'ds-cmp-ib'); pic.type = 'button'; pic.title = tr('chat.task.photo'); pic.setAttribute('aria-label', tr('chat.task.photo')); pic.append(icon('image'));
  pic.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', async () => {
    for (const f of [...fileEl.files].slice(0, 4 - images.length)) { try { images.push(await shrink(f)); } catch { toast(tr('drawer.compose.badPhoto')); } }
    fileEl.value = ''; drawPhotos(); sync();
  });
  input = el('textarea', 'ds-cmp-in'); input.rows = 1; input.maxLength = 4000; input.enterKeyHint = 'send';
  input.addEventListener('input', () => { grow(); sync(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && (e.metaKey || e.ctrlKey || (!e.shiftKey && !phone()))) { e.preventDefault(); submit(); } });
  micBtn = el('button', 'ds-cmp-ib'); micBtn.type = 'button'; micBtn.title = tr('chat.task.mic'); micBtn.setAttribute('aria-label', tr('chat.task.mic')); micBtn.setAttribute('aria-pressed', 'false'); micBtn.append(icon('mic'));
  micBtn.addEventListener('click', () => { if (stopMic) { stopMic(); stopMic = null; return; } stopMic = dictate(micBtn, input, () => { grow(); sync(); }); });
  sendBtn = el('button', 'ds-cmp-send'); sendBtn.type = 'submit'; sendBtn.title = tr('drawer.compose.send'); sendBtn.setAttribute('aria-label', tr('drawer.compose.send')); sendBtn.append(icon('send'));
  row.append(pic, fileEl, input, micBtn, sendBtn);
  root.append(noteEl, sentEl, photoEl, row);
  root.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  host.append(root);
}
const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; };
function sync() { sendBtn.disabled = !(input.value.trim() || images.length) || allowed === false; }
function drawPhotos() {
  photoEl.hidden = !images.length; photoEl.replaceChildren();
  images.forEach((src, i) => {
    const b = el('button', 'ds-cmp-ph'); b.type = 'button'; b.title = tr('drawer.compose.dropPhoto'); const im = el('img'); im.src = src; im.alt = ''; b.append(im);
    b.addEventListener('click', () => { images.splice(i, 1); drawPhotos(); sync(); }); photoEl.append(b);
  });
}
const mine = () => sent.get(state.selectedId) || [];
function drawSent() {
  sentEl.replaceChildren(); sentEl.hidden = !mine().length;
  for (const m of mine().slice(-3)) {
    const li = el('li', `ds-sent-i is-${m.st}`); li.dataset.state = m.st;
    const t = el('span', 'ds-sent-t', m.text || tr('drawer.compose.photosOnly'));
    li.append(el('span', 'ds-sent-st', tr(`drawer.compose.st.${m.st}`)), t);
    if (m.st === 'ask') {
      const yes = el('button', 'btn btn--sm btn--primary', tr('chat.steer.yes')), no = el('button', 'btn btn--sm', tr('chat.steer.no')); yes.type = no.type = 'button';
      yes.addEventListener('click', () => steer(m)); no.addEventListener('click', () => { sent.set(state.selectedId, mine().filter((x) => x !== m)); if (!input.value) { input.value = m.text; grow(); sync(); } drawSent(); });
      li.append(el('small', null, tr('drawer.compose.askSteer')), yes, no);
    }
    if (m.st === 'fail' && m.note) li.append(el('small', null, m.note));
    sentEl.append(li);
  }
  clearTimeout(poll);
  if (mine().some((m) => m.st === 'work')) poll = setTimeout(track, 2500);
}
// is the work this page started still running? (GET /api/tasks lists what runs); when it is over: its answer is in the conversation
async function track() {
  const r = await fetch(`/api/tasks${tq()}`).then((x) => x.json()).catch(() => null);
  if (r?.ok) for (const [id, list] of sent) for (const m of list) if (m.st === 'work' && !r.running.some((t) => t.id === m.task)) { m.st = 'done'; if (id === state.selectedId) onDone(); }
  onDone();
  drawSent();
}
async function steer(m) {
  const s = sessions.get(state.selectedId), sid = sids.get(state.selectedId); if (!s || !sid) return;
  m.st = 'send'; drawSent();
  const r = await post('/api/tasks/steer', { sid, text: m.text });
  if (r?.ok) { m.st = 'done'; m.text = `💬 ${m.text}`; toast(tr('chat.steer.sent', { name: dn(s) || 'Claude' })); onDone(); }
  else { m.st = 'fail'; m.note = r?.message || tr('drawer.unreachable'); }
  drawSent();
}
async function submit() {
  const s = sessions.get(state.selectedId), text = input.value.trim(), sid = sids.get(state.selectedId);
  if (!s || sendBtn.disabled || (!text && !images.length)) return;
  if (DEMO) { toast(tr('drawer.compose.demo')); return; }
  stopMic?.(); stopMic = null;
  const pics = images.slice(), m = { text, task: '', st: 'send', note: '' };
  input.value = ''; images = []; drawPhotos(); grow(); sync();
  sent.set(s.id, [...(sent.get(s.id) || []), m].slice(-6)); drawSent();
  const r = await post('/api/tasks', { sid, text, images: pics, chat: true });
  if (r?.ok) { m.st = 'work'; m.task = r.task?.id || ''; onDone(); }
  else if (r?.code === 'busy' || r?.code === 'macBusy') m.st = 'ask';   // (at work: cut in?)
  else { m.st = 'fail'; m.note = r?.code === 'notAllowed' ? tr('chat.task.notAllowed') : r?.message || tr('drawer.unreachable'); if (!input.value) { input.value = text; images = pics; drawPhotos(); grow(); sync(); } }
  if (state.selectedId === s.id) drawSent();
}
// shown when a session is opened: the box, or a word on why there is none (a phone not allowed to give work yet)
export async function renderCompose() {
  const s = sessions.get(state.selectedId);
  if (!root) return;
  root.hidden = !s; if (!s) return;
  drawSent(); drawPhotos();
  if (DEMO) allowed = true;
  else if (!sids.has(state.selectedId) || allowed === null || Date.now() - allowedAt > 15000) {
    const id = state.selectedId, r = await fetch(`/api/tasks${tq()}`).then((x) => x.json()).catch(() => null);
    allowed = r?.ok ? !!r.allowed : null; allowedAt = Date.now();
    for (const x of r?.sessions || []) sids.set(x.id, x.sid);
    if (id !== state.selectedId) return;
    if (!r?.ok) { noteEl.textContent = tr('drawer.unreachable'); noteEl.hidden = false; root.classList.add('is-off'); input.disabled = true; return; }
  }
  const off = allowed === false, noSid = !sids.has(state.selectedId) && !DEMO;
  noteEl.textContent = off ? tr('chat.task.notAllowed') : noSid ? tr('drawer.compose.noSid') : '';
  noteEl.hidden = !noteEl.textContent;
  input.disabled = off || noSid; input.placeholder = tr('chat.to.placeholder', { name: dn(s) || 'Claude' });
  root.classList.toggle('is-off', off || noSid);
  sync();
}
