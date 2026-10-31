// Electric scooters and the battery-swap cabinet on the corner (city backdrop). Half the office's own scooters in the
// row on the pavement are electric (people/outings.js): the smooth body of the e-scooters Vietnam rides in 2026, a wide
// LED headlight across the apron, the round dash between the bars, a hub motor in the back wheel and no exhaust, and a
// five-bar battery gauge on the dash (and on the side of the body). The gauges follow this computer's battery (server:
// pmset on macOS, /sys on Linux; hidden where there is none, as on Windows or a desktop), each bike a little above or
// below it; green, amber under half, red under a fifth; while the computer charges they fill up one bar after another.
// On a park's corner across the street stands a battery-swap cabinet, V-Green's kind: a white cabinet with the green
// band and the name, two columns of lockers with their status lights (green: charged, amber: charging), the screen
// and the QR code in the middle, a little roof; 9.000đ a swap, a 1.5 kWh pack in two or three minutes. When a bike in
// the row drops under 20%, its owner rides it there to swap (people/evswap.js). In Hà Nội, the sign of the low
// emission zone inside Ring Road 1 (from 1 July 2026) stands at a corner near the office. The cabinet and the sign are
// drawn here, no artwork of V-Green's (the name is its owner's trademark). ?debug: street.evDebug; ?battery=15
// (?battery=15c: charging) pretends a reading.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, officeNow } from '../../core/env.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { wx } from '../../life/weather.js';
import { sfx } from '../../audio/sfx.js';
import { toast } from '../../ui/activity.js';
import { LAWN, PAVE, inside } from './street-spots.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

export const SWAP = { price: 9, kwh: 1.5, mins: [2, 3] };   // a swap: thousands of đồng, the pack, how long
export const LEZ_FROM = new Date(2026, 6, 1);   // Hà Nội's low emission zone inside Ring Road 1, from 1 July 2026
const FONT = '"Be Vietnam Pro", system-ui, sans-serif', GREEN = '#00A651';
const BIKES = 12, SEG = 5, Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
const Q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PRETEND = Q0.get('battery');   // (?battery=15 or 15c)
const W = (g) => colorize(g, '#FFFFFF');   // painted per instance
const at = (g, x, y, z) => g.translate(x, y, z);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UPY = new THREE.Vector3(0, 1, 0);
function bar(a, b, r, color, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  return colorize(new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPY, d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), color);
}

