// The deploy rocket on its launch pad.
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';

export let ROCKET_HOME;
const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: '#FFD166' }));
export const rocket = new THREE.Group();

export function setup() {
  ROCKET_HOME = new THREE.Vector3(LAY.rocket[0], 0.12, LAY.rocket[1]);
  put(scene, cyl(0.55, 0.6, 0.12, '#3A3F48', 28), ROCKET_HOME.x, 0.06, ROCKET_HOME.z);
  padRing.rotation.x = Math.PI / 2;
   put(scene, padRing, ROCKET_HOME.x, 0.125, ROCKET_HOME.z);
   scene.add(rocket);
   rocket.position.copy(ROCKET_HOME);
  put(rocket, cyl(0.2, 0.22, 0.8, mat('#F7F3EA', { roughness: 0.35, metalness: 0.2 })), 0, 0.55, 0);
  put(rocket, new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 20), mat('#E8730E', { roughness: 0.4 })), 0, 1.14, 0).castShadow = true;
  for (let k = 0; k < 3; k++) { const fin = rbox(0.05, 0.32, 0.22, '#C8553D', 0.01); const a = (k * 2 * Math.PI) / 3; fin.position.set(Math.sin(a) * 0.22, 0.26, Math.cos(a) * 0.22); fin.rotation.y = a; rocket.add(fin); }
  put(rocket, new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), mat('#7EC8E3', { roughness: 0.1, metalness: 0.3 })), 0, 0.7, 0.19);
}
