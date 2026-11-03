// What each tool has left, on hover / focus / tap: one small card per pill with every window (a bar, the %, when it
// resets). One card for the page, in <body> (the list is drawn again and again), moved to the pill that asks for it.
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

let pop = null, cur = null, hover = false, lastType = '';   // cur = { pill, build }
function place() {
  if (!pop || !cur?.pill.isConnected) { close(); return; }
  const r = cur.pill.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  pop.style.width = `${Math.min(300, vw - 16)}px`;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
  pop.style.top = `${r.bottom + h + 8 > vh && r.top - h - 8 > 0 ? r.top - h : r.bottom}px`;   // (flips above when below is short)
}
function fill() {
  const { groups } = cur.build();
  pop.replaceChildren(...groups.map((g) => { const b = el('section', 'pn-pop-grp'); if (g.title) b.append(el('h3', null, g.title)); b.append(...g.rows.map(rowOf)); return b; }));
  pop.firstChild || pop.append(el('small', null, tr('mac.plan.loading')));
}
function open(pill, build, byHover) {
  if (!pop) { pop = el('div', 'pn-pop'); pop.setAttribute('role', 'tooltip'); pop.id = 'pn-pop'; document.body.append(pop); }
  if (cur && cur.pill !== pill) cur.pill.removeAttribute('aria-expanded');
  cur = { pill, build }; hover = byHover; pill.setAttribute('aria-expanded', 'true'); pill.setAttribute('aria-describedby', 'pn-pop');
  fill(); pop.hidden = false; place();
}
export function close() {
  if (cur) cur.pill.removeAttribute('aria-expanded');
  cur = null; hover = false; if (pop) pop.hidden = true;
}
/** make a pill show its card; build() returns { groups: [{ title?, rows: [{ label, pct, resetsAt? }] }] } at the time it opens */
export function attach(pill, key, build) {
  pill.dataset.q = key;
  pill.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(pill, build, true); });
  pill.addEventListener('pointerdown', (e) => { lastType = e.pointerType; });
  pill.addEventListener('focus', () => { if (lastType !== 'mouse' && lastType !== 'touch' && lastType !== 'pen') open(pill, build, false); });   // (keyboard focus; a press opens it by the click)
  pill.addEventListener('blur', () => { if (cur?.pill === pill) close(); });
  pill.addEventListener('click', () => { if (cur?.pill === pill && !(hover && lastType === 'mouse')) close(); else open(pill, build, false); lastType = ''; });
  // the list was drawn again while its card was open: follow the new pill
  if (cur && cur.pill.dataset.q === key && cur.pill !== pill) { cur.pill = pill; open(pill, build, hover); }
}
// the card is not stuck: a press elsewhere, Escape, the page scrolling or hiding, the mouse leaving all close it
export function startQuota() {
  document.addEventListener('pointerdown', (e) => { if (cur && !e.target.closest?.('.pn-qp, .pn-pop')) close(); }, true);
  document.addEventListener('pointermove', (e) => { if (cur && hover && e.pointerType === 'mouse' && !e.target.closest?.('.pn-qp, .pn-pop')) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('scroll', () => { if (cur) close(); }, true);
  document.addEventListener('visibilitychange', close); addEventListener('blur', close); addEventListener('resize', () => cur && place());
}
export const refreshQuota = () => { if (!cur) return; if (cur.pill.isConnected) { fill(); place(); } else close(); };
