// The cozy plan's door; the company floor's lift and, beside it, the stairs.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, rand, randInt } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, mat, put, rbox } from '../scene/blocks.js';
import { boxAt, colorize, mergeAll } from './terrace.js';
import { LAY } from './layout.js';
import { DOOR_IN, DOOR_OUT } from '../people/navigation.js';
import { leaving, npcs, subs, workers } from '../people/workers.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

export let DZ;
export const doorPivot = new THREE.Group();
/* the lift (pro): a shaft in the lobby against the outer wall. Newcomers ride up (the display counts the floors, a
   chime, the doors slide open) and step out; people going home press the button, wait, step in, turn round to face
   the doors, and ride down once they close. */
const LIFT_HOME = 12;
export const LIFT_X = -7.5, LIFT_FRONT = -6.95;
export let lift;
// someone appears in the car: unless the doors are already open, it rides up from a lower floor first (while the lift is
// being serviced: up the stairs, out of their door)
export function liftArrive(w) {
  if (!lift) return;
  if (lift.service) { stairsUp(w); return; }
  w.pos.set(LIFT_X, DZ + rand(-0.3, 0.3)); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
  w.liftHold = true;
  if (lift.open < 0.05 && lift.at === LIFT_HOME && lift.goal === LIFT_HOME) lift.at = LIFT_HOME - randInt(3, 9);
}
export function liftCall(hold = 2.5) { if (lift) lift.callUntil = state.sim + hold; }
/** At the lift's doors (DOOR_IN) on the way down: press the button, wait, step in, turn round, and `gone()` once the doors
    have shut on them. While the lift is being serviced (life/lift-service.js): a sigh at the sign, and the stairs. */
export function liftDown(w, gone) {
  if (lift?.service) { stairsDown(w, gone); return; }
  w.anim = 'idle'; w.faceTarget = DOOR_IN.face;
  w.liftWait = () => w.goTo(DOOR_OUT, () => { w.faceTarget = Math.PI / 2; w.liftRide = gone; });
}
/** nobody in the lift, waiting for it or in its doors: it can be taken out of use */
export function liftIdle() {
  if (!lift || lift.open > 0.05) return false;
  for (const set of [workers.values(), subs.values(), leaving, npcs]) for (const w of set) if ((w.liftHold && !w.stairs) || w.liftWait || w.liftRide) return false;
  return true;
}

/* ---------- the stairs (company floor): a fire door in the outer wall beside the lift (world/pro/floor.js leaves the
   doorway), a landing behind it with the flight up and the floor's number painted on the wall, the green exit sign over
   the door. Nobody takes them while the lift works; while it is being serviced everyone does: down on foot, which takes a
   while, and up out of breath. stairHooks.used(w): someone took them (the group chat hears of it). ---------- */
