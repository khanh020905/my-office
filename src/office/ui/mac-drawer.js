// The Mac drawer: memory, CPU, dev servers, plan limits, cleanup.
import { state } from '../core/state.js';
import { $, GB, el, fmtAgo, fmtBytes, hhmm, pad2, replay, small } from '../core/env.js';
import { syncDevBoxes } from '../world/props/dev-servers.js';
import { setLedMood } from '../world/room-update.js';
import { queueUi, toast } from './activity.js';
import { closeSession, drM } from './session-drawer.js';
import { chatMoved } from './group-chat.js';
import { TOKEN } from '../net/live.js';
import { DEMO, demoMac } from '../demo/demo.js';
import { icon } from './icons.js';
import { strandedSection, strandedHolding } from './stranded.js';
import { t as tr, num, locale } from '../../i18n/index.js';

export let macSnap = null;
let confirmKey = null;
let confirmTimer = null;
const busyKeys = new Set();
export function openMac() { if (state.selectedId) closeSession(); drM.hidden = false; if (small.matches) $('feed').classList.remove('feed--open'); loadMac(); clearInterval(state.macTimer); state.macTimer = setInterval(pollMac, 5000); }
export function closeMac() { drM.hidden = true; clearInterval(state.macTimer); state.macTimer = setInterval(pollMac, 30000); }
// the readings by the clock: not while the tab is hidden (each one has the server list every process; a tab hidden for
// the evening would keep it at it all night); it reads again as soon as the tab shows
export const pollMac = () => { if (document.visibilityState === 'visible') loadMac(); };
// the drawer is rebuilt on every reading: not while a button in it is being pressed, or the click would land on a
// button that no longer exists (the next reading draws it)
let pressing = false;
export async function loadMac() {
  if (DEMO) { macSnap = demoMac(); renderMacButton(); syncDevBoxes(macSnap); if (!drM.hidden && !pressing && !strandedHolding()) renderMac(); return; }
  try {
    const q = new URLSearchParams(TOKEN ? { k: TOKEN } : {}); if (!drM.hidden) q.set('open', '1');   // (open: fresh memory footprints)
    const r = await fetch(`/api/sys${String(q) ? `?${q}` : ''}`);
    macSnap = await r.json();
    renderMacButton(); syncDevBoxes(macSnap);
    if (!drM.hidden && !pressing && !strandedHolding()) renderMac();   // (nor while a form is open in "Việc bỏ quên")
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
    const block = acctBlock(o.name, o.label, acc, o.until); rows.append(block);
    if (!ws.length) { block.append(el('small', 'plan-other-note', o.note || tr('mac.plan.loading'))); continue; }
    for (const w of ws) limitRow(block, w);
    // Anthropic not answering for now (it limits how often it's asked): the last reading stays, with when it was read
    if (o.note) block.append(el('small', 'plan-other-note', o.at ? tr('mac.plan.readAt', { time: hhmm(o.at), note: o.note }) : o.note));
  }
  if (state.limits?.others?.length) rows.append(autoRow());
  // in the order the user dragged them into (the server's: switching goes down it), the switch after them
  const order = state.limits?.auto?.order;
  if (order) for (const b of blocksOf(rows).sort((x, y) => order.indexOf(x.dataset.slug) - order.indexOf(y.dataset.slug))) rows.insertBefore(b, rows.querySelector(':scope > .acct-auto'));
}

/* ---------- the accounts' order: drag one by its grip (or ↑ ↓ on the grip), saved at once (POST /api/accounts/order) ----------
   The top one is the one new sessions start on; with switching on, they move down the list when one runs out. The block
   moves in the list while it is dragged, so the drop is where it is seen. */
let dragging = false;
const blocksOf = (rows) => [...rows.querySelectorAll(':scope > .acct-block')];
function gripFor(slug, label) {
  const g = el('button', 'acct-grip'); g.type = 'button'; g.title = tr('mac.plan.drag'); g.setAttribute('aria-label', `${tr('mac.plan.drag')}: ${acctName(slug, label)}`);
  g.addEventListener('pointerdown', (e) => startDrag(e, g));
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const block = g.closest('.acct-block'), rows = block.parentElement, list = blocksOf(rows), i = list.indexOf(block), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    if (j < i) rows.insertBefore(block, list[j]); else rows.insertBefore(list[j], block);
    saveOrder(rows, slug);
  });
  return g;
}
function startDrag(e, grip) {
  if (e.button !== 0) return;
  const block = grip.closest('.acct-block'), rows = block.parentElement, was = blocksOf(rows).map((b) => b.dataset.slug).join('|');
  e.preventDefault();
  dragging = true; block.classList.add('is-dragging'); rows.classList.add('is-sorting');
  const move = (ev) => {   // before the first other account whose middle is below the pointer
    if (!ev.buttons) { up(); return; }   // (let go outside the window: no pointerup came)
    let before = rows.querySelector(':scope > .acct-auto');
    for (const b of blocksOf(rows)) { if (b === block) continue; const r = b.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { before = b; break; } }
    if (block.nextElementSibling !== before && before !== block) { rows.insertBefore(block, before); blocksOf(rows).forEach((x, i) => { const n = x.querySelector('.acct-num'); if (n) n.textContent = String(i + 1); }); }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('blur', up);
    if (!dragging) return;
    dragging = false; block.classList.remove('is-dragging'); rows.classList.remove('is-sorting');
    if (blocksOf(rows).map((b) => b.dataset.slug).join('|') !== was) saveOrder(rows, block.dataset.slug); else renderLimits();
  };
  // (on the window: the grip moves with its account under the pointer, which loses a pointer capture)
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);
}
async function saveOrder(rows, slug) {
  const order = blocksOf(rows).map((b) => b.dataset.slug), first = state.limits?.auto?.order?.[0];
  if (state.limits?.auto) state.limits.auto.order = order;
  const r = await post('/api/accounts/order', { order });
  if (!r.ok) { toast(tr('mac.plan.useFailed')); return; }
  if (state.limits) state.limits.auto = r;
  renderLimits();
  $('plan-rows').querySelector(`.acct-block[data-slug="${CSS.escape(slug)}"] .acct-grip`)?.focus();
  const nameOf = (s) => acctName(s, s ? state.limits?.others?.find((o) => o.name === s)?.label : state.limits?.label);
  toast(order[0] !== first ? tr('mac.plan.usingNow', { name: nameOf(order[0]) }) : tr('mac.plan.orderSaved', { list: order.map(nameOf).join(' → ') }), 6000);
}

