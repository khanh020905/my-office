// "Tổng quan", the home sheet of the phone layout (ui/phone.js): one screen for "what needs me, and how are things".
// On top what waits for the owner (the approval cards themselves, moved in from the stack so answering stays
// permissions.js's job, and the sessions waiting), then the sessions at work with their project · branch and what they
// are doing, the plans' limits (Claude and its other accounts, Codex, Antigravity; a tap opens the plan card) and the
// Mac (RAM, CPU, a verdict; a tap opens the Mac drawer, whose last reading is used: no poller of its own). Plain DOM,
// redrawn when the page's UI redraws (activity.js queueUi) and every few seconds while it is open (times, readings).
import { state } from '../core/state.js';
import { $, el, fmtAgo, fmtBytes, fmtClock, nowMs } from '../core/env.js';
import { sessions, dn } from '../people/workers.js';
import { icon } from './icons.js';
import { openSession } from './session-drawer.js';
import { macSnap, openMac, liveWindows, resetText, verdictKey } from './mac-drawer.js';
import { togglePlan } from './settings.js';
import { agLine, claudeLine, codexLine } from './ai-accounts.js';
import { nowOf, project, statusOf } from './lite.js';
import { t as tr, num } from '../../i18n/index.js';

let sheet, perms, body, needs, needsHead, waitRows, rest, timer = 0, open = false;
const lvl = (pct) => (pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'normal');
const section = (cls, title, count) => {
  const s = el('section', `hm-sec ${cls}`), h = el('h3', 'hm-h', title);
  if (count != null) h.append(el('small', null, String(count)));
  s.append(h); return s;
};

function sessionRow(s) {
  const st = statusOf(s), now = nowOf(s), b = el('button', `hm-row is-${st}`);
  b.type = 'button'; b.dataset.sid = s.id;
  const proj = project(s), bits = [proj !== dn(s) ? proj : '', s.git?.branch ? `${s.git.branch}${s.git.dirty ? ' •' : ''}` : ''].filter(Boolean);
  const main = el('span', 'hm-main');
  main.append(el('b', 'hm-title', dn(s)));
  if (bits.length) main.append(el('span', 'hm-sub', bits.join(' · ')));
  const doing = el('span', `hm-now${now.warn ? ' is-warn' : ''}`); doing.append(icon(now.ic), el('span', null, now.text));
  main.append(doing);
  const time = s.taskStart ? fmtClock((nowMs() - s.taskStart) / 1000) : s.lastAt ? fmtAgo((nowMs() - s.lastAt) / 1000) : '';
  b.append(el('span', 'hm-dot'), main, el('span', 'hm-time', time));
  b.addEventListener('click', () => openSession(s.id));
  return b;
}

