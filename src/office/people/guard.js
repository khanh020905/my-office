// The building's security guard (bảo vệ) at the office's street door, with the city outside.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from '../core/state.js';
import { el, officeNow, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { quality } from '../scene/quality.js';
import { canvasTex } from '../scene/blocks.js';
import { boxAt, mergeAll, vmat } from '../world/terrace.js';
import { folk, seen } from '../world/backdrops/street-folk.js';
import { THEME, THEMES } from '../world/backdrops/index.js';
import { DZ, LIFT_X, lift } from '../world/entrance.js';
import { DOOR_OUT } from './navigation.js';
import { workers } from './workers.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* A guard booth (chòi bảo vệ) on the pavement a couple of steps from the office's door, on the side away from the row of
   the staff's scooters (people/outings.js keeps that spot clear: guardPost): a box with a window, a ledge with the
   visitors' book and the ticket book, a plastic chair outside. A day guard in a light-blue uniform 6:30–22:00, then a
   night guard in navy. Whoever parks a scooter in the row gets a parking ticket (vé xe), and hands it back riding off.
   At 22:00 he pulls the folding gate (cửa xếp) most of the way across the door (a gap left for anyone still upstairs,
   with a word for them on the way out) and opens it again at 6:30; every half hour of the night he walks the pavement
   with a torch. One street-folk.js figure, the booth and the gate a mesh each, stepped only when in view. */
const DAY = [390, 1320], GATE = 0.74;   // 6:30–22:00; how far across the door the gate goes at night (a gap left)
const street = () => (THEMES && THEME === THEMES.city && THEME.live?.street) || null;
const indoors = () => (lift ? { x: LIFT_X, z: DZ } : { x: DOOR_OUT.x, z: DOOR_OUT.z });
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const nightAt = (m) => m >= DAY[1] || m < DAY[0];

/* where the booth stands along the door's side of the block (outings.js leaves no scooter there): two steps from the
   door, on the side with room for it */
export function guardPost(ex) {
  const k = ex.L.axis === 'x' ? 0 : 1, lo = Math.min(ex.a[k], ex.b[k]), hi = Math.max(ex.a[k], ex.b[k]);
  if (ex.s - lo >= 2.6) return ex.s - 1.9;
  if (hi - ex.s >= 2.6) return ex.s + 1.9;
  return ex.s - Math.max(0.9, Math.min(1.9, ex.s - lo - 0.5));
}

let G = null, built = null, crowd = null, me = -1, gate = null, gateK = 0, torch = null, say = null;
let post = null;   // { ex, P (the booth's frame), chair, sit, door, gateEnd() }
let task = null, dressed = '', checkAt = 0, vis = false, seenTrips = new Set(), roundDone = '', m = 0, today = '';
const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), SC = new THREE.Vector3();
const A = new THREE.Vector3(), B = new THREE.Vector3();   // (scratch, so nothing is made frame by frame)

