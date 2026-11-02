// "Hộp lệnh bị chặn" (server/index.mjs onDenied): the card in the group chat for a call auto mode refused: who, what,
// why. While Claude Code waits (an office page had focus), "Let Claude retry" or "Keep it refused", with the seconds
// left; after, what was decided. The command can always be copied, to run it yourself.
import { STATIC, el, short } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { sessions, dn } from '../people/workers.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (url, body) => fetch(`${url}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);

/** The card for a 'deny' message: redraw() draws it again (the chat window's own). */
export function denyCard(m, redraw) {
  const D = m.deny || {}, s = sessions.get(D.sess), name = (s && dn(s)) || m.name || '';
  const held = D.state === 'held' && D.until > Date.now();
  const box = el('div', `zc-deny is-${held ? 'held' : D.state || 'kept'}`), head = el('div', 'zc-deny-h');
  head.append(el('i', 'zc-deny-ic', '🛑'), el('b', null, tr('chat.deny.title')));
  const line = el('p', 'zc-deny-t'); line.append(`${tr('chat.deny.line', { name })} `, el('code', null, short(D.shell ? D.cmd : D.label || D.cmd, 160)));
  box.append(head, line);
  if (D.reason) box.append(el('small', 'zc-deny-why', tr('chat.deny.why', { reason: D.reason })));
  const acts = el('div', 'zc-deny-acts');
  if (held && !DEMO) {
    const left = el('small', 'zc-deny-left'), tick = () => { const n = Math.max(0, Math.ceil((D.until - Date.now()) / 1000)); left.textContent = tr('chat.deny.wait', { n }); if (n > 0 && left.isConnected) setTimeout(tick, 1000); else if (!n) redraw?.(m); };
    const answer = (op) => async (e) => {
      e.stopPropagation();
      for (const b of acts.querySelectorAll('button')) b.disabled = true;
      const r = await post('/api/denied', { id: m.id, op });
      if (!r?.ok) { toast(r?.message || tr('drawer.unreachable'), 6000); redraw?.(m); }
    };
    const retry = el('button', 'zc-work-btn is-ok', tr('chat.deny.retry')), keep = el('button', 'zc-work-btn is-no', tr('chat.deny.keep'));
    retry.type = keep.type = 'button'; retry.addEventListener('click', answer('retry')); keep.addEventListener('click', answer('keep'));
    acts.append(retry, keep); box.append(left); tick();
  } else box.append(el('small', `zc-deny-note${D.state === 'retry' ? ' is-ok' : ''}`, D.state === 'retry' ? tr('chat.deny.retried') : D.retry === false ? tr('chat.deny.noRetry') : tr('chat.deny.kept')));
  const copy = el('button', 'zc-work-btn', tr('chat.deny.copy')); copy.type = 'button';
  copy.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard?.writeText(D.cmd || '').then(() => toast(tr('chat.deny.copied'), 2500)).catch(() => {}); });
  acts.append(copy);
  box.append(acts);
  return box;
}
/** One line for the chat's small preview while its window is shut. */
export function denyPeek(m) {
  const D = m.deny || {};
  return `🛑 ${tr('chat.deny.title')}: ${short(D.shell ? D.cmd : D.label || D.cmd, 50)}`;
}
