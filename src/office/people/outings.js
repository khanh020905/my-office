// Going out: before lunch a GrabFood rider brings the team's lunch to the kerb and whoever is resting goes down for it;
// now and then someone resting pops down to the convenience store across the street and comes back with what that chain
// is known for (Circle K's mì ly, GS25's tokbokki, 7-Eleven's onigiri…); late at night, whoever is still there goes down
// to the Circle K for a cup of noodles. Down in the lift (or out of the door), along the pavements and over the zebras
// when the green man shows (the city's walk network, street-life.js), in through the shop's sliding door to the till,
// back up the same way. Work coming in calls them back at a run. And coming and going: home late by the street (their
// own scooter from the row on the pavement, a GrabBike, a Xanh SM bike or taxi; on a scooter after work, sometimes past
// the WinMart+ for the shopping first), back the same way in the morning. Only with the city outside; one trip out at a
// time, several comings and goings.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, STATIC, V2, officeNow, rand, replay } from '../core/env.js';
import { TOKEN } from '../net/live.js';
import { scene } from '../scene/renderer.js';
import { mat } from '../scene/blocks.js';
import { DZ, LIFT_X, lift, liftArrive, liftDown } from '../world/entrance.js';
import { THEME, THEMES } from '../world/backdrops/index.js';
import { DESK_SPOTS, DOOR_IN, DOOR_OUT, STATIONS, allocate } from './navigation.js';
import { showMeal } from './breaks.js';
import { later } from './errands.js';
import { clockHooks, hash, sessions, streetHooks, workers } from './workers.js';
import { guardPost } from './guard.js';
import { ANIM_AT, verb } from '../ui/event-text.js';
import { sfx } from '../audio/sfx.js';
import { chatLife } from '../ui/group-chat.js';
import { wx } from '../life/weather.js';
import { joinNhau, nhauNow, updateNhau } from './nhau.js';
import { comNow, comPlanned, updateCom } from './comtrua.js';
import { atmNow, updatePayday } from './payday.js';
import { pickleNow, updatePickle } from './pickle.js';
import { photoNow, updatePhoto } from './photobooth.js';
import { evNow, updateEvswap } from './evswap.js';
import { homeLunch, microNow } from './comnha.js';
import { queueUi, toast } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

let run = null;     // the outing under way: { kind: 'shop' | 'lunch', w, stage, … }
let lookAt = 90;    // (sim seconds) the next look for a trip to the shop: not in the first minute and a half
let lunchDay = '';  // the day the lunch was ordered
export const street = () => (THEMES && THEME === THEMES.city && THEME.live?.street) || null;
const say = (w, text) => { w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 4500); };
// asleep at their own place, nothing else going on: free to go out
export const resting = (w) => !w.sub && w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && w.phase !== 'walk'
  && !w.liftHold && !w.liftWait && !w.inStall && !w.wcBusy && !w.queued && w.anim === 'sleep' && w.station === 'desk'
  && sessions.get(w.id)?.status === 'rest' && !sessions.get(w.id)?.bg?.length;
export const called = (w) => { const s = sessions.get(w.id); return !!w.want || !s || s.status !== 'rest' || !!s.bg?.length; };   // work came in
export const live = (R, stage) => !R.dead && R.stage === stage;
// where you leave the office from inside: the lift, or the door
const indoors = () => (lift ? { x: LIFT_X, z: DZ } : { x: DOOR_OUT.x, z: DOOR_OUT.z });

