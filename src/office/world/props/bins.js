// Context waste bins beside each desk.
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put } from '../../scene/blocks.js';
import { DESKS, dLocal } from '../desks.js';
import { sessions, workers } from '../../people/workers.js';

export let binM;
export let paperBallM;
export let bins;
let binAt = -1;
export function updateBins(dt, t) {
  const byDesk = new Map(); for (const s of sessions.values()) if (s.desk >= 0) byDesk.set(s.desk, s);
  for (const b of bins) {
    const s = byDesk.get(b.desk), w = s && workers.get(s.id), stomping = w && w.anim === 'stomp' && w.phase !== 'walk';
    if (t - binAt > 1 || stomping) {
      const f = stomping || w?.shred ? 0 : s?.usage ? Math.min(1, s.usage.ctx / s.usage.ctxMax) : 0, n = Math.round(f * b.balls.length);
      b.balls.forEach((x, k) => { x.visible = k < n; }); b.spill.forEach((x) => { x.visible = f > 0.85; });
    }
    b.squash += ((stomping ? 1 : 0) - b.squash) * Math.min(1, dt * 8);
    b.g.scale.y = 1 - b.squash * 0.35 * Math.abs(Math.sin(t * 7));
  }
  if (t - binAt > 1) binAt = t;
}

export function setup() {
  /* context waste bins: one beside each desk chair; crumpled paper fills with the desk's session context and spills
     over past 85 %; on compaction it is emptied along with the desk's stack (shredder.js), or, with no shredder to walk
     to, the chibi stands up and stomps it flat */
  binM = mat('#7C8794', { roughness: 0.45, metalness: 0.35 }); paperBallM = mat('#F4F1EA', { roughness: 0.95 });
  bins = DESKS.map((d, i) => {
    const [bx, bz] = dLocal(d, 0.62, -0.72), g = new THREE.Group(); g.position.set(bx, 0, bz); scene.add(g);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.34, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#7C8794', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }));
    can.position.y = 0.17; can.castShadow = true; g.add(can);
    put(g, cyl(0.12, 0.12, 0.012, binM, 18), 0, 0.006, 0);
    put(g, new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20), binM), 0, 0.34, 0).rotation.x = Math.PI / 2;
    const balls = Array.from({ length: 7 }, (_, k) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + (k % 3) * 0.008, 0), paperBallM); b.position.set(Math.sin(k * 2.4) * 0.06, 0.06 + k * 0.045, Math.cos(k * 2.4) * 0.06); b.rotation.set(k, k * 2, 0); b.visible = false; g.add(b); return b; });
    const spill = Array.from({ length: 3 }, (_, k) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), paperBallM); b.position.set(0.22 + k * 0.07, 0.05, -0.1 + k * 0.12); b.visible = false; g.add(b); return b; });
    return { g, can, balls, spill, desk: i, squash: 0 };
  });
}