/* ---------- each account's heading: its name (click to rename), its plan, and on hover "use this one" ----------
   The account new Claude Code sessions start on carries "in use"; one out of usage says when it comes back. Picking one
   (POST /api/accounts/use) and moving on by itself when one runs out (POST /api/accounts/auto) are the server's: it
   starts the editors' Claude Code through a script of its own (server/index.mjs, which account new sessions start on). */
let editing = null;   // the account whose name is being typed ('' = the main one): the card isn't redrawn under it
export const acctName = (slug, label) => label || (slug ? tr('mac.plan.otherAccount', { name: slug }) : tr('mac.plan.mainAccount'));
const switchOn = () => { const a = state.limits?.auto; return !!(a?.on || a?.pick); };
// an account's heading and its limits, together: hovering any of it shows its actions
function acctBlock(slug, label, info, until) { const b = el('div', 'acct-block'); b.dataset.slug = slug; b.append(acctHead(slug, label, info, until)); return b; }
function acctHead(slug, label, info, until) {
  const a = state.limits?.auto || {}, inUse = switchOn() ? (a.now || '') === slug : !slug;
  const head = el('div', `plan-other acct-head${inUse ? ' is-live' : ''}`), order = a.order || [];
  const name = el('button', 'acct-name'); name.type = 'button'; name.title = tr('mac.plan.rename');
  name.append(el('b', null, acctName(slug, label)), icon('pencil', 'ic acct-pen'));
  name.addEventListener('click', () => renameIn(head, slug, label));
  const end = el('span', 'acct-end');
  if (!inUse) {
    const use = el('button', 'acct-use', tr('mac.plan.use')); use.type = 'button'; use.title = tr('mac.plan.useTitle', { name: acctName(slug, label) });
    use.addEventListener('click', () => useAccount(slug, label, use)); end.append(use);
  }
  if (until > Date.now()) {   // (short: the day and the time, the date in its tooltip; the row has its "Dùng" too)
    const d = new Date(until), today = d.toDateString() === new Date().toDateString();
    const out = el('em', 'acct-badge acct-badge--out', tr('mac.plan.out', { when: today ? hhmm(until) : `${tr('mac.plan.weekdays', null, 'list')[d.getDay()]} ${hhmm(until)}` }));
    out.title = resetText(until); end.append(out);
  }
  else if (inUse) end.append(el('em', 'acct-badge acct-badge--on', tr('mac.plan.inUse')));
  const meta = el('span', 'acct-meta', info); if (!slug) meta.title = tr('mac.plan.account');
  if (order.length > 1) head.append(gripFor(slug, label));
  if (a.on && order.length > 1) { const n = el('span', 'acct-num', String(order.indexOf(slug) + 1)); n.title = tr('mac.plan.numTitle'); head.append(n); }
  head.append(name, meta, end);
  return head;
}
function renameIn(head, slug, label) {
  editing = slug; head.classList.add('is-editing');
  const f = el('form', 'acct-rename'), inp = el('input'), plain = acctName(slug, '');
  inp.maxLength = 24; inp.value = acctName(slug, label); inp.placeholder = plain; inp.autocomplete = 'off'; inp.setAttribute('aria-label', tr('mac.plan.rename'));
  let done = false;
  const finish = (save) => {
    if (done) return; done = true; editing = null;
    const v = inp.value.trim() === plain ? '' : inp.value.trim();   // (its own name again: no name of the user's)
    if (save && v !== (label || '')) {
      const o = slug ? state.limits?.others?.find((x) => x.name === slug) : state.limits;   // (at once; the server sends the card again)
      if (o) o.label = v;
      post('/api/accounts/rename', { name: slug, label: v }).then((r) => { if (!r.ok) toast(tr('mac.plan.renameFailed')); });
    }
    renderLimits();
  };
  f.addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
  f.append(inp, el('small', null, tr('mac.plan.renameHint')));
  head.querySelector('.acct-name').replaceWith(f);
  inp.focus(); inp.select();
}
// the editors whose settings the office couldn't change itself: how to do it by hand
function editorNotes(box, a) {
  for (const e of a.editors || []) {
    if (e.ok) continue;
    box.append(el('small', 'acct-warn', tr(e.other ? 'mac.plan.editorOther' : 'mac.plan.editorByHand', { app: e.app })));
    if (!e.other) box.append(codeBox(a.script));
  }
}
async function useAccount(slug, label, btn) {
  btn.disabled = true;
  const r = await post('/api/accounts/use', { name: slug });
  if (!r.ok) { btn.disabled = false; toast(tr('mac.plan.useFailed')); return; }
  if (state.limits) state.limits.auto = r;
  renderLimits();
  toast(tr(r.editors?.length || !r.on && !r.pick ? 'mac.plan.usingNow' : 'mac.plan.usingTerminal', { name: acctName(slug, label) }), 7000);
}
// switching by itself when an account runs out
function autoRow() {
  const a = state.limits?.auto || {}, box = el('div', 'acct-auto');
  const sw = el('button', 'acct-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(!!a.on)); sw.disabled = !!a.win;
  sw.append(el('span', 'acct-knob'), el('span', 'acct-switch-t', tr('mac.plan.autoTitle')));
  sw.addEventListener('click', async () => {
    sw.disabled = true;
    const r = await post('/api/accounts/auto', { on: !a.on });
    if (!r.ok) { sw.disabled = false; toast(tr('mac.plan.useFailed')); return; }
    if (state.limits) state.limits.auto = r;
    renderLimits();
    toast(tr(r.on ? 'mac.plan.autoNowOn' : 'mac.plan.autoNowOff'), 6000);
  });
  box.append(sw, el('small', 'acct-auto-sub', tr(a.win ? 'mac.plan.autoWin' : a.on ? 'mac.plan.autoOn' : 'mac.plan.autoOff')));
  // and the conversations open on the account that ran out: they go over too (on unless turned off)
  if (a.on && !a.win) {
    const mv = el('label', 'acct-move'), cb = el('input'); cb.type = 'checkbox'; cb.checked = a.move !== false;
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      const r = await post('/api/accounts/auto', { move: cb.checked });
      cb.disabled = false;
      if (!r.ok) { cb.checked = !cb.checked; toast(tr('mac.plan.useFailed')); return; }
      if (state.limits) state.limits.auto = r;
    });
    mv.append(cb, el('span', null, tr('mac.plan.autoMove')));
    box.append(mv);
  }
  if (!switchOn()) return box;
  box.append(el('small', 'acct-auto-sub', tr('mac.plan.running')));
  editorNotes(box, a);
  if (!a.win && !(a.editors || []).length) box.append(el('small', 'acct-warn', tr('mac.plan.noEditor')));
  if (a.alias) { const more = el('details', 'pa-more'); more.append(el('summary', null, tr('mac.plan.terminal')), el('small', null, tr('mac.plan.terminalTip')), codeBox(a.alias)); box.append(more); }
  return box;
}
// the server moved the conversations open on an account that ran out
export function acctMoved(d) {
  if (replay.on || !d.names?.length) return;
  toast(tr('mac.plan.moved', { from: d.from, to: d.to, n: d.names.length, names: d.names.join(', ') }), 10000);
  chatMoved(d.names, d.to);
}
// the server moved new sessions to another account (one ran out, or came back)
export function acctSwitched(d) {
  if (d.why !== 'auto' || !d.from || replay.on) return;
  toast(d.until > Date.now() ? tr('mac.plan.switched', { from: d.from, to: d.to, when: resetText(d.until) }) : tr('mac.plan.switchedBack', { to: d.to }), 9000);
}
/* ---------- adding a Claude account (on this computer only) ----------
   A name, then the office makes the account's own folder, connects it and runs Claude Code's sign-in for it (POST
   /api/accounts): the browser opens the Claude login page, and the card follows along ({ k: 'acctlogin' } from the
   server: acctLogin) with a way to open the page again or copy its link (for a private window), a box for the code
   the page may show, and a retry. The account appears in the card as soon as it has logged in (renderLimits). */