// the street's points as a path to walk: each leg's ground (pavement, or the road on a crossing) and the crossings' gates
export function walk(w, S, pts, cb, face) {
  if (!pts?.length) { cb(); return; }
  w.path = pts.map((p) => Object.assign(new V2(p.x, p.z), { y0: p.y0 ?? (p.road ? S.road : S.pavement), gate: p.gate }));   // (y0: a floor of its own, inside a shop on the street)
  const end = pts[pts.length - 1];
  w.spot = { x: end.x, z: end.z, face: face ?? w.face };
  w.pose = 'stand'; w.phase = 'walk'; w.onArrive = cb;
}
export const here = (w) => ({ x: w.pos.x, z: w.pos.y });
// down to the street: the lift (wait for it, step in, the doors shut, down; the stairs while it is serviced) or out of
// the door, then unseen a moment
export function goDown(w, R, cb) {
  const stage = R.stage, gone = () => { if (!live(R, stage)) return; w.offstage = true; later(lift ? 3 : 1, () => live(R, stage) && cb()); };
  w.goTo(DOOR_IN, () => {
    if (!live(R, stage)) return;
    if (!lift) { w.goTo(DOOR_OUT, gone); return; }
    liftDown(w, gone);
  });
}
export function outside(w, S, at) { w.offstage = false; w.street = true; w.ground = S.pavement; w.pos.set(at.x, at.z); w.spot = { x: at.x, z: at.z, face: w.face }; }
// in at the street door and up: unseen a moment, then out of the lift (or in at the door) and on to where `to()` says
export function goUp(w, R, to, cb) {
  R.stage = 'up'; w.offstage = true; w.street = false; w.path = []; w.phase = 'idle'; w.onArrive = null;
  later(lift ? 2.5 : 1, () => {
    if (!live(R, 'up')) return;
    w.offstage = false; w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
    liftArrive(w);
    const go = () => !R.dead && w.goTo(to(), () => !R.dead && cb());
    if (R.kind === 'come' && clockHooks.in) clockHooks.in(w, go); else go();   // (the morning: clocked in on the way, people/hr.js)
  });
}
function done(R) {
  R.dead = true; trips.delete(R);
  if (run === R) { run = null; lookAt = state.sim + (R.night ? rand(600, 900) : rand(300, 720)); }
  const w = R.w;
  if (w) { w.outing = null; w.chore = null; w.hurry = false; w.street = false; w.offstage = false; }
}
// back at the desk: on with whatever came in, or (still resting) what they brought back, eaten or drunk at the desk (the
// shopping goes under it), then a nap
export function resume(w, item) {
  const s = sessions.get(w.id);
  w.station = 'desk';
  if (s?.status === 'wait') { w.anim = 'hand'; w.say('wait', tr('people.needsApproval'), 'wait'); }
  else if (s?.bg?.length) { w.anim = 'think'; w.say('bash', tr('people.bgWait', { desc: s.bg[0].desc })); }
  else if (s?.status === 'work') { w.anim = ANIM_AT.desk; if (s.last) w.say(s.last.type, s.last.label || verb(s.last)); }
  else if (item && w.P.held[item]) { w.anim = 'coffee'; w.restAt = state.sim + (item === 'cup' ? rand(25, 45) : rand(40, 75)); w.dwellUntil = state.sim + 2; }
  else if (item) { w.carry = null; w.anim = 'tidy'; w.restAt = state.sim + 3; w.dwellUntil = state.sim + 2; }
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
// the chain behind a door (shops.js gives it; by the name on the sign otherwise)
const CHAIN = { 'Circle K': 'circlek', GS25: 'gs25', '7-Eleven': 'seven', 'WinMart+': 'winmart', Ministop: 'ministop', 'Bách Hóa Xanh': 'bhx', Mixue: 'mixue', 'Highlands Coffee': 'highlands', 'Thế Giới Di Động': 'tgdd', 'Điện Máy Xanh': 'dmx', Katinat: 'katinat', 'Phúc Long': 'phuclong', 'Long Châu': 'longchau' };
const keyOf = (d) => d.key || CHAIN[d.name] || '';
// what each one sends you back with (twice in the list: twice as likely): the chain's own food more often than a drink
const TAKE = { circlek: ['noodle', 'noodle', 'cup'], gs25: ['tok', 'tok', 'cup'], seven: ['onigiri', 'bun', 'cup'], ministop: ['cone', 'chicken'], winmart: ['cup', 'cup', 'grocery'], bhx: ['cup', 'grocery'], mixue: ['cone', 'cone', 'cup'], highlands: ['cup'], tgdd: ['grocery'], dmx: ['grocery'], katinat: ['cup'], phuclong: ['cup'], longchau: ['grocery'] };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// the drink's band (and the shopping bag) in the shop's colour
function tint(w, item, d) {
  if (item === 'cup') w.P.cupBand.material.color.set(d.accent);
  if (item === 'grocery') w.P.groceryBand.material.color.set(d.accent);
}
/* In through the sliding door (it opens as they come), along the aisle to the till, pay (the QR code's beep), then paid().
   A shop without an inside to walk (an older shops.js): a while inside, unseen. stage: the trip's stage meanwhile. */
function intoStore(w, S, R, stage, d, secs, paid) {
  if (!d.till) { w.offstage = true; later(secs + 2, () => live(R, stage) && paid()); return; }
  d.pass?.();
  walk(w, S, [...(d.inside || []), d.till], () => {
    if (!live(R, stage)) return;
    w.faceTarget = d.till.face; w.anim = 'tidy';
    later(1.4, () => live(R, stage) && sfx.play('beep'));
    later(secs, () => live(R, stage) && paid());
  }, d.till.face);
}
// back along the aisle, the door slides open, out onto the pavement in front of it: then()
function outOfStore(w, S, R, stage, d, then) {
  w.anim = 'idle';
  if (!d.till || w.offstage) { w.offstage = false; then(); return; }
  walk(w, S, [...(d.inside || [])].reverse(), () => {
    if (!live(R, stage)) return;
    d.pass?.(); walk(w, S, [{ x: d.x, z: d.z }], () => live(R, stage) && then());
  });
}
// what they say on the way, and on the way back: the chain's food, the late-night noodles
const OWN_LINES = new Set(['treat', 'morning', 'upgrade', 'coffee', 'tea', 'checkin', 'headache']);   // (trips with words of their own)
const line = (R, when) => tr(OWN_LINES.has(R.why) ? `people.out.${R.why}.${when}` : R.night ? `people.out.night.${when}` : `people.out.${when}.${R.item}`, { shop: R.shop, version: R.version || '' });
/** o: { key: one chain only, night: late-night noodles (a 24-hour store, Circle K if there is one near), why: 'hot' (the
    real weather, a hot afternoon: a 10k cone at the Mixue), 'treat' (the CI green again: ice cream for everyone),
    'morning' (the day's first cà phê at the Highlands), 'coffee' (an afternoon one there), 'upgrade' (Claude Code
    moved to a new version: someone goes to Thế Giới Di Động to "lên đời"; version: the new one), 'tea' (the afternoon
    trà sữa at Phúc Long, or Katinat), 'checkin' (Katinat on a Friday or weekend evening, for the drink and the picture)
    or 'headache' (the work keeps failing: something for the headache from Long Châu) } */
function shopTrip(w, S, { key = '', night = false, why = '', version = '' } = {}) {
  // the nearest open convenience store as you would walk it, from whichever side of the building is best
  let best = null;
  const from = indoors();
  for (const door of S.doors()) {
    if (door.open === false || (key && keyOf(door) !== key) || (!key && ['tgdd', 'highlands', 'dmx', 'katinat', 'phuclong', 'longchau'].includes(keyOf(door))) || (night && door.h24 === false)) continue;   // (the phone shop and the café only when meant)
    for (const ex of S.exits(from.x, from.z)) {
      const r = S.route(ex, door), len = r && lengthOf(ex, r) + ex.d, score = len + (night && keyOf(door) !== 'circlek' ? 30 : 0);
      if (r && len < 80 && (!best || score < best.score)) best = { door, ex, r, score };
    }
  }
  if (!best) return false;
  const d = best.door, item = night ? 'noodle' : why === 'treat' || why === 'upgrade' ? 'grocery' : why === 'hot' ? 'cone' : pick(TAKE[keyOf(d)] || ['cup']);
  const R = { kind: 'shop', stage: 'go', exit: best.ex, shop: d.name, door: d, item, night, why, version };
  begin(R, w);
  if (why === 'hot' || why === 'treat') chatLife('mixue', { id: w.id, why, temp: Math.round(wx.temp ?? 33), every: 3 * 3600e3 });
  else if (why === 'morning' || why === 'coffee') chatLife('highlands', { id: w.id, why, every: 2 * 3600e3 });
  else if (why === 'upgrade') chatLife('tgdd', { id: w.id, version, every: 60e3 });
  else if (why === 'tea' || why === 'checkin') chatLife(keyOf(d), { id: w.id, why, every: 3 * 3600e3 });   // (Phúc Long's, or Katinat's)
  else if (why === 'headache') chatLife('longchau', { id: w.id, every: 3600e3 });
  else chatLife('store', { id: w.id, shop: d.name, every: 90 * 60e3 });
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;   // a stretch first
  w.after = () => {
    if (!live(R, 'go')) return;
    w.anim = 'idle'; say(w, line(R, 'go'));
    goDown(w, R, () => {
      R.stage = 'street'; outside(w, S, best.ex);
      walk(w, S, best.r, () => {
        if (!live(R, 'street')) return;
        R.stage = 'in';
        intoStore(w, S, R, 'in', d, rand(5, 9), () => leaveShop(R, S));
      }, d.face);
    });
  };
  return true;
}
function leaveShop(R, S) {
  const w = R.w;
  R.stage = 'back'; w.carry = R.item; tint(w, R.item, R.door);
  say(w, R.recalled ? tr('people.out.recall') : line(R, 'got'));
  outOfStore(w, S, R, 'back', R.door, () => walk(w, S, S.route(here(w), R.exit), () => live(R, 'back') && goUp(w, R, () => w.homeSpot(), () => { done(R); resume(w, R.item); })));
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
  lunchDay = day;   // (once a day, ordered here or by goOut)
  const seven = S.doors().some((d) => keyOf(d) === 'seven');   // (in Ho Chi Minh City the boxes come from the 7-Eleven)
  state.lunchOrder = { day, here: false, seven };
  const R = run = { kind: 'lunch', stage: 'wait', exit: ex, rider, ordered: state.sim, since: 0, seven };
  R.drop = () => abort(R);
  return true;
}
// the rider is at the kerb: someone resting goes down for it
function collect(R, S) {
  if (R.rider.state === 'gone' || state.sim - R.ordered > 240) { abort(R); return; }   // (stuck somewhere: lunch the usual way)
  if (R.rider.state !== 'waiting') return;
  R.since ||= state.sim;
  const w = [...workers.values()].find((x) => resting(x) && !homeLunch(x));   // (not someone who brought their own: people/comnha.js)
  if (!w) { if (state.sim - R.since > 150) abort(R); return; }   // nobody to fetch it: lunch the usual way
  begin(R, w); R.stage = 'go';
  sfx.play('pop');   // (the phone)
  chatLife('lunchOrder', { id: w.id });
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(R, 'go')) return;
    w.anim = 'idle'; say(w, tr(R.seven ? 'people.out.rider7' : 'people.out.rider'));
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
    w.carry = null; showBags(w.spot, R.seven); say(w, tr(R.seven ? 'people.out.lunch7' : 'people.out.lunch'));
    if (R.seven) toast(tr('people.out.lunch7Toast'));
    state.lunchOrder.here = true;
    done(R);
    if (called(w)) { w.goTo(w.homeSpot(), () => !w.outing && resume(w, false)); return; }
    w.lunchDay = officeNow().toDateString(); w.meal = true; w.anim = 'eat'; showMeal(w);
    w.restAt = state.sim + rand(900, 1500); w.dwellUntil = state.sim + 3;
  });
}
// two carrier bags left on the pantry table until one o'clock: in the middle, between the two places on that side (each
// with its lunch box in front of it); 7-Eleven's with the chain's three stripes round them
let bags = null;
function showBags(sp, seven = false) {
  const mate = STATIONS.dining.find((o) => o !== sp && Math.abs(o.z - sp.z) < 0.01 && Math.abs(Math.abs(o.x - sp.x) - 0.66) < 0.05);
  const mx = mate ? (sp.x + mate.x) / 2 : sp.x;
  if (!bags) {
    bags = new THREE.Group(); bags.userData.dynamic = true;
    const m = mat('#F4F3EE', { roughness: 0.75 });
    for (const [z, r] of [[-0.12, Math.PI / 2 + 0.2], [0.14, Math.PI / 2 - 0.15]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.14), m); b.position.set(0, 0.1, z); b.rotation.y = r; b.castShadow = true; bags.add(b);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 12, Math.PI), m); h.position.set(0, 0.2, z); h.rotation.y = r; bags.add(h);
      ['#F58220', '#008163', '#EE2526'].forEach((c, k) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.222, 0.018, 0.142), mat(c, { roughness: 0.8 })); s.position.set(0, 0.07 + k * 0.02, z); s.rotation.y = r; s.userData.seven = true; bags.add(s); });
    }
    scene.add(bags);
  }
  for (const o of bags.children) if (o.userData.seven) o.visible = seven;
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
export const wayOf = (w) => WAYS[hash(w.id) % WAYS.length], bikeColor = (w) => BIKE_COLORS[(hash(w.id) >>> 5) % BIKE_COLORS.length];
// half of those who ride their own ride an electric one (street-ev.js; its battery swapped at the cabinet: people/evswap.js)
export const evOf = (w) => hash(`${w.id}:ev`) % 2 === 0;
export const coatOf = (w) => w.cfg.coat || w.cfg.shirt;
export const mainExit = (S) => { const from = indoors(); return S.exits(from.x, from.z).find((e) => e.L) || null; };
// the row of scooters: along the building's side of the pavement from the way out, both ways, 2 m apart, clear of the corners
let row = null;
function bikeRow(S) {
  const ex = mainExit(S);
  if (!ex) return null;
  if (row?.ex.L === ex.L && row.ex.s === ex.s) return row;
  const k = ex.L.axis === 'x' ? 0 : 1, lo = Math.min(ex.a[k], ex.b[k]) + 1.4, hi = Math.max(ex.a[k], ex.b[k]) - 1.4, spots = [], booth = guardPost(ex);   // (none where the guard's booth stands, people/guard.js)
  for (let n = 0; n < 16; n++) { const s = ex.s + (n % 2 ? -1 : 1) * (1.6 + Math.floor(n / 2) * 2.0); if (s > lo && s < hi && Math.abs(s - booth) > 1.35) spots.push({ s, by: null, id: -1, busy: false }); }
  for (const sp of row?.spots || []) if (sp.id >= 0) S.unparkBike(sp.id);
  row = { ex, spots, side: S.pavementSide + 0.75 };
  return row;
}
/** the row's places (for people/evswap.js): { s, by (whose), id (the parked scooter, -1: none; 1000 and up: electric), busy } */
export const rowSpots = (S) => bikeRow(S)?.spots || [];
export const rowOf = (S) => bikeRow(S);
// the row as it should be: a scooter for each one in who rides their own, none for those gone
function syncBikes(S) {
  const R = bikeRow(S); if (!R) return;
  for (const sp of R.spots) {
    if (!sp.by || sp.busy) continue;
    const w = workers.get(sp.by);
    // (leftBike: home by Grab after a drink, the scooter stays the night)
    if (!w || (w.away && !w.leftBike)) { S.unparkBike(sp.id); sp.by = null; sp.id = -1; } else if (sp.id < 0) sp.id = S.parkBike(R.ex.L, sp.s, R.side, bikeColor(w), evOf(w), hash(w.id));
  }
  for (const w of workers.values()) {
    if (w.sub || w.away || wayOf(w) !== 'bike' || R.spots.some((sp) => sp.by === w.id)) continue;
    const sp = R.spots.find((x) => !x.by); if (!sp) break;
    sp.by = w.id; sp.id = S.parkBike(R.ex.L, sp.s, R.side, bikeColor(w), evOf(w), hash(w.id));
  }
}
// where a rider waits at the kerb: by the way out, the next one along a little further each time
const kerbAt = (ex) => { const n = [...trips].filter((t) => t.rider).length; return ex.s + (n % 2 ? -1 : 1) * (1.4 + Math.floor(n / 2) * 2.8); };
const ride = (way) => (way === 'taxi' ? 'taxi' : way);
export function settleIn(w) {
  const d = sessions.get(w.id)?.desk ?? -1, home = w.homeSpot();
  w.station = 'desk'; w.anim = 'type';
  if (home === DESK_SPOTS[d] && Math.hypot(w.pos.x - home.x, w.pos.y - home.z) < 0.2) w.unpack(d); else w.dress(false);
}
// out of the lift (the doors have shut behind them on the way down) and off home; false: not by the street this time
function goHome(w, gone) {
  if (w.nhau && joinNhau(w, gone)) return true;   // (off to the quán nhậu across the street first: people/nhau.js)
  const S = street();
  if (!S || replay.on || w.sub || trips.size >= 6) return false;
  const ex = mainExit(S); if (!ex) return false;
  // after a drink, never their own scooter: a GrabBike, and the scooter stays in the row till the morning
  const drank = w.drank === officeNow().toDateString() && wayOf(w) === 'bike';
  if (drank) w.leftBike = true;
  const way = drank ? 'grab' : wayOf(w), T = { kind: 'home', w, way, stage: 'down', gone, since: state.sim };
  T.drop = () => abort(T);
  if (way === 'bike') {
    const R = bikeRow(S);
    T.spot = R.spots.find((sp) => sp.by === w.id);
    if (!T.spot) { T.spot = R.spots.find((sp) => !sp.by); if (!T.spot) return false; T.spot.by = w.id; T.spot.id = S.parkBike(ex.L, T.spot.s, R.side, bikeColor(w), evOf(w), hash(w.id)); }
    T.spot.busy = true;
  } else if (!(T.rider = S.callRider(ex.L, kerbAt(ex), { livery: ride(way), far: 60 }))) return false;
  trips.add(T); w.outing = T; w.offstage = true;
  chatLife('bye', { id: w.id, every: 8 * 3600e3 });
  later(lift ? 3 : 1, () => {
    if (!live(T, 'down')) return;
    T.stage = 'street'; outside(w, S, ex);
    if (way === 'bike') {   // to their scooter, on, and away
      const R = bikeRow(S), at = S.at(ex.L, T.spot.s, S.pavementSide);
      const ride = () => walk(w, S, S.route(here(w), at), () => {
        if (!live(T, 'street')) return;
        S.unparkBike(T.spot.id); T.spot.by = null; T.spot.id = -1; T.spot.busy = false;
        S.depart(ex.L, T.spot.s, { livery: 'plain', paint: bikeColor(w), jacket: coatOf(w), side: R.side })?.release();
        w.carry = null; done(T); gone();
      });
      // after work, now and then, the shopping first: in at a WinMart+ or a Bách Hóa Xanh on the way, out with a bag
      const d = groceryStop(S, ex, at);
      if (!d) { ride(); return; }
      T.stage = 'shop'; T.shop = d.name;
      walk(w, S, S.route(ex, d), () => {
        if (!live(T, 'shop')) return;
        intoStore(w, S, T, 'shop', d, rand(4, 7), () => {
          w.carry = 'grocery'; tint(w, 'grocery', d);
          outOfStore(w, S, T, 'shop', d, () => { T.stage = 'street'; ride(); });
        });
      }, d.face);
    } else walk(w, S, S.route(ex, pickup(ex, T.rider.stop(), way === 'taxi' ? 0.25 : 0.55)), () => { if (live(T, 'street')) T.stage = 'wait'; });
  });
  return true;
}
// 17:00–19:30, three times in ten: an open WinMart+ or Bách Hóa Xanh within ~40 m on foot (there and back to the scooter)
function groceryStop(S, ex, at) {
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes();
  if (m < 1020 || m >= 1170 || Math.random() > 0.3) return null;
  let best = null;
  for (const door of S.doors()) {
    if (door.open === false || !['winmart', 'bhx'].includes(keyOf(door))) continue;
    const a = S.route(ex, door), b = a && S.route(door, at), len = b && lengthOf(ex, a) + lengthOf(door, b);
    if (b && lengthOf(ex, a) < 40 && len < 85 && (!best || len < best.len)) best = { door, len };
  }
  return best?.door || null;
}
// back in the morning (or for work): ride up, off, up to the desk; false: not by the street this time
function arrive(w) {
  const S = street();
  if (!S || replay.on || w.sub || trips.size >= 6) return false;
  const ex = mainExit(S); if (!ex) return false;
  const way = w.leftBike ? 'grab' : wayOf(w), T = { kind: 'come', w, way, stage: 'ride', since: state.sim };   // (the scooter left here last night: in by Grab)
  w.leftBike = false;
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
      T.rider.vanish(); T.spot.id = S.parkBike(R.ex.L, T.spot.s, R.side, bikeColor(w), evOf(w), hash(w.id)); T.spot.busy = false;
      at = S.at(R.ex.L, T.spot.s, S.pavementSide);
    } else { T.rider.alight(); at = pickup(mainExit(S), m, T.way === 'taxi' ? 0.25 : 0.55); later(0.8, () => T.rider.release()); }
    T.stage = 'walk'; outside(w, S, at);
    // the day's first one in, in the morning: a cà phê at the Highlands on the way up (taken up to the desk)
    const today = officeNow(), mins = today.getHours() * 60 + today.getMinutes(), hl = coffeeDay !== today.toDateString() && mins >= 360 && mins < 660 && S.doors().find((x) => keyOf(x) === 'highlands' && x.open);
    if (hl) {
      coffeeDay = today.toDateString(); chatLife('highlands', { id: w.id, why: 'morning', every: 2 * 3600e3 }); say(w, tr('people.out.morning.go', { shop: hl.name }));
      walk(w, S, S.route(at, hl), () => {
        if (!live(T, 'walk')) return;
        intoStore(w, S, T, 'walk', hl, rand(5, 8), () => {
          w.carry = 'cup'; tint(w, 'cup', hl); say(w, tr('people.out.morning.got', { shop: hl.name }));
          outOfStore(w, S, T, 'walk', hl, () => walk(w, S, S.route(here(w), mainExit(S)), up));
        });
      }, hl.face);
    } else walk(w, S, S.route(at, mainExit(S)), up);
  }
}

