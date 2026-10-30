// An evening at the quán nhậu across the street (world/backdrops/street-nhau.js). On Fridays at about half past six
// (and one evening in four on other weekdays, from six), a few people resting call it a day and go down for a few rounds:
// an invitation in the company's group chat, packed up and down in the lift, over the street, onto the stools at the
// long table; every minute or two "Một, hai, ba… dô!" (glasses up, a clink, the cheeks a little redder each round), a
// laugh, a bite of the mồi. Work coming in calls one back to the office at a run. When it's time, nobody rides their own
// scooter: "Đã uống rượu bia thì không lái xe" in the chat, a GrabBike, a Xanh SM bike or taxi to the kerb, and the
// scooter stays in the row in front of the building till the morning (outings.js: leftBike). With the city outside only.
// ?nhau: tonight, now (whoever is resting); ?debug: __office.nhau.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { lift } from '../world/entrance.js';
import { later } from './errands.js';
import { dn, hash, sessions, workers } from './workers.js';
import { called, coatOf, goUp, here, live, mainExit, outside, settleIn, street, walk, wayOf } from './outings.js';
import { chatSay } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nhau');
let NH = null, last = null;   // tonight's (last: the one before, for tests): { members, stage: 'going' | 'on' | 'end', since, endAt, nextToast, toasts, Q }
let decided = '';   // the day it was settled (once a day; ?nhau: once)
let lookAt = 0;
// resting and free to go: not out, not on the way somewhere, nothing in hand (asleep at the desk or not: walkOut packs
// up at the desk first, wherever they are)
const free = (w) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length; };
const hour = () => { const d = officeNow(); return d.getHours() + d.getMinutes() / 60; };

/* a glass of beer on ice in the hand, instead of the mug (the 'coffee', 'toast' and 'eat' poses hold P.mug) */
let glassGeo = null;
function beer(w, on) {
  const mug = w.P?.mug; if (!mug) return;
  if (!mug.userData.beer) {
    glassGeo ??= [new THREE.CylinderGeometry(0.05, 0.042, 0.13, 14), new THREE.CylinderGeometry(0.051, 0.051, 0.02, 14).translate(0, 0.07, 0)];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(glassGeo[0], new THREE.MeshStandardMaterial({ color: '#E3A12C', roughness: 0.15, transparent: true, opacity: 0.88 })), new THREE.Mesh(glassGeo[1], new THREE.MeshStandardMaterial({ color: '#FFF8E8', roughness: 0.6 })));
    g.visible = false; mug.add(g); mug.userData.beer = g;
  }
  for (const c of mug.children) c.visible = c === mug.userData.beer ? on : !on;
}
/* the cheeks: the chibi's blush (people/chibi-rig.js), a little stronger and redder each round */
const BLUSH = new THREE.Color('#FF8E8E'), FLUSH = new THREE.Color('#FF4A4A');
function blush(w, n) {
  if (!w.blushM) w.root.traverse((o) => { if (!w.blushM && o.material?.isMeshBasicMaterial && o.material.transparent && o.material.color.getHex() === BLUSH.getHex()) { w.blushM = o.material; w.blush0 = o.material.opacity; } });
  if (!w.blushM) return;
  const k = Math.min(1, n / 6);
  w.blushM.opacity = w.blush0 + (0.88 - w.blush0) * k; w.blushM.color.copy(BLUSH).lerp(FLUSH, k);
}

