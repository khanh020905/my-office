// The cozy plan's door and the company floor's lift.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, rand, randInt } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, mat, put, rbox } from '../scene/blocks.js';
import { LAY } from './layout.js';
import { DOOR_OUT } from '../people/navigation.js';
import { leaving, npcs, subs, workers } from '../people/workers.js';
import { sfx } from '../audio/sfx.js';

export let DZ;
export const doorPivot = new THREE.Group();
/* the lift (pro): a shaft in the lobby against the outer wall. Newcomers ride up (the display counts the floors, a
   chime, the doors slide open) and step out; people going home press the button, wait, step in, turn round to face
   the doors, and ride down once they close. */
const LIFT_HOME = 12;
export const LIFT_X = -7.5, LIFT_FRONT = -6.95;
export let lift;
// someone appears in the car: unless the doors are already open, it rides up from a lower floor first
export function liftArrive(w) {
  if (!lift) return;
  w.pos.set(LIFT_X, DZ + rand(-0.3, 0.3)); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
  w.liftHold = true;
  if (lift.open < 0.05 && lift.at === LIFT_HOME && lift.goal === LIFT_HOME) lift.at = LIFT_HOME - randInt(3, 9);
}
export function liftCall(hold = 2.5) { if (lift) lift.callUntil = state.sim + hold; }
function drawLiftDisplay(text) {
  const c = lift.disp.image, g = c.getContext('2d');
  g.fillStyle = '#0B0D10'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#FFB23F'; g.font = '700 50px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  lift.disp.needsUpdate = true;
}
export function updateLift(dt) {
  if (!lift) return;
  let holding = 0, waiting = 0, through = false; const riding = [];
  for (const set of [workers.values(), subs.values(), leaving, npcs]) for (const w of set) {
    if (w.liftHold) holding++;
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
    if (w.liftHold) w.liftHold = false;
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
    return { g, doors, disp, dispM, btn, carLight, open: 0, at: LIFT_HOME, goal: LIFT_HOME, stepAt: 0, holdUntil: 0, callUntil: 0, shown: '' };
  })() : null;
}
