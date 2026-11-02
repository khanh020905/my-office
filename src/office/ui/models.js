// "Model: người điều phối và subagent" (Settings → More; server/models.mjs): the model a Claude session runs on, the one
// its subagents run on, always that one or only when Claude doesn't pick, and the note asking Claude to split big tasks.
// Read from the server each time Settings opens; on the Mac only (it writes Claude Code's own settings).
import { $, STATIC } from '../core/env.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
let conf = null;
function draw() {
  const box = $('st-models'); if (!box || !conf) return;
  box.hidden = false;
  for (const b of box.querySelectorAll('[data-model-main]')) { b.setAttribute('aria-pressed', String(b.dataset.modelMain === conf.main)); b.disabled = conf.readOnly; }
  for (const b of box.querySelectorAll('[data-model-sub]')) { b.setAttribute('aria-pressed', String(b.dataset.modelSub === conf.sub)); b.disabled = conf.readOnly; }
  const force = box.querySelector('[data-model-force]');
  force.setAttribute('aria-checked', String(!!conf.force)); force.disabled = conf.readOnly || !conf.sub;   // (forcing "the same as the session" means nothing)
  box.querySelector('[data-model-split]').setAttribute('aria-checked', String(!!conf.split));
  // a model set by hand that the buttons don't offer (a full model id, say): shown, and kept until one is picked
  const other = [!conf.main_.includes(conf.main) && conf.main, !conf.sub_.includes(conf.sub) && conf.sub].filter(Boolean);
  const note = $('st-models-other'); note.hidden = !other.length && !conf.readOnly;
  note.textContent = conf.readOnly ? tr('settings.models.readOnly') : tr('settings.models.other', { model: other.join(' · ') });
}
async function load() {
  if (DEMO) return;
  const r = await fetch('/api/models').then((x) => x.json()).catch(() => null);
  if (r?.ok) { conf = r; draw(); }   // (a phone is refused: the section stays hidden there)
}
async function save(change) {
  const r = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }).then((x) => x.json()).catch(() => null);
  if (!r?.ok) { toast(r?.message || tr('drawer.unreachable'), 6000); return; }
  conf = r; draw(); toast(tr('settings.models.saved'), 5000);
}
export function setup() {
  const box = $('st-models'); if (!box || DEMO) return;
  $('btn-look')?.addEventListener('click', () => { if (!$('pop-look').hidden) load(); });   // (fresh each time Settings opens)
  box.addEventListener('click', (e) => {
    if (!conf || conf.readOnly && !e.target.closest('[data-model-split]')) return;
    const m = e.target.closest('[data-model-main]'); if (m && !m.disabled) { save({ main: m.dataset.modelMain }); return; }
    const s = e.target.closest('[data-model-sub]'); if (s && !s.disabled) { save({ sub: s.dataset.modelSub }); return; }
    const f = e.target.closest('[data-model-force]'); if (f && !f.disabled) { save({ force: !conf.force }); return; }
    if (e.target.closest('[data-model-split]')) save({ split: !conf.split });
  });
  load();
}
