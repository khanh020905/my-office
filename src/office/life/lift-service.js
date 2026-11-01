// The lift being serviced, right after the office's server starts (server/lift-service.mjs says for how long: three
// minutes, five on a new build). The doors held half open behind a yellow-and-black barrier whose sign says "ĐANG BẢO TRÌ
// — Xin lỗi quý khách vì sự bất tiện", two cones, the call panel's cover off with its wires out, the car's light
// flickering; the building's technician in blue at the panel, by his open toolbox, now screwing, now reading his
// multimeter, now rummaging for a part. Meanwhile everyone takes the stairs beside it (world/entrance.js: slower down,
// out of breath up) and the group chat grumbles. Twenty seconds before the end he packs up, takes the barrier away and
// rides the lift down to test it; after a new build he first puts the inspection sticker in the car ("Đã kiểm định",
// the version and the date), which stays there while that build runs. Nothing waits for any of it. Company floor only.
// ?liftservice (=new): one now, for a look; ?debug: __office.liftService.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex } from '../scene/blocks.js';
import { boxAt, colorize, mergeAll, vmat } from '../world/terrace.js';
import { DZ, LIFT_FRONT, lift, liftCall, liftDown, liftIdle, onStairs, stairHooks } from '../world/entrance.js';
import { staffKit } from '../people/staff.js';
import { sfx } from '../audio/sfx.js';
import { chatLife } from '../ui/group-chat.js';
import { locale, t as tr } from '../../i18n/index.js';

const WRAP_MS = 22e3;   // (the end: packing up, the sticker, the ride down)
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
let S = null;           // the servicing: { until (performance.now() ms), newBuild, sticker, phase: 'wait' | 'work' | 'wrap' | 'done' }
let kit = null, tech = null, stickerInfo = null;
const CAR = new THREE.Color(1.6, 1.45, 1.2);
const now = () => performance.now();

