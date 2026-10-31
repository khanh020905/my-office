// How a session's prompt cache reads on screen ("Đồng hồ bộ nhớ đệm", src/shared/cache-clock.js; the cups on the desks
// are world/props/cups.js): the line under the session drawer's folder, the one under the chat's "Gửi tới" and in its
// list of conversations, list mode's cards, and the switch in Settings → More for the "about to go cold" notification.
import { $, STATIC, nowMs } from '../core/env.js';
import { state } from '../core/state.js';
import { sessions } from '../people/workers.js';
import { TOKEN } from '../net/live.js';
import { cacheClock } from '../../shared/cache-clock.js';
import { t as tr, num } from '../../i18n/index.js';

const mins = (ms) => Math.max(1, Math.round(ms / 60e3));
const tok = (n) => (n >= 1e6 ? `${num(n / 1e6, 1)}M` : `${Math.max(1, Math.round(n / 1000))}k`);
/** cache (a session's, from the server) -> { state: 'warm' | 'cold' | 'none', text } in the words of `kind`: 'drawer'
    ("Bộ nhớ đệm còn ấm ~23 phút"), 'chat' ("còn ấm ~23 phút · nhắn tiếp rẻ"), 'chatShort' (a phone's: "☕ còn ấm 23 phút")
    or 'lite' (the same, on list mode's cards). */
export function cacheWords(cache, kind = 'drawer') {
  const k = cacheClock(cache, nowMs());
  if (k.state === 'none') return { state: 'none', text: '' };
  const tokens = tok(k.tokens);
  let text;
  if (kind === 'lite') text = k.state === 'warm' ? tr('lite.cacheWarm', { n: mins(k.left) }) : tr('lite.cacheCold');
  else if (kind === 'chatShort') text = k.state === 'warm' ? tr('chat.to.cacheWarmShort', { n: mins(k.left) }) : tr('chat.to.cacheColdShort', { tokens });
  else if (kind === 'chat') text = k.state === 'warm' ? tr('chat.to.cacheWarm', { n: mins(k.left) }) : tr(k.tokens ? 'chat.to.cacheCold' : 'chat.to.cacheColdNoSize', { tokens });
  else text = `${k.state === 'warm' ? tr('drawer.cache.warm', { n: mins(k.left) }) : tr(k.tokens ? 'drawer.cache.cold' : 'drawer.cache.coldNoSize', { tokens })}${k.guessed ? ` ${tr('drawer.cache.guessed')}` : ''}`;
  return { state: k.state, text };
}
/** The session drawer's line (session-drawer.js draws the rest of its head). */
export function drawDrawerCache() {
  const p = $('ds-cache'); if (!p) return;
  const s = sessions.get(state.selectedId), w = s ? cacheWords(s.cache) : { state: 'none', text: '' };
  p.hidden = !w.text; p.dataset.state = w.state;
  if (p.textContent !== w.text) p.textContent = w.text;
}

/* ---------- Settings → More: a phone told when a session waiting for you is about to go cold (the server's, off) ---------- */
const DEMO = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
let nudge = null;
function drawNudge() { const b = document.querySelector('[data-cache-nudge]'); if (!b || nudge == null) return; $('st-cache').hidden = false; b.setAttribute('aria-checked', String(nudge)); }
async function loadNudge() { const r = await fetch(`/api/cache${tq()}`).then((x) => x.json()).catch(() => null); if (r?.ok) { nudge = !!r.nudge; drawNudge(); } }

export function setup() {
  // the minutes go by between updates: the drawer's line again every 20 s while it is open
  setInterval(() => { if ($('dr-session') && !$('dr-session').hidden) drawDrawerCache(); }, 20_000);
  if (DEMO || !$('st-cache')) return;
  $('btn-look')?.addEventListener('click', () => { if (!$('pop-look').hidden) loadNudge(); });
  document.querySelector('[data-cache-nudge]')?.addEventListener('click', async () => {
    if (nudge == null) return;
    const r = await fetch(`/api/cache${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nudge: !nudge }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { nudge = !!r.nudge; drawNudge(); }
  });
  loadNudge();
}
