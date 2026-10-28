// Going out: before lunch a GrabFood rider brings the team's lunch to the kerb and whoever is resting goes down for it;
// now and then someone resting pops down to the convenience store across the street and comes back with a drink. Down
// in the lift (or out of the door), along the pavements and over the zebras when the green man shows (the city's walk
// network, street-life.js), into the shop, back up the same way. Work coming in calls them back at a run. And coming and
// going: home late by the street (their own scooter from the row on the pavement, a GrabBike, a Xanh SM bike or taxi),
// back the same way in the morning. Only with the city outside; one trip out at a time, several comings and goings.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, V2, officeNow, rand, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { mat } from '../scene/blocks.js';
import { DZ, LIFT_X, lift, liftArrive } from '../world/entrance.js';
import { THEME, THEMES } from '../world/backdrops/index.js';
import { DESK_SPOTS, DOOR_IN, DOOR_OUT, STATIONS, allocate } from './navigation.js';
import { showMeal } from './breaks.js';
import { later } from './errands.js';
import { hash, sessions, streetHooks, workers } from './workers.js';
import { ANIM_AT, verb } from '../ui/event-text.js';
import { sfx } from '../audio/sfx.js';
import { queueUi } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

let run = null;     // the outing under way: { kind: 'shop' | 'lunch', w, stage, … }
let lookAt = 90;    // (sim seconds) the next look for a trip to the shop: not in the first minute and a half
let lunchDay = '';  // the day the lunch was ordered
const street = () => (THEMES && THEME === THEMES.city && THEME.live?.street) || null;
const say = (w, text) => { w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 4500); };
// asleep at their own place, nothing else going on: free to go out
const resting = (w) => !w.sub && w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && w.phase !== 'walk'
  && !w.liftHold && !w.liftWait && !w.inStall && !w.wcBusy && !w.queued && w.anim === 'sleep' && w.station === 'desk'
  && sessions.get(w.id)?.status === 'rest' && !sessions.get(w.id)?.bg?.length;
const called = (w) => { const s = sessions.get(w.id); return !!w.want || !s || s.status !== 'rest' || !!s.bg?.length; };   // work came in
const live = (R, stage) => !R.dead && R.stage === stage;
// where you leave the office from inside: the lift, or the door
const indoors = () => (lift ? { x: LIFT_X, z: DZ } : { x: DOOR_OUT.x, z: DOOR_OUT.z });

