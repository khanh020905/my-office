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

/* ---------- the phone window: phones on the home network (a switch, the QR code, the PIN), approving from a phone,
   using it when you're out (a Tailscale network), and giving Claude work from the phone (Remote Control). Everything
   is switched here, on the Mac: nothing to type in a terminal. ---------- */
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
function phoneSwitch(text, on, disabled, fn) {
  const row = el('label', 'pm-approve'), cb = el('input'); cb.type = 'checkbox'; cb.checked = on; cb.disabled = disabled;
  cb.addEventListener('change', async () => { cb.disabled = true; if (!(await fn(cb.checked))) { cb.checked = !cb.checked; cb.disabled = false; } });
  row.append(cb, el('b', null, text));
  return row;
}
let tun = null, tunPoll = 0;   // the tunnel's state (GET /api/tunnel), asked again while it starts
async function loadTunnel() {
  tun = await fetch('/api/tunnel').then((r) => r.json()).catch(() => null);
  clearTimeout(tunPoll);
  if (tun && ['download', 'starting'].includes(tun.state) && !$('phone-modal').hidden) tunPoll = setTimeout(() => loadTunnel().then(renderPhone), 1500);
}
function renderPhone() {
  const body = $('pm-body'); body.replaceChildren();
  const qr = (text) => { const box = el('div', 'qr'); try { new window.QRCode(box, { text, width: 200, height: 200 }); } catch { return el('span'); } return box; };
  const lanOn = !!state.lanUrl, tunOn = !!tun?.on;
  // 1. the home network
  body.append(phoneSwitch(tr('topbar.phone.lanSwitch'), lanOn, !!state.lanFixed, async (want) => {
    const r = await post('/api/lan', { on: want }); if (!r?.ok) return false;
    state.lanUrl = r.lan; state.lanBase = r.lanBase; state.tsUrl = r.ts; state.phonePin = r.pin; state.lanFixed = r.fixed;
    renderPhone(); return true;
  }));
  if (!lanOn) body.append(el('p', 'muted pm-note', tr('topbar.phone.lanOffNote')));
  else {
    if (state.lanFixed) body.append(el('p', 'muted pm-note', tr('topbar.phone.lanFixed')));
    body.append(el('p', 'muted', tr('topbar.phone.scan')), qr(state.lanUrl));
    const at = el('div', 'pm-pin'); at.append(el('span', 'muted', tr('topbar.phone.orType')), el('b', 'url', state.lanBase)); body.append(at);
  }
  // 2. away from home: the Cloudflare tunnel (or a Tailscale network, if the Mac is on one)
  body.append(el('h4', 'pm-h', tr('topbar.phone.awayTitle')));
  body.append(phoneSwitch(tr('topbar.phone.tunSwitch'), tunOn, ['download', 'starting'].includes(tun?.state), async (want) => {
    const r = await post('/api/tunnel', { on: want }); if (!r?.ok) return false;
    tun = r; renderPhone(); if (want) loadTunnel().then(renderPhone); return true;
  }));
  if (!tunOn) body.append(el('p', 'muted pm-note', tr('topbar.phone.tunOffNote')));
  else if (tun.state === 'on' && tun.url) body.append(el('p', 'muted', tr('topbar.phone.tunOn')), qr(tun.url), el('b', 'url pm-url', tun.url), el('p', 'muted pm-note', tr('topbar.phone.tunNote')));
  else if (tun.state === 'error') body.append(el('p', 'pm-err', tr('topbar.phone.tunError', { error: tun.error || '' })));
  else body.append(el('p', 'muted pm-wait', tr(tun.state === 'download' ? 'topbar.phone.tunDownload' : 'topbar.phone.tunStarting')));
  // the Mac kept awake while it's on (the power adapter only): what that means right now
  if (tunOn && tun.awake) body.append(el('p', `pm-awake${tun.awake.ac === false ? ' is-battery' : ''}`, tr(tun.awake.ac === false ? 'topbar.phone.awakeBattery' : 'topbar.phone.awakeOn')));
  if (state.tsUrl) body.append(el('p', 'muted pm-note', tr('topbar.phone.tsOn')), el('b', 'url pm-url', state.tsUrl));
  // 3. the PIN, for either way in; a new one signs every phone out
  const pinNow = tun?.pin || state.phonePin;
  if ((lanOn || tunOn) && pinNow) {
    const pin = el('div', 'pm-pin'), again = el('button', 'btn btn--sm pm-newpin', tr('topbar.phone.newPin')); again.type = 'button'; again.title = tr('topbar.phone.newPinTitle');
    again.addEventListener('click', async () => {
      if (again.dataset.armed !== '1') { again.dataset.armed = '1'; again.textContent = tr('topbar.phone.newPinSure'); setTimeout(() => { if (again.isConnected) { again.dataset.armed = ''; again.textContent = tr('topbar.phone.newPin'); } }, 4000); return; }
      const r = await post('/api/pin', {}); if (r?.ok) { state.phonePin = r.pin; if (tun) tun.pin = r.pin; renderPhone(); }
    });
    pin.append(el('span', 'muted', tr('topbar.phone.pinLabel')), el('b', 'pm-digits', `${pinNow.slice(0, 3)} ${pinNow.slice(3)}`), again);
    body.append(el('h4', 'pm-h', tr('topbar.phone.pinTitle')), pin);
    // 4. approving from the phone: off until you turn it on here (the server only takes this switch from the Mac)
    body.append(phoneSwitch(tr('topbar.phone.approve'), !!state.phoneApprove, false, async (want) => { const r = await post('/api/phone', { approve: want }); if (!r?.ok) return false; state.phoneApprove = r.approve; renderPhone(); return true; }),
      el('p', 'muted pm-note', tr('topbar.phone.approveNote')));
  }
  // 5. giving Claude work from the phone: Claude Code's own Remote Control, on by itself in every new session if you like
  body.append(el('h4', 'pm-h', tr('topbar.phone.rcTitle')));
  if (tun) body.append(phoneSwitch(tr('topbar.phone.rcSwitch'), !!tun.rc, false, async (want) => { const r = await post('/api/rc', { on: want }); if (!r?.ok) return false; tun.rc = r.rc; renderPhone(); return true; }));
  body.append(el('p', 'muted pm-note', tr(tun?.rc ? 'topbar.phone.rcOn' : 'topbar.phone.rcText')));
  // "Giao việc" from the group chat on a phone: a new Claude Code run on this Mac (server/tasks.mjs), allowed here only
  if (tun) body.append(phoneSwitch(tr('topbar.phone.tasksSwitch'), !!tun.tasks, false, async (want) => { const r = await post('/api/tasks/allow', { on: want }); if (!r?.ok) return false; tun.tasks = r.allowed; renderPhone(); return true; }),
    el('p', 'muted pm-note', tr('topbar.phone.tasksNote')));
}

export function setup() {
  /* ---------- phone modal, bell, night, closing ---------- */
  state.lanUrl = null; state.lanBase = null; state.phonePin = null;
  for (const id of ['btn-phone', 'btn-phone-top']) $(id)?.addEventListener('click', () => { $('phone-modal').hidden = false; renderPhone(); loadTunnel().then(renderPhone); });
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
