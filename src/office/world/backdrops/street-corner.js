/* Xe ôm at a corner, and a hammock between two trees in a park.
   - 6:30–19:30: two or three old-style xe ôm men (no app: their own clothes, a pith helmet) wait on their scooters by
     the kerb at a corner near the office: one smoking, one standing by his chatting with his hands, one on his looking
     about. In the midday nap (12:30–13:30, the office's) they sleep on the scooters: lying back along the seat, feet up
     on the handlebar, the hat over the face.
   - 7:00–19:00: a striped hammock (võng) strung between two park trees, swaying a little; 11:45–14:15 someone asleep in
     it, hat over the face.
   The people are street-folk.js figures; the places come from street-spots.js. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { colorize, mergeAll, vmat } from '../terrace.js';
import { LAWN, inside } from './street-spots.js';
import { stepper } from './street-folk.js';

const NAP = [12.5, 13.5], SEAT_TOP = 0.92;
const open = (h, a, b) => h >= a && h < b;
let PUFF;
const puffTex = () => (PUFF ??= canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(235,235,235,.85)'); r.addColorStop(1, 'rgba(235,235,235,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }));
// a puff of smoke (or steam) that rises and fades, over and over: place(x, y, z) where it starts
export function puffs(G, n, { size = 0.35, rise = 0.8, period = 2.6, color = '#E6E6E6' } = {}) {
  const list = Array.from({ length: n }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color, transparent: true, depthWrite: false })); s.visible = false; G.add(s); return { s, k: i / n }; });
  return {
    show(t, x, y, z, on = true) {
      for (const p of list) {
        p.s.visible = on;
        if (!on) continue;
        const u = ((t / period + p.k) % 1);
        p.s.position.set(x + Math.sin(t * 0.7 + p.k * 6) * 0.06 * u, y + u * rise, z + Math.cos(t * 0.5 + p.k * 6) * 0.05 * u);
        p.s.scale.setScalar(size * (0.4 + u)); p.s.material.opacity = 0.75 * (1 - u) * Math.min(1, u * 5);
      }
    },
  };
}

/** crowd: street-folk.js figures; finder: street-spots.js; trees; scooterParts (street-life.js); far: [x, z, r] to keep
    away from (the bánh mì cart, the trà đá stall, the chess game) */