// the street's points as a path to walk: each leg's ground (pavement, or the road on a crossing) and the crossings' gates
function walk(w, S, pts, cb, face) {
  if (!pts?.length) { cb(); return; }
  w.path = pts.map((p) => Object.assign(new V2(p.x, p.z), { y0: p.road ? S.road : S.pavement, gate: p.gate }));
  const end = pts[pts.length - 1];
  w.spot = { x: end.x, z: end.z, face: face ?? w.face };
  w.pose = 'stand'; w.phase = 'walk'; w.onArrive = cb;
}
const here = (w) => ({ x: w.pos.x, z: w.pos.y });
// down to the street: the lift (wait for it, step in, the doors shut, down) or out of the door, then unseen a moment
function goDown(w, R, cb) {
  const stage = R.stage, gone = () => { if (!live(R, stage)) return; w.offstage = true; later(lift ? 3 : 1, () => live(R, stage) && cb()); };
  w.goTo(DOOR_IN, () => {
    if (!live(R, stage)) return;
    if (!lift) { w.goTo(DOOR_OUT, gone); return; }
    w.anim = 'idle'; w.faceTarget = DOOR_IN.face;
    w.liftWait = () => w.goTo(DOOR_OUT, () => { w.faceTarget = Math.PI / 2; w.liftRide = gone; });
  });
}
function outside(w, S, at) { w.offstage = false; w.street = true; w.ground = S.pavement; w.pos.set(at.x, at.z); w.spot = { x: at.x, z: at.z, face: w.face }; }
// in at the street door and up: unseen a moment, then out of the lift (or in at the door) and on to where `to()` says
function goUp(w, R, to, cb) {
  R.stage = 'up'; w.offstage = true; w.street = false; w.path = []; w.phase = 'idle'; w.onArrive = null;
  later(lift ? 2.5 : 1, () => {
    if (!live(R, 'up')) return;
    w.offstage = false; w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
    liftArrive(w);
    w.goTo(to(), () => !R.dead && cb());
  });
}
function done(R) {
  R.dead = true; trips.delete(R);
  if (run === R) { run = null; lookAt = state.sim + rand(300, 720); }
  const w = R.w;
  if (w) { w.outing = null; w.chore = null; w.hurry = false; w.street = false; w.offstage = false; }
}
// back at the desk: on with whatever came in, or (still resting) the drink, then a nap
function resume(w, drink) {
  const s = sessions.get(w.id);
  w.station = 'desk';
  if (s?.status === 'wait') { w.anim = 'hand'; w.say('wait', tr('people.needsApproval'), 'wait'); }
  else if (s?.bg?.length) { w.anim = 'think'; w.say('bash', tr('people.bgWait', { desc: s.bg[0].desc })); }
  else if (s?.status === 'work') { w.anim = ANIM_AT.desk; if (s.last) w.say(s.last.type, s.last.label || verb(s.last)); }
  else if (drink) { w.anim = 'coffee'; w.restAt = state.sim + rand(25, 45); w.dwellUntil = state.sim + 2; }
  else { w.anim = 'sleep'; w.hush(); }
}
// the city went away, a replay began, they left: called off. Whoever is out is back at their place at once (on the
// way home: home at once).
function abort(R) {
  if (R.dead) return;
  R.dead = true; trips.delete(R);
  if (run === R) run = null;
  R.rider?.cancel(); R.rider?.release();
  if (R.spot) R.spot.busy = false;
  if (R.kind === 'lunch' && state.lunchOrder) state.lunchOrder.here = true;
  const w = R.w; if (!w) return;
  w.outing = null; w.chore = null; w.hurry = false; w.carry = null;
  if (R.kind === 'home') { w.street = w.offstage = false; w.path = []; w.phase = 'idle'; w.onArrive = null; R.gone(); return; }
  if (w.leaving) return;   // (leave() takes them away)
  if (w.street || w.offstage || w.liftRide || w.liftWait || R.kind === 'come') {
    w.street = w.offstage = false; w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
    const home = w.homeSpot(); w.pos.set(home.x, home.z); w.spot = home; w.face = w.faceTarget = home.face; w.pose = home.sit ? 'sit' : 'stand';
    if (R.kind === 'come') settleIn(w); else resume(w, false);
  } else { w.anim = 'idle'; w.restAt = state.sim; }   // still indoors: back to their place in their own time
}
function begin(R, w) {
  run = R; R.w = w; w.outing = R; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim;
  R.drop = () => abort(R);
}

/* ---------- to the convenience store ---------- */
// the length of a walk from P along pts
const lengthOf = (P, pts) => pts.reduce((a, p, k) => a + Math.hypot(p.x - (k ? pts[k - 1].x : P.x), p.z - (k ? pts[k - 1].z : P.z)), 0);
function shopTrip(w, S) {
  // the nearest convenience store as you would walk it, from whichever side of the building is best
  let best = null;
  const from = indoors();
  for (const door of S.doors()) for (const ex of S.exits(from.x, from.z)) {
    const r = S.route(ex, door), len = r && lengthOf(ex, r) + ex.d;
    if (r && len < 80 && (!best || len < best.len)) best = { door, ex, r, len };
  }
  if (!best) return false;
  const R = { kind: 'shop', stage: 'go', exit: best.ex, shop: best.door.name };
  begin(R, w);
  w.P.cupBand.material.color.set(best.door.accent);
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;   // a stretch first
  w.after = () => {
    if (!live(R, 'go')) return;
    w.anim = 'idle'; say(w, tr('people.out.shop', { shop: best.door.name }));
    goDown(w, R, () => {
      R.stage = 'street'; outside(w, S, best.ex);
      walk(w, S, best.r, () => {
        if (!live(R, 'street')) return;
        R.stage = 'in'; w.offstage = true;   // inside: a look round the fridges, the till
        later(rand(7, 13), () => live(R, 'in') && leaveShop(R, S));
      }, best.door.face);
    });
  };
  return true;
}
function leaveShop(R, S) {
  const w = R.w;
  R.stage = 'back'; w.offstage = false; w.carry = 'cup';
  say(w, tr(R.recalled ? 'people.out.recall' : 'people.out.back'));
  walk(w, S, S.route(here(w), R.exit), () => live(R, 'back') && goUp(w, R, () => w.homeSpot(), () => { done(R); resume(w, true); }));
}
// work came in while they were out: back at once, at a run
function recall(R, S) {
  const w = R.w;
  R.recalled = true; w.hurry = true;
  if (R.stage === 'go') {   // not out of the building yet
    if (w.offstage) { goUp(w, R, () => w.homeSpot(), () => { done(R); resume(w, false); }); return; }
    R.stage = 'up'; w.after = null; w.liftWait = w.liftRide = null;
    w.goTo(w.homeSpot(), () => { if (!R.dead) { done(R); resume(w, false); } });
  } else if (R.stage === 'street') {
    say(w, tr('people.out.recall'));
    R.stage = 'back';
    walk(w, S, S.route(here(w), R.exit), () => live(R, 'back') && goUp(w, R, () => w.homeSpot(), () => { done(R); resume(w, false); }));
  } else if (R.stage === 'in') leaveShop(R, S);
}

