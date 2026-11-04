// The small panel (app/panel): who is working, who waits for you, the plans' limits, for a narrow place the office is
// always in (the editor's side bar, the Mac's menu bar). No 3D: the office's live stream (/stream) and its approve,
// open-window and presence calls, drawn as a list. Requests to approve are held for you while a page is looked at, as
// on the office page itself: this one reports itself looked at when it is on screen and has the focus.
import { t as tr } from '../i18n/index.js';
import { dangerKey } from '../shared/danger.js';
import { el, level } from './fmt.js';
import { attach, liveWindows, refreshQuota, startQuota } from './quota.js';
import { startMac } from './mac.js';
import { startKeys } from './keys.js';
import { projectOf, sessionCard } from './session-card.js';
import { planBlocks } from './md.js';

const $ = (id) => document.getElementById(id);
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const TOKEN = new URLSearchParams(location.search).get('k') || '';
const q = (path) => `${path}${TOKEN ? `${path.includes('?') ? '&' : '?'}k=${encodeURIComponent(TOKEN)}` : ''}`;
const post = (path, body) => fetch(q(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false }));
const PAGE = Math.random().toString(36).slice(2, 10);
const PERM_VERB = new Set(['bash', 'edit', 'write', 'web', 'fetch', 'mcp', 'agent', 'read']);

const S = { sessions: new Map(), perms: new Map(), limits: null, ai: null, local: false, live: false };
const drafts = new Map();  // (a question's picks and typed words, a plan's note, per request: kept over every redraw)
const draftOf = (p) => { let d = drafts.get(p.id); if (!d) { d = { sel: (p.questions || []).map(() => []), other: (p.questions || []).map(() => ''), note: '' }; drafts.set(p.id, d); } return d; };
const armed = new Set();   // (a risky command's "allow", pressed once: the second press sends it)

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return tr('panel.now');
  return tr('time.ago', { time: s < 3600 ? tr('time.min', { n: Math.round(s / 60) }) : s < 86400 ? tr('time.hour', { n: Math.round(s / 3600) }) : tr('time.day', { n: Math.round(s / 86400) }) });
}
const nameOf = (s) => s?.title || s?.name || '';

/* ---------- what each tool has left (the account in use): Claude's tightest limit, Codex's, Antigravity's model ---------- */
function quotas() {
  const now = Date.now(), out = [];
  const live = (ws) => (ws || []).filter((w) => !w.resetsAt || w.resetsAt > now);
  const tight = (ws) => live(ws).reduce((a, w) => (!a || w.pct > a.pct ? w : a), null);
  const c = tight(S.limits?.windows);
  if (c) out.push({ name: 'Claude', pct: c.pct, detail: () => ({ groups: [
    { title: S.limits.others?.length ? S.limits.label || tr('mac.plan.mainAccount') : '', rows: liveWindows(S.limits.windows) },
    // every other account, also one with nothing to show now (never read yet, or its readings past their reset): why
    ...(S.limits.others || []).map((o) => { const rows = liveWindows(o.windows); return { title: o.label || tr('mac.plan.otherAccount', { name: o.name }), rows, note: rows.length ? '' : o.note || tr('mac.plan.loading') }; }),
  ] }) });
  const cx = S.ai?.codex, ca = cx?.list?.find((a) => a.id === cx.now), cw = tight(ca?.windows);
  if (cw) out.push({ name: 'Codex', pct: cw.pct, detail: () => ({ groups: [{ rows: liveWindows(ca.windows) }] }) });
  const ag = S.ai?.ag, aa = ag?.list?.find((a) => a.id === ag.now), r = aa?.rows?.[0];
  if (r) out.push({ name: r.label.split(' ')[0] || 'Antigravity', pct: r.pct, detail: () => ({ groups: [{ rows: aa.rows }] }) });
  return out;
}