/* ---------- the props: barrier and sign, cones, the call panel opened up, the toolbox; the sticker in the car ---------- */
function signTex() {
  return canvasTex(1024, 384, (g, W, H) => {
    g.fillStyle = '#FFD21F'; g.fillRect(0, 0, W, H);
    // black-and-yellow stripes along the top and the bottom, as on a barrier
    for (const y of [0, H - 46]) { g.save(); g.beginPath(); g.rect(0, y, W, 46); g.clip(); g.fillStyle = '#1C1C1C'; for (let x = -60; x < W + 60; x += 64) { g.beginPath(); g.moveTo(x, y + 46); g.lineTo(x + 32, y + 46); g.lineTo(x + 78, y); g.lineTo(x + 46, y); g.closePath(); g.fill(); } g.restore(); }
    // a warning triangle with a man at work in it
    const tx = 150, ty = H / 2 + 6, s = 112;
    g.fillStyle = '#1C1C1C'; g.beginPath(); g.moveTo(tx, ty - s); g.lineTo(tx + s * 1.05, ty + s * 0.75); g.lineTo(tx - s * 1.05, ty + s * 0.75); g.closePath(); g.fill();
    g.fillStyle = '#FFD21F'; g.beginPath(); g.moveTo(tx, ty - s + 26); g.lineTo(tx + s * 0.86, ty + s * 0.62); g.lineTo(tx - s * 0.86, ty + s * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#1C1C1C'; g.beginPath(); g.arc(tx - 6, ty - 22, 11, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.lineCap = 'round'; g.strokeStyle = '#1C1C1C';
    for (const [a, b] of [[[-8, -8], [-14, 30]], [[-14, 30], [-34, 62]], [[-14, 30], [8, 60]], [[-10, 0], [22, 8]], [[22, 8], [44, -12]]]) { g.beginPath(); g.moveTo(tx + a[0], ty + a[1]); g.lineTo(tx + b[0], ty + b[1]); g.stroke(); }
    g.fillStyle = '#1C1C1C'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 92px ${FONT}`; g.fillText(tr('life.liftService.sign'), 620, 150, 690);
    g.font = `700 40px ${FONT}`; g.fillText(tr('life.liftService.sorry'), 620, 252, 690);
  });
}
function stickerTex(info) {
  return canvasTex(256, 320, (g, W, H) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1F4E9E'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#1F4E9E'; g.fillRect(5, 5, W - 10, 66);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 30px ${FONT}`; g.fillText(tr('life.liftService.stickerHead'), W / 2, 40, W - 30);
    // the seal: a red disc in a red ring, a white tick
    g.strokeStyle = '#C8102E'; g.lineWidth = 4; g.beginPath(); g.arc(W / 2, 128, 44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#C8102E'; g.beginPath(); g.arc(W / 2, 128, 36, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(W / 2 - 17, 129); g.lineTo(W / 2 - 4, 143); g.lineTo(W / 2 + 18, 113); g.stroke();
    g.fillStyle = '#1C1F24'; g.font = `800 24px ${FONT}`; g.fillText(tr('life.liftService.stickerWhat', { version: info.version || '' }), W / 2, 196, W - 26);
    g.font = `600 21px ${FONT}`;
    g.fillText(tr('life.liftService.stickerDate', { date: new Date(info.at).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) }), W / 2, 236, W - 26);
    g.fillStyle = '#5E6670'; g.fillText(tr('life.liftService.stickerNo', { no: info.build || '—' }), W / 2, 276, W - 26);
  });
}
// in front of the lift: the barrier across its doors, the cones, the toolbox by the call panel, the panel's cover off
function buildKit() {
  const g = new THREE.Group(); g.visible = false; g.userData.dynamic = true; scene.add(g);
  const bx = LIFT_FRONT + 0.25, za = DZ - 0.62, zb = DZ + 0.35, parts = [];   // (across the doors; the call panel's side left to him)
  for (const z of [za, zb]) {   // the posts: yellow and black, on round feet
    parts.push(colorize(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 14).translate(bx, 0.02, z), '#2B2B2B'));
    for (let k = 0; k < 5; k++) parts.push(colorize(new THREE.CylinderGeometry(0.03, 0.03, 0.19, 8).translate(bx, 0.135 + k * 0.19, z), k % 2 ? '#1C1C1C' : '#FFD21F'));
  }
  parts.push(boxAt(0.04, 0.05, zb - za, bx, 1.0, (za + zb) / 2, '#FFD21F'), boxAt(0.04, 0.05, zb - za, bx, 0.38, (za + zb) / 2, '#1C1C1C'));
  for (const [x, z] of [[bx + 0.08, za - 0.26], [bx + 0.36, za - 0.08]]) {   // two traffic cones, orange with a white band
    parts.push(boxAt(0.32, 0.03, 0.32, x, 0.015, z, '#E8571E'), colorize(new THREE.ConeGeometry(0.12, 0.5, 14).translate(x, 0.28, z), '#F05A1A'));
    parts.push(colorize(new THREE.CylinderGeometry(0.078, 0.092, 0.07, 14).translate(x, 0.27, z), '#F4F4F2'));
  }
  // the call panel: its cover off, leaning on the wall below, the wires out of the hole
  const pz = DZ + 0.76;
  parts.push(boxAt(0.012, 0.22, 0.1, LIFT_FRONT + 0.012, 1.12, pz, '#15181E'));
  for (const [c, dy, dz] of [['#D62F2F', 0.04, -0.02], ['#2E6FD1', -0.01, 0.015], ['#F2C200', -0.05, -0.005]]) parts.push(boxAt(0.12, 0.012, 0.012, LIFT_FRONT + 0.07, 1.12 + dy, pz + dz, c));
  parts.push(boxAt(0.02, 0.28, 0.13, LIFT_FRONT + 0.06, 0.14, pz + 0.05, '#BCC4CC'));
  const body = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.55 })); body.castShadow = true; g.add(body);
  // the sign on the barrier, both faces (toward the lobby, and toward the doors for whoever is behind it)
  const signM = new THREE.MeshBasicMaterial({ map: signTex(), toneMapped: false, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(zb - za - 0.08, (zb - za - 0.08) * 0.375), signM);
  sign.position.set(bx + 0.025, 0.69, (za + zb) / 2); sign.rotation.y = Math.PI / 2; g.add(sign);
  // the toolbox: red, open, two trays out; and the multimeter (held in his hand: a yellow case, the screen, two leads)
  const box = new THREE.Mesh(mergeAll([boxAt(0.44, 0.2, 0.22, 0, 0.1, 0, '#C42B22'), boxAt(0.42, 0.04, 0.2, 0, 0.24, -0.1, '#A8241D'), boxAt(0.4, 0.05, 0.16, 0, 0.22, 0.12, '#B9C0C8'), boxAt(0.32, 0.02, 0.03, 0, 0.27, 0, '#2B2F36'),
    boxAt(0.05, 0.03, 0.12, -0.12, 0.25, 0.13, '#F2C200'), boxAt(0.14, 0.02, 0.02, 0.08, 0.255, 0.12, '#D62F2F')]), vmat({ roughness: 0.4, metalness: 0.25 }));
  box.castShadow = true; g.add(box);
  const meter = new THREE.Mesh(mergeAll([boxAt(0.075, 0.14, 0.03, 0, 0.05, 0, '#F2C200'), boxAt(0.055, 0.04, 0.005, 0, 0.085, 0.017, '#9DB7A0'), colorize(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10).rotateX(Math.PI / 2).translate(0, 0.035, 0.018), '#1C1C1C'),
    boxAt(0.006, 0.006, 0.2, -0.02, -0.02, 0.08, '#D62F2F'), boxAt(0.006, 0.006, 0.2, 0.02, -0.02, 0.08, '#1C1C1C')]), vmat({ roughness: 0.5 }));
  const stickerM = new THREE.MeshBasicMaterial({ transparent: false });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.175), stickerM); sticker.visible = false; sticker.userData.dynamic = true;
  sticker.position.set(-7.948, 1.5, DZ - 0.42); sticker.rotation.y = Math.PI / 2; scene.add(sticker);   // (on the car's back wall, seen from the lobby when the doors open)
  kit = { g, box, meter, sticker, stickerM, boxAt: new THREE.Vector3(LIFT_FRONT + 0.17, 0, DZ + 0.58) };   // (against the lift, out of the way to the stairs)
  restBox();
}
function restBox() { const b = kit.box; if (b.parent !== kit.g) kit.g.add(b); b.position.copy(kit.boxAt); b.rotation.set(0, Math.PI / 2, 0); b.scale.setScalar(1); }
function showSticker(info) {
  if (!PRO || !lift || !info) return;
  if (!kit) buildKit();
  stickerInfo = info;
  kit.stickerM.map?.dispose(); kit.stickerM.map = stickerTex(info); kit.stickerM.needsUpdate = true;
  kit.sticker.visible = lift.open > 0.02;
}

