// "Hoàn tác lượt cuối" (server/undo.mjs): in the session drawer, what undoing the last turn would do to each file, two
// clicks to do it, then what was done and "Tell Claude" (it doesn't know its files were put back otherwise).
import { $, el, hhmm, short } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const tq = (q = '') => `${q}${TOKEN ? `${q ? '&' : '?'}k=${encodeURIComponent(TOKEN)}` : ''}`;
const post = (body) => fetch(tq('/api/undo'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
const base = (f) => String(f).split(/[\\/]/).pop();

/** Shows it in the drawer's body for session `s`; back() returns to the drawer's tabs. */
export async function openUndo(s, back) {
  const body = $('ds-body'); body.replaceChildren(el('p', 'chat-empty', tr('drawer.loadingChat')));
  let d = null; try { d = await (await fetch(tq(`/api/undo?id=${encodeURIComponent(s.id)}`))).json(); } catch { /* unreachable */ }
  const box = el('div', 'undo'), cancel = el('button', 'btn btn--sm', tr('drawer.undo.cancel')); cancel.type = 'button'; cancel.addEventListener('click', back);
  if (!d?.ok) { box.append(el('p', 'muted', tr('drawer.unreachable')), cancel); body.replaceChildren(box); return; }
  box.append(el('h3', 'undo-h', tr('drawer.undo.btn')), el('p', 'undo-intro', tr('drawer.undo.intro', { prompt: short(d.prompt, 80), time: hhmm(d.at) })));
  const list = el('ul', 'undo-list');
  for (const x of d.files) {
    const li = el('li', `is-${x.action}`); li.title = x.file;
    li.append(el('span', 'undo-f', base(x.file)), el('small', null, tr(`drawer.undo.act.${x.action}`)));
    list.append(li);
  }
  box.append(list);
  const n = d.files.filter((x) => x.action === 'restore' || x.action === 'delete').length, acts = el('div', 'undo-acts');
  if (!n) { box.append(el('p', 'muted', tr('drawer.undo.none'))); acts.append(cancel); box.append(acts); body.replaceChildren(box); return; }
  const go = el('button', 'btn btn--sm undo-go', tr('drawer.undo.go', { n })); go.type = 'button';
  let armT = 0;
  go.addEventListener('click', async () => {
    if (!go.classList.contains('is-sure')) { go.classList.add('is-sure'); go.textContent = tr('drawer.undo.sure'); clearTimeout(armT); armT = setTimeout(() => { if (go.isConnected) { go.classList.remove('is-sure'); go.textContent = tr('drawer.undo.go', { n }); } }, 8000); return; }   // (8 s for the second click: a phone, a slow machine)
    go.disabled = cancel.disabled = true;
    const r = await post({ id: s.id });
    if (!r?.ok) { toast(r?.message || tr('drawer.unreachable'), 7000); openUndo(s, back); return; }
    done(s, r, back);
  });
  acts.append(go, cancel); box.append(acts);
  body.replaceChildren(box);
}
function done(s, r, back) {
  const box = el('div', 'undo'), files = r.done.map((x) => x.file);
  box.append(el('h3', 'undo-h', tr('drawer.undo.btn')), el('p', 'undo-done', tr('drawer.undo.done', { n: files.length, dir: r.after })));
  const list = el('ul', 'undo-list');
  for (const x of r.done) { const li = el('li', `is-${x.action}`); li.title = x.file; li.append(el('span', 'undo-f', base(x.file)), el('small', null, tr(`drawer.undo.act.${x.action}`))); list.append(li); }
  const tell = el('button', 'btn btn--sm btn--primary', tr('drawer.undo.tell')), ok = el('button', 'btn btn--sm', tr('drawer.undo.cancel')); tell.type = ok.type = 'button';
  tell.addEventListener('click', async () => {
    tell.disabled = true;
    const t = await post({ id: s.id, op: 'tell', files: files.join(', ') });
    if (t?.ok) toast(tr('drawer.undo.told'), 3000); else { tell.disabled = false; toast(t?.message || tr('drawer.unreachable'), 7000); }
  });
  ok.addEventListener('click', back);
  const acts = el('div', 'undo-acts'); acts.append(tell, ok);
  box.append(list, el('p', 'muted undo-note', tr('drawer.undo.tellNote')), acts);
  $('ds-body').replaceChildren(box);
}
