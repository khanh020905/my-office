// Pickleball after work (world/backdrops/street-pickle.js). On a day the CI has stayed green (server/git.mjs through
// each session's git.ci: none of the repositories red today, at least one green; the online demo has no CI, so any day
// there), at about five someone resting asks in the company's group chat "Tối nay kèo pick không?" (the court is 280k an
// hour after five, 70k each); at half past, four people resting go down: down in the lift, along the street to the
// court by the park, in at the gate, visors on, and doubles: the serve, the return, the drop, the dinks at the kitchen
// line, the odd lob. A fifth, if one is free, films it from the side; else someone waiting on the bench films for them.
// A test run while they play is the next point (its passing tests the shots over the net, the first failing one into
// the net). After about an hour, or when work calls them back one by one (the neighbourhood makes up the numbers: "ghép
// kèo"), the clip goes into the chat ("70k mỗi người nha") and back up. Fewer than four free: the neighbourhood makes up
// the numbers from the start. With the city outside only. ?pickle: today, now; ?debug: __office.pickle.
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { DEMO } from '../demo/demo.js';
import { later } from './errands.js';
import { dn, sessions, workers } from './workers.js';
import { called, goDown, goUp, here, live, mainExit, outside, resume, street, walk } from './outings.js';
import { chatLife, chatPhoto } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('pickle');
let L = null, last = null;   // tonight's game (last: the one before, for tests): { members, stage: 'going' | 'on' | 'end', since, endAt, day }
let asked = '', played = '', lookAt = 0;
let ci = { day: '', red: false, green: false, seen: false };
// resting and free to go (as for lunch at the quán cơm, people/comtrua.js)
const free = (w) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length; };
const say = (w, key) => w.say('idle', tr(key));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- today's CI: a red run at any time today spoils it ---------- */
function watchCi() {
  const day = officeNow().toDateString();
  if (ci.day !== day) ci = { day, red: false, green: false, seen: false };
  for (const s of sessions.values()) { const c = s.git?.ci; if (c) ci.seen = true; if (c === 'red') ci.red = true; else if (c === 'green') ci.green = true; }
}
/** the CI has stayed green today (no CI anywhere: only in the online demo, which has none) */
export const greenDay = () => FORCE || (ci.seen ? ci.green && !ci.red : DEMO);
/** a red CI run (life/incidents.js): no game tonight */
export function pickleCi(e) { if (e.type === 'cired') { watchCi(); ci.red = true; } }

