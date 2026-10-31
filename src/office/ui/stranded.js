// "Việc bỏ quên" in the Mac drawer: the worktrees and checkouts of the repositories the office knows that still hold work
// (files not committed, commits not pushed, stashes), and worktrees with nothing left in them that could go. Each one can
// be opened, given to Claude to finish (a new conversation in that folder, through the chat's "Giao việc": /api/tasks),
// or, only when nothing in it would be lost, deleted after a confirmation. The server reads git (server/stranded.mjs);
// this section is one element kept across the drawer's redraws, read again every 50 s while the drawer is open.
import { el, fmtAgo, fmtBytes } from '../core/env.js';
import { drM } from './session-drawer.js';
import { toast } from './activity.js';
import { TOKEN } from '../net/live.js';
import { DEMO } from '../demo/demo.js';
import { t as tr } from '../../i18n/index.js';

const q = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
const post = (url, body) => fetch(`${url}${q()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false, message: tr('mac.action.unreachable') }));
let data = null, gotAt = 0, loading = null, sec = null;
let open = null;   // the form open under a row: { id, kind: 'give' | 'remove', text }
const busy = new Set();   // rows with a request on its way

/** The section, for the drawer to put in its place (the same element each time); reads again when it's due. */
export function strandedSection() {
  if (!sec) { sec = el('section', 'sec stranded'); sec.id = 'mac-stranded'; draw(); }
  refresh();
  return sec;
}
/** While a form is open under a row the drawer isn't redrawn (it would take the text being typed away). */
export const strandedHolding = () => !!open;

function refresh(force = false) {
  if (DEMO) { if (!data) { data = demoData(); draw(); } return; }
  if (drM?.hidden || loading) return;
  // (every 50 s; every 3 s while the server is still looking or measuring sizes)
  if (!force && data && Date.now() - gotAt < (data.scanning || data.sizing ? 3000 : 50_000)) return;
  loading = fetch(`/api/stranded${q()}`).then((r) => r.json())
    .then((d) => { if (d?.ok) { data = d; gotAt = Date.now(); if (!open) draw(); } })
    .catch(() => {}).finally(() => { loading = null; });
}

const what = (it) => {
  const parts = [];
  if (!it.ok) parts.push(tr('mac.stranded.unread'));
  if (it.dirty) parts.push(tr('mac.stranded.dirty', { n: it.dirty }));
  if (it.ahead) parts.push(tr(it.aheadOf === 'remote' ? 'mac.stranded.aheadRemote' : it.aheadOf === 'main' ? 'mac.stranded.aheadMain' : 'mac.stranded.ahead', { n: it.ahead }));
  if (it.main && it.stashes) parts.push(tr('mac.stranded.stashes', { n: it.stashes }));
  return parts;
};
const branchOf = (it) => it.branch || tr('mac.stranded.detached', { sha: it.head });

function draw() {
  if (!sec) return;
  const head = el('h3', null, tr('mac.stranded.title')); head.append(el('small', null, tr('mac.stranded.hint')));
  const list = el('ul', 'rows');
  if (!data || (!data.at && data.scanning)) list.append(el('li', 'muted', tr('mac.stranded.looking')));
  else if (!data.items.length) list.append(el('li', 'muted', tr(data.repos ? 'mac.stranded.none' : 'mac.stranded.noRepos')));
  else for (const it of data.items) list.append(row(it));
  if (data?.partial) list.append(el('li', 'muted st-note', tr('mac.stranded.partial')));
  if (data && !data.local && data.items.length) list.append(el('li', 'muted st-note', tr('mac.stranded.macOnly')));
  sec.replaceChildren(head, list);
}

function badge(text, cls, title) { const b = el('span', `row-badge${cls ? ` ${cls}` : ''}`, text); if (title) b.title = title; return b; }
function act(it, kind, text, title, run, cls = '') {
  const b = el('button', `btn btn--sm${cls}`, text); b.type = 'button'; b.title = title; b.dataset.fk = `st:${kind}:${it.id}`;
  b.disabled = busy.has(it.id);
  b.addEventListener('click', run);
  return b;
}
function row(it) {
  const li = el('li', `row st-row${it.work ? ' st-row--work' : ''}`); li.dataset.id = it.id;
  const main = el('div', 'row-main'), name = el('div', 'row-name', `${it.repo} · ${branchOf(it)}`);
  if (it.main) name.append(badge(tr('mac.stranded.main')));
  if (it.locked) name.append(badge(`🔒 ${tr('mac.stranded.locked')}`, 'st-badge--muted', it.lockReason || ''));
  if (it.inUse) name.append(badge(tr('mac.stranded.inUse'), 'st-badge--muted'));
  const parts = what(it), facts = el('div', `st-facts${parts.length ? ' st-facts--work' : ''}`, [...(parts.length ? parts : [tr('mac.stranded.clean')]),
    ...(it.last ? [tr('mac.stranded.changed', { ago: tr('time.ago', { time: fmtAgo((Date.now() - it.last) / 1000) }) })] : [])].join(' · '));
  main.append(name, el('div', 'row-sub', it.dir), facts);
  const size = el('span', 'row-num', it.size != null ? fmtBytes(it.size) : it.sizing ? tr('mac.stranded.measuring') : '');
  const acts = el('div', 'st-acts');
  if (data.local) acts.append(act(it, 'open', tr('mac.stranded.open'), tr('mac.stranded.openTitle'), () => openIt(it)));
  if (it.work && it.ok) acts.append(act(it, 'give', tr('mac.stranded.give'), tr('mac.stranded.giveTitle'), () => toggle(it, 'give')));
  // (only a worktree with nothing in it that would be lost: the server checks it all again before git removes it)
  if (it.removable && !it.inUse && data.local) acts.append(act(it, 'remove', tr('mac.stranded.remove'), tr('mac.stranded.removeTitle'), () => toggle(it, 'remove'), ' st-del'));
  li.append(main, size, acts);
  if (open?.id === it.id) li.append(open.kind === 'give' ? giveForm(it) : removeForm(it));
  return li;
}
function toggle(it, kind) {
  open = open?.id === it.id && open.kind === kind ? null : { id: it.id, kind, text: null };
  draw();
  sec.querySelector(open?.kind === 'give' ? '.st-ask' : '.st-yes')?.focus({ preventScroll: true });
}
const close = () => { open = null; draw(); };

/* ---------- "Giao Claude làm nốt": the words, which can be changed, then a new conversation in that folder ---------- */
function giveForm(it) {
  const box = el('div', 'st-form'), ta = el('textarea', 'st-ask');
  ta.rows = 4; ta.maxLength = 4000; ta.setAttribute('aria-label', tr('mac.stranded.give'));
  ta.value = open.text ?? tr('mac.stranded.ask', { branch: branchOf(it), what: what(it).join(', ') });
  ta.addEventListener('input', () => { open.text = ta.value; });
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });   // (the office's own keys stay out of it)
  const go = el('button', 'btn btn--sm btn--confirm st-send', tr('mac.stranded.send')); go.type = 'button';
  go.addEventListener('click', async () => {
    const text = ta.value.trim(); if (!text) return;
    if (DEMO) { toast(tr('mac.action.demo')); close(); return; }
    busy.add(it.id); go.disabled = true;
    const r = await post('/api/tasks', { dir: it.dir, text, fresh: true });
    busy.delete(it.id);
    if (r.ok) { toast(tr('mac.stranded.sent'), 6000); close(); return; }
    go.disabled = false; toast(r.message || tr('mac.action.failed'), 7000);
  });
  const no = el('button', 'btn btn--sm', tr('mac.stranded.cancel')); no.type = 'button'; no.addEventListener('click', close);
  const btns = el('div', 'st-form-btns'); btns.append(no, go);
  box.append(ta, btns);
  return box;
}

/* ---------- "Xoá": what goes with it said first, then git (no --force) on the server after it reads the folder again ---------- */
function removeForm(it) {
  const box = el('div', 'st-form st-form--del');
  box.append(el('p', null, tr(it.branch ? 'mac.stranded.sure' : 'mac.stranded.sureDetached', { dir: it.dir, branch: it.branch })));
  if (it.ignored?.length) {
    const list = it.ignored.join(', ');
    box.append(el('p', 'st-ignored', tr('mac.stranded.alsoIgnored', { list: it.ignoredMore ? tr('mac.stranded.andMore', { list, n: it.ignoredMore }) : list })));
  }
  const yes = el('button', 'btn btn--sm btn--danger st-yes', tr('mac.stranded.remove')); yes.type = 'button';
  yes.addEventListener('click', async () => {
    if (DEMO) { toast(tr('mac.action.demo')); close(); return; }
    busy.add(it.id); yes.disabled = true; yes.textContent = tr('mac.action.working');
    const r = await post('/api/stranded/remove', { id: it.id });
    busy.delete(it.id);
    toast(r.message || tr(r.ok ? 'mac.action.done' : 'mac.action.failed'), 8000);
    if (r.ok && data) data.items = data.items.filter((x) => x.id !== it.id);
    open = null; gotAt = 0; draw(); refresh(true);
  });
  const no = el('button', 'btn btn--sm', tr('mac.stranded.cancel')); no.type = 'button'; no.addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  const btns = el('div', 'st-form-btns'); btns.append(no, yes);
  box.append(btns);
  return box;
}

async function openIt(it) {
  if (DEMO) { toast(tr('mac.action.demo')); return; }
  busy.add(it.id); draw();
  const r = await post('/api/stranded/open', { id: it.id });
  busy.delete(it.id); draw();
  toast(r.ok ? tr('mac.stranded.opened', { app: r.app || 'Finder' }) : r.message || tr('mac.action.failed'));
}

// the online demo: a few fictional folders (nothing is read or changed)
function demoData() {
  const now = Date.now(), MB = 1024 ** 2, day = 864e5;
  const it = (o) => ({ detached: false, head: 'a1b2c3d', main: false, locked: false, lockReason: '', dirty: 0, ahead: 0, aheadOf: 'upstream', stashes: 0, ok: true, inUse: false, ignored: [], ignoredMore: 0, sizing: false, ...o });
  return { ok: true, at: now, local: true, repos: 2, partial: false, items: [
    it({ id: 'd1', repo: 'landing-page', branch: 'feat/pricing-table', dir: '~/projects/landing-page/.claude/worktrees/pricing', dirty: 4, ahead: 2, last: now - 2 * day, size: 412 * MB, work: true }),
    it({ id: 'd2', repo: 'api-server', branch: 'main', main: true, dir: '~/projects/api-server', dirty: 1, stashes: 1, last: now - 3 * day - 4 * 3600e3, size: 1300 * MB, work: true }),
    it({ id: 'd3', repo: 'landing-page', branch: 'fix/footer-links', dir: '~/projects/landing-page/.claude/worktrees/footer', last: now - 9 * day, size: 640 * MB, removable: true, ignored: ['node_modules/', '.next/'] }),
  ] };
}
