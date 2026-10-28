// Wall clock, framed art, bookshelf, sofa corner and the globe.
import * as THREE from 'three';
import { PRO, rand, randInt, tint } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox, rug, toonMat } from '../../scene/blocks.js';
import { potPlant, woodDark, woodMid } from '../terrace.js';
import { LAY } from '../layout.js';

/* wall clock (real time) */
export const clockG = new THREE.Group();
const hand = (len, w, color) => { const p = new THREE.Group(); p.position.z = 0.05; clockG.add(p); put(p, new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color })), 0, len / 2 - 0.03, 0); return p; };
export let hourHand;
export let minHand;
export let secHand;
let posterTex;
/* bookshelf with decor on top */
const BOOK_COLORS = ['#C8553D', '#F28F3B', '#588B8B', '#2F4858', '#FFD166', '#8E5BB5', '#6A8042', '#E07A5F', '#3D5A80', '#EDE6D6'];
// A 3.7 m wall shelf full of books (w narrows it), back against the wall behind it, plants on top.
function makeShelf(x, z, ry = 0, w = 3.7, top = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  put(g, rbox(w, 2.7, 0.08, woodDark, 0.02), 0, 1.35, -0.28);
  put(g, rbox(0.12, 2.7, 0.62, woodDark, 0.03), -w / 2 + 0.03, 1.35, 0);
  put(g, rbox(0.12, 2.7, 0.62, woodDark, 0.03), w / 2 - 0.03, 1.35, 0);
  for (const y of [0.06, 0.92, 1.78, 2.64]) put(g, rbox(w, 0.08, 0.62, woodDark, 0.02), 0, y, 0);
  for (const y of [0.1, 0.96, 1.82]) {
    let bx = -w / 2 + 0.15;
    while (bx < w / 2 - 0.3) {
      const bw = rand(0.1, 0.19), h = rand(0.48, 0.74);
      const b = rbox(bw, h, rand(0.4, 0.5), BOOK_COLORS[randInt(0, BOOK_COLORS.length - 1)], 0.015);
      b.position.set(bx + bw / 2, y + h / 2, 0.02); if (Math.random() < 0.07) b.rotation.z = 0.22; g.add(b);
      bx += bw + rand(0.005, 0.03);
      if (Math.random() < 0.06) { potPlant(bx + 0.2, 0.05, 0.3, 'bush', y, g); bx += 0.42; }
    }
  }
  if (top) { potPlant(-w * 0.32, 0, 0.45, 'monstera', 2.68, g); potPlant(w * 0.3, 0, 0.4, 'snake', 2.68, g); put(g, rbox(0.5, 0.22, 0.34, '#C8B49A', 0.03), 0.1, 2.79, 0); }
  return g;
}
export let shelf;
export function makeSofa(x, z, w, ry = 0, color = '#E3D6BF', pillows = ['#4E7D5B', '#E8742A']) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  const fabric = mat(color, { roughness: 0.95 }), legM = woodDark;
  put(g, rbox(w, 0.3, 0.82, fabric, 0.1), 0, 0.33, 0);
  put(g, rbox(w, 0.66, 0.24, fabric, 0.1), 0, 0.66, -0.3);
  for (const sx of [-1, 1]) put(g, rbox(0.24, 0.5, 0.82, fabric, 0.1), sx * (w / 2 - 0.12), 0.5, 0);
  for (const sx of [-1, 1]) put(g, rbox((w - 0.56) / 2, 0.12, 0.6, mat(tint(color, 0.25), { roughness: 0.95 }), 0.05), sx * (w - 0.56) / 4, 0.53, 0.06);
  put(g, rbox(0.42, 0.36, 0.14, mat(pillows[0]), 0.06), -w / 2 + 0.5, 0.75, -0.12).rotation.z = 0.15;
  put(g, rbox(0.38, 0.34, 0.14, mat(pillows[1]), 0.06), w / 2 - 0.5, 0.74, -0.12).rotation.z = -0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, cyl(0.04, 0.03, 0.18, legM, 8), sx * (w / 2 - 0.15), 0.09, sz * 0.3);
  return g;
}
export let sofaG;
/* globe */
export const globeStand = new THREE.Group();
export const globeTilt = new THREE.Group();
let globeTex;
export let globe;
let meridian;

