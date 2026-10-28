/* Where the street trades set up (street-corner.js, street-morning.js, street-repair.js): along the edges of the parks
   near the office, on the pavement by the kerb or on the lawn just inside, clear of the trees, the paved squares and
   whatever is there already, and where no tree stands between them and the camera (which looks in from +x +z, at
   about 45°). Each place comes as a frame on a park's edge: x along it, z out towards the street, y = 0 on the ground
   (the pavement, or the lawn a little higher). d: how far in from the kerb (the pavement is 1.3 deep; people walk at
   0.95). */
import * as THREE from 'three';
import { GY } from '../terrace.js';

const UP = new THREE.Vector3(0, 1, 0);
export const LAWN = GY + 0.18, PAVE = GY + 0.12;
// walking in: whether (x, z) comes within r of a footprint [x0, x1] × [z0, z1] in frame f's own coordinates
export const inside = (f, x, z, r, x0, x1, z0, z1) => { const [lx, lz] = f.local(x, z); return lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r; };

/** C: the office's middle; parks: the whole blocks left as parks ([x0, x1, z0, z1]); plazas: their paved squares; trees:
    [x, z, size]; laneAt(axis, v, dir); HALF: half a street's width */
export function spotFinder({ C, parks, plazas, trees, laneAt, HALF }) {
  const taken = [];   // [x, z, r]: what is there already
  const toC = ([x0, x1, z0, z1]) => Math.hypot(C[0] - THREE.MathUtils.clamp(C[0], x0, x1), C[1] - THREE.MathUtils.clamp(C[1], z0, z1));
  const squareIn = (P) => plazas.some((q) => q[0] > P[0] && q[1] < P[1] && q[2] > P[2] && q[3] < P[3]);
  // each park's four edges: o its middle, along it, out of the park, half its length, and the lane whose kerb it is
  const edges = [];
  for (const P of parks) {
    const [x0, x1, z0, z1] = P, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [out, o, half, lane] of [
      [[0, 1], [cx, z1], (x1 - x0) / 2, () => laneAt('x', z1 + HALF, -1)], [[0, -1], [cx, z0], (x1 - x0) / 2, () => laneAt('x', z0 - HALF, 1)],
      [[1, 0], [x1, cz], (z1 - z0) / 2, () => laneAt('z', x1 + HALF, 1)], [[-1, 0], [x0, cz], (z1 - z0) / 2, () => laneAt('z', x0 - HALF, -1)]]) {
      edges.push({ P, out, o, half, along: [out[1], -out[0]], square: squareIn(P), lane: lane() });
    }
  }
  // how badly the trees hide a spot from the camera: one for each standing in the way
  const hidden = (x, z) => trees.reduce((n, [tx, tz, s]) => { const dx = tx - x, dz = tz - z, a = (dx + dz) * Math.SQRT1_2, c = Math.abs(dx - dz) * Math.SQRT1_2; return n + (a > 0.2 && a < 4.6 && c < 0.95 * s + 0.4 ? 1 : 0); }, 0);
  // a frame on edge e: `a` along it from its middle, `d` in from the kerb
  function frame(e, a, d, y) {
    const x = e.o[0] + e.along[0] * a - e.out[0] * d, z = e.o[1] + e.along[1] * a - e.out[1] * d;
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(e.along[0], 0, e.along[1]), UP, new THREE.Vector3(e.out[0], 0, e.out[1])).setPosition(x, y, z);
    const yaw = Math.atan2(-e.along[1], e.along[0]);   // (what faces local +x faces along the edge)
    const V = new THREE.Vector3();
    return { e, a, d, x, z, y, M, yaw, L: e.lane, s: e.lane ? (e.lane.axis === 'x' ? x : z) : 0,
      // a point of the frame in the world
      at(lx, lz, ly = 0) { return V.set(lx, ly, lz).applyMatrix4(M).clone(); },
      // a world point in the frame's own x (along the edge) and z (out)
      local(px, pz) { const dx = px - x, dz = pz - z; return [dx * e.along[0] + dz * e.along[1], dx * e.out[0] + dz * e.out[1]]; } };
  }
  // the distance from (px, pz) to a footprint: local [a0, a1] along the edge, [d0, d1] in from the kerb
  const toFoot = (e, a0, a1, d0, d1, px, pz) => {
    const ra = (px - e.o[0]) * e.along[0] + (pz - e.o[1]) * e.along[1], rd = -((px - e.o[0]) * e.out[0] + (pz - e.o[1]) * e.out[1]);
    return Math.hypot(Math.max(a0 - ra, 0, ra - a1), Math.max(d0 - rd, 0, rd - d1));
  };
  /** the best place for a footprint `len` along the edge by `depth`, `d` in from the kerb (its middle); near: how far
      from the office it may be; corner: hard by a corner (else away from them); far: [x, z, r] it must stay that far
      from; mid: prefer the middle of the edge (a kerb stop is only allowed mid-block); lawn: wholly on the grass */
  function find({ len, depth, d, near = 34, corner = false, far = [], mid = false, lawn = false, step = 0.5, r = Math.max(len, depth) / 2 + 0.6 }) {
    let best = null;
    for (const e of edges) {
      if (toC(e.P) > near) continue;
      const lim = e.half - (corner ? 1.5 : 2.4) - len / 2;
      for (let a = -lim; a <= lim + 1e-6; a += step) {
        if (corner && Math.abs(a) < e.half - 4.8) continue;
        const a0 = a - len / 2, a1 = a + len / 2, d0 = d - depth / 2, d1 = d + depth / 2;
        if (lawn && d0 < 1.32) continue;
        if (e.square && d1 > 2.5) continue;   // (the paved square starts 2.6 in)
        const f = frame(e, a, d, 0), cx = f.x, cz = f.z;
        if (trees.some(([tx, tz, s]) => toFoot(e, a0, a1, d0, d1, tx, tz) < 0.3 + 0.16 * s)) continue;
        if ([...taken, ...far].some(([x, z, rr]) => toFoot(e, a0, a1, d0, d1, x, z) < rr)) continue;
        const score = Math.hypot(cx - C[0], cz - C[1]) + 6 * hidden(cx, cz) + (mid ? 3 * Math.abs(a) : 0) + (e.lane ? 0 : 50);
        if (!best || score < best.score) best = { e, a, d, score };
      }
    }
    if (!best) return null;
    const f = frame(best.e, best.a, best.d, lawn ? LAWN : PAVE);
    taken.push([f.x, f.z, r]);
    return f;
  }
  return { find, hidden, frame, edges, taken, toFoot };
}