export const STAIR = { z: 4.91, w: 0.82, h: 2.1 };   // the doorway: its middle along the wall, its width and height
export const stairHooks = { used: null };
export let STAIRS = null, stairDoor = null;
const stairQ = [];   // on the stairs: { w, up (coming up, else going down), at (when they are through), gone (down: then) }
const FLOOR = 12;    // (the floor the office is on: LIFT_HOME)
// coming up the stairs: unseen behind the door until they get to this floor, then out of it (liftHold keeps them where
// they are meanwhile, as in the car)
function stairsUp(w, secs = rand(7, 10)) {
  const e = { w, up: true, at: state.sim + secs };
  w.pos.set(STAIRS.x, STAIRS.z); w.face = w.faceTarget = Math.PI / 2; w.spot = STAIRS; w.liftHold = true; w.stairs = e;
  stairQ.push(e); stairHooks.used?.(w);
}
// going down them: to the door (it opens for them), through it, and `gone()` once they are down
function stairsDown(w, gone) {
  if (Math.random() < 0.6) { const text = tr('people.stairs.sigh'); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 3500); }
  stairHooks.used?.(w);
  w.goTo(STAIRS, () => {
    const e = { w, up: false, at: state.sim + rand(6, 9), gone };
    w.stairs = e; stairQ.push(e);
  });
  const last = w.path[w.path.length - 1];   // (held in front of the door until it is open)
  if (last) last.gate = () => { stairDoor.callUntil = state.sim + 1.2; return stairDoor.open > 0.85; };
}
function updateStairs(dt) {
  for (let i = stairQ.length - 1; i >= 0; i--) {
    const e = stairQ[i], w = e.w;
    if (w.stairs !== e || !w.root.parent) { stairQ.splice(i, 1); continue; }   // (gone home, or sent elsewhere)
    if (state.sim < e.at) continue;
    if (e.up) {   // on this floor: the door opens, out they come, out of breath
      stairDoor.callUntil = state.sim + 1.8;
      if (stairDoor.open < 0.85) continue;
      w.stairs = null; w.liftHold = false; stairQ.splice(i, 1);
      if (w.spot === STAIRS || Math.hypot(w.pos.x - STAIRS.x, w.pos.y - STAIRS.z) < 0.3) {
        w.puffUntil = state.sim + 9;
        const text = tr('people.stairs.puff', { n: FLOOR }); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 4500);
      }
    } else { w.stairs = null; stairQ.splice(i, 1); e.gone(); }   // down at the street door
  }
  const want = state.sim < stairDoor.callUntil ? 1 : 0;
  if (stairDoor.open !== want) {
    if (want && stairDoor.open === 0) sfx.play('click');
    stairDoor.open = THREE.MathUtils.clamp(stairDoor.open + (want ? 1 : -1) * dt * 2.4, 0, 1);
    const k = stairDoor.open * stairDoor.open * (3 - 2 * stairDoor.open);
    stairDoor.pivot.rotation.y = -1.35 * k;   // (into the stairwell, the way out)
  }
}
/** who is on the stairs now (for the tests): ids going down and coming up */
export const onStairs = () => ({ down: stairQ.filter((e) => !e.up).map((e) => e.w.id), up: stairQ.filter((e) => e.up).map((e) => e.w.id), open: stairDoor?.open ?? 0 });
// the door, the stairwell behind it and the signs (one canvas: the exit sign, the floor's number on the wall, the plate)
function buildStairs() {
  const z0 = STAIR.z - STAIR.w / 2, z1 = STAIR.z + STAIR.w / 2, H = STAIR.h;
  const g = new THREE.Group(); scene.add(g);
  const steel = mat('#5E656E', { roughness: 0.45, metalness: 0.4 }), wall = mat('#E6E3DA', { roughness: 0.9 }), dado = mat('#86A58F', { roughness: 0.85 }), concrete = mat('#A6A8A6', { roughness: 0.95 });
  // the frame round the doorway on the lobby's side; the threshold
  for (const z of [z0 - 0.025, z1 + 0.025]) put(g, rbox(0.06, H + 0.06, 0.05, steel, 0.01), -7.95, (H + 0.06) / 2, z);
  put(g, rbox(0.06, 0.06, STAIR.w + 0.1, steel, 0.01), -7.95, H + 0.03, STAIR.z);
  put(g, rbox(0.3, 0.02, STAIR.w, steel, 0.005), -8.15, 0.012, STAIR.z);
  // the landing behind it: concrete, walls with a pale green dado (as in the stairwells of the city's office towers), the
  // flight up along the back wall rising away from the door, a steel rail; a ceiling light
  const bx = -9.45, cz0 = z0 - 0.4, cz1 = z1 + 0.3, depth = -8.3 - bx;
  put(g, rbox(depth, 0.04, cz1 - cz0, concrete, 0.005), (bx - 8.3) / 2, -0.01, (cz0 + cz1) / 2);
  put(g, rbox(0.1, 3.3, cz1 - cz0 + 0.2, wall, 0.01), bx - 0.05, 1.65, (cz0 + cz1) / 2);
  for (const z of [cz0 - 0.05, cz1 + 0.05]) put(g, rbox(depth + 0.1, 3.3, 0.1, wall, 0.01), (bx - 8.3) / 2, 1.65, z);
  put(g, rbox(depth + 0.1, 0.08, cz1 - cz0 + 0.2, wall, 0.01), (bx - 8.3) / 2, 3.3, (cz0 + cz1) / 2);
  put(g, rbox(0.02, 1.1, cz1 - cz0, dado, 0.004), bx + 0.01, 0.55, (cz0 + cz1) / 2);
  const run = 0.27, rise = 0.17, sx = bx + 0.24;
  for (let k = 0; k < 6; k++) { const z = cz1 - 0.14 - k * run; if (z < cz0 + 0.1) break; put(g, rbox(0.46, rise * (k + 1), run, concrete, 0.004), sx, (rise * (k + 1)) / 2, z); }
  { const len = Math.hypot(5 * run, 5 * rise), r = put(g, rbox(0.04, 0.04, len, steel, 0.015), sx + 0.25, 0.95 + 3.5 * rise, cz1 - 0.14 - 2.5 * run); r.rotation.x = Math.atan2(rise, run); }
  for (const k of [0, 5]) put(g, rbox(0.03, 0.95, 0.03, steel, 0.008), sx + 0.25, rise * (k + 1) + 0.47, cz1 - 0.14 - k * run);
  put(g, rbox(0.4, 0.03, 0.18, mat('#F4F2EA', { emissive: '#FFF6DE', emissiveIntensity: 0.6 }), 0.01), -8.85, 3.24, STAIR.z);
  // the printing (one canvas): the exit sign, lit green with a running figure; the floor's number on the landing's wall;
  // the plate on the door; and a white strip, so the door's plain parts take their colour from their vertices
  const tex = canvasTex(512, 320, (c, W) => {
    const F = '"Be Vietnam Pro", system-ui, sans-serif';
    c.fillStyle = '#0E8A4A'; c.fillRect(0, 0, W, 96);
    c.fillStyle = '#FFFFFF'; c.fillRect(10, 10, 76, 76); c.fillStyle = '#0E8A4A';
    c.beginPath(); c.arc(54, 24, 8, 0, Math.PI * 2); c.fill();   // (the running figure, heading for the door)
    c.lineWidth = 8; c.lineCap = 'round'; c.strokeStyle = '#0E8A4A';
    for (const [a, b] of [[[50, 34], [42, 56]], [[42, 56], [56, 70]], [[56, 70], [52, 84]], [[42, 56], [30, 66]], [[48, 40], [62, 48]], [[48, 40], [32, 44]]]) { c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
    c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 34px ${F}`; c.fillText(tr('world.stairs.exit'), 290, 36, 390); c.font = `700 22px ${F}`; c.fillText(tr('world.stairs.exitSub'), 290, 72, 390);
    c.fillStyle = '#E6E3DA'; c.fillRect(0, 96, 256, 160);   // the number on the landing's wall
    c.fillStyle = '#2F5A3E'; c.font = `900 96px ${F}`; c.fillText(String(FLOOR), 128, 168); c.font = `800 26px ${F}`; c.fillText(tr('world.stairs.floor'), 128, 230);
    c.fillStyle = '#1F2328'; c.fillRect(256, 96, 256, 160);   // the plate on the door
    c.fillStyle = '#F3EFE8'; c.font = `800 34px ${F}`; c.fillText(tr('world.stairs.plate'), 384, 150, 236); c.font = `600 22px ${F}`; c.fillText(tr('world.stairs.plateSub', { n: FLOOR }), 384, 200, 236);
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 256, W, 64);
  });
  const V = (y) => 1 - y / 320, uvTo = (geo, [u0, v0, u1, v1]) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); return geo; };
  const WHITE = [0.5, V(290), 0.5, V(290)];
  const signM = new THREE.MeshBasicMaterial({ map: tex });
  put(g, rbox(0.06, 0.15, 0.42, '#E8ECEF', 0.01), -7.95, STAIR.h + 0.2, STAIR.z);
  put(g, new THREE.Mesh(uvTo(new THREE.PlaneGeometry(0.4, 0.075), [0, V(96), 1, V(0)]), signM), -7.915, STAIR.h + 0.2, STAIR.z).rotation.y = Math.PI / 2;
  put(g, new THREE.Mesh(uvTo(new THREE.PlaneGeometry(0.6, 0.38), [0, V(256), 0.5, V(96)]), signM), bx + 0.025, 1.62, STAIR.z - 0.15).rotation.y = Math.PI / 2;
  // the door: grey steel, a narrow pane of wired glass, a push bar on this side, a kick plate, the plate; it opens into
  // the stairwell (one mesh: lit, coloured by its vertices, the plate printed)
  const pivot = new THREE.Group(); pivot.position.set(-8.05, 0, z0 + 0.008); pivot.userData.noMerge = true; scene.add(pivot);
  const L = STAIR.w - 0.016, plain = (geo) => uvTo(geo, WHITE), leaf = mergeAll([
    plain(boxAt(0.045, H - 0.015, L, 0.0225, (H - 0.015) / 2, L / 2, '#7D848C')), plain(boxAt(0.05, 0.55, 0.15, 0.0225, 1.5, L * 0.74, '#33495A')),
    plain(boxAt(0.05, 0.2, L - 0.06, 0.0225, 0.13, L / 2, '#9AA1A9')), plain(boxAt(0.035, 0.05, L * 0.72, 0.075, 1.0, L * 0.5, '#C9CED6')),
    ...[0.17, 0.83].map((f) => plain(boxAt(0.04, 0.09, 0.04, 0.06, 1.0, L * f, '#3A3F47'))),
    colorize(uvTo(new THREE.PlaneGeometry(0.22, 0.137), [0.5, V(256), 1, V(96)]).rotateY(Math.PI / 2).translate(0.047, 1.45, L * 0.3), '#FFFFFF'),
  ]);
  const leafMesh = new THREE.Mesh(leaf, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.45, metalness: 0.3 })); leafMesh.receiveShadow = true; pivot.add(leafMesh);
  stairDoor = { pivot, open: 0, callUntil: 0 };
  // where to stand on the landing (going down, coming up): in round the lift's corner, through the doorway
  STAIRS = { x: -8.7, z: STAIR.z, face: -Math.PI / 2, node: 'I', via: [[-6.6, 4.7], [-7.55, STAIR.z]] };
}
function drawLiftDisplay(text) {
  const c = lift.disp.image, g = c.getContext('2d');
  g.fillStyle = '#0B0D10'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#FFB23F'; g.font = '700 50px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  lift.disp.needsUpdate = true;
}
export function updateLift(dt) {
  if (!lift) return;
  if (stairDoor) updateStairs(dt);
  if (lift.service) {   // being serviced (life/lift-service.js): the doors held where the technician left them, nobody in it
    lift.open += (lift.service.open - lift.open) * Math.min(1, dt * 2);
    const k = lift.open * lift.open * (3 - 2 * lift.open);
    lift.doors[0].position.z = DZ - 0.25 - k * 0.48; lift.doors[1].position.z = DZ + 0.25 + k * 0.48;
    lift.btn[0].color.set('#4A4F57'); lift.btn[1].color.set('#4A4F57');
    return;
  }
  let holding = 0, waiting = 0, through = false; const riding = [];
  for (const set of [workers.values(), subs.values(), leaving, npcs]) for (const w of set) {
    if (w.liftHold && !w.stairs) holding++;
    if (w.liftWait) waiting++;
    if (w.liftRide) riding.push(w);
    if (!w.liftHold && w.phase === 'walk' && w.pos.x < -5.9 && Math.abs(w.pos.y - DZ) < 0.95) through = true;
  }
  const need = holding || waiting || through || state.sim < lift.callUntil;
  if (need && lift.goal !== LIFT_HOME && lift.open < 0.02) lift.goal = LIFT_HOME;
  if (lift.at !== lift.goal && state.sim > lift.stepAt) {
    lift.at += Math.sign(lift.goal - lift.at); lift.stepAt = state.sim + 0.34;
    if (lift.at === LIFT_HOME) { sfx.play('ding'); lift.holdUntil = state.sim + 1.6; }
  }
  const here = lift.at === LIFT_HOME && lift.goal === LIFT_HOME;
  if (through) lift.holdUntil = Math.max(lift.holdUntil, state.sim + 1.1);
  const want = here && (holding || waiting || state.sim < lift.holdUntil || state.sim < lift.callUntil);
  lift.open = THREE.MathUtils.clamp(lift.open + (want ? 1 : -1) * dt * 1.5, 0, 1);
  if (lift.open > 0.8) for (const set of [workers.values(), subs.values(), leaving, npcs]) for (const w of set) {
    if (w.liftHold && !w.stairs) w.liftHold = false;
    if (w.liftWait) { const f = w.liftWait; w.liftWait = null; f(); }
  }
  if (!want && lift.open === 0 && riding.length) {   // doors shut with people inside: down it goes
    for (const w of riding) { const f = w.liftRide; w.liftRide = null; f(); }
    lift.goal = randInt(1, 4); lift.stepAt = state.sim + 0.7;
  }
  const k = lift.open * lift.open * (3 - 2 * lift.open);
  lift.doors[0].position.z = DZ - 0.25 - k * 0.48; lift.doors[1].position.z = DZ + 0.25 + k * 0.48;
  const moving = lift.at !== lift.goal, text = (moving ? (lift.goal > lift.at ? '▲ ' : '▼ ') : '') + lift.at;
  if (text !== lift.shown) { lift.shown = text; drawLiftDisplay(text); }
  lift.btn[0].color.set(holding || (moving && lift.goal === LIFT_HOME) ? '#FFB23F' : '#4A4F57');
  lift.btn[1].color.set(waiting || riding.length ? '#FFB23F' : '#4A4F57');
}

export function setup() {
  /* door (cozy); the company floor has a lift instead */
  DZ = LAY.doorZ;   // the entrance, in the left wall
  if (!PRO) {
    put(scene, rbox(0.14, 2.66, 1.76, '#4A3426', 0.03), -7.96, 1.33, DZ);
    put(scene, rbox(0.06, 2.42, 1.46, '#1E1813', 0.01), -7.91, 1.21, DZ);
    doorPivot.position.set(-7.88, 0, DZ - 0.72); scene.add(doorPivot);
    put(doorPivot, rbox(0.07, 2.4, 1.42, '#A8784D', 0.03), 0.035, 1.2, 0.71);
    for (const [y, h] of [[1.75, 0.7], [0.65, 0.9]]) put(doorPivot, rbox(0.02, h, 1.1, '#956A43', 0.02), 0.075, y, 0.71);
    put(doorPivot, new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat('#E8C170', { metalness: 0.7, roughness: 0.3 })), 0.11, 1.1, 1.28);
  }
  lift = PRO ? (() => {
    const x0 = -8.0, xf = LIFT_FRONT, half = 1.1, H = 3.0, dw = 0.5, dh = 2.15, zc = DZ;
    const g = new THREE.Group(); scene.add(g);
    const clad = mat('#3A3F47', { roughness: 0.55 }), brass = mat('#C9A227', { metalness: 0.7, roughness: 0.32 });
    const steel = mat('#BCC4CC', { metalness: 0.78, roughness: 0.26 }), carM = mat('#E4DCCF', { roughness: 0.55 }), wood = mat('#8E6B4E', { roughness: 0.5 });
    for (const s of [-1, 1]) put(g, rbox(xf - x0, H, 0.1, clad, 0.02), (x0 + xf) / 2, H / 2, zc + s * (half - 0.05));    // sides
    for (const s of [-1, 1]) put(g, rbox(0.12, H, half - dw, clad, 0.02), xf - 0.06, H / 2, zc + s * (dw + (half - dw) / 2));   // front, beside the doors
    put(g, rbox(0.12, H - dh, 2 * dw + 0.02, clad, 0.01), xf - 0.06, dh + (H - dh) / 2, zc);                               // over the doors
    put(g, rbox(xf - x0 + 0.06, 0.1, 2 * half + 0.06, mat('#2B2F36', { roughness: 0.5 }), 0.02), (x0 + xf) / 2, H + 0.05, zc);   // cap
    put(g, rbox(0.03, 0.035, 2 * half + 0.07, brass, 0.008), xf + 0.025, H + 0.02, zc);                                     // a brass line under it
    put(g, rbox(xf - x0 + 0.02, 0.12, 2 * half + 0.02, mat('#2B2F36', { roughness: 0.6 }), 0.01), (x0 + xf) / 2, 0.06, zc); // plinth
    for (const s of [-1, 1]) put(g, rbox(0.05, dh + 0.05, 0.06, brass, 0.01), xf + 0.015, dh / 2, zc + s * (dw + 0.03));  // frame
    put(g, rbox(0.05, 0.06, 2 * dw + 0.12, brass, 0.01), xf + 0.015, dh + 0.03, zc);
    // the car: a wood back wall with a handrail, light side walls, a lit ceiling (seen while the doors are open)
    put(g, rbox(xf - x0 - 0.14, 0.02, 2 * half - 0.22, mat('#55595F', { roughness: 0.7 }), 0.004), (x0 + xf) / 2 - 0.06, 0.125, zc);
    put(g, rbox(0.03, dh, 2 * half - 0.22, wood, 0.01), x0 + 0.03, dh / 2, zc);
    for (const s of [-1, 1]) put(g, rbox(xf - x0 - 0.16, dh, 0.02, carM, 0.005), (x0 + xf) / 2 - 0.06, dh / 2, zc + s * (half - 0.11));
    put(g, rbox(0.04, 0.04, 1.5, steel, 0.015), x0 + 0.1, 0.95, zc);
    const carLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.2) });
    put(g, new THREE.Mesh(new THREE.BoxGeometry(xf - x0 - 0.2, 0.03, 2 * half - 0.3), carLight), (x0 + xf) / 2 - 0.06, dh - 0.02, zc);
    // two steel leaves that slide into the wall
    const doors = [-1, 1].map((s) => { const d = rbox(0.03, dh - 0.02, dw + 0.01, steel, 0.008); d.position.set(xf - 0.06, (dh - 0.02) / 2, zc + s * dw / 2); d.userData.noMerge = true; g.add(d); return d; });
    for (const d of doors) put(d, rbox(0.035, dh - 0.3, 0.012, mat('#9AA3AD', { metalness: 0.6, roughness: 0.4 }), 0.004), 0, 0, 0);
    // floor display over the doors, call buttons beside them
    const disp = canvasTex(192, 72, () => {});
    const dispM = new THREE.MeshBasicMaterial({ map: disp });
    put(g, rbox(0.04, 0.24, 0.6, mat('#15181E', { roughness: 0.4 }), 0.01), xf + 0.02, dh + 0.36, zc);
    { const m = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.2), dispM), xf + 0.045, dh + 0.36, zc); m.rotation.y = Math.PI / 2; m.userData.noMerge = true; }
    put(g, rbox(0.03, 0.26, 0.12, steel, 0.01), xf + 0.015, 1.12, zc + dw + 0.26);
    const btn = [1.18, 1.06].map((y) => { const m = new THREE.MeshBasicMaterial({ color: '#4A4F57' }), b = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), m), xf + 0.032, y, zc + dw + 0.26); b.rotation.y = Math.PI / 2; b.userData.noMerge = true; return m; });
    // the car's operating panel by the doors, on its inside wall (the floors' buttons, the alarm)
    { const zp = zc - half + 0.135; put(g, rbox(0.2, 0.86, 0.02, steel, 0.005), xf - 0.32, 1.25, zp);
      for (let k = 0; k < 8; k++) put(g, rbox(0.035, 0.035, 0.012, '#2B2F36', 0.004), xf - 0.36 + (k % 2) * 0.08, 0.98 + Math.floor(k / 2) * 0.09, zp + 0.012);
      put(g, rbox(0.05, 0.05, 0.012, '#C8A227', 0.01), xf - 0.32, 1.56, zp + 0.012); }
    return { g, doors, disp, dispM, btn, carLight, open: 0, at: LIFT_HOME, goal: LIFT_HOME, stepAt: 0, holdUntil: 0, callUntil: 0, shown: '', service: null };
  })() : null;
  if (lift) buildStairs();
}
