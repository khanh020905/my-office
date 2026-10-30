// The office on a phone: an app-like layout for small screens, upright or held sideways. <html> gets .is-phone and
// phone.css lays the page out: a compact top bar, the office filling the screen, and a tab bar at the bottom (Văn phòng ·
// Phiên · Hoạt động · Duyệt · Chat) whose tabs open the session list, the activity, the waiting approvals and the team
// chat as full-screen sheets over the office; "Văn phòng" closes whatever is open. Approvals also float above the tab
// bar as soon as one comes in, with buttons big enough for a thumb. The counts on the tabs follow the page: the waiting
// sessions, the approvals in the stack, the chat's unread badge (watched, so nothing else has to call in here).
import { $, el } from '../core/env.js';
import { icon } from './icons.js';
import { closeSession, drM, drS } from './session-drawer.js';
import { closeMac } from './mac-drawer.js';
import { togglePlan, togglePop } from './settings.js';
import { t as tr } from '../../i18n/index.js';

// a phone upright, or sideways (wide but short, with a finger for a pointer)
const PHONE = '(max-width: 720px), (max-height: 520px) and (hover: none) and (pointer: coarse)';
const TABS = [['office', 'home'], ['sessions', 'users'], ['activity', 'list'], ['approve', 'alert'], ['chat', 'chat']];
let mq, bar, tab = 'office', emptyEl;
export const isPhone = () => !!mq?.matches;
const chatOpen = () => !!$('zchat') && !$('zchat').hidden;

// everything that opens over the office, shut
function closeSheets(but = '') {
  if (!drS.hidden) closeSession();
  if (!drM.hidden) closeMac();
  togglePlan(false); togglePop(false);
  if (but !== 'sessions') document.querySelector('.side-left')?.classList.remove('ph-open');
  if (but !== 'activity') $('feed')?.classList.remove('ph-open');
  if (but !== 'approve') document.documentElement.classList.remove('ph-approve');
  if (but !== 'chat' && chatOpen()) $('btn-chat')?.click();
}
export function showTab(next) {
  if (next === tab && next !== 'office') next = 'office';   // (a second tap on the open tab goes back to the office)
  tab = next;
  closeSheets(next);
  if (next === 'sessions') document.querySelector('.side-left')?.classList.add('ph-open');
  if (next === 'activity') $('feed')?.classList.add('ph-open');
  if (next === 'approve') document.documentElement.classList.add('ph-approve');
  if (next === 'chat' && !chatOpen()) $('btn-chat')?.click();   // (the chat window is its own: group-chat-view.js)
  sync();
}
function badge(name, n, tone = '') {
  const b = bar?.querySelector(`[data-tab="${name}"] .ph-badge`); if (!b) return;
  b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); b.dataset.tone = tone;
}
function sync() {
  if (!bar) return;
  if (tab === 'chat' && !chatOpen()) tab = 'office';   // (closed from inside: its back button)
  for (const b of bar.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  const waiting = $('perm-stack')?.children.length || 0;
  badge('approve', waiting, 'red');
  badge('sessions', Number($('st-wait')?.textContent) || 0, 'amber');
  const cb = $('chat-badge'); badge('chat', cb && !cb.hidden ? Number(cb.textContent.replace(/\D/g, '')) || 1 : 0, 'red');
  emptyEl.hidden = !(tab === 'approve' && !waiting);
  document.documentElement.classList.toggle('ph-has-perms', waiting > 0);
}
// a close button at the top of a sheet that has none of its own
function closer(host) {
  if (!host || host.querySelector(':scope > .ph-close')) return;
  const b = el('button', 'ph-close'); b.type = 'button'; b.setAttribute('aria-label', tr('ui.phone.close')); b.append(icon('x'));
  b.addEventListener('click', () => showTab('office'));
  host.prepend(b);
}
function apply() {
  const on = mq.matches, was = document.documentElement.classList.contains('is-phone');
  document.documentElement.classList.toggle('is-phone', on);
  if (was && !on) { closeSheets(); tab = 'office'; }   // (a window grown past a phone's size: the desktop's own layout)
  sync();
}

export function setup() {
  mq = matchMedia(PHONE);
  bar = el('nav', 'ph-tabs'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', tr('ui.phone.tabs'));
  for (const [name, ic] of TABS) {
    const b = el('button', 'ph-tab'); b.type = 'button'; b.dataset.tab = name; b.setAttribute('role', 'tab');
    const badgeEl = el('i', 'ph-badge'); badgeEl.hidden = true;
    b.append(icon(ic), el('span', null, tr(`ui.phone.${name}`)), badgeEl);
    b.addEventListener('click', () => showTab(name));
    bar.append(b);
  }
  emptyEl = el('div', 'ph-empty'); emptyEl.hidden = true;
  emptyEl.append(icon('check'), el('b', null, tr('ui.phone.approveEmpty')), el('span', null, tr('ui.phone.approveEmptySub')));
  $('app').append(bar, emptyEl);
  for (const host of [document.querySelector('.side-left'), $('feed'), $('pop-plan'), $('pop-look')]) closer(host);
  // the counts on the tabs, and the chat closed from inside
  const watch = new MutationObserver(() => sync());
  for (const id of ['perm-stack', 'st-wait', 'chat-badge']) { const n = $(id); if (n) watch.observe(n, { childList: true, characterData: true, subtree: true, attributes: true }); }
  new MutationObserver(() => { if (!$('zchat')) return; watch.observe($('zchat'), { attributes: true, attributeFilter: ['hidden'] }); sync(); }).observe($('app'), { childList: true });
  mq.addEventListener('change', apply);
  apply();
}