/* ---------- the team's lunch ---------- */
// where to stand by a rider at the kerb: behind the scooter (`back` m behind its middle), on the pavement's kerb side
function pickup(ex, m, back = 0.55) {
  const rx = m.x - m.fx * back, rz = m.z - m.fz * back, [nx, nz] = ex.n, c = ex.x * nx + ex.z * nz + 0.5 - (rx * nx + rz * nz);
  return { x: rx + nx * c, z: rz + nz * c };
}
function orderLunch(S, day) {
  const from = indoors(), ex = S.exits(from.x, from.z).find((e) => e.L);
  const rider = ex && S.callRider(ex.L, ex.s);
  if (!rider) return false;
  state.lunchOrder = { day, here: false };
  const R = run = { kind: 'lunch', stage: 'wait', exit: ex, rider, ordered: state.sim, since: 0 };
  R.drop = () => abort(R);
  return true;
}
// the rider is at the kerb: someone resting goes down for it
function collect(R, S) {
  if (R.rider.state === 'gone' || state.sim - R.ordered > 240) { abort(R); return; }   // (stuck somewhere: lunch the usual way)
  if (R.rider.state !== 'waiting') return;
  R.since ||= state.sim;
  const w = [...workers.values()].find(resting);
  if (!w) { if (state.sim - R.since > 150) abort(R); return; }   // nobody to fetch it: lunch the usual way
  begin(R, w); R.stage = 'go';
  sfx.play('pop');   // (the phone)
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(R, 'go')) return;
    w.anim = 'idle'; say(w, tr('people.out.rider'));
    goDown(w, R, () => {
      R.stage = 'street'; outside(w, S, R.exit);
      const m = R.rider.stop();
      walk(w, S, S.route(R.exit, pickup(R.exit, m)), () => {
        if (!live(R, 'street')) return;
        R.stage = 'pickup'; w.faceTarget = Math.atan2(m.x - w.pos.x, m.z - w.pos.y); w.anim = 'tidy';
        later(1.3, () => {
          if (!live(R, 'pickup')) return;
          w.carry = 'bag'; w.anim = 'idle'; say(w, tr('people.out.thanks'));
          later(0.9, () => R.rider.release());
          R.stage = 'back';
          later(0.7, () => live(R, 'back') && walk(w, S, S.route(here(w), R.exit), () => live(R, 'back') && goUp(w, R, () => allocate('dining', w), () => lay(R))));
        });
      });
    });
  };
}
// in the pantry: the bags on the table, everyone called, and their own lunch right there (unless work came in)
function lay(R) {
  const w = R.w;
  w.station = 'dining'; w.anim = 'tidy';
  later(1.1, () => {
    if (R.dead) return;
    w.carry = null; showBags(w.spot); say(w, tr('people.out.lunch'));
    state.lunchOrder.here = true;
    done(R);
    if (called(w)) { w.goTo(w.homeSpot(), () => !w.outing && resume(w, false)); return; }
    w.lunchDay = officeNow().toDateString(); w.meal = true; w.anim = 'eat'; showMeal(w);
    w.restAt = state.sim + rand(900, 1500); w.dwellUntil = state.sim + 3;
  });
}
// two carrier bags left on the pantry table until one o'clock: in the middle, between the two places on that side (each
// with its lunch box in front of it)
let bags = null;
function showBags(sp) {
  const mate = STATIONS.dining.find((o) => o !== sp && Math.abs(o.z - sp.z) < 0.01 && Math.abs(Math.abs(o.x - sp.x) - 0.66) < 0.05);
  const mx = mate ? (sp.x + mate.x) / 2 : sp.x;
  if (!bags) {
    bags = new THREE.Group(); bags.userData.dynamic = true;
    const m = mat('#F4F3EE', { roughness: 0.75 });
    for (const [z, r] of [[-0.12, Math.PI / 2 + 0.2], [0.14, Math.PI / 2 - 0.15]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.14), m); b.position.set(0, 0.1, z); b.rotation.y = r; b.castShadow = true; bags.add(b);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 12, Math.PI), m); h.position.set(0, 0.2, z); h.rotation.y = r; bags.add(h);
    }
    scene.add(bags);
  }
  bags.position.set(mx + Math.sin(sp.face) * 0.62, 0.772, sp.z + Math.cos(sp.face) * 0.62); bags.rotation.y = sp.face; bags.visible = true;
  bags.userData.day = officeNow().toDateString();
}