/* the evening: who, from when, how long */
function start(list, S, Q) {
  NH = { members: [], stage: 'going', since: state.sim, endAt: state.sim + (FORCE ? rand(150, 200) : rand(55, 95) * 60), nextToast: Infinity, toasts: 0, Q };
  chatSay(list[0].id, tr('world.nhau.chat.invite'));
  list.slice(1).forEach((w, k) => chatSay(w.id, tr('world.nhau.chat.yes'), { delay: 2500 + k * 2200 }));
  // one by one, a few seconds apart; whoever got busy meanwhile (a coffee, the loo) is replaced by someone else free
  list.forEach((w, i) => later(1.5 + i * rand(2.5, 5), () => enlist(free(w) ? w : spare())));
  queueUi();
}
const spare = () => [...workers.values()].find((x) => free(x) && !NH?.members.some((m) => m.w === x)) || null;
function enlist(w) {
  if (!w || !NH || NH.stage === 'end' || NH.members.length >= 4 || NH.members.some((m) => m.w === w)) return;
  const m = { kind: 'nhau', w, i: NH.members.length, stage: 'pack', drinks: 0, dead: false };
  m.drop = () => drop(m);
  NH.members.push(m); w.nhau = m;
  w.say('idle', tr('world.nhau.say.go'));
  w.goHomeNow();   // (packed up and down in the lift; at the street door outings.js's goHome sends them here: joinNhau)
}
/** at the street door (outings.js goHome): over to the quán and onto a stool; false: home the usual way */
export function joinNhau(w, gone) {
  const m = w.nhau, S = street(), Q = S?.nhau, ex = S && mainExit(S);
  if (!m || !NH || NH.stage === 'end' || !Q?.open() || !ex) { if (m) { m.dead = true; m.stage = 'gone'; } w.nhau = null; return false; }   // (too late: home the usual way)
  m.gone = gone; m.stage = 'down'; w.outing = m; w.chore = { outing: true }; w.station = 'nhau'; w.restAt = Infinity; w.offstage = true;
  later(lift ? 3 : 1, () => {
    if (!live(m, 'down')) return;
    m.stage = 'walk'; outside(w, S, ex); w.hurry = FORCE;   // (?nhau: over at a run, for a look without the wait)
    const seat = Q.seats()[m.i % 6];
    walk(w, S, [...(S.route(ex, Q.entry()) || []), { x: seat.x, z: seat.z }], () => live(m, 'walk') && sit(m, seat), seat.face);
  });
  sync();
  return true;
}
function sit(m, seat) {
  const w = m.w;
  m.stage = 'sit'; m.seat = seat;
  w.pos.set(seat.x, seat.z); w.spot = { x: seat.x, z: seat.z, face: seat.face, sit: true }; w.face = w.faceTarget = seat.face;
  w.pose = 'sit'; w.ground = seat.y; w.anim = 'coffee'; w.hurry = false; beer(w, true);
  w.say('idle', tr('world.nhau.say.sit'));
  if (NH.nextToast === Infinity) NH.nextToast = state.sim + (FORCE ? 5 : rand(25, 50));
  if (NH.stage === 'going') NH.stage = 'on';
  else if (NH.stage === 'end') { const S = street(); later(rand(3, 6), () => { if (live(m, 'sit') && S?.nhau) callRide(m, S, S.nhau, NH?.members.indexOf(m) ?? 0); }); }   // (late, and the rest are off: one drink, then home too)
  sync();
}
function stand(m) {
  const w = m.w, S = street();
  w.pose = 'stand'; w.anim = 'idle'; if (S) w.ground = S.pavement; beer(w, false);
}
// "Một, hai, ba… dô!": glasses up, a clink, a round more each
function toast(seated) {
  NH.nextToast = state.sim + (FORCE ? rand(14, 22) : rand(70, 160));
  const lead = seated[Math.floor(Math.random() * seated.length)];
  for (const m of seated) { m.w.anim = 'toast'; m.animUntil = state.sim + 3.2; }
  lead.w.say('idle', tr('world.nhau.say.mot'));
  NH.toasts++;
  later(1.4, () => {
    if (!NH) return;
    for (const m of seated) if (live(m, 'sit')) { m.w.say('idle', tr('world.nhau.say.do')); m.drinks++; blush(m.w, m.drinks); }
    NH.Q.toast(); sync();
  });
  if (NH.toasts === 1) chatSay(lead.w.id, tr('world.nhau.chat.cheers'), { delay: 3000 });
}
// work came in: back to the office at a run (a drink in them: home by Grab later on)
function backToWork(m, S) {
  const w = m.w;
  m.stage = 'back'; w.drank = officeNow().toDateString(); w.hurry = true;
  w.say('idle', tr('world.nhau.say.work')); stand(m);
  walk(w, S, S.route(here(w), mainExit(S)) || [], () => live(m, 'back') && goUp(w, m, () => w.homeSpot(), () => {
    finish(m); w.homeBound = false; w.hurry = false; settleIn(w);
  }));
  sync();
}
// time to go: nobody drives after a drink
function endNight(S, Q) {
  NH.stage = 'end';
  for (const m of NH.members) if (m.stage === 'pack') { m.dead = true; m.stage = 'gone'; m.w.nhau = null; }   // (still packing up: home the usual way)
  const seated = NH.members.filter((m) => m.stage === 'sit');
  if (!seated.length) return;
  seated[0].w.say('idle', tr('world.nhau.say.noDrive'));
  chatSay(seated[0].w.id, tr('world.nhau.chat.noDrive'));
  if (seated[1]) chatSay(seated[1].w.id, tr('world.nhau.chat.grab'), { delay: 3200 });
  seated.forEach((m, k) => later(2 + k * rand(2, 3.5), () => { if (live(m, 'sit')) callRide(m, S, Q, k); }));
}
function callRide(m, S, Q, k) {
  const w = m.w, own = wayOf(w), way = own === 'bike' ? (Math.random() < 0.6 ? 'grab' : 'xsm') : own;
  w.drank = officeNow().toDateString();
  if (own === 'bike') { w.leftBike = true; later(1.2, () => !m.dead && w.say('idle', tr('world.nhau.say.leaveBike'))); }
  stand(m);
  const kerb = Q.kerb(k % 4), at = Q.pickup(k % 4);
  m.way = way; m.ride = S.callRider(kerb.L, kerb.s, { livery: way, far: FORCE ? 34 : 60 }); m.stage = 'walkout';
  walk(w, S, [{ x: at.x, z: at.z }], () => { if (live(m, 'walkout')) { m.stage = 'wait'; m.since = state.sim; } });
  sync();
}
function stepRide(m) {
  const w = m.w, r = m.ride;
  if (!r || r.state === 'gone' || state.sim - m.since > 400) { if (r?.state === 'coming') r.cancel(); else r?.release(); homeNow(m); return; }   // (no ride after all: off on foot, out of sight; the rider on their way)
  if (r.state !== 'waiting') return;
  m.stage = 'board'; const p = r.where(); w.faceTarget = Math.atan2(p.x - w.pos.x, p.z - w.pos.y);
  later(0.7, () => { if (!live(m, 'board')) return; r.board(coatOf(w)); later(0.6, () => r.release()); homeNow(m); });
}
function homeNow(m) { const gone = m.gone, w = m.w; w.offDay = officeNow().toDateString(); finish(m); w.street = false; w.offstage = false; w.path = []; w.phase = 'idle'; w.onArrive = null; gone?.(); }
function finish(m) {
  if (m.dead) return;
  const w = m.w;
  m.dead = true; if (m.stage !== 'walkout' && m.stage !== 'wait' && m.stage !== 'board') m.stage = 'gone'; else m.stage = 'home';
  w.outing = null; w.chore = null; w.nhau = null; w.hurry = false;
  beer(w, false); blush(w, 0);
  sync();
}
// called off: the session ended (Worker.leave takes them away), a replay began, the city went away
function drop(m) {
  if (m.dead) return;
  m.ride?.cancel?.(); m.ride?.release?.();
  const out = m.stage !== 'pack' && m.stage !== 'back';
  finish(m);
  if (out && !m.w.leaving) { const w = m.w; w.street = w.offstage = false; w.path = []; w.phase = 'idle'; w.onArrive = null; m.gone?.(); }
}
// the quán's card and the session list: who is there, how many rounds
function sync() {
  if (!NH) return;
  NH.Q?.setGroup(NH.members.filter((m) => !m.dead || m.stage === 'home').map((m) => ({ name: dn(sessions.get(m.w.id)) || m.w.cfg.name, stage: stageOf(m), drinks: m.drinks })));
  queueUi();
}
const stageOf = (m) => (m.stage === 'sit' ? 'sit' : m.stage === 'back' ? 'work' : ['walkout', 'wait', 'board', 'home'].includes(m.stage) ? 'home' : 'coming');
/** for the session list (outings.js whereabouts) */
export function nhauNow(m) {
  const st = stageOf(m), Q = street()?.nhau;
  return { ic: 'coffee', text: tr(`world.nhau.where.${st}`, { name: Q?.name() || '', n: m.drinks, how: tr(`world.nhau.how.${m.way || 'grab'}`) }) };
}
// you, walking in, sat down with them: they cheer
function youCame() {
  if (!NH) return;
  for (const m of NH.members) if (live(m, 'sit')) { m.w.anim = 'toast'; m.animUntil = state.sim + 3; m.w.say('idle', tr('world.nhau.say.boss')); }
}

