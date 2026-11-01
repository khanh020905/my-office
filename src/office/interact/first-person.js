// First person: walk the office as your own character, and (with the city outside) down the lift and out on the street:
// the pavements, the zebras (the traffic stops for you), the shops, the bánh mì cart.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeChibi, chibiPose, applyChibiPose } from '../people/chibi-rig.js';
import { state } from '../core/state.js';
import { $, HQ, PRO, V2, el, wrapAngle } from '../core/env.js';
import { camera, controls, fpCam, renderPass, renderer, resize, scene } from '../scene/renderer.js';
import { cat, petCat } from '../world/props/cat.js';
import { DOOR_IN, DOOR_OUT } from '../people/navigation.js';
import { DZ, LIFT_X, lift } from '../world/entrance.js';
import { THEME, THEMES } from '../world/backdrops/index.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { sessions, subs, workers } from '../people/workers.js';
import { floorBlocks } from '../life/seasons.js';
import { closeSession, openSession } from '../ui/session-drawer.js';
import { PROPS, activateProp, propHint } from './props.js';
import { t as tr } from '../../i18n/index.js';

export let fp;
let FPB;
const CELL = 0.1, SIT_H = 0.49;   // (the chair seat the rig sits on: on a stool its feet hang this far below the seat)
export function buildGrid() {
  const W = Math.ceil((FPB.x1 - FPB.x0) / CELL), H = Math.ceil((FPB.z1 - FPB.z0) / CELL);
  const grid = new Uint8Array(W * H), box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
    for (let q = o; q; q = q.parent) if (q.userData.worker || q.userData.dynamic || q.userData.noCollide || q === fp.avatar || !q.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (box.max.y < 0.15 || box.min.y > 1.4 || box.max.x - box.min.x > 25 || box.max.z - box.min.z > 25) return;
    const i0 = Math.max(0, Math.floor((box.min.x - FPB.x0) / CELL)), i1 = Math.min(W - 1, Math.floor((box.max.x - FPB.x0) / CELL));
    const j0 = Math.max(0, Math.floor((box.min.z - FPB.z0) / CELL)), j1 = Math.min(H - 1, Math.floor((box.max.z - FPB.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * W + i] = 1;
  });
  // things merged across the whole floor (the season's decorations) give their footprints instead of one huge box
  for (const [x, z, r] of floorBlocks) {
    for (let j = Math.floor((z - r - FPB.z0) / CELL); j <= Math.floor((z + r - FPB.z0) / CELL); j++) for (let i = Math.floor((x - r - FPB.x0) / CELL); i <= Math.floor((x + r - FPB.x0) / CELL); i++) if (i >= 0 && j >= 0 && i < W && j < H) grid[j * W + i] = 1;
  }
  return { W, H, grid };
}
function cellBlocked(x, z) {
  if (x < FPB.x0 || x >= FPB.x1 || z < FPB.z0 || z >= FPB.z1) return true;
  const g = fp.grid; return !!g.grid[Math.floor((z - FPB.z0) / CELL) * g.W + Math.floor((x - FPB.x0) / CELL)];
}
export function blocked(x, z, r = 0.2) {
  for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r], [r, 0], [-r, 0], [0, r], [0, -r]]) if (cellBlocked(x + dx, z + dz)) return true;
  return false;
}
export function makeAvatar() {
  // the name only seeds the face, and stays the same in every language so your character looks the same
  const { root, P } = makeChibi({ name: 'Bạn', look: state.LOOK, shirt: '#F2B33D', hair: '#2B2420', style: 'plain', outfit: 'hoodie', pants: '#33415C' });
  const tag = el('div', 'tag tag--me'); tag.append(el('i'), document.createTextNode(tr('fp.you'))); tag.firstChild.style.background = '#F2B33D';
  const t = new CSS2DObject(tag); t.position.set(0, 2.0, 0); root.add(t);
  fp.avatar = root; fp.P = P; fp.tag = t; scene.add(root); showAvatar();
}
// CSS2D labels ignore their parents' visibility, so the name tag is toggled with the body.
function showAvatar() { const v = fp.on && fp.third; if (fp.avatar) fp.avatar.visible = v; if (fp.tag) fp.tag.visible = v; }
/* ---------- out on the street ---------- */
const street = () => (THEMES && THEME === THEMES.city && THEME.live?.street) || null;
// the way out of the building, on the pavement: the side of the block nearest the lift (or the door)
const wayOut = (S) => { const x = lift ? LIFT_X : DOOR_OUT.x; return S.exits(x, DZ)[0] || null; };
let fade = null;
function through(fn) {   // a moment's black while the lift goes down (or up); longer by the stairs, while it is serviced
  const stairs = !!lift?.service;
  fade.classList.add('on'); sfx.play(stairs ? 'click' : 'ding');
  setTimeout(() => { fn(); fade.classList.remove('on'); }, stairs ? 1100 : 380);
}
export function toStreet() {
  const S = street(), ex = S && wayOut(S); if (!ex) return;
  if (lift?.service) toast(tr('fp.stairsDown'));
  through(() => {
    fp.street = true; setNear(null);
    fp.pos.set(ex.x + ex.n[0] * 0.3, ex.z + ex.n[1] * 0.3); fp.yaw = Math.atan2(ex.n[0], ex.n[1]); fp.pitch = -0.04;
  });
}
function toOffice(now = false) {
  const go = () => { street()?.setWalker(null); street()?.shop?.feel(null); fp.street = false; fp.carry = null; fp.seat = null; setNear(null); fp.pos.set(DOOR_IN.x + 0.7, DOOR_IN.z); fp.yaw = Math.PI / 2; };
  if (now) go(); else { if (lift?.service) toast(tr('fp.stairsUp')); through(go); }
}
/* ---------- in a shop (shops.js): take things from the fridges and the chain's corner, pay at the till by QR, sit at the
   window counter ---------- */
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
const itemName = (it) => tr(`fp.items.${it.id}`);
function shopLabel(o) {
  if (o.kind === 'seat') return tr(o.label || 'fp.sit');   // (a shop's own words for its seat: Cộng's low stool)
  if (o.kind !== 'pay') return tr('fp.take', { item: itemName(o.item), price: vnd(o.item.price) });
  if (fp.basket.length) return tr('fp.pay', { n: fp.basket.length, total: vnd(fp.basket.reduce((a, it) => a + it.price, 0)) });
  return o.item ? tr('fp.order', { item: itemName(o.item), price: vnd(o.item.price) }) : tr('fp.payEmpty');
}
function shopAct(o) {
  if (o.kind === 'seat') { fp.seat = o.seatAt; fp.pos.set(o.seatAt.x, o.seatAt.z); fp.yaw = o.seatAt.yaw; fp.pitch = -0.05; toast(tr(o.done || 'fp.sitDone')); return; }
  if (o.kind !== 'pay' || (!fp.basket.length && o.item)) { fp.basket.push(o.item); toast(tr('fp.added', { item: itemName(o.item) })); sfx.play('pop'); return; }
  if (!fp.basket.length) { toast(tr('fp.emptyBasket')); return; }
  const total = fp.basket.reduce((a, it) => a + it.price, 0), last = fp.basket[fp.basket.length - 1];
  sfx.play('beep'); toast(tr('fp.paid', { total: vnd(total), shop: o.store.name }));
  fp.carry = last.carry; fp.carryUntil = fp.t + 120; fp.P.cupBand.material.color.set(o.store.accent); fp.basket = [];
}
// what you can do out there, within reach: the way back in, a shop shut for the night, what is in the shop you are in,
// the cart, the stall
function streetNear(S) {
  const fx = Math.sin(fp.yaw), fz = Math.cos(fp.yaw), list = [];
  const ex = wayOut(S); if (ex) list.push({ outside: true, x: ex.x, z: ex.z, label: tr('fp.toOffice'), act: () => toOffice() });   // (each: `outside`)
  for (const d of S.doors()) if (!d.open) list.push({ outside: true, x: d.x, z: d.z, label: tr('fp.closed', { shop: d.name, at: d.opens }), act: () => sfx.play('click') });
  for (const o of S.shop?.spots() || []) list.push({ outside: true, x: o.x, z: o.z, label: shopLabel(o), act: () => shopAct(o) });
  for (const p of S.spots()) list.push({ outside: true, x: p.x, z: p.z, label: p.label || tr(`fp.${p.kind}`), act: p.act || (() => { if (p.kind === 'banhmi') { fp.carry = 'bag'; fp.carryUntil = fp.t + 60; } toast(tr(`fp.${p.kind}Done`)); sfx.play('coin'); }) });   // (a spot may bring its own: the traffic police's card)
  let best = null, bd = 1.8;
  for (const o of list) {
    const dx = o.x - fp.pos.x, dz = o.z - fp.pos.y, d = Math.hypot(dx, dz);
    if (d < bd && (d < 0.6 || (dx * fx + dz * fz) / d > 0.3)) { best = o; bd = d; }
  }
  return best;
}
function enterFp() {
  if (fp.on) return;
  if (state.selectedId) closeSession();
  if (!fp.grid) fp.grid = buildGrid();
  if (!fp.avatar) makeAvatar();
  fp.on = true; controls.enabled = false; renderPass.camera = fpCam;
  showAvatar();
  $('fp-hud').hidden = false; $('btn-fp').setAttribute('aria-pressed', 'true'); document.body.classList.add('is-fp');
  resize();
}
export function exitFp() {
  if (!fp.on) return;
  if (fp.street) toOffice(true);   // (the next walk in starts in the office)
  fp.on = false; fp.keys.clear(); fp.drag = null; fp.joy = null; setNear(null);
  controls.enabled = true; renderPass.camera = camera;
  showAvatar();
  $('fp-hud').hidden = true; $('btn-fp').setAttribute('aria-pressed', 'false'); document.body.classList.remove('is-fp');
}
function setNear(w) {
  const asleep = !!w && !w.meshes && !w.outside && w !== cat && w.anim === 'sleep' && !w.sub;
  if (fp.near === w && fp.nearAsleep === asleep) return;
  fp.near = w; fp.nearAsleep = asleep;
  const b = $('fp-near');
  if (!w) { b.hidden = true; return; }
  if (w.outside) { b.replaceChildren(el('kbd', '', 'E'), document.createTextNode(w.label)); b.hidden = false; return; }   // (on the street)
  if (w.meshes && w.id === 'door' && street()) { b.replaceChildren(el('kbd', '', 'E'), document.createTextNode(tr(!lift ? 'fp.outside' : lift.service ? 'fp.toStreetStairs' : 'fp.toStreet'))); b.hidden = false; return; }
  if (w === cat) { b.replaceChildren(el('kbd', '', 'E'), document.createTextNode(tr('fp.petCat'))); b.hidden = false; return; }
  if (w.meshes) { b.replaceChildren(el('kbd', '', 'E'), document.createTextNode(`${w.name}: ${propHint(w)}`)); b.hidden = false; return; }
  const name = w.sub ? tr('fp.subOf', { name: w.cfg.name, parent: sessions.get(w.parent?.id)?.name || tr('common.session') }) : sessions.get(w.id)?.name || w.cfg.name;
  b.replaceChildren(el('kbd', '', 'E'), document.createTextNode(tr(asleep ? 'fp.wake' : 'fp.watch', { name }))); b.hidden = false;
  if (!w.sub && !['type', 'console', 'read', 'sleep'].includes(w.anim)) w.waveUntil = state.sim + 1.6;
}
function interact() {
  const w = fp.near; if (!w) return;
  if (w.outside) { w.act(); return; }
  if (w.meshes && w.id === 'door' && street()) { toStreet(); return; }   // the lift (or the door): down to the street
  if (w === cat) { petCat(); return; }
  if (w.meshes) { activateProp(w); return; }
  if (!w.sub && w.anim === 'sleep' && w.rouse()) { fp.nearAsleep = null; return; }   // asleep: wake them (the session opens by clicking)
  if (w.sub) { if (w.parent) openSession(w.parent.id, { tab: 'subs', agent: w.id }); } else openSession(w.id);
}
const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable="true"]');
export function fpUpdate(dt) {
  const k = fp.keys;
  let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  fp.yaw -= ((k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)) * dt * 2.2;
  if (fp.joy) { f -= fp.joy.y; s += fp.joy.x; }
  const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
  if (fp.seat && len > 0.1) fp.seat = null;   // (up off the stool)
  if (fp.seat) { f = 0; s = 0; }
  const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.6 : 2.0;
  const fx = Math.sin(fp.yaw), fz = Math.cos(fp.yaw);            // forward; right is (-fz, fx)
  const vx = (fx * f - fz * s) * speed * dt, vz = (fz * f + fx * s) * speed * dt;
  const S = fp.street ? street() : null;
  if (fp.street && !S) toOffice(true);   // (the city is gone: back inside)
  const hit = S ? (x, z) => S.blockedAt(x, z) : (x, z) => blocked(x, z);
  const stuck = hit(fp.pos.x, fp.pos.y);
  if (stuck || !hit(fp.pos.x + vx, fp.pos.y)) fp.pos.x += vx;
  if (stuck || !hit(fp.pos.x, fp.pos.y + vz)) fp.pos.y += vz;
  fp.moving = Math.hypot(vx, vz) > 1e-5; fp.t += dt;
  S?.shop?.feel([fp.pos.x, fp.pos.y]);
  // the ground: the office floor, or the street (the pavement, a step down onto the road); on the road the traffic stops
  const ground = S ? S.groundAt(fp.pos.x, fp.pos.y) : 0;
  S?.setWalker(S && ground < S.pavement - 0.05 ? [fp.pos.x, fp.pos.y] : null);
  if (fp.carry && fp.t > fp.carryUntil) fp.carry = null;   // (finished it)
  // own body
  const P = fp.P, D = P.D;
  const pose = chibiPose(P, fp.moving ? 'walk' : fp.anim || 'idle', fp.t * (speed > 2.5 ? 1.5 : 1), { look: 0, carry: fp.carry, sit: !!fp.seat });   // (fp.anim: playing on the lounge TV)
  fp.avatar.position.set(fp.pos.x, (fp.seat ? fp.seat.y - SIT_H : ground) + applyChibiPose(P, pose, dt), fp.pos.y);
  fp.avatar.rotation.y += wrapAngle(fp.yaw - fp.avatar.rotation.y) * Math.min(1, dt * 12);
  // camera: eyes of the character, or over the shoulder
  const eyeY = (fp.seat ? fp.seat.y - SIT_H + D.hipY + D.sitY + D.headY : ground + D.hipY + D.headY) + (fp.moving ? Math.sin(fp.t * 9) * 0.025 : 0);
  const dir = new THREE.Vector3(Math.sin(fp.yaw) * Math.cos(fp.pitch), Math.sin(fp.pitch), Math.cos(fp.yaw) * Math.cos(fp.pitch));
  if (fp.third) {
    const tgt = new THREE.Vector3(fp.pos.x, eyeY - 0.1, fp.pos.y);
    let back = 3.2;
    for (let d = 0.6; d <= 3.2; d += 0.2) if (S ? S.blockedAt(tgt.x - dir.x * d, tgt.z - dir.z * d, 0) : cellBlocked(tgt.x - dir.x * d, tgt.z - dir.z * d)) { back = Math.max(0.6, d - 0.3); break; }
    fpCam.position.copy(tgt).addScaledVector(dir, -back); fpCam.position.y += 0.55;
    fpCam.lookAt(tgt.x + dir.x * 2, tgt.y + dir.y * 2, tgt.z + dir.z * 2);
  } else {
    fpCam.position.set(fp.pos.x + fx * 0.12, eyeY, fp.pos.y + fz * 0.12);
    fpCam.rotation.set(fp.pitch, fp.yaw + Math.PI, 0, 'YXZ');
  }
  // the agent in front of you, within reach (out on the street: someone from the office out there, else what is at hand)
  let best = null, bd = 2.6;
  for (const w of [...workers.values(), ...subs.values()]) {
    if (!!w.street !== !!S || !w.root.visible) continue;
    const dx = w.pos.x - fp.pos.x, dz = w.pos.y - fp.pos.y, d = Math.hypot(dx, dz);
    if (d > bd || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
    best = w; bd = d;
  }
  if (S) { setNear(best || streetNear(S)); return; }
  { const dx = cat.pos.x - fp.pos.x, dz = cat.pos.y - fp.pos.y, d = Math.hypot(dx, dz); if (d < Math.min(bd, 2.0) && (dx * fx + dz * fz) / (d || 1) > 0.4) { best = cat; bd = d; } }
  if (!best) {   // furniture within arm's reach, measured to its nearest edge
    let pd = 1.5;
    for (const p of PROPS.values()) {
      if (p.id === 'cat' || p.bin) continue;
      const cx = THREE.MathUtils.clamp(fp.pos.x, p.box.min.x, p.box.max.x), cz = THREE.MathUtils.clamp(fp.pos.y, p.box.min.z, p.box.max.z);
      const dx = cx - fp.pos.x, dz = cz - fp.pos.y, d = Math.hypot(dx, dz);
      if (d < pd && (d < 0.2 || (dx * fx + dz * fz) / d > 0.55)) { best = p; pd = d; }
    }
  }
  setNear(best);
  if (best && best !== cat && !best.meshes) { best.lookY = THREE.MathUtils.clamp(wrapAngle(Math.atan2(fp.pos.x - best.pos.x, fp.pos.y - best.pos.y) - best.face), -1, 1); best.lookT = 0.5; }
}

export function setup() {
  /* ---------- first person: walk the office as your own character ---------- */
  // The walkable area is the room plus the terrace. Obstacles come from the scene itself: every static mesh whose box
  // spans knee-to-chest height blocks the 10 cm cells under it (built once, on first use).
  fp = { on: false, third: false, yaw: Math.PI / 2, pitch: -0.06, pos: new V2(DOOR_IN.x + 0.7, DOOR_IN.z), keys: new Set(),
    drag: null, joy: null, grid: null, avatar: null, P: null, near: null, moving: false, t: 0, street: false, carry: null, carryUntil: 0, basket: [], seat: null };
  fade = el('div', 'fp-fade'); $('stage-wrap').append(fade);
  FPB = HQ ? { x0: -7.85, x1: 15.3, z0: -7.85, z1: 28.3 } : PRO ? { x0: -7.85, x1: 15.3, z0: -7.85, z1: 11.3 } : { x0: -7.85, x1: 11.7, z0: -5.85, z1: 10.3 };
  $('btn-fp').addEventListener('click', () => (fp.on ? exitFp() : enterFp()));
  $('fp-exit').addEventListener('click', exitFp);
  $('fp-near').addEventListener('click', interact);
  document.addEventListener('keydown', (e) => {
    if (!fp.on || typing(e) || e.metaKey || e.ctrlKey) return;
    if (e.code === 'KeyE') { interact(); return; }
    if (e.code === 'KeyV') { fp.third = !fp.third; showAvatar(); return; }
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code)) { fp.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => fp.keys.delete(e.code));
  window.addEventListener('blur', () => fp.keys.clear());
  renderer.domElement.addEventListener('pointerdown', (e) => { if (fp.on) { fp.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; } });
  window.addEventListener('pointermove', (e) => {
    if (!fp.on || !fp.drag || e.pointerId !== fp.drag.id) return;
    const k = e.pointerType === 'mouse' ? 0.0042 : 0.006;
    fp.yaw -= (e.clientX - fp.drag.x) * k; fp.pitch = THREE.MathUtils.clamp(fp.pitch - (e.clientY - fp.drag.y) * k, -1.1, 0.9);
    fp.drag.x = e.clientX; fp.drag.y = e.clientY;
  });
  window.addEventListener('pointerup', (e) => { if (fp.drag && e.pointerId === fp.drag.id) fp.drag = null; });
  (() => {
    const pad = $('fp-joy'), knob = pad.firstElementChild; let id = null, cx = 0, cy = 0;
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; pad.setPointerCapture(id); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); e.stopPropagation(); });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = 44;
      if (d > m) { dx *= m / d; dy *= m / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; fp.joy = { x: dx / m, y: dy / m };
    };
    pad.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== id) return; id = null; fp.joy = null; knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  })();
}
