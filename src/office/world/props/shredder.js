// Paper by context: an in-tray on every desk whose stack grows with its session's context window (loose sheets and a red
// flag past 85 %), and a paper shredder by the printer. When a session compacts, its person picks the stack up, carries
// it to the shredder and feeds it in; the desk starts again from the little the compacted context keeps.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from '../../core/state.js';
import { PRO, officeNow, reduceMotion, replay } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { mat, put, rbox } from '../../scene/blocks.js';
import { DESKS, dLocal } from '../desks.js';
import { sessions, workers } from '../../people/workers.js';
import { standBy } from '../../people/navigation.js';
import { sfx } from '../../audio/sfx.js';
import { t as tr } from '../../../i18n/index.js';

const REAMS = 7;   // reams in a full stack
// the tray, in a desk's frame (x, z, turn), where the camera sees it: on the company floor the corner on the sitter's side
// (seen over the pod's screen in the back row, straight on in the front row), the left one on the desks with a lamp in
// the right; in the small office, where everyone faces the room, the front left corner
const trayOf = (i) => (!PRO ? [-0.6, 0.2, -0.1] : i % 3 === 2 ? [-0.6, -0.21, -0.1] : [0.6, -0.21, 0.1]);
const FULL = 0.85;                            // past this much of the context: loose sheets, a red flag
const PAPER = ['#FBFBF7', '#F4F1E8', '#FBFBF7', '#E9D7A8', '#FBFBF7', '#CFE3F5', '#F4F1E8'];   // sheets, now and then a folder
const Z0 = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
let reams, sheets, flags, shown = [], checkAt = 0;
let SH = null;   // the shredder: { x, z, ry, front, g, fill, shreds, strips, feed, run, spot }
const held = new Map();   // person -> the stack in their hands

/* ---------- the stacks ---------- */
function stackLevel(d) {   // reams on desk d now (-1: nobody there)
  const s = [...sessions.values()].find((x) => x.desk === d), w = s && workers.get(s.id);
  if (!s || !w || w.away || w.leaving) return -1;
  if (w.shred) return 0;   // (in their hands, or in the shredder)
  const f = s.usage?.ctxMax ? Math.min(1, s.usage.ctx / s.usage.ctxMax) : 0;
  return f <= 0 ? 0 : Math.max(1, Math.round(f * REAMS)) + (f > FULL ? 10 : 0);   // (+10: nearly full)
}
function place(i) {
  const d = DESKS[i], v = shown[i], n = v % 10, full = v >= 10, seed = i * 7.31, TRAY = trayOf(i), sx = Math.sign(TRAY[0]);
  for (let k = 0; k < REAMS; k++) {
    if (v < 0 || k >= n) { reams.setMatrixAt(i * REAMS + k, Z0); continue; }
    const [x, z] = dLocal(d, TRAY[0] + Math.sin(seed + k * 2.1) * 0.008, TRAY[1] + Math.cos(seed + k * 1.7) * 0.008);
    P.set(x, 0.804 + k * 0.027, z); Q.setFromEuler(E.set(0, d.ry + TRAY[2] + Math.sin(seed + k * 3.3) * 0.07, 0)); reams.setMatrixAt(i * REAMS + k, M.compose(P, Q, S));
  }
  // nearly full: three sheets slid off round the tray, a red flag stuck in the top of the stack
  [[0.4, -0.05, 0.7], [0.62, 0.12, -0.5], [0.36, -0.28, 1.4]].forEach(([lx, lz, r], k) => {
    if (!full) { sheets.setMatrixAt(i * 3 + k, Z0); return; }
    const [x, z] = dLocal(d, sx * lx, lz); P.set(x, 0.779 + k * 0.002, z); Q.setFromEuler(E.set(0, d.ry + r, 0)); sheets.setMatrixAt(i * 3 + k, M.compose(P, Q, S));
  });
  if (!full) flags.setMatrixAt(i, Z0);
  else { const [x, z] = dLocal(d, TRAY[0] + sx * 0.07, TRAY[1] - 0.1); P.set(x, 0.804 + n * 0.027 + 0.03, z); Q.setFromEuler(E.set(0.15, d.ry + 0.3, 0)); flags.setMatrixAt(i, M.compose(P, Q, S)); }
}