/* what the session list says of someone who is not at their desk (ui/activity.js) */
export function whereabouts(w) {
  const R = w?.outing, T = (k, v) => tr(`people.where.${k}`, v);
  if (!w) return null;
  if (!R) return w.micro ? microNow(w) : w.away ? { ic: 'home', text: T('home') } : null;   // (at the microwave: people/comnha.js)
  // (at the till: what they are buying there; on the way down late at night: the noodles)
  if (R.kind === 'shop') return { ic: 'walk', text: R.recalled ? T('rushing') : R.stage === 'in' ? T(`buy.${R.item || 'cup'}`, { shop: R.shop }) : T(R.stage === 'back' || R.stage === 'up' ? 'fromShop' : R.night ? 'toNight' : 'toShop', { shop: R.shop }) };
  if (R.kind === 'lunch') return R.w === w ? { ic: 'coffee', text: T(R.stage === 'back' || R.stage === 'up' ? 'lunchUp' : 'lunchDown') } : null;
  if (R.kind === 'nhau') return nhauNow(R);
  if (R.kind === 'com') return comNow(R);
  if (R.kind === 'atm') return atmNow(R);
  if (R.kind === 'pickle') return pickleNow(R);
  if (R.kind === 'photo') return photoNow(R);
  if (R.kind === 'evswap') return evNow(R);
  if (R.kind === 'home' && R.stage === 'shop') return { ic: 'walk', text: T('homeShop', { shop: R.shop }) };
  return { ic: R.kind === 'home' ? 'home' : 'walk', text: T(R.kind === 'home' ? 'leaving' : 'coming', { how: T(`how.${R.way}`) }) };
}