function start(list, Q) {
  const d = officeNow();
  L = { members: [], stage: 'going', since: state.sim, endAt: Infinity, day: d.toDateString(), Q, booked: false, firstIn: 0 };
  played = L.day;
  // four on the court (the neighbourhood making up the numbers), the fifth with the phone
  list.slice(0, 5).forEach((w, i) => later(1 + i * rand(1.5, 3), () => enlist(free(w) ? w : spare(), i < 4 ? 'play' : 'film')));
  queueUi();
}
const spare = () => [...workers.values()].find((x) => free(x) && !L?.members.some((m) => m.w === x)) || null;
function enlist(w, role) {
  const S = street(), Q = S?.pickle, ex = S && mainExit(S);
  if (!w || !L || L.stage === 'end' || L.members.some((m) => m.w === w) || !Q || !ex) return;
  if (role === 'film' && L.members.some((m) => m.role === 'film')) return;
  const slots = L.members.filter((m) => m.role === 'play').map((m) => m.slot);
  const slot = role === 'play' ? [0, 2, 1, 3].find((k) => !slots.includes(k)) : -1;   // (two a side: the first two on opposite sides)
  if (role === 'play' && slot == null) return;
  const m = { kind: 'pickle', w, role, slot, stage: 'go', ex, dead: false };
  m.drop = () => drop(m);
  L.members.push(m);
  w.outing = m; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim;
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(m, 'go')) return;
    w.anim = 'idle'; say(w, 'people.pickle.say.go');
    goDown(w, m, () => {
      m.stage = 'walk'; outside(w, S, ex); w.hurry = FORCE;
      const gate = Q.gate(), inside = Q.inside();
      walk(w, S, [...(S.route(ex, gate) || []), gate, inside], () => live(m, 'walk') && arrive(m), 0);
    });
  };
  sync();
}
// in at the gate: the visor on, a stretch; then to their place when the court is the office's
function arrive(m) {
  const w = m.w;
  m.stage = 'in'; w.hurry = false; w.ground = L?.Q.ground ?? w.ground; w.anim = 'idle';
  if (L && !L.firstIn) L.firstIn = state.sim;
  say(w, m.role === 'film' ? 'people.pickle.say.film' : 'people.pickle.say.ready');
  sync();
}
function book(Q) {
  if (!L || L.booked) return;
  const players = L.members.filter((m) => m.role === 'play' && m.stage === 'in');
  if (!players.length) return;
  L.booked = true; L.stage = 'on'; L.endAt = state.sim + (FORCE ? rand(120, 160) : rand(45, 60) * 60);
  const filmer = L.members.find((m) => m.role === 'film' && m.stage === 'in');
  Q.book(players.map((m) => m.slot), !filmer);
  for (const m of players) { m.stage = 'play'; m.w.anim = 'paddle'; m.w.pose = 'stand'; }
  if (filmer) { filmer.stage = 'film'; const s = Q.watch(); filmer.w.pos.set(s.x, s.z); filmer.w.face = filmer.w.faceTarget = s.face; filmer.w.ground = s.y; filmer.w.anim = 'film'; }
  sync();
}
// from the court, out of the gate and back along the street, up to the desk
function home(m, S) {
  const w = m.w, Q = S.pickle, from = Q ? Q.gate() : here(w);
  w.anim = 'idle'; w.pose = 'stand'; w.P.shuffle = false;
  walk(w, S, [Q ? Q.inside() : from, from, ...(S.route(from, m.ex) || [])], () => live(m, m.stage) && goUp(w, m, () => w.homeSpot(), () => { finish(m); resume(w, false); }));
}
function leave(m, S) { if (m.role === 'play' && m.stage === 'play') S.pickle?.free(m.slot); m.stage = 'back'; home(m, S); sync(); }
// work came in: off the court at a run (a neighbour takes the paddle)
function backToWork(m, S) { if (m.role === 'play' && m.stage === 'play') S.pickle?.free(m.slot); m.stage = 'back'; m.w.hurry = true; say(m.w, 'people.pickle.say.work'); home(m, S); sync(); }
// the hour is up: the clip into the chat, everyone's share, off home
function wrapUp(S, Q) {
  L.stage = 'end';
  for (const m of L.members) if (m.stage === 'go') drop(m);
  const there = L.members.filter((m) => ['in', 'play', 'film'].includes(m.stage));
  const who = there.find((m) => m.role === 'film') || there[0];
  if (who) {
    say(who.w, 'people.pickle.say.end');
    const n = there.filter((m) => m.role === 'play').length;
    later(1.2, () => chatLife('pickleDone', { id: who.w.id, photo: chatPhoto(Q.object()), share: shareOf(n), every: 6 * 3600e3 }));
  }
  there.forEach((m, k) => later(2.5 + k * rand(0.6, 1.2), () => !m.dead && leave(m, S)));
  Q.release();
}
const shareOf = (n) => `${(Math.round(280 / Math.max(1, Math.min(4, n || 4)))).toLocaleString('vi-VN')}k`;
function finish(m) {
  if (m.dead) return;
  const w = m.w;
  m.dead = true; m.stage = 'gone';
  w.outing = null; w.chore = null; w.hurry = false; w.P.shuffle = false;
  sync();
}
// called off: the session ended, a replay began, the city went away: back at their place
function drop(m) {
  if (m.dead) return;
  finish(m);
  const w = m.w;
  if (w.leaving) return;
  if (w.street || w.offstage || w.liftRide || w.liftWait || m.stage === 'play' || m.stage === 'film') {
    w.street = w.offstage = false; w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
    const at = w.homeSpot(); w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
    resume(w, false);
  } else { w.after = null; w.anim = 'idle'; w.restAt = state.sim; }
}
function sync() { queueUi(); }
/** for the session list (outings.js whereabouts) */
export function pickleNow(m) {
  const st = m.stage === 'play' || m.stage === 'in' ? (m.role === 'film' ? 'filming' : 'playing') : m.stage === 'film' ? 'filming' : m.stage === 'back' || m.stage === 'up' ? 'back' : 'going';
  return { ic: 'walk', text: tr(`people.pickle.where.${st}`) };
}
/** a test run (life/incidents.js): the office's next point on the court */
export function pickleTest(e) { if (L?.stage === 'on') street()?.pickle?.test(e); }

