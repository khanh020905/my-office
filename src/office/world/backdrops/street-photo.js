// A Korean-style self photo studio across the street (city backdrop), the kind that opened on every busy street in
// Vietnam's cities in 2024–2026: a pink container on a park's edge, "Chụp ảnh Hàn Quốc" in pink neon over the glass, and
// inside two booths behind their curtains (pink and black; the feet of whoever is in there show under them), each with
// its camera and screen and a ring light, the props table by the door (a basket of cat-ear and bunny-ear headbands,
// giant heart sunglasses, party hats and bucket hats), a mirror, the printer and a wall of sample strips; the price
// board out on the pavement (a 4-frame strip 70k, the big 6-frame one 100k). Young people come in twos and threes in
// the evening and at weekends, when there is a queue along the pavement. When the office releases a version, four of
// them come for a strip (people/photobooth.js). The name is generic and everything is drawn here. ?debug:
// street.photoDebug.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, officeNow } from '../../core/env.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { sfx } from '../../audio/sfx.js';
import { toast } from '../../ui/activity.js';
import { LAWN, PAVE, inside } from './street-spots.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

export const PRICE = [70, 100];   // a 4-frame strip, the big 6-frame print (thousands of đồng)
export const OPEN = [9, 22];
const FONT = '"Be Vietnam Pro", system-ui, sans-serif', PINK = '#F5B8CC', NEON = '#FF4FA3';
const rnd = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dz, dx);   // (figures face +x)
const LOOKS = [['#FFB5C8', '#F4F4F2', '#1E1A18'], ['#F4F4F2', '#2B3A55', '#3A2A20'], ['#B8E3F2', '#2B2F36', '#2B2420'], ['#FFE08A', '#F4F4F2', '#1E1A18'], ['#C9B8FF', '#2B2F36', '#5A3A2A'], ['#2B2F36', '#C9CED6', '#2B2420'], ['#9FE0C0', '#F4F4F2', '#1E1A18'], ['#F28AB2', '#2B3A55', '#3A2A20']];
export const isOpen = (d = officeNow()) => { const h = d.getHours() + d.getMinutes() / 60; return h >= OPEN[0] && h < OPEN[1]; };
export const weekend = (d = officeNow()) => d.getDay() === 0 || d.getDay() === 6;

