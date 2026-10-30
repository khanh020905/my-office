// The trophy cabinet and the opening plaque.
import * as THREE from 'three';
import { chatLife } from '../ui/group-chat.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PRO, pad2, reduceMotion } from '../core/env.js';
import { renderer, scene } from '../scene/renderer.js';
import { canvasTex, lampBulbs, mat, put, rbox } from '../scene/blocks.js';
import { BULB_OFF, metal } from '../world/terrace.js';
import { shaded } from '../world/desks.js';
import { PRO_FX } from '../world/pro/pieces.js';
import { confetti } from '../world/room-update.js';
import { toast } from '../ui/activity.js';
import { plcState, renderPlace } from '../interact/place-cards.js';
import { celebrate } from '../people/gatherings.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- the trophy cabinet (pro): one trophy per kind of milestone in the director's glass cabinet, the best one
   reached (bronze, silver, gold), from the server's all-time totals; the opening plaque hangs over the sofa. A new one
   comes with a toast and confetti. Each trophy is two meshes (metal, base), rebuilt only when the set changes. ---------- */
export let trophyData = null;
export const TIER_METAL = { 1: '#C9885A', 2: '#D3D8DF', 3: '#E9B949' };
let trophyMetalM;
let trophyBaseM;
const trophyG = new THREE.Group();
export let starShape;
function trophyParts(kind, metal) {   // [geometry, colour, metal?] standing on y = 0, facing +z
  const base = [[new RoundedBoxGeometry(0.13, 0.05, 0.1, 2, 0.012).translate(0, 0.025, 0), '#2B2118', false], [new THREE.BoxGeometry(0.07, 0.016, 0.003).translate(0, 0.027, 0.051), metal, true]];
  switch (kind) {
    case 'cup': {
      const bowl = new THREE.LatheGeometry([[0.012, 0], [0.05, 0.02], [0.062, 0.06], [0.064, 0.1], [0.06, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
      return [...base, [new THREE.CylinderGeometry(0.035, 0.045, 0.02, 20).translate(0, 0.06, 0), metal, true], [new THREE.CylinderGeometry(0.01, 0.014, 0.06, 10).translate(0, 0.1, 0), metal, true],
        [bowl.translate(0, 0.13, 0), metal, true], ...[-1, 1].map((sx) => [new THREE.TorusGeometry(0.026, 0.006, 6, 14, Math.PI).rotateZ(-sx * Math.PI / 2).translate(sx * 0.062, 0.18, 0), metal, true])];
    }
    case 'star': return [...base, [new THREE.CylinderGeometry(0.008, 0.012, 0.09, 8).translate(0, 0.095, 0), metal, true], [new THREE.ExtrudeGeometry(starShape, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }).translate(0, 0.19, -0.007), metal, true]];
    case 'book': return [...base, [new THREE.CylinderGeometry(0.012, 0.016, 0.05, 8).translate(0, 0.075, 0), metal, true],
      ...[-1, 1].map((sx) => [new THREE.BoxGeometry(0.075, 0.008, 0.1).rotateZ(sx * 0.32).translate(sx * 0.036, 0.112, 0), metal, true]), [new THREE.BoxGeometry(0.012, 0.012, 0.1).translate(0, 0.104, 0), metal, true]];
    case 'rocket': return [...base, [new THREE.CylinderGeometry(0.022, 0.026, 0.11, 14).translate(0, 0.11, 0), metal, true], [new THREE.ConeGeometry(0.022, 0.05, 14).translate(0, 0.19, 0), metal, true],
      ...[0, 1, 2].map((k) => [new THREE.BoxGeometry(0.006, 0.045, 0.03).translate(0, 0.075, 0.03).rotateY((k * Math.PI * 2) / 3), metal, true]), [new THREE.SphereGeometry(0.009, 10, 8).translate(0, 0.125, 0.024), '#7EC8E3', false]];
    case 'medal': return [...base, ...[-1, 1].map((sx) => [new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6).translate(sx * 0.045, 0.135, -0.02), '#2B2118', false]), [new THREE.BoxGeometry(0.1, 0.008, 0.008).translate(0, 0.22, -0.02), '#2B2118', false],
      [new THREE.BoxGeometry(0.018, 0.07, 0.004).rotateZ(0.35).translate(-0.012, 0.18, -0.014), '#C8553D', false], [new THREE.BoxGeometry(0.018, 0.07, 0.004).rotateZ(-0.35).translate(0.012, 0.18, -0.012), '#3F7CC4', false],
      [new THREE.CylinderGeometry(0.036, 0.036, 0.008, 22).rotateX(Math.PI / 2).translate(0, 0.125, -0.008), metal, true]];
  }
  return base;
}
function trophyMesh(kind, metal) {
  const g = new THREE.Group(), parts = trophyParts(kind, metal);
  for (const [want, m] of [[true, trophyMetalM], [false, trophyBaseM]]) {
    const list = parts.filter((x) => x[2] === want).map(([geo, c]) => [geo, c]);
    if (list.length) { const mesh = new THREE.Mesh(shaded(list), m); mesh.castShadow = true; g.add(mesh); }
  }
  return g;
}
// the opening plaque over the director's sofa: walnut, a brass plate with the date
let plaqueMesh = null;
function buildPlaque(since) {
  if (!PRO || plaqueMesh) return;
  const d = new Date(since), date = tr('life.trophy.plaqueDate', { d: pad2(d.getDate()), m: pad2(d.getMonth() + 1), y: d.getFullYear() });
  const tex = canvasTex(512, 300, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#E9C46A'); grad.addColorStop(1, '#B98A2E'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,50,10,.55)'; g.lineWidth = 6; g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#4A3410'; g.textAlign = 'center';
    g.font = '700 30px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('life.trophy.plaque'), w / 2, 92);
    g.font = '800 64px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(date, w / 2, 178);
    g.font = '600 26px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('My Office', w / 2, 236);
  });
  plaqueMesh = new THREE.Group(); plaqueMesh.position.set(-7.95, 1.62, -4.1); plaqueMesh.rotation.y = Math.PI / 2; scene.add(plaqueMesh);
  put(plaqueMesh, rbox(0.62, 0.42, 0.035, mat('#5A3B26', { roughness: 0.45 }), 0.012), 0, 0, 0.018);
  put(plaqueMesh, new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), mat('#FFFFFF', { map: tex, metalness: 0.55, roughness: 0.35 })), 0, 0, 0.037);
}
// a glass trophy cabinet in the director's back corner, three lit shelves, facing the room
const CAB = { x: -7.74, z: -7.3, ry: Math.PI / 2, shelves: [1.42, 0.98, 0.54] };
let shelfKey = '';
function buildShelf() {
  if (!PRO || !trophyData) return;
  const best = new Map();   // kind of total -> the highest milestone reached
  for (const m of trophyData.defs) if (m.k !== 'open' && trophyData.earned[m.id] && (!best.has(m.k) || best.get(m.k).tier < m.tier)) best.set(m.k, m);
  const list = [...best.values()].slice(0, 9), key = list.map((m) => m.id).join('|');
  if (trophyData.earned.open) buildPlaque(trophyData.earned.open);
  if (key === shelfKey) return; shelfKey = key;
  for (const c of [...trophyG.children]) { c.traverse((o) => o.geometry?.dispose()); trophyG.remove(c); }
  list.forEach((m, i) => { const t = trophyMesh(m.kind, TIER_METAL[m.tier]); t.position.set(((i % 3) - 1) * 0.3, CAB.shelves[Math.floor(i / 3)], 0.01); t.scale.setScalar(1.45); t.userData.milestone = m; trophyG.add(t); });
  renderer.shadowMap.needsUpdate = true;
}
export function setTrophies(t, fresh = []) {
  trophyData = t; buildShelf();
  if (plcState.id === 'director') renderPlace();
  let party = false;
  for (const id of fresh) {
    const m = t.defs.find((x) => x.id === id); if (!m) continue;
    toast(tr('life.trophy.toast', { name: m.name }), 5200); sfx.play('deploy');
    if (!reduceMotion && PRO) confetti(-5.3, 2.4, -6.4);
    if (!party) { party = true; celebrate(m.name); chatLife('trophy', { name: m.name }); }   // and a cake on the meeting table (one party for a batch)
  }
}

