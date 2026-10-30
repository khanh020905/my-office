// Phone modal, notifications, the night switch.
import { state } from '../core/state.js';
import { $, el, replay, small } from '../core/env.js';
import { dn } from '../people/workers.js';
import { night, setNight } from '../world/room-update.js';
import { toast } from './activity.js';
import { closeSession, drM, drS, openSession } from './session-drawer.js';
import { closeMac } from './mac-drawer.js';
import { closePlace, plcState } from '../interact/place-cards.js';
import { popLook, togglePlan, togglePop } from './settings.js';
import { exitFp, fp } from '../interact/first-person.js';
import { closeTimeline } from '../replay/timeline.js';
import { t as tr } from '../../i18n/index.js';

export let bellOn = false;
export function renderBell() { $('btn-bell').setAttribute('aria-pressed', String(bellOn)); }
export function notifyWait(s, e) {
  if (replay.on) return;
  if (!bellOn || document.visibilityState === 'visible' && document.hasFocus()) return;
  try { const n = new Notification(tr('topbar.waitTitle', { name: dn(s) }), { body: e.label || tr('topbar.waitBody'), tag: 'wait-' + s.id }); n.onclick = () => { window.focus(); openSession(s.id); n.close(); }; } catch { /* unsupported */ }
}

/* ---------- the phone window: the two ways in (the home network, or anywhere through the Cloudflare tunnel) as tabs, each
   with its switch, its QR code and address; the PIN; and what phones may do (approve, give Claude work, Remote Control),
   each a switch with a line on what it means. Everything is switched here, on the Mac: nothing to type in a terminal. ---------- */
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
// a row with a switch: what it is (bold), a line on what it means, the switch on the right
function phoneSwitch(text, on, disabled, fn, desc = '') {
  const row = el('label', 'pm-approve pm-toggle'), cb = el('input'), words = el('span', 'pm-tt');
  cb.type = 'checkbox'; cb.checked = on; cb.disabled = disabled; cb.setAttribute('role', 'switch');
  cb.addEventListener('change', async () => { cb.disabled = true; if (!(await fn(cb.checked))) { cb.checked = !cb.checked; cb.disabled = false; } });
  words.append(el('b', null, text)); if (desc) words.append(el('small', null, desc));
  row.append(words, cb);
  return row;
}
// 123 456, 1234 5678, 123 4567, 123 456 7890
const pinFmt = (p) => (p.length % 4 === 0 && p.length % 3 ? p.match(/\d{4}/g).join(' ') : p.replace(/\d{3}(?=\d{2})/g, '$& '));
let tun = null, tunPoll = 0;   // the tunnel's state (GET /api/tunnel), asked again while it starts
let pmTab = null;              // the way in shown: 'home' | 'away' (null: the tunnel's if it is on)
async function loadTunnel() {
  tun = await fetch('/api/tunnel').then((r) => r.json()).catch(() => null);
  clearTimeout(tunPoll);
  if (tun && ['download', 'starting'].includes(tun.state) && !$('phone-modal').hidden) tunPoll = setTimeout(() => loadTunnel().then(renderPhone), 1500);
}
// an address to open: as text you can select, and a button that copies it
function urlRow(url) {
  const row = el('div', 'pm-urlrow'), copy = el('button', 'btn btn--sm', tr('topbar.phone.copy')); copy.type = 'button';
  copy.addEventListener('click', () => navigator.clipboard?.writeText(url).then(() => toast(tr('topbar.phone.copied')), () => {}));
  row.append(el('b', 'url pm-url', url), copy);
  return row;
}
export function renderPhone() {
  const body = $('pm-body'); body.replaceChildren();
  if (!state.isLocal) { phoneSide(body); return; }
  const qr = (text) => { const box = el('div', 'qr'); try { new window.QRCode(box, { text, width: 132, height: 132 }); } catch { return el('span'); } return box; };
  // the code beside the address and what to do with it
  const where = (code, shown, lead, foot) => { const row = el('div', 'pm-where'), info = el('div', 'pm-info'); info.append(el('p', 'muted', lead), urlRow(shown)); if (foot) info.append(el('p', 'muted pm-note', foot)); row.append(qr(code), info); return row; };
  const lanOn = !!state.lanUrl, tunOn = !!tun?.on, tab = pmTab || (tunOn ? 'away' : 'home');
  // 1. the two ways in, as tabs (a dot: on)
  const tabs = el('div', 'pm-tabs'); tabs.setAttribute('role', 'tablist');
  for (const [k, on] of [['home', lanOn], ['away', tunOn]]) {
    const b = el('button', `pm-tab${k === tab ? ' is-sel' : ''}`); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === tab));
    b.append(el('span', null, tr(k === 'home' ? 'topbar.phone.tabHome' : 'topbar.phone.tabAway')), el('i', `pm-dot${on ? ' is-on' : ''}`, tr(on ? 'topbar.phone.isOn' : 'topbar.phone.isOff')));
    b.addEventListener('click', () => { pmTab = k; renderPhone(); });
    tabs.append(b);
  }
  const conn = el('div', 'pm-conn');
  body.append(tabs, conn);
  if (tab === 'home') {   // the home network: the Mac's own addresses (and its Tailscale one)
    conn.append(phoneSwitch(tr('topbar.phone.lanSwitch'), lanOn, !!state.lanFixed, async (want) => {
      const r = await post('/api/lan', { on: want }); if (!r?.ok) return false;
      state.lanUrl = r.lan; state.lanBase = r.lanBase; state.tsUrl = r.ts; state.phonePin = r.pin; state.lanFixed = r.fixed;
      renderPhone(); return true;
    }));
    if (!lanOn) conn.append(el('p', 'muted pm-note', tr('topbar.phone.lanOffNote')));
    else {
      if (state.lanFixed) conn.append(el('p', 'muted pm-note', tr('topbar.phone.lanFixed')));
      conn.append(where(state.lanUrl, state.lanBase, tr('topbar.phone.scan')));
      if (state.tsUrl) conn.append(el('p', 'muted pm-note', tr('topbar.phone.tsOn')), urlRow(state.tsUrl));
    }
  } else {                // anywhere: the Cloudflare tunnel
    conn.append(phoneSwitch(tr('topbar.phone.tunSwitch'), tunOn, ['download', 'starting'].includes(tun?.state), async (want) => {
      const r = await post('/api/tunnel', { on: want }); if (!r?.ok) return false;
      tun = r; renderPhone(); if (want) loadTunnel().then(renderPhone); return true;
    }));
    if (!tunOn) conn.append(el('p', 'muted pm-note', tr('topbar.phone.tunOffNote')));
    else if (tun.state === 'on' && tun.url) conn.append(where(tun.url, tun.url, tr('topbar.phone.tunOn'), tr('topbar.phone.tunNote')));
    else if (tun.state === 'error') conn.append(el('p', 'pm-err', tr('topbar.phone.tunError', { error: tun.error || '' })));
    else conn.append(el('p', 'muted pm-wait', tr(tun.state === 'download' ? 'topbar.phone.tunDownload' : 'topbar.phone.tunStarting')));
    // the Mac kept awake while it's on (the power adapter only): what that means right now
    if (tunOn && tun.awake) conn.append(el('p', `pm-awake${tun.awake.ac === false ? ' is-battery' : ''}`, tr(tun.awake.ac === false ? 'topbar.phone.awakeBattery' : 'topbar.phone.awakeOn')));
  }
  // 2. the PIN, for either way in; a new one signs every phone out
  const pinNow = tun?.pin || state.phonePin;
  if ((lanOn || tunOn) && pinNow) {
    const box = el('div', 'pm-pinbox'), pin = el('div', 'pm-pin'), again = el('button', 'btn btn--sm pm-newpin', tr('topbar.phone.newPin')); again.type = 'button'; again.title = tr('topbar.phone.newPinTitle');
    again.addEventListener('click', async () => {
      if (again.dataset.armed !== '1') { again.dataset.armed = '1'; again.textContent = tr('topbar.phone.newPinSure'); setTimeout(() => { if (again.isConnected) { again.dataset.armed = ''; again.textContent = tr('topbar.phone.newPin'); } }, 4000); return; }
      const r = await post('/api/pin', {}); if (r?.ok) { state.phonePin = r.pin; if (tun) tun.pin = r.pin; renderPhone(); }
    });
    // your own (6–10 digits; the server turns down one like 000000 or 123456)
    const own = el('button', 'btn btn--sm', tr('topbar.phone.setPin')); own.type = 'button';
    own.addEventListener('click', () => {
      const form = el('form', 'pm-pin pm-setpin'), field = el('input', 'pm-pinin'), err = el('p', 'pm-err');
      field.inputMode = 'numeric'; field.maxLength = 10; field.autocomplete = 'off'; field.placeholder = tr('topbar.phone.setPinHint'); field.setAttribute('aria-label', tr('topbar.phone.setPin'));
      field.addEventListener('input', () => { field.value = field.value.replace(/\D/g, '').slice(0, 10); });
      field.addEventListener('keydown', (e) => e.stopPropagation());
      const save = el('button', 'btn btn--sm btn--confirm', tr('topbar.phone.save')), cancel = el('button', 'btn btn--sm', tr('topbar.phone.cancel'));
      save.type = 'submit'; cancel.type = 'button'; cancel.addEventListener('click', renderPhone); err.hidden = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); save.disabled = true;
        const r = await post('/api/pin', { pin: field.value }); save.disabled = false;
        if (r?.ok) { state.phonePin = r.pin; if (tun) tun.pin = r.pin; renderPhone(); toast(tr('topbar.phone.pinSaved')); return; }
        err.textContent = r?.message || tr('drawer.unreachable'); err.hidden = false; field.focus();
      });
      form.append(field, save, cancel); pin.replaceWith(form); form.after(err); field.focus();
    });
    const btns = el('span', 'pm-pinacts'); btns.append(again, own);
    pin.append(el('span', 'pm-pinlabel', tr('topbar.phone.pinTitle')), el('b', 'pm-digits', pinFmt(pinNow)), btns);
    box.append(pin, el('p', 'muted pm-note', tr('topbar.phone.pinNote')));
    body.append(box);
  }
  // 3. what phones may do: each off until switched on here (the server takes these switches from the Mac only)
  const list = el('div', 'pm-list');
  list.append(phoneSwitch(tr('topbar.phone.approve'), !!state.phoneApprove, false, async (want) => { const r = await post('/api/phone', { approve: want }); if (!r?.ok) return false; state.phoneApprove = r.approve; renderPhone(); return true; }, tr('topbar.phone.approveShort')));
  // "Giao việc" from the group chat on a phone: a new Claude Code run on this Mac (server/tasks.mjs)
  if (tun) list.append(phoneSwitch(tr('topbar.phone.tasksSwitch'), !!tun.tasks, false, async (want) => { const r = await post('/api/tasks/allow', { on: want }); if (!r?.ok) return false; tun.tasks = r.allowed; renderPhone(); return true; }, tr('topbar.phone.tasksShort')));
  // Claude Code's own Remote Control, on by itself in every new session if you like
  if (tun) list.append(phoneSwitch(tr('topbar.phone.rcSwitch'), !!tun.rc, false, async (want) => { const r = await post('/api/rc', { on: want }); if (!r?.ok) return false; tun.rc = r.rc; renderPhone(); return true; }, tr(tun.rc ? 'topbar.phone.rcShortOn' : 'topbar.phone.rcShort')));
  body.append(el('h4', 'pm-h', tr('topbar.phone.mayTitle')), list);
}