const adding = { step: 'idle', name: '', data: null, login: null, note: '' };
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false }));
function copyButton(text, label = tr('mac.add.copy')) {
  const b = el('button', 'pa-copy', label); b.type = 'button';
  b.addEventListener('click', () => navigator.clipboard?.writeText(text).then(() => { b.textContent = tr('mac.add.copied'); setTimeout(() => { b.textContent = label; }, 1600); }).catch(() => {}));
  return b;
}
export function codeBox(text) { const box = el('div', 'pa-code'); box.append(el('code', null, text), copyButton(text)); return box; }
function addButton(text, cls, fn, type = 'button') { const b = el('button', `btn btn--sm ${cls}`, text); b.type = type; if (fn) b.addEventListener('click', fn); return b; }
// a step of the sign-in, from the server
const lastLogin = new Map();   // (the latest step per account: one can come before the card has heard back from POST /api/accounts)
export function acctLogin(d) {
  lastLogin.set(d.name, d);
  if (adding.data?.name !== d.name || !['login', 'done'].includes(adding.step)) return;
  adding.login = { state: d.state, url: d.url, note: d.note };
  if (d.state === 'done' && adding.step === 'login') adding.step = 'done';
  renderAdd();
}
function renderAdd() {
  const box = $('plan-add'); if (!box) return;
  box.hidden = DEMO || !state.isLocal; if (box.hidden) return;
  const go = (step) => { adding.step = step; renderAdd(); };
  const quit = () => { if (adding.step === 'login' && adding.data) post('/api/accounts/cancel', { name: adding.data.name }); adding.name = ''; adding.login = null; go('idle'); };
  if (adding.step === 'idle') {
    const b = el('button', 'plan-add-btn'); b.type = 'button'; b.append(icon('plus'), el('span', null, tr('mac.add.button')));
    b.addEventListener('click', () => { adding.note = ''; go('name'); setTimeout(() => box.querySelector('input')?.focus(), 0); });
    box.replaceChildren(b); return;
  }
  const card = el('div', 'pa-step');
  if (adding.step === 'name') {
    const f = el('form', 'pa-form'), lab = el('label', null), inp = el('input'); inp.maxLength = 24; inp.placeholder = tr('mac.add.namePh'); inp.value = adding.name; inp.autocomplete = 'off';
    lab.append(el('span', null, tr('mac.add.nameLabel')), inp);
    const chips = el('div', 'pa-chips');   // (a name in one click)
    for (const n of tr('mac.add.suggest', null, 'list')) { const c = el('button', 'pa-chip', n); c.type = 'button'; c.addEventListener('click', () => { inp.value = n; inp.focus(); }); chips.append(c); }
    const acts = el('div', 'pa-acts'); acts.append(addButton(tr('mac.add.cancel'), '', quit), addButton(tr('mac.add.next'), 'btn--confirm', null, 'submit'));
    f.append(lab, chips, acts);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); adding.name = inp.value.trim(); if (!adding.name) { inp.focus(); return; }
      f.querySelector('[type=submit]').disabled = true;
      const r = await post('/api/accounts', { name: adding.name });
      if (!r.ok) { adding.note = tr('mac.add.failed', { msg: r.message || '' }); renderAdd(); return; }
      const seen = lastLogin.get(r.name);
      adding.data = r; adding.login = seen && (seen.url || seen.state !== 'waiting') ? seen : r.login; adding.note = '';
      go(r.loggedIn || adding.login?.state === 'done' ? 'done' : 'login');
    });
    card.append(el('b', null, tr('mac.add.button')), el('p', null, tr('mac.add.intro')), f);
  } else if (adding.step === 'login') {
    const d = adding.data, L = adding.login || { state: 'waiting' };
    card.append(el('b', null, tr('mac.add.loginTitle', { name: d.name })));
    if (L.state === 'failed') {   // the sign-in stopped: why, and again
      card.append(el('p', 'pa-note', tr('mac.add.failedLogin', { msg: L.note || '' })));
      const acts = el('div', 'pa-acts'); acts.append(addButton(tr('mac.add.cancel'), '', quit), addButton(tr('mac.add.retry'), 'btn--confirm', async () => { adding.login = { state: 'waiting' }; renderAdd(); const r = await post('/api/accounts/login', { name: d.name }); adding.login = { state: r.state || 'failed', url: r.url, note: r.note }; renderAdd(); }));
      card.append(acts);
    } else {
      const lead = el('div', 'pa-browser'); lead.append(icon('globe'), el('p', null, tr('mac.add.browserOpened')));
      const links = el('div', 'pa-links'), open = addButton(tr('mac.add.reopen'), 'btn--confirm', () => { if (L.url) window.open(L.url, '_blank', 'noopener'); });
      open.disabled = !L.url; links.append(open);
      if (L.url) links.append(copyButton(L.url, tr('mac.add.copyLink')));
      const code = el('details', 'pa-code-ask'), f = el('form', 'pa-form pa-row'), inp = el('input'); inp.placeholder = tr('mac.add.codePh'); inp.autocomplete = 'off';
      f.append(inp, addButton(tr('mac.add.send'), '', null, 'submit'));
      f.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value.trim()) { post('/api/accounts/code', { name: d.name, code: inp.value.trim() }); inp.value = ''; inp.placeholder = tr('mac.add.codeSent'); } });
      code.append(el('summary', null, tr('mac.add.codeAsk')), f);
      const wait = el('div', 'pa-wait'); wait.append(el('i', 'pa-spin'), el('span', null, tr('mac.add.waiting')));
      const acts = el('div', 'pa-acts'); acts.append(addButton(tr('mac.add.cancel'), '', quit));
      card.append(lead, links, el('p', 'pa-hint', tr('mac.add.privateHint')), code, wait, acts);
    }
  } else {   // done
    const d = adding.data, o = (state.limits?.others || []).find((x) => x.name === d.name), acc = [o?.account?.plan, o?.account?.org].filter(Boolean).join(' · ');
    const head = el('b', 'pa-done'); head.append(icon('check'), el('span', null, tr('mac.add.doneTitle', { name: d.name })));
    card.append(head);
    if (acc) card.append(el('span', 'plan-acct', acc));
    card.append(el('p', null, tr('mac.add.doneText')));
    const more = el('details', 'pa-more'); more.append(el('summary', null, tr('mac.add.runWith')), el('p', null, tr('mac.add.nextTime')), codeBox(d.run), el('p', null, tr(d.win ? 'mac.add.aliasTipWin' : 'mac.add.aliasTip', { name: d.name })), codeBox(d.alias));
    const acts = el('div', 'pa-acts'); acts.append(addButton(tr('mac.add.done'), 'btn--confirm', () => { adding.name = ''; adding.login = null; go('idle'); }));
    card.append(more, acts);
  }
  if (adding.note) card.append(el('small', 'pa-note', adding.note));
  box.replaceChildren(card);
}
export function renderLimits() {
  const ws = liveWindows(), box = $('plan-card'), others = state.limits?.others || [], none = !ws.length && !others.length;
  box.classList.toggle('is-empty', none);
  { // the pill shows the tightest limit (5 hours, the week, a model's week), coloured by how close it is
    const pill = $('btn-plan'), top = tightest(ws);
    pill.hidden = false;
    // other accounts: their tightest limit after the main one ("5 h 29% · org2 12%")
    const more = others.map((o) => { const t = tightest(liveOf(o)); return t ? ` · ${o.label || o.name} ${Math.round(t.pct)}%` : ''; }).join('');
    $('plan-mini').textContent = (top ? `${top.key === 'session' ? tr('mac.plan.fiveHour') : top.label} ${Math.round(top.pct)}%` : state.limitsNote ? tr('mac.plan.unread') : tr('mac.plan.reading')) + more;
    $('plan-bar').style.width = `${top ? Math.min(100, Math.max(2, top.pct)) : 0}%`;
    pill.dataset.level = top ? limitLevel(top.pct) : 'normal';
    pill.title = top ? tr('mac.plan.pillTitle', { text: `${ws.map((w) => `${w.label} ${Math.round(w.pct)}%`).join(' · ')}${top.resetsAt ? ` · ${tr('mac.plan.labelResets', { label: top.label, when: resetText(top.resetsAt) })}` : ''}` }) : state.limitsNote || tr('mac.plan.title');
  }
  const acc = state.limits?.account, accText = acc ? [acc.plan, acc.org].filter(Boolean).join(' · ') : '';
  $('plan-acct').hidden = true;   // (the plan sits in the main account's heading)
  if (adding.step === 'idle') renderAdd();
  if (none) { $('plan-at').textContent = ''; $('plan-empty').textContent = state.limitsNote || tr('mac.plan.loading'); return; }
  $('plan-at').textContent = state.limits.at ? (Date.now() - state.limits.at < 60e3 ? tr('mac.plan.justUpdated') : tr('time.ago', { time: fmtAgo((Date.now() - state.limits.at) / 1000) })) : '';
  if (editing !== null || dragging) return;   // (a name being typed, an account being dragged: drawn again after)
  const rows = $('plan-rows'); rows.replaceChildren();
  const mainRows = acctBlock('', state.limits.label, accText, state.limits.until); rows.append(mainRows);
  if (!ws.length) mainRows.append(el('small', 'plan-other-note', state.limitsNote || tr('mac.plan.loading')));
  for (const w of ws) limitRow(mainRows, w);
  // no week over all models: org plans (Team / Enterprise) don't have one; a personal plan that shows none is still being read
  if (ws.length && !ws.some((w) => w.key === 'weekly')) {
    const org = ORG_PLANS.has(acc?.plan), m = el('span', 'hl-m plan-none');
    m.append(el('span', null, tr('mac.plan.week')), el('span', 'plan-none-t', org ? tr('mac.plan.noneOnPlan', { plan: acc.plan }) : tr('mac.plan.unread')), el('em', null, '–'));
    m.title = org ? tr('mac.plan.orgNoWeek') : tr('mac.plan.personalWeekSoon');
    mainRows.append(m, el('small', 'plan-reset', ''));
  }
  renderOthers(rows);
  if (adding.step === 'login' && others.some((o) => o.name === adding.data?.name)) { adding.step = 'done'; renderAdd(); }
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
  $('mac-mini').replaceChildren(`RAM ${pct}%`, ...(s.mem.swapUsed > GB ? [el('span', 'mp-swap', ` · ${fmtBytes(s.mem.swapUsed)}`)] : []));   // (the swap: dropped on a phone)
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
  const s = el('span', null, sub); s.title = sub;
  m.append(top, bar, s); return m;
}
function actionButton(key, verbText, run, opts = {}) {
  const b = el('button', `btn btn--sm${opts.cls ? ` ${opts.cls}` : ''}`, verbText); b.type = 'button'; b.dataset.fk = key;
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
    toast(d.message || (d.ok ? tr('mac.action.done') : tr('mac.action.failed')), d.closed ? 7000 : undefined);
    if (d.stubborn) stubborn.set(key, body); else stubborn.delete(key);
  } catch { toast(tr('mac.action.unreachable')); }
}
function actFor(key, body, verbText, extra = {}) {
  if (stubborn.has(key)) return actionButton(key + ':force', tr(body.action === 'quit' ? 'mac.action.forceQuit' : 'mac.action.forceStop'), () => doAction(key, { ...body, force: true }), { force: true, confirm: tr('mac.action.sureForce') });
  return actionButton(key, verbText, () => doAction(key, body), extra);
}