/* ---------- each frame ---------- */
let bikesAt = 0, shown = '';
export function updateOutings() {
  updateNhau();   // (an evening at the quán nhậu: people/nhau.js)
  updateCom(); updatePayday(); updatePickle(); updatePhoto(); updateEvswap();   // (lunch at the quán cơm: people/comtrua.js; payday at the ATM: people/payday.js; pickleball: people/pickle.js; the photo booth: people/photobooth.js; a battery swap: people/evswap.js)
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
  // (not on the days they go down to the quán cơm instead: people/comtrua.js)
  if (PRO && m >= 675 && m < 700 && lunchDay !== day && !comPlanned(d) && [...workers.values()].some(resting)) { lunchDay = day; orderLunch(S, day); return; }
  if (state.sim < lookAt) return;
  lookAt = state.sim + 20;
  // a trip to the shop: in office hours, not over lunch, now and then, someone who has not been out for half an hour;
  // and 22:00–2:00, whoever is still there with their session open: noodles from the 24-hour store, every ten minutes at most
  const night = m >= 1320 || m < 120;
  if ((!night && (m < 480 || m >= 1260 || (m >= 670 && m < 790))) || Math.random() > (night ? 0.4 : 0.3)) return;
  const list = [...workers.values()].filter((w) => resting(w) && state.sim - (w.outAt ?? -1e9) > (night ? 600 : 1800));
  // Claude Code moved to a new version and nobody has gone yet: whoever is free goes to Thế Giới Di Động
  if (upgradeDue && list.length && shopTrip(pick(list), S, { key: 'tgdd', why: 'upgrade', version: upgradeDue })) { upgradeDue = ''; return; }
  // the day's first cà phê (no one came in by the street this morning to have it on the way): 7:00–10:30 at the Highlands
  if (m >= 420 && m < 630 && coffeeDay !== day && list.length && S.doors().some((d) => keyOf(d) === 'highlands' && d.open)) { coffeeDay = day; if (shopTrip(pick(list), S, { key: 'highlands', why: 'morning' })) return; }
  // an afternoon coffee there now and then
  if (!night && m >= 780 && m < 990 && Math.random() < 0.25 && list.length && shopTrip(pick(list), S, { key: 'highlands', why: 'coffee' })) return;
  // the afternoon trà sữa, once a day, 15:30–17:00: Phúc Long (Katinat where there is no Phúc Long near; both are further
  // off than the stores, so not every trip)
  const tea = teaDay !== day && m >= 930 && m < 1020 && Math.random() < 0.3 && ['phuclong', 'katinat'].find((k) => S.doors().some((x) => keyOf(x) === k && x.open));
  if (tea && list.length && shopTrip(pick(list), S, { key: tea, why: 'tea' })) { teaDay = day; return; }
  // Friday and weekend evenings, once, 18:00–21:00: Katinat, for the drink and the picture of it
  if (checkinDay !== day && [5, 6, 0].includes(d.getDay()) && m >= 1080 && m < 1260 && Math.random() < 0.3 && list.length && shopTrip(pick(list), S, { key: 'katinat', why: 'checkin' })) { checkinDay = day; return; }
  // a hot afternoon outside (the city's real weather, 32° and up, dry): the trip is for a 10k cone at the Mixue
  const hot = !night && m >= 750 && m < 1050 && wx.temp != null && wx.temp >= 32 && wx.rain < 0.05 && S.doors().some((d) => keyOf(d) === 'mixue' && d.open);
  if (list.length) shopTrip(pick(list), S, hot ? { key: 'mixue', why: 'hot' } : { night });
}
/* ---------- Claude Code's version on this computer (server: GET /api/claude-version): a new one sends someone to Thế
   Giới Di Động to "lên đời", once per version per page (the chat line is posted once, by the Mac's page) ---------- */
