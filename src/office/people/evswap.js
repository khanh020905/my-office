// A battery swap (world/backdrops/street-ev.js). The e-scooters in the row in front of the building show this
// computer's battery (the Mac panel's reading, passed on here); when it drops under 20%, the owner of the emptiest one
// (not swapped today), if resting, says so
// in the group chat ("Xe em còn 15% pin, chạy ra tủ đổi pin cái 🔋"), goes down, rides it to the battery-swap cabinet
// on the corner, takes the empty pack out from under the seat, scans the QR code (9.000đ), puts it into the locker
// that opens, waits for the cabinet to give a charged 1.5 kWh one (two or three minutes in all), puts it in and rides
// back: the bike shows full for the rest of the day. One at a time, not more than once in twenty minutes. Work coming
// in calls them back at a run (the scooter comes back with them). With the city outside only. ?battery=15: a low
// reading; ?debug: __office.evswap.
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { later } from './errands.js';
import { dn, hash, sessions, workers } from './workers.js';
import { bikeColor, called, coatOf, evOf, goDown, goUp, here, live, outside, resume, rowOf, street, walk } from './outings.js';
import { macSnap } from '../ui/mac-drawer.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

let T = null, last = null, lookAt = 0, readAt = 0, nextAt = 0;   // the swap under way (last: the one before, for tests)
const free = (w) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length; };
const say = (w, key, v) => w.say('idle', tr(key, v));

// the computer's battery under 20%: the emptiest e-scooter in the row (not swapped today) whose owner is in, resting
// and free; null: none
function emptiest(S, E) {
  const bat = E.battery();
  if (!bat || bat.pct >= 20 || bat.charging) return null;
  let best = null;
  for (const sp of rowOf(S)?.spots || []) {
    if (sp.id < 1000 || sp.busy || !sp.by) continue;
    const w = workers.get(sp.by), lv = E.level(sp.id - 1000);
    if (!w || lv == null || lv >= 100 || !free(w) || !evOf(w)) continue;
    if (!best || lv < best.lv) best = { w, sp, lv };
  }
  return best;
}

function go(S, E, { w, sp, lv }) {
  const R = rowOf(S), ex = R?.ex, cab = E.cabinet();
  if (!ex || !cab) return false;
  T = { kind: 'evswap', w, sp, ex, lv, stage: 'go', since: state.sim, dead: false, legs: [] };
  T.drop = () => drop(T);
  w.outing = T; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim;
  sp.busy = true;
  chatLife('evLow', { id: w.id, pct: lv, every: 60e3 });
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(T, 'go')) return;
    w.anim = 'idle'; say(w, 'people.ev.say.go', { pct: lv });
    goDown(w, T, () => {
      T.stage = 'walk'; outside(w, S, ex);
      const at = S.at(ex.L, sp.s, S.pavementSide);
      walk(w, S, S.route(here(w), at) || [at], () => { if (live(T, 'walk')) ride(S, E, ex.L, sp.s, R.side, 'away'); });
    });
  };
  queueUi();
  return true;
}
// on and off along the street: the parked scooter becomes the traffic's own (drawn electric), out of sight, and back in
// at `to` (the cabinet's kerb, or the row)
function ride(S, E, L, s, side, leg) {
  const w = T.w, color = bikeColor(w), jacket = coatOf(w);
  S.unparkBike(T.parked ?? T.sp.id); T.parked = null; if (leg === 'away') T.sp.id = -1;
  const h = S.depart(L, s, { livery: 'plain', paint: color, jacket, side });
  if (h) { E.ride(h, color, jacket); h.release(); T.legs.push(h); }
  w.offstage = true; w.street = true; T.stage = leg === 'home' ? 'rideHome' : 'ride'; queueUi();
  later(rand(10, 16), () => {
    if (!T || T.dead) return;
    const to = leg === 'home' ? { L: T.ex.L, s: T.sp.s, side: rowOf(S).side, far: 38 } : { ...E.cabinet().kerb, side: 1.92, far: 45 };
    const h2 = S.callRider(to.L, to.s, { livery: 'plain', paint: color, jacket, side: to.side, far: to.far });
    if (!h2) { arrive(S, E, leg, to); return; }
    E.ride(h2, color, jacket); T.legs.push(h2); T.wait = { h: h2, leg, to };
  });
}
// off the scooter (parked where it stopped) and on foot
function arrive(S, E, leg, to) {
  const w = T.w; T.wait = null;
  if (leg === 'home') {
    T.sp.id = S.parkBike(to.L, to.s, to.side, bikeColor(w), true, hash(w.id)); T.sp.busy = false;
    if (T.full) E.fill(T.sp.id - 1000);
    const at = S.at(to.L, to.s, S.pavementSide);
    T.stage = 'walkUp'; outside(w, S, at); w.carry = null;
    walk(w, S, S.route(at, T.ex) || [T.ex], () => live(T, 'walkUp') && goUp(w, T, () => w.homeSpot(), () => { if (T?.full) chatLife('evDone', { id: w.id, every: 60e3 }); finish(T); resume(w, false); }));
    return;
  }
  const id = S.parkBike(to.L, to.s, to.side, bikeColor(w), true, hash(w.id)); T.parked = id;
  const at = S.at(to.L, to.s, S.pavementSide), front = E.cabinet().front;
  T.stage = 'swap'; outside(w, S, at); queueUi();
  // the empty pack out from under the seat, to the cabinet, the QR code, into the locker; the charged one out
  const quick = !!T.quick, step = (secs, fn) => later(quick ? Math.min(secs, 1.5) : secs, () => live(T, 'swap') && fn());
  w.anim = 'tidy';
  step(4, () => {
    w.carry = 'pack';
    walk(w, S, [{ x: front.x, z: front.z }], () => {
      if (!live(T, 'swap')) return;
      w.faceTarget = front.face; w.anim = 'film'; E.say(tr('people.ev.say.scan'));
      step(4, () => {
        E.pay(); E.open(8); w.anim = 'tidy';
        step(5, () => {
          w.carry = null; w.anim = 'think'; E.say(tr('people.ev.say.wait'));
          step(rand(95, 140), () => {
            E.open(6); w.anim = 'tidy';
            step(4, () => {
              w.carry = 'pack'; E.say(tr('people.ev.say.full'));
              walk(w, S, [at], () => {
                if (!live(T, 'swap')) return;
                w.anim = 'tidy';
                step(4, () => { w.carry = null; T.full = true; ride(S, E, to.L, to.s, to.side, 'home'); });
              });
            });
          });
        });
      }, front.face);
    }, front.face);
  });
}
function finish(R) {
  if (R.dead) return;
  R.dead = true; R.stage = 'gone';
  const w = R.w; w.outing = null; w.chore = null; w.hurry = false; w.carry = null; w.street = false; w.offstage = false;
  nextAt = state.sim + 20 * 60;
  last = debug.state(); if (T === R) T = null;
  queueUi();
}
// called off (the session ended, a replay, the city went away): the scooter back in its place, them at their desk
function drop(R) {
  if (R.dead) return;
  const S = street(), E = S?.ev;
  for (const h of R.legs) { E?.unride(h); if (h.state === 'waiting') h.vanish(); }
  if (S && R.parked != null) S.unparkBike(R.parked);
  if (S && R.sp.id < 0) R.sp.id = S.parkBike(R.ex.L, R.sp.s, rowOf(S)?.side ?? S.pavementSide + 0.75, bikeColor(R.w), true, hash(R.w.id));
  R.sp.busy = false;
  finish(R);
  const w = R.w;
  if (w.leaving) return;
  w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
  const at = w.homeSpot(); w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
  resume(w, false);
}
/** for the session list (outings.js whereabouts) */
export function evNow(R) {
  const st = R.stage === 'swap' ? 'swap' : R.stage === 'ride' ? 'ride' : R.stage === 'rideHome' || R.stage === 'walkUp' || R.stage === 'up' ? 'back' : 'going';
  return { ic: 'walk', text: tr(`people.ev.where.${st}`) };
}