/* ---------- the shredder ---------- */
// where it stands: by the printer, against a wall, its front to the room (x, z, the way it faces)
const SPOT = () => (PRO ? { x: -3.2, z: 1.45, ry: Math.PI / 2 } : { x: -2.3, z: 5.55, ry: Math.PI });
function buildShredder() {
  const at = SPOT(), g = new THREE.Group(); g.position.set(at.x, 0, at.z); g.rotation.y = at.ry; scene.add(g);
  const body = mat('#3A3F47', { roughness: 0.5 }), dark = mat('#23272E', { roughness: 0.45 });
  // a bin with a window in front, the cutting head on top with its slot and a light
  put(g, rbox(0.42, 0.02, 0.3, body, 0.006), 0, 0.01, 0);
  put(g, rbox(0.42, 0.56, 0.03, body, 0.01), 0, 0.29, -0.135);
  for (const sx of [-1, 1]) put(g, rbox(0.03, 0.56, 0.3, body, 0.01), sx * 0.195, 0.29, 0);
  put(g, rbox(0.42, 0.1, 0.03, body, 0.01), 0, 0.06, 0.135);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.44), new THREE.MeshStandardMaterial({ color: '#9FB3C4', transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }));
  win.position.set(0, 0.34, 0.148); win.userData.noMerge = true; g.add(win);
  put(g, rbox(0.46, 0.14, 0.34, dark, 0.03), 0, 0.64, 0);
  put(g, rbox(0.3, 0.012, 0.025, '#0E1014', 0.004), 0, 0.712, 0.02);
  const led = new THREE.MeshBasicMaterial({ color: '#3DDC84' });
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), led), 0.17, 0.712, 0.12);
  // inside: the shreds so far (a pile that grows each time, emptied overnight), the strips falling while it runs
  const shreds = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.24).translate(0, 0.5, 0), mat('#F1EEE6', { roughness: 0.95 }));
  shreds.position.set(0, 0.02, -0.005); shreds.scale.y = 0.001; shreds.userData.dynamic = true; g.add(shreds);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.09, 0.002), mat('#FBFBF7', { roughness: 0.9 }), 10);
  strips.userData.dynamic = true; strips.frustumCulled = false; strips.visible = false; g.add(strips);
  // the stack being fed in: it sinks into the slot
  const feed = new THREE.Mesh(stackGeo(3), mat('#FBFBF7', { roughness: 0.9 }));
  feed.userData.dynamic = true; feed.visible = false; g.add(feed);
  return { ...at, front: [Math.sin(at.ry), Math.cos(at.ry)], g, led, shreds, strips, feed, fill: 0, day: officeNow().toDateString(), run: 0, spot: undefined };
}
// a few reams squared into one stack (for the hands and the slot)
function stackGeo(n) {
  return mergeGeometries(Array.from({ length: n }, (_, k) => new THREE.BoxGeometry(0.2, 0.026, 0.27).rotateY(Math.sin(k * 2.3) * 0.05).translate(Math.sin(k) * 0.006, 0.013 + k * 0.027, 0)));
}
// where to stand to feed it (looked up the first time: the walking grid is built by then)
const feedSpot = () => (SH.spot === undefined ? (SH.spot = standBy(SH.x, SH.z, SH.front) || null) : SH.spot);

/* ---------- compaction: the trip to the shredder ----------
   incidents.js hands over a 'compact' event's action: if there is a shredder to walk to, the person stands up with the
   stack instead of stomping on the bin. Busy sessions make it quick. */
export function shredAction(w, a) {
  const d = sessions.get(w.id)?.desk ?? -1;
  if (!SH || w.sub || d < 0 || reduceMotion || replay.on || w.shred || !feedSpot()) return a;
  return { ...a, anim: 'tidy', dwell: 0.6, after: () => shredTrip(w) };
}
function shredTrip(w) {
  const busy = sessions.get(w.id)?.status === 'work', spot = feedSpot();
  w.shred = true; w.hurry = busy;
  hold(w);
  w.errand({ type: 'compact', spot, look: [SH.x, SH.z], anim: 'tidy', wait: busy ? 0.2 : 0.6, hold: busy ? 1.4 : 2.6, anim2: 'idle', linger: busy ? 0.2 : 0.7,
    line: tr('people.shred.go'),
    arrived: () => { drop(w); SH.run = busy ? 1.4 : 2.6; SH.runFor = SH.run; SH.feed.visible = true; sfx.play('print'); },
    at: () => { SH.fill = Math.min(1, SH.fill + 0.2); return tr('people.shred.done'); },
    done: () => { w.shred = false; w.hurry = false; const s = sessions.get(w.id); if (s?.status === 'work' && w.anim === 'tidy') w.anim = 'type'; } });
}
function hold(w) {
  if (held.has(w)) return;
  const m = new THREE.Mesh(stackGeo(4), mat('#FBFBF7', { roughness: 0.9 })); m.userData.noMerge = true;
  held.set(w, m); w.carry = 'box';
}
function drop(w) { const m = held.get(w); if (!m) return; m.removeFromParent(); m.geometry.dispose(); held.delete(w); if (w.carry === 'box') w.carry = null; }

