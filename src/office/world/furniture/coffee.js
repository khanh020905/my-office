// The coffee corner (the pantry counter on the company floor).
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put, rbox } from '../../scene/blocks.js';
import { metal, potPlant } from '../terrace.js';
import { LAY } from '../layout.js';

/* coffee corner: cabinet, machine, mugs, donuts (on the pantry counter in the pro plan); built around its group,
   the side people use facing -z */
export const coffeeG = new THREE.Group();
export const coffeeLed = new THREE.MeshBasicMaterial({ color: '#FF6B4A' });
export let STEAM_AT;

export function setup() {
   coffeeG.position.set(LAY.coffee[0], 0, LAY.coffee[1]);
   coffeeG.rotation.y = LAY.coffee[2];
   scene.add(coffeeG);
  put(coffeeG, rbox(2.9, 0.92, 0.75, mat(PRO ? '#E6E1D8' : '#3F5A46', { roughness: 0.7 }), 0.04), 0, 0.46, 0);
  for (const x of [-1, 0, 1]) put(coffeeG, rbox(0.9, 0.7, 0.02, mat(PRO ? '#D9D2C6' : '#47654F', { roughness: 0.7 }), 0.02), x, 0.47, 0.38);
  for (const x of [-1, 0, 1]) put(coffeeG, rbox(0.2, 0.03, 0.03, metal, 0.01), x, 0.7, 0.4);
  put(coffeeG, rbox(3.0, 0.07, 0.84, mat(PRO ? '#3B3F46' : '#ECE6DA', { roughness: 0.35 }), 0.03), 0, 0.955, 0);
  put(coffeeG, rbox(0.52, 0.62, 0.46, mat('#24282F', { roughness: 0.35, metalness: 0.4 }), 0.06), -0.85, 1.3, 0.08);
  put(coffeeG, rbox(0.3, 0.05, 0.14, metal, 0.02), -0.85, 1.17, -0.2);
  put(coffeeG, cyl(0.06, 0.06, 0.08, '#FFFFFF'), -0.85, 1.06, -0.18);
  put(coffeeG, new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), coffeeLed), -0.69, 1.5, -0.15);
  for (let k = 0; k < 3; k++) put(coffeeG, cyl(0.065, 0.06, 0.13, ['#FFFFFF', '#FFE787', '#BFDDF7'][k]), -0.05 + k * 0.22, 1.06, 0.12);
  put(coffeeG, cyl(0.25, 0.25, 0.03, '#FFFFFF', 24), 0.95, 1.005, 0);
  for (let k = 0; k < 3; k++) { const dn = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.04, 8, 16), mat(['#E8A0B4', '#8B5A3C', '#FFD166'][k])); dn.rotation.x = Math.PI / 2; put(coffeeG, dn, 0.89 + k * 0.11, 1.05, -0.06 + (k % 2) * 0.12); }
  potPlant(1.4, 0.05, 0.35, 'snake', 0.99, coffeeG);
  coffeeG.updateMatrixWorld(true);
  STEAM_AT = coffeeG.localToWorld(new THREE.Vector3(-0.85, 1.16, -0.18));   // where the brew steams
}
