/* A quán cơm bình dân on a park's edge near the office (city backdrop), as there is one on every street in Vietnam: a
   cart with a glass cabinet of the day's dishes facing the pavement (thịt kho trứng, cá kho tộ, rau muống xào tỏi, đậu
   hũ sốt cà, gà chiên nước mắm, trứng chiên, khổ qua dồn thịt), a small orange roof over it with the hand-painted sign,
   the big stainless rice pot beside it and the pot of canh chua steaming on a side table with the stack of compartment
   trays; the auntie behind the cabinet scooping rice and ladling out what you point at onto a tray (35k a plate, the
   iced tea free), stainless tables and red and blue plastic stools on the grass, one under a big umbrella, an A-frame
   board with the menu on the pavement. On Fridays it is bún đậu mắm tôm instead: the board says so, a wok of tofu frying
   by the cart, and on the tables the mẹt (bún pressed into squares, fried tofu, chả cốm, boiled pork, herbs on a banana
   leaf) with a bowl of mắm tôm each. Open for lunch and for an early dinner, Monday to Saturday; the street's people eat
   there, and some days the office goes down for lunch instead of the GrabFood (people/comtrua.js). Everything drawn
   here. ?com: open now; ?bundau: a Friday. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { el, officeNow } from '../../core/env.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { sfx } from '../../audio/sfx.js';
import { toast } from '../../ui/activity.js';
import { puffs } from './street-corner.js';
import { inside } from './street-spots.js';
import { seen } from './street-folk.js';
import { t as tr } from '../../../i18n/index.js';

const Q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FORCE = Q0.has('com') || Q0.has('bundau'), FRIDAY = Q0.has('bundau');
export const PRICE = 35, PRICE_BD = 45;   // a plate of rice with what you pick, a mẹt of bún đậu (thousands of đồng)
export const OPEN = [[10.5, 13.5], [16.5, 19.5]];
/** open now (Monday to Saturday, at lunch and early in the evening; ?com: always) */
export const isOpenAt = (d = officeNow()) => FORCE || (d.getDay() !== 0 && OPEN.some(([a, b]) => { const h = d.getHours() + d.getMinutes() / 60; return h >= a && h < b; }));
/** bún đậu today (a Friday; ?bundau) */
export const bunDau = (d = officeNow()) => FRIDAY || d.getDay() === 5;
const TOP = 0.66, ST = 0.44, FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const STOOLS = ['#D62F2F', '#2E6FD1'], INOX = '#C9CED6', SHIRTS = [['#DCE6F2', '#2B2F36'], ['#1F9E4A', '#2B2F36'], ['#F2F2F2', '#1F2A44'], ['#7A8A9A', '#4A4F5A'], ['#2E6FB5', '#2B3A55'], ['#E8DCC8', '#33415C'], ['#B85C7A', '#3A3F47']];
const rnd = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dz, dx);