export function setup() {
   clockG.position.set(LAY.clock[0], LAY.clock[1], LAY.clock[2]);
   clockG.rotation.y = LAY.clock[3];
   scene.add(clockG);
  put(clockG, cyl(0.42, 0.42, 0.07, '#2B2F36', 40), 0, 0, 0).rotation.x = Math.PI / 2;
  put(clockG, new THREE.Mesh(new THREE.CircleGeometry(0.35, 40), new THREE.MeshBasicMaterial({ color: '#FBF8F0' })), 0, 0, 0.04);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; put(clockG, new THREE.Mesh(new THREE.CircleGeometry(i % 3 ? 0.014 : 0.024, 8), new THREE.MeshBasicMaterial({ color: '#2B2F36' })), Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.045); }
  hourHand = hand(0.2, 0.045, '#2B2F36'); minHand = hand(0.29, 0.03, '#2B2F36'); secHand = hand(0.31, 0.012, '#E8730E');
  /* framed art on the left wall */
  posterTex = canvasTex(256, 320, (g) => {
    g.fillStyle = '#FFF5DF'; g.fillRect(0, 0, 256, 320);
    g.fillStyle = '#E8730E'; g.beginPath(); g.arc(128, 135, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#E8730E'; g.lineWidth = 10; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 80, 135 + Math.sin(a) * 80); g.lineTo(128 + Math.cos(a) * 102, 135 + Math.sin(a) * 102); g.stroke(); }
    g.fillStyle = '#5F7A35'; g.fillRect(0, 248, 256, 72);
    g.fillStyle = '#FFFADD'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('BAND 8.0', 128, 297);
  });
  if (!PRO) {
    put(scene, rbox(0.06, 1.66, 1.36, '#3B2C20', 0.02), -7.95, 2.45, 4.3);
    put(scene, new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), toonMat({ map: posterTex, roughness: 0.9 })), -7.91, 2.45, 4.3).rotation.y = Math.PI / 2;
    /* shelf with plants above the door */
    put(scene, rbox(0.34, 0.05, 1.5, woodMid, 0.02), -7.82, 3.05, 1.5);
    potPlant(-7.82, 1.1, 0.35, 'bush', 3.08); potPlant(-7.82, 1.9, 0.35, 'snake', 3.08);
  }
  shelf = makeShelf(LAY.shelf[0], LAY.shelf[1], LAY.shelf[2]);
  /* lounge: sofa + coffee table under the clock */
  if (!PRO) rug(-2.1, -4.8, 1.85, 1.8, '#CDBA98');
  sofaG = makeSofa(LAY.sofa[0], LAY.sofa[1], LAY.sofa[2], LAY.sofa[3], PRO ? '#5C6B7F' : '#E3D6BF', PRO ? ['#F2B33D', '#E8742A'] : ['#4E7D5B', '#E8742A']);
  // the round coffee table in front of the sofa (the cat naps on it)
  put(scene, cyl(0.45, 0.45, 0.06, woodMid, 28), LAY.sofa[0], 0.44, LAY.sofa[1] + 1.05);
  put(scene, cyl(0.06, 0.08, 0.42, woodDark, 10), LAY.sofa[0], 0.21, LAY.sofa[1] + 1.05);
  put(scene, rbox(0.3, 0.05, 0.22, '#3D5A80', 0.01), LAY.sofa[0] - 0.1, 0.495, LAY.sofa[1] + 1.1).rotation.y = 0.4;
  put(scene, cyl(0.055, 0.05, 0.1, '#FFFFFF'), LAY.sofa[0] + 0.2, 0.52, LAY.sofa[1] + 0.95);
   globeStand.position.set(LAY.globe[0], 0, LAY.globe[1]);
   scene.add(globeStand);
  put(globeStand, cyl(0.32, 0.38, 0.1, woodDark), 0, 0.05, 0);
  put(globeStand, cyl(0.035, 0.035, 0.95, mat('#B08D57', { metalness: 0.6, roughness: 0.35 })), 0, 0.55, 0);
   globeTilt.position.y = 1.4;
   globeTilt.rotation.z = 0.38;
   globeStand.add(globeTilt);
  globeTex = canvasTex(256, 128, (g) => { g.fillStyle = '#4C9BE0'; g.fillRect(0, 0, 256, 128); for (let i = 0; i < 16; i++) { g.fillStyle = i % 4 ? '#79BB57' : '#E5C783'; g.beginPath(); g.ellipse(rand(0, 256), rand(20, 108), rand(10, 32), rand(6, 18), rand(0, 3), 0, Math.PI * 2); g.fill(); } });
  globe = new THREE.Mesh(new THREE.SphereGeometry(0.44, 32, 24), toonMat({ map: globeTex, roughness: 0.35 }));
  globe.castShadow = true;
   globeTilt.add(globe);
  meridian = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 40, Math.PI * 1.15), mat('#B08D57', { metalness: 0.6, roughness: 0.35 }));
  meridian.rotation.set(0, Math.PI / 2, -0.45);
   globeTilt.add(meridian);
}