/* ---------- each frame (from outings.js) ---------- */
const at = {};
export function updatePickle() {
  const S = street(), Q = S?.pickle;
  if (L) { stepGame(S, Q); return; }
  if (!Q || replay.on || state.sim < 15 || state.sim < lookAt) return;
  lookAt = state.sim + 20;
  watchCi();
  const d = officeNow(), day = d.toDateString(), m = d.getHours() * 60 + d.getMinutes();
  if (played === day && !FORCE) return;
  // ~17:00 the question in the group chat; from 17:25 the four go (?pickle: now)
  if (!FORCE && (!greenDay() || m < 1015 || m >= 1095)) return;
  if (!FORCE && asked !== day) { asked = day; const r = [...workers.values()].filter(free); if (r.length) chatLife('pickleAsk', { id: pick(r).id, every: 6 * 3600e3 }); return; }
  if (!FORCE && m < 1045) return;
  const list = [...workers.values()].filter(free).sort(() => Math.random() - 0.5);
  if (list.length < (FORCE ? 1 : 2)) return;
  if (FORCE) played = day;
  start(list, Q);
}
function stepGame(S, Q) {
  if (!S || !Q || replay.on) { for (const m of [...L.members]) drop(m); Q?.release(); last = debug.state(); L = null; return; }
  const live2 = L.members.filter((m) => !m.dead);
  for (const m of live2) if (['in', 'play', 'film'].includes(m.stage) && called(m.w)) backToWork(m, S);
  // the court is theirs once everyone on their way is in (or a minute and a half after the first)
  if (!L.booked && L.firstIn && (L.members.every((m) => m.stage !== 'go' && m.stage !== 'walk') || state.sim - L.firstIn > 90)) book(Q);
  // the players where the game puts them: in place, facing the ball, the paddle's swing
  if (L.stage === 'on') {
    for (const m of L.members) {
      if (m.stage !== 'play' || m.dead) continue;
      const w = m.w, p = Q.player(m.slot, at);
      w.pos.set(p.x, p.z); w.faceTarget = p.face; w.ground = p.y; w.anim = 'paddle'; w.P.swing = p.swing; w.P.shuffle = p.moving; w.phase = 'idle';
    }
    if (!L.members.some((m) => !m.dead && m.role === 'play' && m.stage === 'play') || state.sim > L.endAt) wrapUp(S, Q);
  }
  // nobody set off (all busy when asked): ask whoever is free now
  if (L.stage === 'going' && !L.members.length && state.sim - L.since > 25 && state.sim > (L.retryAt || 0)) { L.retryAt = state.sim + 15; enlist(spare(), 'play'); }
  const left = L.members.filter((m) => !m.dead);
  if ((L.members.length && !left.length && L.stage !== 'going') || (L.stage === 'going' && !left.length && state.sim - L.since > 240)) { last = debug.state(); Q.release(); L = null; }
}

/* ---------- for tests (?debug): tonight's game now, its end now, what's going on ---------- */
const debug = {
  go: () => { const S = street(), Q = S?.pickle; if (L || !Q) return 0; const list = [...workers.values()].filter(free); if (!list.length) return 0; start(list, Q); return Math.min(5, list.length); },
  end: () => { if (!L || L.stage !== 'on') return false; L.endAt = 0; return true; },
  green: () => greenDay(),
  ci: () => ({ ...ci }),
  state: () => (!L ? last : { stage: L.stage, booked: L.booked, members: L.members.map((m) => ({ id: m.w.id, name: dn(sessions.get(m.w.id)), role: m.role, slot: m.slot, stage: m.stage })) }),
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.pickle = debug; }, 0);
