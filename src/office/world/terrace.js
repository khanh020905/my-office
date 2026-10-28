// The terrace around the office: tiles, glass railing, bollards, planters, potted plants, seating.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from '../core/state.js';
import { HQ, PRO, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../scene/blocks.js';

/* ---------- room shell ---------- */
export const BULB_OFF = new THREE.Color('#EDE6D6'), BULB_ON = new THREE.Color(3.4, 2.6, 1.45);
export let metal;
export let woodDark;
export let woodMid;
let leafMats;
let tileTex;
let terrace;
const railGlass = new THREE.MeshStandardMaterial({ color: '#B5D3F0', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2, depthWrite: false });
function railing(x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
  const g = new THREE.Group(); g.position.set((x1 + x2) / 2, -0.27, (z1 + z2) / 2); g.rotation.y = -ang; scene.add(g);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.03), railGlass); glass.position.y = 0.52; g.add(glass);
  put(g, rbox(len, 0.06, 0.09, metal, 0.02), 0, 0.99, 0);
  const posts = Math.max(1, Math.round(len / 2.2));
  for (let i = 0; i <= posts; i++) put(g, rbox(0.07, 1.02, 0.07, metal, 0.01), -len / 2 + (i * len) / posts, 0.5, 0);
}
export const bollards = [];
function bollard(x, z) {
  put(scene, cyl(0.09, 0.11, 0.55, metal, 12), x, 0.0, z);
  const m = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); bollards.push(m);
  put(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12), m), x, 0.3, z);
}
/* plants: monstera, snake plant, round bush, small tree */
export function potPlant(x, z, s = 1, kind = 'bush', y = 0, parent = scene) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  const pot = cyl(0.24, 0.18, 0.4, mat('#E4DDD0', { roughness: 0.45 }), 20); pot.position.y = 0.2; g.add(pot);
  put(g, cyl(0.25, 0.25, 0.04, '#D3CBBC', 20), 0, 0.4, 0);
  put(g, cyl(0.21, 0.21, 0.02, '#4A3527', 16), 0, 0.415, 0);
  const leaf = (geo, m, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) => { const l = new THREE.Mesh(geo, m); l.position.set(px, py, pz); l.rotation.set(rx, ry, rz); l.scale.set(sx, sy, sz); l.castShadow = true; g.add(l); return l; };
  if (kind === 'monstera') {
    const lg = new THREE.SphereGeometry(0.22, 14, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2), h = rand(0.5, 1.0), r = 0.1 + h * 0.33;
      leaf(new THREE.CylinderGeometry(0.012, 0.016, h, 5), leafMats[2], Math.sin(a) * r * 0.45, 0.42 + h / 2, Math.cos(a) * r * 0.45, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
      leaf(lg, leafMats[i % 2], Math.sin(a) * r, 0.42 + h, Math.cos(a) * r, Math.cos(a) * 0.7, a, -Math.sin(a) * 0.15, 1, 0.1, 0.78);
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 11; i++) { const a = rand(0, Math.PI * 2), r = rand(0, 0.12), h = rand(0.5, 1.0); leaf(new THREE.ConeGeometry(0.055, h, 4), leafMats[i % 3], Math.sin(a) * r, 0.42 + h / 2, Math.cos(a) * r, rand(-0.18, 0.18), a, rand(-0.18, 0.18), 1, 1, 0.35); }
  } else if (kind === 'tree') {
    leaf(new THREE.CylinderGeometry(0.05, 0.07, 1.3, 8), woodDark, 0, 1.05, 0, 0, 0, 0);
    for (let i = 0; i < 7; i++) { const a = rand(0, Math.PI * 2); leaf(new THREE.IcosahedronGeometry(0.42, 1), leafMats[i % 4], Math.sin(a) * rand(0.05, 0.3), 1.75 + rand(-0.15, 0.35), Math.cos(a) * rand(0.05, 0.3), rand(0, 3), rand(0, 3), 0, 1, 0.85, 1); }
  } else {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; leaf(new THREE.IcosahedronGeometry(0.2, 1), leafMats[i % 4], Math.sin(a) * 0.15, 0.62 + (i % 2) * 0.12, Math.cos(a) * 0.15, a, a, 0, 1, 1.2, 1); }
    leaf(new THREE.IcosahedronGeometry(0.22, 1), leafMats[1], 0, 0.86, 0, 0, 0, 0);
  }
  return g;
}
function planter(x, z, kind = 'tree') {
  put(scene, rbox(1.0, 0.5, 1.0, mat('#4A4F57', { roughness: 0.7 }), 0.05), x, -0.02, z);
  put(scene, rbox(0.9, 0.04, 0.9, mat('#3E2C20'), 0.02), x, 0.24, z);
  potPlant(x, z, 1.25, kind, -0.15);
}
export let skyNight;
export let skyDay;
export const cr = () => { state.envSeed = (state.envSeed + 0x6D2B79F5) | 0; let t = Math.imul(state.envSeed ^ (state.envSeed >>> 15), 1 | state.envSeed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const cR = (a, b) => a + cr() * (b - a), cI = (a, b) => Math.floor(cR(a, b + 1)), cPick = (a) => a[Math.floor(cr() * a.length)];
export const GY = -0.58;
export const colorize = (g, c) => { const col = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
export const boxAt = (w, h, d, x, y, z, c) => colorize(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
export const mergeAll = (list) => mergeGeometries(list.some((g) => !g.index) ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
export const mergedTo = (G, list, m, shadow = true) => { if (!list.length) return null; const o = new THREE.Mesh(mergeAll(list), m); o.castShadow = shadow; o.receiveShadow = true; G.add(o); return o; };
export const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...o });

export function setup() {
  metal = mat('#2B2F36', { roughness: 0.35, metalness: 0.65 });
  woodDark = mat('#6E4B32', { roughness: 0.6 }); woodMid = mat('#9A6E48', { roughness: 0.55 });
  leafMats = ['#4E8A3A', '#62A04A', '#3C7432', '#78B256'].map((c) => mat(c, { roughness: 0.5 }));
  // Terrace around the two open sides: stone tiles, glass railing, planters, bollard lights.
  tileTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2B3038'; g.fillRect(0, 0, w, h);
    const n = 8, sz = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = `hsl(216, 9%, ${25 + rand(-3, 3)}%)`; g.fillRect(i * sz + 2, j * sz + 2, sz - 4, sz - 4); }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
   tileTex.repeat.set(PRO ? 7 : 6, HQ ? 11 : PRO ? 6 : 5);
  // headquarters: the terrace runs on round the wing (front edge at z 28.7 instead of 11.7)
  terrace = new THREE.Mesh(HQ ? new THREE.BoxGeometry(24.6, 0.3, 37.2) : PRO ? new THREE.BoxGeometry(24.6, 0.3, 20.2) : new THREE.BoxGeometry(21, 0.3, 17.4), mat('#3A3F47', { map: tileTex, roughness: 0.85 }));
  if (HQ) terrace.position.set(3.4, -0.42, 10.1); else if (PRO) terrace.position.set(3.4, -0.42, 1.6); else terrace.position.set(1.6, -0.42, 2.0);
   terrace.receiveShadow = true;
   scene.add(terrace);
  const FZ = HQ ? 28.5 : 11.5;   // the terrace's front railing
  if (PRO) { railing(15.5, -8.4, 15.5, FZ); railing(-8.8, FZ, 15.5, FZ); } else { railing(11.9, -6.8, 11.9, 10.5); railing(-8.8, 10.5, 11.9, 10.5); }
  for (const [x, z] of PRO ? [[15.0, -5.5], [15.0, 0.5], [15.0, 6.5], ...(HQ ? [[15.0, 12.5], [15.0, 18.5], [15.0, 24.5]] : []), [-5, FZ - 0.5], [1, FZ - 0.5], [8.5, FZ - 0.5]] : [[11.3, -4.5], [11.3, 1.5], [11.3, 7.5], [-5, 9.9], [1, 9.9], [7, 9.9]]) bollard(x, z);
  if (PRO) { planter(14.9, -7.7, 'tree'); planter(14.9, 3.4, 'bush'); if (HQ) { planter(14.9, 14.6, 'bush'); planter(14.9, 21.6, 'tree'); } planter(-7.9, FZ - 0.7, 'tree'); planter(4.6, FZ - 0.7, 'bush'); planter(14.9, FZ - 0.7, 'tree'); }
  else { planter(10.8, -5.6, 'tree'); planter(10.8, 4.6, 'tree'); planter(-7.2, 9.4, 'tree'); planter(4.2, 9.4, 'bush'); }
  /* outdoor seating on the terrace */
  (function outdoorSet(x, z) {
    put(scene, cyl(0.45, 0.45, 0.05, '#E9E4DA', 24), x, 0.42, z);
    put(scene, cyl(0.05, 0.06, 0.66, metal, 8), x, 0.06, z);
    for (const a of [0.6, 2.4, 4.2]) {
      const cx = x + Math.sin(a) * 0.85, cz = z + Math.cos(a) * 0.85;
      const c = new THREE.Group(); c.position.set(cx, -0.27, cz); c.rotation.y = a + Math.PI; scene.add(c);
      put(c, rbox(0.46, 0.06, 0.44, mat('#C9A27A'), 0.03), 0, 0.48, 0);
      put(c, rbox(0.46, 0.42, 0.05, mat('#C9A27A'), 0.03), 0, 0.72, -0.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(c, cyl(0.02, 0.02, 0.46, metal, 6), sx * 0.19, 0.23, sz * 0.18);
    }
  })(...(HQ ? [11.6, 27.3] : PRO ? [11.6, 10.3] : [9.9, 0.9]));
  /* surroundings: three backdrops (city, countryside, beach), each built on first use into its own group, one shown at a
     time. Shared helpers: a seeded random (same layout on every load), vertex-coloured shapes merged per material. */
  skyNight = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#060A16'); gr.addColorStop(0.55, '#121B36'); gr.addColorStop(1, '#2A3560'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  skyDay = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6F9DCC'); gr.addColorStop(0.6, '#B5CCE0'); gr.addColorStop(1, '#E2EAF0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.background = skyNight;
  scene.fog = new THREE.Fog(new THREE.Color('#16223E'), 40, 96);
  state.envSeed = 20261026;
}