// the booth's frame: x along the street (away from the door), z out to the street, y up from the pavement
function frameAt(S, ex, s, side) {
  const p0 = S.at(ex.L, s, side), p1 = S.at(ex.L, s, side - 1), n = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
  const u = new THREE.Vector3().crossVectors(UP, n);
  return new THREE.Matrix4().makeBasis(u, UP, n).setPosition(p0.x, S.pavement, p0.z);
}
const at = (F, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(F);
function build(S) {
  const from = indoors(), ex = S.exits(from.x, from.z).find((e) => e.L);
  if (!ex) return false;
  G = new THREE.Group(); G.userData.dynamic = true; scene.add(G);
  const s = guardPost(ex), F = frameAt(S, ex, s, S.pavementSide + 1.1);
  // which way along the booth's x the door is
  const dW = at(F, 1, 0, 0), doorW = S.at(ex.L, ex.s, S.pavementSide + 1.1), side = ((doorW.x - F.elements[12]) * (dW.x - F.elements[12]) + (doorW.z - F.elements[14]) * (dW.z - F.elements[14])) > 0 ? 1 : -1;
  // the booth: a plinth, walls (a window all round above the waist), a roof with an overhang, a ledge outside the window
  // with the book and the ticket book, a sign; the plastic chair on the door's side
  const parts = [], cream = '#ECE6D8', blue = '#2E5A8E', frame = '#5E6670';
  const add = (g) => parts.push(g.applyMatrix4(F));
  add(boxAt(1.0, 0.06, 0.9, 0, 0.03, 0, '#9AA1A9'));
  add(boxAt(1.0, 1.0, 0.06, 0, 0.5, 0.42, cream)); add(boxAt(1.0, 2.2, 0.06, 0, 1.1, -0.42, cream));
  for (const sx of [-1, 1]) { add(boxAt(0.06, 1.0, 0.9, sx * 0.47, 0.5, 0, cream)); add(boxAt(0.06, 0.2, 0.9, sx * 0.47, 2.1, 0, cream)); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(boxAt(0.06, 1.2, 0.06, sx * 0.47, 1.6, sz * 0.42, frame));
  add(boxAt(1.0, 0.18, 0.06, 0, 2.11, 0.42, blue));
  add(boxAt(1.25, 0.08, 1.15, 0, 2.26, 0.04, blue));
  add(boxAt(0.9, 0.04, 0.26, 0, 1.02, 0.56, '#F2F2F0'));
  add(boxAt(0.22, 0.02, 0.3, -0.18, 1.05, 0.56, '#FBFBF7')); add(boxAt(0.12, 0.035, 0.17, 0.2, 1.06, 0.56, '#E8742A'));
  add(boxAt(0.5, 0.75, 0.3, 0, 0.375, -0.2, '#C9B79C'));   // (the desk inside, seen through the window)
  // the plastic chair: a red seat on four legs, a back
  const cx = side * 0.95, cz = 0.32;
  add(boxAt(0.4, 0.04, 0.4, cx, 0.45, cz, '#C8261B'));
  for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) add(boxAt(0.035, 0.45, 0.035, cx + lx, 0.225, cz + lz, '#B11F16'));
  add(boxAt(0.4, 0.42, 0.04, cx, 0.68, cz - 0.19, '#C8261B'));
  // the folding gate's two posts at the door (the building's front, either side of the way out)
  const gF = frameAt(S, ex, ex.s, S.pavementSide + 1.55), gu = at(gF, 1, 0, 0).sub(at(gF, 0, 0, 0)), dirToBooth = ((F.elements[12] - gF.elements[12]) * gu.x + (F.elements[14] - gF.elements[14]) * gu.z) > 0 ? 1 : -1;
  for (const x of [-1.25, 1.25]) parts.push(boxAt(0.08, 2.2, 0.1, x, 1.1, 0, '#3A3F47').applyMatrix4(gF));
  built = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.75 })); built.castShadow = true; built.receiveShadow = true; G.add(built);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), new THREE.MeshBasicMaterial({ map: canvasTex(256, 48, (c, w, h) => {
    c.fillStyle = '#2E5A8E'; c.fillRect(0, 0, w, h); c.fillStyle = '#FFFFFF'; c.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tr('people.guard.sign'), w / 2, h / 2 + 2);
  }) }));
  sign.matrixAutoUpdate = false; sign.matrix.copy(F).multiply(new THREE.Matrix4().makeTranslation(0, 2.11, 0.456)); G.add(sign);
  // the gate: a lattice of steel straps drawn out from the post on the booth's side across the door (scaled along x)
  const bars = [];
  for (let k = 0; k <= 10; k++) bars.push(boxAt(0.03, 2.05, 0.03, k / 10, 1.06, 0, '#4A515B'));
  for (let k = 0; k < 10; k++) for (const s2 of [-1, 1]) for (let r = 0; r < 4; r++) {
    const y0 = 0.12 + r * 0.48, len = Math.hypot(0.1, 0.48);
    bars.push(boxAt(0.012, len, 0.015, 0, 0, 0, '#5E6670').rotateZ(s2 * Math.atan2(0.1, 0.48)).translate(k / 10 + 0.05, y0 + 0.24, 0));
  }
  bars.push(boxAt(1, 0.05, 0.04, 0.5, 2.08, 0, '#3A3F47'), boxAt(1, 0.04, 0.04, 0.5, 0.06, 0, '#3A3F47'));
  gate = new THREE.Mesh(mergeAll(bars), vmat({ roughness: 0.5, metalness: 0.4 })); gate.matrixAutoUpdate = false; gate.visible = false; G.add(gate);
  const g0 = at(gF, dirToBooth * 1.25, 0, 0);   // (from the post on the booth's side, toward the other)
  // the night round: along this side of the block toward the end with more room, stopping short of the corner
  const k = ex.L.axis === 'x' ? 0 : 1, lo = Math.min(ex.a[k], ex.b[k]), hi = Math.max(ex.a[k], ex.b[k]), rdir = hi - s > s - lo ? 1 : -1;
  const rlen = Math.max(2, Math.min(9, (rdir > 0 ? hi - s : s - lo) - 1.0)), rside = S.pavementSide + 0.35;
  const walkAt = (d, out) => { const q = S.at(ex.L, s + rdir * d, rside); return out.set(q.x, S.pavement, q.z); };
  gateK = 0; post = { ex, F, gF, g0, dirToBooth, gu, chair: at(F, cx, 0, cz), side, look: at(F, 0, 0, 3), stand: at(F, cx, 0, 0.75), walkAt, rlen };
  // the guard: one figure; a torch's beam for the night round; a bubble for what he says
  crowd = folk(G, 1, { low: quality.level === 'low', shadows: false }); me = crowd.take(1)[0];
  torch = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 16, 1, true).translate(0, -0.9, 0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  torch.visible = false; G.add(torch);
  m = minutes(); today = officeNow().toDateString(); gateK = nightAt(m) ? GATE : 0; placeGate(gateK);   // (as the hour has it, from the start)
  return true;
}
// the gate drawn out to fraction k of the way across (0: folded against its post)
function placeGate(k) {
  const p = post, w = 2.5 * k;
  gate.visible = k > 0.02;
  if (!gate.visible) return;
  const yaw = Math.atan2(-p.gu.z * -p.dirToBooth, p.gu.x * -p.dirToBooth);
  M.compose(V.set(p.g0.x, p.g0.y, p.g0.z), Q.setFromAxisAngle(UP, yaw), SC.set(Math.max(0.05, w), 1, 1)); gate.matrix.copy(M); gate.matrixWorldNeedsUpdate = true;
}
const gateEnd = (k, out, past = 0) => { const p = post, d = 2.5 * k + past; return out.set(p.g0.x - p.gu.x * p.dirToBooth * d, p.g0.y, p.g0.z - p.gu.z * p.dirToBooth * d); };
function speak(text) {
  if (!say) { const d = el('div', 'tag shop-say'); d.style.borderColor = '#6FA8D6'; say = new CSS2DObject(d); say.visible = false; G.add(say); }
  say.element.textContent = text; say.visible = true; say.until = state.sim + 3.2;
}
const yawTo = (a, b) => Math.atan2(-(b.z - a.z), b.x - a.x);   // (a street-folk figure faces its +x)

