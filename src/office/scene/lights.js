// Sun, sky light and the room lamps (per-room night lighting on the company floor).
import * as THREE from 'three';
import { HQ, PRO, small } from '../core/env.js';
import { scene } from './renderer.js';

/* ---------- lights ---------- */
export const hemi = new THREE.HemisphereLight('#FFF4DC', '#A9B98A', 1.45);
export const sun = new THREE.DirectionalLight('#FFF0D6', 1.95);
let sm;
export let lamps;
export let ROOM_LAMPS;

export function setup() {
  scene.add(hemi);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sm = small.matches ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, HQ ? { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 } : PRO ? { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 70 } : { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60 });
  if (PRO) { const tz = HQ ? 9 : 0.5; sun.position.set(13, 18, tz + 8.5); sun.target.position.set(3, 0, tz); scene.add(sun.target); }
  sun.shadow.bias = -0.0004;
   sun.shadow.normalBias = 0.02;
  scene.add(sun);
  lamps = (PRO ? [[2.4, 2.8, 3.6], [-5.4, 2.6, -5.4], [0.2, 2.6, -5.5], [5.8, 2.6, -5.5], [11.3, 2.6, -4.0], [11.3, 2.6, 4.4], [-5.8, 2.6, 3.3], [-5.8, 2.6, -1.0],
    ...(HQ ? [[-2.85, 2.7, 18.4], [9.15, 2.7, 18.4]] : [])]
    : [[0, 2.8, 0.3], [-5.5, 2.4, 4.0], [5.5, 2.6, -3.4], [5.2, 2.6, 2.4], [-5.2, 2.6, -3.6]]).map(([x, y, z]) => {
    const l = new THREE.PointLight('#FFC27A', 0, 8, 1); l.position.set(x, y, z); scene.add(l); return l;
  });
  // pro: after dark each room's light follows its people: full while someone is in, a low night light once it empties
  // (the lobby keeps a brighter one). Same lights as before, only their intensity moves, so it costs nothing.
  // headquarters: one more light for each side of the wing (two department rooms each)
  ROOM_LAMPS = PRO ? [[-3.6, 8.6, -1.6, 9], [-8, -2.6, -8, -3], [-2.6, 3, -8, -3], [3, 8.6, -8, -3], [8.6, 14, -8, 0.6], [8.6, 14, 0.6, 9], [-8, -3.6, 0.55, 5.4], [-8, -3.6, -3, 0.55],
    ...(HQ ? [[-8, 2.3, 10.8, 26], [4.3, 14, 10.8, 26]] : [])]
    .map(([x0, x1, z0, z1], i) => ({ x0, x1, z0, z1, l: lamps[i], low: i === 6 ? 1.6 : 0.45, busy: false })) : [];
}
