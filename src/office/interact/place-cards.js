// Place cards: what happens at each place.
import { state } from '../core/state.js';
import { $, el, fmtAgo, hhmm, nowMs, short, small, stage } from '../core/env.js';
import { lbl, verb } from '../ui/event-text.js';
import { TYPE_ICON, icon } from '../ui/icons.js';
import { camera, fpCam } from '../scene/renderer.js';
import { lift } from '../world/entrance.js';
import { DESKS } from '../world/desks.js';
import { printPage } from '../world/props/printer.js';
import { colorOf, dn, dnOf, sessions, workers } from '../people/workers.js';
import { director } from '../people/director.js';
import { TIER_METAL, trophyData } from '../life/trophies.js';
import { launchRocket } from '../world/room-update.js';
import { cap } from '../ui/activity.js';
import { openSession } from '../ui/session-drawer.js';
import { setView } from '../ui/camera-bar.js';
import { brewCoffee, catToSofa, feedFish } from './props.js';
import { EDIT_T, PLACES, READ_T, WEB_T, _a } from './place-chips.js';
import { boardContent } from '../ui/whiteboard.js';
import { fp } from './first-person.js';
import { sfx } from '../audio/sfx.js';
import { focusTarget } from '../core/loop.js';
import { t as tr, num, locale } from '../../i18n/index.js';