/* ---------- the technician: a Staff (people/staff.js), made the first time he is needed ---------- */
let WORK, CAR_PANEL;   // at the call panel; in the car, by its back wall (setup: the lift is placed by then)
const DOING = [['board', null, 6], ['idle', 'meter', 4.5], ['board', null, 5], ['tidy', null, 3.2]];   // screwing, reading the meter, rummaging in the box
function makeTech() {
  const { Staff } = staffKit();
  tech = new (class extends Staff { step() {} })({ name: tr('life.liftService.tech'), shirt: '#1F5FA8', hair: '#1E1A18', style: 'plain', acc: 'cap', outfit: 'shirt', pants: '#1E3A66', shoes: '#1B1B1E' }, '__liftTech');
}
// the meter in his right hand (as the takeaways are: chibi-rig P.held), the toolbox in his left
function gear() {
  if (tech.P.held.meter !== kit.meter) { tech.P.armR.hand.add(kit.meter); kit.meter.position.set(0, -0.02, 0.05); tech.P.held.meter = kit.meter; }
}
let doing = 0, nextAt = 0;
function atWork() {
  tech.offstage = false; tech.hush(); tech.path = []; tech.phase = 'idle';
  tech.pos.set(WORK.x, WORK.z); tech.spot = WORK; tech.face = tech.faceTarget = WORK.face; tech.pose = 'stand';
  gear(); doing = 0; nextAt = 0;
}
function stepWork(t) {
  if (t < nextAt || tech.phase === 'walk') return;
  const [anim, carry, secs] = DOING[doing++ % DOING.length];
  tech.anim = anim; tech.carry = carry;
  tech.faceTarget = anim === 'tidy' ? Math.atan2(kit.boxAt.x - tech.pos.x, kit.boxAt.z - tech.pos.y) : WORK.face;   // (to the box, or the panel)
  nextAt = t + secs * rand(0.85, 1.2);
}
const later = (s, fn) => { tech.afterAt = state.sim + s; tech.after = fn; };
// the end: the toolbox shut and taken, the barrier away, (a new build) the sticker in the car, then down in the lift
function wrap() {
  S.phase = 'wrap'; tech.carry = null; tech.anim = 'tidy'; tech.faceTarget = Math.atan2(kit.boxAt.x - tech.pos.x, kit.boxAt.z - tech.pos.y);
  later(1.6, () => {
    tech.P.armL.hand.add(kit.box); kit.box.position.set(0, -0.2, 0.02); kit.box.rotation.set(0, Math.PI / 2, 0); kit.box.scale.setScalar(0.72); sfx.play('click');
    tech.goTo({ x: LIFT_FRONT + 0.75, z: DZ, face: -Math.PI / 2, node: 'I' }, () => {
      tech.anim = 'tidy';
      later(1.4, () => {
        kit.g.visible = false; flicker(false);
        tech.anim = 'idle';
        if (S.newBuild && S.sticker) {   // into the car, the doors right open, and the sticker on its wall
          lift.service.open = 1;
          later(1.2, () => tech.goTo(CAR_PANEL, () => {
            tech.faceTarget = -Math.PI / 2; tech.anim = 'board';
            later(1.8, () => {
              showSticker(S.sticker); sfx.play('pop'); chatLife('liftDone', { every: 10 * 60e3 });
              tech.anim = 'idle'; tech.faceTarget = Math.PI / 2;
              later(0.8, () => { lift.service = null; tech.liftRide = gone; done(); });
            });
          }));
        } else { lift.service = null; liftDown(tech, gone); done(); }
      });
    });
  });
}
function gone() { tech.offstage = true; tech.carry = null; tech.spot = null; tech.anim = 'idle'; restBox(); }
// the lift back in use (and if the server started again meanwhile, the next servicing, once he is down)
function done() { S.phase = 'done'; const next = S.next; if (next) { S = null; setLiftService({ ...next, left: next.left - WRAP_MS }); } }

