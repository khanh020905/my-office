// The activity column and the session list.
import { state } from '../core/state.js';
import { $, el, fmtBytes, fmtClock, hhmm, nowMs } from '../core/env.js';
import { STATUS_LABEL, verb } from './event-text.js';
import { TYPE_ICON, TYPE_TONE, icon } from './icons.js';
import { hoverRing, selRing } from '../interact/rings.js';
import { AGENT_NAME, agentMark, agentOf, colorOf, dn, dnOf, sessions, workers } from '../people/workers.js';
import { renderLite } from './lite.js';
import { openSession, renderActivity, renderSessionHead, renderSubs, tab, toggleSession } from './session-drawer.js';
import { macSnap } from './mac-drawer.js';
import { queuePlace } from '../interact/place-cards.js';
import { unseenDone } from '../life/your-turn.js';
import { whereabouts } from '../people/outings.js';
import { imageUrl, openImage } from './image-view.js';
import { t as tr, num } from '../../i18n/index.js';

let feedFilter = 'all';
let query = '';
let toastEl;
let toastTimer;
export function toast(msg, ms = 3400) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms); }
const ATT = new Set(['wait', 'ask', 'fail', 'cired']);
export const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
// Consecutive events from the same session (or subagent) within four minutes share one card; alerts stand alone
// with their actions, so "needs you" never hides inside a group.
const KIND = { cmd: ['bash', 'test', 'testok', 'testfail', 'deploy', 'commit', 'push', 'cired', 'cigreen'], edit: ['edit', 'write'], read: ['read', 'grep', 'glob', 'skill'], web: ['web', 'fetch', 'mcp'], agent: ['agent', 'substart', 'substop'] };
const typeFilter = new Set();
const kindOk = (e) => !typeFilter.size || [...typeFilter].some((k) => KIND[k].includes(e.type));
function lineOf(e) {
  const ln = el('span', 'fg-line'), ic = el('span', 'fi-ico');
  ic.append(icon(TYPE_ICON[e.type] || 'sparkle')); if (TYPE_TONE[e.type]) ic.dataset.tone = TYPE_TONE[e.type];
  ln.append(ic, el('span', 'fg-text', cap(verb(e))));
  if (e.img) {   // an image it read, wrote or edited: a thumbnail, a click opens it (image-view.js)
    const th = el('span', 'fg-thumb'), im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = imageUrl(e.img);
    im.addEventListener('error', () => { th.remove(); ln.classList.remove('has-thumb'); });   // (gone from the disk)
    th.dataset.img = e.img; th.dataset.name = e.label || ''; th.title = tr('activity.image.view'); th.append(im); ln.append(th); ln.classList.add('has-thumb');
  }
  return ln;
}
export function feedRow(e) {
  const li = el('li', 'fr'); if (e.agent) li.dataset.agent = e.agent;
  li.append(lineOf(e), el('time', null, hhmm(e.ts)));
  return li;
}
function groupCard(g, live) {
  const s = sessions.get(g.sess), first = g.items[0];
  const li = el('li', 'fg');
  const b = el('button', 'fg-card' + (live ? ' fg--live' : '')); b.type = 'button'; b.dataset.sess = g.sess; if (g.agent) b.dataset.agent = g.agent;
  const head = el('span', 'fg-head'), dot = el('i'); dot.style.background = s ? colorOf(s) : '#5E687B';
  head.append(dot, el('b', null, dnOf(first)));
  if (g.agent) head.append(el('span', 'fg-agent', tr('activity.subagent')));
  if (live) head.append(el('span', 'fg-live', tr('activity.working')));
  head.append(el('time', null, hhmm(first.ts)));
  const lines = el('span', 'fg-lines');
  for (const e of g.items.slice(0, 4)) lines.append(lineOf(e));
  if (g.items.length > 4) lines.append(el('span', 'fg-more', tr('activity.more', { n: g.items.length - 4 })));
  b.append(head, lines);
  b.title = g.agent ? tr('activity.openSubChat') : tr('activity.openChat');
  li.append(b);
  return li;
}
function alertCard(e) {
  const s = sessions.get(e.sess), wait = e.type !== 'fail';
  const li = el('li', 'fg'), box = el('div', 'fa' + (wait ? ' fa--wait' : ''));
  const head = el('div', 'fa-head'); head.append(icon('alert'), el('b', null, dnOf(e)), el('time', null, hhmm(e.ts)));
  const acts = el('div', 'fa-acts');
  const open = el('button'); open.type = 'button'; open.dataset.sess = e.sess; if (e.agent) open.dataset.agent = e.agent; open.append(icon('monitor'), wait ? tr('activity.openToApprove') : tr('activity.seeError')); acts.append(open);
  if (s?.link) { const a = el('a'); a.href = s.link; a.target = '_blank'; a.rel = 'noopener'; a.append(icon('phone'), tr('activity.openOnPhone')); acts.append(a); }
  box.append(head, el('p', null, cap(verb(e))), acts);
  li.append(box);
  return li;
}
export function renderFeed() {
  const list = $('feed-list');
  const latest = new Map(); for (const e of state.feed) latest.set(e.sess, e.id);
  const rows = state.feed.filter((e) => (feedFilter === 'all' || ATT.has(e.type)) && kindOk(e)).slice(-90).reverse();
  list.replaceChildren();
  if (!rows.length) list.append(el('li', 'fi-empty', tr(feedFilter === 'att' ? 'activity.empty.att' : typeFilter.size ? 'activity.empty.type' : 'activity.empty.all')));
  const groups = [];
  for (const e of rows) {
    const g = groups[groups.length - 1], att = ATT.has(e.type);
    if (g && !att && !g.att && g.sess === e.sess && g.agent === (e.agent || null) && g.items[g.items.length - 1].ts - e.ts < 240e3) g.items.push(e);
    else groups.push({ sess: e.sess, agent: e.agent || null, att, items: [e] });
  }
  for (const g of groups) {
    if (g.att) { list.append(alertCard(g.items[0])); continue; }
    const s = sessions.get(g.sess);
    list.append(groupCard(g, s?.status === 'work' && g.items.some((e) => latest.get(g.sess) === e.id)));
  }
  const att = state.feed.filter((e) => ATT.has(e.type) && nowMs() - e.ts < 3600e3).length;
  $('att-count').hidden = !att; $('att-count').textContent = att;
}
let feedQueued = false;
export function queueFeed() { if (feedQueued) return; feedQueued = true; requestAnimationFrame(() => { feedQueued = false; renderFeed(); if (state.selectedId && tab === 'act') renderActivity(); }); }
export function addFeed(e) { state.feed.push(e); if (state.feed.length > 150) state.feed = state.feed.slice(-150); queueFeed(); }
export function openFromRow(b) { if (b.dataset.agent) openSession(b.dataset.sess, { tab: 'subs', agent: b.dataset.agent }); else openSession(b.dataset.sess); }
function setFilter(f) { feedFilter = f; $('flt-all').setAttribute('aria-pressed', String(f === 'all')); $('flt-att').setAttribute('aria-pressed', String(f === 'att')); renderFeed(); }
function ago(ts) {
  const s = (nowMs() - (ts || 0)) / 1000;
  if (s < 3600) return tr('time.min', { n: Math.max(1, Math.floor(s / 60)) });
  if (s < 86400) return tr('time.hour', { n: Math.floor(s / 3600) });
  return tr('time.day', { n: Math.floor(s / 86400) });
}
export function doingOf(s) {
  if (s.status === 'wait') return { ic: 'alert', text: tr('activity.doing.wait') };
  if (s.stuck && s.status !== 'rest') return { ic: 'alert', text: tr(`activity.doing.stuck.${s.stuck.kind}`, { label: s.stuck.label.length > 40 ? `${s.stuck.label.slice(0, 39)}…` : s.stuck.label }), stuck: true };
  const where = whereabouts(workers.get(s.id));   // out of the office: at the shop, on the way home…
  if (where) return where;
  if (s.status === 'rest' && s.bg?.length) return { ic: 'terminal', text: `${tr('activity.doing.bg', { desc: s.bg[0].desc })}${s.bg.length > 1 ? ` (+${s.bg.length - 1})` : ''}` };
  if (s.status === 'rest') return { ic: 'zzz', text: nowMs() - (s.lastAt || 0) < 90e3 ? tr('activity.doing.justDone') : tr('activity.doing.resting', { time: ago(s.lastAt) }) };
  if (s.last) return { ic: TYPE_ICON[s.last.type] || 'sparkle', text: cap(verb(s.last)) };
  return { ic: 'sparkle', text: tr('activity.doing.working') };
}
const order = (a, b) => (a.status === 'wait' ? -1 : 0) - (b.status === 'wait' ? -1 : 0) || (a.status === 'rest') - (b.status === 'rest') || (a.desk - b.desk);
let uiQueued = false;
export function queueUi() {
  if (uiQueued) return; uiQueued = true;
  requestAnimationFrame(() => {
    uiQueued = false; renderRail(); renderHud(); queueFeed(); state.boardDirty = true; queuePlace(); renderLite();
    if (state.selectedId) { renderSessionHead(); if (tab === 'subs' && !state.subView) renderSubs(); }
  });
}
// Rows are keyed by session id and updated in place, so keyboard focus and hover survive live updates. Sessions are
// grouped (needs you → working → resting, resting can fold away), each row shows how long the current task has run,
// the session's RAM (from the Mac snapshot, by pid) and a 30-minute activity sparkline.
const railRows = new Map();
let railOrder = '', railFilter = null, restCollapsed = false;
const GROUPS = [['wait'], ['work'], ['rest']];   // labels: activity.group.<key>
let grpEls;
const SVGNS = 'http://www.w3.org/2000/svg';
function sparkEl() {
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 45 14'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 15; i++) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', i * 3); r.setAttribute('width', 2); r.setAttribute('y', 13); r.setAttribute('height', 1); r.setAttribute('rx', 0.6); svg.append(r); }
  return svg;
}
function sparkOf(id) { const now = nowMs(), b = new Array(15).fill(0); for (const e of state.feed) { if (e.sess !== id) continue; const k = Math.floor((now - e.ts) / 120e3); if (k >= 0 && k < 15) b[14 - k]++; } return b; }
function setSpark(svg, counts) {
  const max = Math.max(1, ...counts);
  counts.forEach((c, i) => { const h = c ? 2 + Math.round((c / max) * 11) : 1, r = svg.children[i]; r.setAttribute('y', 14 - h); r.setAttribute('height', h); r.classList.toggle('on', c > 0); });
}
const metaTime = (s) => (s.status === 'work' && s.taskStart ? fmtClock((nowMs() - s.taskStart) / 1000) : s.status === 'wait' ? tr('activity.waitingFor', { time: ago(s.lastAt) }) : ago(s.lastAt));
function railRow(s) {
  const li = el('li', 'ri-li');
  const b = el('button', 'ri'); b.type = 'button'; b.dataset.sess = s.id;
  const av = el('span', 'av'), avTxt = el('span', 'av-txt'); av.append(avTxt, el('i', 'av-st')); avTxt.append(agentMark(agentOf(s))); av.title = AGENT_NAME[agentOf(s)];
  const main = el('span', 'ri-main'), top = el('span', 'ri-top'), name = el('span', 'ri-name'), doing = el('span', 'ri-doing');
  const dIco = el('span', 'ri-dico'), dTxt = el('span', 'ri-dtxt'); doing.append(dIco, dTxt);
  top.append(name); main.append(top, doing);
  const meta = el('span', 'ri-meta'), time = el('span', 'ri-time'), ram = el('span', 'ri-ram'), spark = sparkEl();
  meta.append(time, spark, ram);
  const ctx = el('span', 'ri-ctx'), ctxB = el('b'); ctx.append(ctxB);
  b.append(av, main, meta, ctx);
  const subList = el('ul', 'ri-subs'); subList.hidden = true;
  li.append(b, subList);
  const c = el('button', 'chip'); c.type = 'button'; c.dataset.sess = s.id;
  const cd = el('i'), cn = el('span'), cs = el('small');
  c.append(cd, cn, cs);
  return { li, b, av, avTxt, top, name, ctx, ctxB, nameKey: '', dIco, dIcoName: '', dTxt, time, ram, spark, subList, subSig: '', c, cd, cn, cs };
}
function subRow(s, x) {
  const li = el('li');
  const b = el('button', 'ri-sub'); b.type = 'button'; b.dataset.sess = s.id; b.dataset.agent = x.id;
  b.append(icon('sparkle'), el('b', null, `${x.type}${x.desc ? ' · ' + x.desc : ''}`), el('span', null, x.last ? cap(verb(x.last)) : tr('activity.starting')));
  li.append(b);
  return li;
}
function renderRail() {
  const all = [...sessions.values()].sort(order);
  const q = query.trim().toLowerCase();
  const rail = $('rail-list'), chips = $('chips');
  const ram = new Map((macSnap?.claude || []).map((c) => [c.pid, c.mem]));
  const count = { wait: 0, work: 0, rest: 0 };
  for (const [id, r] of railRows) if (!sessions.has(id)) { r.li.remove(); r.c.remove(); railRows.delete(id); }
  for (const s of all) {
    count[s.status] = (count[s.status] || 0) + 1;
    let r = railRows.get(s.id);
    if (!r) { r = railRow(s); railRows.set(s.id, r); }
    const color = colorOf(s), cur = String(s.id === state.selectedId);
    r.b.dataset.status = s.status; r.b.dataset.stuck = s.stuck && s.status !== 'rest' ? '1' : ''; r.b.dataset.done = unseenDone.has(s.id) ? '1' : ''; r.b.setAttribute('aria-current', cur); r.av.style.setProperty('--c', color);
    { const k = agentOf(s); if (r.avTxt.firstChild?.dataset?.agent !== k) { r.avTxt.replaceChildren(agentMark(k)); r.av.title = AGENT_NAME[k]; } }
    const nk = dn(s) + '|' + (s.dir || '') + '|' + (s.origin || '') + (s.link ? '|rc' : '');
    if (r.nameKey !== nk) {
      r.nameKey = nk; r.name.textContent = dn(s); r.top.querySelector('.ri-rc')?.remove(); r.top.querySelector('.ri-proj')?.remove();
      const proj = String(s.dir || '').split('/').filter(Boolean).pop();
      if (proj && proj !== dn(s)) { const pj = el('span', 'ri-proj', proj); pj.title = s.origin ? tr('activity.runsIn', { dir: s.dir, origin: s.origin }) : `${s.dir}`; r.name.after(pj); }
      if (s.link) { const rc = el('span', 'ri-rc'); rc.title = tr('activity.remoteOn'); rc.append(icon('phone')); r.top.append(rc); }
    }
    r.b.title = `${dn(s)}${s.title ? ` (${s.name})` : ''} · ${s.dir || ''}`;
    const d = doingOf(s);
    if (r.dIcoName !== d.ic) { r.dIcoName = d.ic; r.dIco.replaceChildren(icon(d.ic)); }
    if (r.dTxt.textContent !== d.text) r.dTxt.textContent = d.text;
    r.time.textContent = metaTime(s);
    const mem = ram.get(s.pid); r.ram.textContent = mem ? fmtBytes(mem) : ''; r.ram.title = mem ? tr('activity.ramTitle') : '';
    setSpark(r.spark, sparkOf(s.id));
    const u = s.usage, f = u ? Math.min(1, u.ctx / u.ctxMax) : 0;
    r.ctx.hidden = !u; r.ctxB.style.width = `${Math.round(f * 100)}%`; r.ctxB.className = f > 0.85 ? 'hi' : f > 0.6 ? 'mid' : '';
    r.ctx.title = u ? tr('activity.ctxTitle', { used: fmtTok(u.ctx), max: fmtTok(u.ctxMax), cost: fmtUsd(u.cost) }) : '';
    const subsNow = s.subs || [];
    const sig = subsNow.map((x) => `${x.id}:${x.last?.label || ''}:${x.desc}`).join('|');
    if (sig !== r.subSig) { r.subSig = sig; r.subList.replaceChildren(...subsNow.map((x) => subRow(s, x))); }
    r.subList.hidden = !subsNow.length;
    const match = !q || s.name.toLowerCase().includes(q) || String(s.title || '').toLowerCase().includes(q) || String(s.dir || '').toLowerCase().includes(q);
    const folded = s.status === 'rest' && restCollapsed && !q && railFilter !== 'rest';
    r.li.hidden = !match || (railFilter && s.status !== railFilter) || folded;
    r.c.dataset.status = s.status; r.c.setAttribute('aria-current', cur); r.cd.style.background = color;
    if (r.cn.textContent !== dn(s)) r.cn.textContent = dn(s);
    r.cs.textContent = STATUS_LABEL[s.status];
  }
  for (const [k] of GROUPS) { const g = grpEls[k]; g.n.textContent = count[k] || 0; g.li.hidden = !count[k] || (railFilter && railFilter !== k); }
  grpEls.rest.b.setAttribute('aria-expanded', String(!restCollapsed || !!q || railFilter === 'rest'));
  for (const k of ['work', 'wait', 'rest']) { $('st-' + k).textContent = count[k] || 0; }
  document.querySelector('.st[data-st="wait"]').classList.toggle('has', !!count.wait);
  const ord = all.map((s) => s.id + s.status).join();
  if (ord !== railOrder) {
    railOrder = ord;
    for (const [k] of GROUPS) { rail.append(grpEls[k].li); for (const s of all) if (s.status === k) rail.append(railRows.get(s.id).li); }
    for (const s of all) chips.append(railRows.get(s.id).c);
  }
  $('empty').hidden = all.length > 0 || !state.connectedOnce;
  for (const w of workers.values()) w.tagEl.classList.toggle('tag--on', w.id === state.selectedId);
}
function onListClick(ev) {
  const g = ev.target.closest('.grp-btn');
  if (g) { if (g.dataset.g === 'rest') { restCollapsed = !restCollapsed; try { localStorage.setItem('office-rest-folded', restCollapsed ? '1' : '0'); } catch { /* storage blocked */ } renderRail(); } return; }
  const b = ev.target.closest('[data-sess]'); if (!b) return; if (b.dataset.agent) openFromRow(b); else toggleSession(b.dataset.sess);
}
export const fmtTok = (n) => (n >= 1e6 ? `${num(n / 1e6, 1)}M` : `${Math.round(n / 1000)}k`);
export const fmtUsd = (v) => `$${v >= 100 ? Math.round(v) : v.toFixed(2)}`;
const KPIS = [['prompts', 'clipboard'], ['read', 'file'], ['edit', 'pencil'], ['cmd', 'terminal'], ['cost', 'coin']];   // labels: activity.kpi.<key>
export function renderHud() {
  const list = [...sessions.values()];
  const waiting = list.filter((s) => s.status === 'wait').length;
  const subCount = list.reduce((a, s) => a + (s.subs?.length || 0), 0);
  $('active-count').textContent = list.length ? tr('activity.sessions', { n: list.length }) + (subCount ? ` · ${tr('activity.subsRunning', { n: subCount })}` : '') : tr('activity.noSessions');
  $('feed-stats').replaceChildren(...KPIS.map(([k, ic]) => {
    const label = tr(`activity.kpi.${k}`);
    const d = el('div', k === 'cost' ? 'kpi kpi--cost' : 'kpi'), i = el('span', 'kpi-ic'); i.append(icon(ic));
    const b = el('b', null, k === 'cost' ? fmtUsd(list.reduce((a, s) => a + (s.usage?.cost || 0), 0)) : num(state.stats[k] || 0));
    if (k === 'cost') b.prepend(el('small', null, '≈'));   // (an estimate: the list price, not a bill)
    d.append(i, b, el('span', null, label)); d.title = k === 'cost' ? tr('activity.costTitle') : tr('activity.kpiToday', { label });
    return d;
  }));
  $('bell-dot').hidden = !waiting;
  const yours = waiting + unseenDone.size;
  document.title = yours ? tr('activity.docTitle', { n: yours }) : 'My Office';
}
export function updateMarkers(t) {
  const sel = state.selectedId ? workers.get(state.selectedId) : null;
  selRing.visible = !!sel;
  if (sel) { selRing.position.set(sel.pos.x, 0.03 + sel.gy(), sel.pos.y); selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
  hoverRing.visible = !!state.hovered && state.hovered !== sel && !!state.hovered.root.parent;
  if (hoverRing.visible) { hoverRing.position.set(state.hovered.pos.x, 0.025 + state.hovered.gy(), state.hovered.pos.y); hoverRing.scale.setScalar(state.hovered.sub ? 0.8 : 1); }
  for (const w of workers.values()) {
    const s = sessions.get(w.id);
    const show = w.root.visible && (!s || s.status !== 'rest' || w.id === state.selectedId || w === state.hovered || w.phase === 'walk');
    if (w.tagObj.visible !== show) w.tagObj.visible = show;
    const wait = s?.status === 'wait';
    if (w.tagEl.classList.contains('tag--wait') !== wait) w.tagEl.classList.toggle('tag--wait', wait);
  }
}

export function setup() {
  /* ---------- UI: activity column, session list, chips ---------- */
  state.stats = {};
  state.feed = [];
  state.selectedId = null;
  state.isLocal = false;
  state.hovered = null; state.hoverAt = 0;
  toastEl = $('toast');
  $('type-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    if (typeFilter.has(b.dataset.k)) typeFilter.delete(b.dataset.k); else typeFilter.add(b.dataset.k);
    b.setAttribute('aria-pressed', String(typeFilter.has(b.dataset.k))); renderFeed();
  });
  $('feed-list').addEventListener('click', (ev) => {
    const im = ev.target.closest('[data-img]');
    if (im) { const b = im.closest('[data-sess]'); openImage(im.dataset.img, im.dataset.name, (b && sessions.get(b.dataset.sess)?.name) || ''); return; }
    const b = ev.target.closest('[data-sess]'); if (b) openFromRow(b);
  });
  $('flt-all').addEventListener('click', () => setFilter('all'));
  $('flt-att').addEventListener('click', () => setFilter('att'));
  try { restCollapsed = localStorage.getItem('office-rest-folded') === '1'; } catch { /* storage blocked */ }
  grpEls = Object.fromEntries(GROUPS.map(([k]) => {
    const li = el('li', 'grp'); li.dataset.g = k;
    const b = el('button', 'grp-btn'); b.type = 'button'; b.dataset.g = k;
    const n = el('b'); b.append(el('span', null, tr(`activity.group.${k}`)), n);
    if (k === 'rest') { const ch = el('span', 'grp-chev'); ch.append(icon('chevron')); b.append(ch); } else b.disabled = true;
    li.append(b); return [k, { li, b, n }];
  }));
  $('rail-list').addEventListener('click', onListClick);
  $('chips').addEventListener('click', onListClick);
  $('sess-search').addEventListener('input', (e) => { query = e.target.value; renderRail(); });
  document.querySelector('.st-row').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-st]'); if (!b) return;
    railFilter = railFilter === b.dataset.st ? null : b.dataset.st;
    for (const x of document.querySelectorAll('.st')) x.setAttribute('aria-pressed', String(x.dataset.st === railFilter));
    renderRail();
  });
  // running timers tick every second without re-rendering the list
  setInterval(() => { for (const [id, r] of railRows) { const s = sessions.get(id); if (s && s.status !== 'rest') r.time.textContent = metaTime(s); } }, 1000);
}
