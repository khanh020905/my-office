// Lunch at the quán cơm bình dân across the street (world/backdrops/eat-com.js). Every Friday (bún đậu mắm tôm day) and
// about one other weekday in three (the same for everyone that day), at about twenty past eleven a few people resting go
// down for lunch instead of the GrabFood (outings.js orders none on these days): an invitation in the company's group
// chat, down in the lift, over the street, onto the stools at the stainless table, a plate each (rice, thịt kho trứng,
// rau muống, the canh chua; 35k) or the mẹt on a Friday, a laugh now and then; then "Cô ơi, tính tiền!", the bill from
// the auntie, and back up for the nap. Work coming in calls one back at a run. With the city outside only.
// ?com: today, now; ?bundau: a Friday; ?debug: __office.com.
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { later } from './errands.js';
import { dn, hash, sessions, workers } from './workers.js';
import { called, goDown, goUp, here, live, mainExit, outside, resume, street, walk } from './outings.js';
import { homeLunch } from './comnha.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { isWorkday } from '../../shared/workdays.js';
import { t as tr } from '../../i18n/index.js';

const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FORCE = P.has('com') || P.has('bundau');
let L = null, last = null;   // today's lunch (last: the one before, for tests): { members, stage: 'going' | 'on' | 'end', since, endAt, fri, Q, day }
let decided = '', lookAt = 0;
// resting and free to go (as for the quán nhậu, people/nhau.js), and not had lunch yet today
const free = (w, day = officeNow().toDateString()) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length && w.lunchDay !== day
  && !w.micro && !homeLunch(w); };   // (whoever brought lunch from home warms it here instead: people/comnha.js)
const say = (w, key) => w.say('idle', tr(key));

/** whether the office goes down to the quán for lunch today (then no GrabFood is ordered): Fridays, and about one other
    working day in three (a make-up Saturday too); never at the weekend nor on a holiday, nor with no quán on the street */
export function comPlanned(d = officeNow()) {
  if (!street()?.com) return false;
  const wd = d.getDay();
  return FORCE || (isWorkday(d) && (wd === 5 || hash(`${d.toDateString()}:com`) % 100 < 34));
}

function start(list, Q) {
  const d = officeNow();
  L = { members: [], stage: 'going', since: state.sim, endAt: Infinity, fri: Q.friday(), Q, day: d.toDateString() };
  chatLife('com', { id: list[0].id, friday: L.fri, every: 6 * 3600e3 });   // (the one who asks goes too)
  // one by one, a few seconds apart; whoever got busy meanwhile is replaced by someone else free
  list.forEach((w, i) => later(1.5 + i * rand(2, 4), () => enlist(free(w, L?.day) ? w : spare())));
  queueUi();
}
const spare = () => [...workers.values()].find((x) => free(x, L?.day) && !L?.members.some((m) => m.w === x)) || null;
function enlist(w) {
  const S = street(), Q = S?.com, ex = S && mainExit(S);
  if (!w || !L || L.stage === 'end' || L.members.length >= 4 || L.members.some((m) => m.w === w) || !Q || !ex) return;
  const m = { kind: 'com', w, i: L.members.length, stage: 'go', ex, dead: false };
  m.drop = () => drop(m);
  L.members.push(m);
  w.outing = m; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim; w.lunchDay = L.day;
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;   // a stretch first
  w.after = () => {
    if (!live(m, 'go')) return;
    w.anim = 'idle'; say(w, L?.fri ? 'people.com.say.goBd' : 'people.com.say.go');
    goDown(w, m, () => {
      m.stage = 'walk'; outside(w, S, ex); w.hurry = FORCE;
      const seat = Q.seats()[m.i % 4];
      walk(w, S, [...(S.route(ex, Q.entry()) || []), { x: seat.x, z: seat.z }], () => live(m, 'walk') && sit(m, seat), seat.face);
    });
  };
  sync();
}
function sit(m, seat) {
  const w = m.w;
  m.stage = 'sit'; m.seat = seat;
  w.pos.set(seat.x, seat.z); w.spot = { x: seat.x, z: seat.z, face: seat.face, sit: true }; w.face = w.faceTarget = seat.face;
  w.pose = 'sit'; w.ground = seat.y; w.anim = 'eat'; w.hurry = false;
  if (!L) return;
  if (L.stage === 'going') { L.stage = 'on'; L.endAt = state.sim + (FORCE ? rand(45, 60) : rand(18, 26) * 60); L.Q.hello(); }
  else if (L.stage === 'end') { const S = street(); later(rand(20, 35), () => { if (live(m, 'sit') && S) { L?.Q.bill(1); leave(m, S); } }); }   // (late: a quick plate, then up too)
  say(w, L.fri ? 'people.com.say.sitBd' : 'people.com.say.sit');
  sync();
}
function stand(m) { const w = m.w, S = street(); w.pose = 'stand'; w.anim = 'idle'; if (S) w.ground = S.pavement; }
// from the stool to the pavement, along the street to the door, up: the nap after lunch
function home(m, S) {
  const w = m.w, Q = S.com, from = Q ? Q.entry() : here(w);
  walk(w, S, [from, ...(S.route(from, m.ex) || [])], () => live(m, m.stage) && goUp(w, m, () => w.homeSpot(), () => { finish(m); resume(w, false); }));
}
function leave(m, S) { m.stage = 'back'; stand(m); home(m, S); sync(); }
// work came in: up at a run (the rest go on eating)
function backToWork(m, S) { m.stage = 'back'; m.w.hurry = true; say(m.w, 'people.com.say.work'); stand(m); home(m, S); sync(); }
// "Cô ơi, tính tiền!": the bill for everyone at the table, then up one by one
function pay(S, Q) {
  L.stage = 'end';
  const seated = L.members.filter((m) => m.stage === 'sit');
  for (const m of L.members) if (m.stage === 'go') drop(m);   // (still upstairs: never mind)
  if (!seated.length) return;
  say(seated[0].w, 'people.com.say.pay');
  later(1.6, () => { if (L) Q.bill(seated.length); });
  if (seated[1]) later(3.4, () => live(seated[1], 'sit') && say(seated[1].w, 'people.com.say.thanks'));
  seated.forEach((m, k) => later(4.5 + k * rand(0.8, 1.6), () => live(m, 'sit') && leave(m, S)));
}
function finish(m) {
  if (m.dead) return;
  const w = m.w;
  m.dead = true; m.stage = 'gone';
  w.outing = null; w.chore = null; w.hurry = false;
  sync();
}
// called off: the session ended (Worker.leave takes them away), a replay began, the city went away: back at their place
function drop(m) {
  if (m.dead) return;
  finish(m);
  const w = m.w;
  if (w.leaving) return;
  if (w.street || w.offstage || w.liftRide || w.liftWait) {
    w.street = w.offstage = false; w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
    const at = w.homeSpot(); w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
    resume(w, false);
  } else { w.after = null; w.anim = 'idle'; w.restAt = state.sim; }
}
// the quán's table and the session list: who is there
function sync() {
  if (!L) return;
  L.Q?.setGroup(L.members.filter((m) => !m.dead).map((m) => ({ name: dn(sessions.get(m.w.id)) || m.w.cfg.name, stage: m.stage })));
  queueUi();
}
/** for the session list (outings.js whereabouts) */
export function comNow(m) {
  const st = m.stage === 'sit' ? 'eating' : m.stage === 'back' || m.stage === 'up' ? 'back' : 'going';
  return { ic: 'coffee', text: tr(`people.com.where.${st}${L?.fri && st !== 'back' ? 'Bd' : ''}`) };
}
// you, walking in, sat down with them
function youCame() { if (L) for (const m of L.members) if (live(m, 'sit')) { m.w.anim = 'laugh'; m.animUntil = state.sim + 2.5; say(m.w, 'people.com.say.boss'); } }

