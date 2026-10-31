// What eats your plan: where Claude Code's usage goes, by model, MCP server, skill, plugin, subagent, project and session.
// From Claude Code's own OpenTelemetry numbers (server/otel.mjs, summed by src/shared/burn.js), today or over the last 7
// days, in USD at API prices and, when the plan's week is known, in % of the weekly limit. A drawer of its own (from the
// plan card's line, the group chat's •••, or ?burn in the address), a full-screen sheet on a phone. Read when it opens,
// then every 20 s while it is open and the tab shows; only the last reading is kept.
import { $, el, fmtAgo, pad2 } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { DEMO, demoBurn } from '../demo/demo.js';
import { closeSession, drM, drS } from './session-drawer.js';
import { closeMac } from './mac-drawer.js';
import { togglePlan, togglePop } from './settings.js';
import { t as tr, num, locale } from '../../i18n/index.js';

export let drB;
let range = 'today', last = null, lastAt = 0, timer = 0, drawn = '';

/* ---------- numbers in words ---------- */
const cents = (n, d) => Number(n).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });   // ($0.30, not $0.3)
const usd = (n) => (n > 0 && n < 0.01 ? tr('burn.less', { usd: `$${cents(0.01, 2)}` }) : `$${cents(n, n >= 100 ? 0 : 2)}`);
const pct = (x) => `${num(x * 100, x > 0 && x < 0.095 ? 1 : 0)}%`;
const points = (p) => `${num(p, p < 9.95 ? 1 : 0)}%`;   // (percentage points of the weekly limit)
const toks = (n) => (n >= 1e6 ? tr('burn.tokM', { n: num(n / 1e6, 1) }) : n >= 1e3 ? tr('burn.tokK', { n: num(n / 1e3, n >= 1e4 ? 0 : 1) }) : num(n));
// "claude-opus-5-5" -> "Opus 5.5"; anything else as it came
export const modelName = (m) => { const x = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(m || ''); return x ? `${x[1][0].toUpperCase()}${x[1].slice(1)} ${x[2]}${x[3] ? `.${x[3]}` : ''}` : m || '?'; };
const hiddenName = (n) => n === 'custom' || n === 'third-party' || n === 'custom_skill';
// what a share of the cost is in the plan's week (≈: the week's use so far over what was counted since it began)
const ofPlan = (d, dollars) => (d.plan && dollars > 0 ? d.plan.perUsd * dollars : null);

/* ---------- colours: each model keeps its family's colour (never its rank), the sources their own ---------- */
const FAMILY = [[/opus/, 1], [/sonnet/, 2], [/haiku/, 3], [/fable|mythos/, 4]];
function modelColors(names) {
  const out = new Map(), used = new Set();
  for (const n of names) { const f = FAMILY.find(([re]) => re.test(n)); if (f && !used.has(f[1])) { out.set(n, f[1]); used.add(f[1]); } }
  for (const n of names) if (!out.has(n)) { const free = [1, 2, 3, 4, 5].find((c) => !used.has(c)); out.set(n, free || 0); if (free) used.add(free); }
  return out;
}
const SOURCE_COLOR = { main: 6, subagent: 7, auxiliary: 8 };

