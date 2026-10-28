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

export function setup() {
  /* ---------- phone modal, bell, night, closing ---------- */
  state.lanUrl = null; state.lanBase = null; state.phonePin = null;
  $('btn-phone').addEventListener('click', () => {
    const body = $('pm-body'); body.replaceChildren();
    if (state.lanUrl) {
      const box = el('div', 'qr');
      body.append(el('p', 'muted', tr('topbar.phone.scan')), box);
      try { new window.QRCode(box, { text: state.lanUrl, width: 200, height: 200 }); } catch { box.remove(); }
      if (state.phonePin) {
        const pin = el('div', 'pm-pin');
        pin.append(el('span', 'muted', tr('topbar.phone.orType')), el('b', 'url', state.lanBase), el('span', 'muted', tr('topbar.phone.thenPin')), el('b', 'pm-digits', `${state.phonePin.slice(0, 3)} ${state.phonePin.slice(3)}`));
        body.append(pin, el('p', 'muted pm-note', tr('topbar.phone.viewOnly')));
      }
    } else {
      body.append(el('p', 'muted', tr('topbar.phone.localOnly')),
        el('pre', 'pm-cmd', 'node bin/cli.mjs install --service --lan'),
        el('p', 'muted pm-note', tr('topbar.phone.lanNote')));
    }
    $('phone-modal').hidden = false;
  });
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
