// Approve / deny cards and Claude's questions.
import { state } from '../core/state.js';
import { dangerKey } from '../../shared/danger.js';
import { $, STATIC, el } from '../core/env.js';
import { icon } from './icons.js';
import { colorOf, dn, sessions, workers } from '../people/workers.js';
import { toast } from './activity.js';
import { mdBlocks, openWindowOf } from './session-drawer.js';
import { autoCam, panTo } from './camera-bar.js';
import { fp } from '../interact/first-person.js';
import { TOKEN } from '../net/live.js';
import { sfx } from '../audio/sfx.js';
import { DEMO } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- approve / deny: held permission requests appear as cards over the office ---------- */
export const perms = new Map();
let PAGE_ID;
export function reportPresence() {
  if (STATIC) return;   // the online demo has no server to tell
  const focused = !DEMO && state.permOn && document.visibilityState === 'visible' && document.hasFocus();
  fetch(`/api/presence${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE_ID, focused }), keepalive: true }).catch(() => {});
}
// a risky shell command (src/shared/danger.js): a red warning, a second click, no "always"
const dangerOf = (p) => { const k = dangerKey(p); return k ? tr(`perm.danger.${k}`) : null; };
// tool types with their own wording under perm.wants; any other tool gets perm.wants.other
const PERM_VERB = new Set(['bash', 'edit', 'write', 'web', 'fetch', 'mcp', 'agent', 'read']);
// Claude's question (AskUserQuestion): pick an option per question, or type your own; several picks when allowed.
function askBody(card, p) {
  const sel = p.questions.map(() => new Set()), other = p.questions.map(() => '');
  const box = el('div', 'pq-list'), send = el('button', 'pc-allow', tr('perm.sendAnswer')); send.type = 'button'; send.dataset.perm = 'answer';
  const sync = () => { send.disabled = sel.some((x, i) => !x.size && !other[i].trim()); };
  p.questions.forEach((q, qi) => {
    const wrap = el('div', 'pq'), top = el('div', 'pq-top');
    if (q.header) top.append(el('span', 'pq-chip', q.header));
    if (q.multi) top.append(el('span', 'pq-hint', tr('perm.multi')));
    wrap.append(top, el('p', 'pq-q', q.question));
    const opts = el('div', 'pq-opts');
    q.options.forEach((o, oi) => {
      const b = el('button', 'pq-opt'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.append(el('b', null, o.label)); if (o.description) b.append(el('small', null, o.description));
      b.addEventListener('click', () => {
        if (q.multi) { if (sel[qi].has(oi)) sel[qi].delete(oi); else sel[qi].add(oi); }
        else { sel[qi].clear(); sel[qi].add(oi); other[qi] = ''; inp.value = ''; }
        for (const [k, x] of [...opts.children].entries()) x.setAttribute('aria-pressed', String(sel[qi].has(k)));
        sync();
      });
      opts.append(b);
    });
    const inp = el('input', 'pq-other'); inp.type = 'text'; inp.maxLength = 500; inp.placeholder = tr('perm.otherPlaceholder'); inp.setAttribute('aria-label', tr('perm.otherLabel', { q: q.question }));
    inp.addEventListener('input', () => { other[qi] = inp.value; if (!q.multi && inp.value.trim()) { sel[qi].clear(); for (const x of opts.children) x.setAttribute('aria-pressed', 'false'); } sync(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !send.disabled) send.click(); });
    wrap.append(opts, inp); box.append(wrap);
  });
  card._payload = () => ({ answers: p.questions.map((_, qi) => ({ q: qi, pick: [...sel[qi]], other: other[qi].trim() })) });
  sync();
  return { body: box, send };
}
function permCard(p) {
  const card = el('div', 'perm-card'); card.dataset.id = p.id; card.dataset.kind = p.kind || 'perm';
  const s = sessions.get(p.sess), dot = el('i'); dot.style.background = s ? colorOf(s) : '#F2B544';
  const ico = el('span', 'pc-ico'); ico.append(icon('alert'));
  const head = el('div', 'pc-head'), who = el('div', 'pc-who');
  const verbText = ' ' + (p.kind === 'ask' ? tr('perm.asks') : p.kind === 'plan' ? tr('perm.plan') : PERM_VERB.has(p.type) ? tr(`perm.wants.${p.type}`) : tr('perm.wants.other', { tool: p.tool }));
  who.append(dot, el('b', null, dn(s) || p.name), document.createTextNode(verbText));
  if (p.kind === 'ask' || p.kind === 'plan') ico.replaceChildren(icon(p.kind === 'ask' ? 'sparkle' : 'list'));
  const left = el('span', 'pc-left');
  head.append(ico, who, left);
  const acts = el('div', 'pc-acts');
  const btn = (choice, text, cls) => { const b = el('button', cls, text); b.type = 'button'; b.dataset.perm = choice; return b; };
  const bar = el('div', 'pc-bar'), fill = el('i'); bar.append(fill);
  if (p.kind === 'ask') {
    const { body, send } = askBody(card, p);
    acts.append(send, btn('skip', tr('perm.answerInIde'), 'pc-skip'));
    card.append(head, body, acts, bar);
  } else if (p.kind === 'plan') {
    const plan = el('div', 'pc-plan md'); plan.append(mdBlocks(p.plan || ''));
    const note = el('input', 'pq-other'); note.type = 'text'; note.maxLength = 1000; note.placeholder = tr('perm.planPlaceholder'); note.setAttribute('aria-label', tr('perm.planLabel'));
    card._payload = () => ({ note: note.value.trim() });
    acts.append(btn('approve', tr('perm.approvePlan'), 'pc-allow'), btn('revise', tr('perm.revise'), 'pc-always'), btn('skip', tr('perm.viewInIde'), 'pc-skip'));
    card.append(head, plan, note, acts, bar);
  } else {
    // from a phone (when the Mac allows it): allow once or deny; never "always", and a risky command only deny
    const risky = dangerOf(p), kbd = (b, k) => { b.append(el('kbd', null, k)); return b; }, phone = !state.isLocal;
    if (!phone || !risky) acts.append(kbd(btn('allow', tr('perm.allow'), 'pc-allow'), 'Y'));
    if (p.remember && !risky && !phone) { const b = btn('always', tr('perm.always'), 'pc-always'); b.title = tr('perm.ruleTitle', { rule: p.remember }); acts.append(kbd(b, 'A')); }
    acts.append(kbd(btn('deny', tr('perm.deny'), 'pc-deny'), 'N'));
    if (phone && risky) acts.append(el('small', 'pc-phone-note', tr('perm.riskyOnMac')));
    if (risky) { card.classList.add('perm-card--danger'); card.dataset.risky = '1'; }
    card.append(head, el('pre', 'pc-detail', p.detail), risky ? el('p', 'pc-danger', tr('perm.dangerNote', { reason: risky })) : '',
      p.remember && !risky ? el('p', 'pc-rule', tr('perm.ruleNote', { rule: p.remember })) : '', acts, bar);
  }
  // a phone, while the Mac doesn't let phones approve: the card says where to answer it instead of offering buttons
  if (!state.isLocal && !state.phoneApprove && !DEMO) acts.replaceChildren(el('small', 'pc-phone-note', tr('perm.phoneOff')));
  card._tick = () => { const ms = Math.max(0, p.until - Date.now()); left.textContent = tr('time.sec', { n: Math.ceil(ms / 1000) }); fill.style.width = `${(ms / 45000) * 100}%`; };
  card._tick();
  return card;
}
export function renderPerms() {
  const stack = $('perm-stack'), have = new Set([...stack.children].map((c) => c.dataset.id));
  for (const c of [...stack.children]) if (!perms.has(c.dataset.id)) c.remove();
  for (const p of perms.values()) if (!have.has(p.id)) stack.append(permCard(p));
  stack.hidden = !perms.size;
}
export function onPerm(p) {
  perms.set(p.id, p); renderPerms(); sfx.play('perm');
  const w = workers.get(p.sess); if (w) { w.anim = 'hand'; if (!state.selectedId && autoCam()) panTo(w); }
}

export function setup() {
  state.permOn = true;
  try { state.permOn = localStorage.getItem('office-perm') !== 'off'; } catch { /* storage blocked */ }
  PAGE_ID = Math.random().toString(36).slice(2, 10);
  for (const ev of ['focus', 'blur', 'visibilitychange']) addEventListener(ev, reportPresence);
  if (!STATIC) addEventListener('pagehide', () => { try { navigator.sendBeacon(`/api/presence${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, new Blob([JSON.stringify({ page: PAGE_ID, focused: false })], { type: 'application/json' })); } catch { /* ignore */ } });
  setInterval(() => { if (document.hasFocus()) reportPresence(); }, 2000);
  setInterval(() => { for (const c of $('perm-stack').children) c._tick?.(); }, 250);
  $('perm-stack').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-perm]'); if (!b) return;
    const card = b.closest('.perm-card'), id = card.dataset.id, choice = b.dataset.perm;
    if (card.dataset.risky === '1' && choice === 'allow' && b.dataset.armed !== '1') {
      b.dataset.armed = '1'; b.firstChild.textContent = tr('perm.allowAgain');
      setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.firstChild.textContent = tr('perm.allow'); } }, 4000);
      return;
    }
    for (const x of card.querySelectorAll('button, input')) x.disabled = true;
    b.textContent = tr('perm.sending');
    const doneMsg = ['allow', 'always', 'deny', 'answer', 'approve', 'revise', 'skip'].includes(choice) ? tr(`perm.done.${choice}`) : undefined;
    if (DEMO) { toast(tr('perm.demoDone', { done: doneMsg })); perms.delete(id); renderPerms(); return; }
    try {
      const r = await fetch(`/api/perm${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, choice, ...(card._payload?.() || {}) }) });
      const d = await r.json();
      if (!d.ok) toast(d.message || tr('perm.expired'));
      else toast(doneMsg || tr('perm.sent'));
    } catch { toast(tr('perm.unreachable')); }
    perms.delete(id); renderPerms();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyO' || !state.selectedId || !state.isLocal || e.metaKey || e.ctrlKey || e.altKey || fp.on || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const s = sessions.get(state.selectedId); if (s) { e.preventDefault(); openWindowOf(s); }
  });
  document.addEventListener('keydown', (e) => {
    if (!perms.size || e.metaKey || e.ctrlKey || e.altKey || fp.on || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = { KeyY: 'allow', KeyN: 'deny', KeyA: 'always' }[e.code]; if (!k) return;
    const card = $('perm-stack').querySelector('.perm-card[data-kind="perm"]'); const b = card?.querySelector(`[data-perm="${k}"]`);
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });
}
