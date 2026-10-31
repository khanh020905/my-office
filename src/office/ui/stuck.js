// Stuck sessions ("Ngắt vòng lặp kẹt", server/loops.mjs): the card in the group chat (what repeats, Stop, a hint for
// Claude) and the row in Settings → More (on or off, after how many failures, after how many minutes of spending with
// nothing edited). The person's red "kẹt" tag is people/workers.js (setStuck), the line in the list ui/activity.js.
import { $, STATIC, el, short } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { sessions, dn } from '../people/workers.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (url, body) => fetch(`${url}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
const typed = new Map();   // card -> the hint being written (the card is drawn again as its state changes)

/** The card for a 'loop' message: redraw() draws it again (the chat window's own). */
export function loopCard(m, redraw) {
  const L = m.loop || {}, s = sessions.get(L.sess), name = (s && dn(s)) || m.name || '';
  const live = L.state === 'on' || L.state === 'stopping';
  const box = el('div', `zc-loop is-${L.state || 'on'}`), head = el('div', 'zc-loop-h');
  head.append(el('i', 'zc-loop-ic', L.state === 'stopped' ? '⏹' : live ? '⛔' : '✓'), el('b', null, tr('chat.loop.title')));
  // the line, with the command that repeats set as code
  const usd = L.usd != null ? `$${Number(L.usd).toFixed(2)}` : '', line = el('p', 'zc-loop-t');
  const [before, after = ''] = tr(`chat.loop.${L.kind || 'repeat'}`, { name, label: '\u0000', n: L.n || 0, next: (L.n || 0) + (L.blocked || 0), mins: L.mins || 0, usd }).split('\u0000');
  line.append(before); if (L.kind === 'repeat') line.append(el('code', null, short(L.label || '', 60)), after);
  box.append(head, line);
  const note = L.state === 'stopping' ? tr('chat.loop.stopping') : L.state === 'stopped' ? tr('chat.loop.stopped') : L.state === 'over' ? tr(`chat.loop.over.${L.why || 'end'}`) : '';
  if (note) box.append(el('small', 'zc-loop-note', note));
  if (L.hint) box.append(el('small', `zc-loop-hint is-${L.hint}`, tr({ sent: 'chat.loop.hintSent', got: 'chat.loop.hintGot', lost: 'chat.loop.hintLost', rest: 'chat.loop.hintRest' }[L.hint] || 'chat.loop.hintSent')));
  if (!live && L.hint !== 'lost') return box;
  // Stop (tap twice: it ends what Claude is doing), and a hint for Claude
  const acts = el('div', 'zc-loop-acts');
  if (L.state === 'on') {
    const stop = el('button', 'zc-work-btn is-no zc-loop-stop', tr('chat.loop.stop')); stop.type = 'button';
    stop.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!stop.classList.contains('is-sure')) { stop.classList.add('is-sure'); stop.textContent = tr('chat.loop.stopSure'); setTimeout(() => { if (stop.isConnected) { stop.classList.remove('is-sure'); stop.textContent = tr('chat.loop.stop'); } }, 4000); return; }
      stop.disabled = true;
      const r = await post('/api/loop', { op: 'stop', id: L.sess });
      if (!r?.ok) { stop.disabled = false; toast(r?.message || tr('drawer.unreachable'), 6000); }
    });
    acts.append(stop);
  }
  const hintBtn = el('button', 'zc-work-btn is-ok zc-loop-hint-btn', tr('chat.loop.hint')); hintBtn.type = 'button';
  const form = el('form', 'zc-loop-form'), input = el('input', 'zc-loop-in'), send = el('button', 'zc-work-btn is-ok', tr('chat.loop.send'));
  input.placeholder = tr('chat.loop.hintPh'); input.maxLength = 1000; input.value = typed.get(m.id) || ''; send.type = 'submit';
  form.hidden = !typed.has(m.id); form.append(input, send);
  hintBtn.addEventListener('click', (e) => { e.stopPropagation(); form.hidden = !form.hidden; if (form.hidden) typed.delete(m.id); else { typed.set(m.id, input.value); input.focus(); } });
  form.addEventListener('click', (e) => e.stopPropagation());   // (not the bubble's own tap, which opens its reactions)
  input.addEventListener('input', () => typed.set(m.id, input.value));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const text = input.value.trim(); if (!text) return;
    send.disabled = true;
    let r = await post('/api/loop', { op: 'hint', id: L.sess, text });
    // its turn is already over: the hint carries the conversation on, the way "Gửi tới" does (server: POST /api/tasks)
    if (r?.code === 'resting') { r = await post('/api/tasks', { sid: r.sid, text, chat: true }); if (r?.ok) { m.loop = { ...L, hint: 'rest' }; redraw?.(m); } }
    send.disabled = false;
    if (!r?.ok) { toast(r?.message || tr('drawer.unreachable'), 7000); return; }
    typed.delete(m.id);
  });
  if (L.task || s) acts.append(hintBtn);
  box.append(acts, form);
  return box;
}
/** One line for the chat's small preview while its window is shut. */
export function loopPeek(m) {
  const L = m.loop || {};
  return `⛔ ${tr(`chat.loop.${L.kind || 'repeat'}`, { name: m.name || '', label: `“${short(L.label || '', 40)}”`, n: L.n || 0, next: (L.n || 0) + (L.blocked || 0), mins: L.mins || 0, usd: L.usd != null ? `$${Number(L.usd).toFixed(2)}` : '' })}`;
}

/* ---------- Settings → More: on or off, and its two thresholds (kept by the server: data/prefs.json) ---------- */
let conf = null;
function drawSettings() {
  const box = $('st-loop'); if (!box || !conf) return;
  box.hidden = false;
  box.querySelector('[data-loop-tgl]').setAttribute('aria-checked', String(!!conf.on));
  for (const b of box.querySelectorAll('[data-loop-n]')) { b.setAttribute('aria-pressed', String(Number(b.dataset.loopN) === conf.n)); b.disabled = !conf.on; }
  for (const b of box.querySelectorAll('[data-loop-min]')) { b.setAttribute('aria-pressed', String(Number(b.dataset.loopMin) === conf.min)); b.disabled = !conf.on; }
  $('st-loop-install').hidden = !!conf.hookAt || !conf.on;   // (the hook never heard from: install has to run again)
}
async function load() { if (DEMO) return; const r = await fetch(`/api/loop${tq()}`).then((x) => x.json()).catch(() => null); if (r?.ok) { conf = r; drawSettings(); } }
async function save(change) {
  const r = await post('/api/loop', { op: 'config', ...conf, ...change });
  if (r?.ok) { conf = r; drawSettings(); } else toast(r?.message || tr('drawer.unreachable'), 6000);
}

export function setup() {
  const box = $('st-loop'); if (!box || DEMO) return;
  $('btn-look')?.addEventListener('click', () => { if (!$('pop-look').hidden) load(); });   // (fresh each time Settings opens)
  box.addEventListener('click', (e) => {
    if (!conf) return;
    const t = e.target.closest('[data-loop-tgl]'); if (t) { save({ on: !conf.on }); return; }
    const n = e.target.closest('[data-loop-n]'); if (n) { save({ n: Number(n.dataset.loopN) }); return; }
    const m = e.target.closest('[data-loop-min]'); if (m) save({ min: Number(m.dataset.loopMin) });
  });
  load();
}