/* ---------- an e-scooter (nose along +x, wheels on y = 0; the petrol one's size, so a rider sits it the same) ---------- */
function evParts() {
  const body = [
    W(at(new RoundedBoxGeometry(0.14, 0.7, 0.44, 2, 0.07).rotateZ(0.2), 0.48, 0.74, 0)),       // the apron
    W(at(new RoundedBoxGeometry(0.26, 0.14, 0.44, 2, 0.06), 0.56, 1.11, 0)),                    // the bars' cover
    W(at(new RoundedBoxGeometry(0.4, 0.08, 0.17, 2, 0.035).rotateZ(-0.3), 0.66, 0.58, 0)),      // the front mudguard
    W(at(new RoundedBoxGeometry(0.92, 0.3, 0.36, 2, 0.13), -0.37, 0.6, 0)),                     // the rear body
    W(at(new RoundedBoxGeometry(0.42, 0.14, 0.3, 2, 0.06).rotateZ(0.18), -0.72, 0.5, 0)),       // its tail, swept up
  ];
  const trim = [
    boxAt(0.5, 0.05, 0.34, 0.1, 0.36, 0, '#2B2F36'), colorize(at(new RoundedBoxGeometry(0.74, 0.1, 0.32, 2, 0.045), -0.3, 0.8, 0), '#1C1E22'),   // floorboard, seat
    boxAt(0.86, 0.05, 0.37, -0.36, 0.48, 0, '#3A3F47'),                                                     // a dark band round the body
    boxAt(0.03, 0.05, 0.36, 0.555, 0.92, 0, '#EAF6FF'),                                                      // the LED headlight across the apron
    colorize(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16).rotateZ(Math.PI / 2 - 0.5).translate(0.5, 1.2, 0), '#15171A'),   // the round dash
    boxAt(0.03, 0.035, 0.28, -0.82, 0.58, 0, '#E8202A'), boxAt(0.02, 0.08, 0.16, -0.84, 0.44, 0, '#F2F2F2'),   // the tail light, the plate
    bar(V3(0.64, 0.28, 0), V3(0.55, 1.04, 0), 0.028, '#2B2F36'), bar(V3(0.5, 1.13, -0.3), V3(0.5, 1.13, 0.3), 0.02, '#2B2F36'),
  ];
  for (const s of [-1, 1]) trim.push(bar(V3(0.52, 1.14, s * 0.2), V3(0.5, 1.32, s * 0.27), 0.008, '#1C1E22'), boxAt(0.02, 0.05, 0.1, 0.5, 1.34, s * 0.28, '#1C1E22'));
  for (const [x, hub] of [[0.62, 0.11], [-0.6, 0.16]]) {   // (the hub motor: a bigger hub at the back)
    trim.push(colorize(at(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16).rotateX(Math.PI / 2), x, 0.25, 0), '#16181C'));
    trim.push(colorize(at(new THREE.CylinderGeometry(hub, hub, x < 0 ? 0.14 : 0.11, 12).rotateX(Math.PI / 2), x, 0.25, 0), x < 0 ? '#6B737C' : '#9AA2AD'));
  }
  return { body, trim };
}
// where a gauge's bars sit on a bike: five on the dash (facing up and back, for the office's view) and five along the
// rear body's side (for walking past)
const DASH = [...Array(SEG).keys()].map((k) => new THREE.Matrix4().compose(V3(0.49, 1.222, -0.05 + k * 0.025), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5), V3(1, 1, 1)));
const SIDE = [...Array(SEG).keys()].flatMap((k) => [1, -1].map((s) => new THREE.Matrix4().compose(V3(-0.62 + k * 0.07, 0.64, s * 0.183), new THREE.Quaternion(), V3(1, 1, 1))));   // (both sides)
const LEVEL = (pct) => (pct >= 50 ? '#3DDC84' : pct >= 20 ? '#F2B544' : '#FF5F5F');