/* ---------- the printing: the neon sign, the price board, the sample strips, the booths' screens ---------- */
const RP = { sign: [0, 0, 1024, 192], board: [0, 192, 384, 320], samples: [384, 192, 400, 200], screen: [784, 192, 240, 160] };
function neonText(g, text, x, y, size, color = NEON, weight = 800) {
  g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = size * 0.45; g.fillStyle = color; g.fillText(text, x, y);
  g.shadowBlur = size * 0.15; g.fillStyle = '#FFE6F3'; g.fillText(text, x, y); g.shadowBlur = 0;
}
function drawPhoto(g) {
  g.clearRect(0, 0, 1024, 512);
  { const [x, y, w, h] = RP.sign; g.fillStyle = '#2A1420'; g.fillRect(x, y, w, h);
    neonText(g, 'Chụp ảnh Hàn Quốc', x + w / 2, y + 72, 78, NEON, 700);
    neonText(g, '· 4 KHUNG · SELF PHOTO STUDIO ·', x + w / 2, y + 150, 34, '#7FE3FF', 800);
    g.lineWidth = 5; g.strokeStyle = NEON; g.shadowColor = NEON; g.shadowBlur = 14;
    for (const s of [-1, 1]) { const cx = x + w / 2 + s * 440, cy = y + 80; g.beginPath(); g.moveTo(cx, cy + 22); g.bezierCurveTo(cx - 34, cy - 4, cx - 18, cy - 30, cx, cy - 12); g.bezierCurveTo(cx + 18, cy - 30, cx + 34, cy - 4, cx, cy + 22); g.stroke(); }
    g.shadowBlur = 0; }
  { const [x, y, w, h] = RP.board; g.fillStyle = '#FFF4F8'; g.fillRect(x, y, w, h); g.strokeStyle = '#E8327A'; g.lineWidth = 10; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#E8327A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 34px ${FONT}`; g.fillText('BẢNG GIÁ', x + w / 2, y + 42);
    g.fillStyle = '#2B2F36'; g.font = `700 25px ${FONT}`; g.fillText('Dải 4 khung', x + w / 2, y + 96); g.fillStyle = '#E8327A'; g.font = `900 40px ${FONT}`; g.fillText('70.000đ', x + w / 2, y + 136);
    g.fillStyle = '#2B2F36'; g.font = `700 25px ${FONT}`; g.fillText('Khung lớn 6 ảnh', x + w / 2, y + 186); g.fillStyle = '#E8327A'; g.font = `900 40px ${FONT}`; g.fillText('100.000đ', x + w / 2, y + 226);
    g.fillStyle = '#7A6A72'; g.font = `600 19px ${FONT}`; g.fillText('Free phụ kiện · băng đô, kính, nón', x + w / 2, y + 268, w - 24); g.fillText('Mở cửa 9:00 – 22:00', x + w / 2, y + 296, w - 24); }
  // sample strips on the wall: little frames in pastels with faces
  { const [x, y, w, h] = RP.samples; g.fillStyle = '#FBE3EC'; g.fillRect(x, y, w, h);
    const C = ['#FFD6E4', '#D4F2E4', '#E3DAFF', '#FFF0B8'];
    for (let s = 0; s < 8; s++) { const sx = x + 10 + s * 48, sy = y + 12 + (s % 2) * 6; g.fillStyle = '#FFFFFF'; g.fillRect(sx, sy, 40, h - 30);
      for (let f = 0; f < 4; f++) { g.fillStyle = C[(s + f) % 4]; g.fillRect(sx + 4, sy + 4 + f * 40, 32, 34); g.fillStyle = '#F2C9A8'; for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(sx + 13 + k * 14, sy + 23 + f * 40, 6, 0, Math.PI * 2); g.fill(); } } } }
  // a booth's screen: the countdown and the frame guide
  { const [x, y, w, h] = RP.screen; g.fillStyle = '#1E2125'; g.fillRect(x, y, w, h); g.fillStyle = '#FFD6E4'; g.fillRect(x + 12, y + 12, w - 24, h - 24);
    g.fillStyle = '#E8327A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT}`; g.fillText('3', x + w / 2, y + h / 2 + 4); }
}