/* ---------- the printing: the sign, the boards, the dishes seen from above ---------- */
const RC = { sign: [0, 0, 512, 160], menu: [512, 0, 256, 256], friday: [768, 0, 256, 256] };
const DISH = (k) => [(k % 8) * 128, 256, 128, 96];
function blob(g, x, y, rx, ry, c, a = 0) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); }
const seed = (k) => { let s = k * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
function dish(g, [x, y, w, h], k) {
  const r = seed(k + 3);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const pool = (c0, c1) => { const gr = g.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.6); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  if (k === 0) {   // thịt kho trứng: pork belly and eggs in a dark caramel sauce
    pool('#8A4A1C', '#5A2A0C');
    for (let i = 0; i < 7; i++) { const px = x + 14 + r() * (w - 28), py = y + 12 + r() * (h - 24); g.fillStyle = '#6B3416'; g.fillRect(px - 11, py - 8, 22, 16); g.fillStyle = '#E8C9A0'; g.fillRect(px - 11, py - 2, 22, 4); }
    for (let i = 0; i < 4; i++) { const px = x + 20 + i * 28 + r() * 6, py = y + 30 + r() * 36; blob(g, px, py, 13, 10, '#D9B98A'); if (i % 2) blob(g, px, py, 6, 5, '#F2B233'); }
  } else if (k === 1) {   // cá kho tộ: fish steaks in the caramel, black pepper, spring onion
    pool('#7A3A12', '#3E1A06');
    for (let i = 0; i < 5; i++) { const px = x + 18 + (i % 3) * 40 + r() * 8, py = y + 26 + Math.floor(i / 3) * 40; blob(g, px, py, 17, 13, '#4A2A1A'); blob(g, px, py, 13, 9, '#B88A5A'); blob(g, px, py, 3, 3, '#3A2010'); }
    g.fillStyle = '#111'; for (let i = 0; i < 40; i++) g.fillRect(x + r() * w, y + r() * h, 2, 2);
    g.fillStyle = '#5FA83A'; for (let i = 0; i < 14; i++) g.fillRect(x + r() * w, y + r() * h, 5, 3);
  } else if (k === 2) {   // rau muống xào tỏi: a tangle of greens, garlic
    pool('#3E7A2A', '#24501A');
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) { g.strokeStyle = i % 3 ? '#4F9A34' : '#9BCB5A'; g.lineWidth = i % 3 ? 4 : 3; const px = x + r() * w, py = y + r() * h, a = r() * Math.PI; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(a) * 14, py + Math.sin(a) * 6, px + Math.cos(a) * 24, py + Math.sin(a) * 14); g.stroke(); }
    g.fillStyle = '#F2E2A0'; for (let i = 0; i < 18; i++) g.fillRect(x + r() * w, y + r() * h, 4, 4);
  } else if (k === 3) {   // đậu hũ sốt cà chua: tofu in tomato sauce, spring onion
    pool('#D9542A', '#A8361A');
    for (let i = 0; i < 9; i++) { const px = x + 16 + (i % 4) * 30 + r() * 6, py = y + 18 + Math.floor(i / 4) * 30 + r() * 6; g.fillStyle = '#E9C46A'; g.fillRect(px - 11, py - 9, 22, 18); g.fillStyle = 'rgba(200,60,20,.45)'; g.fillRect(px - 11, py + 3, 22, 6); }
    g.fillStyle = '#5FA83A'; for (let i = 0; i < 12; i++) g.fillRect(x + r() * w, y + r() * h, 5, 3);
  } else if (k === 4) {   // gà chiên nước mắm: golden chicken, glazed
    pool('#B8741F', '#7A4410');
    for (let i = 0; i < 7; i++) { const px = x + 16 + r() * (w - 32), py = y + 14 + r() * (h - 28); blob(g, px, py, 15, 11, '#C98A2A', r() * 3); blob(g, px - 3, py - 3, 8, 5, '#E8B04A', 0.4); }
  } else if (k === 5) {   // trứng chiên: omelette slabs
    pool('#E8C04A', '#C99A2A');
    for (let i = 0; i < 4; i++) { const px = x + 8 + (i % 2) * 58, py = y + 6 + Math.floor(i / 2) * 44; g.fillStyle = '#F2CF4A'; g.beginPath(); g.roundRect(px, py, 52, 38, 8); g.fill(); g.strokeStyle = '#B87A1A'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#5FA83A'; g.fillRect(px + 14, py + 14, 5, 3); g.fillRect(px + 30, py + 22, 5, 3); }
  } else if (k === 6) {   // canh chua, from above: the pot's tamarind soup, pineapple, tomato, okra, bean sprouts, herbs
    g.fillStyle = '#B9C0C8'; g.fillRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2 - 2;
    g.fillStyle = '#E07A2A'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 6; i++) { const a = r() * 6.3, d = r() * R * 0.7; g.fillStyle = '#F2D04A'; g.fillRect(cx + Math.cos(a) * d - 5, cy + Math.sin(a) * d - 4, 10, 8); }
    for (let i = 0; i < 5; i++) { const a = r() * 6.3, d = r() * R * 0.7; blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 7, 5, '#D8262E', a); }
    for (let i = 0; i < 4; i++) { const a = r() * 6.3, d = r() * R * 0.6; blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 6, 6, '#5E9A3A'); blob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5, 2.5, '#E8F0C0'); }
    g.strokeStyle = '#F4F1E0'; g.lineWidth = 2; for (let i = 0; i < 10; i++) { const a = r() * 6.3, d = r() * R * 0.75, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 8, py + 3); g.stroke(); }
    g.fillStyle = '#3E8E3A'; for (let i = 0; i < 8; i++) g.fillRect(cx + (r() - 0.5) * R * 1.4, cy + (r() - 0.5) * R * 1.2, 5, 3);
  } else {   // khổ qua dồn thịt: bitter melon rings stuffed with pork, in their broth
    pool('#B9A97A', '#8A7A4A');
    for (let i = 0; i < 6; i++) { const px = x + 22 + (i % 3) * 40, py = y + 28 + Math.floor(i / 3) * 40; blob(g, px, py, 17, 17, '#6FA03A'); blob(g, px, py, 12, 12, '#A8C878'); blob(g, px, py, 9, 9, '#C89A7A'); }
  }
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, w, h * 0.35);
  g.restore();
}
function drawCom(g) {
  g.clearRect(0, 0, 1024, 512);
  // the sign: hand-painted red on yellow, a red frame, the cheap price under it
  { const [x, y, w, h] = RC.sign;
    g.fillStyle = '#F7D23E'; g.fillRect(x, y, w, h); g.strokeStyle = '#C8102E'; g.lineWidth = 10; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = '#C8102E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 70px ${FONT}`; g.fillText('CƠM BÌNH DÂN', x + w / 2, y + 62, w - 40);
    g.fillStyle = '#1E3A8A'; g.font = `800 30px ${FONT}`; g.fillText('Cơm văn phòng · 35K · Trà đá free', x + w / 2, y + 122, w - 40); }
  // the menu board on the pavement (white board, marker)
  { const [x, y, w, h] = RC.menu;
    g.fillStyle = '#F7F7F2'; g.fillRect(x, y, w, h); g.strokeStyle = '#2B2F36'; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#C8102E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 26px ${FONT}`; g.fillText('HÔM NAY CÓ', x + w / 2, y + 30);
    g.textAlign = 'left'; g.font = `700 19px ${FONT}`;
    [['Thịt kho trứng', '#1E3A8A'], ['Cá kho tộ', '#1E3A8A'], ['Gà chiên mắm', '#1E3A8A'], ['Khổ qua dồn thịt', '#1E3A8A'], ['Canh chua cá', '#1E8A3A'], ['Rau muống xào tỏi', '#1E8A3A']].forEach(([t, c], i) => { g.fillStyle = c; g.fillText(`• ${t}`, x + 16, y + 64 + i * 28, w - 30); });
    g.fillStyle = '#C8102E'; g.textAlign = 'center'; g.font = `900 30px ${FONT}`; g.fillText('35K / phần', x + w / 2, y + h - 22); }
  // Friday's board: bún đậu mắm tôm
  { const [x, y, w, h] = RC.friday;
    g.fillStyle = '#F7F7F2'; g.fillRect(x, y, w, h); g.strokeStyle = '#2B2F36'; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = '#7A3A8A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 34px ${FONT}`; g.fillText('THỨ 6', x + w / 2, y + 36);
    g.fillStyle = '#C8102E'; g.font = `900 30px ${FONT}`; g.fillText('BÚN ĐẬU', x + w / 2, y + 86); g.fillText('MẮM TÔM', x + w / 2, y + 122);
    g.fillStyle = '#1E3A8A'; g.font = `700 19px ${FONT}`; g.fillText('Mẹt thường 45K', x + w / 2, y + 168); g.fillText('Mẹt đầy đủ 65K', x + w / 2, y + 196);
    g.font = `600 15px ${FONT}`; g.fillText('chả cốm · thịt luộc · đậu rán', x + w / 2, y + 226, w - 20); }
  for (let k = 0; k < 8; k++) dish(g, DISH(k), k);
}

