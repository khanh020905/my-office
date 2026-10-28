/* On a hot sunny day (life/weather.js: 33 °C or more, clear or nearly; ?hot to try it) scooters waiting at a red light
   stop back in the shade of a building or a tree instead of out in the sun at the stop line, and go on at the green,
   as Vietnam's riders did in the summer of 2026, until the police said that blocking the lane like that could cost a
   400–600k VND fine. For each approach to a crossing near the office (where the scene draws shadows), the nearest
   shaded stretch between the stop line and the last crossing's zebra (a few metres) is found once, against the sun's direction, the buildings' blocks and the
   trees' crowns, and street-life.js's roomAtLight stops scooters at its near end. Looked at again every ten minutes. */
import * as THREE from 'three';
import { wx } from '../../life/weather.js';
import { sun } from '../../scene/lights.js';
import { colorize, mergeAll, vmat } from '../terrace.js';

const HOT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hot');

/** lanes: street-life.js's; spotOf(L, s, side); inSB; solids: buildings [x0, x1, z0, z1, top]; trees [x, z, size];
    blocks: the office's own [x0, x1, z0, z1, top] (its terrace and rooms); C: its middle; GY: the road */
export function buildShade({ lanes, spotOf, inSB, solids, trees, office, C, GY }) {
  let on = false, builtAt = -1e9, checkAt = -1;
  const casters = [...solids.filter((b) => b[4] > 0), ...office];
  // does the sun reach (x, y, z)? A ray towards it, against the boxes and the trees' crowns
  function shaded(x, y, z, d) {
    for (const [x0, x1, z0, z1, top] of casters) {
      // a box from the ground to its top: the slab test
      let t0 = 0, t1 = 60;
      for (const [o, dd, lo, hi] of [[x, d.x, x0, x1], [y, d.y, GY, top], [z, d.z, z0, z1]]) {
        if (Math.abs(dd) < 1e-6) { if (o < lo || o > hi) { t0 = 1; t1 = 0; break; } continue; }
        let a = (lo - o) / dd, b = (hi - o) / dd; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
      }
      if (t0 <= t1) return true;
    }
    for (const [tx, tz, s, top] of trees) {
      const cy = GY + 0.12 + (top ?? 1.9 * s), r = top ? 1.35 : 0.95 * s, ox = x - tx, oy = y - cy, oz = z - tz, bq = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
      if (bq < 0 && bq * bq - c > 0) return true;
    }
    return false;
  }
  function build() {
    const d = new THREE.Vector3().subVectors(sun.position, sun.target.position).normalize();
    for (const L of lanes) {
      L.shade = null;
      L.cross.forEach((c, idx) => {
        const stop = c - L.dir * 5.2, [sx, sz] = spotOf(L, stop, 1.3);
        if (Math.hypot(sx - C[0], sz - C[1]) > 24) return;   // (only where the scene draws shadows)
        const [cx, cz] = L.axis === 'z' ? [L.v, c] : [c, L.v];
        if (inSB(cx, cz)) return;
        // from the stop line back to the last crossing's zebra (a block leaves about 5 m): the first stretch in shade,
        // none if the stop line itself is shaded or there is none
        if (shaded(...spotOf(L, stop, 1.3).flatMap((v, i) => (i ? [GY + 1.2, v] : [v])), d)) return;
        for (let k = 0.8; k <= 4.6; k += 0.3) {
          const s = stop - L.dir * k, [x, z] = spotOf(L, s, 1.3);
          if (!shaded(x, GY + 1.2, z, d)) continue;
          (L.shade ??= {})[idx] = s - L.dir * 0.5;   // (its front half a metre into the shade)
          break;
        }
      });
    }
  }
  return {
    // once a second (street-life.js census): whether it is hot and sunny enough, and the shade worked out if it is
    check(t, h) {
      if (t - checkAt < 1) return on; checkAt = t;
      const day = h >= 9 && h < 17, sunny = HOT || (wx.code != null && wx.code <= 2 && wx.cloud < 0.7 && wx.rain < 0.05);
      on = day && sunny && (HOT || wx.temp >= 33);
      if (on && t - builtAt > 600) { builtAt = t; build(); }
      return on;
    },
    get on() { return on; },
  };
}

/* Street trees (cây xanh vỉa hè): a few big ones on the pavement by the kerb, near the office, each where its shadow
   falls across the lane just before a stop line (the sun is fixed, high from +x +z: a crown 3.3 m up throws its shade
   1.8 m in from the kerb and 1.5 m back), so on a hot day there is somewhere to wait. One merged mesh, the only thing
   in these street batches that casts a shadow: the shade is the point. Returns the trees ([x, z, size], as city.js's,
   for the shade test) and where they stand (to keep the power poles off them). */
export function plantStreetTrees(G, { lanes, spotOf, inSB, HALF, XS, ZS, C, GY, avoid = [] }) {
  const out = [], geo = [], zMin = ZS[0] - 6, xMin = XS[0] - 6;
  const d = new THREE.Vector3().subVectors(sun.position, sun.target.position);
  if (d.lengthSq() < 1e-6) d.set(10, 18, 8.5);
  d.normalize();
  const off = { x: (-d.x / d.y) * 3.3, z: (-d.z / d.y) * 3.3 };   // (where the shadow of a crown 3.3 m up falls)
  const lampNear = (along, axis) => { const o = axis === 'z' ? zMin : xMin, k = Math.round((along - o - 4) / 9); return Math.abs(o + 4 + 9 * k - along) < 1.4; };
  for (const L of lanes) {
    // only lanes whose kerb is on the +x / +z side: their tree's shadow falls back across the lane
    const kerbPlus = L.axis === 'z' ? L.dir < 0 : L.dir > 0;
    if (!kerbPlus) continue;
    L.cross.forEach((c) => {
      // the crown's shadow lands off along the lane by the sun's slant: plant it so the shade's middle is 3.9 m back
      const shift = L.axis === 'x' ? off.x : off.z, stop = c - L.dir * 5.2, along = stop - L.dir * 3.9 - shift;
      const [x, z] = spotOf(L, along, HALF + 0.45), [px, pz] = spotOf(L, stop, 1.3);
      if (Math.hypot(px - C[0], pz - C[1]) > 22) return;
      if (inSB(x, z) || inSB(...spotOf(L, along, 0.5))) return;
      if (lampNear(along, L.axis) || avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar)) return;
      const sz = 1.25;
      out.push([x, z, sz, 3.3]);
      geo.push(colorize(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 7).translate(x, GY + 0.12 + 1.6, z), '#5B4433'));
      for (const [dx, dy, dz, r, c2] of [[0, 3.3, 0, 1.35, '#3E6B3A'], [0.6, 3.8, -0.3, 0.95, '#4C7A3F'], [-0.5, 3.6, 0.45, 0.9, '#36603A'], [0.1, 4.2, 0.2, 0.75, '#58834A']]) geo.push(colorize(new THREE.IcosahedronGeometry(r, 1).translate(x + dx, GY + 0.12 + dy, z + dz), c2));
    });
  }
  if (geo.length) { const m = new THREE.Mesh(mergeAll(geo), vmat({ roughness: 0.95 })); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.part = 'streetTrees'; G.add(m); }
  return out;
}