/* ---------- each frame (from outings.js) ---------- */
export function updateNhau() {
  const S = street(), Q = S?.nhau;
  if (NH) { stepNight(S, Q); return; }
  if (!Q || replay.on || state.sim < 15 || state.sim < lookAt) return;
  lookAt = state.sim + 20;
  Q.onYou(youCame);
  const d = officeNow(), day = d.toDateString(), h = hour();
  if (decided === day || (FORCE && decided === 'forced') || !Q.open()) return;
  // Fridays 18:30–19:30 for sure; on another weekday, one evening in four, 18:00–20:00
  if (!FORCE && !(d.getDay() === 5 ? h >= 18.5 && h < 19.5 : d.getDay() > 0 && d.getDay() < 5 && h >= 18 && h < 20 && (hash(day) % 100) < 25)) return;
  const list = [...workers.values()].filter(free).sort(() => Math.random() - 0.5).slice(0, 4);
  if (list.length < (FORCE ? 1 : 2)) return;
  decided = FORCE ? 'forced' : day;
  start(list, S, Q);
}
function stepNight(S, Q) {
  if (!S || !Q || replay.on) { for (const m of [...NH.members]) drop(m); NH = null; return; }
  const seated = NH.members.filter((m) => m.stage === 'sit');
  for (const m of seated) if (called(m.w)) backToWork(m, S);
  if (NH.stage === 'on' && seated.length && state.sim > NH.nextToast) toast(seated.filter((m) => m.stage === 'sit'));
  // between rounds: a sip, now and then a laugh or a bite of the mồi
  for (const m of seated) {
    if (m.stage !== 'sit') continue;
    if (m.animUntil && state.sim > m.animUntil) { m.animUntil = 0; m.w.anim = 'coffee'; }
    if (!m.animUntil && state.sim > (m.nextBit || 0)) {
      m.nextBit = state.sim + rand(12, 30); const r = Math.random();
      if (r < 0.35) { m.w.anim = 'laugh'; m.animUntil = state.sim + rand(2, 3.5); } else if (r < 0.6) { m.w.anim = 'eat'; m.animUntil = state.sim + rand(3, 5); }
    }
  }
  if (NH.stage !== 'end' && seated.length && (state.sim > NH.endAt || !Q.open() || hour() >= 22.6)) endNight(S, Q);
  for (const m of NH.members) if (m.stage === 'wait') stepRide(m);
  // nobody has set off yet (all busy when asked): ask whoever is free now
  if (NH.stage === 'going' && !NH.members.length && state.sim - NH.since > 25 && state.sim > (NH.retryAt || 0)) { NH.retryAt = state.sim + 15; enlist(spare()); }
  // over: everyone gone (or nobody came after all)
  const left = NH.members.filter((m) => !m.dead);
  if ((NH.members.length && !left.length && NH.stage !== 'going') || (NH.stage === 'going' && !left.length && state.sim - NH.since > 240)) { last = debug.state(); NH = null; Q.setGroup([]); }
}

/* ---------- for tests (?debug): tonight now, the end now, what's going on ---------- */
const debug = {
  go: () => { const S = street(), Q = S?.nhau; if (NH || !Q?.open()) return 0; const list = [...workers.values()].filter(free).slice(0, 4); if (!list.length) return 0; decided = FORCE ? 'forced' : officeNow().toDateString(); start(list, S, Q); return list.length; },   // (tonight's: no second one on its own after it)
  end: () => { const S = street(), Q = S?.nhau; if (!NH || NH.stage === 'end' || !S || !Q) return false; NH.endAt = 0; endNight(S, Q); return true; },
  toast: () => { if (!NH) return false; NH.nextToast = 0; return true; },
  state: () => (!NH ? last : { stage: NH.stage, toasts: NH.toasts, members: NH.members.map((m) => ({ id: m.w.id, stage: m.stage, drinks: m.drinks, way: m.way || null, ride: m.ride?.state || null, leftBike: !!m.w.leftBike, away: !!m.w.away })) }),
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.nhau = debug; }, 0);
