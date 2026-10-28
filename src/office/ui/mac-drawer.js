// The Mac drawer: memory, CPU, dev servers, plan limits, cleanup.
import { state } from '../core/state.js';
import { $, GB, el, fmtAgo, fmtBytes, hhmm, pad2, replay, small } from '../core/env.js';
import { syncDevBoxes } from '../world/props/dev-servers.js';
import { setLedMood } from '../world/room-update.js';
import { queueUi, toast } from './activity.js';
import { closeSession, drM } from './session-drawer.js';
import { TOKEN } from '../net/live.js';
import { DEMO, demoMac } from '../demo/demo.js';
import { t as tr, num } from '../../i18n/index.js';

export let macSnap = null;
let confirmKey = null;
let confirmTimer = null;
const busyKeys = new Set();
export function openMac() { if (state.selectedId) closeSession(); drM.hidden = false; if (small.matches) $('feed').classList.remove('feed--open'); loadMac(); clearInterval(state.macTimer); state.macTimer = setInterval(loadMac, 5000); }
export function closeMac() { drM.hidden = true; clearInterval(state.macTimer); state.macTimer = setInterval(loadMac, 30000); }
export async function loadMac() {
  if (DEMO) { macSnap = demoMac(); renderMacButton(); syncDevBoxes(macSnap); if (!drM.hidden) renderMac(); return; }
  try {
    const r = await fetch(`/api/sys${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`);
    macSnap = await r.json();
    renderMacButton(); syncDevBoxes(macSnap);
    if (!drM.hidden) renderMac();
  } catch { /* server busy; next poll */ }
}
function level(snap) { return snap.mem.pressure === 'critical' ? 'critical' : snap.tight ? 'warn' : 'normal'; }
export const limitWarned = new Set();
const limitLevel = (pct) => (pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'normal');
// 5 hours first, then the week over all models (personal plans), then each model's week, then anything else
// (a model's week: the server labels it "Opus (week)" / "Opus (tuần)"; '7 ngày' is the label older servers saved)
const WIN_ORDER = (w) => (w.key === 'session' ? 0 : w.key === 'weekly' ? 1 : /tuần|week/i.test(w.label) ? 2 : 3);
export const liveWindows = () => (state.limits?.windows || [state.limits?.five && { ...state.limits.five, key: 'session', label: tr('mac.plan.fiveHour') }, state.limits?.seven && { ...state.limits.seven, key: 'weekly', label: tr('mac.plan.week') }].filter(Boolean))
  .filter((w) => !w.resetsAt || w.resetsAt > Date.now()).map((w) => (w.key === 'weekly' && w.label === '7 ngày' ? { ...w, label: tr('mac.plan.week') } : w))
  .sort((a, b) => WIN_ORDER(a) - WIN_ORDER(b));
