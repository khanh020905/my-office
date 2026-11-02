// "Kho lịch sử" (server/vault.mjs): every conversation's words, kept after Claude Code deletes its transcript (30 days by
// default). A drawer of its own (from the group chat's •••, or ?vault in the address), a full-screen sheet on a phone:
// search (accents or not, what was said too), the newest first; open one to read it, with `claude --resume <id>` while
// its transcript is still there. The demo shows a few made-up ones.
import { $, el, fmtBytes, hhmm } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { DEMO } from '../demo/demo.js';
import { closeSession, drM, drS, mdBlocks } from './session-drawer.js';
import { closeMac } from './mac-drawer.js';
import { closeBurn, drB } from './burn.js';
import { toast } from './activity.js';
import { t as tr, locale } from '../../i18n/index.js';

export let drV;
let q = '', reqSeq = 0, typeT = 0, open = null, tab = 'list';   // (open: the conversation being read, or null for the list; tab: 'list' | 'report')
const tq = () => (TOKEN ? `&k=${encodeURIComponent(TOKEN)}` : '');
const day = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const when = (ms) => (ms ? `${day(ms)} ${hhmm(ms)}` : '');
const project = (cwd) => String(cwd || '').split(/[\\/]/).filter(Boolean).pop() || '';

/* ---------- the demo's few: made-up conversations from its projects, one of them already gone from Claude Code ---------- */
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
function demoRecs() {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  return [
    { sid: 'demo-vault-1', title: tr('demo.mac.titles.shop-api'), cwd: '~/projects/shop-api', start: now - 3 * H, end: now - 2 * H, gone: 0, msgs: [{ r: 'u', t: tr('demo.tasks.cart.prompt') }, { r: 'c', t: tr('demo.replies.cart') }] },
    { sid: 'demo-vault-2', title: tr('demo.mac.titles.data-pipeline'), cwd: '~/projects/data-pipeline', start: now - 26 * H, end: now - 25 * H, gone: 0, msgs: [{ r: 'u', t: tr('demo.tasks.schedule.prompt') }, { r: 'c', t: tr('demo.replies.schedule') }] },
    { sid: 'demo-vault-3', title: tr('demo.mac.titles.landing-page'), cwd: '~/projects/landing-page', start: now - 41 * D, end: now - 40 * D, gone: now - 10 * D, msgs: [{ r: 'u', t: tr('demo.tasks.hero.prompt') }, { r: 'c', t: tr('demo.replies.speed') }] },
  ];
}
function demoAnswer(params) {
  const recs = demoRecs();
  if (params.sid) { const rec = recs.find((x) => x.sid === params.sid); return rec ? { ok: true, rec } : { ok: false }; }
  const words = fold(params.q).split(/\s+/).filter(Boolean);
  const items = recs.filter((x) => words.every((w) => fold(`${x.title} ${x.cwd} ${x.msgs.map((m) => m.t).join(' ')}`).includes(w)))
    .map((x) => ({ ...x, n: x.msgs.length, first: x.msgs[0].t, msgs: undefined }));
  return { ok: true, stats: { n: recs.length, gone: 1, bytes: 2200, at: Date.now() - 20 * 60e3 }, items };
}
async function ask(params) {
  if (DEMO) return demoAnswer(params);
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  try { return await (await fetch(`/api/vault?${s}${tq()}`)).json(); } catch { return { ok: false }; }
}

