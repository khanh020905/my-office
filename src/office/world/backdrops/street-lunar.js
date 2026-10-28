/* The 1st and the 15th of the lunar month (ngày rằm, mùng một): in front of a couple of the small family shops near the
   office (not the chain stores), 7:30–9:00 and 17:30–19:00, someone burns votive paper in a perforated metal bin at the
   kerb, feeding it sheet by sheet: small flames, smoke rising, a little offering table beside it with fruit, flowers and
   incense. The lunar date is the office clock's (Asia/Ho_Chi_Minh); ?lunar=1 brings it on any day. */
import * as THREE from 'three';
import { officeNow } from '../../core/env.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { puffs } from './street-corner.js';
import { stepper } from './street-folk.js';

const FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lunar') === '1';
const LUNAR = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric', day: 'numeric' }) : null;
export const lunarDay = (d) => { try { return +LUNAR.formatToParts(d).find((p) => p.type === 'day').value; } catch { return 0; } };

/** crowd: street-folk.js figures; faces: the buildings' street fronts (city.js: `plain` = a small shop, `store` = a
    chain); C: the office's middle; avoid: [x, z, r] (where a wedding's tent may go up, and such); GY: the road */
export function buildLunar(G, { crowd, faces, C, avoid = [], GY }) {
  // the two nearest small shops on the street sides the camera sees
  const shops = faces.filter((f) => f.plain && !f.store && f.len >= 3 && !avoid.some(([x, z, r]) => Math.hypot(x - f.x, z - f.z) < r))
    .sort((a, b) => Math.hypot(a.x - C[0], a.z - C[1]) - Math.hypot(b.x - C[0], b.z - C[1])).slice(0, 2);
  const UP = new THREE.Vector3(0, 1, 0), parts = [], spots = [];
  for (const f of shops) {
    // the shop's frame (as shops.js): the front at z = 0, the street towards +z, the kerb at 1.3; on the pavement
    const yaw = f.dir === 'px' ? Math.PI / 2 : 0, M = new THREE.Matrix4().compose(new THREE.Vector3(f.x, GY + 0.12, f.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
    // laid out so the camera (from +x +z) sees the fire: whoever feeds it stands behind the drum, the table to one side
    const m = f.dir === 'px' ? -1 : 1, X = (x) => x * m;
    const at = (x, z, y = 0) => new THREE.Vector3(X(x), y, z).applyMatrix4(M);
    const BX = 0.55, BZ = 0.95;
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(M); g.visible = false; G.add(g);
    const solid = [];
    // the bin: a steel drum with holes punched round it, on three bricks
    const P = (g, x, z) => g.translate(X(x), 0, z);
    solid.push(P(colorize(new THREE.CylinderGeometry(0.21, 0.19, 0.42, 14, 1, true).translate(0, 0.29, 0), '#4A4C50'), BX, BZ), P(colorize(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14).translate(0, 0.09, 0), '#3A3C40'), BX, BZ));
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; solid.push(P(boxAt(0.04, 0.04, 0.04, Math.cos(a) * 0.205, 0.22 + (k % 2) * 0.12, Math.sin(a) * 0.205, '#F07A1A'), BX, BZ)); }
    for (const [dx, dz] of [[-0.12, -0.08], [0.12, -0.08], [0, 0.13]]) solid.push(P(boxAt(0.1, 0.08, 0.1, dx, 0.04, dz, '#A0522D'), BX, BZ));
    // the paper waiting: gold and red bundles
    for (let k = 0; k < 4; k++) solid.push(P(boxAt(0.24, 0.05, 0.17, 0, 0.03 + k * 0.05, 0, k % 2 ? '#C8102E' : '#E8C14A'), 1.0, 0.55));
    // the little table: fruit on a plate, flowers in a vase, a bowl of incense
    const TX = -0.5, TZ = 0.98;
    solid.push(P(boxAt(0.5, 0.03, 0.36, 0, 0.5, 0, '#B5122B'), TX, TZ));
    for (const [lx, lz] of [[-0.21, -0.15], [-0.21, 0.15], [0.21, -0.15], [0.21, 0.15]]) solid.push(P(boxAt(0.03, 0.5, 0.03, lx, 0.25, lz, '#8E0B1E'), TX, TZ));
    solid.push(P(colorize(new THREE.CylinderGeometry(0.11, 0.09, 0.02, 12).translate(-0.13, 0.53, 0), '#F2F2F2'), TX, TZ));
    [['#F28C28', 0], ['#7DBB3C', 1], ['#F2C200', 2], ['#D9442B', 3]].forEach(([c, k]) => solid.push(P(colorize(new THREE.SphereGeometry(0.04, 8, 6).translate(-0.15 + (k % 2) * 0.05, 0.57 + Math.floor(k / 2) * 0.04, -0.02 + (k % 2) * 0.04), c), TX, TZ)));
    solid.push(P(colorize(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8).translate(0.12, 0.6, 0.06), '#3A6FB0'), TX, TZ), P(colorize(new THREE.IcosahedronGeometry(0.08, 0).translate(0.12, 0.74, 0.06), '#F2C200'), TX, TZ));
    solid.push(P(colorize(new THREE.CylinderGeometry(0.06, 0.05, 0.06, 10).translate(0.05, 0.55, -0.1), '#C9A227'), TX, TZ));
    for (const dx of [-0.02, 0, 0.02]) solid.push(P(boxAt(0.006, 0.2, 0.006, 0.05 + dx, 0.66, -0.1, '#B5122B'), TX, TZ));
    g.add(new THREE.Mesh(mergeAll(solid), vmat({ roughness: 0.75 })));
    // the flames: a few tongues of fire licking out of the drum, flickering
    const fire = new THREE.Group(); fire.position.set(X(BX), 0.48, BZ); g.add(fire);
    const fm = [new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.25), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.0, 0.5), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })];
    const tongues = [0, 1, 2, 3, 4, 5].map((k) => { const t = new THREE.Mesh(new THREE.ConeGeometry(0.085 - (k % 2) * 0.025, 0.42, 6).translate(0, 0.21, 0), fm[k % 2]); t.position.set(Math.cos(k * 1.1) * 0.09, 0, Math.sin(k * 1.1) * 0.09); fire.add(t); return t; });
    // and a glow over the drum's mouth: an ember-red disc that brightens and dims with the flames
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.15), toneMapped: false })); ember.position.set(X(BX), 0.47, BZ); g.add(ember);
    const smoke = puffs(G, 5, { size: 0.7, rise: 2.4, period: 3.4, color: '#6E6A66' }), incense = puffs(G, 2, { size: 0.16, rise: 0.7, period: 2.4, color: '#EDEDED' });
    const top = at(BX, BZ, 0.85), stick = at(TX + 0.05, TZ - 0.1, 0.78);
    const [who] = crowd.take(1);
    if (who != null) crowd.dress(who, { shirt: ['#8E5B9A', '#C9B79C'][parts.length % 2], hair: '#3A332E', pants: '#2B2B2B' });
    { const b = at(BX, BZ); spots.push([b.x, b.z, 1.6]); }
    const stand = at(BX - 0.5, BZ - 0.45), face = Math.atan2(-0.45, X(0.5));   // (behind the drum, facing it)
    parts.push({
      when: [[7.5, 9], [17.5, 19]], at: [f.x, f.z],
      update(t) {
        g.visible = true;
        tongues.forEach((m, k) => { const s = 0.75 + 0.35 * Math.sin(t * (9 + k * 2.3) + k) + 0.15 * Math.sin(t * 23 + k * 4); m.scale.set(1, Math.max(0.3, s), 1); m.rotation.z = Math.sin(t * 5 + k) * 0.2; });
        smoke.show(t, top.x, top.y + 0.1, top.z); incense.show(t, stick.x, stick.y, stick.z);
        // stooped by the drum, a sheet in now and then
        const feed = Math.max(0, Math.sin(t * 1.4)) ** 2;
        if (who != null) crowd.pose(who, { x: stand.x, y: GY + 0.12, z: stand.z, yaw: yaw + face, lean: -0.3 - feed * 0.15, arms: [[0.8, -0.1], [0.85 + feed * 0.6, -0.15]] });
      },
      off() { g.visible = false; smoke.show(0, 0, 0, 0, false); incense.show(0, 0, 0, 0, false); if (who != null) crowd.hide(who); },
    });
  }
  // only on the day: the date looked at once a minute of the office clock
  let day = false, dayAt = -1e9;
  const run = stepper(parts);
  return {
    update(dt, t, h) {
      if (t - dayAt > 60 || t < dayAt) { dayAt = t; const n = lunarDay(officeNow()); day = FORCE || n === 1 || n === 15; }
      run(dt, t, day ? h : -1);   // (not the day: as if out of hours)
    },
    spots,   // (where the bins stand: the power poles keep off)
    debug: () => ({ lunar: lunarDay(officeNow()), shops: shops.map((f) => [+f.x.toFixed(1), +f.z.toFixed(1), f.dir]) }),
  };
}