/* ---------- each frame (from outings.js) ---------- */
export function updateCom() {
  const S = street(), Q = S?.com;
  if (L) { stepLunch(S, Q); return; }
  if (!Q || replay.on || state.sim < 15 || state.sim < lookAt) return;
  lookAt = state.sim + 20;
  Q.onYou(youCame);
  const d = officeNow(), day = d.toDateString(), m = d.getHours() * 60 + d.getMinutes();
  if (decided === day || (FORCE && decided === 'forced') || !Q.open()) return;
  // 11:20–11:55 on the days it's planned (?com: now)
  if (!FORCE && !(comPlanned(d) && m >= 680 && m < 715)) return;
  const list = [...workers.values()].filter((w) => free(w, day)).sort(() => Math.random() - 0.5).slice(0, 4);
  if (list.length < (FORCE ? 1 : 2)) return;
  decided = FORCE ? 'forced' : day;
  start(list, Q);
}
function stepLunch(S, Q) {
  if (!S || !Q || replay.on) { for (const m of [...L.members]) drop(m); L = null; return; }
  const seated = L.members.filter((m) => m.stage === 'sit');
  for (const m of seated) if (called(m.w)) backToWork(m, S);
  // between bites: a laugh, a word, a sip of the trà đá
  for (const m of seated) {
    if (m.stage !== 'sit') continue;
    if (m.animUntil && state.sim > m.animUntil) { m.animUntil = 0; m.w.anim = 'eat'; }
    if (!m.animUntil && state.sim > (m.nextBit || 0)) {
      m.nextBit = state.sim + rand(14, 30); const r = Math.random();
      if (r < 0.3) { m.w.anim = 'laugh'; m.animUntil = state.sim + rand(2, 3.5); } else if (r < 0.45) { m.w.anim = 'coffee'; m.animUntil = state.sim + rand(2.5, 4); }
    }
  }
  if (L.stage === 'on' && seated.length && (state.sim > L.endAt || !Q.open())) pay(S, Q);
  // nobody has set off yet (all busy when asked): ask whoever is free now
  if (L.stage === 'going' && !L.members.length && state.sim - L.since > 25 && state.sim > (L.retryAt || 0)) { L.retryAt = state.sim + 15; enlist(spare()); }
  const left = L.members.filter((m) => !m.dead);
  if ((L.members.length && !left.length && L.stage !== 'going') || (L.stage === 'going' && !left.length && state.sim - L.since > 240)) { last = debug.state(); L = null; Q.setGroup([]); }
}

/* ---------- for tests (?debug): today's now, the bill now, what's going on ---------- */
const debug = {
  go: () => { const S = street(), Q = S?.com; if (L || !Q?.open()) return 0; const day = officeNow().toDateString(), list = [...workers.values()].filter((w) => free(w, day)).slice(0, 4); if (!list.length) return 0; decided = FORCE ? 'forced' : day; start(list, Q); return list.length; },
  end: () => { if (!L || L.stage !== 'on') return false; L.endAt = 0; return true; },
  planned: () => comPlanned(),
  state: () => (!L ? last : { stage: L.stage, friday: L.fri, members: L.members.map((m) => ({ id: m.w.id, stage: m.stage })) }),
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.com = debug; }, 0);
