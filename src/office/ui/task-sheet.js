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
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  let url = c.toDataURL('image/jpeg', 0.82);
  if (url.length > 480_000) url = c.toDataURL('image/jpeg', 0.6);   // (under what the group chat shows too)
  return url;
}

/** Opens the sheet inside the chat window; to: { sid } (a conversation) or { dir } (a folder) to start with; text. */
export async function openTaskSheet(host, { to = null, text = '' } = {}) {
  sheet?.remove();
  let stopMic = null;
  const r = await fetch(`/api/tasks${q()}`).then((x) => x.json()).catch(() => null);
  sheet = el('div', 'zc-task'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', tr('chat.task.title'));
  const head = el('div', 'zc-task-head'), close = el('button', 'zc-ib'); close.type = 'button'; close.title = tr('chat.close'); close.append(icon('x'));
  close.addEventListener('click', () => { stopMic?.(); sheet.remove(); sheet = null; });
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
  // what to do: typed or spoken, and photos
  const field = el('textarea', 'zc-task-in'); field.rows = 4; field.maxLength = 4000; field.placeholder = tr('chat.task.placeholder'); field.value = text;
  field.addEventListener('keydown', (e) => e.stopPropagation());
  const photos = [], thumbs = el('div', 'zc-task-thumbs');
  const drawThumbs = () => thumbs.replaceChildren(...photos.map((u, i) => { const t = el('span', 'zc-task-thumb'), img = el('img'), x = el('button', null, '✕'); img.src = u; x.type = 'button'; x.addEventListener('click', () => { photos.splice(i, 1); drawThumbs(); sync(); }); t.append(img, x); return t; }));
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
  file.addEventListener('change', async () => { for (const f of [...file.files].slice(0, 4 - photos.length)) { try { photos.push(await shrink(f)); } catch { /* not an image it can read */ } } file.value = ''; drawThumbs(); sync(); });
  const mic = el('button', 'zc-task-tool'); mic.type = 'button'; mic.title = tr('chat.task.mic'); mic.append(icon('mic'), el('span', null, tr('chat.task.mic')));
  mic.addEventListener('click', () => { if (stopMic) { stopMic(); stopMic = null; } else stopMic = dictate(mic, field, sync); });
  const cam = el('button', 'zc-task-tool'); cam.type = 'button'; cam.title = tr('chat.task.photo'); cam.append(icon('image'), el('span', null, tr('chat.task.photo')));
  cam.addEventListener('click', () => file.click());
  const tools = el('div', 'zc-task-tools'); tools.append(mic, cam, file);
  const go = el('button', 'zc-task-go', tr('chat.task.send')); go.type = 'button';
  const sync = () => { go.disabled = !pick || !field.value.trim(); };
  field.addEventListener('input', sync);
  go.addEventListener('click', async () => {
    stopMic?.(); stopMic = null; go.disabled = true; go.textContent = tr('chat.task.sending');
    const res = await fetch(`/api/tasks${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pick, text: field.value, images: photos }) }).then((x) => x.json()).catch(() => null);
    if (res?.ok) { toast(tr('chat.task.started'), 5000); sheet.remove(); sheet = null; return; }
    toast(res?.message || tr('drawer.unreachable'), 6000); go.textContent = tr('chat.task.send'); sync();
  });
  sheet.append(list, field, thumbs, tools, el('p', 'zc-task-note', tr('chat.task.note')), go);
  if (r.running.length) sheet.append(el('p', 'zc-task-note', tr('chat.task.running', { n: r.running.length })));
  host.append(sheet);
  sync(); setTimeout(() => field.focus({ preventScroll: true }), 50);
}
