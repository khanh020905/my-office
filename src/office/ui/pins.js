// "Ghi nhớ cho Claude" (server: /api/pins, /hook/start): what you want a conversation to keep in mind, said to Claude
// again each time Claude Code compacts it. The session drawer's "Ghi nhớ" tab: the notes, one to add, ✕ to unpin. The
// demo keeps them in the page.
import { $, el, hhmm } from '../core/env.js';
import { state } from '../core/state.js';
import { TOKEN } from '../net/live.js';
import { DEMO } from '../demo/demo.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const tq = (q = '') => `${q}${TOKEN ? `${q ? '&' : '?'}k=${encodeURIComponent(TOKEN)}` : ''}`;
const demoPins = new Map();   // session id -> [{ id, text, at }]
let draft = '';   // (what is being typed survives the tab being drawn again)
async function load(id) {
  if (DEMO) return { ok: true, list: demoPins.get(id) || [], said: 0 };
  try { return await (await fetch(tq(`/api/pins?id=${encodeURIComponent(id)}`))).json(); } catch { return { ok: false }; }
}
async function change(id, body) {
  if (DEMO) {
    const list = demoPins.get(id) || [];
    if (body.op === 'add') list.push({ id: Math.random().toString(36).slice(2, 10), text: body.text, at: Date.now() });
    demoPins.set(id, body.op === 'del' ? list.filter((x) => x.id !== body.pin) : list);
    return { ok: true, list: demoPins.get(id), said: 0 };
  }
  try { return await (await fetch(tq('/api/pins'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })).json(); } catch { return null; }
}

/** The tab's body for the open session. */
export async function renderPins() {
  const id = state.selectedId; if (!id) return;
  const d = await load(id);
  if (state.selectedId !== id || $('tab-pins').getAttribute('aria-selected') !== 'true') return;   // (another session or tab meanwhile)
  draw(id, d);
}
function draw(id, d) {
  const body = $('ds-body'), box = el('div', 'pins');
  box.append(el('p', 'pins-intro', tr('drawer.pins.intro')));
  const list = el('ul', 'pins-list');
  for (const p of d?.list || []) {
    const li = el('li'), x = el('button', 'pins-x', '✕'); x.type = 'button'; x.title = tr('drawer.pins.remove'); x.setAttribute('aria-label', tr('drawer.pins.remove'));
    x.addEventListener('click', async () => { const r = await change(id, { op: 'del', pin: p.id }); if (r?.ok) draw(id, r); else toast(r?.message || tr('drawer.unreachable')); });
    li.append(el('span', null, p.text), x); list.append(li);
  }
  if (!d?.list?.length) list.append(el('li', 'pins-empty', tr('drawer.pins.empty')));
  const form = el('form', 'pins-form'), input = el('textarea', 'pins-in'), add = el('button', 'btn btn--sm btn--primary', tr('drawer.pins.add'));
  input.rows = 2; input.maxLength = 500; input.placeholder = tr('drawer.pins.placeholder'); input.value = draft; add.type = 'submit';
  input.addEventListener('input', () => { draft = input.value; });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    add.disabled = true;
    const r = await change(id, { op: 'add', text });
    add.disabled = false;
    if (!r?.ok) { toast(r?.message || tr('drawer.unreachable'), 6000); return; }
    draft = ''; draw(id, r); $('ds-body').querySelector('.pins-in')?.focus();
  });
  form.append(input, add);
  box.append(list, form);
  if (d?.said) box.append(el('small', 'pins-said', tr('drawer.pins.said', { time: hhmm(d.said) })));
  body.replaceChildren(box);
}
/** The tab's label: how many are pinned. */
export function pinsLabel(s) { const n = s?.pins || 0; $('tab-pins').textContent = n ? tr('drawer.pins.tabN', { n }) : tr('drawer.pins.tab'); }
