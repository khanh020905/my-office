// The printer that prints a page when a session finishes.
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { sfx } from '../../audio/sfx.js';

export let PRN;
export const prnLed = new THREE.MeshBasicMaterial({ color: '#3DDC84' });
export const paperM = new THREE.MeshStandardMaterial({ color: '#FBFBF7', roughness: 0.9, side: THREE.DoubleSide, transparent: true });
export let paper;
export const printQueue = { n: 0, t: -1, keep: false };
export function printPage() { printQueue.n = Math.min(printQueue.n + 1, 3); sfx.play('print'); }

export function setup() {
  /* printer: a page slides out every time a session finishes its turn */
  PRN = { x: LAY.prn[0], z: LAY.prn[1] };
  put(scene, rbox(0.72, 0.72, 0.56, mat('#D9D4C7', { roughness: 0.7 }), 0.03), PRN.x, 0.36, PRN.z);
  put(scene, rbox(0.6, 0.26, 0.44, mat('#ECEFF2', { roughness: 0.4 }), 0.05), PRN.x, 0.85, PRN.z);
  put(scene, rbox(0.46, 0.03, 0.16, mat('#C9CED6', { roughness: 0.4 }), 0.01), PRN.x, 0.8, PRN.z + 0.28).rotation.x = -0.15;
  put(scene, new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), prnLed), PRN.x + 0.22, 0.95, PRN.z + 0.2);
  paper = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4).rotateX(-Math.PI / 2), paperM);
   paper.visible = false;
   scene.add(paper);
}