/* ---------- each frame (from outings.js) ---------- */
export function updateEvswap() {
  const S = street(), E = S?.ev;
  if (!E) return;
  // the computer's battery to the scooters' gauges (the Mac panel's reading: every 30 s, or 5 s with it open)
  if (state.sim > readAt) { readAt = state.sim + 2; E.reading(macSnap); }
  if (T) { step(S, E); return; }
  if (replay.on || state.sim < 20 || state.sim < lookAt || state.sim < nextAt) return;
  lookAt = state.sim + 15;
  const pick = emptiest(S, E);
  if (pick) go(S, E, pick);
}
function step(S, E) {
  if (!S || replay.on) { drop(T); return; }
  // the ride pulled in where it was going: off it
  if (T.wait && T.wait.h.state === 'waiting') { const { h, leg, to } = T.wait; E.unride(h); h.vanish(); arrive(S, E, leg, to); return; }
  if (T.wait && T.wait.h.state === 'gone') { arrive(S, E, T.wait.leg, T.wait.to); return; }
  // work came in on the way there or at the cabinet: back with the scooter now
  if (['walk', 'swap'].includes(T.stage) && called(T.w) && !T.recalled) {
    T.recalled = true; T.w.hurry = true; say(T.w, 'people.ev.say.work');
    if (T.stage === 'walk') { T.sp.busy = false; finish(T); T = null; return; }
    const to = { ...E.cabinet().kerb, side: 1.92 };
    T.stage = 'swap-recall'; ride(S, E, to.L, to.s, to.side, 'home');
  }
  if (state.sim - T.since > 900 && !T.dead) drop(T);   // (stuck: back home)
}

/* ---------- for tests (?debug): a swap now (the emptiest e-scooter, whatever its charge), what's going on ---------- */
const debug = {
  go: (quick = true) => {
    const S = street(), E = S?.ev; if (T || !E) return false;
    let best = null;
    for (const sp of rowOf(S)?.spots || []) { const w = sp.by && workers.get(sp.by); if (sp.id >= 1000 && !sp.busy && w && free(w)) { const lv = E.level(sp.id - 1000) ?? 50; if (!best || lv < best.lv) best = { w, sp, lv }; } }
    if (!best || !go(S, E, best)) return false;
    T.quick = quick; return true;
  },
  state: () => (!T ? last : { stage: T.stage, id: T.w.id, name: dn(sessions.get(T.w.id)), lv: T.lv, full: !!T.full, at: officeNow().toTimeString().slice(0, 5) }),
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.evswap = debug; }, 0);