/** finder: street-spots.js; folk: street-folk.js (its figures made here); far: [x, z, r] to keep clear of */
export function buildPhoto(G, { finder, folk, low, far = [] }) {
  const dead = { update() {}, night() {}, blocked: () => false, spots: () => [], office: null, debug: { state: () => ({ none: true }) } };
  const f = [{ near: 44 }, { near: 62 }].reduce((got, o) => got || finder.find({ len: 5.6, depth: 2.7, d: 2.75, lawn: true, far, ...o }), null);
  if (!f) return dead;
  // the frame: x along the kerb, z out to the street (the kerb at 2.75), y up from the grass
  const W = (lx, lz, ly = 0) => f.at(lx, lz, ly);
  const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(f.M); G.add(Q);
  const X0 = -2.75, X1 = 2.15, Z0 = -1.25, Z1 = 1.15, FL = 0.15, H = 2.75, PV = PAVE - LAWN;
  const DOOR = [1.05, 1.9], B1 = [-2.6, -0.85], B2 = [-0.75, 0.3], BZ = 0.15, CUR = 0.72;   // the door, the booths' x, their curtains' z, the gap under them

  /* the container: walls with their ribs, the corner castings, the floor, the glass front; the booths, the props */
  const parts = [], cyl = (r0, r1, h, x, y, z, c, n = 12) => colorize(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y, z), c);
  for (const [x, z] of [[X0 + 0.3, Z0 + 0.3], [X1 - 0.3, Z0 + 0.3], [X0 + 0.3, Z1 - 0.3], [X1 - 0.3, Z1 - 0.3]]) parts.push(boxAt(0.4, FL, 0.4, x, FL / 2, z, '#6B6F76'));   // the blocks it stands on
  parts.push(boxAt(X1 - X0, 0.04, Z1 - Z0, (X0 + X1) / 2, FL + 0.02, (Z0 + Z1) / 2, '#F4EFF1'));   // the floor
  parts.push(boxAt(X1 - X0, 0.08, Z1 - Z0, (X0 + X1) / 2, H - 0.04, (Z0 + Z1) / 2, '#E8A9BE'));   // the roof
  parts.push(boxAt(X1 - X0, H - FL - 0.08, 0.05, (X0 + X1) / 2, (H + FL) / 2, Z0 + 0.025, PINK));   // the back wall
  for (const x of [X0 + 0.025, X1 - 0.025]) parts.push(boxAt(0.05, H - FL - 0.08, Z1 - Z0, x, (H + FL) / 2, (Z0 + Z1) / 2, PINK));
  // the ribs of a shipping container, outside on the back and the ends
  for (let x = X0 + 0.2; x < X1 - 0.1; x += 0.3) parts.push(boxAt(0.1, H - FL - 0.2, 0.03, x, (H + FL) / 2, Z0 - 0.005, '#E9A3BB'));
  for (const sx of [X0 - 0.005, X1 + 0.005]) for (let z = Z0 + 0.2; z < Z1 - 0.1; z += 0.3) parts.push(boxAt(0.03, H - FL - 0.2, 0.1, sx, (H + FL) / 2, z, '#E9A3BB'));
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) for (const y of [FL + 0.08, H - 0.08]) parts.push(boxAt(0.14, 0.16, 0.14, x, y, z, '#C77E97'));
  // the front: the sign's band over the glass, the mullions, the door's frame, a step down to the pavement
  parts.push(boxAt(X1 - X0, 0.5, 0.06, (X0 + X1) / 2, H - 0.33, Z1 - 0.03, '#2A1420'));
  for (const x of [X0 + 0.05, -1.2, 0.0, DOOR[0], DOOR[1], X1 - 0.05]) parts.push(boxAt(0.06, H - FL - 0.58, 0.07, x, FL + (H - FL - 0.58) / 2, Z1 - 0.03, '#F4F4F2'));
  parts.push(boxAt(X1 - X0, 0.08, 0.08, (X0 + X1) / 2, FL + 0.04, Z1 - 0.03, '#F4F4F2'));
  parts.push(boxAt(DOOR[1] - DOOR[0] + 0.3, 0.12, 0.42, (DOOR[0] + DOOR[1]) / 2, 0.06, Z1 + 0.2, '#C9CED6'));
  parts.push(boxAt(0.03, 0.32, 0.04, DOOR[0] + 0.12, 1.15, Z1 - 0.07, '#C9CED6'));   // the door's handle
  // the booths: walls, a top, the curtain rail; inside, the screen-and-camera on the back wall and the ring light
  for (const [a, b] of [B1, B2]) {
    for (const x of [a, b]) parts.push(boxAt(0.05, 2.2, BZ - Z0 - 0.05, x, FL + 1.1, (Z0 + BZ) / 2, '#2B2F36'));
    parts.push(boxAt(b - a, 0.06, BZ - Z0 - 0.05, (a + b) / 2, FL + 2.2, (Z0 + BZ) / 2, '#2B2F36'));
    parts.push(cyl(0.012, 0.012, b - a, (a + b) / 2, FL + 2.12, BZ + 0.02, '#C9CED6', 6).rotateZ(Math.PI / 2).translate(0, 0, 0));
    parts.push(boxAt(0.5, 0.42, 0.08, (a + b) / 2, FL + 1.55, Z0 + 0.12, '#1E2125'), colorize(new THREE.TorusGeometry(0.24, 0.025, 6, 24).translate((a + b) / 2, FL + 1.55, Z0 + 0.16), '#F4F4F2'));
    parts.push(boxAt(b - a - 0.2, 1.5, 0.02, (a + b) / 2, FL + 1.0, Z0 + 0.06, a === B1[0] ? '#FFE3EE' : '#E3F4FF'));   // the backdrop
  }
  // the props table by the door, its basket; a mirror on the end wall; the printer; a stool
  parts.push(boxAt(0.7, 0.04, 0.45, 1.05, FL + 0.78, -0.75, '#F4F4F2'));
  for (const [x, z] of [[0.75, -0.95], [1.35, -0.95], [0.75, -0.55], [1.35, -0.55]]) parts.push(boxAt(0.03, 0.78, 0.03, x, FL + 0.39, z, '#C9CED6'));
  parts.push(cyl(0.2, 0.16, 0.16, 1.05, FL + 0.88, -0.75, '#C9A86A', 14));
  parts.push(boxAt(0.04, 1.4, 0.7, X1 - 0.07, FL + 1.25, -0.55, '#DCEAF2'), boxAt(0.05, 1.46, 0.76, X1 - 0.06, FL + 1.25, -0.55, '#F4F4F2'));
  parts.push(boxAt(0.42, 1.25, 0.4, 1.85, FL + 0.625, -0.95, '#F4F4F2'), boxAt(0.3, 0.03, 0.02, 1.85, FL + 0.7, -0.74, '#1E2125'));
  const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.6, metalness: 0.08 })); base.castShadow = !low; base.receiveShadow = true; Q.add(base);

  /* the props in the basket: ears on headbands, giant heart sunglasses, a party hat (only near) */
  const props = [];
  for (let i = 0; i < 4; i++) {
    const x = 0.95 + (i % 2) * 0.18, z = -0.8 + Math.floor(i / 2) * 0.12, y = FL + 0.98, c = ['#FF8FB8', '#1E2125', '#F4F4F2', '#FFD84A'][i];
    props.push(colorize(new THREE.TorusGeometry(0.07, 0.008, 4, 12, Math.PI).translate(x, y, z), c));
    for (const s of [-1, 1]) props.push(colorize(new THREE.ConeGeometry(0.025, 0.06, 4).translate(x + s * 0.05, y + 0.07, z), c));
  }
  for (const s of [-1, 1]) props.push(colorize(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10).rotateX(Math.PI / 2).translate(1.2 + s * 0.05, FL + 0.82, -0.6), '#E8327A'));
  props.push(colorize(new THREE.ConeGeometry(0.06, 0.16, 10).translate(0.82, FL + 0.88, -0.62), '#3FB6E8'), colorize(new THREE.ConeGeometry(0.06, 0.16, 10).translate(0.9, FL + 0.88, -0.58), '#FFC93C'));
  const detail = new THREE.Mesh(mergeAll(props), vmat({ roughness: 0.5 })); Q.add(detail);

  // the curtains: pleated, hanging from the rail with the gap under them
  const curtain = (a, b, c) => { const n = 14, g = new THREE.PlaneGeometry(b - a - 0.04, 2.1 - CUR, n, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.round((p.getX(i) / (b - a)) * n) % 2) * 0.035); g.computeVertexNormals(); return colorize(g.translate((a + b) / 2, FL + CUR + (2.1 - CUR) / 2, BZ + 0.03), c); };
  Q.add(new THREE.Mesh(mergeAll([curtain(B1[0], B1[1], '#F28AB2'), curtain(B2[0], B2[1], '#2B2F36')]), vmat({ roughness: 0.9, side: THREE.DoubleSide })));
  // the printing: the neon sign, the board, the sample strips on the wall, the booths' screens
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const paint = () => { drawPhoto(canvas.getContext('2d')); tex.needsUpdate = true; };
  paint(); document.fonts?.ready.then(paint);
  const plane = (w, h, [rx, ry, rw, rh]) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 512); return p; };
  const AX = X0 + 0.35, AZ = 1.95;   // the A-frame on the pavement, at the far end from the door
  const signM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0.5, roughness: 0.5 });
  Q.add(new THREE.Mesh(mergeAll([plane(X1 - X0 - 0.1, 0.46, RP.sign).translate((X0 + X1) / 2, H - 0.33, Z1 + 0.002),
    plane(0.95, 0.5, RP.samples).translate(0.95, FL + 1.75, Z0 + 0.06),
    ...[B1, B2].map(([a, b]) => plane(0.42, 0.28, RP.screen).translate((a + b) / 2, FL + 1.55, Z0 + 0.165))]), signM));
  Q.add(new THREE.Mesh(mergeAll([-1, 1].map((s) => plane(0.5, 0.42, RP.board).rotateY(s > 0 ? 0 : Math.PI).rotateX(-s * 0.18).translate(AX, PV + 0.52, AZ + s * 0.09))), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));
  Q.add(new THREE.Mesh(mergeAll([-1, 1].map((s) => colorize(new THREE.BoxGeometry(0.56, 0.84, 0.02).rotateX(-s * 0.18).translate(AX, PV + 0.42, AZ + s * 0.07), '#E8327A'))), vmat({ roughness: 0.6 })));
  const glassM = new THREE.MeshStandardMaterial({ color: '#F6DCE6', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 - 0.1, H - FL - 0.62).translate((X0 + X1) / 2, FL + (H - FL - 0.62) / 2 + 0.04, Z1 - 0.035), glassM); glass.renderOrder = 2; Q.add(glass);
  // light inside (brighter after dark), the neon's glow out front, the flash in a booth
  const lightM = new THREE.MeshBasicMaterial({ color: '#FFF4FA' });
  Q.add(new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 - 0.4, 0.3).rotateX(Math.PI / 2).translate((X0 + X1) / 2, H - 0.09, -0.1), lightM));
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(32, 16, 2, 32, 16, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 32); const t = new THREE.CanvasTexture(c); return t; })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 1.2, 1.2).translate((X0 + X1) / 2, H - 0.33, Z1 + 0.06), new THREE.MeshBasicMaterial({ map: glowTex, color: NEON, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.visible = false; Q.add(glow);
  const flashes = [B1, B2].map(([a, b]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a + 0.8, 2.0).translate((a + b) / 2, FL + 1.4, BZ + 0.12), new THREE.MeshBasicMaterial({ map: glowTex, color: '#FFFFFF', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; Q.add(m); return m; });

  /* ---------- the people: groups of the young, a queue along the pavement at the weekend ---------- */
  const crowd = folk(G, 8, { low, shadows: false }), SL = crowd.take(8);
  SL.forEach((i, k) => crowd.dress(i, { shirt: LOOKS[k][0], pants: LOOKS[k][1], hair: LOOKS[k][2] }));
  const bubble = (() => { const d = el('div', 'tag shop-say photo-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  let now = 0, inView = false, checkAt = -1, night = false, held = false, flashAt = [-9, -9], shots = 0, prints = 0;
  const sayAt = (lx, lz, text, secs = 2.6) => { bubble.position.copy(W(lx, lz, FL + 1.95)); bubble.element.textContent = text; bubble.element.hidden = false; bubble.visible = true; bubble.until = now + secs; };
  // the queue along the pavement from the door (the walk line is 0.95 in from the kerb), the second booth's group
  const qSpot = (k) => ({ x: DOOR[1] + 0.3 + k * 0.6, z: 1.85 });   // (from the door away past the end, clear of the glass)
  const B2SPOT = [[-0.45, -0.6], [0.0, -0.7], [-0.2, -0.25]];
  const want = (d) => { if (!isOpen(d)) return { q: 0, b2: 0 }; const h = d.getHours(); return weekend(d) ? { q: h >= 14 ? 6 : h >= 10 ? 3 : 1, b2: 2 } : { q: h >= 18 ? 2 : h >= 17 ? 1 : 0, b2: h >= 12 ? 2 : 1 }; };
  let W2 = { q: 0, b2: 0 }, cycleAt = 0;
  function poseLocals(t) {
    let k = 0;
    // in the second booth: feet under the curtain, now and then a flash
    for (let i = 0; i < W2.b2; i++, k++) { const [x, z] = B2SPOT[i], a = W(x, z, FL); crowd.pose(SL[k], { x: a.x, y: a.y, z: a.z, yaw: f.yaw + yawTo(0, -1), arms: Math.sin(t * 0.9 + i) > 0.3 ? [[2.6, 0.3], [2.6, -0.3]] : [[0.4, 0.1], [1.8, -0.2]] }); }
    // the queue, chatting, on their phones
    for (let i = 0; i < W2.q && k < SL.length; i++, k++) {
      const s = qSpot(i), a = W(s.x, s.z, PV), phone = Math.sin(t * 0.5 + i * 1.9) > 0;
      crowd.pose(SL[k], { x: a.x, y: a.y, z: a.z, yaw: f.yaw + yawTo(-1, (i % 2 ? 0.4 : -0.3)), arms: phone ? [[1.5, -0.1], [0.15, 0.05]] : [[0.12, 0.02], [0.12, 0.02]], phone });
    }
    for (; k < SL.length; k++) crowd.hide(SL[k]);
  }
  function update(dt, t) {
    now = t;
    if (t - checkAt > 0.4 || t < checkAt) {
      checkAt = t; inView = seen(f.x, f.z);
      const d = officeNow(), open = isOpen(d);
      if (t > cycleAt) { cycleAt = t + rnd(40, 90); W2 = want(d); if (held) W2.q = Math.max(0, W2.q - 1); }
      glow.visible = open && (night || inView); signM.emissiveIntensity = !open ? 0.15 : night ? 1.4 : 0.55; lightM.color.set(open ? (night ? '#FFF4FA' : '#F4E8EE') : '#6B6F76');
      detail.visible = inView;
    }
    if (bubble.visible && t > bubble.until) { bubble.visible = false; bubble.element.hidden = true; }
    // the flashes: a white burst behind the curtain, then gone
    flashes.forEach((m, i) => { const u = (t - flashAt[i]) / 0.35; m.visible = u >= 0 && u < 1; if (m.visible) m.material.opacity = 0.9 * (1 - u); });
    if (!held && W2.b2 && Math.random() < dt / 7 && t - flashAt[1] > 2) flashAt[1] = t;   // (the second booth's own shots)
    if (!inView) return;
    poseLocals(t); crowd.flush();
  }
  // what people/photobooth.js needs: the door, the queue, the first booth (held for them), its flash, the printer
  const P = (lx, lz, ly, face) => { const a = W(lx, lz, ly), b = W(lx + face[0], lz + face[1], ly); return { x: a.x, z: a.z, y: a.y, face: Math.atan2(b.x - a.x, b.z - a.z) }; };
  const Qs = {
    open: () => isOpen(), weekend: () => weekend(),
    queue: () => W2.q,   // (how many are ahead in the queue now)
    door: () => P((DOOR[0] + DOOR[1]) / 2, 1.85, PV, [0, -1]),
    in: () => P((DOOR[0] + DOOR[1]) / 2, 0.55, FL, [0, -1]),
    // the k-th of the office's queue, behind whoever is there: along the pavement
    wait: (k) => { const s = qSpot(W2.q + k); return P(s.x, s.z, PV, [-1, 0]); },
    // the four places in the first booth (two at the back, two in front, crouching a little), facing its camera
    booth: (k) => P(B1[0] + 0.45 + (k % 2) * 0.8, -0.82 + Math.floor(k / 2) * 0.45, FL, [0, -1]),
    curtain: () => P((B1[0] + B1[1]) / 2, 0.6, FL, [0, -1]),
    printer: () => P(1.85, -0.45, FL, [0, -1]),
    hold(on) { held = on; },
    flash() { flashAt[0] = now; shots++; if (inView) sfx.play('shutter'); },
    print() { prints++; if (inView) sfx.play('print'); },
    say: (text) => sayAt(-1.9, 0.6, text),
  };
  return {
    update,
    night(on) { night = on; checkAt = -1; },
    // walking in: the container's walls (but the door), the booths, the table and the printer
    blocked: (x, z, r) => {
      const [lx, lz] = f.local(x, z);
      if (lx < X0 - r || lx > X1 + r || lz < Z0 - r || lz > Z1 + 0.3 + r) return false;
      if (lz > Z1 - 0.1 - r && !(lx > DOOR[0] + r && lx < DOOR[1] - r)) return true;   // (the front, but the door)
      return lx < X0 + 0.05 + r || lx > X1 - 0.05 - r || lz < Z0 + 0.05 + r || (lx < B2[1] + r && lz < BZ + r) || inside(f, x, z, r, 0.7, 1.4, -1.0, -0.5) || inside(f, x, z, r, 1.6, 2.1, -1.2, -0.7);
    },
    // in first person: at the door, a strip of your own
    spots: () => (isOpen() ? [{ kind: 'photo', ...(() => { const a = W((DOOR[0] + DOOR[1]) / 2, 1.75); return { x: a.x, z: a.z }; })(), label: tr('fp.photo', { price: `${PRICE[0]}k` }), act: () => { flashAt[0] = now; shots++; sfx.play('shutter'); toast(tr('fp.photoDone')); } }] : []),
    office: Qs,
    debug: { state: () => ({ at: [+f.x.toFixed(1), +f.z.toFixed(1)], open: isOpen(), weekend: weekend(), queue: W2.q, b2: W2.b2, held, shots, prints, inView }),
      // where to stand to look at it (for pictures): on the road in front, looking at the glass
      view: (far = 1) => { const a = W(-0.4 * far, 2.2 + 2.6 * far), b = W(-0.3, 0); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; } },
  };
}