// The same window on a phone: changing the PIN (with the one it has now), and what the Mac allows phones (switched there)
function phoneSide(body) {
  const form = el('form', 'pm-setpin pm-side'), now = el('input', 'pm-pinin'), next = el('input', 'pm-pinin'), err = el('p', 'pm-err');
  for (const [f, ph] of [[now, 'topbar.phone.pinCurrent'], [next, 'topbar.phone.pinNew']]) {
    f.inputMode = 'numeric'; f.maxLength = 10; f.autocomplete = 'off'; f.placeholder = tr(ph); f.setAttribute('aria-label', tr(ph));
    f.addEventListener('input', () => { f.value = f.value.replace(/\D/g, '').slice(0, 10); });
    f.addEventListener('keydown', (e) => e.stopPropagation());
  }
  now.type = 'password';
  const save = el('button', 'btn btn--sm btn--confirm', tr('topbar.phone.save')); save.type = 'submit'; err.hidden = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); save.disabled = true;
    const r = await post('/api/pin', { current: now.value, pin: next.value }); save.disabled = false;
    if (r?.ok) { renderPhone(); toast(tr('topbar.phone.pinChanged')); return; }
    err.textContent = r?.message || tr('drawer.unreachable'); err.hidden = false;
  });
  form.append(now, next, save);
  body.append(el('h4', 'pm-h', tr('topbar.phone.pinChangeTitle')), form, err, el('p', 'muted pm-note', tr('topbar.phone.pinPhoneNote')));
  // what the Mac allows: each on, or off with where to turn it on
  body.append(el('h4', 'pm-h', tr('topbar.phone.macAllows')));
  for (const [on, what] of [[state.phoneApprove, 'topbar.phone.approve'], [state.phoneTasks, 'topbar.phone.tasksSwitch']]) {
    body.append(el('p', `pm-allow${on ? ' is-on' : ''}`, tr(on ? 'topbar.phone.allowOn' : 'topbar.phone.allowOff', { what: tr(what) })));
  }
}

