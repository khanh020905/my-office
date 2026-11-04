// Settings → More: "Approve from the Mac's notifications" (on by default; kept by the server, data/prefs.json). On, the
// menu bar app's banners can allow or deny a request while you are at the Mac (server/mac-hold.mjs). This computer only.
import { $, STATIC } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
let on = true;
const draw = () => { const box = $('st-macapprove'); if (!box) return; box.hidden = false; box.querySelector('[data-mac-tgl]').setAttribute('aria-checked', String(on)); };
async function load() { const r = await fetch(`/api/macapprove${tq()}`).then((x) => x.json()).catch(() => null); if (r?.ok) { on = !!r.on; draw(); } }   // (a phone gets a 403: the box stays hidden)

export function setup() {
  const box = $('st-macapprove'); if (!box || DEMO) return;
  $('btn-look')?.addEventListener('click', () => { if (!$('pop-look').hidden) load(); });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-mac-tgl]')) return;
    const r = await fetch(`/api/macapprove${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !on }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { on = !!r.on; draw(); } else toast(r?.message || tr('drawer.unreachable'), 6000);
  });
  load();
}