/* ---------- what he does ---------- */
function shift(m) {
  const night = nightAt(m), want = night ? 'night' : 'day';
  if (dressed !== want) { dressed = want; crowd.dress(me, night ? { shirt: '#2E3E5C', pants: '#1F2633', hair: '#2B2420' } : { shirt: '#8FB8DE', pants: '#2B3A55', hair: '#3A332E' }); }
  return night;
}
// whoever from the office is getting off their scooter (a ticket) or walking to it to ride home (the ticket back)
function trips() {
  for (const w of workers.values()) {
    const T = w.outing; if (!T || T.way !== 'bike' || (T.kind !== 'come' && T.kind !== 'home')) continue;
    const key = `${w.id}:${T.kind}:${T.since}`;
    if (seenTrips.has(key) || !((T.kind === 'come' && T.stage === 'walk') || (T.kind === 'home' && T.stage === 'street'))) continue;
    seenTrips.add(key);
    if (task) continue;
    const night = nightAt(m);
    task = { kind: 'ticket', w, until: state.sim + (reduceMotion ? 1 : 2.2), back: T.kind === 'home' };
    if (vis) { speak(tr(night && T.kind === 'home' ? 'people.guard.late' : T.kind === 'home' ? 'people.guard.back' : 'people.guard.ticket')); sfx.play('click'); }
  }
  if (seenTrips.size > 60) seenTrips = new Set([...seenTrips].slice(-20));
}
function pose(t, f) { crowd.pose(me, { hat: true, ...f }); }
function step(dt, t, m) {
  const p = post, night = shift(m), walkLegs = (k) => [Math.sin(t * 7) * 0.5 * k, -Math.sin(t * 7) * 0.5 * k];
  // 22:00 the gate drawn across, 6:30 folded back: he walks it along from its end
  const want = night ? GATE : 0;
  if (Math.abs(gateK - want) > 0.004 && (!task || task.kind === 'gate')) {
    if (!task) { task = { kind: 'gate' }; if (vis) speak(tr(want ? 'people.guard.gate' : 'people.guard.open')); }
    gateK = THREE.MathUtils.clamp(gateK + Math.sign(want - gateK) * Math.min(Math.abs(want - gateK), dt * 0.2), 0, GATE);
    placeGate(gateK);
    const e = gateEnd(gateK, A), out = gateEnd(gateK, B, 0.32);
    pose(t, { x: out.x, y: e.y, z: out.z, yaw: yawTo(out, e), arms: [[1.2, -0.1], [1.25, -0.1]], legs: walkLegs(0.4) });
    if (Math.abs(gateK - want) < 0.004) { gateK = want; placeGate(gateK); task = null; }
    return;
  }
  // every half hour of the night: along the pavement and back with a torch
  if (night && !task && m % 30 >= 7 && m % 30 < 9 && roundDone !== `${today}:${Math.floor(m / 30)}`) { roundDone = `${today}:${Math.floor(m / 30)}`; task = { kind: 'round', t0: t }; if (vis) speak(tr('people.guard.round')); }
  if (task?.kind === 'round') {
    const speed = 0.9, total = (p.rlen * 2) / speed, k = (t - task.t0) / total;
    if (k >= 1) { task = null; torch.visible = false; }
    else {
      const d = (k < 0.5 ? k * 2 : 2 - k * 2) * p.rlen, out = k < 0.5, pos = p.walkAt(d, A), ahead = p.walkAt(d + (out ? 1 : -1), B);
      pose(t, { x: pos.x, y: pos.y, z: pos.z, yaw: yawTo(pos, ahead), arms: [[Math.sin(t * 7) * 0.4, 0], [1.1, -0.15]], legs: walkLegs(1) });
      const hand = crowd.hand(me, V);
      torch.visible = true; torch.position.copy(hand); torch.lookAt(hand.x + (ahead.x - pos.x) * 2, hand.y - 1.1, hand.z + (ahead.z - pos.z) * 2);
      return;
    }
  }
  // a ticket: up, a step toward them, the hand out
  if (task?.kind === 'ticket') {
    if (state.sim > task.until) task = null;
    else {
      const w = task.w, wp = A.set(w.pos.x, p.stand.y, w.pos.y);
      pose(t, { x: p.stand.x, y: p.stand.y, z: p.stand.z, yaw: yawTo(p.stand, wp), arms: [[0.15, 0], [1.35, -0.2]] });
      return;
    }
  }
  // by day on the chair by the booth, watching the street (now and then up for a stretch); at night standing by it
  if (!night) {
    const stretch = (t % 47) < 3;
    if (stretch) pose(t, { x: p.stand.x, y: p.stand.y, z: p.stand.z, yaw: yawTo(p.stand, p.look), arms: [[2.6, 0.2], [2.6, 0.2]] });
    else pose(t, { x: p.chair.x, y: p.chair.y, z: p.chair.z, sit: p.chair.y + 0.47, yaw: yawTo(p.chair, p.look) + Math.sin(t * 0.2) * 0.4, arms: [[0.9, -0.3], [0.9, -0.3]] });
  } else pose(t, { x: p.stand.x, y: p.stand.y, z: p.stand.z, yaw: yawTo(p.stand, p.look) + Math.sin(t * 0.15) * 0.6, arms: [[0.2, 0], [0.2, 0]] });
  torch.visible = false;
}

