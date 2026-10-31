// A strip from the photo booth for every release (world/backdrops/street-photo.js; the release: a new version tag in a
// session's repository or a GitHub release, server/git.mjs). Four people resting go across the street ("Ra bản {tag}
// rồi, đi chụp hình kỷ niệm 📸"), into the first booth behind the pink curtain, and pose for four frames with the
// booth's props (cat ears, giant heart sunglasses, party hats, then whatever they like), the flash going off each time;
// the strip comes out of the printer and into the group chat, and they come back up still wearing the props, and one
// pins it on the whiteboard (life/photostrips.js: the release history, six strips). At the weekend the queue is long:
// they are back nearly two hours later ("chờ gần 2 tiếng"). Closed (22:00–9:00): they go when it opens. Work coming in
// calls one back at a run. With the city outside only. ?photo: a release now (?debug: __office.photo).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { officeNow, rand, replay } from '../core/env.js';
import { later } from './errands.js';
import { dn, sessions, workers } from './workers.js';
import { STATIONS } from './navigation.js';
import { called, goDown, goUp, here, live, mainExit, outside, resume, street, walk } from './outings.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi } from '../ui/activity.js';
import { board } from '../world/furniture/board.js';
import { pinStrip, stripPhoto } from '../life/photostrips.js';
import { colorize, mergeAll, vmat } from '../world/terrace.js';
import { t as tr } from '../../i18n/index.js';

const Q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FORCE = Q0.has('photo');
let T = null, last = null, lookAt = 0;   // the trip under way (last: the one before, for tests)
const pending = [];   // the releases waiting for a trip (three at most)
const free = (w) => { const s = sessions.get(w.id); return !w.sub && !!w.root.parent && !w.leaving && !w.away && !w.homeBound && !w.chore && !w.after && !w.want && !w.outing && !w.nhau && !w.street
  && !w.offstage && w.phase !== 'walk' && !w.liftHold && !w.liftWait && !w.liftRide && !w.inStall && !w.wcBusy && !w.queued && !w.onBreak && s?.status === 'rest' && !s.bg?.length; };
const say = (w, key, v) => w.say('idle', tr(key, v));
const POSES = ['v', 'heart', 'cheek', 'jump'];
const up = (p) => ({ ...p, y0: p.y });   // (a point inside the studio: walked on its floor, a step up from the pavement)

/* ---------- the booth's props on their heads: ears on a headband, giant heart sunglasses, a party hat ---------- */
let PROPS = null;
function propGeos() {
  if (PROPS) return PROPS;
  const ears = [colorize(new THREE.TorusGeometry(1.08, 0.06, 6, 20, Math.PI).translate(0, 0.25, -0.05), '#FF8FB8')];
  for (const s of [-1, 1]) ears.push(colorize(new THREE.ConeGeometry(0.3, 0.55, 4).rotateZ(-s * 0.35).translate(s * 0.68, 1.2, -0.05), '#FF8FB8'), colorize(new THREE.ConeGeometry(0.16, 0.3, 4).rotateZ(-s * 0.35).translate(s * 0.66, 1.15, 0.05), '#FFE3EE'));
  const glasses = [colorize(new THREE.BoxGeometry(0.28, 0.08, 0.06).translate(0, -0.05, 1.08), '#E8327A')];
  for (const s of [-1, 1]) glasses.push(colorize(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 18).rotateX(Math.PI / 2).translate(s * 0.48, -0.1, 1.06), '#E8327A'), colorize(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 18).rotateX(Math.PI / 2).translate(s * 0.48, -0.1, 1.08), '#2A1A24'));
  const hat = [colorize(new THREE.ConeGeometry(0.42, 1.0, 16).rotateZ(0.2).translate(0.18, 1.45, 0), '#3FB6E8'), colorize(new THREE.SphereGeometry(0.13, 10, 8).translate(0.38, 1.98, 0), '#FFFFFF'), colorize(new THREE.TorusGeometry(0.4, 0.05, 6, 18).rotateX(Math.PI / 2).rotateZ(0.2).translate(0.08, 0.98, 0), '#FFC93C')];
  const m = vmat({ roughness: 0.5 });
  PROPS = { ears: [mergeAll(ears), m], glasses: [mergeAll(glasses), m], hat: [mergeAll(hat), m] };
  return PROPS;
}
const KINDS = ['ears', 'glasses', 'hat'];
// one prop (or none) on someone's head, sized to it
function wear(m, kind) {
  const w = m.w;
  if (m.prop) { w.P.head.remove(m.prop); m.prop = null; }
  if (!kind) return;
  const [geo, mt] = propGeos()[kind], o = new THREE.Mesh(geo, mt), R = w.P.D.R;
  o.scale.setScalar(R); o.position.y = R * 0.05; w.P.head.add(o); m.prop = o;
}