const ORG_PLANS = new Set(['Team', 'Enterprise']);
export function resetText(ts) {
  const d = new Date(ts), now = new Date(), t = hhmm(ts);
  if (d.toDateString() === now.toDateString()) return tr('mac.plan.at', { time: t });
  const days = tr('mac.plan.weekdays', null, 'list');
  return tr('mac.plan.date', { day: days[d.getDay()], d: pad2(d.getDate()), m: pad2(d.getMonth() + 1), time: t });
}
const liveOf = (o) => (o.windows || []).filter((w) => !w.resetsAt || w.resetsAt > Date.now()).sort((a, b) => WIN_ORDER(a) - WIN_ORDER(b));
const tightest = (ws) => ws.reduce((a, w) => (!a || w.pct > a.pct ? w : a), null);
function limitRow(rows, w) {
  const m = el('span', 'hl-m'), bar = el('span', 'hl-bar'), fill = el('b', limitLevel(w.pct));
  fill.style.width = `${Math.min(100, Math.max(1, w.pct))}%`; bar.append(fill);
  m.append(el('span', null, w.label), bar, el('em', null, `${Math.round(w.pct)}%`));
  rows.append(m, el('small', 'plan-reset', w.resetsAt ? tr('mac.plan.resets', { when: resetText(w.resetsAt) }) : ''));
}
// the other accounts on this Mac (their own config folders): a heading each, then their limits
function renderOthers(rows) {
  for (const o of state.limits?.others || []) {
    const ws = liveOf(o), acc = [o.account?.plan, o.account?.org].filter(Boolean).join(' · ');
    const head = el('div', 'plan-other'); head.append(el('b', null, tr('mac.plan.otherAccount', { name: o.name })), el('span', null, acc));
    rows.append(head);
    if (!ws.length) { rows.append(el('small', 'plan-other-note', o.note || tr('mac.plan.loading'))); continue; }
    for (const w of ws) limitRow(rows, w);
  }
}
export function renderLimits() {
  const ws = liveWindows(), box = $('plan-card'), others = state.limits?.others || [], none = !ws.length && !others.length;
  box.classList.toggle('is-empty', none);
  { // the pill shows the tightest limit (5 hours, the week, a model's week), coloured by how close it is
    const pill = $('btn-plan'), top = tightest(ws);
    pill.hidden = false;
    // other accounts: their tightest limit after the main one ("5 h 29% · org2 12%")
    const more = others.map((o) => { const t = tightest(liveOf(o)); return t ? ` · ${o.name} ${Math.round(t.pct)}%` : ''; }).join('');
    $('plan-mini').textContent = (top ? `${top.key === 'session' ? tr('mac.plan.fiveHour') : top.label} ${Math.round(top.pct)}%` : state.limitsNote ? tr('mac.plan.unread') : tr('mac.plan.reading')) + more;
    $('plan-bar').style.width = `${top ? Math.min(100, Math.max(2, top.pct)) : 0}%`;
    pill.dataset.level = top ? limitLevel(top.pct) : 'normal';
    pill.title = top ? tr('mac.plan.pillTitle', { text: `${ws.map((w) => `${w.label} ${Math.round(w.pct)}%`).join(' · ')}${top.resetsAt ? ` · ${tr('mac.plan.labelResets', { label: top.label, when: resetText(top.resetsAt) })}` : ''}` }) : state.limitsNote || tr('mac.plan.title');
  }
  const acc = state.limits?.account, accText = acc ? [acc.plan, acc.org].filter(Boolean).join(' · ') : '';
  $('plan-acct').textContent = accText; $('plan-acct').hidden = !accText || none;
  $('plan-acct').title = tr('mac.plan.account');
  if (none) { $('plan-at').textContent = ''; $('plan-empty').textContent = state.limitsNote || tr('mac.plan.loading'); return; }
  $('plan-at').textContent = state.limits.at ? (Date.now() - state.limits.at < 60e3 ? tr('mac.plan.justUpdated') : tr('time.ago', { time: fmtAgo((Date.now() - state.limits.at) / 1000) })) : '';
  const rows = $('plan-rows'); rows.replaceChildren();
  for (const w of ws) limitRow(rows, w);
  // no week over all models: org plans (Team / Enterprise) don't have one; a personal plan that shows none is still being read
  if (ws.length && !ws.some((w) => w.key === 'weekly')) {
    const org = ORG_PLANS.has(acc?.plan), m = el('span', 'hl-m plan-none');
    m.append(el('span', null, tr('mac.plan.week')), el('span', 'plan-none-t', org ? tr('mac.plan.noneOnPlan', { plan: acc.plan }) : tr('mac.plan.unread')), el('em', null, '–'));
    m.title = org ? tr('mac.plan.orgNoWeek') : tr('mac.plan.personalWeekSoon');
    rows.append(m, el('small', 'plan-reset', ''));
  }
  renderOthers(rows);
  for (const w of [...ws, ...others.flatMap((o) => liveOf(o).map((x) => ({ ...x, key: `${o.name}:${x.key}`, label: `${o.name} · ${x.label}` })))]) {
    if (w.pct < 80) continue;
    const key = `${w.key}:${w.resetsAt}:${w.pct >= 95 ? 95 : 80}`;
    if (limitWarned.has(key)) continue;
    limitWarned.add(key);
    if (!replay.on) toast(tr('mac.plan.warn', { pct: Math.round(w.pct), label: w.label, reset: w.resetsAt ? tr('mac.plan.warnReset', { when: resetText(w.resetsAt) }) : '' }), 6000);
  }
}
function renderMacButton() {
  const s = macSnap; if (!s?.mem) return;
  const pct = Math.round((s.mem.used / s.mem.total) * 100);
  const lv = level(s);
  $('btn-mac').dataset.level = lv;
  $('mac-mini').textContent = `RAM ${pct}%` + (s.mem.swapUsed > GB ? ` · ${fmtBytes(s.mem.swapUsed)}` : '');
  $('ml-ram').style.width = `${pct}%`;
  setLedMood(lv);
  // one place for the machine: the pill (level, RAM) and its panel; a dot when there is something worth cleaning
  const cpu = s.cpu?.percent ?? 0, tip = (s.tips || []).find((t) => t.action);
  $('mac-tip').hidden = !tip;
  $('btn-mac').title = tr('mac.button.title', { text: `RAM ${pct}% · CPU ${cpu}%${tip ? ` · ${tr(tip.disk ? 'mac.button.tipDisk' : 'mac.button.tipRam', { title: tip.title, size: fmtBytes(tip.gain) })}` : ''}` });
  queueUi();
}
function meter(title, big, sub, ratio, lv) {
  const m = el('div', 'meter');
  const top = el('div', 'meter-top'); top.append(el('b', null, title), el('strong', null, big));
  const bar = el('div', 'bar'); bar.dataset.level = lv; const fill = el('i'); fill.style.width = `${Math.min(100, Math.max(2, ratio * 100))}%`; bar.append(fill);
  m.append(top, bar, el('span', null, sub)); return m;
}
function actionButton(key, verbText, run, opts = {}) {
  const b = el('button', 'btn btn--sm', verbText); b.type = 'button';
  if (busyKeys.has(key)) { b.textContent = tr('mac.action.working'); b.disabled = true; return b; }
  if (confirmKey === key) { b.textContent = opts.confirm || tr('mac.action.sure', { verb: verbText }); b.classList.add(opts.force ? 'btn--danger' : 'btn--confirm'); }
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', () => {
    if (confirmKey !== key) { confirmKey = key; clearTimeout(confirmTimer); confirmTimer = setTimeout(() => { confirmKey = null; renderMac(); }, 4500); renderMac(); return; }
    confirmKey = null; busyKeys.add(key); renderMac();
    run().finally(() => { busyKeys.delete(key); loadMac(); });
  });
  return b;
}
const stubborn = new Map();
export async function doAction(key, body) {
  if (DEMO) { toast(tr('mac.action.demo')); return; }
  try {
    const r = await fetch(`/api/sys/action${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    toast(d.message || (d.ok ? tr('mac.action.done') : tr('mac.action.failed')));
    if (d.stubborn) stubborn.set(key, body); else stubborn.delete(key);
  } catch { toast(tr('mac.action.unreachable')); }
}
function actFor(key, body, verbText, extra = {}) {
  if (stubborn.has(key)) return actionButton(key + ':force', tr(body.action === 'quit' ? 'mac.action.forceQuit' : 'mac.action.forceStop'), () => doAction(key, { ...body, force: true }), { force: true, confirm: tr('mac.action.sureForce') });
  return actionButton(key, verbText, () => doAction(key, body), extra);
}
export function renderMac() {
  const s = macSnap; const body = $('mac-body');
  if (!s?.mem) { body.replaceChildren(el('p', 'muted', tr('mac.measuring'))); return; }
  $('mac-at').textContent = tr('mac.updated', { time: hhmm(s.at, true) });
  const keepScroll = body.scrollTop;
  const frag = document.createDocumentFragment();
  const lv = level(s);
  const meters = el('div', 'meters');
  const pressureText = ['normal', 'warn', 'critical'].includes(s.mem.pressure) ? tr(`mac.meter.pressure.${s.mem.pressure}`) : '';
  meters.append(
    meter('RAM', `${Math.round((s.mem.used / s.mem.total) * 100)}%`, tr('mac.meter.ramSub', { used: fmtBytes(s.mem.used), total: fmtBytes(s.mem.total), pressure: pressureText }), s.mem.used / s.mem.total, lv),
    meter('Swap', s.mem.swapTotal ? fmtBytes(s.mem.swapUsed) : '0', s.mem.swapTotal ? tr('mac.meter.swapSub', { size: fmtBytes(s.mem.swapTotal) }) : tr('mac.meter.swapNone'), s.mem.swapTotal ? s.mem.swapUsed / s.mem.swapTotal : 0, s.mem.swapUsed > 8 * GB ? 'critical' : s.mem.swapUsed > 2 * GB ? 'warn' : 'normal'),
    meter('CPU', `${s.cpu.percent}%`, tr('mac.meter.cpuSub', { n: s.cpu.cores, load: num(s.cpu.load, 1) }), s.cpu.percent / 100, s.cpu.percent > 85 ? 'critical' : s.cpu.percent > 60 ? 'warn' : 'normal'),
    meter(tr('mac.meter.disk'), `${Math.round((s.disk.used / s.disk.total) * 100)}%`, tr('mac.meter.diskSub', { free: fmtBytes(s.disk.free), total: fmtBytes(s.disk.total) }), s.disk.used / s.disk.total, s.diskTight ? 'warn' : 'normal'),
  );
  for (const w of liveWindows()) meters.append(meter(tr('mac.meter.plan', { label: w.label }), `${Math.round(w.pct)}%`, w.resetsAt ? tr('mac.plan.resets', { when: resetText(w.resetsAt) }) : tr('mac.meter.planSub'), w.pct / 100, limitLevel(w.pct)));
  frag.append(meters);

  const tipsSec = el('section', 'sec');
  const h = el('h3', null, tr('mac.tips.title'));
  const ramGain = s.tips.filter((t) => t.action && !t.disk).reduce((a, t) => a + t.gain, 0);
  if (ramGain) h.append(el('small', null, tr('mac.tips.gain', { size: fmtBytes(ramGain) })));
  tipsSec.append(h);
  const tl = el('ul', 'tips');
  if (!s.tips.length) tl.append(el('li', 'muted', tr('mac.tips.none')));
  for (const t of s.tips) {
    const li = el('li', 'tip'); li.dataset.level = t.level;
    li.append(el('span', 'tip-title', t.title), el('span', 'tip-detail', t.detail));
    const actBox = el('div', 'tip-act');
    if (t.action) {
      actBox.append(el('span', 'gain', tr(t.disk ? 'mac.tips.gainDisk' : 'mac.tips.gainRam', { size: fmtBytes(t.gain) })));
      actBox.append(actFor(t.id, { action: t.action, target: t.target, start: t.start }, t.verb));
    }
    li.append(actBox); tl.append(li);
  }
  tipsSec.append(tl); frag.append(tipsSec);

  const devSec = el('section', 'sec'); devSec.append(el('h3', null, tr('mac.dev.title')));
  const dl = el('ul', 'rows');
  if (!s.devServers.length) dl.append(el('li', 'muted', tr('mac.dev.none')));
  for (const d of s.devServers) {
    const li = el('li', 'row'); const main = el('div', 'row-main');
    const who = d.owner ? tr(d.owner.alive ? 'mac.dev.ownerAlive' : 'mac.dev.ownerLeft', { name: d.owner.name }) : tr('mac.dev.ownerNone');
    main.append(el('div', 'row-name', tr('mac.dev.name', { label: d.label, ports: d.ports.join(', '), n: d.ports.length })), el('div', 'row-sub', tr('mac.dev.up', { dir: d.dir || '—', time: fmtAgo(d.up) })),
      el('div', 'row-owner' + (d.owner && !d.owner.alive ? ' row-owner--left' : d.owner ? '' : ' row-owner--none'), who));
    if (d.conns != null) main.append(el('div', 'row-use' + (d.conns ? ' row-use--on' : ''), d.conns ? tr('mac.dev.inUse', { n: d.conns }) : d.idle >= d.watched - 30 ? tr('mac.dev.notYet', { time: fmtAgo(d.watched) }) : tr('mac.dev.unused', { time: fmtAgo(d.idle) })));
    li.append(main, el('span', 'row-num', `${fmtBytes(d.mem)} · CPU ${d.cpu}%`), actFor(`kill:${d.pid}`, { action: 'kill', target: d.pid, start: d.start }, tr('mac.verb.stop')));
    dl.append(li);
  }
  devSec.append(dl); frag.append(devSec);

  const cSec = el('section', 'sec'); cSec.append(el('h3', null, tr('mac.claude.title'), ), );
  cSec.querySelector('h3').append(el('small', null, tr('mac.claude.hint')));
  const cl = el('ul', 'rows');
  for (const c of s.claude) {
    const li = el('li', 'row'); const main = el('div', 'row-main');
    main.append(el('div', 'row-name', c.name + (c.remote ? ' 📱' : '')), el('div', 'row-sub', `${c.dir} · ${c.busy ? tr('mac.claude.busy') : tr('mac.claude.idle', { time: fmtAgo(c.idle) })}`));
    li.append(main, el('span', 'row-num', fmtBytes(c.mem)), actFor(`kill:${c.pid}`, { action: 'kill', target: c.pid, start: c.start }, tr('common.close'), { disabled: c.busy }));
    cl.append(li);
  }
  cSec.append(cl); frag.append(cSec);

  const aSec = el('section', 'sec'); aSec.append(el('h3', null, tr('mac.apps.title')));
  const al = el('ul', 'rows');
  for (const a of s.apps.slice(0, 6)) {
    const li = el('li', 'row'); const main = el('div', 'row-main');
    main.append(el('div', 'row-name', a.name), el('div', 'row-sub', tr('mac.apps.procs', { n: a.count, cpu: a.cpu })));
    li.append(main, el('span', 'row-num', fmtBytes(a.mem)), a.quit ? actFor(`quit:${a.name}`, { action: 'quit', target: a.name }, tr('mac.verb.quit')) : el('span', 'muted', a.name === 'Claude Code' ? tr('mac.apps.closeAbove') : tr('mac.apps.kept')));
    al.append(li);
  }
  aSec.append(al); frag.append(aSec);

  const kSec = el('section', 'sec'); const kh = el('h3', null, tr('mac.disk.title'));
  kh.append(el('small', null, s.cleanupsAt ? tr('mac.disk.measuredAt', { time: hhmm(s.cleanupsAt) }) : tr('mac.disk.measuring'))); kSec.append(kh);
  const kl = el('ul', 'rows');
  if (!s.cleanups.length) kl.append(el('li', 'muted', s.cleanupsAt ? tr('mac.disk.none') : tr('mac.disk.wait')));
  for (const c of s.cleanups) {
    const li = el('li', 'row'); const main = el('div', 'row-main');
    main.append(el('div', 'row-name', c.title), el('div', 'row-sub', c.note));
    li.append(main, el('span', 'row-num', fmtBytes(c.size)), actFor(`clean:${c.id}`, { action: 'clean', target: c.id }, tr('mac.verb.clean')));
    kl.append(li);
  }
  kSec.append(kl); frag.append(kSec);

  body.replaceChildren(frag);
  body.scrollTop = keepScroll;
}

export function setup() {
  /* ---------- Mac drawer ---------- */
  state.macTimer = null;
  /* plan usage (5-hour / 7-day windows) from Claude Code's status line */
  state.limits = null; state.limitsNote = '';
  setInterval(renderLimits, 30000);
  $('btn-mac').addEventListener('click', () => (drM.hidden ? openMac() : closeMac()));
  $('mac-refresh').addEventListener('click', loadMac);
}