/* ---------- the drawer ----------
   Top to bottom: the verdict (why the machine is slow, in one sentence, and the one safe thing that helps most), the
   small meters, what else is worth doing, who holds the RAM (one bar, then the sessions and the apps behind it),
   dev servers, disk cleanup. Everything is rebuilt every 5 seconds; the focused button keeps its focus (data-fk). */
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const cmdKey = () => (document.documentElement.dataset.os || 'darwin') === 'darwin' ? '⌘⇧P' : 'Ctrl+Shift+P';
// the session tips: idle longer than the server's rule (shorter when memory is tight)
const idleTips = (s) => { const pids = new Set(s.claude.map((c) => c.pid)); return s.tips.filter((t) => t.action === 'kill' && pids.has(t.target)); };
// a colour per app that stays with it while the page is open (slots in a fixed order, never by rank; a 7th app goes to "other")
const SLOTS = 6, slotOf = new Map();
function slotFor(key, inUse) {
  if (slotOf.has(key)) return slotOf.get(key);
  for (let i = 1; i <= SLOTS; i++) {
    if (inUse.has(i)) continue;
    for (const [k, v] of slotOf) if (v === i) slotOf.delete(k);   // (an app no longer shown gives its colour up)
    slotOf.set(key, i); return i;
  }
  return 0;
}
// who holds the memory: the apps, the Claude sessions as one, the dev servers, the rest (footprints, so swapped and
// compressed memory counts too: the total is more than the RAM)
function holders(s) {
  const claudeApp = s.apps.find((a) => a.name === 'Claude Code');
  const list = s.apps.filter((a) => a.name !== 'Claude Code').map((a) => ({ key: `app:${a.name}`, name: a.name, mem: a.mem }));
  const sess = claudeApp?.mem || s.claude.reduce((a, c) => a + c.mem, 0);
  if (sess) list.push({ key: 'claude', name: tr('mac.held.sessions'), mem: sess });
  const dev = s.devServers.reduce((a, d) => a + d.mem, 0);
  if (dev) list.push({ key: 'dev', name: tr('mac.held.dev'), mem: dev });
  list.sort((a, b) => b.mem - a.mem);
  const total = Math.max(s.held || 0, list.reduce((a, g) => a + g.mem, 0));
  const shown = list.filter((g, i) => i < SLOTS && g.mem >= total * 0.03);
  const inUse = new Set(shown.filter((g) => slotOf.has(g.key)).map((g) => slotOf.get(g.key)));
  for (const g of shown) { g.slot = slotFor(g.key, inUse); inUse.add(g.slot); }
  // in slot order: the first reading puts the biggest first, and after that two apps of about the same size don't
  // swap places every 5 seconds (and neighbours are the colour pairs checked for colour-blind readers)
  shown.sort((a, b) => a.slot - b.slot);
  const rest = total - shown.reduce((a, g) => a + g.mem, 0);
  if (rest > total * 0.01) shown.push({ key: 'other', name: tr('mac.held.other'), mem: rest, slot: 0 });
  return { total, groups: shown };
}
function verdictKey(s) {
  const swap = s.mem.swapUsed;
  if (s.mem.pressure === 'critical') return swap > GB ? 'critical' : 'squeeze';
  if (s.mem.pressure === 'warn') return swap > GB ? 'swap' : 'squeeze';
  if (swap > 4 * GB) return 'swapLeft';
  if (s.diskTight) return 'disk';
  if (s.cpu.percent > 85) return 'cpu';
  return 'ok';
}
// a sparkline: one series, its own scale, a point per minute; hovering a minute names it
function spark(label, points, max, fmt, lv) {
  const W = 120, H = 30, box = el('div', 'mspark'); box.dataset.level = lv;
  const head = el('div', 'mspark-head'); head.append(el('span', null, label), el('b', null, fmt(points[points.length - 1].v))); box.append(head);
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: ${points.map((p) => fmt(p.v)).join(', ')}`);
  const t0 = points[0].t, span = Math.max(1, points[points.length - 1].t - t0);
  const xy = points.map((p) => [((p.t - t0) / span) * W, H - 2 - (Math.min(max, p.v) / max) * (H - 4)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const base = document.createElementNS(NS, 'path'); base.setAttribute('d', `M0,${H - 0.5}L${W},${H - 0.5}`); base.setAttribute('class', 'mspark-base'); base.setAttribute('vector-effect', 'non-scaling-stroke');
  const path = document.createElementNS(NS, 'path'); path.setAttribute('d', line); path.setAttribute('class', 'mspark-line'); path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(base, path);
  points.forEach((p, i) => {   // the hover targets: a strip per minute, wider than the line
    const r = document.createElementNS(NS, 'rect'), x0 = i ? (xy[i - 1][0] + xy[i][0]) / 2 : 0, x1 = i < xy.length - 1 ? (xy[i][0] + xy[i + 1][0]) / 2 : W;
    r.setAttribute('x', x0.toFixed(1)); r.setAttribute('y', '0'); r.setAttribute('width', Math.max(1, x1 - x0).toFixed(1)); r.setAttribute('height', String(H)); r.setAttribute('class', 'mspark-hit');
    const tt = document.createElementNS(NS, 'title'); tt.textContent = tr('mac.trend.point', { time: hhmm(p.t), value: fmt(p.v) }); r.append(tt); svg.append(r);
  });
  box.append(svg); return box;
}
function verdictCard(s, lv) {
  const card = el('section', 'verdict'); card.dataset.level = lv;
  const key = verdictKey(s), main = el('div', 'verdict-main');
  const h = el('p', 'verdict-title'); h.append(el('i', 'verdict-dot'), el('span', null, tr(`mac.verdict.${key}`, { swap: fmtBytes(s.mem.swapUsed), free: fmtBytes(s.disk.free), pct: key === 'cpu' ? s.cpu.percent : pct(s.mem.used, s.mem.total) })));
  main.append(h);
  const top = holders(s).groups.filter((g) => g.key !== 'other').sort((a, b) => b.mem - a.mem).slice(0, 3);
  if (key !== 'ok' && key !== 'disk' && top.length) main.append(el('p', 'verdict-who', tr('mac.verdict.who', { list: top.map((g) => `${g.name} ${fmtBytes(g.mem)}`).join(' · ') })));
  // the one safe thing that helps most: close every idle session at once (apps are never quit in bulk)
  const idle = idleTips(s), acts = el('div', 'verdict-acts');
  if (idle.length) {
    const gain = idle.reduce((a, t) => a + t.gain, 0), n = idle.length;
    acts.append(actionButton('closeIdle', tr('mac.verdict.closeIdle', { n, size: fmtBytes(gain) }), () => doAction('closeIdle', { action: 'closeIdle', items: idle.map((t) => ({ target: t.target, start: t.start })) }), { cls: 'btn--primary', confirm: tr('mac.verdict.closeIdleSure', { n }) }));
    main.append(acts, el('p', 'verdict-note', tr('mac.verdict.idleNote', { time: fmtAgo(s.rules?.sessionIdle || 7200) })));
  } else if (lv !== 'normal' && key !== 'swapLeft' && key !== 'disk') main.append(el('p', 'verdict-note', tr('mac.verdict.appsNote')));
  if (s.diskTight) {
    const go = el('button', 'btn btn--sm', tr('mac.verdict.diskGo')); go.type = 'button'; go.dataset.fk = 'diskGo';
    go.addEventListener('click', () => $('mac-disk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    acts.append(go); if (!acts.parentNode) main.append(acts);
  }
  card.append(main);
  // the last half hour, RAM and swap each on its own little chart
  const tr0 = (s.trend || []).filter((p) => p.t > Date.now() - 31 * 60e3);
  const side = el('div', 'verdict-trend'); side.append(el('small', null, tr('mac.trend.title')));
  if (tr0.length >= 2) {
    side.append(spark(tr('mac.trend.ram'), tr0.map((p) => ({ t: p.t, v: pct(p.used, p.total) })), 100, (v) => `${v}%`, lv),
      spark(tr('mac.trend.swap'), tr0.map((p) => ({ t: p.t, v: p.swap })), Math.max(s.mem.swapTotal || 0, ...tr0.map((p) => p.swap), GB), (v) => fmtBytes(v), s.mem.swapUsed > 8 * GB ? 'critical' : s.mem.swapUsed > 2 * GB ? 'warn' : 'normal'));
  } else side.append(el('span', 'muted', tr('mac.trend.wait')));
  card.append(side);
  return card;
}
function heldBar(s) {
  const { total, groups } = holders(s), sec = el('section', 'sec held');
  const h = el('h3', null, tr('mac.held.title')); h.append(el('small', null, tr('mac.held.total', { size: fmtBytes(total) }))); sec.append(h);
  const bar = el('div', 'held-bar'); bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${tr('mac.held.chart')}: ${groups.map((g) => `${g.name} ${fmtBytes(g.mem)}`).join(', ')}`);
  const legend = el('ul', 'held-legend');
  for (const g of groups) {
    const seg = el('i'); seg.dataset.slot = g.slot; seg.style.flexGrow = String(g.mem); seg.title = `${g.name} · ${fmtBytes(g.mem)}`; bar.append(seg);
    const li = el('li'); const dot = el('i'); dot.dataset.slot = g.slot; li.append(dot, el('span', null, g.name), el('b', null, fmtBytes(g.mem))); legend.append(li);
  }
  sec.append(bar, legend);
  return sec;
}
function ideCard(a, ide) {
  const li = el('li', 'row row--ide'); const main = el('div', 'row-main');
  main.append(el('div', 'row-name', a.name), el('div', 'row-sub', ide.chats ? tr('mac.ide.summary', { windows: ide.windows, chats: ide.chats, idle: ide.idleChats, n: ide.chats }) : tr('mac.ide.summaryNoChat', { windows: ide.windows })));
  li.append(main, el('span', 'row-num', fmtBytes(a.mem)), el('span', 'muted', tr('mac.apps.kept')));
  // what the editor's memory is made of
  const parts = el('ul', 'ide-parts');
  for (const [k, v, words] of [['ui', ide.ui.mem, tr('mac.ide.ui')], ['ts', ide.ts.mem, tr('mac.ide.ts', { n: ide.ts.n })], ['ext', ide.ext.mem, tr('mac.ide.ext', { n: ide.ext.n })], ['other', ide.other, tr('mac.ide.other')]]) {
    if (v < 50 * 1024 ** 2) continue;
    const p = el('li'); p.dataset.part = k; const b = el('span', 'ide-bar'); const f = el('i'); f.style.width = `${Math.max(2, (v / ide.mem) * 100)}%`; b.append(f);
    p.append(el('span', null, words), b, el('b', null, fmtBytes(v))); parts.append(p);
  }
  const fixes = el('ul', 'ide-fixes'), cmd = cmdKey();
  if (ide.idleChats) fixes.append(el('li', null, tr('mac.ide.fixChats', { n: ide.idleChats })));
  if (ide.windows > 1) fixes.append(el('li', null, tr('mac.ide.fixWindows', { size: fmtBytes((ide.ui.mem + ide.ts.mem + ide.ext.mem) / ide.windows) })));
  if (ide.ts.mem > 500 * 1024 ** 2) fixes.append(el('li', null, tr('mac.ide.fixTs', { cmd, size: fmtBytes(ide.ts.mem) })));
  fixes.append(el('li', null, tr('mac.ide.fixReload', { cmd })));
  const more = el('div', 'ide-more'); more.append(parts, el('p', 'ide-fix-title', tr('mac.ide.fixTitle')), fixes);
  li.append(more);
  return li;
}
function autoClose(s) {
  const box = el('div', 'auto-close'), cur = s.auto?.hours ?? 0;
  const row = el('div', 'auto-row'); row.append(el('span', 'auto-label', tr('mac.auto.label')));
  const seg = el('div', 'ac-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', tr('mac.auto.label'));
  for (const h of [0, 2, 4, 8]) {
    const b = el('button', 'ac-seg-b', h ? tr('mac.auto.hours', { n: h }) : tr('mac.auto.off')); b.type = 'button'; b.dataset.fk = `auto:${h}`;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(h === cur));
    b.addEventListener('click', () => setAutoClose(h));
    seg.append(b);
  }
  row.append(seg); box.append(row, el('p', 'auto-note', tr('mac.auto.note')));
  if (s.auto?.last) box.append(el('p', 'auto-note', tr('mac.auto.last', { time: hhmm(s.auto.last.at), names: s.auto.last.names })));
  return box;
}
async function setAutoClose(hours) {
  if (DEMO) { if (macSnap.auto) macSnap.auto.hours = hours; else macSnap.auto = { hours }; renderMac();   // (the demo's own setting: kept by demoMac across readings)
    toast(hours ? tr('mac.auto.saved', { n: hours }) : tr('mac.auto.savedOff')); return; }
  try {
    const r = await fetch(`/api/sys/auto${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) });
    const d = await r.json();
    if (!d.ok) { toast(d.message || tr('mac.action.failed')); return; }
    if (macSnap) macSnap.auto = { ...(macSnap.auto || {}), hours: d.hours };
    renderMac(); toast(d.hours ? tr('mac.auto.saved', { n: d.hours }) : tr('mac.auto.savedOff'));
  } catch { toast(tr('mac.action.unreachable')); }
}
// when a session's process started: the time today, the day too before that
function opened(ms) {
  const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
  return today ? tr('mac.claude.opened', { time: hhmm(ms) }) : tr('mac.claude.openedDay', { day: d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }), time: hhmm(ms) });
}
export function renderMac() {
  const s = macSnap; const body = $('mac-body');
  if (!s?.mem) { body.replaceChildren(el('p', 'muted', tr('mac.measuring'))); return; }
  $('mac-at').textContent = tr('mac.updated', { time: hhmm(s.at, true) });
  const keepScroll = body.scrollTop, focusKey = body.contains(document.activeElement) ? document.activeElement.dataset?.fk : null;
  const frag = document.createDocumentFragment();
  const lv = level(s);
  frag.append(verdictCard(s, lv));

  const meters = el('div', 'meters');
  const pressureText = ['normal', 'warn', 'critical'].includes(s.mem.pressure) ? tr(`mac.meter.pressure.${s.mem.pressure}`) : '';
  meters.append(
    meter('RAM', `${pct(s.mem.used, s.mem.total)}%`, tr('mac.meter.ramSub', { used: fmtBytes(s.mem.used), total: fmtBytes(s.mem.total), pressure: pressureText }), s.mem.used / s.mem.total, lv),
    meter('Swap', s.mem.swapTotal ? fmtBytes(s.mem.swapUsed) : '0', s.mem.swapTotal ? tr('mac.meter.swapSub', { size: fmtBytes(s.mem.swapTotal) }) : tr('mac.meter.swapNone'), s.mem.swapTotal ? s.mem.swapUsed / s.mem.swapTotal : 0, s.mem.swapUsed > 8 * GB ? 'critical' : s.mem.swapUsed > 2 * GB ? 'warn' : 'normal'),
    meter('CPU', `${s.cpu.percent}%`, tr('mac.meter.cpuSub', { n: s.cpu.cores, load: num(s.cpu.load, 1) }), s.cpu.percent / 100, s.cpu.percent > 85 ? 'critical' : s.cpu.percent > 60 ? 'warn' : 'normal'),
    meter(tr('mac.meter.disk'), `${pct(s.disk.used, s.disk.total)}%`, tr('mac.meter.diskSub', { free: fmtBytes(s.disk.free), total: fmtBytes(s.disk.total) }), s.disk.used / s.disk.total, s.diskTight ? 'warn' : 'normal'),
  );
  for (const w of liveWindows()) meters.append(meter(tr('mac.meter.plan', { label: w.label }), `${Math.round(w.pct)}%`, w.resetsAt ? tr('mac.plan.resets', { when: resetText(w.resetsAt) }) : tr('mac.meter.planSub'), w.pct / 100, limitLevel(w.pct)));
  frag.append(meters);

  // anything else worth doing: dev servers left behind, a process that keeps growing, test browsers (the sessions,
  // the apps and the disk have their own places below)
  const idle = idleTips(s), idleIds = new Set(idle.map((t) => t.id));
  const more = s.tips.filter((t) => !t.disk && !idleIds.has(t.id) && t.action !== 'quit' && t.id !== 'info:ide');
  if (more.length) {
    const sec = el('section', 'sec'); sec.append(el('h3', null, tr('mac.group.more')));
    const tl = el('ul', 'tips');
    for (const t of more) {
      const li = el('li', 'tip'); li.dataset.level = t.level;
      li.append(el('span', 'tip-title', t.title), el('span', 'tip-detail', t.detail));
      const actBox = el('div', 'tip-act');
      if (t.action) actBox.append(el('span', 'gain', tr('mac.tips.gainRam', { size: fmtBytes(t.gain) })), actFor(t.id, { action: t.action, target: t.target, start: t.start }, t.verb));
      li.append(actBox); tl.append(li);
    }
    sec.append(tl); frag.append(sec);
  }

  // who holds the RAM: one bar, then the Claude sessions and the apps behind it
  const held = heldBar(s);
  const gS = el('div', 'held-group'), sh = el('h4', null, tr('mac.group.sessions')); sh.append(el('small', null, tr('mac.claude.hint'))); gS.append(sh);
  const cl = el('ul', 'rows');
  for (const c of s.claude) {
    // the conversation's title (its folder's name until Claude Code gives it one), then where and since when it runs
    const li = el('li', 'row'); const main = el('div', 'row-main');
    const name = el('div', 'row-name', (c.title || c.name) + (c.remote ? ' 📱' : ''));
    if (c.you) { li.classList.add('row--you'); name.append(el('span', 'row-badge row-badge--you', tr('mac.claude.you'))); }
    else if (idleIds.has(`kill:${c.pid}`)) { li.classList.add('row--suggest'); name.append(el('span', 'row-badge', tr('mac.group.suggest'))); }
    const doing = [c.busy ? tr('mac.claude.busy') : tr('mac.claude.idle', { time: fmtAgo(c.idle) })];
    if (c.agents) doing.push(tr('mac.claude.agents', { n: c.agents }));
    main.append(name, el('div', 'row-sub', [c.app, c.start && opened(c.start * 1000), c.dir].filter(Boolean).join(' · ')), el('div', 'row-sub', doing.join(' · ')));
    li.append(main, el('span', 'row-num', fmtBytes(c.mem)), actFor(`kill:${c.pid}`, { action: 'kill', target: c.pid, start: c.start }, tr('common.close'), { disabled: c.busy }));
    cl.append(li);
  }
  gS.append(cl, autoClose(s));
  const gA = el('div', 'held-group'); gA.append(el('h4', null, tr('mac.group.apps')));
  const al = el('ul', 'rows');
  for (const a of s.apps.slice(0, 6)) {
    if (s.ide && a.name === s.ide.name) { al.append(ideCard(a, s.ide)); continue; }
    const li = el('li', 'row'); const main = el('div', 'row-main');
    main.append(el('div', 'row-name', a.name), el('div', 'row-sub', tr('mac.apps.procs', { n: a.count, cpu: a.cpu })));
    li.append(main, el('span', 'row-num', fmtBytes(a.mem)), a.quit ? actFor(`quit:${a.name}`, { action: 'quit', target: a.name }, tr('mac.verb.quit')) : el('span', 'muted', a.name === 'Claude Code' ? tr('mac.apps.closeAbove') : tr('mac.apps.kept')));
    al.append(li);
  }
  gA.append(al); held.append(gS, gA); frag.append(held);

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
  frag.append(strandedSection());   // work left in the repositories' worktrees (stranded.js)

  const kSec = el('section', 'sec'); kSec.id = 'mac-disk'; const kh = el('h3', null, tr('mac.disk.title'));
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
  if (focusKey) body.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

export function setup() {
  /* ---------- Mac drawer ---------- */
  state.macTimer = null;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadMac(); });
  /* plan usage (5-hour / 7-day windows) from Claude Code's status line */
  state.limits = null; state.limitsNote = '';
  setInterval(renderLimits, 30000);
  $('btn-mac').addEventListener('click', () => (drM.hidden ? openMac() : closeMac()));
  $('mac-refresh').addEventListener('click', loadMac);
  $('mac-body').addEventListener('pointerdown', () => { pressing = true; });
  addEventListener('pointerup', () => { pressing = false; }); addEventListener('pointercancel', () => { pressing = false; });
}
