/* A barber and a bike repair corner on a park's edge, 7:00–18:00, as on any Vietnamese pavement:
   - the barber's mirror nailed to a tree, an old chair in front of it, a customer under a cape, the barber snipping
     behind him and moving round, someone waiting on a low stool;
   - next to it, sửa xe: a stack of tyres, a red compressor, a basin of water to find the puncture, a scooter up on its
     stand with the repairman on a stool at its back wheel, and a hand-painted VÁ XE board facing the street.
   In the midday nap the barber sleeps in his own chair and the repairman dozes on his stool, hats over their faces. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { LAWN, inside } from './street-spots.js';
import { stepper } from './street-folk.js';

const NAP = [12.5, 13.5];
const open = (h, a, b) => h >= a && h < b;

/** crowd: street-folk.js figures; finder: street-spots.js; trees; C: the office's middle; far: [x, z, r] to keep away
    from; scooterParts (street-life.js) */
export function buildRepair(G, { crowd, finder, trees, C, far = [], scooterParts }) {
  /* ---------- where: a tree 1.75–2.6 in from a park's edge, with 4.7 m of clear lawn to one side of it ---------- */
  let best = null;
  for (const e of finder.edges) {
    if (Math.hypot(e.o[0] - C[0], e.o[1] - C[1]) > 34 || !e.lane) continue;
    const [x0, x1, z0, z1] = e.P;
    for (const T of trees) {
      const [tx, tz, ts] = T;
      if (!(tx > x0 && tx < x1 && tz > z0 && tz < z1)) continue;
      const a = (tx - e.o[0]) * e.along[0] + (tz - e.o[1]) * e.along[1], d = -((tx - e.o[0]) * e.out[0] + (tz - e.o[1]) * e.out[1]);
      if (d < 1.75 || d > 2.6) continue;
      for (const dir of [1, -1]) {
        const a0 = Math.min(a - dir * 0.35, a + dir * 4.75), a1 = Math.max(a - dir * 0.35, a + dir * 4.75), d0 = 1.35, d1 = e.square ? 2.5 : 2.6;
        if (a0 < -e.half + 1.6 || a1 > e.half - 1.6) continue;
        if (trees.some((o) => o !== T && finder.toFoot(e, a0, a1, d0, d1, o[0], o[1]) < 0.3 + 0.16 * o[2])) continue;
        if ([...finder.taken, ...far].some(([x, z, r]) => finder.toFoot(e, a0, a1, d0, d1, x, z) < r)) continue;
        const mid = finder.frame(e, a + dir * 2.3, 1.95, 0), toward = dir * (e.along[0] + e.along[1]);
        // near the office, in view, and spread out on the camera's side of the tree (else its crown is over them)
        const score = Math.hypot(mid.x - C[0], mid.z - C[1]) + 6 * finder.hidden(mid.x, mid.z) + (toward > 0 ? 0 : 5);
        if (!best || score < best.score) best = { e, a, d, dir, ts, score, mid };
      }
    }
  }
  // no such tree: a lawn by a kerb, the mirror on a wooden post instead
  let post = false;
  if (!best) {
    const s = finder.find({ len: 5.0, depth: 1.2, d: 1.95, lawn: true, r: 3.2 });
    if (!s) return { update() {}, debug: () => null };
    finder.taken.pop();
    best = { e: s.e, a: s.a - 2.3, d: 1.95, dir: 1, ts: 0.6, mid: s };
    post = true;
  }
  const { e, dir, ts } = best, f = finder.frame(e, best.a, best.d, LAWN);
  finder.taken.push([best.mid.x, best.mid.z, 3.2]);
  // everything laid out with the tree at the origin and the corner to +x; `dir` turns it round to the other side
  const X = (x) => x * dir, Y = (y) => (dir > 0 ? y : Math.PI - y);
  const put = (g, x, z, yaw = 0, y = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(X(x), y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Y(yaw)), new THREE.Vector3(1, 1, 1)));
  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(f.M); g.visible = false; G.add(g);
  const solid = [], r = 0.16 * ts + 0.01;
  if (post) solid.push(put(boxAt(0.1, 1.9, 0.1, 0, 0, 0, '#7A5A3A'), 0, 0, 0, 0.95));
  // the mirror on the trunk, a little shelf under it
  solid.push(put(mergeAll([boxAt(0.03, 0.48, 0.38, 0, 0, 0, '#8A6A4A'), boxAt(0.012, 0.4, 0.3, 0.012, 0, 0, '#D3E6F0')]), r, 0, 0, 1.45), put(boxAt(0.12, 0.025, 0.3, 0, 0, 0, '#8A6A4A'), r + 0.06, 0, 0, 1.18),
    put(colorize(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), '#2E86DE'), r + 0.07, 0.08, 0, 1.25), put(boxAt(0.02, 0.015, 0.14, 0, 0, 0, '#2B2F36'), r + 0.07, -0.06, 0, 1.2));
  // the barber's chair: an old metal frame, red seat and back (its back away from the mirror)
  solid.push(put(boxAt(0.42, 0.05, 0.42, 0, 0, 0, '#B5122B'), 0.68, 0, 0, 0.335), put(boxAt(0.05, 0.48, 0.4, 0, 0, 0, '#B5122B'), 0.9, 0, 0, 0.62));
  for (const [lx, lz] of [[-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]]) solid.push(put(boxAt(0.03, 0.32, 0.03, 0, 0, 0, '#5E6670'), 0.68 + lx, lz, 0, 0.16));
  solid.push(put(colorize(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 10), '#D62F2F'), 1.75, -0.38, 0, 0.11));   // the waiting stool
  // sửa xe: tyres, the compressor and its hose, the basin, the repairman's stool
  for (let k = 0; k < 4; k++) solid.push(put(colorize(new THREE.TorusGeometry(0.2, 0.065, 6, 14).rotateX(Math.PI / 2), '#1E2125'), 2.45, -0.3, 0, 0.065 + k * 0.13));
  solid.push(put(colorize(new THREE.TorusGeometry(0.2, 0.065, 6, 14).rotateZ(0.25), '#26292E'), 2.45, 0.02, Math.PI / 2, 0.24));
  solid.push(put(colorize(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 12).rotateZ(Math.PI / 2), '#C0392B'), 2.55, 0.34, 0, 0.2), put(boxAt(0.22, 0.16, 0.18, 0, 0, 0, '#2B2F36'), 2.5, 0.34, 0, 0.42),
    put(colorize(new THREE.TorusGeometry(0.13, 0.012, 4, 16).rotateX(Math.PI / 2), '#16181C'), 2.95, 0.42, 0, 0.02), put(colorize(new THREE.TorusGeometry(0.11, 0.012, 4, 16).rotateX(Math.PI / 2), '#16181C'), 2.95, 0.42, 0, 0.045));
  solid.push(put(colorize(new THREE.CylinderGeometry(0.25, 0.21, 0.14, 14), '#2E6FD1'), 3.0, -0.42, 0, 0.07), put(colorize(new THREE.CylinderGeometry(0.23, 0.23, 0.01, 14), '#9CC9E8'), 3.0, -0.42, 0, 0.13));
  solid.push(put(colorize(new THREE.CylinderGeometry(0.11, 0.1, 0.18, 10), '#2E6FD1'), 3.42, -0.3, 0, 0.09));
  // the scooter up on its stand
  const sc = scooterParts();
  for (const p of sc.body) solid.push(put(colorize(p.clone(), '#3B6FB5'), 3.95, 0.3, 0, 0.02));
  for (const p of sc.trim) solid.push(put(p.clone(), 3.95, 0.3, 0, 0.02));
  const mesh = new THREE.Mesh(mergeAll(solid), vmat({ roughness: 0.6, metalness: 0.1 })); g.add(mesh);   // (no shadow: the shadow pass is what costs)
  // the cape over whoever is in the chair
  const cape = new THREE.Mesh(put(colorize(new THREE.ConeGeometry(0.42, 0.66, 14, 1, true), '#CFE0EE'), 0.62, 0, 0, 0.68), vmat({ roughness: 0.8, side: THREE.DoubleSide })); g.add(cape);
  // the board, hand-painted, on two legs at the pavement's edge, facing the street
  const tex = canvasTex(256, 136, (c) => {
    c.fillStyle = '#F2C200'; c.fillRect(0, 0, 256, 136); c.strokeStyle = '#2B2F36'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 130);
    c.fillStyle = '#C8102E'; c.font = '900 64px "Be Vietnam Pro", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('VÁ XE', 128, 52);
    c.fillStyle = '#2B2F36'; c.font = '700 22px "Be Vietnam Pro", system-ui, sans-serif'; c.fillText('BƠM · SỬA XE MÁY', 128, 108);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.33), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); board.position.set(X(4.45), 0.5, 0.52); g.add(board);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.33), new THREE.MeshStandardMaterial({ color: '#8A6A4A', roughness: 0.9 })); back.position.set(X(4.45), 0.5, 0.515); back.rotation.y = Math.PI; g.add(back);
  g.add(new THREE.Mesh(mergeAll([boxAt(0.03, 0.4, 0.03, X(4.2), 0.2, 0.5, '#8A6A4A'), boxAt(0.03, 0.4, 0.03, X(4.7), 0.2, 0.5, '#8A6A4A')]), vmat({ roughness: 0.9 })));

  /* ---------- the people ---------- */
  const [barber, sitter, waiter, fixer] = crowd.take(4);
  const looks = [[barber, { shirt: '#F2F2F2', hair: '#2B2420', pants: '#3B3B3B' }], [sitter, { shirt: '#CFE0EE', hair: '#241E1A', pants: '#2F3A4C' }], [waiter, { shirt: '#D64550', hair: '#241E1A', pants: '#363D4C' }], [fixer, { shirt: '#5B6B4B', hair: '#3A332E', pants: '#2B2F36', sleeves: '#5B6B4B' }]];
  for (const [i, look] of looks) if (i != null) crowd.dress(i, look);
  const place = (i, x, z, p) => { if (i == null) return; const w = f.at(X(x), z); crowd.pose(i, { ...p, x: w.x, z: w.z, y: f.y, sit: p.sit != null ? f.y + p.sit : undefined, yaw: f.yaw + Y(p.yaw ?? 0) }); };
  const hide = (i) => i != null && crowd.hide(i);
  return {
    update: stepper([{
      when: [7, 18], at: [best.mid.x, best.mid.z],
      update(t, dt, h) {
        g.visible = true;
        if (open(h, ...NAP)) {   // the barber asleep in his own chair, the repairman dozing on his stool
          cape.visible = false; hide(sitter); hide(waiter);
          place(barber, 0.74, 0, { sit: 0.36, yaw: Math.PI, lean: 0.38, arms: [[0.7, -0.35], [0.7, -0.35]], faceHat: true });
          place(fixer, 3.42, -0.3, { sit: 0.2, yaw: -Math.PI / 2, lean: 0.3, arms: [[0.6, -0.3], [0.6, -0.3]], faceHat: true });
          return;
        }
        cape.visible = true;
        place(sitter, 0.74, 0, { sit: 0.36, yaw: Math.PI, arms: [[0.2, 0], [0.2, 0]], lean: -0.05 });
        // the barber goes round the head: from one side to the other and back, snipping
        const side = Math.sin(t * 0.35) * 0.3, snip = Math.sin(t * 11) * 0.1;
        place(barber, 1.1, side, { y: 0, yaw: Math.PI - side * 0.8, lean: -0.16, arms: [[1.45, -0.32], [1.78 + snip, -0.28]] });
        if (Math.sin(t * 0.05) > -0.4) place(waiter, 1.75, -0.38, { sit: 0.22, yaw: Math.PI * 0.9, arms: [[0.6, 0], [1.3, -0.12]], lean: -0.12 }); else hide(waiter);
        const work = Math.sin(t * 4.2) * 0.12;
        place(fixer, 3.42, -0.3, { sit: 0.2, yaw: -Math.PI / 2, lean: -0.32, arms: [[1.05 + work, -0.15], [1.1 - work, -0.15]] });
      },
      off() { g.visible = false; for (const i of [barber, sitter, waiter, fixer]) hide(i); },
    }]),
    blocked: (x, z, r) => g.visible && inside(f, x, z, r, Math.min(X(-0.35), X(4.75)), Math.max(X(-0.35), X(4.75)), -0.6, 0.6),
    debug: () => ({ at: [+best.mid.x.toFixed(1), +best.mid.z.toFixed(1)], dir, post }),
  };
}