/* ---------- the pieces ---------- */
function sec(title, ...kids) { const s = el('section', 'bn-sec'); s.append(el('h3', null, title), ...kids); return s; }
// a share of the whole as a bar (one colour: the length is the only thing it says)
function track(share) { const t = el('span', 'bn-track'), i = el('i'); i.style.width = `${Math.max(share > 0 ? 1.5 : 0, Math.min(100, share * 100))}%`; t.append(i); return t; }
// a 100 % bar cut by kind (4 named and the rest), its legend under it with each one's share and cost
function stack(items, colorOf, nameOf, d) {
  const top = items.slice(0, 4), rest = items.slice(4), parts = [...top.map((x) => ({ ...x, c: colorOf(x.name), label: nameOf(x.name) }))];
  if (rest.length) parts.push({ label: tr('burn.other'), c: 0, share: rest.reduce((a, x) => a + x.share, 0), usd: rest.reduce((a, x) => a + x.usd, 0) });
  const bar = el('div', 'bn-stack'), legend = el('ul', 'bn-legend');
  for (const p of parts.filter((x) => x.share > 0)) {
    const seg = el('i', `bn-c${p.c}`); seg.style.flexGrow = String(p.share); seg.title = `${p.label} · ${pct(p.share)} · ${usd(p.usd)}`; bar.append(seg);
    const li = el('li'), plan = ofPlan(d, p.usd);
    li.append(el('i', `bn-sw bn-c${p.c}`), el('span', 'bn-ln', p.label), el('b', null, pct(p.share)), el('small', null, `${usd(p.usd)}${plan != null ? ` · ≈ ${points(plan)}` : ''}`));
    legend.append(li);
  }
  bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', parts.map((p) => `${p.label} ${pct(p.share)}`).join(', '));
  const box = el('div', 'bn-stackbox'); box.append(bar, legend); return box;
}
// the week as columns, one a day, stacked by model (the same colours as "By model"); the tallest one says its cost
function days(d, colors) {
  const max = Math.max(...d.perDay.map((x) => x.usd), 0), plot = el('div', 'bn-days'), labels = el('div', 'bn-dls'), wd = tr('mac.plan.weekdays', null, 'list');
  for (const x of d.perDay) {
    const date = new Date(`${x.day}T12:00:00`), label = `${wd[date.getDay()] || ''} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
    const col = el('div', 'bn-day'), bars = el('div', 'bn-col');
    const models = Object.entries(x.models).filter(([, v]) => v > 0).sort((a, b) => (colors.get(a[0]) ?? 9) - (colors.get(b[0]) ?? 9));
    bars.style.height = `${max ? Math.round(Math.max(x.usd > 0 ? 3 : 0, (x.usd / max) * 96)) : 0}px`;
    for (const [m, v] of models) { const s = el('i', `bn-c${colors.get(m) ?? 0}`); s.style.flexGrow = String(v); bars.append(s); }
    col.title = [tr('burn.dayTip', { day: label, usd: usd(x.usd) }), ...models.map(([m, v]) => `${modelName(m)} ${usd(v)}`)].join('\n');
    const cap = el('span', 'bn-cap', x.usd === max && max > 0 ? usd(x.usd) : '');
    col.append(cap, bars);
    plot.append(col); labels.append(el('span', null, wd[date.getDay()] || x.day.slice(5)));
  }
  const box = el('div', 'bn-week'); box.append(plot, labels); return box;
}
function row(cls, name, share, money, sub, title, extra = []) {
  const li = el('li', cls), main = el('span', 'bn-who');
  main.append(...extra, el('span', 'bn-name', name));
  li.append(main, track(share), el('b', null, pct(share)), el('small', null, money));
  if (sub) li.append(el('span', 'bn-meta', sub));
  if (title) li.title = title;
  return li;
}

function empty(d) {
  const box = el('div', 'bn-empty');
  const code = (s) => { const p = el('p'); s.split('`').forEach((part, i) => p.append(i % 2 ? el('code', null, part) : document.createTextNode(part))); return p; };
  const none = !d.lastMetricsAt && !d.lastLogsAt;
  if (none && d.setup === 'theirs') box.append(code(tr('burn.empty.theirs')));
  else if (none && d.setup === 'ours') box.append(code(tr('burn.empty.waiting')));
  else if (none) box.append(code(tr('burn.empty.none')), el('p', 'bn-note', tr('burn.empty.noneWhy')));
  else box.append(el('p', null, tr(`burn.empty.range.${d.range === '7d' ? '7d' : 'today'}`)));
  return box;
}

// what the drawing shows: the same numbers again (every 20 s while nothing new came in) leave the drawing alone
const sig = (d) => JSON.stringify([d.range, d.setup, d.total, d.ranked, d.by, d.projects, d.perDay, d.plan?.perUsd, !!(d.lastMetricsAt || d.lastLogsAt),
  d.sessions?.map((x) => [x.sid, x.name, x.usd, x.req, x.open])]);
const syncTabs = () => { for (const b of $('burn-range').querySelectorAll('[data-range]')) b.setAttribute('aria-selected', String(b.dataset.range === range)); };
function render() {
  const body = $('burn-body'), d = last;
  syncTabs();
  if (!d) return;
  if (!d.ok) { drawn = ''; body.replaceChildren(el('p', 'muted', tr('burn.unreachable'))); return; }
  if (d.range !== range) return;   // (the other tab's: its own reading is on the way)
  const at = Math.max(d.lastMetricsAt || 0, d.lastLogsAt || 0);
  $('burn-at').textContent = at ? (Date.now() - at < 60e3 ? tr('burn.updatedNow') : tr('burn.updated', { ago: tr('time.ago', { time: fmtAgo((Date.now() - at) / 1000) }) })) : '';
  const now = sig(d);
  if (now === drawn && body.firstElementChild?.matches('.bn-hero, .bn-empty')) return;
  drawn = now;
  const T = d.total;
  if (!(T.usd > 0 || T.tokens > 0)) { body.replaceChildren(empty(d)); return; }
  const out = [];
  // the headline: the cost, and what it is of the plan's week
  const hero = el('div', 'bn-hero'), plan = ofPlan(d, T.usd);
  hero.append(el('span', 'bn-hero-l', tr('burn.hero.label')), el('strong', 'bn-total', d.money ? usd(T.usd) : toks(T.tokens)));
  if (plan != null) { const p = el('span', 'bn-plan', tr('burn.hero.plan', { pct: points(plan) })); p.title = tr('burn.hero.planTitle', { used: points(d.plan.pct), usd: usd(d.plan.pct / d.plan.perUsd), rate: points(d.plan.perUsd) }); hero.append(p); }
  const sub = [tr('burn.sub.req', { n: num(T.req) }), tr('burn.sub.tok', { n: toks(T.tokens) }), tr('burn.sub.sessions', { n: d.sessions.length + (d.rest?.n || 0) })];
  if (T.prompts && d.money) sub.push(tr('burn.perPrompt', { usd: usd(T.usd / T.prompts) }));
  if (T.err) sub.push(tr('burn.sub.err', { n: T.err }));
  out.push(hero, el('p', 'bn-sub', sub.join(' · ')));
  // who eats it: MCP servers, skills, plugins and subagent types, then what Claude did on its own
  const who = el('ol', 'bn-list bn-rank');
  for (const x of d.ranked.slice(0, 8)) {
    const kind = el('span', `bn-kind bn-k-${x.kind}`, tr(`burn.kind.${x.kind}`)), hid = hiddenName(x.name), plan2 = ofPlan(d, x.usd);
    const name = x.kind === 'agent' && x.name === 'custom' ? tr('burn.hidden') : hid ? tr('burn.hidden') : x.name;
    who.append(row(hid ? 'is-hidden' : '', name, x.share, `${usd(x.usd)}${plan2 != null ? ` · ≈ ${points(plan2)}` : ''}`, '', hid ? tr('burn.hiddenTip') : '', [kind]));
  }
  if (d.ranked.length) who.append(row('is-plain', tr('burn.who.plain'), d.plain.share, usd(d.plain.usd)));
  out.push(sec(tr('burn.who.title'), ...(d.ranked.length ? [who, el('p', 'bn-note', tr('burn.who.note'))] : [el('p', 'bn-note', tr('burn.who.none'))])));
  // by model and by source: two 100 % bars
  const colors = modelColors(d.by.model.map((m) => m.name));
  out.push(sec(tr('burn.byModel'), stack(d.by.model, (n) => colors.get(n) ?? 0, modelName, d)));
  const srcName = (n) => (['main', 'subagent', 'auxiliary'].includes(n) ? tr(`burn.source.${n}`) : n);
  const bySource = stack(d.by.source, (n) => SOURCE_COLOR[n] ?? 0, srcName, d);
  for (const li of bySource.querySelectorAll('li')) if (li.querySelector('.bn-ln')?.textContent === tr('burn.source.auxiliary')) li.title = tr('burn.source.auxTip');
  out.push(sec(tr('burn.bySource'), bySource));
  if (d.range === '7d') out.push(sec(tr('burn.perDay'), days(d, colors)));
  // by project, by session (the 40 that cost most, the rest in one line so it still adds up)
  const projects = el('ol', 'bn-list');
  for (const p of d.projects.slice(0, 12)) projects.append(row('', p.name || tr('burn.noProject'), p.share, usd(p.usd), tr('burn.sub.sessions', { n: p.sessions }), p.dir || ''));
  out.push(sec(tr('burn.projects'), projects));
  const sessions = el('ol', 'bn-list');
  for (const s of d.sessions.slice(0, 15)) {
    const name = s.name || `${s.project || tr('burn.noProject')} · ${s.sid.slice(0, 6)}`;
    const meta = [s.project, s.models.map(modelName).join(', '), tr('burn.sub.req', { n: num(s.req) })].filter(Boolean).join(' · ');
    sessions.append(row(s.open ? 'is-open' : '', name, s.share, usd(s.usd), meta, `${s.dir || ''}\n${tr('burn.sessionTip', { n: num(s.req), tok: toks(s.tokens) })}`, s.open ? [el('i', 'bn-live')] : []));
  }
  const more = d.sessions.slice(15), restN = more.length + (d.rest?.n || 0), restUsd = more.reduce((a, x) => a + x.usd, 0) + (d.rest?.usd || 0);
  if (restN) sessions.append(row('is-plain', tr('burn.rest', { n: restN, usd: usd(restUsd) }), more.reduce((a, x) => a + x.share, 0) + (d.rest?.share || 0), usd(restUsd)));
  out.push(sec(tr('burn.sessions'), sessions));
  out.push(el('p', 'bn-note bn-sum', tr('burn.sum', { usd: usd(T.usd) })), el('p', 'bn-note', tr('burn.foot')));
  const top = body.scrollTop;
  body.replaceChildren(...out);
  body.scrollTop = top;
}

/* ---------- reading ---------- */
async function fetchBurn(r) {
  if (DEMO) return demoBurn(r);
  try { return await (await fetch(`/api/burn?range=${r}${TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : ''}`)).json(); } catch { return { ok: false }; }
}
async function load() {
  const r = range, d = await fetchBurn(r);
  if (r !== range) return;   // (the other tab was picked meanwhile)
  last = d; lastAt = Date.now();
  if (!drB.hidden) render();
  peekText(d);
}
// the plan card's line: today's cost and the two that eat most ("MCP github 34% · Skill pdf 12%")
function peekText(d) {
  const b = $('plan-burn'); if (!b || !d?.ok || d.range !== 'today') return;
  b.hidden = false;
  b.replaceChildren();
  if (!(d.total.usd > 0)) { b.append(el('span', null, tr('burn.peekEmpty')), el('i', 'bn-chev', '›')); return; }
  const top = d.ranked.slice(0, 2).map((x) => `${tr(`burn.kind.${x.kind}`)} ${hiddenName(x.name) ? tr('burn.hidden') : x.name} ${pct(x.share)}`);
  if (!top.length && d.by.model[0]) top.push(`${modelName(d.by.model[0].name)} ${pct(d.by.model[0].share)}`);
  b.append(el('span', null, tr('burn.peek', { usd: usd(d.total.usd), who: top.length ? ` · ${top.join(' · ')}` : '' })), el('i', 'bn-chev', '›'));
}
function loading() { drawn = ''; $('burn-body').replaceChildren(el('p', 'muted', tr('burn.loading'))); }
const tick = () => { if (!drB.hidden && document.visibilityState === 'visible') load(); };

export function openBurn(r) {
  if (r === 'today' || r === '7d') range = r;
  if (!drS.hidden) closeSession();
  if (!drM.hidden) closeMac();
  togglePlan(false); togglePop(false);
  if ($('zchat') && !$('zchat').hidden) $('btn-chat')?.click();   // (the chat window closes: on a phone it covers the sheet)
  drB.hidden = false;
  if (last && last.range === range && Date.now() - lastAt < 20e3) render(); else { loading(); load(); }
  clearInterval(timer); timer = setInterval(tick, 20_000);
}
export function closeBurn() { if (!drB || drB.hidden) return; drB.hidden = true; clearInterval(timer); timer = 0; }

export function setup() {
  drB = $('dr-burn');
  drB.querySelector('[data-close]').addEventListener('click', closeBurn);
  $('burn-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b || b.dataset.range === range) return;
    range = b.dataset.range; loading(); syncTabs(); load();
  });
  $('plan-burn').addEventListener('click', () => openBurn('today'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drB.hidden) closeBurn(); });
  document.addEventListener('visibilitychange', tick);
  // one drawer at a time: the Mac's or a session's opening closes this one; the plan card opening reads today's line
  const watch = new MutationObserver((recs) => {
    if (!drM.hidden || !drS.hidden) closeBurn();
    if (!recs.some((r) => r.target.id === 'pop-plan') || $('pop-plan').hidden) return;
    if (last?.range === 'today' && Date.now() - lastAt < 20e3) peekText(last); else fetchBurn('today').then(peekText);
  });
  for (const n of [drM, drS, $('pop-plan')]) watch.observe(n, { attributes: true, attributeFilter: ['hidden'] });
  // ?burn (or ?burn=7d): open at once, for a link from a phone
  const q = new URLSearchParams(location.search);
  if (q.has('burn')) setTimeout(() => openBurn(q.get('burn') === '7d' ? '7d' : 'today'), 300);
}