/* ---------- drawing ---------- */
function permCard(p) {
  const s = S.sessions.get(p.sess), card = el('div', 'pn-perm'), head = el('div', 'pn-perm-h');
  const verb = p.kind === 'ask' ? tr('perm.asks') : p.kind === 'plan' ? tr('perm.plan') : PERM_VERB.has(p.type) ? tr(`perm.wants.${p.type}`) : tr('perm.wants.other', { tool: p.tool });
  head.append(el('b', null, nameOf(s) || p.name), el('span', null, ` ${verb}`));
  card.append(head); card.dataset.id = p.id;
  if (p.kind === 'perm' || !p.kind) {
    if (p.detail) card.append(el('code', 'pn-detail', clip(p.detail, 400)));
    const risky = dangerKey(p);
    if (risky) card.append(el('small', 'pn-warn', tr('perm.dangerNote', { reason: tr(`perm.danger.${risky}`) })));
    const acts = el('div', 'pn-acts'), yes = el('button', 'pn-btn pn-btn--ok', armed.has(p.id) ? tr('perm.allowAgain') : tr('perm.allow')), no = el('button', 'pn-btn pn-btn--no', tr('perm.deny'));
    yes.type = no.type = 'button';
    yes.addEventListener('click', () => {
      if (risky && !armed.has(p.id)) { armed.add(p.id); draw(); return; }
      answer(p, 'allow', yes);
    });
    no.addEventListener('click', () => answer(p, 'deny', no));
    acts.append(yes, no); card.append(acts);
  } else if (p.kind === 'ask') {
    askBody(card, p);
  } else {
    planBody(card, p);
  }
  if (p.until) { const u = el('small', 'pn-until'); u.dataset.until = String(p.until); card.append(u); }
  return card;
}

