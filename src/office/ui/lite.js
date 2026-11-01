// The 2D view: every session as a row, no 3D (the office keeps a frame a second behind it). Approvals on top, then
// needs you → working → resting; filter tabs, a search, and per row the conversation, its project and branch, what it
// is doing now, its checklist, its context, its time and its cost. A click opens the session's drawer. Kept per
// browser (office-lite); the top bar's 3D | 2D switch and the toolbar's list button both turn it on and off. Saves the
// battery on a phone and works without WebGL. First idea from agent-office's lite page (MIT).
import { $, el, fmtAgo, fmtClock, nowMs, short } from '../core/env.js';
import { dn, sessions } from '../people/workers.js';
import { fmtUsd } from './activity.js';
import { cacheWords } from './cache-words.js';
import { icon, TYPE_ICON } from './icons.js';
import { verb } from './event-text.js';
import { openSession } from './session-drawer.js';
import { closePlace } from '../interact/place-cards.js';
import { exitFp, fp } from '../interact/first-person.js';
import { t as tr } from '../../i18n/index.js';

export let lite = false;
let filter = 'all', query = '', head = null, tabs = null, permHost = null, listEl = null, emptyEl = null;
const GROUPS = ['wait', 'work', 'rest'];
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const project = (s) => s.git?.repo || String(s.dir || '').split('/').filter(Boolean).pop() || '';
const statusOf = (s) => (s.status === 'wait' ? 'wait' : s.status === 'rest' ? 'rest' : 'work');

