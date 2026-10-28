// Furniture you can point at: highlight, tooltip, click actions.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, PRO, SEASON, el, rand, reduceMotion } from '../core/env.js';
import { STATUS_LABEL } from '../ui/event-text.js';
import { scene } from '../scene/renderer.js';
import { lamps } from '../scene/lights.js';
import { lampBulbs, mat } from '../scene/blocks.js';
import { BULB_OFF, BULB_ON } from '../world/terrace.js';
import { LAY } from '../world/layout.js';
import { clockG, globe, globeStand, shelf, sofaG } from '../world/furniture/room-pieces.js';
import { leds, rackG } from '../world/furniture/server-racks.js';
import { ROCKET_HOME, rocket } from '../world/furniture/rocket.js';
import { board } from '../world/furniture/board.js';
import { DZ, doorPivot, lift, liftCall } from '../world/entrance.js';
import { DESKS } from '../world/desks.js';
import { STEAM_AT, coffeeG, coffeeLed } from '../world/furniture/coffee.js';
import { floorLampGroups, roomPlants } from '../world/furniture/plants-lamps.js';
import { nightHooks } from '../world/props/trinkets.js';
import { PRO_FX } from '../world/pro/pieces.js';
import { AQ } from '../world/props/aquarium.js';
import { ARC } from '../world/props/arcade.js';
import { PRN, paper, printPage } from '../world/props/printer.js';
import { tvG } from '../world/props/tv.js';
import { neonG, neonM } from '../world/props/neon.js';
import { SOFA, cat, catGo, petCat } from '../world/props/cat.js';
import { vac } from '../world/props/vacuum.js';
import { bins } from '../world/props/bins.js';
import { devPool } from '../world/props/dev-servers.js';
import { dn, npcs, sessions, subs, workers } from '../people/workers.js';
import { SEASON_SPOT, seasonName, seasonProp } from '../life/seasons.js';
import { confetti, night, particles, puffGeo } from '../world/room-update.js';
import { toast } from '../ui/activity.js';
import { openSession } from '../ui/session-drawer.js';
import { openMac } from '../ui/mac-drawer.js';
import { PLACES, placeMeshes } from './place-chips.js';
import { openPlace } from './place-cards.js';
import { ray } from '../ui/whiteboard.js';
import { setTimeMode } from '../ui/settings.js';
import { fp } from './first-person.js';
import { coffeeMade, lampSwitched, lightsSwitched, pagePrinted, plantThirsty, waterPlant } from '../people/errands.js';
import { bellG, ringBell } from '../people/gatherings.js';
import { flipSwitch, switches } from '../world/props/switches.js';
import { sfx } from '../audio/sfx.js';
import { tipUsed } from '../ui/tips.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- places and things you can point at ----------
   Each corner of the office has a chip on the furniture it names; the chip fades while someone stands in front of it.
   Pointing at furniture outlines it and says what it is; clicking opens a card with what the agents did there, or
   does something small (feed the fish, brew coffee, call the cat). */
