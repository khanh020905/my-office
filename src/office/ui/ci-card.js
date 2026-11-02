// "Sửa luôn" (server/index.mjs ciCard / ciFix): the card in the group chat when a repository's CI goes red, from the
// session working in it. Its button hands Claude the failing run: a note into the conversation while it works, else a
// message that carries the conversation on. Then it says what was done, and when the CI is green again.
import { STATIC, el, short } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { sessions, dn } from '../people/workers.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (url, body) => fetch(`${url}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);

/** The card for a 'ci' message: redraw() draws it again (the chat window's own). */
export function ciCard(m, redraw) {
  const C = m.ci || {}, red = C.state === 'red';
  const box = el('div', `zc-ci is-${C.state || 'red'}`), head = el('div', 'zc-ci-h');
  head.append(el('i', 'zc-ci-ic', red ? '🔴' : C.state === 'green' ? '🟢' : '⚪'), el('b', null, tr('chat.ci.title')));
  box.append(head, el('p', 'zc-ci-t', tr('chat.ci.line', { wf: short(C.wf || 'CI', 40), repo: C.repo || '', branch: C.branch || '' })));
  if (C.url) {
    const a = el('a', 'zc-ci-link', tr('chat.ci.open')); a.href = C.url; a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', (e) => e.stopPropagation());   // (not the bubble's own tap, which opens its reactions)
    box.append(a);
  }
  const note = C.state === 'green' ? tr('chat.ci.green') : C.state === 'over' ? tr('chat.ci.over') : C.fix ? tr(`chat.ci.${C.fix}`) : '';
  if (note) box.append(el('small', `zc-ci-note${C.state === 'green' || C.fix ? ' is-ok' : ''}`, note));
  if (!red || C.fix || DEMO) return box;
  const fix = el('button', 'zc-work-btn is-ok zc-ci-fix', tr('chat.ci.fix')); fix.type = 'button';
  fix.addEventListener('click', async (e) => {
    e.stopPropagation();
    fix.disabled = true;
    const r = await post('/api/ci', { id: m.id });
    if (!r?.ok) { fix.disabled = false; toast(r?.message || tr('drawer.unreachable'), 7000); return; }
    m.ci = { ...C, fix: r.how }; redraw?.(m);   // (the server says so too, to every page)
  });
  const acts = el('div', 'zc-ci-acts'); acts.append(fix);
  box.append(acts);
  return box;
}
/** One line for the chat's small preview while its window is shut. */
export function ciPeek(m) {
  const C = m.ci || {}, s = sessions.get(C.sess);
  return `🔴 ${tr('chat.ci.line', { wf: short(C.wf || 'CI', 30), repo: C.repo || (s && dn(s)) || '', branch: C.branch || '' })}`;
}