/* ---------- the printing: the cabinet's front and side, the low emission zone's sign ---------- */
const RC = { front: [0, 0, 512, 640], side: [512, 0, 256, 640], lez: [768, 0, 256, 320] };
function qr(g, x, y, s, seed) {
  g.fillStyle = '#FFFFFF'; g.fillRect(x, y, s, s); const n = 21, c = s / n; let r = seed;
  g.fillStyle = '#111111';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { r = (r * 9301 + 49297) % 233280; if (r / 233280 > 0.55) g.fillRect(x + i * c, y + j * c, c, c); }
  for (const [a, b] of [[0, 0], [n - 7, 0], [0, n - 7]]) { g.fillStyle = '#111111'; g.fillRect(x + a * c, y + b * c, 7 * c, 7 * c); g.fillStyle = '#FFFFFF'; g.fillRect(x + (a + 1) * c, y + (b + 1) * c, 5 * c, 5 * c); g.fillStyle = '#111111'; g.fillRect(x + (a + 2) * c, y + (b + 2) * c, 3 * c, 3 * c); }
}
function bolt(g, x, y, s, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x + s * 0.1, y - s * 0.5); g.lineTo(x - s * 0.3, y + s * 0.08); g.lineTo(x - s * 0.02, y + s * 0.08); g.lineTo(x - s * 0.12, y + s * 0.5); g.lineTo(x + s * 0.3, y - s * 0.1); g.lineTo(x + s * 0.02, y - s * 0.1); g.closePath(); g.fill(); }
function drawEv(g) {
  g.clearRect(0, 0, 1024, 640);
  { const [x, y, w, h] = RC.front;
    g.fillStyle = '#F4F6F5'; g.fillRect(x, y, w, h);
    g.fillStyle = GREEN; g.fillRect(x, y, w, 96);
    bolt(g, x + 50, y + 48, 54, '#FFFFFF');
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 52px ${FONT}`; g.fillText('V-GREEN', x + 88, y + 44, 260);
    g.font = `700 20px ${FONT}`; g.fillText('TRẠM ĐỔI PIN', x + 352, y + 34, 150); g.fillText('XE MÁY ĐIỆN', x + 352, y + 62, 150);
    // two columns of five lockers, the screen and the QR between them
    const lock = (lx, ly, k) => {
      g.fillStyle = '#DDE2E0'; g.fillRect(lx, ly, 120, 92); g.strokeStyle = '#B9C0BD'; g.lineWidth = 3; g.strokeRect(lx + 2, ly + 2, 116, 88);
      g.fillStyle = '#C9CFCC'; g.fillRect(lx + 92, ly + 34, 10, 26);   // the handle
      const st = k % 5 === 3 ? '#F2B544' : '#3DDC84';
      g.fillStyle = st; g.beginPath(); g.arc(lx + 22, ly + 22, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5E6A66'; g.font = `700 16px ${FONT}`; g.textAlign = 'left'; g.fillText(String(k + 1).padStart(2, '0'), lx + 38, ly + 24);
    };
    for (let r = 0; r < 5; r++) { lock(x + 14, y + 112 + r * 102, r); lock(x + w - 134, y + 112 + r * 102, r + 5); }
    const sx = x + 148, sw = w - 296;
    g.fillStyle = '#1E2A33'; g.fillRect(sx, y + 112, sw, 190);
    g.fillStyle = '#E8F7EE'; g.fillRect(sx + 10, y + 122, sw - 20, 170);
    g.fillStyle = GREEN; g.fillRect(sx + 10, y + 122, sw - 20, 36);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.font = `800 20px ${FONT}`; g.fillText('ĐỔI PIN', sx + sw / 2, y + 141);
    g.fillStyle = '#16301F'; g.font = `700 18px ${FONT}`; g.fillText('Quét mã QR', sx + sw / 2, y + 180); g.fillText('để mở tủ', sx + sw / 2, y + 204);
    g.fillStyle = GREEN; g.font = `900 30px ${FONT}`; g.fillText('9.000đ', sx + sw / 2, y + 246); g.fillStyle = '#5E6A66'; g.font = `600 15px ${FONT}`; g.fillText('/ lần đổi · 1,5 kWh', sx + sw / 2, y + 272);
    qr(g, sx + (sw - 150) / 2, y + 322, 150, 77);
    g.fillStyle = '#16301F'; g.font = `700 16px ${FONT}`; g.fillText('2–3 phút · 24/7', sx + sw / 2, y + 496);
    g.fillStyle = '#B9C0BD'; g.fillRect(sx + 20, y + 520, sw - 40, 60); g.fillStyle = '#1E2A33'; g.fillRect(sx + 40, y + 540, sw - 80, 12);   // (the card reader)
  }
  { const [x, y, w, h] = RC.side; g.fillStyle = '#F4F6F5'; g.fillRect(x, y, w, h); g.fillStyle = GREEN; g.fillRect(x, y, w, 96);
    bolt(g, x + w / 2, y + 48, 60, '#FFFFFF');
    g.fillStyle = '#16301F'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 30px ${FONT}`; g.fillText('ĐỔI PIN', x + w / 2, y + 150); g.fillText('2 PHÚT', x + w / 2, y + 190);
    g.font = `600 18px ${FONT}`; g.fillText('Không cần chờ sạc', x + w / 2, y + 240, w - 20);
    g.fillStyle = GREEN; g.fillRect(x + 30, y + 290, w - 60, 4); g.fillStyle = '#5E6A66'; g.font = `600 16px ${FONT}`; g.fillText('V-GREEN', x + w / 2, y + 320); }
  // the low emission zone's sign: blue, white letters, a scooter and a car with the exhaust crossed out
  { const [x, y, w, h] = RC.lez; g.fillStyle = '#1F5FB4'; g.fillRect(x, y, w, h); g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 28px ${FONT}`; g.fillText('VÙNG', x + w / 2, y + 48); g.fillText('PHÁT THẢI THẤP', x + w / 2, y + 82, w - 30);
    g.beginPath(); g.arc(x + w / 2, y + 160, 50, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.strokeStyle = '#D8262E'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#1E2125'; g.beginPath(); g.arc(x + w / 2 - 22, y + 175, 10, 0, Math.PI * 2); g.arc(x + w / 2 + 22, y + 175, 10, 0, Math.PI * 2); g.fill(); g.fillRect(x + w / 2 - 26, y + 152, 50, 16);
    g.fillStyle = '#9AA2AD'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + w / 2 - 44 - i * 6, y + 168 - i * 8, 5 + i, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#D8262E'; g.lineWidth = 8; g.beginPath(); g.moveTo(x + w / 2 - 35, y + 125); g.lineTo(x + w / 2 + 35, y + 195); g.stroke();
    g.fillStyle = '#FFFFFF'; g.font = `700 20px ${FONT}`; g.fillText('Trong Vành đai 1', x + w / 2, y + 240); g.fillText('Từ 01/7/2026', x + w / 2, y + 270); }
}

/** finder: street-spots.js; place(L, s, side, m4) puts a scooter standing in lane L's kerb at s into m4 */
export function buildEv(G, { finder, low, riderParts, place }) {
  /* the office's e-scooters, parked (and one or two out riding): one instanced mesh each for the body and the trim */
  const N = BIKES + 3, P = evParts();
  const paintM = vmat({ roughness: 0.3, metalness: 0.25 }), trimM = vmat({ roughness: 0.5, metalness: 0.2 });
  const body = new THREE.InstancedMesh(mergeAll(P.body), paintM, N), trim = new THREE.InstancedMesh(mergeAll(P.trim), trimM, N);
  for (const o of [body, trim]) { o.frustumCulled = false; for (let i = 0; i < N; i++) o.setMatrixAt(i, Z0); G.add(o); }
  body.castShadow = !low;
  // the gauges' bars: ten a bike, coloured by the charge
  const segM = new THREE.MeshBasicMaterial({ toneMapped: false }), gauge = (geo, k = 1) => { const o = new THREE.InstancedMesh(geo, segM, N * SEG * k); o.frustumCulled = false; for (let i = 0; i < o.count; i++) o.setMatrixAt(i, Z0); o.setColorAt(0, new THREE.Color('#2A2F36')); G.add(o); return o; };
  const segs = gauge(new THREE.BoxGeometry(0.006, 0.012, 0.02)), sideSegs = gauge(new THREE.BoxGeometry(0.055, 0.022, 0.006), 2);
  // a rider on one out on the street (the traffic draws none for it: `ownAll`)
  const rp = riderParts(false), clothM = vmat({ roughness: 0.8 });
  const rCloth = new THREE.InstancedMesh(mergeAll(rp.cloth), clothM, 3), rTrim = new THREE.InstancedMesh(mergeAll(rp.trim), vmat({ roughness: 0.8 }), 3);
  for (const o of [rCloth, rTrim]) { o.frustumCulled = false; for (let i = 0; i < 3; i++) o.setMatrixAt(i, Z0); G.add(o); }
  const bikes = Array.from({ length: N }, () => ({ on: false, m: new THREE.Matrix4(), seed: 0, full: '', ride: null }));
  const free = [...Array(BIKES).keys()].map((k) => k + 3), rideFree = [0, 1, 2];   // (the riding ones first)
  // each mesh drawn only up to the highest one out (a zero-scaled instance still costs its triangles)
  const counts = () => { let top = 0; bikes.forEach((b, i) => { if (b.on || b.ride) top = i + 1; }); body.count = trim.count = top; segs.count = top * SEG; sideSegs.count = top * SEG * 2; const r = bikes.slice(0, 3).some((b) => b.ride) ? 3 : 0; rCloth.count = rTrim.count = r; };
  counts();
  const col = new THREE.Color(), M = new THREE.Matrix4();
  let bat = null, dirty = true, shownAt = -1;
  // a bike's charge: the computer's, give or take (each its own), or full after a swap today
  const levelOf = (i) => { const b = bikes[i]; if (!bat) return null; if (b.full === officeNow().toDateString()) return 100; return Math.max(3, Math.min(100, Math.round(bat.pct + ((b.seed % 23) - 11)))); };
  function paint(i, t) {
    const lv = levelOf(i), b = bikes[i], n = lv == null ? 0 : Math.max(1, Math.ceil(lv / 20)), c = lv == null ? '#2A2F36' : LEVEL(lv);
    const charging = !!bat?.charging && b.full !== officeNow().toDateString(), sweep = charging ? Math.floor(t * 2.5) % (SEG - n + 1) : -1;
    for (let k = 0; k < SEG; k++) {
      const lit = k < n || (charging && k === n + sweep - 1 && k >= n);
      col.set(lit ? (charging && k >= n ? '#3DDC84' : c) : '#2A2F36');
      segs.setColorAt(i * SEG + k, col); sideSegs.setColorAt((i * SEG + k) * 2, col); sideSegs.setColorAt((i * SEG + k) * 2 + 1, col);
    }
  }
  function draw(i) {
    const b = bikes[i];
    body.setMatrixAt(i, b.on ? b.m : Z0); trim.setMatrixAt(i, b.on ? b.m : Z0);
    for (let k = 0; k < SEG; k++) {
      segs.setMatrixAt(i * SEG + k, b.on && bat ? M.multiplyMatrices(b.m, DASH[k]) : Z0);
      for (const j of [0, 1]) sideSegs.setMatrixAt((i * SEG + k) * 2 + j, b.on && bat ? M.multiplyMatrices(b.m, SIDE[k * 2 + j]) : Z0);
    }
    body.instanceMatrix.needsUpdate = trim.instanceMatrix.needsUpdate = segs.instanceMatrix.needsUpdate = sideSegs.instanceMatrix.needsUpdate = true;
  }
  /** an e-scooter standing at lane L's kerb at s, painted `color` (seed: its owner's, for its share of the charge) */
  function park(L, s, side, color, seed = 0) {
    const i = free.shift(); if (i == null) return -1;
    const b = bikes[i]; place(L, s, side, b.m); b.on = true; b.seed = seed; counts();
    body.setColorAt(i, col.set(color)); body.instanceColor.needsUpdate = true;
    draw(i); paint(i, 0); dirty = true;
    return i;
  }
  function unpark(i) { const b = bikes[i]; if (!b?.on) return; b.on = false; draw(i); free.push(i); free.sort((a, c) => a - c); counts(); }

  /* ---------- the battery-swap cabinet on a park's corner ---------- */
  const f = finder.find({ len: 2.2, depth: 0.8, d: 1.75, lawn: true, corner: true }) || finder.find({ len: 2.2, depth: 0.8, d: 1.75, lawn: true });
  let cab = null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const repaint = () => { drawEv(canvas.getContext('2d')); tex.needsUpdate = true; };
  repaint(); document.fonts?.ready.then(repaint);
  const plane = (w, h, [rx, ry, rw, rh]) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 640); return p; };
  const printM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0.25, roughness: 0.5 });
  const bubble = (() => { const d = el('div', 'tag shop-say ev-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  let now = 0, swaps = 0, doorOpen = 0, doorK = 2;
  if (f) {
    const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(f.M); G.add(Q);
    const CW = 1.5, CH = 2.0, CD = 0.62, parts = [];
    parts.push(boxAt(CW + 0.3, 0.12, CD + 0.3, 0, 0.06, 0, '#A9AEB4'));   // the plinth
    parts.push(boxAt(CW, CH, CD, 0, 0.12 + CH / 2, 0, '#E9EDEB'));
    parts.push(boxAt(CW + 0.36, 0.06, CD + 0.5, 0, 0.12 + CH + 0.2, 0.08, '#DCE2DF'), boxAt(CW + 0.36, 0.03, CD + 0.5, 0, 0.12 + CH + 0.16, 0.08, GREEN));   // the little roof
    for (const s of [-1, 1]) parts.push(boxAt(0.05, 0.22, 0.05, s * (CW / 2 + 0.12), 0.12 + CH + 0.08, CD / 2 + 0.25, '#B9C0BD'));
    parts.push(boxAt(0.5, 0.06, 0.1, 0, 0.12 + 0.9, CD / 2 + 0.05, '#C9CFCC'));   // a ledge under the screen (for the phone)
    const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.5, metalness: 0.15 })); base.castShadow = !low; base.receiveShadow = true; Q.add(base);
    Q.add(new THREE.Mesh(mergeAll([plane(CW, CH, RC.front).translate(0, 0.12 + CH / 2, CD / 2 + 0.002), plane(CD, CH, RC.side).rotateY(Math.PI / 2).translate(CW / 2 + 0.002, 0.12 + CH / 2, 0), plane(CD, CH, RC.side).rotateY(-Math.PI / 2).translate(-CW / 2 - 0.002, 0.12 + CH / 2, 0)]), printM));
    // the locker that opens for a swap: its door (hinged at its left), and the pack inside
    const door = new THREE.Group(); door.position.set(CW / 2 - 0.354, 0.12 + CH - 0.33 - doorK * 0.32, CD / 2 + 0.01); Q.add(door);
    door.add(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.27, 0.02, 1, 0.006).translate(0.17, 0, 0), new THREE.MeshStandardMaterial({ color: '#DDE2E0', roughness: 0.5 })));
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3).translate(0.17, -0.02, -0.18), new THREE.MeshStandardMaterial({ color: '#2B2F36', roughness: 0.5 }));
    Q.add(pack); pack.position.copy(door.position); pack.visible = false;
    const W2 = (lx, lz, ly = 0) => f.at(lx, lz, ly), PV = PAVE - LAWN;
    cab = { f, Q, door, pack, W: W2, CD, front: () => { const a = W2(0.25, CD / 2 + 0.45, PV + 0.06), b = W2(0.25, 0); return { x: a.x, z: a.z, y: a.y, face: Math.atan2(b.x - a.x, b.z - a.z) }; },
      // where the scooter stops: at the kerb in front, along the lane
      kerb: () => ({ L: f.L, s: f.s + (f.L ? 0.9 * (f.L.axis === 'x' ? f.e.along[0] : f.e.along[1]) : 0) }) };
  }
  // the low emission zone's sign in Hà Nội, at a corner near the office
  const g2 = finder.find({ len: 0.6, depth: 0.4, d: 0.45, corner: true });
  let lez = null;
  if (g2) {
    lez = new THREE.Group(); lez.matrixAutoUpdate = false; lez.matrix.copy(g2.M); G.add(lez);
    lez.add(new THREE.Mesh(mergeAll([colorize(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8).translate(0, 1.3, 0), '#9AA2AD'), boxAt(0.72, 0.92, 0.03, 0, 2.15, -0.02, '#C9CED6')]), vmat({ roughness: 0.4, metalness: 0.5 })));
    lez.add(new THREE.Mesh(plane(0.7, 0.88, RC.lez).translate(0, 2.15, 0.0), printM));
    lez.visible = false;
  }

  /* ---------- each frame: the gauges (when the reading or the bars change), the cabinet's door ---------- */
  const readBattery = (snap) => {
    if (PRETEND) return { pct: Number.parseFloat(PRETEND), charging: /c$/.test(PRETEND), ac: /c$/.test(PRETEND) };
    const b = snap?.battery; return b && Number.isFinite(b.pct) ? { pct: b.pct, charging: !!b.charging, ac: !!b.ac } : null;
  };
  let lastSig = '', checkAt = -1, inView = false;
  let snap = null;
  function update(dt, t) {
    now = t;
    if (t - checkAt > 1 || t < checkAt) {
      checkAt = t;
      const nb = readBattery(snap), sig = nb ? `${Math.round(nb.pct)}|${nb.charging}` : '';
      if (sig !== lastSig) { lastSig = sig; const had = !!bat; bat = nb; dirty = true; if (had !== !!bat) for (let i = 0; i < N; i++) if (bikes[i].on) draw(i); }
      inView = bikes.some((b) => b.on) && seen(bikes.find((b) => b.on).m.elements[12], bikes.find((b) => b.on).m.elements[14]);
      const hn = wx.city === 'hn' && officeNow() >= LEZ_FROM; if (lez && lez.visible !== hn) lez.visible = hn;
      printM.emissiveIntensity = (() => { const h = officeNow().getHours(); return h < 6 || h >= 18 ? 0.9 : 0.25; })();
    }
    if (bubble.visible && t > bubble.until) { bubble.visible = false; bubble.element.hidden = true; }
    // the gauges: on a change, or (charging, in view) twice a second for the filling bars
    if (dirty || (bat?.charging && inView && t - shownAt > 0.5)) {
      dirty = false; shownAt = t;
      for (let i = 0; i < N; i++) if (bikes[i].on) paint(i, t);
      segs.instanceColor.needsUpdate = sideSegs.instanceColor.needsUpdate = true;
    }
    if (cab) { const want = doorOpen > t ? -1.9 : 0; cab.door.rotation.y += (want - cab.door.rotation.y) * Math.min(1, dt * 4); cab.pack.visible = doorOpen > t && cab.door.rotation.y < -0.6; }
  }
  /* what people/evswap.js needs: the bikes' charge, a bike made full, the cabinet's spots, its door, a word there; and
     an e-scooter look for one out riding (the traffic's own vehicle, drawn here) */
  const sayAt = (p, text) => { bubble.position.set(p.x, p.y + 1.95, p.z); bubble.element.textContent = text; bubble.element.hidden = false; bubble.visible = true; bubble.until = now + 2.8; };
  const Qs = {
    // the computer's battery, from the Mac panel's reading (people/evswap.js passes it on)
    reading(s) { snap = s; },
    battery: () => bat,
    level: (i) => levelOf(i),
    fill(i) { if (bikes[i]) { bikes[i].full = officeNow().toDateString(); dirty = true; } },
    cabinet: () => (cab ? { front: cab.front(), kerb: cab.kerb() } : null),
    open(secs) { doorOpen = now + secs; sfx.play('beep'); },
    pay() { swaps++; sfx.play('coin'); },
    say: (text) => { if (cab) sayAt(cab.front(), text); },
    // a traffic vehicle (callRider/depart's handle.vehicle) drawn as an e-scooter with its rider, until it is out of sight
    // and done with
    ride(h, color, jacket) {
      const v = h?.vehicle, i = rideFree.shift(); if (!v || i == null) return false;
      body.setColorAt(i, col.set(color)); body.instanceColor.needsUpdate = true; rCloth.setColorAt(i, col.set(jacket)); rCloth.instanceColor.needsUpdate = true;
      v.ownAll = true; bikes[i].ride = h; counts();
      v.deco = (m4) => {
        if (!v.special) { Qs.unride(h); return; }   // (out of sight and done with: the traffic's own again)
        body.setMatrixAt(i, m4); trim.setMatrixAt(i, m4); rCloth.setMatrixAt(i, m4); rTrim.setMatrixAt(i, m4);
        body.instanceMatrix.needsUpdate = trim.instanceMatrix.needsUpdate = rCloth.instanceMatrix.needsUpdate = rTrim.instanceMatrix.needsUpdate = true;
      };
      return true;
    },
    // done with it: the traffic's vehicle back to itself
    unride(h) {
      const i = bikes.findIndex((b) => b.ride === h); if (i < 0) return;
      const v = h.vehicle; if (v) { v.ownAll = false; v.deco = null; }
      bikes[i].ride = null; body.setMatrixAt(i, Z0); trim.setMatrixAt(i, Z0); rCloth.setMatrixAt(i, Z0); rTrim.setMatrixAt(i, Z0);
      body.instanceMatrix.needsUpdate = trim.instanceMatrix.needsUpdate = rCloth.instanceMatrix.needsUpdate = rTrim.instanceMatrix.needsUpdate = true;
      rideFree.push(i); counts();
    },
  };
  return {
    park, unpark, update,
    blocked: (x, z, r) => !!cab && inside(cab.f, x, z, r, -0.95, 0.95, -0.45, 0.45),
    // in first person: at the cabinet, its price
    spots: () => (cab ? [{ kind: 'evswap', ...(() => { const p = cab.front(); return { x: p.x, z: p.z }; })(), label: tr('fp.evswap', { price: `${SWAP.price}.000đ` }), act: () => { doorOpen = now + 4; sfx.play('beep'); toast(tr('fp.evswapDone', { n: bikes.filter((b) => b.on).length })); } }] : []),
    office: Qs,
    debug: { // where to stand to see the sign (for pictures): out in front of it, looking at it
      lez: () => { if (!lez) return null; const a = g2.at(0.6, 3.0), b = g2.at(0, 0); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; },
      state: () => ({ battery: bat, bikes: bikes.map((b, i) => (b.on ? { i, level: levelOf(i), full: !!b.full, at: [+b.m.elements[12].toFixed(1), +b.m.elements[14].toFixed(1)] } : null)).filter(Boolean), riding: bikes.filter((b) => b.ride).length, swaps, cabinet: cab ? [+cab.f.x.toFixed(1), +cab.f.z.toFixed(1)] : null, lez: !!lez?.visible }),
      view: (far = 1) => { if (!cab) return null; const a = cab.W(0.6 + 0.8 * far, 2.6 + 1.8 * far), b = cab.W(0, 0); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; } },
  };
}