/** A release (life/incidents.js): four of them to the photo booth for a strip, now or when it opens. */
export function photoRelease(tag) {
  if (!tag || replay.on || pending.includes(tag) || T?.tag === tag) return;
  pending.push(tag); if (pending.length > 3) pending.shift();
  lookAt = 0;
}

function start(list, Q, tag) {
  const d = officeNow();
  T = { tag, members: [], stage: 'going', since: state.sim, weekend: Q.weekend(), Q, day: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`, seed: Math.floor(Math.random() * 100), frame: -1 };
  chatLife('photoGo', { id: list[0].id, tag, every: 60e3 });
  list.slice(0, 4).forEach((w, i) => later(1 + i * rand(1.2, 2.5), () => enlist(free(w) ? w : spare())));
  queueUi();
}
const spare = () => [...workers.values()].find((x) => free(x) && !T?.members.some((m) => m.w === x)) || null;
function enlist(w) {
  const S = street(), Q = S?.photo, ex = S && mainExit(S);
  if (!w || !T || T.stage !== 'going' || T.members.length >= 4 || T.members.some((m) => m.w === w) || !Q || !ex) return;
  const m = { kind: 'photo', w, i: T.members.length, stage: 'go', ex, dead: false, prop: null };
  m.drop = () => drop(m);
  T.members.push(m);
  w.outing = m; w.chore = { outing: true }; w.station = 'out'; w.restAt = Infinity; w.outAt = state.sim;
  w.hush(); w.anim = 'wake'; w.afterAt = state.sim + 1.6;
  w.after = () => {
    if (!live(m, 'go')) return;
    w.anim = 'idle'; say(w, 'people.photo.say.go');
    goDown(w, m, () => {
      m.stage = 'walk'; outside(w, S, ex); w.hurry = FORCE;
      const at = Q.wait(m.i);
      walk(w, S, [...(S.route(ex, at) || []), at], () => { if (!live(m, 'walk')) return; m.stage = 'wait'; w.ground = at.y; w.anim = 'idle'; sync(); }, at.face);
    });
  };
  sync();
}
// their turn: in at the door, behind the curtain, two at the back and two in front
function goIn(S, Q) {
  T.stage = 'in'; Q.hold(true);
  for (const m of T.members) {
    if (m.dead || m.stage !== 'wait') continue;
    const w = m.w, door = Q.door(), inn = Q.in(), cur = Q.curtain(), at = Q.booth(m.i);
    m.stage = 'enter';
    walk(w, S, [door, up(inn), up(cur), up(at)], () => { if (!live(m, 'enter')) return; m.stage = 'booth'; w.ground = at.y; w.faceTarget = at.face; w.anim = 'idle'; sync(); }, at.face);
  }
}
// a frame: "3, 2, 1", everyone's pose and prop, the flash
function frame() {
  const f = ++T.frame, in_ = T.members.filter((m) => m.stage === 'booth');
  if (!in_.length) return;
  say(in_[0].w, `people.photo.say.frame${f}`);
  in_.forEach((m, k) => { const w = m.w; wear(m, f < 3 ? KINDS[f] : KINDS[(k + T.seed) % 3]); w.P.photo = POSES[(f + k) % 4]; w.anim = 'photo'; });
  later(2.2, () => { if (T && !T.dead) T.Q.flash(); });
}
// the strip: out of the printer, into the group chat; then out and back up
function printed(S, Q) {
  T.stage = 'print';
  const who = T.members.filter((m) => m.stage === 'booth'), first = who[0];
  if (!first) return;
  for (const m of who) { m.w.anim = 'laugh'; m.stage = 'out'; }
  const at = Q.printer();
  walk(first.w, S, [up(Q.curtain()), up(at)], () => {
    if (!T || first.dead) return;
    first.w.faceTarget = at.face; first.w.anim = 'tidy'; Q.print();
    later(2.6, () => {
      if (!T) return;
      T.strip = { tag: T.tag, day: T.day, seed: T.seed, people: T.members.map((m) => ({ hair: m.w.cfg.hair, skin: m.w.cfg.skin, shirt: m.w.cfg.shirt })) };
      T.carrier = first; first.w.carry = null; say(first.w, 'people.photo.say.done');
      chatLife('photoStrip', { id: first.w.id, tag: T.tag, photo: stripPhoto(T.strip), every: 60e3 });
      for (const m of T.members) if (!m.dead && m.stage === 'out') home(m, S);
    });
  }, at.face);
  for (const m of who.slice(1)) walk(m.w, S, [up(Q.curtain()), up(Q.in())], () => { if (!m.dead) m.w.anim = 'laugh'; });
}
// out of the door, along the street, up; a prop still on (the booth lets them keep it a while); the strip to the board
function home(m, S) {
  const w = m.w, Q = S.photo, from = Q ? Q.door() : here(w);
  m.stage = 'back'; w.anim = 'idle'; w.ground = S.pavement;
  wear(m, KINDS[(m.i + (T?.seed || 0)) % 3]);
  walk(w, S, [...(Q ? [up(Q.in())] : []), from, ...(S.route(from, m.ex) || [])], () => live(m, 'back') && goUp(w, m, () => w.homeSpot(), () => arrived(m)));
  sync();
}
function arrived(m) {
  const strip = T?.strip, carrier = T?.carrier === m;
  finish(m); resume(m.w, false); wear(m, null);
  if (!carrier || !strip) return;
  // the strip to the whiteboard, pinned along the bottom with the others
  const w = m.w, spot = STATIONS.board?.[0];
  const pin = () => { pinStrip(strip); w.say('idle', tr('people.photo.say.pin', { tag: strip.tag })); };
  if (!spot || !w.errand) { pin(); return; }
  w.errand({ type: 'idle', spot, look: [board.position.x, board.position.z], anim: 'board', wait: 0.6, hold: 2.2, linger: 1.2, arrived: () => later(1.6, pin) });
}
function finish(m) {
  if (m.dead) return;
  const w = m.w;
  m.dead = true; m.stage = 'gone';
  w.outing = null; w.chore = null; w.hurry = false;
  sync();
}
// called off: the session ended, a replay began, the city went away: back at their place (the props off)
function drop(m) {
  if (m.dead) return;
  finish(m); wear(m, null);
  const w = m.w;
  if (w.leaving) return;
  if (w.street || w.offstage || w.liftRide || w.liftWait || ['booth', 'enter', 'out', 'wait'].includes(m.stage)) {
    w.street = w.offstage = false; w.liftRide = w.liftWait = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
    const at = w.homeSpot(); w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
    resume(w, false);
  } else { w.after = null; w.anim = 'idle'; w.restAt = state.sim; }
}
// work came in: out at a run (the others carry on)
function backToWork(m, S) {
  m.w.hurry = true; say(m.w, 'people.photo.say.work'); wear(m, null);
  const w = m.w, Q = S.photo, from = Q ? Q.door() : here(w), inBox = ['booth', 'enter', 'out'].includes(m.stage);
  m.stage = 'back'; w.anim = 'idle';
  walk(w, S, [...(inBox && Q ? [up(Q.curtain()), up(Q.in())] : []), from, ...(S.route(from, m.ex) || [])], () => live(m, 'back') && goUp(w, m, () => w.homeSpot(), () => { finish(m); resume(w, false); }));
  sync();
}
function sync() { queueUi(); }
/** for the session list (outings.js whereabouts) */
export function photoNow(m) {
  const st = m.stage === 'wait' ? (T?.weekend ? 'queue' : 'wait') : m.stage === 'booth' || m.stage === 'enter' || m.stage === 'out' ? 'booth' : m.stage === 'back' || m.stage === 'up' ? 'back' : 'going';
  return { ic: 'walk', text: tr(`people.photo.where.${st}`, { tag: T?.tag || '' }) };
}

/* ---------- each frame (from outings.js) ---------- */
export function updatePhoto() {
  const S = street(), Q = S?.photo;
  if (T) { step(S, Q); return; }
  if (FORCE && !pending.length && !last) photoRelease('v1.0.0');
  if (!pending.length || !Q || replay.on || state.sim < 15 || state.sim < lookAt) return;
  lookAt = state.sim + 10;
  if (!Q.open() && !FORCE) return;
  const list = [...workers.values()].filter(free).sort(() => Math.random() - 0.5);
  if (!list.length) return;
  start(list, Q, pending.shift());
}
function step(S, Q) {
  if (!S || !Q || replay.on) { for (const m of [...T.members]) drop(m); Q?.hold(false); last = debug.state(); T = null; return; }
  const alive = T.members.filter((m) => !m.dead);
  for (const m of alive) if (m.stage !== 'back' && m.stage !== 'up' && m.stage !== 'go' && called(m.w)) backToWork(m, S);
  if (T.stage === 'going') {
    if (alive.length && alive.every((m) => m.stage === 'wait')) {
      T.stage = 'queue';
      // a weekday: a minute or two; the weekend: the queue along the pavement, nearly two hours
      T.turnAt = state.sim + (FORCE || T.quick ? rand(4, 8) : T.weekend ? rand(105, 118) * 60 : rand(40, 120));
    } else if (!T.members.length && state.sim - T.since > 25 && state.sim > (T.retryAt || 0)) { T.retryAt = state.sim + 15; enlist(spare()); }
  }
  if (T.stage === 'queue') {
    for (const m of alive) if (m.stage === 'wait') { m.w.anim = Math.sin(state.sim * 0.3 + m.i) > 0.2 ? 'think' : 'idle'; }
    if (state.sim > T.turnAt) { if (T.weekend) chatLife('photoQueue', { id: alive[0]?.w.id, every: 60e3 }); goIn(S, Q); }
  }
  if (T.stage === 'in' && alive.length && alive.every((m) => m.stage === 'booth' || m.stage === 'back')) { T.stage = 'shoot'; T.nextAt = state.sim + 1.5; }
  if (T.stage === 'shoot' && state.sim > T.nextAt) {
    if (T.frame < 3) { frame(); T.nextAt = state.sim + 3.4; } else printed(S, Q);
  }
  if (!alive.length && T.members.length) { last = debug.state(); Q.hold(false); T = null; return; }
  if (T.stage === 'going' && !alive.length && state.sim - T.since > 240) { last = debug.state(); Q.hold(false); T = null; return; }
  if (T.strip && alive.every((m) => m.stage === 'back' || m.stage === 'up')) Q.hold(false);
}

/* ---------- for tests (?debug): a release now, the queue's wait cut short, what's going on ---------- */
const debug = {
  release: (tag = 'v9.9.9') => { photoRelease(tag); return pending.length; },
  quick: () => { if (!T) return false; T.quick = true; if (T.turnAt) T.turnAt = Math.min(T.turnAt, state.sim + 2); return true; },
  state: () => (!T ? last : { tag: T.tag, stage: T.stage, weekend: T.weekend, frame: T.frame, strip: !!T.strip, waitMin: T.turnAt ? Math.round((T.turnAt - state.sim) / 60) : null, members: T.members.map((m) => ({ id: m.w.id, name: dn(sessions.get(m.w.id)), stage: m.stage, prop: !!m.prop })) }),
  pending: () => [...pending],
};
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.photo = debug; }, 0);
