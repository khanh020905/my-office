// The other AI tools' accounts, in the plan card under Claude's (server/codex-accounts.mjs, antigravity-accounts.mjs):
// Codex and Antigravity IDE, each with its accounts (usage, the one in use, out until when), adding one, using another,
// and switching by itself when the one in use runs out. state.ai comes with the snapshot and { k: 'ai' }. The buttons
// only on the Mac itself; a phone sees the usage.
import { state } from '../core/state.js';
import { $, el, hhmm } from '../core/env.js';
import { icon } from './icons.js';
import { toast } from './activity.js';
import { liveWindows, resetText } from './mac-drawer.js';
import { t as tr } from '../../i18n/index.js';

const post = (url, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false }));
const level = (pct) => (pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'normal');
const nameOf = (a) => a.label || String(a.email || '').split('@')[0] || a.name || a.id;
// what is open in the section (a question before closing the IDE, a second click to remove): kept across redraws
const ask = { tool: '', id: '', what: '' };
let askTimer = 0;
const asking = (tool, id, what) => ask.tool === tool && ask.id === id && ask.what === what;
function setAsk(tool = '', id = '', what = '', ms = 0) {
  Object.assign(ask, { tool, id, what }); clearTimeout(askTimer);
  if (ms) askTimer = setTimeout(() => setAsk(), ms);
  renderAi();
}
async function act(url, body, okMsg) {
  const r = await post(url, body);
  if (!r.ok) toast(r.message || tr('ai.failed'), 7000);
  else if (okMsg) toast(okMsg(r), 7000);
  return r;
}