export function setup() {
  /* ---------- phone modal, bell, night, closing ---------- */
  state.lanUrl = null; state.lanBase = null; state.phonePin = null;
  for (const id of ['btn-phone', 'btn-phone-top']) $(id)?.addEventListener('click', () => { $('phone-modal').hidden = false; renderPhone(); if (state.isLocal) loadTunnel().then(renderPhone); });
  try { bellOn = localStorage.getItem('office-bell') === '1' && Notification.permission === 'granted'; } catch { /* storage blocked */ }
  $('btn-bell').addEventListener('click', async () => {
    if (!bellOn && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { toast(tr('topbar.bellBlocked')); return; } }
    bellOn = !bellOn; try { localStorage.setItem('office-bell', bellOn ? '1' : '0'); } catch { /* ignore */ }
    renderBell(); toast(tr(bellOn ? 'topbar.bellOn' : 'topbar.bellOff'));
  });
  $('btn-night').addEventListener('click', () => { state.nightManual = true; setNight(!night); });
  document.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-close]'); if (!c) return;
    if (c.closest('#dr-session')) closeSession(); else if (c.closest('#dr-mac')) closeMac(); else if (c.closest('#phone-modal')) $('phone-modal').hidden = true;
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('tl').hidden) closeTimeline(); else if (plcState.id) closePlace(); else if (!popLook.hidden) togglePop(false); else if (!$('pop-plan').hidden) togglePlan(false); else if (!$('phone-modal').hidden) $('phone-modal').hidden = true; else if (!drS.hidden) closeSession(); else if (!drM.hidden) closeMac(); else if (fp.on) exitFp();
  });
  $('feed-toggle').addEventListener('click', () => { if (!small.matches) return; const open = $('feed').classList.toggle('feed--open'); $('feed-toggle').setAttribute('aria-expanded', String(open)); });
}
