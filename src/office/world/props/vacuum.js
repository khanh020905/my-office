// The robot vacuum.
import * as THREE from 'three';
import { PRO, randInt, wrapAngle } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put, rbox } from '../../scene/blocks.js';
import { ADJ, NODES } from '../../people/navigation.js';
import { night } from '../room-update.js';
import { vacSpin } from '../../interact/props.js';

export let vac;
export function updateVac(dt, t) {
  if (vacSpin > t) { vac.g.rotation.y += dt * 11; vac.led.color.set(Math.floor(t * 10) % 2 ? '#FF5F5F' : '#3DDC84'); return; }
  const a = NODES[vac.at], b = NODES[vac.to], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  vac.k += (0.42 * dt) / len;
  if (vac.k >= 1) { vac.k = 0; vac.prev = vac.at; vac.at = vac.to; const opts = (ADJ[vac.at] || []).filter((n) => n !== vac.prev); vac.to = opts.length ? opts[randInt(0, opts.length - 1)] : vac.prev; }
  const p = NODES[vac.at], q = NODES[vac.to];
  vac.g.position.set(p[0] + (q[0] - p[0]) * vac.k + 0.35, 0, p[1] + (q[1] - p[1]) * vac.k + 0.35);
  vac.g.rotation.y += wrapAngle(Math.atan2(q[0] - p[0], q[1] - p[1]) - vac.g.rotation.y) * Math.min(1, dt * 4);
  vac.led.color.setRGB(0.24, 0.86, 0.52).multiplyScalar((t * 2) % 2 < 1.6 ? (night ? 2.2 : 1) : 0.15);
}

export function setup() {
  /* robot vacuum: drives along the walk graph, one edge at a time */
  vac = (() => {
    const g = new THREE.Group(); scene.add(g);
    put(g, cyl(0.24, 0.25, 0.08, mat('#2E3238', { roughness: 0.4, metalness: 0.3 }), 28), 0, 0.045, 0);
    put(g, cyl(0.2, 0.2, 0.01, mat('#4A505A', { roughness: 0.3, metalness: 0.4 }), 28), 0, 0.09, 0);
    put(g, rbox(0.3, 0.035, 0.05, mat('#1C1F24'), 0.015), 0, 0.06, 0.2);
    const led = new THREE.MeshBasicMaterial({ color: '#3DDC84' }); put(g, new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), led), 0, 0.1, 0.12);
    g.userData.dynamic = true;
    return { g, led, at: PRO ? 'L2' : 'L', to: PRO ? 'P0f0' : 'K', prev: null, k: 0 };
  })();
}
