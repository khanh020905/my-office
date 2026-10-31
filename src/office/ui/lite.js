// List mode: the sessions as cards, no 3D.
import { $, el, fmtClock, nowMs, short } from '../core/env.js';
import { colorOf, dn, sessions } from '../people/workers.js';
import { doingOf } from './activity.js';
import { cacheWords } from './cache-words.js';
import { openSession } from './session-drawer.js';
import { closePlace } from '../interact/place-cards.js';
import { exitFp, fp } from '../interact/first-person.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- list mode: no 3D, just the sessions as cards (needs you / working / resting). Saves the battery on a
   phone and works without WebGL. Idea from agent-office's lite page (MIT). ---------- */
export let lite = false;
export function setLite(on) {
  lite = on; document.body.classList.toggle('is-lite', on); $('lite').hidden = !on; $('btn-lite').setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('office-lite', on ? 'on' : 'off'); } catch { /* storage blocked */ }
  if (on) { if (fp.on) exitFp(); closePlace(); renderLite(); }
}
export function renderLite() {
  if (!lite) return;
  const box = $('lite'), list = [...sessions.values()];
  const groups = [['wait', tr('lite.wait'), (s) => s.status === 'wait'], ['work', tr('lite.work'), (s) => s.status === 'work'], ['rest', tr('lite.rest'), (s) => s.status === 'rest']];
  const frag = document.createDocumentFragment();
  if (!list.length) frag.append(el('p', 'lite-empty', tr('lite.empty')));
  for (const [key, title, f] of groups) {
    const rows = list.filter(f).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)); if (!rows.length) continue;
    frag.append(el('h3', 'lite-h', `${title} · ${rows.length}`));
    for (const s of rows) {
      const c = el('button', 'lite-card'); c.type = 'button'; c.dataset.status = key; c.style.setProperty('--c', colorOf(s));
      const st = doingOf(s), top = el('div', 'lite-top');
      top.append(el('i'), el('b', null, dn(s)));
      const proj = String(s.dir || '').split('/').filter(Boolean).pop(); if (proj && proj !== dn(s)) top.append(el('span', 'ri-proj', proj));
      c.append(top, el('span', 'lite-now', st.text));
      if (s.lastPrompt) c.append(el('span', 'lite-task', `“${short(s.lastPrompt, 90)}”`));
      const meta = [s.subs?.length ? tr('lite.subs', { n: s.subs.length }) : '', s.usage ? tr('lite.ctx', { pct: Math.round((s.usage.ctx / s.usage.ctxMax) * 100) }) : '', s.taskStart && s.status !== 'rest' ? fmtClock((nowMs() - s.taskStart) / 1000) : '',
        s.status === 'rest' ? cacheWords(s.cache, 'lite').text : ''].filter(Boolean).join(' · ');   // (resting: the coffee on its desk, warm or cold)
      if (meta) c.append(el('small', null, meta));
      c.addEventListener('click', () => openSession(s.id));
      frag.append(c);
    }
  }
  box.replaceChildren(frag);
}

export function setup() {
  try { lite = localStorage.getItem('office-lite') === 'on'; } catch { /* storage blocked */ }
  $('btn-lite').addEventListener('click', () => setLite(!lite));
  setInterval(() => { if (lite) renderLite(); }, 2000);
}
