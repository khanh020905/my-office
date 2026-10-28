// Pieces shared by the countryside and beach backdrops.
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { GY, cPick, cR, colorize, mergeAll } from '../terrace.js';
import { poolTex } from './city.js';
import { REACH } from '../layout.js';

/* ---------- shared pieces for the countryside and beach backdrops ---------- */
// Screen-space rule shared with the city: tall things only behind the office (depth = x + z very negative), far to the
// sides, or low in front, so nothing ever covers the room. `s` (x - z) runs left-right on screen, `d` (x + z) up-down.
export const sdToXZ = (s, d) => [(d + s) / 2, (d - s) / 2];
export const nearOffice = (x, z, m = 2.5) => { const R = REACH(); return x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m; };
export function tallOk(x, z, h = 6) {
  if (nearOffice(x, z)) return false;
  const d = x + z, s = x - z;
  return d < -20 || (Math.abs(s) > 27 && d < 14) || (d >= 14 && Math.abs(s) > 21 && h < 4) || (d > 26 && h < 2.5);
}
// A flat strip that follows a polyline on the ground (paths, rivers, foam lines). y(t) lets it dip or rise along its width.
export function ribbon(pts, width, y, color, across = () => 0) {
  const pos = [], uv = [], idx = [], n = pts.length;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(n - 1, i + 1)];
    let tx = nx - px, tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i) len += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    for (const k of [-1, 1]) { pos.push(x - tz * k * width / 2, y + across(k), z + tx * k * width / 2); uv.push((k + 1) / 2, len / width); }
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // faces up
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return color ? colorize(g, color) : g;
}
export const curvePts = (ctrl, step = 1.5) => { const c = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z))); return c.getSpacedPoints(Math.max(8, Math.round(c.getLength() / step))).map((v) => [v.x, v.z]); };
export const distToPolyline = (x, z, pts) => { let best = Infinity; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz)); } return best; };
export const prism = (w, h, d) => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
export const geoAt = (g, x, y, z, c, ry = 0) => colorize(g.rotateY(ry).translate(x, y, z), c);
export const waterTex = (base, line) => { const t = canvasTex(256, 256, (g) => { g.fillStyle = base; g.fillRect(0, 0, 256, 256); g.strokeStyle = line; g.lineWidth = 2; for (let i = 0; i < 46; i++) { const x = cR(0, 256), y = cR(0, 256), w = cR(14, 40); g.globalAlpha = cR(0.25, 0.7); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
// Low-poly trees shared by both backdrops (all vertex-coloured, merged by the caller).
export function roundTree(out, x, z, s = 1) {
  out.push(geoAt(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.6 * s, 6), x, GY + 0.8 * s, z, '#6A4E36'));
  const c = cPick(['#4E7F3B', '#5B8C43', '#46743A', '#6A9A4C']);
  out.push(geoAt(new THREE.IcosahedronGeometry(1.1 * s, 1), x, GY + 2.2 * s, z, c));
  out.push(geoAt(new THREE.IcosahedronGeometry(0.8 * s, 1), x + 0.5 * s, GY + 2.8 * s, z - 0.3 * s, c));
}
export function palm(out, x, z, s = 1, lean = cR(-0.35, 0.35)) {
  let px = x, pz = z, py = GY; const dir = cR(0, Math.PI * 2);
  for (let i = 0; i < 7; i++) {
    const nx = px + Math.cos(dir) * lean * 0.35 * s * (i / 6), nz = pz + Math.sin(dir) * lean * 0.35 * s * (i / 6);
    out.push(geoAt(new THREE.CylinderGeometry(0.17 * s * (1 - i * 0.06), 0.2 * s * (1 - i * 0.06), 1.05 * s, 7), (px + nx) / 2, py + 0.5 * s, (pz + nz) / 2, i % 2 ? '#8A6B48' : '#7A5D3E'));
    px = nx; pz = nz; py += 1.0 * s;
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + cR(-0.2, 0.2), L = cR(2.1, 2.8) * s;
    const leaf = new THREE.BoxGeometry(L, 0.05, 0.55 * s).translate(L / 2, 0, 0).rotateZ(-cR(0.25, 0.55)).rotateY(a);
    out.push(geoAt(leaf, px, py, pz, cPick(['#4F8A3A', '#5E9A40', '#457C35'])));
  }
  out.push(geoAt(new THREE.IcosahedronGeometry(0.3 * s, 0), px, py - 0.15, pz, '#6B5232'));
}
export function karst(out, x, z, r, h, c = '#557A49') {
  const g = new THREE.SphereGeometry(r, 14, 12); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const bulge = 1 + 0.12 * Math.sin(p.getX(i) * 0.9 + y * 0.7) * Math.cos(p.getZ(i) * 0.8); p.setXYZ(i, p.getX(i) * bulge, y, p.getZ(i) * bulge); }
  g.scale(1, h / r, 1); g.computeVertexNormals();
  out.push(geoAt(g, x, GY - h * 0.08, z, c));
  out.push(geoAt(new THREE.SphereGeometry(r * 0.45, 10, 8).scale(1, 0.5, 1), x + r * 0.15, GY + h * 0.82, z, '#6E9455'));
}
export function nightBits(G, list, color) {
  if (!list.length) return null;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.06, 0.07) });
  const o = new THREE.Mesh(mergeAll(list), m); G.add(o);
  return (on) => m.color.copy(on ? new THREE.Color(color) : new THREE.Color(0.08, 0.08, 0.09));
}
export function poolsAt(G, spots, size = 4.6) {
  if (!spots.length) return null;
  const o = new THREE.Mesh(mergeAll(spots.map(([x, z]) => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(x, GY + 0.06, z))), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  o.renderOrder = 1; G.add(o); return o;
}
export function flyer(G, color, span = 0.9) {
  const g = new THREE.Group(); G.add(g);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.8, 2.2), m));
  const wings = [-1, 1].map((sx) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(span, 0.32).translate(sx * span / 2, 0, 0).rotateX(-Math.PI / 2), m); g.add(w); return w; });
  return { g, wings };
}