export function buildCorner(G, { crowd, finder, trees, scooterParts, C, far = [] }) {
  const parts = [];
  let bikesUp = () => false;

  /* ---------- xe ôm: three scooters along the kerb at a corner ---------- */
  const spot = finder.find({ len: 3.4, depth: 0.55, d: 0.32, corner: true, far });
  if (spot) {
    const B = [-1.1, 0, 1.1], PAINT = ['#7A1F2B', '#2B3A67', '#3B3B3B'], sc = scooterParts(), list = [];
    B.forEach((x, k) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (k - 1) * 0.1), new THREE.Vector3(1, 1, 1));
      for (const g of sc.body) list.push(colorize(g.clone(), PAINT[k]).applyMatrix4(m));
      for (const g of sc.trim) list.push(g.clone().applyMatrix4(m));
    });
    const bikes = new THREE.Mesh(mergeAll(list), vmat({ roughness: 0.45, metalness: 0.25 }));
    bikes.matrixAutoUpdate = false; bikes.matrix.copy(spot.M); bikes.visible = false; bikesUp = () => bikes.visible; G.add(bikes);   // (no shadow: the street's shadow pass is what costs)
    const who = crowd.take(3), smoke = puffs(G, 3, { size: 0.28, rise: 0.7 });
    [{ shirt: '#8C7B5A', hair: '#3A332E', pants: '#4A4A52' }, { shirt: '#6B7A8F', hair: '#2B2420', pants: '#363D4C' }, { shirt: '#C9B79C', hair: '#A9A9A9', pants: '#5B4B3B' }]
      .forEach((look, n) => who[n] != null && crowd.dress(who[n], look));
    const pose = (n, f) => { if (who[n] == null) return; const w = spot.at(f.x, f.z); crowd.pose(who[n], { ...f, x: w.x, z: w.z, y: spot.y, sit: f.sit != null ? spot.y + f.sit : undefined, yaw: spot.yaw + (f.yaw || 0) }); };
    parts.push({
      when: [6.5, 19.5], at: [spot.x, spot.z],
      update(t, dt, h) {
        bikes.visible = true;
        const nap = open(h, ...NAP), puffAt = spot.at(B[0] + 0.05, 0);
        if (nap) {   // asleep on the seat, feet up on the handlebar
          for (let n = 0; n < 3; n++) if (who[n] != null) { const w = spot.at(B[n] - 0.05, 0); crowd.pose(who[n], { x: w.x, y: spot.y + SEAT_TOP + 0.07 - 0.72, z: w.z, yaw: spot.yaw + (n - 1) * 0.1, tip: 1.42, legs: [0.42 + n * 0.03, 0.48], arms: [[1.15, -0.45], [1.15, -0.45]], faceHat: n !== 1, hat: n === 1 }); }
          smoke.show(t, 0, 0, 0, false);
          return;
        }
        // one smoking on his, one standing by his chatting, one looking about
        const drag = (t % 9) < 1.6, wave = Math.sin(t * 2.3);
        pose(0, { x: B[0] - 0.3, z: 0, sit: SEAT_TOP, yaw: -0.1, arms: [[0.55, 0], drag ? [2.35, -0.38] : [0.75, -0.1]], hat: true });
        pose(1, { x: B[1] + 0.25, z: -0.62, y: 0, yaw: Math.PI * 0.85, arms: [[0.3 + Math.max(0, wave) * 0.9, 0.1], [-0.25, -0.1]], hat: true });
        pose(2, { x: B[2] - 0.3, z: 0, sit: SEAT_TOP, yaw: 0.1 + Math.sin(t * 0.25) * 0.5, arms: [[0.9, -0.4], [0.9, -0.4]], lean: 0.08 });
        smoke.show(t, puffAt.x, spot.y + 1.75, puffAt.z, (t % 9) > 1.2 && (t % 9) < 4.5);
      },
      off() { bikes.visible = false; who.forEach((i) => i != null && crowd.hide(i)); smoke.show(0, 0, 0, 0, false); },
    });
  }

  /* ---------- a hammock between two trees ---------- */
  // two trees 2.4–3.6 apart in a park near the office, not across a paved square, clear of everything else, in view
  let pair = null;
  const near = new Map();   // (each park once, the ones near the office)
  for (const e of finder.edges) if (!near.has(e.P) && Math.hypot(C[0] - THREE.MathUtils.clamp(C[0], e.P[0], e.P[1]), C[1] - THREE.MathUtils.clamp(C[1], e.P[2], e.P[3])) < 34) near.set(e.P, e);
  for (const e of near.values()) {
    const [x0, x1, z0, z1] = e.P;
    const inP = trees.filter(([x, z]) => x > x0 && x < x1 && z > z0 && z < z1);
    for (let i = 0; i < inP.length; i++) for (let j = i + 1; j < inP.length; j++) {
      const [ax, az, as] = inP[i], [bx, bz, bs] = inP[j], len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (len < 2.4 || len > 3.6) continue;
      if (e.square) { const q = e.P, inner = (x, z) => x > q[0] + 2.45 && x < q[1] - 2.45 && z > q[2] + 2.45 && z < q[3] - 2.45; if ([0.25, 0.5, 0.75].some((u) => inner(ax + (bx - ax) * u, az + (bz - az) * u))) continue; }
      if ([...finder.taken, ...far].some(([x, z, r]) => Math.hypot(x - mx, z - mz) < r + 1.6)) continue;
      // nobody's trees in between, and the middle in view
      if (inP.some((t, k) => k !== i && k !== j && Math.abs((t[0] - ax) * (bz - az) - (t[1] - az) * (bx - ax)) / len < 0.9 && ((t[0] - ax) * (bx - ax) + (t[1] - az) * (bz - az)) / len > 0 && ((t[0] - ax) * (bx - ax) + (t[1] - az) * (bz - az)) / len < len)) continue;
      // in view: nothing in front, strung across the screen (the camera looks along (1, 1): along it the near crown hides it),
      // and long enough for a gap between the two crowns
      const across = Math.abs((bx - ax) + (bz - az)) * Math.SQRT1_2 / len;
      const score = 6 * finder.hidden(mx, mz) + 5 * across + 1.2 * (3.6 - len) + 0.06 * Math.hypot(mx - C[0], mz - C[1]);
      if (!pair || score < pair.score) pair = { a: [ax, az, as], b: [bx, bz, bs], len, mx, mz, score };
    }
  }
  if (pair) {
    finder.taken.push([pair.mx, pair.mz, pair.len / 2 + 0.6]);
    const { a, b, len } = pair, yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const H = new THREE.Group(); H.position.set(pair.mx, LAWN, pair.mz); H.rotation.y = yaw; H.visible = false; G.add(H);
    const sway = new THREE.Group(); sway.position.y = 1.18; H.add(sway);   // (swings about the line between the knots)
    const half = len / 2, ra = 0.15 * a[2], rb = 0.15 * b[2], net = [], N = 12, STRIPES = ['#D63B3B', '#2E6FD1', '#F2C200', '#2A9D8F'];
    // the cloth: a sagging band between two points 0.45 in from the trunks, its edges a little higher (it wraps whoever is in it)
    const e0 = -half + ra + 0.45, e1 = half - rb - 0.45, sag = 0.62;
    for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N, x0 = e0 + (e1 - e0) * u0, x1 = e0 + (e1 - e0) * u1, y0 = -sag * 4 * u0 * (1 - u0), y1 = -sag * 4 * u1 * (1 - u1);
      const seg = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0), w = 0.42 + 0.18 * Math.sin(Math.PI * (u0 + u1) / 2);
      for (const [dz, dy, wz] of [[0, 0, w], [w / 2, 0.07, 0.06], [-w / 2, 0.07, 0.06]]) net.push(colorize(new THREE.BoxGeometry(seg + 0.01, 0.02, wz).rotateZ(ang).translate((x0 + x1) / 2, (y0 + y1) / 2 + dy, dz), STRIPES[k % 4]));
    }
    for (const [x0, x1] of [[-half + ra, e0], [half - rb, e1]]) for (const dz of [-0.12, 0.12]) {   // the ropes to the trunks
      const g = new THREE.CylinderGeometry(0.008, 0.008, Math.hypot(x1 - x0, dz), 4).rotateZ(Math.PI / 2).rotateY(Math.atan2(-dz, x1 - x0)).translate((x0 + x1) / 2, 0, dz / 2);
      net.push(colorize(g, '#D8CBA8'));
    }
    for (const [x, r] of [[-half, ra], [half, rb]]) net.push(colorize(new THREE.TorusGeometry(r + 0.01, 0.015, 4, 12).rotateX(Math.PI / 2).translate(x, 0, 0), '#D8CBA8'));   // (tied round each trunk)
    sway.add(new THREE.Mesh(mergeAll(net), vmat({ roughness: 0.9 })));
    const who = crowd.take(1);
    if (who[0] != null) crowd.dress(who[0], { shirt: '#E8E4DA', hair: '#3A332E', pants: '#4A4A52' });
    const V = new THREE.Vector3();
    parts.push({
      when: [7, 19], at: [pair.mx, pair.mz],
      update(t, dt, h) {
        H.visible = true;
        const roll = Math.sin(t * 1.1) * (open(h, 11.75, 14.25) ? 0.07 : 0.12);
        sway.rotation.x = roll;
        if (who[0] == null) return;
        if (!open(h, 11.75, 14.25)) { crowd.hide(who[0]); return; }
        // lying along it, head a little up at one end, the hat over the face; carried round by the swing
        const lx = (e0 + e1) / 2 - 0.1, ly = -sag + 0.03, cz = Math.sin(roll) * (1.18 - ly), cy = 1.18 + ly * Math.cos(roll);
        V.set(lx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(H.position);
        crowd.pose(who[0], { x: V.x, y: LAWN + cy + 0.09 - 0.72, z: V.z, yaw, tip: Math.PI / 2 - 0.32, legs: [0.32, 0.26], arms: [[1.0, -0.5], [1.0, -0.5]], faceHat: true });
      },
      off() { H.visible = false; if (who[0] != null) crowd.hide(who[0]); },
    });
  }

  return {
    update: stepper(parts),
    blocked: (x, z, r) => !!spot && bikesUp() && inside(spot, x, z, r, -2.0, 2.0, -0.35, 0.35),
    debug: () => ({ xeom: spot && [+spot.x.toFixed(1), +spot.z.toFixed(1)], hammock: pair && [+pair.mx.toFixed(1), +pair.mz.toFixed(1)] }),
  };
}