let upgradeDue = '', coffeeDay = '', teaDay = '', checkinDay = '';
const SEEN = 'office-claude-version';
async function lookForUpgrade() {
  const r = await fetch(`/api/claude-version${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`).then((x) => x.json()).catch(() => null);
  if (!r?.version || !r.at || Date.now() - r.at > 6 * 3600e3) return;   // (the first one seen, or long ago: no news)
  let seen = ''; try { seen = localStorage.getItem(SEEN) || ''; } catch { /* storage blocked */ }
  if (seen === r.version) return;
  try { localStorage.setItem(SEEN, r.version); } catch { /* storage blocked */ }
  upgrade(r.version);
}
/** Claude Code is at a new version: the group hears of it, and someone free goes to Thế Giới Di Động (now, or soon). */
export function upgrade(version) {
  const S = street(), list = [...workers.values()].filter(resting);
  if (S && !run && !replay.on && list.length && shopTrip(pick(list), S, { key: 'tgdd', why: 'upgrade', version })) return true;
  upgradeDue = version; chatLife('tgdd', { version, every: 60e3 });
  return false;
}
/** The work keeps failing (incidents.js: three failures in five minutes, the office goes red): someone resting right then
    goes to Long Châu for something for the headache ("ra mua thuốc đau đầu"). Everyone at work fixing it: nobody goes (and
    nothing is kept for later, so the demo's own incident at the start doesn't send anyone out a minute on). */