/* ---------- coming and going ----------
   Each has their way of getting about (by the id): their own scooter, parked in the row on the pavement in front of the
   building while they are in; a GrabBike or a Xanh SM bike (on the back, in the company's helmet); or a Xanh SM taxi.
   Going home late (or when the session ends) they come out of the building and ride off; coming back in the morning they
   ride up, get off (park the scooter in the row) and go up. Several can be on their way at once. */
const trips = new Set();
const WAYS = ['bike', 'bike', 'bike', 'bike', 'bike', 'grab', 'grab', 'xsm', 'xsm', 'taxi'];
const BIKE_COLORS = ['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B', '#F2C200', '#7A1F2B', '#1E9E4A', '#C9CED6'];
const wayOf = (w) => WAYS[hash(w.id) % WAYS.length], bikeColor = (w) => BIKE_COLORS[(hash(w.id) >>> 5) % BIKE_COLORS.length];
const coatOf = (w) => w.cfg.coat || w.cfg.shirt;
const mainExit = (S) => { const from = indoors(); return S.exits(from.x, from.z).find((e) => e.L) || null; };
// the row of scooters: along the building's side of the pavement from the way out, both ways, 2 m apart, clear of the corners
let row = null;
function bikeRow(S) {
  const ex = mainExit(S);
  if (!ex) return null;
  if (row?.ex.L === ex.L && row.ex.s === ex.s) return row;
  const k = ex.L.axis === 'x' ? 0 : 1, lo = Math.min(ex.a[k], ex.b[k]) + 1.4, hi = Math.max(ex.a[k], ex.b[k]) - 1.4, spots = [];
  for (let n = 0; n < 16; n++) { const s = ex.s + (n % 2 ? -1 : 1) * (1.6 + Math.floor(n / 2) * 2.0); if (s > lo && s < hi) spots.push({ s, by: null, id: -1, busy: false }); }
  for (const sp of row?.spots || []) if (sp.id >= 0) S.unparkBike(sp.id);
  row = { ex, spots, side: S.pavementSide + 0.75 };
  return row;
}
// the row as it should be: a scooter for each one in who rides their own, none for those gone
function syncBikes(S) {
  const R = bikeRow(S); if (!R) return;
  for (const sp of R.spots) {
    if (!sp.by || sp.busy) continue;
    const w = workers.get(sp.by);
    if (!w || w.away) { S.unparkBike(sp.id); sp.by = null; sp.id = -1; } else if (sp.id < 0) sp.id = S.parkBike(R.ex.L, sp.s, R.side, bikeColor(w));
  }
  for (const w of workers.values()) {
    if (w.sub || w.away || wayOf(w) !== 'bike' || R.spots.some((sp) => sp.by === w.id)) continue;
    const sp = R.spots.find((x) => !x.by); if (!sp) break;
    sp.by = w.id; sp.id = S.parkBike(R.ex.L, sp.s, R.side, bikeColor(w));
  }
}
// where a rider waits at the kerb: by the way out, the next one along a little further each time
const kerbAt = (ex) => { const n = [...trips].filter((t) => t.rider).length; return ex.s + (n % 2 ? -1 : 1) * (1.4 + Math.floor(n / 2) * 2.8); };
const ride = (way) => (way === 'taxi' ? 'taxi' : way);
function settleIn(w) {
  const d = sessions.get(w.id)?.desk ?? -1, home = w.homeSpot();
  w.station = 'desk'; w.anim = 'type';
  if (home === DESK_SPOTS[d] && Math.hypot(w.pos.x - home.x, w.pos.y - home.z) < 0.2) w.unpack(d); else w.dress(false);
}
// out of the lift (the doors have shut behind them on the way down) and off home; false: not by the street this time
function goHome(w, gone) {
  const S = street();
  if (!S || replay.on || w.sub || trips.size >= 6) return false;
  const ex = mainExit(S); if (!ex) return false;
  const way = wayOf(w), T = { kind: 'home', w, way, stage: 'down', gone, since: state.sim };
  T.drop = () => abort(T);
  if (way === 'bike') {
    const R = bikeRow(S);
    T.spot = R.spots.find((sp) => sp.by === w.id);
    if (!T.spot) { T.spot = R.spots.find((sp) => !sp.by); if (!T.spot) return false; T.spot.by = w.id; T.spot.id = S.parkBike(ex.L, T.spot.s, R.side, bikeColor(w)); }
    T.spot.busy = true;
  } else if (!(T.rider = S.callRider(ex.L, kerbAt(ex), { livery: ride(way), far: 60 }))) return false;
  trips.add(T); w.outing = T; w.offstage = true;
  later(lift ? 3 : 1, () => {
    if (!live(T, 'down')) return;
    T.stage = 'street'; outside(w, S, ex);
    if (way === 'bike') {   // to their scooter, on, and away
      const R = bikeRow(S), at = S.at(ex.L, T.spot.s, S.pavementSide);
      walk(w, S, S.route(ex, at), () => {
        if (!live(T, 'street')) return;
        S.unparkBike(T.spot.id); T.spot.by = null; T.spot.id = -1; T.spot.busy = false;
        S.depart(ex.L, T.spot.s, { livery: 'plain', paint: bikeColor(w), jacket: coatOf(w), side: R.side })?.release();
        done(T); gone();
      });
    } else walk(w, S, S.route(ex, pickup(ex, T.rider.stop(), way === 'taxi' ? 0.25 : 0.55)), () => { if (live(T, 'street')) T.stage = 'wait'; });
  });
  return true;
}
// back in the morning (or for work): ride up, off, up to the desk; false: not by the street this time
function arrive(w) {
  const S = street();
  if (!S || replay.on || w.sub || trips.size >= 6) return false;
  const ex = mainExit(S); if (!ex) return false;
  const way = wayOf(w), T = { kind: 'come', w, way, stage: 'ride', since: state.sim };
  T.drop = () => abort(T);
  if (way === 'bike') {
    const R = bikeRow(S), sp = R.spots.find((x) => x.by === w.id) || R.spots.find((x) => !x.by);
    if (!sp) return false;
    if (sp.id >= 0) { S.unparkBike(sp.id); sp.id = -1; }
    sp.by = w.id; sp.busy = true; T.spot = sp;
    T.rider = S.callRider(ex.L, sp.s, { livery: 'plain', paint: bikeColor(w), jacket: coatOf(w), side: R.side, far: 38 });
  } else T.rider = S.callRider(ex.L, kerbAt(ex), { livery: ride(way), pax: way === 'taxi' ? null : coatOf(w), far: 38 });
  if (!T.rider) { if (T.spot) { T.spot.by = null; T.spot.busy = false; } return false; }
  trips.add(T); w.outing = T; w.chore = { outing: true }; w.offstage = true; w.street = true; w.ground = S.pavement; w.pos.set(ex.x, ex.z); w.dress(true);
  return true;
}
// each frame, each one on their way
function stepTrip(T, S) {
  const w = T.w;
  if (T.kind === 'home' && T.stage === 'wait') {   // at the kerb, the ride pulls in: on, and off they go
    if (T.rider.state === 'gone' || state.sim - T.since > 150) { abort(T); return; }
    if (T.rider.state !== 'waiting') return;
    const m = T.rider.where();
    T.stage = 'board'; w.faceTarget = Math.atan2(m.x - w.pos.x, m.z - w.pos.y);
    later(0.7, () => {
      if (!live(T, 'board')) return;
      w.offstage = true; T.rider.board(coatOf(w));
      later(0.6, () => T.rider.release());
      done(T); T.gone();
    });
  } else if (T.kind === 'come' && T.stage === 'ride') {   // there: off the scooter (or out of the car), up to the office
    if (state.sim - T.since > 150) { abort(T); return; }
    if (T.rider.state !== 'waiting') return;
    const m = T.rider.where(), up = () => live(T, 'walk') && goUp(w, T, () => w.homeSpot(), () => { done(T); settleIn(w); });
    let at;
    if (T.way === 'bike') {
      const R = bikeRow(S);
      T.rider.vanish(); T.spot.id = S.parkBike(R.ex.L, T.spot.s, R.side, bikeColor(w)); T.spot.busy = false;
      at = S.at(R.ex.L, T.spot.s, S.pavementSide);
    } else { T.rider.alight(); at = pickup(mainExit(S), m, T.way === 'taxi' ? 0.25 : 0.55); later(0.8, () => T.rider.release()); }
    T.stage = 'walk'; outside(w, S, at);
    walk(w, S, S.route(at, mainExit(S)), up);
  }
}