function bar(label, pct, resets) {
  const m = el('span', 'hm-bar'), track = el('i'), fill = el('b', lvl(pct));
  fill.style.width = `${Math.min(100, Math.max(1, pct))}%`; track.append(fill);
  m.append(el('span', 'hm-bl', label), track, el('em', null, `${Math.round(pct)}%`));
  if (resets) m.title = tr('mac.plan.resets', { when: resetText(resets) });
  return m;
}
function plans() {
  const sec = section('hm-plans', tr('ui.phone.homePlans')), card = el('button', 'hm-card'); card.type = 'button'; card.dataset.go = 'plan';
  const claude = el('div', 'hm-tool'), ws = liveWindows();
  claude.append(el('b', null, 'Claude'));
  if (ws.length) for (const w of ws.slice(0, 3)) claude.append(bar(w.key === 'session' ? tr('mac.plan.fiveHour') : w.label, w.pct, w.resetsAt));
  else { const [text, lv] = claudeLine(); claude.append(el('span', `hm-line is-${lv}`, text)); }
  card.append(claude);
  // the other Claude accounts on this Mac: the tightest window of each
  for (const o of state.limits?.others || []) {
    const live = (o.windows || []).filter((w) => !w.resetsAt || w.resetsAt > Date.now()), top = live.reduce((a, w) => (!a || w.pct > a.pct ? w : a), null);
    const row = el('div', 'hm-tool hm-other'); row.append(el('b', null, o.label || o.name));
    if (top) row.append(bar(top.key === 'session' ? tr('mac.plan.fiveHour') : top.label, top.pct, top.resetsAt)); else row.append(el('span', 'hm-line is-off', o.note || tr('mac.plan.loading')));
    card.append(row);
  }
  const ai = state.ai;
  const more = [ai?.codex && (ai.codex.cli || ai.codex.list?.length) && ['Codex', codexLine(ai.codex)], ai?.ag && (ai.ag.note !== 'noDb' || ai.ag.list?.length) && ['Antigravity', agLine(ai.ag)]].filter(Boolean);
  for (const [name, [text, lv]] of more) { const row = el('div', 'hm-tool'); row.append(el('b', null, name), el('span', `hm-line is-${lv}`, text)); card.append(row); }
  card.addEventListener('click', (e) => { e.stopPropagation(); togglePlan(true); });   // (not a click outside the card it opens: settings.js closes on those)
  sec.append(card); return sec;
}
function mac() {
  const sec = section('hm-mac', tr('ui.phone.homeMac')), card = el('button', 'hm-card'); card.type = 'button'; card.dataset.go = 'mac';
  const s = macSnap;
  if (!s?.mem) card.append(el('span', 'hm-line is-off', tr('ui.macDrawer.loading')));
  else {
    const ram = Math.round((s.mem.used / s.mem.total) * 100), cpu = Math.round(s.cpu?.percent ?? 0), key = verdictKey(s);
    const row = el('div', 'hm-tool'); row.append(bar('RAM', ram), bar('CPU', cpu));
    card.append(row, el('span', `hm-line is-${key === 'ok' ? 'normal' : key === 'critical' ? 'critical' : 'warn'}`,
      tr(`mac.verdict.${key}`, { swap: fmtBytes(s.mem.swapUsed), free: fmtBytes(s.disk?.free || 0), pct: key === 'cpu' ? cpu : ram })));
  }
  card.addEventListener('click', () => openMac());
  sec.append(card); return sec;
}

/** Draws the sheet again (not while it is closed). The approval stack stays mounted: only what is around it changes. */
export function renderHome() {
  if (!open || !body) return;
  const all = [...sessions.values()], wait = all.filter((s) => s.status === 'wait'), work = all.filter((s) => statusOf(s) === 'work');
  const byTime = (a, b) => (b.lastAt || 0) - (a.lastAt || 0), cards = perms?.children.length || 0;
  needsHead.replaceChildren(tr('ui.phone.homeNeeds'), ...(wait.length + cards ? [el('small', null, String(wait.length + cards))] : []));
  waitRows.replaceChildren(...wait.sort(byTime).map(sessionRow), ...(wait.length || cards ? [] : [el('p', 'hm-ok', tr('ui.phone.homeNothing'))]));
  const working = section('hm-work', tr('ui.phone.homeWorking'), work.length || null);
  if (work.length) working.append(...work.sort(byTime).map(sessionRow));
  else working.append(el('p', 'hm-none', all.length ? tr('ui.phone.homeIdle', { n: num(all.length) }) : tr('lite.empty')));
  rest.replaceChildren(working, plans(), mac());
}

/** The sheet opens or closes; the approval stack lives inside it while it is open (the cards keep their own handlers). */
export function setHome(on) {
  if (on === open) return;
  open = on; sheet.hidden = !on;
  const stack = $('perm-stack');
  if (on) {
    if (stack) { perms = stack; needs.insertBefore(stack, waitRows); }
    renderHome(); timer = setInterval(() => { if (document.visibilityState === 'visible') renderHome(); }, 5000);
  } else {
    clearInterval(timer);
    if (stack && needs.contains(stack)) $('lite').after(stack);   // (back where lite.js keeps it in 3D)
  }
}
export function setupHome() {
  sheet = el('div', 'ph-home'); sheet.id = 'ph-home'; sheet.hidden = true; sheet.setAttribute('aria-label', tr('ui.phone.home'));
  body = el('div', 'hm-body'); needs = el('section', 'hm-sec hm-needs'); needsHead = el('h3', 'hm-h'); waitRows = el('div', 'hm-rows'); rest = el('div', 'hm-rest');
  needs.append(needsHead, waitRows); body.append(needs, rest); sheet.append(body);
  $('app').append(sheet);
  perms = $('perm-stack');
}
