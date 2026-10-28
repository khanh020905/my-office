/* Power lines, as on any Vietnamese street: concrete poles along one side of each street near the office, bundles of
   black cables sagging between them and across the crossings, a tangle of coiled spare cable on some poles and a
   transformer box on one. All of it one merged mesh, built once: it costs a draw call and no time per frame, and casts
   no shadow. The poles stand at the kerb, clear of the walkers' line, the lamps, the crossings' corners, and anything
   set up on the pavement (passed in as `avoid`). */
import * as THREE from 'three';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';

const POLE_H = 6.4, CABLE = '#1A1C20';

/** XS, ZS: the streets; HALF: half a street's width; SB: the office's block; C: its middle; avoid: [x, z, r] */
export function buildWires(G, { XS, ZS, HALF, SB, C, avoid = [], reach = 40 }) {
  const inSB = (x, z) => x > SB.x0 && x < SB.x1 && z > SB.z0 && z < SB.z1;
  const geo = [], D = HALF + 0.3;   // (the poles 0.3 m in from the kerb; people walk at 0.95)
  const zMin = ZS[0] - 6, xMin = XS[0] - 6;
  // where the lamps are (city.js): every 9 m, on alternate sides
  const lampAt = (v, along, axis) => { const o = axis === 'z' ? zMin : xMin, k = Math.round((along - o - 4) / 9); return Math.abs(o + 4 + 9 * k - along) < 0.9 ? (k % 2 ? -1 : 1) : 0; };
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  let transformer = false;
  for (const [axis, lines, cross] of [['z', XS, ZS], ['x', ZS, XS]]) {
    for (const v of lines) {
      if (Math.abs(v - (axis === 'z' ? C[0] : C[1])) > reach) continue;
      const mid = axis === 'z' ? C[1] : C[0];
      // the side away from the office's block, else the + side
      const plus = axis === 'z' ? !(v + D > SB.x0 && v + D < SB.x1) : !(v + D > SB.z0 && v + D < SB.z1);
      const side = plus ? 1 : -1, w = v + side * D;
      // two poles a block, 4.7 m in from each crossing (clear of its corner), within reach of the office
      const poles = [];
      for (let k = 0; k < cross.length - 1; k++) for (const a of [cross[k] + 4.7, cross[k + 1] - 4.7]) {
        if (Math.abs(a - mid) > reach) continue;
        const [x, z] = axis === 'z' ? [w, a] : [a, w];
        if (inSB(x, z) || inSB(axis === 'z' ? v : a, axis === 'z' ? a : v)) continue;   // (no street there: the office's block)
        if (lampAt(v, a, axis) === side) continue;
        if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar)) continue;
        poles.push({ x, z, a });
      }
      // the poles: square concrete, tapering, a cross-arm near the top with insulators
      const across = axis === 'z' ? [1, 0] : [0, 1];
      for (const p of poles) {
        geo.push(colorize(new THREE.CylinderGeometry(0.075, 0.12, POLE_H, 4, 1).rotateY(Math.PI / 4).translate(p.x, GY + 0.12 + POLE_H / 2, p.z), '#9A9C9A'));
        geo.push(boxAt(across[0] ? 1.0 : 0.08, 0.08, across[1] ? 1.0 : 0.08, p.x - across[0] * side * 0.25, GY + 0.12 + POLE_H - 0.5, p.z - across[1] * side * 0.25, '#8A8C8A'));
        for (const o of [-0.5, -0.15, 0.2]) geo.push(boxAt(0.06, 0.12, 0.06, p.x + across[0] * side * o, GY + 0.12 + POLE_H - 0.38, p.z + across[1] * side * o, '#E8E4DA'));
        // now and then a coil of spare cable hung on it
        if (r() < 0.45) for (let c = 0; c < 2 + Math.floor(r() * 2); c++) geo.push(colorize(new THREE.TorusGeometry(0.22 + r() * 0.12, 0.025, 3, 12).rotateY(r() * Math.PI).rotateX(Math.PI / 2 + (r() - 0.5) * 0.6).translate(p.x + across[0] * side * 0.12, GY + 0.12 + POLE_H - 1.3 - c * 0.18, p.z + across[1] * side * 0.12), CABLE));
        // and one with the transformer box, near the office
        if (!transformer && Math.hypot(p.x - C[0], p.z - C[1]) < 24) {
          transformer = true;
          geo.push(boxAt(0.42, 0.62, 0.32, p.x - across[0] * side * 0.25, GY + 0.12 + POLE_H - 1.9, p.z - across[1] * side * 0.25, '#7D8A86'), boxAt(0.46, 0.06, 0.36, p.x - across[0] * side * 0.25, GY + 0.12 + POLE_H - 1.56, p.z - across[1] * side * 0.25, '#5E6670'));
          geo.push(boxAt(0.3, 0.42, 0.04, p.x - across[0] * side * 0.25 + across[1] * 0.17, GY + 0.12 + 1.6, p.z - across[1] * side * 0.25 + across[0] * 0.17, '#B9BDB8'));   // (the meter box, low down)
        }
      }
      // the cables: a bundle of four or five between each pole and the next, each sagging its own way
      poles.sort((p, q) => p.a - q.a);
      for (let k = 1; k < poles.length; k++) {
        const A = poles[k - 1], B = poles[k], span = B.a - A.a;
        if (span > 16) continue;   // (a gap: the office's block, or a pole left out where there was no room)
        const n = 4 + (r() < 0.5 ? 1 : 0);
        for (let c = 0; c < n; c++) {
          const off = (c - (n - 1) / 2) * 0.09, h0 = POLE_H - 0.42 - (c % 3) * 0.13, sag = 0.3 + r() * 0.35 + span * 0.02, SEG = 6;
          let prev = null;
          for (let s = 0; s <= SEG; s++) {
            const u = s / SEG, x = A.x + (B.x - A.x) * u + across[0] * off, z = A.z + (B.z - A.z) * u + across[1] * off, y = GY + 0.12 + h0 - 4 * sag * u * (1 - u);
            const P = new THREE.Vector3(x, y, z);
            if (prev) { const d = new THREE.Vector3().subVectors(P, prev), len = d.length(); geo.push(colorize(new THREE.CylinderGeometry(0.018, 0.018, len, 3, 1).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate((x + prev.x) / 2, (y + prev.y) / 2, (z + prev.z) / 2), CABLE)); }
            prev = P;
          }
        }
      }
    }
  }
  if (!geo.length) return { mesh: null };
  const mesh = new THREE.Mesh(mergeAll(geo), vmat({ roughness: 0.85 }));
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.userData.wires = true; G.add(mesh);
  return { mesh, tris: mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3 };
}