function bar(rows, label, pct, resetsAt, title) {
  const m = el('span', 'hl-m'), b = el('span', 'hl-bar'), fill = el('b', level(pct));
  fill.style.width = `${Math.min(100, Math.max(1, pct))}%`; b.append(fill);
  m.append(el('span', null, label), b, el('em', null, `${Math.round(pct)}%`));
  m.title = title ? `${label} · ${title}` : label;
  rows.append(m, el('small', 'plan-reset', resetsAt ? tr('mac.plan.resets', { when: resetText(resetsAt) }) : ''));
}
function badge(end, a, inUse) {
  if (inUse) end.append(el('em', 'acct-badge acct-badge--on', tr('mac.plan.inUse')));
  if (a.until) end.append(el('em', 'acct-badge acct-badge--out', tr('ai.out', { when: resetText(a.until) })));
}
// an account's heading: name, plan, its badge, and on the Mac "Use" and remove (a second click to be sure)
function head(tool, a, inUse, meta, onUse) {
  const h = el('div', `plan-other acct-head${inUse ? ' is-live' : ''}`), end = el('span', 'acct-end');
  const n = el('span', 'acct-name ai-name'); n.append(el('b', null, nameOf(a))); if (a.email) n.title = a.email;
  badge(end, a, inUse);
  if (state.isLocal && !inUse) {
    const u = el('button', 'acct-use', tr('mac.plan.use')); u.type = 'button'; u.title = tr('ai.useTitle', { name: nameOf(a) });
    u.addEventListener('click', () => onUse(u)); end.append(u);
    const sure = asking(tool, a.id, 'remove'), x = el('button', `acct-use ai-remove${sure ? ' is-sure' : ''}`); x.type = 'button';
    if (sure) x.textContent = tr('ai.removeSure'); else x.append(icon('x'));
    x.title = tr('ai.remove', { name: nameOf(a) }); x.setAttribute('aria-label', x.title);
    x.addEventListener('click', async () => {
      if (!asking(tool, a.id, 'remove')) { setAsk(tool, a.id, 'remove', 4500); return; }
      setAsk(); await act(`/api/ai/${tool}/remove`, { id: a.id });
    });
    end.append(x);
  }
  h.append(n, el('span', 'acct-meta', meta), end);
  return h;
}
function autoSwitch(tool, on, sub, extra) {
  const box = el('div', 'acct-auto ai-auto'), sw = el('button', 'acct-switch'); sw.type = 'button';
  sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(!!on)); sw.disabled = !state.isLocal;
  sw.append(el('span', 'acct-knob'), el('span', 'acct-switch-t', tr('ai.auto')));
  sw.addEventListener('click', () => act(`/api/ai/${tool}/auto`, { on: !on }));
  box.append(sw, el('small', 'acct-auto-sub', sub));
  if (extra) box.append(extra);
  return box;
}
function addButton(tool, label, fn) {
  const b = el('button', 'plan-add-btn ai-add'); b.type = 'button'; b.dataset.tool = tool;
  b.append(icon('plus'), el('span', null, label)); b.addEventListener('click', fn);
  return b;
}
const btn = (text, cls, fn) => { const b = el('button', `btn btn--sm ${cls || ''}`, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
function section(title, sub) {
  const s = el('section', 'ai-sec'), h = el('div', 'ai-head');
  h.append(el('b', null, title), el('span', 'ai-sub', sub));
  s.append(h);
  return s;
}

/* ---------- Codex ---------- */
function codexSection(c) {
  const s = section('Codex', [tr('ai.count', { n: c.list.length }), c.list.find((a) => a.id === c.now) && tr('ai.signedInAs', { name: nameOf(c.list.find((a) => a.id === c.now)) })].filter(Boolean).join(' · '));
  s.dataset.tool = 'codex';
  if (!c.cli) s.append(el('small', 'acct-warn', tr('ai.codex.noCli')));
  if (c.seat === 'apiKey') s.append(el('small', 'acct-warn', tr('ai.codex.apiKey')));
  const names = new Map(c.list.map((a) => [a.id, nameOf(a)]));
  for (const where of [...new Set((c.older || []).filter((p) => p.where !== 'terminal').map((p) => p.where))]) {
    const ids = [...new Set(c.older.filter((p) => p.where === where).map((p) => p.id))];
    s.append(el('small', 'acct-warn ai-older', tr('ai.codex.older', { where, name: ids.map((id) => names.get(id) || '?').join(', ') })));
  }
  for (const a of c.list) {
    const inUse = a.id === c.now, b = el('div', 'acct-block ai-acct'); b.dataset.id = a.id;
    b.append(head('codex', a, inUse, a.plan ? a.plan[0].toUpperCase() + a.plan.slice(1) : '', async (u) => {
      u.disabled = true;
      await act('/api/ai/codex/use', { id: a.id }, (r) => tr(r.older?.some((p) => p.where !== 'terminal') ? 'ai.codex.usedReload' : 'ai.codex.used', { name: nameOf(a) }));
    }));
    for (const w of a.windows || []) bar(b, w.key === 'session' ? tr('mac.plan.fiveHour') : tr('mac.plan.week'), w.pct, w.resetsAt);
    if (a.note === 'signedOut') b.append(el('small', 'acct-warn', tr('ai.codex.signedOut')));
    else if (!a.windows?.length) b.append(el('small', 'plan-other-note', a.note === 'readFailed' ? tr('ai.unread') : a.at ? tr('ai.noLimits') : tr('ai.reading')));
    s.append(b);
  }
  if (state.isLocal && c.cli) s.append(codexAdd(c.login));
  if (c.list.length > 1 || c.auto) s.append(autoSwitch('codex', c.auto, tr(c.auto ? 'ai.codex.autoOn' : 'ai.codex.autoOff')));
  return s;
}
let codexAdding = false;
function codexAdd(L) {
  if (L?.state === 'waiting') codexAdding = true;
  if (!codexAdding || !L) return addButton('codex', tr('ai.codex.add'), async () => { codexAdding = true; renderAi(); const r = await act('/api/ai/codex/add', {}); if (!r.ok) { codexAdding = false; renderAi(); } });
  const card = el('div', 'pa-step ai-step');
  const close = () => { codexAdding = false; renderAi(); };
  if (L.state === 'waiting') {
    card.append(el('b', null, tr('ai.codex.add')));
    const lead = el('div', 'pa-browser'); lead.append(icon('globe'), el('p', null, tr('ai.codex.browser')));
    const links = el('div', 'pa-links'), open = btn(tr('mac.add.reopen'), 'btn--confirm', () => { if (L.url) window.open(L.url, '_blank', 'noopener'); });
    open.disabled = !L.url; links.append(open);
    if (L.url) links.append(btn(tr('mac.add.copyLink'), '', (e) => navigator.clipboard?.writeText(L.url).then(() => { e.target.textContent = tr('mac.add.copied'); }).catch(() => {})));
    const wait = el('div', 'pa-wait'); wait.append(el('i', 'pa-spin'), el('span', null, tr('mac.add.waiting')));
    const acts = el('div', 'pa-acts'); acts.append(btn(tr('mac.add.cancel'), '', async () => { await post('/api/ai/codex/cancel'); close(); }));
    card.append(lead, links, el('p', 'pa-hint', tr('ai.codex.hint')), wait, acts);
  } else if (L.state === 'done') {
    const h = el('b', 'pa-done'); h.append(icon('check'), el('span', null, tr('ai.added', { name: L.name || 'Codex' })));
    card.append(h, el('p', null, tr('ai.codex.addedText')));
    const acts = el('div', 'pa-acts'); acts.append(btn(tr('mac.add.done'), 'btn--confirm', close)); card.append(acts);
  } else {
    card.append(el('b', null, tr('ai.codex.add')), el('p', 'pa-note', L.state === 'cancelled' ? tr('ai.cancelled') : tr('ai.codex.failed', { why: L.note || '' })));
    const acts = el('div', 'pa-acts'); acts.append(btn(tr('mac.add.cancel'), '', close), btn(tr('mac.add.retry'), 'btn--confirm', () => act('/api/ai/codex/add', {}))); card.append(acts);
  }
  return card;
}

/* ---------- Antigravity IDE ---------- */
function agSection(g) {
  const cur = g.list.find((a) => a.id === g.now);
  const s = section(g.app, [tr('ai.count', { n: g.list.length }), g.picked && tr('ai.ag.model', { model: g.picked })].filter(Boolean).join(' · '));
  s.dataset.tool = 'ag';
  if (g.note === 'noDb') s.append(el('small', 'acct-warn', tr('ai.ag.noDb', { app: g.app })));
  const pend = g.pending && g.list.find((a) => a.id === g.pending);
  if (pend) {   // a switch waiting for the IDE to close
    const p = el('div', 'ai-pending'); p.append(el('span', null, tr('ai.ag.pending', { name: nameOf(pend), app: g.app })));
    if (state.isLocal) {
      const acts = el('div', 'pa-acts');
      if (g.canRestart) acts.append(btn(tr('ai.ag.restartNow'), 'btn--confirm', () => act('/api/ai/ag/use', { id: pend.id, restart: true })));
      acts.append(btn(tr('ai.ag.cancelPending'), '', () => act('/api/ai/ag/later')));
      p.append(acts);
    }
    s.append(p);
  }
  for (const a of g.list) {
    const inUse = a.id === g.now, b = el('div', 'acct-block ai-acct'); b.dataset.id = a.id;
    b.append(head('ag', a, inUse, a.tierName || a.tier || '', async (u) => {
      if (!g.running) { u.disabled = true; await act('/api/ai/ag/use', { id: a.id }, () => tr('ai.ag.used', { name: nameOf(a), app: g.app })); return; }
      setAsk('ag', a.id, 'use', 15000);
    }));
    if (asking('ag', a.id, 'use')) {   // the IDE is open: now (closed and opened again), or when you close it
      const q = el('div', 'ai-ask'); q.append(el('p', null, tr(g.canRestart ? 'ai.ag.askUse' : 'ai.ag.askUseManual', { app: g.app })));
      const acts = el('div', 'pa-acts');
      acts.append(btn(tr('ai.ag.whenClosed'), '', async () => { setAsk(); await act('/api/ai/ag/use', { id: a.id }, () => tr('ai.ag.willSwitch', { name: nameOf(a), app: g.app })); }));
      if (g.canRestart) acts.append(btn(tr('ai.ag.restartNow'), 'btn--confirm', async () => { setAsk(); await act('/api/ai/ag/use', { id: a.id, restart: true }); }));
      acts.append(btn(tr('mac.add.cancel'), '', () => setAsk()));
      q.append(acts); b.append(q);
    }
    for (const r of a.rows || []) bar(b, r.label, r.pct, r.resetsAt, r.picked ? tr('ai.ag.inUseModel') : '');
    if (!a.rows?.length) b.append(el('small', 'plan-other-note', a.at ? tr('ai.noLimits') : tr('ai.ag.notYet', { app: g.app })));
    s.append(b);
  }
  if (cur && g.list.length) s.append(el('small', 'plan-other-note ai-src', tr('ai.ag.source', { app: g.app })));
  if (state.isLocal && g.note !== 'noDb') s.append(agAdd(g));
  if (g.list.length > 1 || g.auto) {
    let extra = null;
    if (g.canRestart) {
      extra = el('label', 'acct-move'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!g.restart; cb.disabled = !state.isLocal;
      cb.addEventListener('change', () => act('/api/ai/ag/auto', { restart: cb.checked }));
      extra.append(cb, el('span', null, tr('ai.ag.restartOk', { app: g.app })));
    }
    s.append(autoSwitch('ag', g.auto, tr(g.auto ? 'ai.ag.autoOn' : 'ai.ag.autoOff', { app: g.app }), extra));
  }
  return s;
}
let agAdding = false;
function agAdd(g) {
  if (g.adding?.state === 'waiting' || g.adding?.state === 'done') agAdding = true;
  if (!agAdding) return addButton('ag', tr('ai.ag.add'), () => { agAdding = true; renderAi(); });
  const card = el('div', 'pa-step ai-step'), close = async () => { agAdding = false; if (g.adding) await post('/api/ai/ag/cancel'); renderAi(); };
  card.append(el('b', null, tr('ai.ag.add')));
  if (g.adding?.state === 'done') {
    const h = el('b', 'pa-done'); h.append(icon('check'), el('span', null, tr('ai.added', { name: g.adding.name || g.app })));
    card.replaceChildren(h, el('p', null, tr('ai.ag.addedText', { app: g.app })));
    const acts = el('div', 'pa-acts'); acts.append(btn(tr('mac.add.done'), 'btn--confirm', close)); card.append(acts);
  } else if (g.adding?.state === 'waiting') {
    const wait = el('div', 'pa-wait'); wait.append(el('i', 'pa-spin'), el('span', null, tr('ai.ag.signIn', { app: g.app })));
    const acts = el('div', 'pa-acts'); acts.append(btn(tr('mac.add.cancel'), '', close));
    card.append(el('p', null, tr('ai.ag.signInText', { app: g.app })), wait, acts);
  } else {   // before: what is going to happen
    card.append(el('p', null, tr(g.running ? 'ai.ag.addIntroOpen' : 'ai.ag.addIntro', { app: g.app })));
    const acts = el('div', 'pa-acts');
    acts.append(btn(tr('mac.add.cancel'), '', () => { agAdding = false; renderAi(); }));
    if (!g.running || g.canRestart) acts.append(btn(tr(g.running ? 'ai.ag.addRestart' : 'ai.ag.addOpen', { app: g.app }), 'btn--confirm', async (e) => { e.target.disabled = true; const r = await act('/api/ai/ag/add', { restart: g.running }); if (!r.ok) { agAdding = false; renderAi(); } }));
    else card.append(el('small', 'acct-warn', tr('ai.ag.closeFirst', { app: g.app })));
    card.append(acts);
  }
  return card;
}

/* ---------- the tabs: Claude, Codex, Antigravity ----------
   As the phone window's two ways in: each tool's name, and under it the one thing worth knowing (the tightest limit of
   the account in use, out until when, a switch waiting), its dot coloured the way the limit bars are. Only the picked
   tool's accounts show; the pick is kept in this browser. Claude alone: no tabs, the card as it always was. */
const TAB_KEY = 'office-plan-tab';
let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'claude'; } catch { return 'claude'; } })();
const tight = (ws) => (ws || []).reduce((a, w) => (!a || w.pct > a.pct ? w : a), null);
// (a tab is narrow: "out until 13:10", or with the day when it isn't today)
const outShort = (t) => tr('ai.tab.out', { when: new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : `${tr('mac.plan.weekdays', null, 'list')[new Date(t).getDay()]} ${hhmm(t)}` });
// a tab's line: [text, level] ('off': grey)
function claudeLine() {
  const until = state.limits?.until, top = tight(liveWindows());
  if (until > Date.now()) return [outShort(until), 'critical'];
  if (!top) return [state.limitsNote ? tr('mac.plan.unread') : tr('ai.tab.reading'), 'off'];
  return [`${top.key === 'session' ? tr('mac.plan.fiveHour') : top.label} ${Math.round(top.pct)}%`, level(top.pct)];
}
function codexLine(c) {
  const a = c.list.find((x) => x.id === c.now);
  if (!a) return [tr(c.seat === 'apiKey' ? 'ai.tab.apiKey' : 'ai.tab.signedOut'), 'off'];
  if (a.until) return [outShort(a.until), 'critical'];
  const top = tight(a.windows);
  return top ? [`${top.key === 'session' ? tr('mac.plan.fiveHour') : tr('mac.plan.week')} ${Math.round(top.pct)}%`, level(top.pct)] : [tr('ai.tab.reading'), 'off'];
}
function agLine(g) {
  const a = g.list.find((x) => x.id === g.now);
  if (g.pending) return [tr('ai.tab.pending'), 'warn'];
  if (!a) return [tr('ai.tab.signedOut'), 'off'];
  if (a.until) return [outShort(a.until), 'critical'];
  const r = a.rows?.[0];
  return r ? [`${r.label.split(' ')[0]} ${r.pct}%`, level(r.pct)] : [tr('ai.tab.reading'), 'off'];
}
function renderTabs(tools) {
  const bar = $('plan-tabs'), card = $('plan-card'); if (!bar || !card) return;
  const on = tools.length > 1, title = $('plan-title');
  if (!tools.some((x) => x.k === tab)) tab = 'claude';
  bar.hidden = !on; card.classList.toggle('has-tabs', on);
  if (title) { title.dataset.claude ??= title.textContent; title.textContent = on ? tr('ai.title') : title.dataset.claude; }
  $('plan-pane-claude').hidden = on && tab !== 'claude';
  if ($('plan-at')) $('plan-at').hidden = on && tab !== 'claude';
  if (!on) return;
  bar.style.setProperty('--n', String(tools.length));
  bar.replaceChildren(...tools.map(({ k, name, line: [text, lv] }) => {
    const b = el('button', `pm-tab${k === tab ? ' is-sel' : ''}`); b.type = 'button'; b.dataset.tab = k;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === tab));
    b.append(el('span', null, name), el('i', `pm-dot${lv === 'off' ? '' : lv === 'normal' ? ' is-on' : ` is-${lv}`}`, text));
    b.title = `${name}: ${text}`;
    b.addEventListener('click', () => { tab = k; try { localStorage.setItem(TAB_KEY, k); } catch { /* private mode */ } renderAi(); });
    return b;
  }));
}

/** The tabs and the section, drawn again on every change (not while a button in it is being pressed). */
export function renderAi() {
  const box = $('plan-ai'); if (!box) return;
  const ai = state.ai, showCodex = !!ai?.codex && (ai.codex.cli || ai.codex.list.length), showAg = !!ai?.ag && (ai.ag.note !== 'noDb' || ai.ag.list.length);
  renderTabs([{ k: 'claude', name: 'Claude', line: claudeLine() }, showCodex && { k: 'codex', name: 'Codex', line: codexLine(ai.codex) }, showAg && { k: 'ag', name: 'Antigravity', line: agLine(ai.ag) }].filter(Boolean));
  box.hidden = (!showCodex && !showAg) || tab === 'claude';
  if (!showCodex && !showAg) { box.replaceChildren(); return; }
  if (box.contains(document.activeElement) && document.activeElement.matches(':active')) return;
  box.replaceChildren(...[showCodex && tab === 'codex' && codexSection(ai.codex), showAg && tab === 'ag' && agSection(ai.ag)].filter(Boolean));
}
export function setAi(ai) { state.ai = ai || null; renderAi(); }
