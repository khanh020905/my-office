// Settings popover: backdrop, floor plan, look, time, toggles.
import { state } from '../core/state.js';
import { $, LAYOUT, PLANS, STATIC } from '../core/env.js';
import { bubbleText } from './event-text.js';
import { labels } from '../scene/renderer.js';
import { subs, workers } from '../people/workers.js';
import { isNightHour, night, setNight } from '../world/room-update.js';
import { queueUi, renderFeed, toast } from './activity.js';
import { renderChat, renderSessionHead, tab } from './session-drawer.js';
import { renderLimits } from './mac-drawer.js';
import { renderAi } from './ai-accounts.js';
import { stickyNotes } from './whiteboard.js';
import { setLook } from './look-switch.js';
import { sfx } from '../audio/sfx.js';
import { reportPresence } from './permissions.js';
import { setScene } from '../world/backdrops/index.js';
import { TOKEN } from '../net/live.js';
import { onQualityChange, quality, setQuality } from '../scene/quality.js';
import { drawPortraits } from './portraits.js';
import { DEFAULT_LANG, t as tr, lang } from '../../i18n/index.js';

export let popLook;
let btnLook;
// switching the floor plan rebuilds the whole office, so the page reloads (sessions come back from the server)
function setLayout(l) {
  if (l === LAYOUT || !PLANS.includes(l)) return;
  try { localStorage.setItem('office-layout', l); } catch { /* storage blocked */ }
  toast(tr({ pro: 'settings.toPro', hq: 'settings.toHq', cozy: 'settings.toCozy' }[l]));
  const u = new URL(location.href); u.searchParams.delete('layout'); setTimeout(() => location.replace(u), 250);
}
// the language belongs to the whole office (the server writes some of the words too): save it there, then every open page
// reloads in it. Without a server to save it (the static demo) it goes in the address instead.
function setLang(l) {
  if (l === lang() && !new URLSearchParams(location.search).has('lang')) return;
  toast(tr('settings.switchingLang'));
  // the online demo is one static folder per language: English at the site's root, the others under /<lang>/
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- each language is its own static export, not a route of this app
  if (STATIC) { location.assign(`${process.env.NEXT_PUBLIC_SITE_ROOT || ''}/${l === DEFAULT_LANG ? '' : `${l}/`}${location.search}`); return; }
  const u = new URL(location.href); u.searchParams.delete('lang');
  const viaUrl = () => { u.searchParams.set('lang', l); location.replace(u); };
  fetch(`/api/prefs${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) })
    .then((r) => (r.ok ? location.replace(u) : viaUrl())).catch(viaUrl);
}
// the four tabs of Settings; the last one opened comes back next time
const TABS = ['office', 'people', 'display', 'more'];
let tabNow = 'office';
function showTab(k, focus = false) {
  if (!TABS.includes(k)) k = 'office';
  tabNow = k;
  for (const b of popLook.querySelectorAll('[data-st-tab]')) { const on = b.dataset.stTab === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const p of popLook.querySelectorAll('[data-st-panel]')) p.hidden = p.dataset.stPanel !== k;
  try { localStorage.setItem('office-settings-tab', k); } catch { /* storage blocked */ }
  if (k === 'people') requestAnimationFrame(drawPortraits);   // drawn once, the first time
}
export function togglePop(open = popLook.hidden) { popLook.hidden = !open; btnLook.setAttribute('aria-expanded', String(open)); if (open) { togglePlan(false); showTab(tabNow); } }
let popPlan;
let btnPlan;
export function togglePlan(open = popPlan.hidden) { popPlan.hidden = !open; btnPlan.setAttribute('aria-expanded', String(open)); if (open) { togglePop(false); renderLimits(); renderAi(); } }
function setStreamer(v) {
  state.streamer = v; document.body.classList.toggle('is-stream', v); state.boardDirty = true; for (const n of stickyNotes) if (n) n.key = '';
  try { localStorage.setItem('office-stream', v ? 'on' : 'off'); } catch { /* storage blocked */ }
  for (const w of [...workers.values(), ...subs.values()]) if (w.lastSay) { w.sayKey = ''; w.say(w.lastSay.type, w.lastSay.e ? bubbleText(w.lastSay.e) : w.lastSay.text, w.lastSay.kind); }
  queueUi(); renderFeed(); if (state.selectedId) { renderSessionHead(); if (tab === 'chat') renderChat(false); }
}
function setToggle(k, v) {
  if (k === 'sound') sfx.set(v);
  if (k === 'autocam') { state.camAuto = v; try { localStorage.setItem('office-autocam', v ? 'on' : 'off'); } catch { /* storage blocked */ } }
  if (k === 'perm') { state.permOn = v; try { localStorage.setItem('office-perm', v ? 'on' : 'off'); } catch { /* storage blocked */ } reportPresence(); }
  if (k === 'stream') setStreamer(v);
  if (k === 'coach') { try { localStorage.setItem('office-coach', v ? 'on' : 'off'); } catch { /* storage blocked */ } }   // (the chat's prompt helper reads it as you type)
  if (k === 'drill') { try { localStorage.setItem('office-drill', v ? 'on' : 'off'); } catch { /* storage blocked */ } }   // (life/drill.js reads it when the day comes)
  if (k === 'zones') { state.zonesOn = v; try { localStorage.setItem('office-zones', v ? 'on' : 'off'); } catch { /* storage blocked */ } }
  if (k === 'season') {   // decorations are built when the page loads
    try { localStorage.setItem('office-season', v ? 'on' : 'off'); } catch { /* storage blocked */ }
    toast(tr(v ? 'settings.seasonOn' : 'settings.seasonOff')); setTimeout(() => location.reload(), 300);
  }
  syncToggles();
}
export function syncToggles() {
  let seasonOn = true, coachOn = true, drillOn = true; try { seasonOn = localStorage.getItem('office-season') !== 'off'; coachOn = localStorage.getItem('office-coach') !== 'off'; drillOn = localStorage.getItem('office-drill') !== 'off'; } catch { /* storage blocked */ }
  const val = { sound: sfx.on, autocam: state.camAuto, perm: state.permOn, stream: state.streamer, zones: state.zonesOn, season: seasonOn, coach: coachOn, drill: drillOn };
  labels.domElement.classList.toggle('show-zones', state.zonesOn);
  for (const b of document.querySelectorAll('[data-tgl]')) b.setAttribute('aria-checked', String(!!val[b.dataset.tgl]));
}
export function setTimeMode(m) { if (m === 'auto') { state.nightManual = false; setNight(isNightHour()); } else { state.nightManual = true; setNight(m === 'night'); } }
export function syncTimeBtns() { const m = state.nightManual ? (night ? 'night' : 'day') : 'auto'; for (const b of document.querySelectorAll('[data-time]')) b.setAttribute('aria-pressed', String(b.dataset.time === m)); }

export function setup() {
  /* ---------- appearance popover: backdrop, character look, time of day ---------- */
  popLook = $('pop-look'); btnLook = $('btn-look');
  for (const b of document.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === LAYOUT));
  btnLook.addEventListener('click', (e) => { e.stopPropagation(); togglePop(); });
  try { tabNow = localStorage.getItem('office-settings-tab') || 'office'; } catch { /* storage blocked */ }
  // tabs by keyboard: left / right / Home / End; Esc closes the panel
  popLook.querySelector('.st-tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tabNow), next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault(); showTab(TABS[(next + TABS.length) % TABS.length], true);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popLook.hidden) { togglePop(false); btnLook.focus(); } });
  document.addEventListener('click', (e) => { if (!popLook.hidden && !e.target.closest('#pop-look, #btn-look')) togglePop(false); });
  // the plan popover, opened from its pill
  popPlan = $('pop-plan'); btnPlan = $('btn-plan');
  btnPlan.addEventListener('click', (e) => { e.stopPropagation(); togglePlan(); });
  // (a click on something the card just replaced (a step of adding an account) isn't a click outside it)
  document.addEventListener('click', (e) => { if (!popPlan.hidden && e.target.isConnected && !e.target.closest('#pop-plan, #btn-plan')) togglePlan(false); });
  popLook.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-st-tab]'); if (tb) { showTab(tb.dataset.stTab); return; }
    if (e.target.closest('#st-close')) { togglePop(false); btnLook.focus(); return; }
    const sc = e.target.closest('[data-scene]'); if (sc) { setScene(sc.dataset.scene); return; }
    const lk = e.target.closest('[data-look]'); if (lk) { setLook(lk.dataset.look); return; }
    const ly = e.target.closest('[data-layout]'); if (ly) { setLayout(ly.dataset.layout); return; }
    const lg = e.target.closest('[data-lang]'); if (lg) { setLang(lg.dataset.lang); return; }
    const tm = e.target.closest('[data-time]'); if (tm) { setTimeMode(tm.dataset.time); return; }
    const qb = e.target.closest('[data-quality]'); if (qb) { setQuality(qb.dataset.quality); return; }
    const tg = e.target.closest('[data-tgl]'); if (tg) setToggle(tg.dataset.tgl, tg.getAttribute('aria-checked') !== 'true');
  });
  document.body.classList.toggle('is-stream', state.streamer);
  // graphics: the picked button, and which level Auto is using now
  const syncQuality = () => {
    for (const b of document.querySelectorAll('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === quality.choice));
    $('q-note').textContent = tr('settings.qNow', { level: tr(`settings.q.${quality.level}`) });
  };
  onQualityChange(syncQuality);   // Auto stepping down shows here too
}