/* what the session list says of someone who is not at their desk (ui/activity.js) */
export function whereabouts(w) {
  const R = w?.outing, T = (k, v) => tr(`people.where.${k}`, v);
  if (!w) return null;
  if (!R) return w.away ? { ic: 'home', text: T('home') } : null;
  if (R.kind === 'shop') return { ic: 'walk', text: R.recalled ? T('rushing') : T(R.stage === 'in' ? 'inShop' : R.stage === 'back' || R.stage === 'up' ? 'fromShop' : 'toShop', { shop: R.shop }) };
  if (R.kind === 'lunch') return R.w === w ? { ic: 'coffee', text: T(R.stage === 'back' || R.stage === 'up' ? 'lunchUp' : 'lunchDown') } : null;
  return { ic: R.kind === 'home' ? 'home' : 'walk', text: T(R.kind === 'home' ? 'leaving' : 'coming', { how: T(`how.${R.way}`) }) };
}

/* ---------- each frame ---------- */
let bikesAt = 0, shown = '';
export function updateOutings() {
  const S = street(), d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), day = d.toDateString();
  if (bags?.visible && (m >= 780 || bags.userData.day !== day)) bags.visible = false;
  // the comings and goings; the row of scooters; the session list when anyone's whereabouts change
  for (const T of trips) if (!S || replay.on) abort(T); else stepTrip(T, S);
  if (S && state.sim > bikesAt) { bikesAt = state.sim + 2; syncBikes(S); }
  const sig = [run, ...trips].map((R) => R && `${R.w?.id}:${R.stage}:${R.recalled ? 1 : 0}`).join();
  if (sig !== shown) { shown = sig; queueUi(); }
  if (run) {
    if (!S || replay.on) { abort(run); return; }
    if (run.kind === 'lunch' && run.stage === 'wait') collect(run, S);
    else if (run.kind === 'shop' && !run.recalled && called(run.w)) recall(run, S);
    else if (run.kind === 'lunch' && run.w && called(run.w)) run.w.hurry = true;   // (the lunch still comes up first)
    return;
  }
  if (!S || replay.on || state.sim < 20) return;
  // the team's lunch, ordered between 11:15 and 11:40 once someone is resting to fetch it (the company floor eats in)
  if (PRO && m >= 675 && m < 700 && lunchDay !== day && [...workers.values()].some(resting)) { lunchDay = day; orderLunch(S, day); return; }
  if (state.sim < lookAt) return;
  lookAt = state.sim + 20;
  // a trip to the shop: in office hours, not over lunch, now and then, someone who has not been out for half an hour
  if (m < 480 || m >= 1260 || (m >= 670 && m < 790) || Math.random() > 0.3) return;
  const list = [...workers.values()].filter((w) => resting(w) && state.sim - (w.outAt ?? -1e9) > 1800);
  if (list.length) shopTrip(list[Math.floor(Math.random() * list.length)], S);
}

/* for tests and screenshots (?debug): send someone resting out now ('shop'), or order the lunch ('lunch') */
export function goOut(kind = 'shop') {
  const S = street(); if (!S || run) return false;
  if (kind === 'lunch') return orderLunch(S, officeNow().toDateString());
  const w = [...workers.values()].find(resting);
  return !!w && shopTrip(w, S);
}
export const outing = () => (run ? { kind: run.kind, stage: run.stage, id: run.w?.id ?? null } : null);

export function setup() {
  streetHooks.home = goHome;
  streetHooks.arrive = arrive;
}