// ?debug: __office.guard() says where the booth is, the shift, the gate
let hooked = false;
function hook() {
  const o = window.__office; if (hooked || !o) return;
  hooked = true; o.guard = (cmd) => { if (cmd === 'round' && post && !task) task = { kind: 'round', t0: state.sim }; return guardState(); };
}
export function updateGuard(dt) {
  if (!hooked) hook();
  const S = street();
  if (!S || replay.on) { if (G) G.visible = false; return; }
  if (!G && !build(S)) return;
  G.visible = true;
  const t = state.sim;
  if (t > checkAt) {
    checkAt = t + 0.3; m = minutes(); today = officeNow().toDateString();
    vis = seen(post.F.elements[12], post.F.elements[14]) || seen(post.g0.x, post.g0.z);
    trips();
  }
  if (say?.visible && t > say.until) say.visible = false;
  if (say?.visible) { const h = crowd.hand(me, V); say.position.set(h.x, post.F.elements[13] + 2.15, h.z); }
  // the gate keeps to the hours even out of view (no one there to see him pull it)
  if (!vis && (!task || task.kind === 'gate')) { const want = nightAt(m) ? GATE : 0; if (gateK !== want) { gateK = want; placeGate(gateK); task = null; } }
  if (!vis && task?.kind !== 'round') return;
  step(dt, t, m);
  crowd.flush();
}
// for ?debug and the tests
export const guardState = () => post && { night: nightAt(minutes()), gate: +gateK.toFixed(2), task: task?.kind || null, booth: [+post.F.elements[12].toFixed(1), +post.F.elements[14].toFixed(1)], said: say?.visible ? say.element.textContent : '' };
export function setup() {}
