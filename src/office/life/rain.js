// Umbrellas and a wet-floor sign when it rains.
import * as THREE from 'three';
import { PRO, SEASON, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, fitText, mat, put, rbox } from '../scene/blocks.js';
import { metal } from '../world/terrace.js';
import { seasonFx } from './seasons.js';
import { night } from '../world/room-update.js';
import { t as tr } from '../../i18n/index.js';

let RAIN_AT;
export const rainKit = new THREE.Group();
export function updateSeason(dt, t) {
  const B = seasonFx.bats;
  if (B) {
    const M = new THREE.Matrix4(), W = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    B.list.forEach((b, i) => {
      const a = b.ph + t * b.sp, x = b.x + Math.cos(a) * b.r, z = b.z + Math.sin(a) * b.r * 0.7, y = b.y + Math.sin(t * 1.7 + b.ph) * 0.18;
      const yaw = Math.atan2(-Math.sin(a) * b.r * b.sp, Math.cos(a) * b.r * 0.7 * b.sp), flap = Math.sin(t * 17 + b.ph * 3) * 0.85;
      M.compose(p.set(x, y, z), q.setFromEuler(e.set(0, yaw, 0)), one); B.body.setMatrixAt(i, M);
      W.makeRotationZ(flap).premultiply(M); B.wingR.setMatrixAt(i, W);
      W.makeRotationZ(-flap).premultiply(M); B.wingL.setMatrixAt(i, W);
    });
    for (const m of [B.body, B.wingR, B.wingL]) m.instanceMatrix.needsUpdate = true;
  }
  const G = seasonFx.ghost;
  if (G) { G.g.position.y = G.y + Math.sin(t * 1.4) * 0.09; G.g.rotation.y = Math.PI / 4 + Math.sin(t * 0.45) * 0.5; G.g.rotation.z = Math.sin(t * 1.1) * 0.08; }
  if (seasonFx.glowM && SEASON === 'noel' && night) seasonFx.glowM.color.setScalar(2.1 + Math.sin(t * 2.2) * 0.45);   // the tree's lights breathe
}

// a yellow A-frame "wet floor" sign (here when it rains, and the cleaner's in the evening: people/staff.js)
let wetTex;
export function wetSign() {
  const g = new THREE.Group();
  wetTex ||= canvasTex(160, 256, (c, w, h) => {
    c.fillStyle = '#F5C518'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1E1E1E'; c.beginPath(); c.moveTo(w / 2, 26); c.lineTo(w - 22, 112); c.lineTo(22, 112); c.closePath(); c.fill();
    c.fillStyle = '#F5C518'; c.font = '900 64px "Be Vietnam Pro", system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('!', w / 2, 102);
    c.fillStyle = '#1E1E1E'; c.font = '800 34px "Be Vietnam Pro", system-ui, sans-serif'; for (const [k, y] of [['life.wetFloor1', 168], ['life.wetFloor2', 208]]) { const s = tr(k); fitText(c, s, w - 16); c.fillText(s, w / 2, y); }
  });
  const yellow = mat('#F5C518', { roughness: 0.5 });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.position.y = 0.62; leaf.rotation.x = s * 0.2; g.add(leaf);
    put(leaf, rbox(0.3, 0.62, 0.015, yellow, 0.01), 0, -0.31, s * 0.008);
    put(leaf, new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.42), mat('#FFFFFF', { map: wetTex, roughness: 0.6 })), 0, -0.3, s * 0.017).rotation.y = s > 0 ? 0 : Math.PI;
  }
  put(g, rbox(0.06, 0.04, 0.05, '#1E1E1E', 0.01), 0, 0.64, 0);
  return g;
}

export function setup() {
  /* ---------- rainy days at the entrance: an umbrella stand always; when it really rains outside (weather on), an open
     umbrella drying on the floor and a yellow "wet floor" sign ---------- */
  RAIN_AT = PRO ? { stand: [-7.62, 4.72], umbrella: [-6.25, 4.12, 0.5], sign: [-4.2, 3.78, 0.6] } : { stand: [-7.6, 2.75], umbrella: [-6.9, 3.2, 0.9], sign: [-5.6, 0.4, 0.4] };
  { const [x, z] = RAIN_AT.stand, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    put(g, cyl(0.13, 0.11, 0.5, mat('#3A3F47', { roughness: 0.45, metalness: 0.3 }), 18), 0, 0.25, 0);
    put(g, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 20).rotateX(Math.PI / 2), metal), 0, 0.5, 0);
    for (const [dx, dz, c, tilt] of [[-0.04, 0.03, '#2F3B52', 0.1], [0.05, -0.02, '#C8283A', -0.14], [0.0, -0.05, '#26292E', 0.05]]) {
      const u = new THREE.Group(); u.position.set(dx, 0.05, dz); u.rotation.set(tilt, 0, -tilt); g.add(u);
      put(u, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.012, 0.62, 8), mat(c, { roughness: 0.7 })), 0, 0.38, 0);
      put(u, cyl(0.006, 0.006, 0.2, metal, 5), 0, 0.78, 0);
      put(u, new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI).rotateZ(Math.PI), mat('#4A3628', { roughness: 0.5 })), 0.035, 0.88, 0);
    } }
   rainKit.visible = false;
   rainKit.userData.noMerge = true;
   scene.add(rainKit);
  { const [x, z, ry] = RAIN_AT.umbrella, u = new THREE.Group(); u.position.set(x, 0, z); u.rotation.y = ry; rainKit.add(u);
    const tilt = new THREE.Group(); tilt.position.y = 0.36; tilt.rotation.z = 1.05; u.add(tilt);   // resting on its rim, handle on the floor
    const canopy = new THREE.ConeGeometry(0.46, 0.22, 8, 1, true), p = canopy.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const panel = Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2; col.push(...(panel ? [0.9, 0.2, 0.22] : [0.98, 0.95, 0.92])); }
    canopy.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    put(tilt, new THREE.Mesh(canopy, mat('#FFFFFF', { roughness: 0.5, vertexColors: true, side: THREE.DoubleSide })), 0, 0.11, 0);
    put(tilt, cyl(0.008, 0.008, 0.72, metal, 6), 0, -0.2, 0);
    put(tilt, new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI).rotateZ(Math.PI), mat('#4A3628', { roughness: 0.5 })), 0.04, -0.56, 0);
    for (let i = 0; i < 6; i++) put(rainKit, new THREE.Mesh(new THREE.CircleGeometry(rand(0.05, 0.11), 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#BFD9EA', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false })), x + rand(-0.45, 0.45), 0.004, z + rand(-0.35, 0.35)); }
  { const [x, z, ry] = RAIN_AT.sign, g = wetSign(); g.position.set(x, 0, z); g.rotation.y = ry; rainKit.add(g); }
}