export function setup() {
  trophyMetalM = mat('#FFFFFF', { metalness: 0.82, roughness: 0.26, vertexColors: true }); trophyBaseM = mat('#FFFFFF', { roughness: 0.5, vertexColors: true });
   trophyG.userData.noMerge = true;
   if (PRO) scene.add(trophyG);
  starShape = (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.024 : 0.058; const x = Math.sin(a) * r, y = Math.cos(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } sh.closePath(); return sh; })();
  if (PRO) {
    const g = new THREE.Group(); g.position.set(CAB.x, 0, CAB.z); g.rotation.y = CAB.ry; scene.add(g); PRO_FX.trophyCab = g;
    const walnut = mat('#4A3628', { roughness: 0.5 }), back = mat('#E9E2D6', { roughness: 0.8 });
    put(g, rbox(1.02, 0.5, 0.44, walnut, 0.02), 0, 0.25, 0);                                  // cupboard
    for (const sx of [-1, 1]) put(g, rbox(0.48, 0.42, 0.012, mat('#5A4232', { roughness: 0.55 }), 0.01), sx * 0.25, 0.26, 0.222);
    for (const sx of [-1, 1]) put(g, rbox(0.03, 0.12, 0.02, metal, 0.006), sx * 0.04, 0.3, 0.235);
    for (const sx of [-1, 1]) put(g, rbox(0.04, 1.5, 0.44, walnut, 0.01), sx * 0.49, 1.25, 0);  // sides
    put(g, rbox(1.02, 0.06, 0.46, walnut, 0.015), 0, 2.02, 0);                                // top
    put(g, rbox(0.96, 1.48, 0.02, back, 0.005), 0, 1.25, -0.2);                               // back panel
    for (const y of CAB.shelves.slice(0, 2)) put(g, rbox(0.94, 0.02, 0.38, mat('#CFE3EE', { roughness: 0.08, metalness: 0.2 }), 0.004), 0, y - 0.01, 0);
    const led = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); lampBulbs.push(led);
    put(g, rbox(0.9, 0.012, 0.03, led, 0.004), 0, 1.97, 0.15);
    const glassF = new THREE.MeshStandardMaterial({ color: '#D8ECF7', transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.2, depthWrite: false });
    const gl = put(g, new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.48, 0.01), glassF), 0, 1.25, 0.215); gl.renderOrder = 4;
    put(g, rbox(0.012, 1.48, 0.02, metal, 0.004), 0, 1.25, 0.222);
    trophyG.position.copy(g.position); trophyG.rotation.y = CAB.ry;
  }
}