// a question: one pick per question (several when it allows), or the learner's own words; sent once all are answered
function askBody(card, p) {
  const d = draftOf(p), qs = p.questions || [];
  const send = el('button', 'pn-btn pn-btn--ok', tr('perm.sendAnswer')), skip = el('button', 'pn-btn pn-btn--ghost', tr('perm.answerInIde'));
  send.type = skip.type = 'button';
  const sync = () => { send.disabled = qs.some((_, i) => !d.sel[i].length && !d.other[i].trim()); };
  qs.forEach((q, qi) => {
    const wrap = el('div', 'pn-q-block'), top = el('div', 'pn-q-top');
    if (q.header) top.append(el('span', 'pn-chip', q.header));
    if (q.multi) top.append(el('span', 'pn-q-hint', tr('perm.multi')));
    wrap.append(top, el('p', 'pn-q-text', q.question));
    const opts = el('div', 'pn-opts');
    (q.options || []).forEach((o, oi) => {
      const b = el('button', 'pn-opt'); b.type = 'button'; b.setAttribute('aria-pressed', String(d.sel[qi].includes(oi)));
      b.append(el('b', null, o.label)); if (o.description) b.append(el('small', null, o.description));
      b.addEventListener('click', () => {
        const at = d.sel[qi].indexOf(oi);
        if (q.multi) { if (at >= 0) d.sel[qi].splice(at, 1); else d.sel[qi].push(oi); }
        else { d.sel[qi] = [oi]; d.other[qi] = ''; inp.value = ''; }
        [...opts.children].forEach((x, k) => x.setAttribute('aria-pressed', String(d.sel[qi].includes(k))));
        sync();
      });
      opts.append(b);
    });
    const inp = el('input', 'pn-other'); inp.type = 'text'; inp.maxLength = 500; inp.value = d.other[qi]; inp.placeholder = tr('perm.otherPlaceholder');
    inp.setAttribute('aria-label', tr('perm.otherLabel', { q: q.question })); inp.dataset.q = `${p.id}:o${qi}`;
    inp.addEventListener('input', () => {
      d.other[qi] = inp.value;
      if (!q.multi && inp.value.trim()) { d.sel[qi] = []; [...opts.children].forEach((x) => x.setAttribute('aria-pressed', 'false')); }
      sync();
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !send.disabled) send.click(); });
    wrap.append(opts, inp); card.append(wrap);
  });
  send.addEventListener('click', () => answer(p, 'answer', send, { answers: qs.map((_, qi) => ({ q: qi, pick: [...d.sel[qi]].sort((a, b) => a - b), other: d.other[qi].trim() })) }));
  skip.addEventListener('click', () => answer(p, 'skip', skip));
  sync();
  const acts = el('div', 'pn-acts'); acts.append(send, skip); card.append(acts);
}
// a plan: read it (it scrolls), approve it, or send it back with a note
function planBody(card, p) {
  const d = draftOf(p), plan = el('div', 'pn-plan'); plan.append(planBlocks(p.plan || '')); plan.tabIndex = 0;
  const note = el('input', 'pn-other'); note.type = 'text'; note.maxLength = 1000; note.value = d.note; note.placeholder = tr('perm.planPlaceholder');
  note.setAttribute('aria-label', tr('perm.planLabel')); note.dataset.q = `${p.id}:note`;
  note.addEventListener('input', () => { d.note = note.value; });
  const ok = el('button', 'pn-btn pn-btn--ok', tr('perm.approvePlan')), rev = el('button', 'pn-btn', tr('perm.revise')), skip = el('button', 'pn-btn pn-btn--ghost', tr('perm.viewInIde'));
  ok.type = rev.type = skip.type = 'button';
  ok.addEventListener('click', () => answer(p, 'approve', ok));
  rev.addEventListener('click', () => answer(p, 'revise', rev, { note: d.note.trim() }));
  skip.addEventListener('click', () => answer(p, 'skip', skip));
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter') rev.click(); });
  const acts = el('div', 'pn-acts'); acts.append(ok, rev, skip);
  card.append(plan, note, acts);
}
async function answer(p, choice, btn, extra = {}) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = tr('perm.sending');
  const r = await post('/api/perm', { id: p.id, choice, ...extra });
  if (!r.ok) { btn.disabled = false; btn.textContent = r.message || label; return; }
  S.perms.delete(p.id); armed.delete(p.id); drafts.delete(p.id); draw();
}
function sessionRow(s) {
  const waiting = s.status === 'wait' || [...S.perms.values()].some((p) => p.sess === s.id);
  const st = waiting ? 'wait' : s.status === 'work' ? 'work' : 'rest';
  const row = el('button', `pn-sess is-${st}`); row.type = 'button';
  const what = st === 'wait' ? tr('panel.status.wait') : st === 'work' ? (s.last?.label || tr('panel.status.work')) : (s.doneAt ? tr('panel.status.done') : tr('panel.status.rest'));
  const top = el('span', 'pn-sess-top'); top.append(el('i', 'pn-dot'), el('b', null, clip(nameOf(s), 48)), el('small', null, ago(s.lastAt || 0)));
  // which project and branch it works in; the rest on its card (hover / focus)
  const where = [projectOf(s), s.git?.branch].filter(Boolean).join(' · ');
  row.append(top);
  if (where) row.append(el('span', 'pn-sess-dir', where));
  row.append(el('span', 'pn-sess-what', clip(what, 80)));
  attach(row, `sess:${s.id}`, () => ({ node: sessionCard(s, st, S.local ? tr('panel.openWindow') : '') }), { passive: true });
  const subs = (s.subs || []).length;
  if (subs && st === 'work') row.append(el('span', 'pn-sess-sub', tr('panel.subs', { n: subs })));
  if (S.local) row.addEventListener('click', () => post('/api/open', { id: s.id }));
  else row.disabled = true;
  return row;
}
// the countdowns, every second (the list itself is drawn again only when something changes, and every 30 s for "ago")
function tick() {
  for (const u of document.querySelectorAll('.pn-until[data-until]')) u.textContent = tr('panel.until', { s: Math.max(0, Math.round((Number(u.dataset.until) - Date.now()) / 1000)) });
}
let drawSoon = 0;
const macBox = el('section', 'pn-sec pn-mac');
function draw() {
  cancelAnimationFrame(drawSoon);
  drawSoon = requestAnimationFrame(() => {
    if (document.querySelector('.pn-body button:active')) { draw(); return; }   // (not under a button being pressed)
    const body = $('pn-body'), sessions = [...S.sessions.values()];
    const rank = (s) => (s.status === 'wait' || [...S.perms.values()].some((p) => p.sess === s.id) ? 0 : s.status === 'work' ? 1 : 2);
    sessions.sort((a, b) => rank(a) - rank(b) || (b.lastAt || 0) - (a.lastAt || 0));
    const work = sessions.filter((s) => rank(s) === 1).length, wait = sessions.filter((s) => rank(s) === 0).length;
    $('pn-sum').textContent = !S.live ? tr('panel.connecting') : [work && tr('panel.working', { n: work }), wait && tr('panel.waiting', { n: wait })].filter(Boolean).join(' · ') || tr('panel.quiet');
    $('pn-sum').dataset.state = wait ? 'wait' : work ? 'work' : 'rest';
    const parts = [];
    if (S.perms.size) {
      const sec = el('section', 'pn-sec'); sec.append(el('h2', null, tr('panel.needsYou', { n: S.perms.size })));
      for (const p of S.perms.values()) sec.append(permCard(p));
      parts.push(sec);
    }
    const qs = quotas();
    if (qs.length) {
      const sec = el('section', 'pn-sec pn-quota'), row = el('div', 'pn-q');
      for (const x of qs) { const pill = el('button', `pn-qp is-${level(x.pct)}`); pill.type = 'button'; pill.append(el('b', null, x.name), el('em', null, `${Math.round(x.pct)}%`)); attach(pill, x.name, x.detail); row.append(pill); }
      sec.append(row); parts.push(sec);
    }
    const sec = el('section', 'pn-sec'); sec.append(el('h2', null, tr('panel.sessions')));
    if (!sessions.length) sec.append(el('p', 'pn-empty', S.live ? tr('panel.noSessions') : tr('panel.connecting')));
    for (const s of sessions.slice(0, 30)) sec.append(sessionRow(s));
    parts.push(sec, macBox);   // (the Mac's section keeps its own state: the same element each time)
    for (const id of [...drafts.keys()]) if (!S.perms.has(id)) drafts.delete(id);
    const ae = document.activeElement, focusQ = body.contains(ae) ? ae.dataset?.q : null, caret = focusQ ? [ae.selectionStart, ae.selectionEnd] : null;
    const scroll = new Map([...body.querySelectorAll('.pn-plan')].map((n) => [n.parentNode.dataset.id, n.scrollTop])), top = body.scrollTop;
    body.replaceChildren(...parts);
    body.scrollTop = top;
    for (const n of body.querySelectorAll('.pn-plan')) n.scrollTop = scroll.get(n.parentNode.dataset.id) || 0;
    if (focusQ) { const n = body.querySelector(`[data-q="${CSS.escape(focusQ)}"]`); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(caret[0], caret[1]); } catch { /* none */ } } }
    refreshQuota();
    document.querySelector('.pn-foot').hidden = !S.local;
    tick();
  });
}