/* ---------- each frame ---------- */
let hooked = false;
export function updateShredder(dt) {
  if (!reams) return;
  if (!hooked && window.__office) { hooked = true; Object.assign(window.__office, { compactNow, paperwork }); }   // (?debug: the test hooks)
  // the stacks follow their sessions' context (looked at once a second)
  if (state.sim > checkAt || state.sim < checkAt - 5) {
    checkAt = state.sim + 1;
    let dirty = false;
    for (let i = 0; i < DESKS.length; i++) { const v = stackLevel(i); if (v !== shown[i]) { shown[i] = v; place(i); dirty = true; } }
    if (dirty) for (const o of [reams, sheets, flags]) o.instanceMatrix.needsUpdate = true;
  }
  // a stack in someone's hands: on the chest, as a parcel is held (kept there through a change of look)
  for (const [w, m] of held) {
    if (!w.shred || w.leaving || !w.root.parent) { drop(w); continue; }
    if (w.carry !== 'box') w.carry = 'box';
    if (m.parent !== w.P.spine) { w.P.spine.add(m); m.position.set(0, w.P.D.shY - 0.42, 0.33); }
  }
  if (!SH) return;
  // emptied overnight (the cleaner takes the bag)
  const day = officeNow().toDateString(); if (day !== SH.day) { SH.day = day; SH.fill = 0; }
  SH.shreds.scale.y = Math.max(0.001, SH.fill * 0.42);
  if (SH.run > 0) {   // running: the stack sinks into the slot, strips fall into the bin, the light goes blue
    SH.run -= dt; const u = 1 - Math.max(0, SH.run) / SH.runFor;
    SH.feed.position.set(0, 0.72 - u * 0.12, 0.02); SH.feed.scale.set(1, Math.max(0.02, 1 - u), 1);
    SH.led.color.set(Math.sin(state.sim * 18) > 0 ? '#4FA3FF' : '#1E3A66');
    SH.strips.visible = true;
    for (let k = 0; k < 10; k++) {
      const v = (state.sim * 1.6 + k * 0.1) % 1, top = 0.56, bot = 0.03 + SH.fill * 0.42;
      P.set(-0.14 + k * 0.03, top - v * (top - bot), 0.02 + Math.sin(k * 3.1) * 0.06); Q.set(0, 0, 0, 1); SH.strips.setMatrixAt(k, M.compose(P, Q, S));
    }
    SH.strips.instanceMatrix.needsUpdate = true;
    if (SH.run <= 0) { SH.feed.visible = false; SH.strips.visible = false; SH.led.color.set('#3DDC84'); }
  }
}

/* for tests (?debug): a compaction for the i-th session at a desk, now; its context drops a few seconds later */
export function compactNow(i = 0) {
  const list = [...sessions.values()].filter((s) => s.desk >= 0 && workers.get(s.id) && !workers.get(s.id).away);
  const s = list[i % Math.max(1, list.length)]; if (!s || !window.__office) return null;
  if (s.usage) s.usage.ctx = Math.round(s.usage.ctxMax * 0.92);
  checkAt = 0;
  window.__office.emit({ k: 'ev', s: { ...s }, e: { id: Date.now(), ts: Date.now(), sess: s.id, name: s.name, type: 'compact', label: 'manual' } });
  setTimeout(() => { if (s.usage) s.usage.ctx = Math.round(s.usage.ctxMax * 0.16); checkAt = 0; }, 3500);
  return s.id;
}
export const paperwork = () => ({ levels: shown.slice(), shredder: SH && { x: SH.x, z: SH.z, fill: SH.fill, running: SH.run > 0 }, carrying: [...held.keys()].map((w) => w.id) });

export function setup() {
  // the trays (with the desks: static, merged) and the paper in them (instanced, moved about once a second)
  const trayM = mat('#5E6670', { roughness: 0.6 });
  DESKS.forEach((d, i) => {
    const TRAY = trayOf(i), t = new THREE.Group(); t.position.set(TRAY[0], 0, TRAY[1]); t.rotation.y = TRAY[2]; d.g.add(t);
    put(t, rbox(0.25, 0.012, 0.32, trayM, 0.004), 0, 0.784, 0);
    for (const sx of [-1, 1]) put(t, rbox(0.012, 0.03, 0.32, trayM, 0.004), sx * 0.125, 0.795, 0);
    put(t, rbox(0.25, 0.03, 0.012, trayM, 0.004), 0, 0.795, 0.155);
  });
  const n = DESKS.length;
  reams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.025, 0.27), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n * REAMS);
  for (let i = 0; i < n * REAMS; i++) { reams.setMatrixAt(i, Z0); reams.setColorAt(i, new THREE.Color(PAPER[(i + Math.floor(i / REAMS)) % PAPER.length])); }
  sheets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.002, 0.27), mat('#FBFBF7', { roughness: 0.9 }), n * 3);
  flags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.09, 0.004), new THREE.MeshBasicMaterial({ color: '#E63946' }), n);
  for (const o of [reams, sheets, flags]) { o.userData.dynamic = true; o.frustumCulled = false; o.receiveShadow = true; scene.add(o); }
  for (let i = 0; i < n * 3; i++) sheets.setMatrixAt(i, Z0);
  for (let i = 0; i < n; i++) flags.setMatrixAt(i, Z0);
  shown = DESKS.map(() => -1);
  SH = buildShredder();
}