/* ---------- the car's light: off for a blink now and then, as a loose tube does ---------- */
let flickAt = 0, flickOff = false;
function flicker(on, t = 0) {
  if (!on) { flickOff = false; lift.carLight.color.copy(CAR); return; }
  if (t < flickAt) return;
  flickOff = !flickOff && Math.random() < 0.8;
  flickAt = t + (flickOff ? rand(0.05, 0.22) : rand(0.3, 2.8));
  lift.carLight.color.copy(CAR).multiplyScalar(flickOff ? 0.12 : 1);
}

/* ---------- start, run and end ---------- */
/** From the live snapshot (net: demo.js applyMsg) or ?liftservice: { left (ms), total, newBuild, sticker }. */
export function setLiftService(info) {
  if (!info) return;
  if (info.left > 0) {
    if (S?.phase === 'wrap') { S.next = info; return; }   // (the server started again while he packs up: once he is down)
    if (S && S.phase !== 'done') { S.until = now() + info.left; return; }   // (the same one, seen again after a reconnect)
    S = { until: now() + info.left, newBuild: !!info.newBuild, sticker: info.sticker || null, phase: 'wait' };
    if (stickerInfo && info.sticker?.build !== stickerInfo.build && kit) { stickerInfo = null; kit.sticker.visible = false; }   // (another build's)
  } else if (!S || S.phase === 'wait') { S = null; if (info.sticker) showSticker(info.sticker); }
}
function begin() {
  if (!kit) buildKit();
  if (!tech) makeTech();
  S.phase = 'work'; kit.g.visible = true; restBox();
  lift.service = { open: 0.42 };
  atWork();
}
// everyone who takes the stairs while the lift is out: the first one says so in the group chat; he asks them to
let toldAt = -1e9;
function stairsUsed(w) {
  if (!S || S.phase === 'done') return;
  chatLife('stairs', { id: w.id, every: 8 * 60e3 });
  if (tech && !tech.offstage && state.sim - toldAt > 25) { toldAt = state.sim; const text = tr('life.liftService.techSay'); tech.say('idle', text); setTimeout(() => { if (tech.lastSay?.text === text) tech.hush(); }, 3500); }
}
export function updateLiftService() {
  if (!lift) return;
  if (kit && stickerInfo) { const v = lift.open > 0.02; if (kit.sticker.visible !== v) kit.sticker.visible = v; }   // (inside the car: drawn only while its doors are open)
  if (tech && !tech.offstage) { const show = tech.phase === 'walk' || state.hovered === tech; if (tech.tagObj.visible !== show) tech.tagObj.visible = show; }
  if (!S) return;
  const t = state.sim;
  if (S.phase === 'wait') { if (now() >= S.until) { if (S.sticker) showSticker(S.sticker); S = null; return; } if (liftIdle()) begin(); return; }
  if (S.phase === 'work') {
    flicker(true, t); stepWork(t);
    if (now() >= S.until - WRAP_MS) wrap();
  }
}

