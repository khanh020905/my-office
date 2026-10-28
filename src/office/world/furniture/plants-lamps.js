// Room plants and floor lamps.
import * as THREE from 'three';
import { HQ, PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { lamps } from '../../scene/lights.js';
import { cyl, lampBulbs, mat, put } from '../../scene/blocks.js';
import { BULB_OFF, metal, potPlant } from '../terrace.js';

export let roomPlants;
/* floor lamps: warm glow at night */
function floorLamp(x, z, h = 2.1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  put(g, cyl(0.22, 0.26, 0.06, metal), 0, 0.03, 0);
  put(g, cyl(0.03, 0.03, h, metal, 8), 0, h / 2, 0);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.38, 24, 1, true), mat('#F6E3BE', { side: THREE.DoubleSide, roughness: 0.9 }));
  shade.castShadow = true; put(g, shade, 0, h + 0.1, 0);
  const bulbM = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); lampBulbs.push(bulbM); g.userData.bulb = lampBulbs.length - 1;
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bulbM), 0, h - 0.02, 0);
  return g;
}
export let floorLampGroups;

export function setup() {
  /* room plants */
  roomPlants = PRO
    ? [potPlant(13.55, 7.3, 1.2, 'monstera'), potPlant(-3.15, -7.5, 1.0, 'monstera'), potPlant(-4.1, 4.95, 0.95, 'snake'), HQ ? potPlant(-1.25, 8.6, 0.9, 'bush') : potPlant(-2.0, 8.55, 0.95, 'bush'),
      potPlant(8.2, -3.55, 0.9, 'snake'), potPlant(2.65, -7.55, 0.85, 'monstera'), potPlant(13.55, -2.9, 0.95, 'bush'), HQ ? potPlant(8.28, 8.72, 0.7, 'snake') : potPlant(7.95, 8.55, 1.0, 'snake')]   // headquarters: clear of the wing's doors
    : [potPlant(7.3, 5.3, 1.25, 'monstera'), potPlant(2.75, -5.4, 1.05, 'monstera'), potPlant(-7.45, 5.45, 0.95, 'snake'), potPlant(7.4, -1.4, 1.0, 'bush'),
      potPlant(-3.6, -5.5, 0.9, 'snake')];
  floorLampGroups = PRO ? [floorLamp(-7.5, -5.45), floorLamp(6.25, -4.75, 1.7), floorLamp(13.6, 4.4), floorLamp(-7.6, 1.6)]
    : [floorLamp(-0.75, -5.45), floorLamp(7.55, 3.9), floorLamp(-7.4, 3.3)];
  for (const [x, y, z] of PRO ? [[-6.9, 2.2, -5.4], [6.25, 1.9, -4.4], [12.9, 2.2, 4.6], [-7.1, 2.2, 1.9], [3.4, 1.6, HQ ? 27.2 : 10.2]] : [[-1.5, 2.3, -4.6], [-6.2, 2.2, 4.6], [9.8, 1.6, 1.2]]) { const l = new THREE.PointLight('#FFB866', 0, 7, 1.3); l.position.set(x, y, z); scene.add(l); lamps.push(l); }
}