/* ---------- the live stream ---------- */
function apply(d) {
  if (d.k === 'snap') {
    S.sessions = new Map((d.sessions || []).map((s) => [s.id, s]));
    if ('local' in d) { S.local = !!d.local; S.perms = new Map((d.perms || []).map((p) => [p.id, p])); S.limits = d.limits || null; S.ai = d.ai || null; }
  } else if (d.k === 'sess' || d.k === 'ev' || d.k === 'stats') { if (d.s) S.sessions.set(d.s.id, d.s); }
  else if (d.k === 'gone') S.sessions.delete(d.id);
  else if (d.k === 'perm') S.perms.set(d.p.id, d.p);
  else if (d.k === 'permDone') S.perms.delete(d.id);
  else if (d.k === 'limits') S.limits = d.limits || null;
  else if (d.k === 'ai') S.ai = d.ai || null;
  else return;
  draw();
}
function connect() {
  const es = new EventSource(q('/stream'));
  es.onopen = () => { S.live = true; draw(); };
  es.onmessage = (m) => { try { apply(JSON.parse(m.data)); } catch { /* not ours */ } };
  es.onerror = () => { S.live = false; draw(); };   // (EventSource tries again by itself)
}
// looked at: on screen and focused (the editor's side bar once clicked into, the menu bar's popover while open)
function presence() {
  const focused = document.visibilityState === 'visible' && document.hasFocus();
  fetch(q('/api/presence'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE, focused }), keepalive: true }).then((r) => r.body?.cancel()).catch(() => {});
}

export function startPanel() {
  const embed = new URLSearchParams(location.search).get('embed') || '';
  document.documentElement.dataset.embed = embed;
  for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => post('/api/panel/open', { what: b.dataset.open }));
  for (const ev of ['focus', 'blur', 'visibilitychange']) addEventListener(ev, presence);
  addEventListener('pagehide', () => { try { navigator.sendBeacon(q('/api/presence'), new Blob([JSON.stringify({ page: PAGE, focused: false })], { type: 'application/json' })); } catch { /* gone */ } });
  setInterval(() => { if (document.hasFocus()) presence(); }, 2000);
  setInterval(tick, 1000);
  startQuota(); startMac(macBox, { q }); startKeys();
  setInterval(draw, 30_000);   // ("2 min ago")
  connect(); draw(); presence();
}