export function headache() {
  const S = street(), list = [...workers.values()].filter(resting);
  return !!(S && !run && !replay.on && list.length && shopTrip(pick(list), S, { key: 'longchau', why: 'headache' }));
}
/** The CI green again after going red (incidents.js): someone resting goes to the Mixue for ice cream for everyone. */
export function treat() {
  const S = street(); if (!S || run || replay.on) return false;
  const list = [...workers.values()].filter(resting);
  return !!list.length && shopTrip(pick(list), S, { key: 'mixue', why: 'treat' });
}

/* for tests and screenshots (?debug): send someone resting out now ('shop', to one chain if `key` says: 'gs25'…; 'night':
   the late-night noodles; 'tea', 'checkin', 'headache': to Phúc Long, Katinat, Long Châu), or order the lunch ('lunch') */
export function goOut(kind = 'shop', key = '') {
  const S = street(); if (!S || run) return false;
  if (kind === 'lunch') return orderLunch(S, officeNow().toDateString());
  if (kind === 'treat') return treat();
  if (kind === 'upgrade') return upgrade(key || '9.9.9');
  if (kind === 'morning') { const w = [...workers.values()].find(resting); return !!w && shopTrip(w, S, { key: 'highlands', why: 'morning' }); }
  if (kind === 'headache') return headache();
  if (kind === 'tea' || kind === 'checkin') { const w = [...workers.values()].find(resting); return !!w && shopTrip(w, S, { key: kind === 'tea' ? key || 'phuclong' : 'katinat', why: kind }); }
  const w = [...workers.values()].find(resting);
  return !!w && shopTrip(w, S, { key, night: kind === 'night' });
}
export const outing = () => (run ? { kind: run.kind, stage: run.stage, id: run.w?.id ?? null, shop: run.shop ?? null, item: run.item ?? null } : null);

export function setup() {
  streetHooks.home = goHome;
  streetHooks.arrive = arrive;
  if (!STATIC && !new URLSearchParams(location.search).has('demo')) { setTimeout(lookForUpgrade, 20e3); setInterval(lookForUpgrade, 3 * 60e3); }
}