/* ---------- the list ---------- */
async function load(fresh = false) {
  const n = ++reqSeq, d = await ask({ q, ...(fresh && { fresh: '1' }) });
  if (n !== reqSeq || open) return;   // (a newer search meanwhile, or a conversation opened)
  const body = $('vault-body'), at = $('vault-at');
  if (tab !== 'list') return;
  if (!d?.ok) { at.textContent = d?.off ? tr('vault.off') : tr('drawer.unreachable'); body.replaceChildren(el('p', 'muted', d?.off ? tr('vault.off') : tr('drawer.unreachable'))); return; }
  at.textContent = d.stats.at ? tr('vault.at', { n: d.stats.n, size: fmtBytes(d.stats.bytes), time: hhmm(d.stats.at) }) : tr('vault.first', { n: d.stats.n });
  if (!d.items.length) { body.replaceChildren(el('p', 'muted vl-empty', q ? tr('vault.none', { q }) : tr('vault.empty'))); return; }
  const list = el('ul', 'vl-list');
  for (const x of d.items) {
    const li = el('li'), b = el('button', `vl-row${x.gone ? ' is-gone' : ''}`); b.type = 'button'; b.dataset.sid = x.sid;
    const head = el('span', 'vl-row-h');
    head.append(el('b', 'vl-row-t', x.title || x.first || tr('vault.untitled')));
    if (x.gone) head.append(el('span', 'vl-badge', tr('vault.gone')));
    b.append(head, el('span', 'vl-row-m', [project(x.cwd), when(x.end), tr('vault.msgs', { n: x.n })].filter(Boolean).join(' · ')));
    if (x.snip) b.append(el('span', 'vl-snip', `${x.snipBy === 'u' ? tr('vault.you') : tr('vault.claude')}: ${x.snip}`));
    else if (x.title && x.first) b.append(el('span', 'vl-snip', x.first));
    b.addEventListener('click', () => read(x.sid));
    li.append(b); list.append(li);
  }
  body.replaceChildren(list, el('p', 'vl-note', tr('vault.note')));
}

/* ---------- the weekly prompt report (server/prompt-report.mjs): the last 7 days against the 7 before ---------- */
const HINTS = ['photoBare', 'dangling', 'vague', 'multi', 'tooShort'];
function demoReport() {
  const ex = (t, hint, phrase, ph = 0) => ({ t, hint, phrase, ph, n: 2, at: Date.now() - 864e5, title: tr('demo.mac.titles.landing-page') });
  return { ok: true, prev: { n: 38, pct: 61 }, now: { n: 44, clear: 30, pct: 68, convs: 6, by: { photoBare: 6, dangling: 2, vague: 3, multi: 4, tooShort: 1 },
    examples: [ex('sao', 'photoBare', '', 1), ex(tr('demo.tasks.hero.prompt'), 'multi', ''), ex('làm khác đi', 'vague', 'khác đi')] } };
}
async function loadReport() {
  const n = ++reqSeq, body = $('vault-body');
  body.replaceChildren(el('p', 'muted', tr('vault.loading')));
  let d; if (DEMO) d = demoReport(); else { try { d = await (await fetch(`/api/vault/report${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`)).json(); } catch { d = null; } }
  if (n !== reqSeq || tab !== 'report') return;
  if (!d?.ok) { body.replaceChildren(el('p', 'muted', d?.off ? tr('vault.off') : tr('drawer.unreachable'))); return; }
  const r = d.now, p = d.prev;
  if (!r.n) { $('vault-at').textContent = ''; body.replaceChildren(el('p', 'muted vl-empty', tr('vault.report.empty'))); return; }
  const hero = el('section', 'vr-hero');
  hero.append(el('b', 'vr-pct', `${r.pct}%`), el('span', 'vr-what', tr('vault.report.clear')));
  hero.append(el('small', null, p?.pct != null ? tr('vault.report.prev', { pct: p.pct, delta: `${r.pct - p.pct >= 0 ? '+' : '−'}${Math.abs(r.pct - p.pct)}` }) : tr('vault.report.prevNone')));
  $('vault-at').textContent = tr('vault.report.count', { n: r.n, convs: r.convs });
  const habits = el('section', 'vr-sec'); habits.append(el('h3', null, tr('vault.report.habits')));
  const kinds = HINTS.filter((h) => r.by[h]).sort((a, b) => r.by[b] - r.by[a]);
  if (!kinds.length) habits.append(el('p', 'muted', tr('vault.report.none')));
  for (const h of kinds) {
    const row = el('div', 'vr-habit'), bar = el('span', 'vr-bar'), fill = el('i');
    fill.style.width = `${Math.max(3, Math.round((r.by[h] / r.n) * 100))}%`; bar.append(fill);
    row.append(el('b', null, tr(`vault.report.hint.${h}`)), el('span', 'vr-n', String(r.by[h])), bar, el('small', 'vr-tip', tr(`vault.report.tip.${h}`)));
    habits.append(row);
  }
  const exs = el('section', 'vr-sec'); exs.append(el('h3', null, tr('vault.report.examples')));
  for (const x of r.examples) {
    const box = el('div', 'vr-ex'), quote = el('p', 'vr-quote', `${x.ph ? `🖼×${x.ph} ` : ''}“${x.t}”`);
    box.append(quote, el('small', 'vr-hint', tr(`chat.coach.${x.hint}`, { phrase: x.phrase, n: x.n })), el('small', 'vl-row-m', [x.title, when(x.at)].filter(Boolean).join(' · ')));
    exs.append(box);
  }
  body.replaceChildren(hero, habits, exs, el('p', 'vl-note', tr('vault.report.note')));
}
function setTab(t) {
  tab = t; open = null;
  for (const b of drV.querySelectorAll('[data-vt]')) b.setAttribute('aria-selected', String(b.dataset.vt === t));
  drV.querySelector('.vl-search').hidden = t !== 'list';
  if (t === 'report') loadReport(); else load();
}