// Highlight: a warm shell just outside the pointed-at furniture (its own meshes drawn once more, back faces pushed
// out along the normals). A post-processing outline redrew the whole scene twice a frame and made hovering stutter.
export const hlMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.45, 0.3), side: THREE.BackSide });
let hlShells = [], hlLit = [];
const HL_GLOW = new THREE.Color('#FFB347');
export function setOutline(list) {
  for (const h of hlShells) h.parent?.remove(h);
  for (const [m, e, k] of hlLit) { m.emissive.copy(e); m.emissiveIntensity = k; }
  hlShells = []; hlLit = [];
  if (fp.on) return;
  for (const m of list) {
    if (!m.isMesh || m.isInstancedMesh || !m.parent) continue;
    const h = new THREE.Mesh(m.geometry, hlMat); h.raycast = () => {}; m.add(h); hlShells.push(h);
    // a warm lift too, but only on materials that belong to this piece alone (the merged ones)
    const mt = m.material;
    if (mt.userData.own && mt.emissive && !hlLit.some((x) => x[0] === mt)) { hlLit.push([mt, mt.emissive.clone(), mt.emissiveIntensity]); mt.emissive.copy(HL_GLOW); mt.emissiveIntensity = 0.16; }
  }
}
const _bx = new THREE.Box3();
// Meshes of every top-level object that sits wholly inside a world box (furniture is built from loose meshes).
function meshesIn([x0, y0, z0, x1, y1, z1]) {
  const box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)).expandByScalar(0.03), out = [];   // legs end at -0.000…
  for (const o of scene.children) {
    if (o.userData.dynamic || o.userData.worker || o.isLight || o.isCSS2DObject || o === board) continue;
    _bx.setFromObject(o);
    if (!_bx.isEmpty() && box.containsBox(_bx)) o.traverse((m) => { if (m.isMesh) out.push(m); });
  }
  return out;
}
const meshesOf = (...gs) => { const out = []; for (const g of gs) g.traverse((m) => { if (m.isMesh) out.push(m); }); return out; };
export const PROPS = new Map(), propMeshes = [];
function prop(id, def) {
  const p = { id, ...def };
  for (const m of p.meshes) { m.userData.prop = p; propMeshes.push(m); }
  _bx.makeEmpty(); for (const m of p.meshes) _bx.expandByObject(m);
  p.center = _bx.getCenter(new THREE.Vector3()); p.top = _bx.max.y; p.box = _bx.clone();
  p.boxes = p.meshes.map((m) => new THREE.Box3().setFromObject(m));
  PROPS.set(id, p); return p;
}
/* small reactions */
const bounces = [];
function bounce(g) { if (!reduceMotion && g && !bounces.some((b) => b.g === g)) bounces.push({ g, t: 0, base: g.scale.clone() }); }
export const fishFeed = { until: 0, k: 0 }, flakes = [];
const flakeGeo = new THREE.BoxGeometry(0.03, 0.008, 0.03);
export let flakeM;
export function feedFish() {
  sfx.play('bloop');
  fishFeed.until = state.sim + 7;
  for (let i = 0; i < 16; i++) { const f = new THREE.Mesh(flakeGeo, flakeM); f.position.set(AQ.x + rand(-0.7, 0.7), 1.42 + rand(0, 0.04), AQ.z + rand(-0.15, 0.15)); f.rotation.y = rand(0, 3); scene.add(f); flakes.push({ m: f, v: rand(0.04, 0.09), life: rand(5, 7) }); }
}
export function brewCoffee() {
  sfx.play('brew');
  coffeeBrew = state.sim + 2.6;
  for (let i = 0; i < 9; i++) setTimeout(() => steam(STEAM_AT.x + rand(-0.03, 0.03), STEAM_AT.y, STEAM_AT.z), i * 220);
}
let coffeeBrew = 0;
export let vacSpin = 0;
let neonFlicker = 0;
export let doorKick = 0;
let rackParty = 0;
let globeBoost = 0;
function steam(x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, depthWrite: false }));
  m.position.set(x, y, z); m.scale.setScalar(0.3); scene.add(m);
  particles.push({ m, v: new THREE.Vector3(rand(-0.04, 0.04), 0.32, rand(-0.04, 0.04)), life: 1.8, max: 1.8, kind: 'steam' });
}
const wiggles = [];
function wiggle(g) { sfx.play('rustle'); if (!reduceMotion) wiggles.push({ g, t: 0, rx: g.rotation.x, rz: g.rotation.z }); }
export function catToSofa() {
  catGo(SOFA.via.x, SOFA.via.z, () => { cat.hop = { t: 0, from: [SOFA.via.x, 0, SOFA.via.z], to: [SOFA.x, SOFA.y, SOFA.z], up: true }; cat.mode = 'hop'; cat.after = () => { cat.mode = 'sleep'; cat.until = state.sim + rand(25, 45); cat.face = 0.4; }; });
  cat.sayUntil = state.sim + 2; sfx.play('meow');
}
// Floor lamps: click to switch one on or off. Night switches them all back on.
export const floorLamps = [];
function toggleLamp(L) { L.on = !L.on; L.bulb.color.copy(L.on ? BULB_ON : BULB_OFF); if (L.light) L.light.intensity = L.on ? (night ? 4.5 : 2.2) : 0; sfx.play('click'); }
const TIME_NEXT = { auto: 'day', day: 'night', night: 'auto' };
function cycleTime() { const m = TIME_NEXT[state.nightManual ? (night ? 'night' : 'day') : 'auto']; setTimeMode(m); toast(tr('props.clock.toast', { mode: tr('props.clock.' + m) })); sfx.play('click'); }
/* the things themselves */
function deskSession(i) { return [...sessions.values()].find((s) => s.desk === i); }
function openDesk(i) { const s = deskSession(i); if (s) openSession(s.id); else openPlace('desks', PROPS.get('desk' + i)); }
export function buildProps() {
  scene.updateMatrixWorld(true);
  const R = ROCKET_HOME, S = LAY.sofa;
  const REG = PRO ? { window: [6.7, 0.9, -8.2, 8.7, 3.2, -7.6], meeting: [-2.55, 0, -7.5, 2.95, 1.45, -3.75] }
    : { window: [-1.6, 1.0, -6.1, 3.4, 3.7, -5.5], meeting: [3.7, 0, 0.85, 6.75, 1.3, 3.95] };
  prop('shelf', { name: tr('props.shelf.name'), hint: tr('props.shelf.hint'), place: 'library', meshes: meshesOf(shelf), bounce: shelf });
  prop('window', { name: tr('props.window.name'), hint: tr('props.window.hint'), place: 'window', meshes: [...meshesIn(REG.window), ...meshesOf(globeStand)], act: () => { globeBoost = 9; } });
  prop('racks', { name: tr(PRO ? 'props.racks.namePro' : 'props.racks.name'), hint: tr('props.racks.hint'), meshes: meshesOf(rackG), act: () => { rackParty = state.sim + 1.2; openMac(); } });
  prop('tv', { name: tr('props.tv.name'), hint: tr('props.tv.hint'), meshes: meshesOf(tvG), act: () => openMac() });
  prop('rocket', { name: tr('props.rocket.name'), hint: tr('props.rocket.hint'), place: 'deploy', meshes: [...meshesOf(rocket), ...meshesIn([R.x - 0.65, 0, R.z - 0.65, R.x + 0.65, 0.2, R.z + 0.65])] });
  prop('board', { name: tr('props.board.name'), hint: tr('props.board.hint'), place: 'board', meshes: meshesOf(board), bounce: board });
  if (lift) prop('door', { name: tr('props.lift.name'), hint: tr('props.lift.hint'), place: 'door', meshes: meshesOf(lift.g), act: () => { liftCall(3); sfx.play('click'); } });
  else prop('door', { name: tr('props.door.name'), hint: tr('props.door.hint'), place: 'door', meshes: [...meshesOf(doorPivot), ...meshesIn([-8.1, 0, DZ - 1.0, -7.8, 2.75, DZ + 1.0])], act: () => { doorKick = state.sim + 2.2; } });
  prop('coffee', { name: tr(PRO ? 'props.coffee.namePro' : 'props.coffee.name'), hint: tr('props.coffee.hint'), place: 'coffee', meshes: PRO ? [...meshesOf(coffeeG), ...meshesIn([11.9, 0, -8.1, 14.1, 2.2, -7.1])] : meshesOf(coffeeG), act: () => { brewCoffee(); coffeeMade(); } });
  prop('meeting', { name: tr('props.meeting.name'), hint: tr('props.meeting.hint'), place: 'meeting', meshes: meshesIn(REG.meeting) });
  prop('printer', { name: tr('props.printer.name'), hint: tr('props.printer.hint'), place: 'printer', meshes: [...meshesIn([PRN.x - 0.4, 0, PRN.z - 0.35, PRN.x + 0.4, 1.05, PRN.z + 0.35]), paper], act: () => { printPage(); pagePrinted(); } });
  prop('arcade', { name: tr('props.arcade.name'), hint: tr('props.arcade.hint'), place: PRO ? 'lounge' : undefined, meshes: meshesIn([ARC.x - 0.45, 0, ARC.z - 0.42, ARC.x + 0.45, 1.85, ARC.z + 0.53]), act: () => { state.arcCoin = state.sim + 3; sfx.play('coin'); toast(tr('props.arcade.soon')); } });
  prop('aquarium', { name: tr('props.aquarium.name'), hint: tr('props.aquarium.hint'), place: PRO ? 'lounge' : undefined, meshes: meshesIn([AQ.x - 1.15, 0, AQ.z - 0.35, AQ.x + 1.15, 1.65, AQ.z + 0.35]), act: feedFish });
  // petted, it soon goes looking for a keyboard to sit on
  prop('cat', { name: tr('props.cat.name'), hint: tr('props.cat.hint'), meshes: meshesOf(cat.g), dyn: cat.g, act: () => { petCat(); cat.restless = true; cat.restlessAt = state.sim + 2.2; } });
  prop('vac', { name: tr('props.vac.name'), hint: tr('props.vac.hint'), meshes: meshesOf(vac.g), dyn: vac.g, act: () => { vacSpin = state.sim + 1.3; sfx.play('beep'); } });
  prop('clock', { name: tr('props.clock.name'), hint: tr('props.clock.hint'), meshes: meshesOf(clockG), bounce: clockG, act: cycleTime });
  prop('neon', { name: tr('props.neon.name'), hint: tr('props.neon.hint'), meshes: meshesOf(neonG), act: () => { neonFlicker = state.sim + 1.4; sfx.play('buzz'); } });
  prop('sofa', { name: tr('props.sofa.name'), hint: tr('props.sofa.hint'), place: PRO ? 'lounge' : undefined, meshes: [...meshesOf(sofaG), ...meshesIn([S[0] - 0.5, 0, S[1] + 0.55, S[0] + 0.5, 0.6, S[1] + 1.55])], act: catToSofa });
  if (PRO) {
    prop('trophies', { name: tr('props.trophies.name'), hint: tr('props.trophies.hint'), place: 'director', meshes: meshesOf(PRO_FX.trophyCab) });
    prop('director', { name: tr('props.director.name'), hint: tr('props.director.hint'), place: 'director', meshes: [...meshesOf(PRO_FX.execDesk), ...meshesIn([-7.1, 0, -8.05, -3.5, 1.3, -7.4])] });
    prop('wc', { name: tr('props.wc.name'), hint: tr('props.wc.hint'), place: 'wc', meshes: meshesIn([-8.0, 0, 5.4, -6.7, 2.0, 8.1]) });
    prop('foosball', { name: tr('props.foosball.name'), hint: tr('props.foosball.hint'), place: 'lounge', meshes: meshesOf(PRO_FX.foosball), bounce: PRO_FX.foosball, act: () => sfx.play('click') });
  }
  if (seasonProp) prop('season', { name: tr('props.season.' + SEASON), hint: tr('props.season.hint', { season: seasonName(SEASON) }), meshes: meshesOf(seasonProp),
    act: () => { if (!reduceMotion) confetti(SEASON_SPOT.centre[0], 2.6, SEASON_SPOT.centre[1]); sfx.play('pop'); } });
  floorLampGroups.forEach((g, i) => {
    const head = g.position, light = [...lamps].sort((a, b) => a.position.distanceTo(head) - b.position.distanceTo(head))[0];
    const L = { g, bulb: lampBulbs[g.userData.bulb], light: light && light.position.distanceTo(head) < 3.2 ? light : null, on: night };
    floorLamps.push(L);
    prop('lamp' + i, { name: tr('props.lamp.name'), hint: tr('props.lamp.hint'), meshes: meshesOf(g), act: () => { toggleLamp(L); lampSwitched(L, () => toggleLamp(L)); } });
  });
  switches.forEach((sw, i) => prop('switch' + i, { name: tr('props.switch.name'), hint: tr('props.switch.hint'), meshes: meshesOf(sw.g), act: () => { flipSwitch(sw); lightsSwitched(sw, () => flipSwitch(sw)); } }));
  roomPlants.forEach((g, i) => prop('plant' + i, { name: tr('props.plant.name'), hint: tr('props.plant.hint'), plant: i, meshes: meshesOf(g), act: () => { if (!plantThirsty(i) || !waterPlant(i)) wiggle(g); } }));
  prop('bell', { name: tr('props.bell.name'), hint: tr('props.bell.hint'), meshes: meshesOf(bellG), act: () => ringBell() });
  DESKS.forEach((d, i) => prop('desk' + i, { name: tr('props.desk.name', { n: i + 1 }), desk: i, meshes: meshesOf(d.g), act: () => openDesk(i) }));
  bins.forEach((b, i) => prop('bin' + i, { name: tr('props.bin.name'), desk: i, bin: true, meshes: meshesOf(b.g), act: () => openDesk(i) }));
}
export function propHint(p) {
  if (p.plant != null) return plantThirsty(p.plant) ? tr('props.plant.thirsty') : p.hint;
  if (p.desk == null) return p.hint;
  const s = deskSession(p.desk);
  if (p.bin) return s ? tr('props.bin.hint', { name: dn(s), pct: s.usage?.ctx ? Math.round((s.usage.ctx / (s.usage.ctxMax || 200000)) * 100) + '%' : tr('props.bin.unknown') }) : tr('props.bin.empty');
  return s ? tr('props.desk.hint', { name: dn(s), status: STATUS_LABEL[s.status] || '' }) : tr('props.desk.empty');
}
export function activateProp(p) {
  tipUsed(p.id);
  if (p.bounce) bounce(p.bounce);
  if (p.act) p.act();
  if (p.place) openPlace(p.place, p);
}
export function updateProps(dt, t) {
  for (let i = bounces.length - 1; i >= 0; i--) {
    const b = bounces[i]; b.t += dt; const k = Math.min(1, b.t / 0.45), sy = 1 + 0.06 * Math.sin(k * Math.PI * 3) * (1 - k);
    b.g.scale.set(b.base.x * (1 - (sy - 1) * 0.5), b.base.y * sy, b.base.z * (1 - (sy - 1) * 0.5));
    if (k >= 1) { b.g.scale.copy(b.base); bounces.splice(i, 1); }
  }
  for (let i = wiggles.length - 1; i >= 0; i--) {
    const w = wiggles[i]; w.t += dt; const a = Math.max(0, 1 - w.t / 0.9) * 0.14;
    w.g.rotation.x = w.rx + Math.sin(w.t * 22) * a; w.g.rotation.z = w.rz + Math.cos(w.t * 19) * a;
    if (w.t > 0.9) { w.g.rotation.x = w.rx; w.g.rotation.z = w.rz; wiggles.splice(i, 1); }
  }
  fishFeed.k += ((fishFeed.until > t ? 1 : 0) - fishFeed.k) * Math.min(1, dt * 1.6);
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i]; f.life -= dt; f.m.position.y = Math.max(0.86, f.m.position.y - f.v * dt); f.m.rotation.y += dt;
    if (f.life <= 0) { scene.remove(f.m); flakes.splice(i, 1); }
  }
  if (coffeeBrew > t) coffeeLed.color.set(Math.floor(t * 6) % 2 ? '#FFD166' : '#5BE37D');
  if (globeBoost > 0.05) { globe.rotation.y += dt * globeBoost; globeBoost *= Math.exp(-dt * 1.2); }
  if (rackParty > t) for (const m of leds) if (Math.random() < 0.5) m.emissiveIntensity = Math.random() < 0.5 ? 0.1 : 2.2;
  if (neonFlicker > t) neonM.color.setScalar(Math.random() < 0.45 ? 0.15 : night ? 2.6 : 1.15);
  else if (neonFlicker && neonFlicker <= t) { neonFlicker = 0; neonM.color.setScalar(night ? 2.6 : 1.15); }
}
let ptip;
let ptipT;
let ptipH;
export let hoverProp = null;
export function setHoverProp(p, ev) {
  if (p !== hoverProp) {
    hoverProp = p;
    setOutline(p ? p.meshes : state.hoverPlace ? placeMeshes(state.hoverPlace) : []);
    for (const [id, pl] of Object.entries(PLACES)) pl.el?.classList.toggle('zone--hot', !!p && p.place === id);
  }
  if (!p || !ev) { ptip.hidden = true; return; }
  ptipT.textContent = p.name; ptipH.textContent = propHint(p);
  const r = $('stage-wrap').getBoundingClientRect();
  ptip.hidden = false;
  const x = ev.clientX - r.left + 16, y = ev.clientY - r.top + 18, w = ptip.offsetWidth, h = ptip.offsetHeight;
  ptip.style.transform = `translate(${Math.min(x, r.width - w - 10)}px, ${y + h > r.height - 10 ? ev.clientY - r.top - h - 12 : y}px)`;
}
// Picking tests boxes, not triangles: each piece of furniture keeps the boxes of its parts (taken before the merge),
// the cat and the vacuum are boxed where they are now, people are boxed around where they stand or sit.
const _hit = new THREE.Vector3(), _pb = new THREE.Box3();
const rayDist = (r, box) => (r.intersectBox(box, _hit) ? r.origin.distanceTo(_hit) : Infinity);
export function propDist(p, r) {
  if (p.dyn) return rayDist(r, _pb.setFromObject(p.dyn));
  if (rayDist(r, p.box) === Infinity) return Infinity;
  let d = Infinity; for (const b of p.boxes) d = Math.min(d, rayDist(r, b)); return d;
}
export function pickProp(r = ray.ray) {
  let best = null, bd = Infinity;
  for (const p of PROPS.values()) { const d = propDist(p, r); if (d < bd) { bd = d; best = p; } }
  return best ? { prop: best, d: bd } : null;
}
export function pickPerson(r = ray.ray) {
  let best = null, bd = Infinity;
  for (const w of [...workers.values(), ...subs.values(), ...npcs]) {
    if (!w.root.parent || !w.root.visible) continue;
    const k = w.scale || 1, h = (w.pose === 'sit' ? 1.6 : 1.95) * k, rr = 0.34 * k;
    _pb.min.set(w.pos.x - rr, 0, w.pos.y - rr); _pb.max.set(w.pos.x + rr, h, w.pos.y + rr);
    const d = rayDist(r, _pb); if (d < bd) { bd = d; best = { worker: w }; }
  }
  for (const b of devPool) if (b.g.visible) { const d = rayDist(r, _pb.setFromObject(b.g)); if (d < bd) { bd = d; best = { devBox: true }; } }
  return best ? { ...best, d: bd } : null;
}

export function setup() {
  hlMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normal * 0.042;'); };
  flakeM = mat('#E7A44B', { roughness: 0.8 });
  state.arcCoin = 0;
  nightHooks.push((on) => { for (const L of floorLamps) { L.on = on; L.bulb.color.copy(on ? BULB_ON : BULB_OFF); } });
  /* hover: outline + a one-line tooltip next to the pointer */
  ptip = el('div', 'ptip');
   ptip.hidden = true;
   ptip.setAttribute('role', 'tooltip');
  ptipT = el('b'); ptipH = el('span');
   ptip.append(ptipT, ptipH);
   $('stage-wrap').append(ptip);
  state.hoverPlace = null;
}
