// What each tool has left, on hover / focus / tap: one small card per pill with every window (a bar, the %, when it
// resets). One card for the page, in <body> (the list is drawn again and again), moved to the pill that asks for it. A
// session's row uses the same card for its details (session-card.js).
import { t as tr } from '../i18n/index.js';
import { el, level, resetText } from './fmt.js';

// 5 hours first, then the week over all models, then each model's week, then the rest
const ORDER = (w) => (w.key === 'session' ? 0 : w.key === 'weekly' ? 1 : /tuần|week/i.test(w.label) ? 2 : 3);
export const liveWindows = (ws) => (ws || []).filter((w) => !w.resetsAt || w.resetsAt > Date.now()).sort((a, b) => ORDER(a) - ORDER(b));

function rowOf(w) {
  const r = el('div', 'pn-pop-row'), bar = el('span', 'pn-pop-bar'), fill = el('i', `is-${level(w.pct)}`);
  fill.style.width = `${Math.min(100, Math.max(1, w.pct))}%`; bar.append(fill);
  const top = el('div', 'pn-pop-top'); top.append(el('span', null, w.label), el('b', null, `${Math.round(w.pct)}%`));
  r.append(top, bar, el('small', null, w.resetsAt ? tr('mac.plan.resets', { when: resetText(w.resetsAt) }) : ''));
  return r;
}

let pop = null, cur = null, hover = false, lastType = '', wait = 0;   // cur = { pill, build, passive }
function place() {
  if (!pop || !cur?.pill.isConnected) { close(); return; }
  const r = cur.pill.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  if (r.bottom < 0 || r.top > vh) { close(); return; }   // (its pill scrolled out of sight)
  pop.style.width = `${Math.min(300, vw - 16)}px`;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
  // below; above when below is short; else as low as it fits (a long card over a short panel)
  pop.style.top = `${r.bottom + h + 8 <= vh ? r.bottom : r.top - h - 8 > 0 ? r.top - h : Math.max(8, vh - h - 8)}px`;
}
function fill() {
  const { groups, node } = cur.build();
  if (node) { pop.replaceChildren(node); return; }
  pop.replaceChildren(...groups.map((g) => { const b = el('section', 'pn-pop-grp'); if (g.title) b.append(el('h3', null, g.title)); b.append(...g.rows.map(rowOf)); if (g.note) b.append(el('small', 'pn-pop-note', g.note)); return b; }));
  pop.firstChild || pop.append(el('small', null, tr('mac.plan.loading')));
}
function open(pill, build, byHover, passive = false) {
  if (!pop) { pop = el('div', 'pn-pop'); pop.setAttribute('role', 'tooltip'); pop.id = 'pn-pop'; document.body.append(pop); }
  if (cur && cur.pill !== pill) cur.pill.removeAttribute('aria-expanded');
  cur = { pill, build, passive }; hover = byHover; pop.classList.toggle('is-passive', passive); pill.setAttribute('aria-expanded', 'true'); pill.setAttribute('aria-describedby', 'pn-pop');
  fill(); pop.hidden = false; place();
}
export function close() {
  clearTimeout(wait);
  if (cur) cur.pill.removeAttribute('aria-expanded');
  cur = null; hover = false; if (pop) pop.hidden = true;
}
/** make a pill show its card; build() returns { groups: [{ title?, rows: [{ label, pct, resetsAt? }], note? }] } or { node }
 *  at the time it opens. opts.passive: the mouse goes through the card (a list's rows: the next one stays in reach), it
 *  opens after a short stay (not for every row the mouse crosses), and a click is the row's own (no card toggle). */
export function attach(pill, key, build, opts = {}) {
  const passive = !!opts.passive;
  pill.dataset.q = key;
  pill.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(wait);
    if (!passive || cur?.passive) open(pill, build, true, passive);   // (from one row to the next: at once)
    else wait = setTimeout(() => { if (pill.isConnected) open(pill, build, true, passive); }, 300);
  });
  if (passive) pill.addEventListener('pointerleave', () => clearTimeout(wait));
  pill.addEventListener('pointerdown', (e) => { lastType = e.pointerType; });
  pill.addEventListener('focus', () => { if (lastType !== 'mouse' && lastType !== 'touch' && lastType !== 'pen') open(pill, build, false, passive); });   // (keyboard focus; a press opens it by the click)
  pill.addEventListener('blur', () => { if (cur?.pill === pill) close(); });
  if (!passive) pill.addEventListener('click', () => { if (cur?.pill === pill && !(hover && lastType === 'mouse')) close(); else open(pill, build, false); lastType = ''; });
  // the list was drawn again while its card was open: follow the new pill, with the new numbers (not placed here: the pill
  // is not on the page yet, and a card whose pill is gone closes; refreshQuota places it once the list is in)
  if (cur && cur.pill.dataset.q === key && cur.pill !== pill) { cur.pill = pill; cur.build = build; pill.setAttribute('aria-expanded', 'true'); pill.setAttribute('aria-describedby', 'pn-pop'); }
}
// the card is not stuck: a press elsewhere, Escape, the page hiding, the mouse leaving all close it (a scroll moves it: the
// list keeps its scroll through each redraw, and that is a scroll too)
export function startQuota() {
  document.addEventListener('pointerdown', (e) => { if (cur && !e.target.closest?.('[data-q], .pn-pop')) close(); }, true);
  document.addEventListener('pointermove', (e) => { if (cur && hover && e.pointerType === 'mouse' && !e.target.closest?.(cur.passive ? '[data-q]' : '[data-q], .pn-pop')) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Tab') lastType = ''; });   // (keyboard again: focus opens cards)
  document.addEventListener('scroll', () => { if (cur) place(); }, true);
  document.addEventListener('visibilitychange', close); addEventListener('blur', close); addEventListener('resize', () => cur && place());
}
export const refreshQuota = () => { if (!cur) return; if (cur.pill.isConnected) { fill(); place(); } else close(); };
