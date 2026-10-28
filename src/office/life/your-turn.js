// "Your turn": sessions that finished or wait for you.
import { state } from '../core/state.js';
import { replay, short } from '../core/env.js';
import { dn, sessions } from '../people/workers.js';
import { queueUi, renderHud, toast } from '../ui/activity.js';
import { openSession } from '../ui/session-drawer.js';
import { bellOn } from '../ui/topbar.js';
import { fp } from '../interact/first-person.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- "your turn": a session finished while you were away, or waits for you ---------- */
export const unseenDone = new Set();
export function onTurnDone(s) {
  if (replay.on) return;
  sfx.play('turn');
  const away = !(document.visibilityState === 'visible' && document.hasFocus());
  if (!away || state.selectedId === s.id) return;
  unseenDone.add(s.id); renderHud(); queueUi();
  if (bellOn) try { const n = new Notification(tr('incident.turn.done', { name: dn(s) }), { body: s.lastReply ? short(s.lastReply, 160) : tr('incident.turn.body'), tag: 'done-' + s.id }); n.onclick = () => { window.focus(); openSession(s.id); n.close(); }; } catch { /* unsupported */ }
}
function nextNeedingYou() {
  const list = [...sessions.values()];
  const waiting = list.filter((s) => s.status === 'wait').sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
  const done = list.filter((s) => unseenDone.has(s.id)).sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
  const s = waiting[0] || done[0];
  if (!s) { toast(tr('incident.turn.none')); return; }
  unseenDone.delete(s.id); openSession(s.id);
}

export function setup() {
  addEventListener('focus', () => setTimeout(() => { if (document.hasFocus() && unseenDone.size) { unseenDone.clear(); renderHud(); queueUi(); } }, 1500));
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyN' || e.metaKey || e.ctrlKey || e.altKey || fp.on || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    nextNeedingYou();
  });
}