// what it is doing now, in words of the work (not of the office: no lift, no shop)
function nowOf(s) {
  if (s.status === 'wait') return { ic: 'alert', text: s.last ? tr('lite.now.waitOn', { what: verb(s.last) }) : tr('lite.now.wait') };
  if (s.stuck) return { ic: 'alert', text: tr(`activity.doing.stuck.${s.stuck.kind}`, { label: short(s.stuck.label, 40), n: s.stuck.n, mins: s.stuck.mins }), warn: true };
  if (s.status === 'rest' && s.bg?.length) return { ic: 'terminal', text: tr('activity.doing.bg', { desc: s.bg[0].desc }) };
  if (s.status === 'rest') return { ic: 'check', text: s.lastReply ? short(s.lastReply.replace(/\s+/g, ' '), 140) : tr('lite.now.done'), muted: true };
  if (s.last) return { ic: TYPE_ICON[s.last.type] || 'sparkle', text: verb(s.last) };
  return { ic: 'sparkle', text: tr('activity.doing.working') };
}
function matches(s) {
  if (!query) return true;
  const hay = fold([dn(s), s.name, s.dir, s.git?.branch, s.lastPrompt].join(' '));
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/* ---------- one row ---------- */
function row(s) {
  const st = statusOf(s), now = nowOf(s), b = el('button', `v2-row is-${st}${s.stuck && st !== 'rest' ? ' is-stuck' : ''}`);
  b.type = 'button'; b.dataset.sid = s.id;
  const dot = el('span', 'v2-dot'); dot.setAttribute('aria-hidden', 'true');
  const main = el('span', 'v2-main'), sub = el('span', 'v2-sub');
  main.append(el('b', 'v2-title', dn(s)));
  // under the name: its project (when the name isn't it already), branch, where it runs, and resting, whether its cache
  // is still warm (cheap to carry on); none of that, while working: the task it was given
  const proj = project(s), cache = st === 'rest' && s.cache ? cacheWords(s.cache, 'lite')?.text : '';
  const bits = [proj !== dn(s) ? proj : '', s.git?.branch ? `${s.git.branch}${s.git.dirty ? ' •' : ''}` : '', s.origin, cache].filter(Boolean);
  sub.textContent = bits.length ? bits.join(' · ') : st !== 'rest' && s.lastPrompt ? `“${s.lastPrompt}”` : '';
  if (sub.textContent) main.append(sub);
  const doing = el('span', `v2-now${now.muted ? ' is-muted' : ''}${now.warn ? ' is-warn' : ''}`);
  doing.append(icon(now.ic), el('span', null, now.text));
  if (s.status !== 'rest' && s.lastPrompt) doing.title = s.lastPrompt;
  // the checklist (x of y done), the context window, the time (this task's, or since it rested), the cost
  const todo = el('span', 'v2-todo'), todos = s.todos || [];
  if (todos.length) { const done = todos.filter((x) => x.status === 'done').length; todo.textContent = `${done}/${todos.length}`; todo.title = tr('lite.todoTitle', { done, n: todos.length }); }
  const ctx = el('span', 'v2-ctx');
  if (s.usage?.ctxMax) {
    const pct = Math.min(100, Math.round((s.usage.ctx / s.usage.ctxMax) * 100)), track = el('span', 'v2-track'), bar = el('i');
    bar.style.width = `${pct}%`; track.append(bar); ctx.dataset.level = pct >= 85 ? 'high' : pct >= 60 ? 'mid' : 'low';
    ctx.append(track, el('small', null, `${pct}%`)); ctx.title = tr('lite.ctx', { pct });
  }
  const time = el('span', 'v2-time', st === 'rest' ? fmtAgo((nowMs() - (s.lastAt || nowMs())) / 1000) : s.taskStart ? fmtClock((nowMs() - s.taskStart) / 1000) : '');
  const cost = el('span', 'v2-cost', s.usage?.cost ? fmtUsd(s.usage.cost) : '');
  b.append(dot, main, doing, todo, ctx, time, cost);
  b.addEventListener('click', () => openSession(s.id));
  return b;
}
// the subagents a working session has out, under its row
function subRows(s) {
  if (!s.subs?.length || s.status === 'rest') return [];
  return s.subs.slice(0, 4).map((x) => {
    const r = el('div', 'v2-subrow');
    r.append(el('span', 'v2-sub-arrow', '↳'), el('b', null, x.type || 'agent'), el('span', null, x.last ? verb(x.last) : x.desc || ''));
    return r;
  });
}

/* ---------- the view ---------- */
function build() {
  const box = $('lite'); if (!box || head) return;
  head = el('div', 'v2-head');
  const title = el('div', 'v2-h1'); title.append(el('h2', null, tr('lite.title')));
  tabs = el('div', 'v2-tabs'); tabs.setAttribute('role', 'tablist');
  for (const k of ['all', ...GROUPS]) {
    const t = el('button', 'v2-tab'); t.type = 'button'; t.setAttribute('role', 'tab'); t.dataset.f = k; t.setAttribute('aria-selected', String(k === filter));
    t.append(el('span', null, k === 'all' ? tr('lite.all') : tr(`lite.${k}`)), el('small', 'v2-n', '0'));
    t.addEventListener('click', () => { filter = k; for (const x of tabs.children) x.setAttribute('aria-selected', String(x.dataset.f === k)); renderLite(); });
    tabs.append(t);
  }
  const search = el('input', 'v2-search'); search.type = 'search'; search.id = 'lite-q'; search.placeholder = tr('lite.search'); search.setAttribute('aria-label', tr('lite.search')); search.autocomplete = 'off';
  search.addEventListener('input', () => { query = search.value.trim(); renderLite(); });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { search.value = ''; query = ''; renderLite(); search.blur(); } });
  const bar = el('div', 'v2-bar'); bar.append(tabs, search);
  head.append(title, bar);
  permHost = el('div', 'v2-perms'); listEl = el('div', 'v2-list'); emptyEl = el('p', 'v2-empty'); emptyEl.hidden = true;
  box.replaceChildren(head, permHost, listEl, emptyEl);
}
export function setLite(on) {
  lite = on; document.body.classList.toggle('is-lite', on); $('lite').hidden = !on; $('btn-lite').setAttribute('aria-pressed', String(on));
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String((b.dataset.view === '2d') === on));
  try { localStorage.setItem('office-lite', on ? 'on' : 'off'); } catch { /* storage blocked */ }
  // the approvals: at the top of the list in 2D, over the office in 3D
  const stack = $('perm-stack');
  if (on) { build(); if (stack && permHost && stack.parentNode !== permHost) permHost.append(stack); if (fp.on) exitFp(); closePlace(); renderLite(); }
  else if (stack && stack.parentNode === permHost) $('lite').after(stack);
}
export function renderLite() {
  if (!lite || !listEl) return;
  const all = [...sessions.values()], counts = { all: all.length, wait: 0, work: 0, rest: 0 };
  for (const s of all) counts[statusOf(s)]++;
  for (const t of tabs.children) { t.querySelector('.v2-n').textContent = String(counts[t.dataset.f]); t.classList.toggle('has-wait', t.dataset.f === 'wait' && counts.wait > 0); }
  const list = all.filter((s) => (filter === 'all' || statusOf(s) === filter) && matches(s));
  // (the focused row keeps its focus through the redraw every 2 s)
  const focused = document.activeElement?.closest?.('.v2-row')?.dataset.sid, top = $('lite').scrollTop;
  const frag = document.createDocumentFragment();
  for (const g of GROUPS) {
    const rows = list.filter((s) => statusOf(s) === g).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)); if (!rows.length) continue;
    const sec = el('section', `v2-group is-${g}`), box = el('div', 'v2-rows');
    for (const s of rows) box.append(row(s), ...subRows(s));
    sec.append(el('h3', 'v2-gh', `${tr(`lite.${g}`)} · ${rows.length}`), box);
    frag.append(sec);
  }
  listEl.replaceChildren(frag);
  emptyEl.hidden = !!list.length;
  emptyEl.textContent = all.length ? tr('lite.none', { q: query }) : tr('lite.empty');
  if (focused) listEl.querySelector(`.v2-row[data-sid="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  $('lite').scrollTop = top;
}

export function setup() {
  try { lite = localStorage.getItem('office-lite') === 'on'; } catch { /* storage blocked */ }
  if (new URLSearchParams(location.search).get('view') === '2d') lite = true;
  $('btn-lite').addEventListener('click', () => setLite(!lite));
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setLite(b.dataset.view === '2d'));
  // "/" finds a session in 2D (not while typing somewhere)
  document.addEventListener('keydown', (e) => {
    if (!lite || e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault(); $('lite-q')?.focus();
  });
  setInterval(() => { if (lite && document.visibilityState === 'visible') renderLite(); }, 2000);
}