/** finder: street-spots.js; crowd: street-folk.js figures (slots taken here); far: [x, z, r] to keep clear of */
export function buildCom(G, { finder, crowd, low, far = [] }) {
  const dead = { update() {}, blocked: () => false, spots: () => [], office: null, debug: { state: () => ({ none: true }) } };
  const f = [{ near: 42 }, { near: 60 }].reduce((got, o) => got || finder.find({ len: 5.8, depth: 2.4, d: 2.6, lawn: true, far, ...o }), null);
  if (!f) return dead;
  // the frame: x along the kerb, z out towards the street (2.6 m in from the kerb at 0), y up from the grass
  const W = (lx, lz, ly = 0) => f.at(lx, lz, ly);
  const Q = new THREE.Group(); Q.matrixAutoUpdate = false; Q.matrix.copy(f.M); G.add(Q);
  const parts = [], cyl = (r0, r1, h, x, y, z, c, n = 14) => colorize(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y, z), c);
  /* the cart and its glass cabinet, the roof over it, the rice pot, the side table with the canh and the trays */
  const CX = -1.9, CZ = 0.7;
  parts.push(boxAt(1.3, 0.72, 0.62, CX, 0.44, CZ, '#D8DCE1'), boxAt(1.34, 0.04, 0.66, CX, 0.81, CZ, INOX));
  for (const [x, z] of [[-0.5, -0.33], [0.5, -0.33], [-0.5, 0.33], [0.5, 0.33]]) parts.push(colorize(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateX(Math.PI / 2).translate(CX + x, 0.07, CZ + z), '#2B2F36'));   // its wheels
  for (const [x, z] of [[-0.63, -0.29], [0.63, -0.29], [-0.63, 0.29], [0.63, 0.29]]) {
    parts.push(boxAt(0.025, 0.58, 0.025, CX + x, 1.12, CZ + z, '#B9C0C8'));   // the cabinet's corners
    parts.push(boxAt(0.03, 1.2, 0.03, CX + x * 1.08, 1.43, CZ + z * 1.25, '#8E959E'));   // the roof's posts
  }
  parts.push(boxAt(1.28, 0.02, 0.58, CX, 1.41, CZ, '#B9C0C8'), boxAt(1.24, 0.012, 0.52, CX, 1.08, CZ, '#E4F1F5'));   // its top, the glass shelf
  parts.push(boxAt(1.62, 0.035, 0.96, CX, 2.04, CZ, '#E8742A'), boxAt(1.62, 0.06, 0.03, CX, 2.0, CZ + 0.48, '#C85A1A'));   // the roof
  parts.push(boxAt(0.03, 0.5, 0.03, CX - 0.7, 2.3, CZ + 0.47, '#5A4A3A'), boxAt(0.03, 0.5, 0.03, CX + 0.7, 2.3, CZ + 0.47, '#5A4A3A'));   // the sign's frame
  for (let k = 0; k < 6; k++) parts.push(boxAt(0.32, 0.016, 0.24, CX + 0.4, 1.43 + k * 0.018, CZ - 0.12, INOX));   // compartment trays waiting on top
  // the dishes in the cabinet, in their trays, two rows (the food is printed on top: below)
  const TRAYS = [];
  for (const [y, row] of [[0.84, [2, 4, 5, 0]], [1.1, [0, 1, 3, 7]]]) row.forEach((k, i) => { const x = CX - 0.45 + i * 0.3; parts.push(boxAt(0.27, 0.035, 0.22, x, y, CZ, INOX)); TRAYS.push([x, y + 0.019, k]); });
  for (const [x, y] of TRAYS.filter((t) => t[2] === 0).map(([x, y]) => [x, y])) for (let i = 0; i < 3; i++) parts.push(colorize(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 0.8, 1.25).translate(x - 0.07 + i * 0.07, y + 0.012, CZ + (i % 2 ? 0.04 : -0.03)), '#D9B98A'));
  // the rice pot on its stand; the side table: the canh chua pot, a ladle
  const RX = -2.62, RZ = 0.2;
  parts.push(boxAt(0.5, 0.3, 0.5, RX, 0.15, RZ, '#3A3F47'), cyl(0.22, 0.2, 0.44, RX, 0.52, RZ, '#D8DCE1', 20), cyl(0.205, 0.205, 0.01, RX, 0.74, RZ, '#F7F5EE', 20));
  parts.push(colorize(new THREE.CylinderGeometry(0.23, 0.23, 0.025, 20).rotateX(-1.1).translate(RX, 0.88, RZ - 0.2), '#C9CED6'), cyl(0.02, 0.02, 0.06, RX, 0.96, RZ - 0.33, '#2B2F36', 6));
  const SX = -0.95, SZ = 0.25;
  parts.push(boxAt(0.5, 0.035, 0.46, SX, 0.64, SZ, INOX));
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) parts.push(boxAt(0.025, 0.63, 0.025, SX + x, 0.315, SZ + z, '#9AA2AD'));
  parts.push(cyl(0.165, 0.15, 0.24, SX + 0.06, 0.78, SZ, '#D8DCE1', 18), colorize(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).rotateZ(0.7).translate(SX + 0.2, 0.98, SZ), '#9AA2AD'));
  parts.push(cyl(0.035, 0.035, 0.14, SX - 0.17, 0.73, SZ - 0.12, '#7A1F12', 8), cyl(0.03, 0.03, 0.12, SX - 0.17, 0.72, SZ + 0.0, '#C8261B', 8));   // the fish sauce, the chili
  /* the tables, stainless, and the plastic stools; the big umbrella over the second; the A-frame board on the pavement */
  const T = [{ x: 0.35, z: 0.2, w: 1.3 }, { x: 2.15, z: 0.05, w: 0.9 }];
  for (const t of T) {
    parts.push(boxAt(t.w, 0.03, 0.62, t.x, TOP, t.z, INOX), boxAt(t.w - 0.04, 0.05, 0.58, t.x, TOP - 0.04, t.z, '#9AA2AD'));
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) parts.push(boxAt(0.03, TOP - 0.02, 0.03, t.x + sx * (t.w / 2 - 0.05), (TOP - 0.02) / 2, t.z + sz * 0.26, '#9AA2AD'));
    parts.push(cyl(0.07, 0.065, 0.2, t.x + t.w / 2 - 0.09, TOP + 0.115, t.z, '#B9772E', 12), cyl(0.072, 0.072, 0.02, t.x + t.w / 2 - 0.09, TOP + 0.22, t.z, '#F2F2F2', 12));   // the jug of trà đá
    parts.push(cyl(0.035, 0.035, 0.12, t.x - t.w / 2 + 0.07, TOP + 0.075, t.z - 0.09, '#E8E2D0', 8), boxAt(0.08, 0.08, 0.12, t.x - t.w / 2 + 0.07, TOP + 0.055, t.z + 0.07, '#F4F4F2'));   // chopsticks, tissues
  }
  const seat = (t, dx, dz) => ({ x: T[t].x + dx, z: T[t].z + dz, face: yawTo(-dx, -dz), t });
  const OFFICE = [seat(0, -0.33, -0.56), seat(0, 0.33, -0.56), seat(0, -0.33, 0.56), seat(0, 0.33, 0.56)];
  const LOCAL = [seat(1, -0.24, -0.56), seat(1, 0.24, -0.56), seat(1, -0.24, 0.56), seat(1, 0.24, 0.56), seat(0, -0.96, 0), seat(0, 0.96, 0)];
  [...OFFICE, ...LOCAL].forEach((s, i) => parts.push(cyl(0.15, 0.18, ST - 0.02, s.x, (ST - 0.02) / 2, s.z, STOOLS[i % 2]), cyl(0.165, 0.165, 0.025, s.x, ST - 0.01, s.z, STOOLS[i % 2])));
  const UX = T[1].x + 0.62, UZ = T[1].z - 0.42;   // (the umbrella's pole beside the table, its base a weighted block)
  parts.push(cyl(0.022, 0.022, 2.3, UX, 1.15, UZ, '#E8E8E8', 8), cyl(0.18, 0.2, 0.06, UX, 0.03, UZ, '#3A3F47', 12));
  { const cone = new THREE.ConeGeometry(1.1, 0.36, 12, 1, true), col = cone.attributes.position, c = new Float32Array(col.count * 3), A = new THREE.Color('#C8102E'), B = new THREE.Color('#F2F2F2');
    for (let i = 0; i < col.count; i++) { const a = Math.atan2(col.getZ(i), col.getX(i)), k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12 + 0.001) % 2; (k ? A : B).toArray(c, i * 3); }
    cone.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(cone.translate(UX, 2.36, UZ)); }
  const AX = -0.55, AZ = 1.55;   // the A-frame (its boards printed below)
  for (const s of [-1, 1]) parts.push(colorize(new THREE.BoxGeometry(0.52, 0.72, 0.02).rotateX(-s * 0.2).translate(AX, 0.36, AZ + s * 0.07), '#7A5A3A'));
  const base = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide })); base.castShadow = !low; base.receiveShadow = true; Q.add(base);
  const glassM = new THREE.MeshStandardMaterial({ color: '#D7ECF2', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const panes = [new THREE.PlaneGeometry(1.26, 0.56).translate(CX, 1.12, CZ + 0.29), new THREE.PlaneGeometry(1.26, 0.56).translate(CX, 1.12, CZ - 0.29),
    new THREE.PlaneGeometry(0.58, 0.56).rotateY(Math.PI / 2).translate(CX - 0.63, 1.12, CZ), new THREE.PlaneGeometry(0.58, 0.56).rotateY(Math.PI / 2).translate(CX + 0.63, 1.12, CZ)];
  const glass = new THREE.Mesh(mergeAll(panes), glassM); glass.renderOrder = 2; Q.add(glass);

  // the printing: the sign (both sides), the boards, the dishes (shown while it is open)
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const paint = () => { drawCom(canvas.getContext('2d')); tex.needsUpdate = true; };
  paint(); document.fonts?.ready.then(paint);
  const printM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide });
  const plane = (w, h, [rx, ry, rw, rh]) => { const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 512); return p; };
  Q.add(new THREE.Mesh(mergeAll([plane(1.4, 0.44, RC.sign).translate(CX, 2.3, CZ + 0.485), plane(1.4, 0.44, RC.sign).rotateY(Math.PI).translate(CX, 2.3, CZ + 0.455)]), printM));
  const board = (r) => { const m = new THREE.Mesh(mergeAll([-1, 1].map((s) => plane(0.44, 0.44, r).rotateY(s > 0 ? 0 : Math.PI).rotateX(-s * 0.2).translate(AX, 0.46, AZ + s * 0.063))), printM); Q.add(m); return m; };
  const menuBoard = board(RC.menu), fridayBoard = board(RC.friday);
  const food = new THREE.Mesh(mergeAll([...TRAYS.map(([x, y, k]) => plane(0.25, 0.2, DISH(k)).rotateX(-Math.PI / 2).translate(x, y + 0.001, CZ)),
    new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2).translate(SX + 0.06, 0.9, SZ)]), printM);
  { const uv = food.geometry.attributes.uv, n = uv.count, [rx, ry, rw, rh] = DISH(6);   // (the canh's disc: the last 22 vertices)
    for (let i = n - 22; i < n; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 512); }
  Q.add(food);

  /* what is on the tables while someone eats there: a compartment tray each (rice, the dishes, an egg) or, on a Friday,
     a mẹt of bún đậu (shared at the office's table) and a bowl of mắm tôm each */
  const tray = (x, z) => [boxAt(0.3, 0.02, 0.22, x, TOP + 0.026, z, '#D8DCE1'), colorize(new THREE.SphereGeometry(0.065, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(x - 0.06, TOP + 0.037, z), '#F7F5EE'),
    colorize(new THREE.SphereGeometry(0.04, 8, 5).scale(1.2, 0.35, 1).translate(x + 0.07, TOP + 0.04, z - 0.05), '#7A3A12'), colorize(new THREE.SphereGeometry(0.04, 8, 5).scale(1.2, 0.35, 1).translate(x + 0.07, TOP + 0.04, z + 0.05), '#4F9A34'),
    colorize(new THREE.SphereGeometry(0.022, 8, 6).translate(x + 0.02, TOP + 0.05, z + 0.07), '#E8D9B0')];
  const met = (x, z, R) => {
    const out = [cyl(R, R * 0.92, 0.025, x, TOP + 0.03, z, '#C49A5A', 18), cyl(R * 0.88, R * 0.88, 0.006, x, TOP + 0.045, z, '#3E8E3A', 18)], r = seed(Math.round(x * 100 + z * 10));
    for (let i = 0; i < 3; i++) out.push(boxAt(R * 0.36, 0.03, R * 0.26, x - R * 0.3 + i * R * 0.3, TOP + 0.064, z - R * 0.42, '#F4F1EA'));   // bún, pressed in squares
    for (let i = 0; i < 6; i++) out.push(boxAt(0.04, 0.035, 0.04, x - R * 0.35 + (i % 3) * R * 0.22, TOP + 0.068, z + (i < 3 ? 0.0 : R * 0.2), '#E0A43A'));   // fried tofu
    for (let i = 0; i < 3; i++) out.push(cyl(0.032, 0.032, 0.016, x + R * 0.45, TOP + 0.058, z - R * 0.2 + i * R * 0.25, '#7E8A3A', 10));   // chả cốm
    for (let i = 0; i < 3; i++) out.push(boxAt(0.07, 0.008, 0.035, x + R * 0.12, TOP + 0.054 + i * 0.006, z + R * 0.5 - i * 0.02, i % 2 ? '#E8C4B0' : '#D9A890'));   // boiled pork
    for (let i = 0; i < 5; i++) out.push(colorize(new THREE.SphereGeometry(0.03, 6, 4).scale(1, 0.3, 1).translate(x + (r() - 0.5) * R, TOP + 0.06, z + R * 0.62 + (r() - 0.5) * 0.04), i % 3 ? '#4F9A3A' : '#7A3A6B'));   // herbs
    return out;
  };
  const bowl = (x, z) => [cyl(0.04, 0.03, 0.035, x, TOP + 0.035, z, '#F2F2EC', 10), cyl(0.034, 0.034, 0.004, x, TOP + 0.052, z, '#B06A8A', 10)];
  const foodM = vmat({ roughness: 0.5 });
  const meal = (list) => { const o = new THREE.Mesh(mergeAll(list), foodM); o.visible = false; Q.add(o); return o; };
  const near = (s, k = 0.55) => [T[s.t].x + (s.x - T[s.t].x) * k, T[s.t].z + (s.z - T[s.t].z) * k];
  const groups = [OFFICE, LOCAL.slice(0, 4), LOCAL.slice(4)];   // the office's places, the second table, the ends of the first
  const meals = groups.map((list) => ({ com: meal(list.flatMap((s) => tray(...near(s)))), bd: meal([...(list === groups[2] ? list.flatMap((s) => met(...near(s, 0.5), 0.16)) : met(T[list[0].t].x, T[list[0].t].z, list === OFFICE ? 0.3 : 0.24)), ...list.flatMap((s) => bowl(...near(s, 0.7)))]) }));
  // Friday's wok of tofu, frying by the cart
  const WX = -0.9, WZ = 1.0, wok = new THREE.Mesh(mergeAll([boxAt(0.46, 0.42, 0.38, WX, 0.21, WZ, '#3A3F47'), boxAt(0.4, 0.08, 0.34, WX, 0.46, WZ, '#2B2F36'),
    colorize(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(WX, 0.66, WZ), '#2B2F36'), cyl(0.2, 0.2, 0.01, WX, 0.6, WZ, '#D9A12A', 16),
    ...[0, 1, 2, 3, 4].map((i) => boxAt(0.045, 0.04, 0.045, WX - 0.08 + i * 0.04, 0.615, WZ + (i % 2 ? 0.05 : -0.04), '#E8B04A')), cyl(0.13, 0.13, 0.42, WX + 0.42, 0.21, WZ - 0.05, '#C8261B', 12)]), foodM);
  wok.visible = false; Q.add(wok);
  const steam = puffs(G, 3, { size: 0.26, rise: 0.6, period: 2.2, color: '#F4F4F4' }), smoke = puffs(G, 3, { size: 0.3, rise: 0.9, period: 2.0, color: '#E8E4DA' });

  /* the people: the auntie behind the cabinet, her helper, the street's lunch crowd on the stools */
  const LOC = crowd.take(LOCAL.length), [AUNT] = crowd.take(1), [HELP] = crowd.take(1);
  LOC.forEach((i, k) => crowd.dress(i, { shirt: SHIRTS[(k * 3 + 1) % SHIRTS.length][0], pants: SHIRTS[(k * 3 + 1) % SHIRTS.length][1], hair: ['#2B2420', '#1E1A18', '#3A2A20'][k % 3] }));
  if (AUNT != null) crowd.dress(AUNT, { shirt: '#C46A8A', sleeves: '#C46A8A', pants: '#5A3A5A', hair: '#1E1A18' });   // (an áo bộ, flowery)
  if (HELP != null) crowd.dress(HELP, { shirt: '#F2F2F2', pants: '#2B2F36', hair: '#3A2A20' });
  const bubble = (() => { const d = el('div', 'tag shop-say com-say'); d.hidden = true; const o = new CSS2DObject(d); o.visible = false; G.add(o); return o; })();
  let now = 0, open = false, fri = false, seatedAt = -1, office = [], served = 0, helpAt = 0, helpTo = null, hpos = null, onYou = null;
  const seatsTaken = new Array(LOCAL.length).fill(false);
  const posOf = (s, y = 0) => { const p = W(s.x, s.z, y); return { x: p.x, y: p.y, z: p.z }; };
  const yawOf = (dx, dz) => f.yaw + yawTo(dx, dz);
  const sayAt = (p, text, secs = 2.8) => { bubble.position.set(p.x, p.y + 1.95, p.z); bubble.element.textContent = text; bubble.element.hidden = false; bubble.visible = true; bubble.until = now + secs; };
  const want = (h) => (h >= 11 && h < 12.75 ? 6 : h >= 10.5 && h < 13.5 ? 3 : h >= 17 && h < 19 ? 3 : 1);
  function syncLocals(h) {
    const n = open ? Math.min(LOCAL.length, want(h)) : 0;
    for (let k = 0; k < LOCAL.length; k++) { const on = k < n; if (on !== seatsTaken[k]) { seatsTaken[k] = on; if (!on) crowd.hide(LOC[k]); } }
  }
  function poseAll(t, dt) {
    LOCAL.forEach((s, k) => {
      if (!seatsTaken[k] || LOC[k] == null) return;
      const p = posOf(s), bite = Math.sin(t * 1.3 + k * 2.1) > 0.45, talk = Math.sin(t * 0.31 + k * 1.7) > 0.9;
      crowd.pose(LOC[k], { x: p.x, y: p.y, z: p.z, yaw: f.yaw + s.face, sit: p.y + ST, lean: talk ? 0.12 : -0.14, arms: [[1.0, -0.3], bite ? [2.2, -0.35] : [1.1, -0.32]] });
    });
    // the auntie: at the cabinet ladling what was pointed at, and every so often turned to the pot for the rice
    if (AUNT != null) {
      const p = posOf({ x: CX, z: 0.12 }), toPot = (t % 9) > 6.2, scoop = Math.sin(t * 5) * 0.25;
      crowd.pose(AUNT, { x: p.x, y: p.y, z: p.z, yaw: toPot ? yawOf(RX - CX, RZ - 0.12) : yawOf(0, 1), lean: -0.18, arms: [[0.9, -0.15], [1.25 + scoop, -0.1]] });
    }
    if (HELP == null) return;
    if (fri) {   // Friday: at the wok, turning the tofu
      const p = posOf({ x: WX, z: WZ - 0.5 });
      crowd.pose(HELP, { x: p.x, y: p.y, z: p.z, yaw: yawOf(0, 1), lean: -0.15, arms: [[0.9, -0.1], [1.0 + Math.sin(t * 6) * 0.3, -0.15]] });
      return;
    }
    // other days: trays from the cart to whichever table has someone, and back
    if (!helpTo || t > helpAt) {
      const busy = [0, 1].filter((k) => (k === 0 ? office.length > 0 || seatsTaken[4] || seatsTaken[5] : seatsTaken.slice(0, 4).some(Boolean)));
      const back = helpTo && helpTo.k !== -1;
      helpTo = back || !busy.length ? { k: -1, ...posOf({ x: -1.1, z: -0.25 }) } : (() => { const k = busy[Math.floor(Math.random() * busy.length)]; return { k, ...posOf({ x: T[k].x - 0.2, z: T[k].z - 0.6 }) }; })();
      helpAt = t + rnd(5, 9);
    }
    const w = hpos ??= { ...posOf({ x: -1.1, z: -0.25 }) }, dx = helpTo.x - w.x, dz = helpTo.z - w.z, d = Math.hypot(dx, dz), st = Math.min(d, dt * 1.0);
    if (d > 0.05) { w.x += (dx / d) * st; w.z += (dz / d) * st; w.yaw = yawTo(dx, dz); }
    const walking = d > 0.05, ph = t * 7;
    crowd.pose(HELP, { x: w.x, y: w.y, z: w.z, yaw: w.yaw ?? 0, legs: walking ? [Math.sin(ph) * 0.45, -Math.sin(ph) * 0.45] : [0, 0], arms: walking && helpTo.k !== -1 ? [[1.3, -0.1], [1.3, -0.1]] : [[0.1, 0.05], [0.1, 0.05]] });
  }
  function update(dt, t) {
    now = t;
    const d = officeNow(), h = d.getHours() + d.getMinutes() / 60, was = open;
    open = isOpenAt(d); fri = bunDau(d);
    if (open !== was || seatedAt < 0) {
      food.visible = open; seatedAt = -1;
      if (!open) { LOC.forEach((i) => crowd.hide(i)); if (AUNT != null) crowd.hide(AUNT); if (HELP != null) crowd.hide(HELP); seatsTaken.fill(false); }
    }
    menuBoard.visible = !fri; fridayBoard.visible = fri; wok.visible = open && fri;
    if (bubble.visible && t > bubble.until) { bubble.visible = false; bubble.element.hidden = true; }
    const inView = seen(f.x, f.z);
    if (!open) { meals.forEach((m) => { m.com.visible = m.bd.visible = false; }); steam.show(t, 0, 0, 0, false); smoke.show(t, 0, 0, 0, false); crowd.flush(); return; }
    if (t - seatedAt > 20 || seatedAt < 0) { seatedAt = t; syncLocals(h); }
    const busy = [office.length > 0, seatsTaken.slice(0, 4).some(Boolean), seatsTaken[4] || seatsTaken[5]];
    meals.forEach((m, k) => { m.com.visible = busy[k] && !fri; m.bd.visible = busy[k] && fri; });
    const pot = W(RX, RZ, 0.8), canh = W(SX + 0.06, SZ, 0.95), wk = W(WX, WZ, 0.75);
    steam.show(t, (t % 6) < 3 ? pot.x : canh.x, (t % 6) < 3 ? pot.y : canh.y, (t % 6) < 3 ? pot.z : canh.z, inView);
    smoke.show(t, wk.x, wk.y, wk.z, inView && fri);
    if (!inView && !FORCE) { crowd.flush(); return; }
    poseAll(t, dt);
    crowd.flush();
  }
  // what people/comtrua.js needs: the office's four places, the way in, who is there, a word from the auntie
  const Qs = {
    open: () => open || isOpenAt(),
    friday: () => bunDau(),
    // the office's stools: where to stand (world), which way to face (atan2(dx, dz)), and the ground for a chibi sitting
    // on them (it sits 0.49 above its feet)
    seats: () => OFFICE.map((s) => { const p = W(s.x, s.z), c = W(T[0].x, T[0].z); return { x: p.x, z: p.z, face: Math.atan2(c.x - p.x, c.z - p.z), y: p.y + ST - 0.49 }; }),
    entry: () => { const p = W(T[0].x, 1.65); return { x: p.x, z: p.z }; },
    group: () => office, setGroup(list) { office = list; },
    // the bill: so many plates (or mẹt) at the price, and the auntie says it
    bill(n) { served += n; const total = n * (bunDau() ? PRICE_BD : PRICE); sayAt(posOf({ x: CX, z: 0.12 }), tr('people.com.bill', { n, total: `${(total * 1000).toLocaleString('vi-VN')}đ` })); if (seen(f.x, f.z)) sfx.play('coin'); return total; },
    hello() { sayAt(posOf({ x: CX, z: 0.12 }), tr(bunDau() ? 'people.com.helloBd' : 'people.com.hello')); },
    onYou(fn) { onYou = fn; },
  };
  return {
    update,
    blocked: (x, z, r) => inside(f, x, z, r, CX - 0.72, CX + 0.72, CZ - 0.34, CZ + 0.34) || inside(f, x, z, r, RX - 0.27, RX + 0.27, RZ - 0.27, RZ + 0.27) || inside(f, x, z, r, SX - 0.27, SX + 0.27, SZ - 0.25, SZ + 0.25)
      || T.some((t) => inside(f, x, z, r, t.x - t.w / 2, t.x + t.w / 2, t.z - 0.31, t.z + 0.31)),
    // in first person: at the cabinet, a plate of rice (or, on a Friday, a mẹt of bún đậu); with the office's lot there, you join them
    spots: () => (open ? [{ kind: 'com', ...(() => { const p = W(CX, 1.35); return { x: p.x, z: p.z }; })(), label: tr(fri ? 'fp.comBd' : 'fp.com', { price: `${((fri ? PRICE_BD : PRICE) * 1000).toLocaleString('vi-VN')}đ` }),
      act: () => { served++; sfx.play('coin'); toast(tr(office.length ? 'fp.comJoin' : fri ? 'fp.comBdDone' : 'fp.comDone', { names: office.map((m) => m.name).join(', ') })); onYou?.(); } }] : []),
    office: Qs,
    debug: { state: () => ({ open, friday: fri, locals: seatsTaken.filter(Boolean).length, office: office.map((m) => ({ name: m.name, stage: m.stage })), served, at: [+f.x.toFixed(1), +f.z.toFixed(1)] }),
      // where to stand to look at it (for pictures): out on the road in front, looking at the cart and the office's table
      view: (far = 1) => { const a = W(0.9 * far, 2.6 + 2.4 * far), b = W(-0.9, 0.3); return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; } },
  };
}