/* ---------- one conversation ---------- */
async function read(sid) {
  open = sid;
  const body = $('vault-body'); body.replaceChildren(el('p', 'muted', tr('vault.loading')));
  const d = await ask({ sid });
  if (open !== sid) return;
  const back = el('button', 'btn btn--sm vl-back', tr('vault.back')); back.type = 'button';
  back.addEventListener('click', () => { open = null; load(); });
  if (!d?.ok) { body.replaceChildren(back, el('p', 'muted', tr('vault.gotIt'))); return; }
  const r = d.rec, top = el('div', 'vl-top');
  top.append(back, el('h3', 'vl-title', r.title || tr('vault.untitled')), el('p', 'vl-row-m', [r.cwd, `${when(r.start)} – ${when(r.end)}`].filter(Boolean).join(' · ')));
  if (r.gone) top.append(el('p', 'vl-gone', tr('vault.goneNote', { date: day(r.gone) })));
  else {
    // carry it on: its transcript is still there (in the folder it ran in)
    const cmd = `${r.cwd ? `cd ${r.cwd} && ` : ''}claude --resume ${r.sid}`, row = el('div', 'vl-resume'), copy = el('button', 'btn btn--sm', tr('vault.copy')); copy.type = 'button';
    copy.addEventListener('click', () => navigator.clipboard?.writeText(cmd).then(() => toast(tr('vault.copied'), 2500)).catch(() => {}));
    row.append(el('small', null, tr('vault.resume')), el('code', null, cmd), copy);
    top.append(row);
  }
  const msgs = el('div', 'vl-msgs');
  for (const m of r.msgs) {
    const box = el('div', `vl-msg is-${m.r}`), who = el('small', 'vl-who', `${m.r === 'u' ? tr('vault.you') : tr('vault.claude')}${m.at ? ` · ${hhmm(m.at)}` : ''}`);
    const text = el('div', m.r === 'c' ? 'vl-md md' : 'vl-txt');
    if (m.r === 'c') text.append(mdBlocks(m.t)); else text.textContent = m.t;
    box.append(who, text); msgs.append(box);
  }
  body.replaceChildren(top, msgs);
  body.scrollTop = 0;
}

export function openVault() {
  if (!drS.hidden) closeSession();
  if (!drM.hidden) closeMac();
  if (!drB.hidden) closeBurn();
  if ($('zchat') && !$('zchat').hidden) $('btn-chat')?.click();   // (the chat window closes: on a phone it covers the sheet)
  drV.hidden = false;
  setTab(tab);
}
export function closeVault() { if (!drV || drV.hidden) return; drV.hidden = true; open = null; }

export function setup() {
  drV = $('dr-vault'); if (!drV) return;
  drV.querySelector('[data-close]').addEventListener('click', closeVault);
  drV.querySelector('#vault-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-vt]'); if (b && b.dataset.vt !== tab) setTab(b.dataset.vt); });
  const input = $('vault-q');
  input.addEventListener('keydown', (e) => e.stopPropagation());   // (the office's own keys don't fire while you type)
  input.addEventListener('input', () => { clearTimeout(typeT); typeT = setTimeout(() => { q = input.value.trim(); open = null; load(); }, 250); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drV.hidden) { if (open) { open = null; load(); } else closeVault(); } });
  // one drawer at a time: the Mac's, a session's or the plan's opening closes this one
  const watch = new MutationObserver(() => { if (!drM.hidden || !drS.hidden || !drB.hidden) closeVault(); });
  for (const n of [drM, drS, drB]) watch.observe(n, { attributes: true, attributeFilter: ['hidden'] });
  const qv = new URLSearchParams(location.search);
  if (qv.has('vault')) { if (qv.get('vault') === 'report') tab = 'report'; setTimeout(openVault, 300); }   // (?vault, ?vault=report: a link from a phone)   // (?vault: a link from a phone)
}
