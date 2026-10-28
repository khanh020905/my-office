// The aquarium.
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { nightHooks, pr, prPick } from './trinkets.js';

export let AQ;
export const weeds = [];
const water = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.66, 0.5), new THREE.MeshStandardMaterial({ color: '#56AED6', transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }));
const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.56), new THREE.MeshStandardMaterial({ color: '#D8F2FF', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false }));
export const aqLight = new THREE.MeshBasicMaterial({ color: new THREE.Color('#BFE8FF') });
export const fishes = [];
const bubbleGeo = new THREE.SphereGeometry(0.014, 6, 4), bubbleM = new THREE.MeshBasicMaterial({ color: '#E8F8FF', transparent: true, opacity: 0.7 });
export let bubbles;

export function setup() {
  /* aquarium on a low cabinet along the open front edge */
  AQ = { x: LAY.aq[0], z: LAY.aq[1] };
  put(scene, rbox(2.15, 0.72, 0.62, mat('#5B4636', { roughness: 0.7 }), 0.04), AQ.x, 0.36, AQ.z);
  put(scene, new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.06, 0.5), mat('#E6D3A0', { roughness: 0.95 })), AQ.x, 0.76, AQ.z);
  for (const [ox, s, c] of [[-0.6, 0.09, '#8A8F98'], [-0.45, 0.06, '#6F747C'], [0.55, 0.08, '#9AA0A8']]) put(scene, new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(c, { roughness: 0.9 })), AQ.x + ox, 0.8, AQ.z - 0.05);
  for (let i = 0; i < 9; i++) { const h = 0.25 + pr() * 0.3, w = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 5).translate(0, h / 2, 0), mat(prPick(['#3E8E4A', '#5DAA52', '#2F7A44']), { roughness: 0.8 })); w.position.set(AQ.x - 0.85 + pr() * 1.7, 0.79, AQ.z - 0.15 + pr() * 0.3); scene.add(w); weeds.push({ w, ph: pr() * 6 }); }
  water.position.set(AQ.x, 1.06, AQ.z);
   water.renderOrder = 3;
   scene.add(water);
  glass.position.set(AQ.x, 1.12, AQ.z);
   glass.renderOrder = 4;
   scene.add(glass);
  // a thin black frame on the glass edges, so the tank reads as a tank and not a floating lid
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(scene, rbox(0.03, 0.8, 0.03, '#23272E', 0.005), AQ.x + sx * 0.99, 1.12, AQ.z + sz * 0.27);
  for (const sz of [-1, 1]) put(scene, rbox(2.0, 0.03, 0.03, '#23272E', 0.005), AQ.x, 0.735, AQ.z + sz * 0.27);
  put(scene, rbox(2.06, 0.05, 0.6, mat('#23272E', { roughness: 0.5 }), 0.01), AQ.x, 1.545, AQ.z);
  put(scene, new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.015, 0.06), aqLight), AQ.x, 1.515, AQ.z);
  nightHooks.push((on) => aqLight.color.set(on ? new THREE.Color(1.4, 2.0, 2.4) : '#BFE8FF'));
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(), c = prPick(['#FF8C42', '#FFD166', '#4CC9F0', '#F72585', '#FFFFFF', '#FF6B6B']);
    const fm = mat(c, { roughness: 0.35 });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8).scale(1.5, 0.95, 0.5), fm));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.35), fm); tail.position.x = -0.085; g.add(tail);
    scene.add(g); fishes.push({ g, tail, ph: pr() * 6, sp: 0.35 + pr() * 0.35, ax: 0.55 + pr() * 0.3, ay: 0.08 + pr() * 0.14, y0: 0.95 + pr() * 0.3, az: 0.06 + pr() * 0.1 });
  }
  bubbles = Array.from({ length: 10 }, (_, i) => { const b = new THREE.Mesh(bubbleGeo, bubbleM); b.position.set(AQ.x + 0.7, 0.8 + i * 0.07, AQ.z); scene.add(b); return b; });
}
