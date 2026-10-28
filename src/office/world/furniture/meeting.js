// The meeting table and its chairs.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put, rbox } from '../../scene/blocks.js';
import { metal, potPlant, woodDark } from '../terrace.js';
import { officeChair } from '../desks.js';

export let MEET;
let meetChairM;
export let MEET_SEATS;

export function setup() {
  /* meeting room: cozy, a round wood table and four upholstered chairs; pro, a long table for seven behind glass */
  MEET = PRO ? { x: 0.2, z: -5.6 } : { x: 5.2, z: 2.4 };
  meetChairM = mat(PRO ? '#3C4656' : '#4E7D5B', { roughness: 0.95 });
  if (PRO) {
    put(scene, rbox(3.6, 0.07, 1.3, mat('#F2EFEA', { roughness: 0.4 }), 0.03), MEET.x, 0.76, MEET.z);
    for (const sx of [-1, 1]) { put(scene, rbox(0.1, 0.72, 0.9, metal, 0.02), MEET.x + sx * 1.35, 0.37, MEET.z); put(scene, rbox(0.5, 0.03, 0.95, metal, 0.01), MEET.x + sx * 1.35, 0.015, MEET.z); }
    put(scene, rbox(0.28, 0.05, 0.28, '#2B2F36', 0.02), MEET.x, 0.82, MEET.z);   // conference phone
    for (const [dx, dz] of [[-1.0, 0.4], [0.3, 0.42], [1.2, -0.38], [-0.5, -0.4]]) put(scene, rbox(0.3, 0.012, 0.22, '#FBFBF7', 0.004), MEET.x + dx, 0.802, MEET.z + dz).rotation.y = dx * 0.3;
    for (const [dx, dz] of [[-0.75, 0.3], [0.55, -0.32], [1.55, 0.3]]) put(scene, cyl(0.035, 0.03, 0.12, '#BFE3F2'), MEET.x + dx, 0.86, MEET.z + dz);
    potPlant(MEET.x - 0.9, MEET.z - 0.1, 0.28, 'bush', 0.8);
    const seat = (x, z, face, node) => ({ x, z, face, node, sit: true, by: null });
    MEET_SEATS = [seat(-0.95, -4.35, Math.PI, 'MTi'), seat(0.2, -4.35, Math.PI, 'MTi'), seat(1.35, -4.35, Math.PI, 'MTi'),
      seat(-0.95, -6.85, 0, 'MTb'), seat(0.2, -6.85, 0, 'MTb'), seat(1.35, -6.85, 0, 'MTb'), seat(-2.15, -5.6, Math.PI / 2, 'MTf')];
    for (const s of MEET_SEATS) { const c = officeChair(scene, s.x, s.z, meetChairM); c.rotation.y = s.face; }
  } else {
    put(scene, cyl(1.02, 1.02, 0.08, mat('#A87B52', { roughness: 0.45 }), 48), MEET.x, 0.76, MEET.z);
    put(scene, cyl(0.12, 0.18, 0.7, woodDark), MEET.x, 0.36, MEET.z);
    put(scene, cyl(0.5, 0.55, 0.05, woodDark), MEET.x, 0.03, MEET.z);
    potPlant(MEET.x + 0.25, MEET.z - 0.2, 0.32, 'bush', 0.8);
    put(scene, rbox(0.42, 0.02, 0.3, '#FBFBF7', 0.01), MEET.x - 0.35, 0.81, MEET.z + 0.25).rotation.y = -0.4;
    put(scene, cyl(0.06, 0.055, 0.12, '#7EC8E3'), MEET.x - 0.05, 0.86, MEET.z + 0.45);
    const seatSpot = (a, node) => { const x = MEET.x + Math.sin(a) * 1.35, z = MEET.z + Math.cos(a) * 1.35; return { x, z, face: Math.atan2(MEET.x - x, MEET.z - z), node, sit: true, by: null }; };
    MEET_SEATS = [seatSpot(Math.PI, 'P'), seatSpot(-Math.PI / 2, 'GR2'), seatSpot(Math.PI / 2, 'P'), seatSpot(0, 'M')];
    for (const s of MEET_SEATS) {
      const c = new THREE.Group(); c.position.set(s.x, 0, s.z); c.rotation.y = s.face; scene.add(c);
      put(c, rbox(0.52, 0.12, 0.5, meetChairM, 0.05), 0, 0.44, 0);
      const back = rbox(0.52, 0.5, 0.1, meetChairM, 0.05); back.position.set(0, 0.72, -0.24); back.rotation.x = -0.12; c.add(back);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(c, cyl(0.025, 0.02, 0.4, woodDark, 6), sx * 0.2, 0.2, sz * 0.19);
    }
  }
}
