// Foosball in the lounge (the company floor): now and then two people who are resting play a game at the table (one
// asks, the other comes over), rods spinning, the ball rattling up and down the pitch, the goals counted out loud, the
// winner pleased with themselves. Work coming in for either of them ends the game where it stands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from '../core/state.js';
import { officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { mat } from '../scene/blocks.js';
import { colorize } from '../world/terrace.js';
import { PRO_FX } from '../world/pro/pieces.js';
import { napOn } from '../life/nap.js';
import { standBy } from './navigation.js';
import { sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

// the table (world/pro/floor.js builds its cabinet): 1.2 x 0.7, the rods 2 cm over its top; red keeps the -x goal
const L = 1.2, W = 0.7, TOP = 0.92, GOAL = 0.1, BALL_Y = TOP - 0.05, XMAX = L / 2 - 0.07, ZMAX = W / 2 - 0.07;
const XS = [-0.47, -0.33, -0.19, -0.06, 0.06, 0.19, 0.33, 0.47], MEN = [1, 2, 3, 5, 5, 3, 2, 1], RED = [0, 1, 3, 5];
const manZ = (n, k) => (n === 1 ? 0 : (k - (n - 1) / 2) * (0.5 / (n - 1)));
let FB = null, rods = [], ball = null, spots;
let G = null, nextAt = 0, tokAt = 0;

/* ---------- the rods and the ball: dynamic, so they can spin and slide ---------- */
function rodGeo(i) {
  const red = RED.includes(i), side = red ? -1 : 1, team = red ? '#D64550' : '#3F7CC4', parts = [];
  parts.push(colorize(new THREE.CylinderGeometry(0.008, 0.008, W + 0.1, 6).rotateX(Math.PI / 2), '#B8BEC6'));
  parts.push(colorize(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0, side * (W / 2 + 0.1)), '#15171B'));
  for (let k = 0; k < MEN[i]; k++) {   // each little player hangs from the rod: body below it, head above
    const z = manZ(MEN[i], k);
    parts.push(colorize(new THREE.BoxGeometry(0.03, 0.07, 0.035).translate(0, -0.04, z), team));
    parts.push(colorize(new THREE.SphereGeometry(0.016, 8, 6).translate(0, 0.015, z), '#F2D3B3'));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
function buildTable() {
  FB = PRO_FX.foosball; if (!FB) return;
  const m = mat('#FFFFFF', { roughness: 0.5, metalness: 0.2, vertexColors: true });
  rods = XS.map((x, i) => {
    const o = new THREE.Mesh(rodGeo(i), m); o.position.set(x, TOP + 0.02, 0); o.userData.dynamic = true; o.castShadow = false; FB.add(o);
    return { o, x, i, red: RED.includes(i), spin: 0, ang: 0, slide: 0 };
  });
  ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat('#FFFFFF', { roughness: 0.4 }));
  ball.position.set(0.12, BALL_Y, 0.08); ball.userData.dynamic = true; FB.add(ball);
}
// where the two stand: at the long sides, by their handles (looked up the first time: the walking grid is built by then)
function places() {
  if (spots === undefined) {
    const x = FB.position.x, z = FB.position.z, red = standBy(x, z - (W / 2 + 0.1), [0, -1]), blue = standBy(x, z + (W / 2 + 0.1), [0, 1]);
    spots = red && blue ? { red, blue } : null;
  }
  return spots;
}

/* ---------- a game ---------- */
const called = (w) => { const s = sessions.get(w.id); return !s || s.status !== 'rest' || !!s.bg?.length || !!w.want; };
// who could play: resting, nothing else on (not out, not on a break, not carrying anything, not at tea)
function who() {
  return [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && !s.bg?.length && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.carry && !w.doze && !w.mealBox && !w.shred; });
}
/** A game now (?debug: __office.pingpong(), or forced), else now and then on its own. Returns whether one started. */
export function foosball(force = false) {
  if (G || !FB || replay.on || reduceMotion) return false;
  const h = officeNow().getHours();
  if (!force && (napOn || h < 9 || h >= 21)) return false;
  const at = places(); if (!at) return false;
  const list = who(); if (list.length < 2) return false;
  const a = list.splice(Math.floor(Math.random() * list.length), 1)[0], b = list[Math.floor(Math.random() * list.length)];
  const end = state.sim + rand(70, 170), look = [FB.position.x, FB.position.z];
  G = { a, b, end, score: [0, 0], ready: false, over: false, serveAt: 0, bx: 0, bz: 0, vx: 0, vz: 0 };
  // one asks and walks over, the other answers and follows a moment later
  G.ea = a.errand({ type: 'idle', spot: at.red, look, anim: 'console', wait: 0.4, hold: 0.4, anim2: 'idle', linger: 0.8, line: tr('people.foos.invite') });
  G.eb = b.errand({ type: 'idle', spot: at.blue, look, anim: 'console', wait: 2.4, hold: 0.4, anim2: 'idle', linger: 0.8, line: tr('people.foos.join') });
  G.ea.until = G.eb.until = end;
  return true;
}
// the end of it: both let go (now, or after a moment for the winner's cheer), and back to their places
function finish(after = 0) {
  if (!G || G.over) return;
  G.over = true;
  for (const [w, e] of [[G.a, G.ea], [G.b, G.eb]]) if (w.chore === e) { e.until = state.sim + after; if (w.after) w.afterAt = Math.min(w.afterAt, e.until); }
}
function serve() { G.bx = 0; G.bz = rand(-0.12, 0.12); const s = Math.random() < 0.5 ? -1 : 1; G.vx = s * rand(0.35, 0.6); G.vz = rand(-0.35, 0.35); G.serveAt = 0; }
function tok() { if (state.sim - tokAt > 0.3) { tokAt = state.sim; sfx.play('click'); } }
// the ball's step: the walls, the goals, and the little players in its way
function play(dt) {
  if (G.serveAt) { if (state.sim < G.serveAt) return; serve(); }
  const px = G.bx;
  G.bx += G.vx * dt; G.bz += G.vz * dt;
  G.vx *= 1 - 0.15 * dt; G.vz *= 1 - 0.15 * dt;
  if (Math.abs(G.bz) > ZMAX) { G.bz = Math.sign(G.bz) * ZMAX; G.vz = -G.vz; tok(); }
  if (Math.abs(G.bx) > XMAX) {
    if (Math.abs(G.bz) < GOAL) {   // in! (past red's goalkeeper at -x: a goal for blue)
      const blue = G.bx < 0, scorer = blue ? G.b : G.a;
      G.score[blue ? 1 : 0]++;
      quip(scorer, `${tr('people.foos.goal')} ${tr('people.foos.score', { a: G.score[0], b: G.score[1] })}`, 'idle');
      sfx.play('pop');
      G.serveAt = state.sim + 1.6; G.bx = Math.sign(G.bx) * (XMAX + 0.04); G.vx = G.vz = 0;
      if (Math.max(...G.score) >= 5) gameOver();
      return;
    }
    G.bx = Math.sign(G.bx) * XMAX; G.vx = -G.vx; tok();
  }
  // a rod it crosses: if one of its players is there (most of the time), a kick toward the other end
  for (const r of rods) {
    if ((px - r.x) * (G.bx - r.x) > 0) continue;
    const n = MEN[r.i]; let hit = false;
    for (let k = 0; k < n && !hit; k++) hit = Math.abs(manZ(n, k) + r.slide - G.bz) < 0.04;
    if (!hit || Math.random() > 0.8) continue;
    const dir = r.red ? 1 : -1;
    G.vx = dir * rand(0.7, 1.4); G.vz = rand(-0.5, 0.5); G.bx = r.x + dir * 0.02;
    r.spin = dir * rand(14, 22); tok();
    break;
  }
  if (Math.abs(G.vx) < 0.12) G.vx = Math.sign(G.vx || 1) * 0.3;   // (never quite still on the pitch)
}
function gameOver() {
  const [r, b] = G.score, win = b > r ? G.b : G.a, lose = win === G.a ? G.b : G.a;
  quip(win, tr('people.foos.win'), 'idle'); quip(lose, tr('people.foos.lose'), 'idle');
  win.anim = 'celebrate'; lose.anim = 'think';
  finish(2.4);
}

// off the game (walked away, gone home), or at the table with their hands on the rods
const gone = (w, e) => w.chore !== e || w.leaving || !w.root.parent;
const at = (w, e) => w.chore === e && e.stage === 'go' && w.phase !== 'walk' && !!w.spot && Math.hypot(w.pos.x - w.spot.x, w.pos.y - w.spot.z) < 0.3 && w.anim === 'console';
export function updateFoosball(dt) {
  if (!FB) return;
  if (!G) {
    if (state.sim > nextAt) { nextAt = state.sim + 30; if (Math.random() < 0.2 && foosball()) nextAt = state.sim + rand(600, 1200); }
    return;
  }
  const a = G.a, b = G.b;
  if (gone(a, G.ea) && gone(b, G.eb)) { G = null; nextAt = state.sim + rand(600, 1200); ball.position.set(0.12, BALL_Y, 0.08); return; }
  if (!G.over) {
    if (gone(a, G.ea) || gone(b, G.eb)) finish();
    else if (called(a) || called(b)) { quip(called(a) ? a : b, tr('people.foos.called'), 'idle'); finish(); }   // work came in: that's that
    else if (state.sim > G.end - 3 && G.ready) gameOver();
  }
  if (!G.ready && at(a, G.ea) && at(b, G.eb)) { G.ready = true; serve(); }
  if (!G.ready || G.over) return;
  for (let t = dt; t > 0; t -= 0.03) play(Math.min(t, 0.03));
  ball.position.set(G.bx, BALL_Y, G.bz);
  // the rods: each side's slide after the ball, spin from a kick dying away, a fidget now and then
  for (const r of rods) {
    const n = MEN[r.i]; let best = 9;
    for (let k = 0; k < n; k++) { const d = G.bz - manZ(n, k); if (Math.abs(d) < Math.abs(best)) best = d; }
    r.slide += (THREE.MathUtils.clamp(best, -0.07, 0.07) - r.slide) * Math.min(1, dt * 6);
    r.spin *= Math.exp(-dt * 5); r.ang += r.spin * dt;
    r.ang += (Math.sin(state.sim * 3 + r.i) * 0.25 - r.ang) * Math.min(1, dt * (Math.abs(r.spin) > 1 ? 0 : 3));
    r.o.position.z = r.slide; r.o.rotation.z = r.ang;
  }
}
export const foosState = () => G && { ready: G.ready, over: G.over, score: G.score.slice(), ball: [+G.bx.toFixed(3), +G.bz.toFixed(3)], players: [G.a.id, G.b.id] };

let hooked = false;
export function setup() {
  buildTable();
  nextAt = rand(120, 300);
  if (new URLSearchParams(location.search).has('debug')) {
    const hook = () => { if (hooked) return; if (!window.__office) { setTimeout(hook, 500); return; } hooked = true; Object.assign(window.__office, { pingpong: () => foosball(true), foosball: () => foosball(true) }); Object.defineProperty(window.__office, 'foos', { get: foosState, configurable: true }); };
    setTimeout(hook, 0);
  }
}
