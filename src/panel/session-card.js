// A session's card in the panel, on hover / focus: where it works (folder, branch, what is not committed or pushed), what
// you asked, what it does now or last said, its checklist, subagents and background jobs, its model, context, cost and
// prompt cache. Enough not to open the office for it.
import { t as tr, num } from '../i18n/index.js';
import { modelLong } from '../shared/model-name.js';
import { el } from './fmt.js';

const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
/** the project a session is in: its git repository, else its folder's name */
export const projectOf = (s) => s.git?.repo || String(s.dir || '').split('/').filter(Boolean).pop() || '';
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60e3)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? tr('time.dayHour', { d, h: h % 24 }) : h ? tr('time.hourMin', { h, m: m % 60 }) : tr('time.min', { n: m });
}
const toks = (n) => (n >= 1e6 ? `${num(n / 1e6, n % 1e6 ? 1 : 0)}M` : `${Math.round(n / 1e3)}k`);
const usd = (n) => `$${n >= 100 ? num(Math.round(n)) : n.toFixed(2)}`;   // (dollars: always two decimals, a point)
const MARK = { done: '✓', doing: '▸', in_progress: '▸', completed: '✓' };

function section(title, ...body) { const b = el('section', 'pn-sc-sec'); b.append(el('h3', null, title), ...body); return b; }
function list(items, max, line) {
  const ul = el('ul', 'pn-sc-list');
  for (const x of items.slice(0, max)) ul.append(line(x));
  if (items.length > max) ul.append(el('li', 'pn-sc-more', tr('panel.card.more', { n: items.length - max })));
  return ul;
}

/** state: 'wait' | 'work' | 'rest' (as the row shows it); hint: what a click on the row does, if anything */
export function sessionCard(s, state, hint = '') {
  const now = Date.now(), box = el('div', 'pn-sc');
  const since = state === 'work' && s.taskStart ? dur(now - s.taskStart) : state === 'rest' && (s.doneAt || s.lastAt) ? tr('time.ago', { time: dur(now - (s.doneAt || s.lastAt)) }) : '';
  const head = el('div', 'pn-sc-head');
  head.append(el('b', null, s.title || s.name || ''), el('small', `is-${state}`, [tr(`panel.status.${state === 'rest' && s.doneAt ? 'done' : state}`), since].filter(Boolean).join(' · ')));
  box.append(head);

  // where and on what
  const facts = el('dl', 'pn-sc-facts'), fact = (k, v) => { if (v) facts.append(el('dt', null, k), el('dd', null, v)); };
  fact(tr('panel.card.dir'), s.dir || '');
  const g = s.git;
  if (g?.branch) {
    const ci = g.ci === 'green' ? tr('panel.card.ciGreen') : g.ci === 'red' ? tr('panel.card.ciRed') : '';
    fact(tr('panel.card.branch'), [g.branch, g.dirty && tr('panel.card.dirty', { n: g.dirty }), g.ahead && tr('panel.card.ahead', { n: g.ahead }), ci].filter(Boolean).join(' · '));
  }
  const u = s.usage || {};
  const model = modelLong(u.model) || u.model || '';
  const ctx = u.ctx && u.ctxMax ? tr('panel.card.ctx', { pct: Math.round((u.ctx / u.ctxMax) * 100), used: toks(u.ctx), max: toks(u.ctxMax) }) : '';
  fact(tr('panel.card.model'), [model, ctx].filter(Boolean).join(' · '));
  if (u.cost) fact(tr('panel.card.cost'), tr('panel.card.costApi', { usd: usd(u.cost) }));
  if (s.cache?.until) fact(tr('panel.card.cache'), s.cache.until > now ? tr('panel.card.warm', { time: dur(s.cache.until - now) }) : tr('panel.card.cold'));
  if (s.acct) fact(tr('panel.card.acct'), s.acct);
  const c = s.counts;
  if (c && (c.read || c.edit || c.cmd)) fact(tr('panel.card.did'), tr('panel.card.counts', { read: c.read || 0, edit: c.edit || 0, cmd: c.cmd || 0 }));
  box.append(facts);

  // what you asked, what it does or said
  if (s.lastPrompt) box.append(section(tr('panel.card.asked'), el('p', null, clip(s.lastPrompt, 220))));
  if (state === 'work' && s.last?.label) box.append(section(tr('panel.card.doing'), el('p', null, clip(s.last.label, 160))));
  else if (s.lastReply) box.append(section(tr('panel.card.reply'), el('p', null, clip(s.lastReply, 260))));

  const todos = s.todos || [];
  if (todos.length) {
    const done = todos.filter((t) => t.status === 'done' || t.status === 'completed').length;
    box.append(section(tr('panel.card.todos', { done, n: todos.length }), list(todos, 6, (t) => { const li = el('li', `is-${t.status}`); li.append(el('i', null, MARK[t.status] || '○'), el('span', null, clip(t.text || t.content, 70))); return li; })));
  }
  const subs = s.subs || [];
  if (subs.length) box.append(section(tr('panel.card.subs', { n: subs.length }), list(subs, 4, (x) => el('li', null, clip([x.type, modelLong(x.model)].filter(Boolean).join(' · ') + (x.desc ? ` — ${x.desc}` : ''), 90)))));
  const bg = s.bg || [];
  if (bg.length) box.append(section(tr('panel.card.bg', { n: bg.length }), list(bg, 3, (x) => el('li', null, clip(x.desc, 80)))));
  if (hint) box.append(el('small', 'pn-sc-hint', hint));
  return box;
}
