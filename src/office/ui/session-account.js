// "Change account" in a session's drawer (on this computer only): the accounts of the plan card, each with what it has
// left. A click moves the conversation (POST /api/accounts/move, moveSession in server/index.mjs): one in the editor
// carries on on that account as soon as you write in it again; one in a terminal gets the command that resumes it
// there, to copy. A moved one says where it went until it starts again.
import { state } from '../core/state.js';
import { el, hhmm } from '../core/env.js';
import { icon } from './icons.js';
import { toast } from './activity.js';
import { acctName, codeBox, resetText } from './mac-drawer.js';
import { DEMO } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

let openFor = null, moving = null, cmd = null;   // the session whose list is open; the one being moved; a terminal's command
const outWhen = (until) => (new Date(until).toDateString() === new Date().toDateString() ? hhmm(until) : resetText(until));
function accounts() {
  const l = state.limits; if (!l) return [];
  const five = (ws) => (ws || []).find((w) => w.key === 'session')?.pct;
  return [{ slug: '', label: l.label, until: l.until, pct: five(l.windows) ?? l.five?.pct },
    ...(l.others || []).map((o) => ({ slug: o.name, label: o.label, until: o.until, pct: five(o.windows) }))];
}
async function move(s, slug, redraw) {
  moving = s.id; openFor = null; redraw();
  const r = await fetch('/api/accounts/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, to: slug }) })
    .then((x) => x.json()).catch(() => ({ ok: false, message: tr('drawer.unreachable') }));
  moving = null; cmd = r.terminal ? { id: s.id, text: r.cmd } : null;
  toast(r.message || tr('drawer.acct.failed'), r.ok ? 9000 : 6000);
  redraw();
}
// the drawer's buttons and notes for it (redraw: the drawer draws its actions again)
export function acctActions(s, redraw) {
  const list = accounts();
  if (DEMO || !state.isLocal || list.length < 2) return [];
  if (s.moved) return [el('p', 'dr-note', tr('drawer.acct.moved', { to: s.moved.to }))];
  if (!s.pid) return [];
  const resting = s.status === 'rest', b = el('button', 'btn btn--sm'); b.type = 'button';
  b.append(icon('users'), tr(moving === s.id ? 'drawer.acct.moving' : 'drawer.acct.label'));
  b.title = tr(resting ? 'drawer.acct.title' : 'drawer.acct.wait'); b.disabled = !!moving || !resting;
  b.setAttribute('aria-expanded', String(openFor === s.id));
  b.addEventListener('click', () => { openFor = openFor === s.id ? null : s.id; redraw(); });
  const out = [b];
  if (openFor === s.id && resting) {
    const menu = el('div', 'acct-menu'), now = Date.now();
    for (const a of list) {
      const cur = a.slug === (s.acct || ''), full = a.until > now, o = el('button', 'acct-opt'); o.type = 'button'; o.disabled = cur || full;
      o.append(el('b', null, acctName(a.slug, a.label)),
        el('small', null, cur ? tr('drawer.acct.current') : full ? tr('mac.plan.out', { when: outWhen(a.until) }) : a.pct != null ? tr('drawer.acct.used', { pct: Math.round(a.pct) }) : ''));
      o.addEventListener('click', () => move(s, a.slug, redraw));
      menu.append(o);
    }
    out.push(menu, el('p', 'dr-note', tr(s.entry === 'claude-vscode' ? 'drawer.acct.noteEditor' : 'drawer.acct.noteTerminal')));
  }
  if (cmd?.id === s.id) out.push(codeBox(cmd.text));
  return out;
}