/* ---------- for tests and screenshots (?debug), and ?liftservice for a look ---------- */
const debug = {
  start: (secs = 180, newBuild = false, version = '0.2.0') => { if (S && S.phase !== 'done') S = null; const at = Date.now() + secs * 1000; setLiftService({ left: secs * 1000, total: secs * 1000, newBuild, sticker: newBuild ? { version, at, build: 'debug01' } : null }); return true; },
  finish: () => { if (S?.phase === 'work') { S.until = now() + WRAP_MS; return true; } return false; },
  extend: (secs = 300) => { if (S?.phase === 'work' || S?.phase === 'wait') { S.until = Math.max(S.until, now() + secs * 1000); return true; } return false; },
  stairs: () => onStairs(),
  call: (secs = 8) => { liftCall(secs); return true; },   // (the lift to this floor, its doors open a while: a look at the sticker)
  state: () => ({ phase: S?.phase || null, left: S ? Math.max(0, Math.round(S.until - now())) : 0, service: !!lift?.service, tech: tech ? { offstage: tech.offstage, anim: tech.anim, carry: tech.carry, x: tech.pos.x, z: tech.pos.y } : null, sticker: !!kit?.sticker.visible, barrier: !!kit?.g.visible }),
};
export function setup() {
  if (!PRO) return;
  WORK = { x: LIFT_FRONT + 0.15, z: DZ + 0.9, face: Math.atan2(-0.15, -0.14), node: 'I' };   // (beside the barrier, facing the panel)
  CAR_PANEL = { x: -7.55, z: DZ - 0.42, face: -Math.PI / 2, node: 'O' };
  stairHooks.used = stairsUsed;
  const q = new URLSearchParams(location.search);
  if (q.has('liftservice')) debug.start(q.get('liftservice') === 'new' ? 300 : 180, q.get('liftservice') === 'new');
  if (q.has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.liftService = debug; }, 0);
}