let plc;
export const plcState = { id: null, prop: null };
export const agoText = (ts) => (ts ? tr('time.ago', { time: fmtAgo((nowMs() - ts) / 1000) }) : '');
export function plRow({ ic = 'sparkle', tone, title, meta, onClick, color }) {
  const b = el(onClick ? 'button' : 'div', 'pl-row'); if (onClick) { b.type = 'button'; b.addEventListener('click', onClick); }
  const i = el('span', 'pl-ico'); if (tone) i.dataset.tone = tone; if (color) i.style.setProperty('--c', color); i.append(icon(ic));
  const t = el('span', 'pl-txt'); t.append(el('b', null, title)); if (meta) t.append(el('small', null, meta));
  b.append(i, t); return b;
}
export const plEmpty = (t) => el('p', 'pl-empty', t);
export const plGroup = (t) => el('p', 'pl-group', t);
function recentEvents(types, n = 8) { const out = []; for (let i = state.feed.length - 1; i >= 0 && out.length < n; i--) if (types.includes(state.feed[i].type)) out.push(state.feed[i]); return out; }
const sessColor = (id) => { const s = sessions.get(id); return s ? colorOf(s) : '#8D97AA'; };
function eventRows(list) {
  const box = el('div', 'pl-rows');
  for (const e of list) box.append(plRow({ ic: TYPE_ICON[e.type] || 'sparkle', color: sessColor(e.sess), title: cap(verb(e)), meta: `${dnOf(e)} · ${agoText(e.ts)}`, onClick: sessions.has(e.sess) ? () => openSession(e.sess) : null }));
  return box;
}
function nowChips(types, verbText) {
  const list = [...sessions.values()].filter((s) => s.status === 'work' && types.includes(s.last?.type));
  if (!list.length) return null;
  const box = el('div', 'pl-now');
  for (const s of list) { const c = el('button', 'pl-chip'); c.type = 'button'; c.style.setProperty('--c', colorOf(s)); c.append(el('i'), el('b', null, dn(s)), document.createTextNode(` ${verbText} ${short(lbl(s.last), 28)}`)); c.addEventListener('click', () => openSession(s.id)); box.append(c); }
  return box;
}
export const plButton = (text, run, cls = '') => { const b = el('button', 'btn btn--sm ' + cls, text); b.type = 'button'; b.addEventListener('click', run); return b; };
// the director's card: trophies reached (newest first), then the next goal of each kind with how far there is to go
function trophyRows(t) {
  const got = t.defs.filter((m) => t.earned[m.id]).sort((a, b) => t.earned[b.id] - t.earned[a.id]), box = el('div', 'pl-rows'), next = el('div', 'pl-rows');
  for (const m of got.slice(0, 6)) { const d = new Date(t.earned[m.id]); box.append(plRow({ ic: 'trophy', color: TIER_METAL[m.tier], title: m.name, meta: `${m.k === 'open' ? tr('places.trophy.keepsake') : tr('places.trophy.cup', { tier: tr('places.trophy.tier' + m.tier) })} · ${d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}` })); }
  const seen = new Set();
  for (const m of t.defs) {
    if (t.earned[m.id] || seen.has(m.k) || m.k === 'open') continue; seen.add(m.k);
    const have = t.totals[m.k] || 0;
    next.append(plRow({ ic: 'trophy', title: m.name, meta: tr('places.trophy.progress', { have: num(have), left: num(m.n - have) }) }));
  }
  const out = [plGroup(tr('places.trophy.shelf', { n: got.length })), got.length ? box : plEmpty(tr('places.trophy.none'))];
  if (next.childElementCount) out.push(plGroup(tr('places.trophy.next')), next);
  if (!t.scanned) out.push(plEmpty(tr('places.trophy.counting')));
  return out;
}
function placeContent(id) {
  const list = [...sessions.values()];
  switch (id) {
    case 'library': {
      const body = el('div'), now = nowChips(READ_T, tr('places.library.now')), ev = recentEvents(READ_T);
      if (now) body.append(now);
      body.append(plGroup(tr('places.library.recent')), ev.length ? eventRows(ev) : plEmpty(tr('places.library.empty')));
      return { icon: 'book', title: tr('places.library.title'), sub: tr('places.library.sub'), body, foot: el('span', null, tr('places.library.today', { n: state.stats.read || 0 })) };
    }
    case 'window': {
      const body = el('div'), now = nowChips(WEB_T, tr('places.window.now')), ev = recentEvents(WEB_T);
      if (now) body.append(now);
      body.append(plGroup(tr('places.window.recent')), ev.length ? eventRows(ev) : plEmpty(tr('places.window.empty')));
      return { icon: 'globe', title: tr('places.window.title'), sub: tr('places.window.sub'), body, foot: el('span', null, tr('places.window.today', { n: state.stats.web || 0 })) };
    }
    case 'deploy': {
      const ev = recentEvents(['deploy', 'push', 'commit', 'cired', 'cigreen']), foot = el('div', 'pl-foot-row'), body = el('div');
      // one row per repository the open sessions work in: branch, uncommitted files, unpushed commits, CI
      const repos = new Map(); for (const x of list) if (x.git && !repos.has(x.git.repo)) repos.set(x.git.repo, x.git);
      if (repos.size) {
        const box = el('div', 'pl-rows'), CI = { red: ['alert', 'red', tr('places.deploy.ciRed')], running: ['sparkle', 'amber', tr('places.deploy.ciRunning')], green: ['check', 'green', tr('places.deploy.ciGreen')] };
        for (const g of repos.values()) {
          const [ic, tone, ciText] = CI[g.ci] || ['file', null, ''];
          const meta = [g.dirty ? tr('places.deploy.dirty', { n: g.dirty }) : tr('places.deploy.clean'), g.ahead ? tr('places.deploy.ahead', { n: g.ahead }) : '', ciText ? `${ciText}${g.ciName ? ` · ${g.ciName}` : ''}` : ''].filter(Boolean).join(' · ');
          box.append(plRow({ ic, tone, title: state.streamer ? tr('places.deploy.aRepo') : `${g.repo} · ${g.branch}`, meta, onClick: g.ciUrl && !state.streamer ? () => window.open(g.ciUrl, '_blank', 'noopener') : null }));
        }
        body.append(plGroup(tr('places.deploy.git')), box);
      }
      body.append(plGroup(tr('places.deploy.recent')), ev.length ? eventRows(ev) : plEmpty(tr('places.deploy.empty')));
      foot.append(el('span', null, tr('places.deploy.today', { n: state.stats.deploy || 0 })), plButton(tr('places.deploy.test'), () => { launchRocket(); sfx.play('deploy'); }, 'btn--accent'));
      return { icon: 'rocket', title: tr('places.deploy.title'), sub: tr('places.deploy.sub'), body, foot };
    }
    case 'door': {
      const ev = recentEvents(['start', 'end'], 10), box = el('div', 'pl-rows');
      for (const e of ev) box.append(plRow({ ic: 'door', color: sessColor(e.sess), title: tr(e.type === 'start' ? 'places.door.came' : 'places.door.went', { name: dnOf(e) }), meta: agoText(e.ts), onClick: sessions.has(e.sess) ? () => openSession(e.sess) : null }));
      return { icon: 'door', title: tr(lift ? 'places.door.titleLift' : 'places.door.title'), sub: tr(lift ? 'places.door.subLift' : 'places.door.sub'), body: ev.length ? box : plEmpty(tr('places.door.empty')), foot: el('span', null, tr('places.door.open', { n: list.length })) };
    }
    case 'coffee': {
      const rest = list.filter((s) => s.status === 'rest').sort((a, b) => (b.doneAt || b.lastAt) - (a.doneAt || a.lastAt)), box = el('div', 'pl-rows');
      for (const s of rest) box.append(plRow({ ic: 'coffee', color: colorOf(s), title: dn(s), meta: s.lastPrompt ? tr('places.coffee.done', { prompt: short(s.lastPrompt, 48), ago: agoText(s.doneAt || s.lastAt) }) : tr('places.coffee.noPrompt'), onClick: () => openSession(s.id) }));
      const foot = el('div', 'pl-foot-row'); foot.append(el('span', null, tr(rest.length ? 'places.coffee.hint' : 'places.coffee.busy')), plButton(tr('places.coffee.brew'), brewCoffee));
      return { icon: 'coffee', title: tr('places.coffee.title'), sub: tr('places.coffee.sub'), body: rest.length ? box : plEmpty(tr('places.coffee.empty')), foot };
    }
    case 'meeting': {
      const body = el('div'), box = el('div', 'pl-rows'), done = el('div', 'pl-rows');
      for (const s of list) for (const x of s.subs || []) box.append(plRow({ ic: 'users', tone: 'blue', title: `${x.type}${x.desc ? ': ' + x.desc : ''}`, meta: tr('places.meeting.steps', { name: s.name, n: x.steps || 0 }), onClick: () => openSession(s.id, { tab: 'subs', agent: x.id }) }));
      for (const s of list) for (const x of (s.doneSubs || []).slice(0, 2)) done.append(plRow({ ic: 'check', title: `${x.type}${x.desc ? ': ' + x.desc : ''}`, meta: tr('places.meeting.doneAt', { name: s.name, time: hhmm(x.endedAt) }), onClick: () => openSession(s.id, { tab: 'subs', agent: x.id }) }));
      body.append(box.childElementCount ? box : plEmpty(tr('places.meeting.empty')));
      if (done.childElementCount) body.append(plGroup(tr('places.meeting.recent')), done);
      return { icon: 'users', title: tr('places.meeting.title'), sub: tr('places.meeting.sub'), body };
    }
    case 'desks': {
      const box = el('div', 'pl-rows');
      for (const s of list.filter((x) => x.desk >= 0).sort((a, b) => a.desk - b.desk)) box.append(plRow({ ic: 'monitor', color: colorOf(s), title: tr('places.desks.row', { n: s.desk + 1, name: dn(s) }), meta: s.status === 'work' && s.last ? cap(verb(s.last)) : s.status === 'wait' ? tr('places.desks.waiting') : s.lastPrompt ? tr('places.desks.resting', { prompt: short(s.lastPrompt, 40) }) : tr('places.desks.noPrompt'), onClick: () => openSession(s.id) }));
      const ev = recentEvents(EDIT_T, 6), body = el('div');
      body.append(box.childElementCount ? box : plEmpty(tr('places.desks.empty')));
      if (ev.length) body.append(plGroup(tr('places.desks.recent')), eventRows(ev));
      return { icon: 'monitor', title: tr('places.desks.title'), sub: tr('places.desks.sub'), body, foot: el('span', null, `${tr('places.desks.free', { n: DESKS.length - list.filter((x) => x.desk >= 0).length })} · ${tr('places.desks.edits', { n: state.stats.edit || 0 })}`) };
    }
    case 'printer': {
      const ev = recentEvents(['stop'], 8), box = el('div', 'pl-rows');
      for (const e of ev) {
        let p = null; for (let i = state.feed.indexOf(e) - 1; i >= 0; i--) if (state.feed[i].sess === e.sess && state.feed[i].type === 'prompt') { p = state.feed[i]; break; }
        box.append(plRow({ ic: 'check', color: sessColor(e.sess), title: p ? `“${short(p.label, 60)}”` : tr('places.printer.turnDone'), meta: `${dnOf(e)} · ${agoText(e.ts)}`, onClick: sessions.has(e.sess) ? () => openSession(e.sess) : null }));
      }
      const foot = el('div', 'pl-foot-row'); foot.append(el('span', null, tr('places.printer.hint')), plButton(tr('places.printer.reprint'), printPage));
      return { icon: 'file', title: tr('places.printer.title'), sub: tr('places.printer.sub'), body: ev.length ? box : plEmpty(tr('places.printer.empty')), foot };
    }
    case 'board': return boardContent();
    case 'director': {
      const body = el('div'), box = el('div', 'pl-rows'), j = director.job;
      if (j) box.append(plRow({ ic: 'clipboard', tone: 'amber', title: tr('places.director.carrying', { name: dn(sessions.get(j.sess)) || tr('places.director.aSession') }), meta: state.streamer ? '' : `“${short(j.text, 60)}”`, onClick: sessions.has(j.sess) ? () => openSession(j.sess) : null }));
      for (const q of director.queue) box.append(plRow({ ic: 'clipboard', title: tr('places.director.queued', { name: dn(sessions.get(q.sess)) || tr('places.director.aSession') }), meta: state.streamer ? '' : `“${short(q.text, 60)}”` }));
      body.append(box.childElementCount ? box : plEmpty(tr('places.director.empty')));
      const ev = recentEvents(['prompt'], 6); if (ev.length) body.append(plGroup(tr('places.director.recent')), eventRows(ev));
      if (trophyData) body.append(...trophyRows(trophyData));
      return { icon: 'home', title: tr('places.director.title'), sub: tr('places.director.sub'), body, foot: el('span', null, tr('places.director.since', { given: tr('places.director.given', { n: director.given }), reports: tr('places.director.reports', { n: director.reports }) })) };
    }
    case 'wc': {
      const inside = [...workers.values()].filter((w) => w.wcBusy), box = el('div', 'pl-rows');
      for (const w of inside) { const s = sessions.get(w.id); if (s) box.append(plRow({ ic: 'door', color: colorOf(s), title: dn(s), meta: tr(w.inStall ? 'places.wc.stall' : 'places.wc.washing'), onClick: () => openSession(s.id) })); }
      return { icon: 'door', title: tr('places.wc.title'), sub: tr('places.wc.sub'), body: inside.length ? box : plEmpty(tr('places.wc.empty')) };
    }
    case 'lounge': {
      const body = el('div'), row = el('div', 'pl-foot-row');
      row.append(plButton(tr('places.lounge.feed'), feedFish), plButton(tr('places.lounge.coin'), () => { state.arcCoin = state.sim + 3; sfx.play('coin'); }), plButton(tr('places.lounge.cat'), catToSofa), plButton(tr('places.lounge.rocket'), () => { launchRocket(); sfx.play('deploy'); }, 'btn--accent'));
      const rest = list.filter((s) => s.status === 'rest'), box = el('div', 'pl-rows');
      for (const s of rest.slice(0, 6)) box.append(plRow({ ic: 'coffee', color: colorOf(s), title: dn(s), meta: s.lastPrompt ? tr('places.lounge.done', { prompt: short(s.lastPrompt, 44) }) : tr('places.lounge.noPrompt'), onClick: () => openSession(s.id) }));
      body.append(rest.length ? box : plEmpty(tr('places.lounge.empty')));
      return { icon: 'sparkle', title: tr('places.lounge.title'), sub: tr('places.lounge.sub'), body, foot: row };
    }
  }
  return null;
}
export function openPlace(id, from = null) {
  if (PLACES[id]?.open) { PLACES[id].open(); return; }
  if (plcState.id === id) { renderPlace(); return; }
  plcState.id = id; plcState.prop = from;
  for (const [k, x] of Object.entries(PLACES)) x.el?.classList.toggle('zone--open', k === id);
  plc.dataset.place = id; plc.hidden = false;
  // glide the camera toward the place so its card has room (not in first person, not while following a session)
  const pl = PLACES[id], at = pl?.pos || from?.center;
  if (at && !fp.on && !state.selectedId) { focusTarget.set(at.x * 0.75, Math.min(at.y, 1.5), at.z * 0.75); state.lastUserCam = performance.now(); setView(null); }
  renderPlace(true);
}
export function closePlace() { if (!plcState.id) return; PLACES[plcState.id]?.el?.classList.remove('zone--open'); plcState.id = null; plc.hidden = true; }
export function renderPlace(first = false) {
  const id = plcState.id; if (!id) return;
  const c = placeContent(id); if (!c) { closePlace(); return; }
  const ic = $('plc-ico'); ic.replaceChildren(icon(c.icon));
  $('plc-title').textContent = c.title; $('plc-sub').textContent = c.sub || '';
  if (id === 'board' && !first && plc.querySelector('.todo-add')) { $('plc-body').querySelector('[data-part="agents"]')?.replaceWith(c.body.querySelector('[data-part="agents"]')); $('plc-body').querySelector('[data-part="mine"]')?.replaceWith(c.body.querySelector('[data-part="mine"]')); }
  else $('plc-body').replaceChildren(c.body);
  const f = $('plc-foot'); f.hidden = !c.foot; if (c.foot) f.replaceChildren(c.foot);
  if (first) { placePlc(); $('plc-close').focus({ preventScroll: true }); }
}
let plcRefresh = 0;
export function queuePlace() { if (!plcState.id) return; clearTimeout(plcRefresh); plcRefresh = setTimeout(() => renderPlace(), 250); }
// Keep the card beside its place while the camera moves; on a phone it is a sheet at the bottom instead.
export function placePlc() {
  if (!plcState.id || small.matches) { plc.style.transform = ''; return; }
  const pl = PLACES[plcState.id], p = plcState.prop;
  const pt = pl?.pos ? _a.copy(pl.pos) : p ? _a.set(p.center.x, p.top, p.center.z) : _a.set(0, 1, 0);
  pt.project(fp.on ? fpCam : camera);
  const W = stage.clientWidth, H = stage.clientHeight, w = plc.offsetWidth, h = plc.offsetHeight;
  const x = (pt.x + 1) / 2 * W, y = (1 - pt.y) / 2 * H;
  let left = x + 22; if (left + w > W - 12) left = x - w - 22; left = Math.max(12, Math.min(left, W - w - 12));
  const top = Math.max(64, Math.min(y - 70, H - h - 16));
  plc.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function setup() {
  /* ---------- place cards ---------- */
  plc = $('plc');
  $('plc-close').addEventListener('click', closePlace);
}
