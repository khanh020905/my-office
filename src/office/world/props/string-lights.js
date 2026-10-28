// String lights along the top of the walls.
import * as THREE from 'three';
import { PRO, SEASON } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { dotTex } from '../backdrops/city.js';
import { LAY } from '../layout.js';
import { nightHooks } from './trinkets.js';

/* string lights along the top of the two walls, on at night */
const C3 = (r, g, b) => new THREE.Color(r, g, b);
let BULBS;
const bulbPos = [];
const bulbCol = [];
let warm;
let strand;

export function setup() {
  BULBS = { halloween: [C3(2.9, 1.3, 0.25), C3(1.7, 0.6, 2.7), C3(2.9, 1.3, 0.25), C3(2.0, 2.4, 0.4)], noel: [C3(2.8, 0.45, 0.45), C3(0.5, 2.5, 0.9), C3(2.9, 2.2, 0.9), C3(2.5, 2.5, 2.7)],
    tet: [C3(2.9, 0.4, 0.35), C3(2.9, 2.1, 0.6)] };
  warm = BULBS[SEASON] || [C3(2.6, 1.8, 0.9), C3(2.4, 1.2, 1.5), C3(1.4, 2.2, 2.6), C3(2.8, 2.2, 1.2)];
  { const B = LAY.box, xEnd = PRO ? B.x1 - 0.3 : 3.4;
    for (let x = B.x0 + 0.3; x <= xEnd; x += 0.32) { const f = ((x - B.x0 - 0.3) % 1.6) / 1.6; bulbPos.push(x, 3.98 - Math.sin(f * Math.PI) * 0.16, B.z0 + 0.1); const c = warm[(bulbPos.length / 3) % warm.length]; bulbCol.push(c.r, c.g, c.b); }
    for (let z = B.z0 + 0.4; z <= B.z1 - 0.2; z += 0.32) { const f = ((z - B.z0 - 0.4) % 1.6) / 1.6; bulbPos.push(B.x0 + 0.1, 3.98 - Math.sin(f * Math.PI) * 0.16, z); const c = warm[(bulbPos.length / 3) % warm.length]; bulbCol.push(c.r, c.g, c.b); } }
  strand = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3)).setAttribute('color', new THREE.Float32BufferAttribute(bulbCol, 3)),
    new THREE.PointsMaterial({ map: dotTex, size: 6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  strand.visible = false;
   scene.add(strand);
  nightHooks.push((on) => { strand.visible = on; });
}
