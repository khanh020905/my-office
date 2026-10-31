// Phúc Long Coffee & Tea (a tea house from Bảo Lộc's hills, since 1968), as its street shops look in 2026: the deep green
// sign (the brand's #006F3C) with its crest in white (the domed badge, a cup with a tea leaf over it: the leaf of the 2025
// "Ủ Vị Tâm Giao" identity, the band across, SINCE 1968 under it) and PHÚC LONG in heavy white capitals, COFFEE & TEA
// spaced out under them; inside, wood and green, the wall of tea tins and packets (it still sells its teas by the
// packet), the counter with its menu at the official prices (Trà Sữa Phúc Long and Hồng Trà Sữa 55.000đ, Trà Đào
// 60.000đ, size M), a long table for groups; staff in black with the dark green apron; open 7:00–22:30, as most of its
// street shops. A delivery rider waits at the kerb at the busy times. Someone resting in the afternoon goes down for a
// trà sữa (people/outings.js). None of it is the chain's artwork: the crest is drawn here, the lettering set here.
// shops.js places it (PHUCLONG).
import * as THREE from 'three';
import { boxAt, colorize } from '../terrace.js';
import { figure, glassOver, lamp, plant } from './shop-paint.js';

export const PL_GREEN = '#006F3C';
const FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const WOOD = '#A47A52', WOOD_D = '#6E4A2E', WHITE = '#F4F2EC', DEEP = '#0B4A2C', APRON = '#0B5E36';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RP = { sign: [0, 0, 1024, 140], menu: [0, 140, 1024, 180], panel: [0, 320, 560, 110], posterA: [560, 320, 150, 192], posterB: [710, 320, 150, 192],
  stand: [860, 320, 164, 164], hours: [860, 484, 164, 28], wall: [0, 430, 560, 82] };

// the crest: a badge with a domed top, a cup with a tea leaf over it, the band across with the name, SINCE 1968 under it
function crest(g, cx, cy, s, ink, paper, band = true) {
  g.save();
  g.beginPath();
  g.moveTo(cx - s * 0.95, cy + s * 0.55); g.lineTo(cx - s * 0.95, cy - s * 0.2);
  g.quadraticCurveTo(cx - s * 0.95, cy - s * 0.42, cx - s * 0.74, cy - s * 0.46);
  g.bezierCurveTo(cx - s * 0.62, cy - s * 1.02, cx + s * 0.62, cy - s * 1.02, cx + s * 0.74, cy - s * 0.46);
  g.quadraticCurveTo(cx + s * 0.95, cy - s * 0.42, cx + s * 0.95, cy - s * 0.2); g.lineTo(cx + s * 0.95, cy + s * 0.55);
  g.quadraticCurveTo(cx + s * 0.95, cy + s * 0.82, cx + s * 0.68, cy + s * 0.82); g.lineTo(cx - s * 0.68, cy + s * 0.82);
  g.quadraticCurveTo(cx - s * 0.95, cy + s * 0.82, cx - s * 0.95, cy + s * 0.55); g.closePath();
  g.fillStyle = paper; g.fill(); g.strokeStyle = ink; g.lineWidth = Math.max(2, s * 0.07); g.stroke();
  // the cup (a bowl on its foot) and the leaf over it
  g.fillStyle = ink;
  g.beginPath(); g.moveTo(cx - s * 0.4, cy - s * 0.42); g.quadraticCurveTo(cx, cy + s * 0.08, cx + s * 0.4, cy - s * 0.42); g.closePath(); g.fill();
  g.fillRect(cx - s * 0.12, cy - s * 0.2, s * 0.24, s * 0.05);
  g.beginPath(); g.moveTo(cx - s * 0.24, cy - s * 0.46); g.bezierCurveTo(cx - s * 0.1, cy - s * 0.86, cx + s * 0.3, cy - s * 0.8, cx + s * 0.3, cy - s * 0.58); g.bezierCurveTo(cx + s * 0.1, cy - s * 0.44, cx - s * 0.1, cy - s * 0.42, cx - s * 0.24, cy - s * 0.46); g.fill();
  g.strokeStyle = paper; g.lineWidth = Math.max(1, s * 0.035); g.beginPath(); g.moveTo(cx - s * 0.18, cy - s * 0.48); g.quadraticCurveTo(cx + s * 0.05, cy - s * 0.62, cx + s * 0.24, cy - s * 0.6); g.stroke();
  if (band) {
    g.fillStyle = ink; g.fillRect(cx - s * 1.12, cy - s * 0.12, s * 2.24, s * 0.42);
    g.fillStyle = paper; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(s * 0.3)}px ${FONT}`; g.fillText('PHUC LONG', cx, cy + s * 0.1, s * 2.0);
    g.fillStyle = ink; g.font = `700 ${Math.round(s * 0.15)}px ${FONT}`; g.fillText('SINCE 1968', cx, cy + s * 0.55, s * 1.4);
  }
  g.restore();
}
// a line of capitals spaced out, centred on cx
function spaced(g, text, cx, cy, sp) {
  const ws = [...text].map((ch) => g.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  let x = cx - total / 2; g.textAlign = 'left';
  [...text].forEach((ch, i) => { g.fillText(ch, x, cy); x += ws[i] + sp; });
}
// the sign: deep green, the crest in white, the name in heavy white capitals, COFFEE & TEA under it
function sign(g, x, y, w, h, dark) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = PL_GREEN; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y, w, 5); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y + h - 9, w, 9);
  crest(g, x + 180, y + h / 2 + 4, 56, PL_GREEN, '#FFFFFF');
  g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 78px ${FONT}`;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillText('PHÚC LONG', x + 272, y + h * 0.43 + 3, w * 0.6);
  g.fillStyle = '#FFFFFF'; g.fillText('PHÚC LONG', x + 270, y + h * 0.43, w * 0.6);
  const nw = Math.min(w * 0.6, g.measureText('PHÚC LONG').width);
  g.font = `700 24px ${FONT}`; spaced(g, 'COFFEE & TEA', x + 270 + nw / 2, y + h * 0.83, 9);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
  g.restore();
}
// a cup of it: a clear cup, the drink, the green band with the crest
function cup(g, x, y, s, drink, top = null) {
  const w0 = s * 0.34, w1 = s * 0.27;
  g.save(); g.beginPath(); g.moveTo(x - w0, y); g.lineTo(x + w0, y); g.lineTo(x + w1, y + s); g.lineTo(x - w1, y + s); g.closePath(); g.clip();
  g.fillStyle = 'rgba(236,240,244,.92)'; g.fillRect(x - w0, y, w0 * 2, s); g.fillStyle = drink; g.fillRect(x - w0, y + s * 0.14, w0 * 2, s);
  if (top) { g.fillStyle = top; g.fillRect(x - w0, y + s * 0.14, w0 * 2, s * 0.12); }
  g.fillStyle = PL_GREEN; g.fillRect(x - w0, y + s * 0.44, w0 * 2, s * 0.26); g.restore();
  crest(g, x, y + s * 0.57, s * 0.1, '#FFFFFF', PL_GREEN, false);
}
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
const MENU = [
  ['TRÀ SỮA', [['Trà Sữa Phúc Long', 55], ['Hồng Trà Sữa', 55], ['Trà Sữa Matcha', 60]]],
  ['TRÀ TRÁI CÂY', [['Trà Đào', 60], ['Ô Long Cam Đào Konjac', 65], ['Hồng Trà Đào Sữa', 60]]],
];
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed, the sign's light off. */
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  sign(g, ...at(RP.sign), dark);
  // the menu over the back counter: dark green, white words, the prices; the cups on the right
  { const [x, y, w, h] = at(RP.menu), col = (w - 250) / MENU.length;
    g.fillStyle = DEEP; g.fillRect(x, y, w, h);
    MENU.forEach(([head, rows], k) => {
      const bx = x + k * col + 22;
      g.fillStyle = '#FFFFFF'; g.fillRect(bx - 8, y + 14, col - 36, 34);
      g.fillStyle = PL_GREEN; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 21px ${FONT}`; g.fillText(head, bx, y + 32, col - 50);
      rows.forEach(([n, p], i) => {
        const ry = y + 76 + i * 33;
        g.fillStyle = '#F2EFE6'; g.font = `600 19px ${FONT}`; g.textAlign = 'left'; g.fillText(n, bx, ry, col * 0.6);
        g.fillStyle = '#F5D76E'; g.font = `800 19px ${FONT}`; g.textAlign = 'right'; g.fillText(vnd(p), bx + col - 46, ry);
      });
    });
    g.fillStyle = '#F5D76E'; g.font = `700 14px ${FONT}`; g.textAlign = 'center'; g.fillText('SIZE M', x + w - 125, y + h - 16);
    cup(g, x + w - 190, y + 34, 100, '#C79A6B', '#F3E7D3'); cup(g, x + w - 125, y + 34, 100, '#E8A14B'); cup(g, x + w - 60, y + 34, 100, '#8DB255', '#F3E7D3'); }
  // the counter's front: wood, a green band with the crest and the name
  { const [x, y, w, h] = at(RP.panel);
    g.fillStyle = WOOD; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; for (let k = 0; k < w; k += 26) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + h); g.stroke(); }
    g.fillStyle = PL_GREEN; g.fillRect(x, y + h * 0.24, w, h * 0.52);
    crest(g, x + w * 0.2, y + h / 2 + 2, 22, PL_GREEN, '#FFFFFF', false);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 30px ${FONT}`; g.fillText('PHÚC LONG', x + w * 0.29, y + h / 2 - 6, w * 0.5);
    g.font = `700 13px ${FONT}`; spaced(g, 'COFFEE & TEA', x + w * 0.29 + 88, y + h / 2 + 20, 4); }
  // the posters in the window: the milk tea, the peach tea
  for (const [r, title, price, drink, top] of [[RP.posterA, 'TRÀ SỮA PHÚC LONG', '55K', '#C79A6B', '#F3E7D3'], [RP.posterB, 'TRÀ ĐÀO', '60K', '#E8A14B', null]]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = WHITE; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = PL_GREEN; g.fillRect(x + 6, y + 6, w - 12, 38);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 14px ${FONT}`; g.fillText(title, x + w / 2, y + 26, w - 18);
    cup(g, x + w / 2, y + 60, h * 0.42, drink, top);
    g.fillStyle = PL_GREEN; g.font = `900 30px ${FONT}`; g.fillText(price, x + w / 2, y + h * 0.87);
  }
  // the board on the pavement, the hours on the door, the story on the green wall
  { const [x, y, w, h] = at(RP.stand);
    g.fillStyle = '#1F2A24'; g.fillRect(x, y, w, h); g.strokeStyle = WOOD; g.lineWidth = 8; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    crest(g, x + w / 2, y + 44, 26, '#FFFFFF', '#1F2A24', false);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('TRÀ SỮA', x + w / 2, y + 84); g.fillText('PHÚC LONG', x + w / 2, y + 104);
    g.fillStyle = '#F5D76E'; g.font = `900 30px ${FONT}`; g.fillText('55K', x + w / 2, y + 136); }
  { const [x, y, w, h] = at(RP.hours);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = PL_GREEN; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 7:00 – 22:30', x + w / 2, y + h / 2 + 1, w - 10); }
  { const [x, y, w, h] = at(RP.wall);
    g.clearRect(x, y, w, h);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 28px ${FONT}`; g.fillText('TRÀ NGON TỪ ĐỒI BẢO LỘC · SINCE 1968', x + w / 2, y + h / 2, w - 20); }
}
/** Paints it as seen from across the street (a front too far to walk into): the sign, and the inside behind the glass. */
function paint(g, cx, cy, dark) {
  sign(g, cx, cy, 1024, 140, dark);
  const x = cx, y = cy + 140, w = 1024, h = 372;
  g.fillStyle = WHITE; g.fillRect(x, y, w, h);
  g.fillStyle = PL_GREEN; g.fillRect(x, y + h * 0.5, w * 0.48, h * 0.32);                     // the green wall, the tea tins over it
  g.fillStyle = WOOD; for (let k = 0; k < 3; k++) g.fillRect(x + w * 0.04, y + h * (0.16 + k * 0.11), w * 0.4, 6);
  for (let k = 0; k < 3; k++) for (let i = 0; i < 12; i++) { g.fillStyle = ['#0B6B3A', '#B8322A', '#C9A04B', '#F2EFE6'][(i + k) % 4]; g.fillRect(x + w * (0.05 + i * 0.032), y + h * (0.1 + k * 0.11), 22, 26); }
  g.fillStyle = DEEP; g.fillRect(x + w * 0.54, y + h * 0.13, w * 0.42, h * 0.18);             // the menu
  g.fillStyle = '#F2EFE6'; for (let k = 0; k < 3; k++) g.fillRect(x + w * 0.57, y + h * (0.17 + k * 0.045), w * 0.22, 4);
  g.fillStyle = '#B9AE9C'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
  figure(g, x + w * 0.76, y + h * 0.42, 15, APRON, '#1E1A18');                                   // the barista, the counter
  g.fillStyle = WOOD; g.fillRect(x + w * 0.5, y + h * 0.56, w * 0.48, h * 0.26); g.fillStyle = PL_GREEN; g.fillRect(x + w * 0.5, y + h * 0.62, w * 0.48, h * 0.1);
  for (const fx of [0.15, 0.36, 0.64, 0.85]) lamp(g, x + w * fx, y, y + h * 0.1, 11, '#FFF3D6', false);
  g.fillStyle = WOOD_D; g.fillRect(x + w * 0.08, y + h * 0.7, w * 0.32, 10);                   // the long table: a group at it
  for (const [fx, c] of [[0.1, '#DCE6F2'], [0.18, '#F2F2F2'], [0.3, '#E8B4C8'], [0.38, '#2A2D33']]) figure(g, x + w * fx, y + h * 0.6, 14, c);
  figure(g, x + w * 0.46, y + h * 0.5, 15, '#B8C8DC');                                           // someone ordering
  plant(g, x + w * 0.97, y + h * 0.95, 60, WOOD_D);
  glassOver(g, x, y, w, h);
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street) ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 12) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // a grey tiled floor, white walls with green along the foot, a white ceiling with long lights
  for (let x = -half; x < half - 0.01; x += 0.8) for (let z = -D; z < -0.01; z += 0.8) {
    const w = Math.min(0.8, half - x), d = Math.min(0.8, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w - 0.01, d - 0.01).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.8) + Math.round(-z / 0.8)) % 2 ? '#CFCBC2' : '#C4BFB5'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, WHITE);
  for (const s of [-1, 1]) { b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, WHITE); b(0.02, 1.0, D, s * (half - 0.065), 0.5, -D / 2, PL_GREEN); }
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#F7F6F2');
  for (const x of [-2.1, 1.5]) b(0.1, 0.03, D - 1.0, x, CEIL - FL - 0.075, -D / 2, '#FFFDF4');
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, PL_GREEN);
  // the green wall behind the long table, and the shelves of tea over it: tins and packets
  b(3.0, 1.0, 0.03, -1.8, 0.5, -D + 0.075, PL_GREEN);
  for (let s = 0; s < 3; s++) {
    const y = 1.2 + s * 0.36;
    b(2.8, 0.03, 0.22, -1.8, y, -D + 0.17, WOOD);
    for (let x = -3.1; x < -0.5; x += low ? 0.3 : 0.15) { const tin = r() < 0.6, hgt = tin ? 0.18 : 0.22; (tin ? cyl(0.05, 0.05, hgt, x, y + 0.015 + hgt / 2, -D + 0.17, ['#0B6B3A', '#B8322A', '#C9A04B'][Math.floor(r() * 3)], 10) : b(0.09, hgt, 0.06, x, y + 0.015 + hgt / 2, -D + 0.17, ['#F2EFE6', '#0B6B3A', '#C9A04B'][Math.floor(r() * 3)])); }
  }
  // a low white wall between the table and behind the counter
  b(0.08, CEIL - FL, D - 2.15, -0.3, (CEIL - FL) / 2, -(2.15 + D) / 2, WHITE); block(-0.36, -0.24, -D, -2.15);
  // the counter you order at: wood, a dark top, the till, a case of cakes, the cups ready
  b(3.5, 0.98, 0.6, 1.5, 0.49, -1.85, WOOD); b(3.56, 0.05, 0.66, 1.5, 1.0, -1.85, '#2A2421');
  b(0.36, 0.1, 0.3, 2.65, 1.08, -1.98, '#1E2125'); b(0.32, 0.22, 0.02, 2.65, 1.24, -2.06, '#2B3A55'); b(0.22, 0.15, 0.02, 2.65, 1.17, -1.72, '#2B3A55');
  b(0.62, 0.36, 0.42, 0.4, 1.21, -1.85, '#F4EEE4');
  for (const sx of [-1, 1]) glass.push(new THREE.PlaneGeometry(0.4, 0.32).rotateY(Math.PI / 2).translate(0.4 + sx * 0.31, FL + 1.21, -1.85));
  glass.push(new THREE.PlaneGeometry(0.62, 0.32).translate(0.4, FL + 1.21, -1.64));
  for (let k = 0; k < 6; k++) b(0.12, 0.06, 0.1, 0.23 + (k % 3) * 0.17, 1.08 + Math.floor(k / 3) * 0.13, -1.85, ['#C68A4A', '#E8D3A8', '#7FA350'][k % 3]);
  for (let k = 0; k < 4; k++) { cyl(0.042, 0.035, 0.14, 1.2 + k * 0.16, 1.1, -1.7, ['#C79A6B', '#E8A14B', '#8DB255', '#C79A6B'][k], 10); cyl(0.043, 0.043, 0.035, 1.2 + k * 0.16, 1.1, -1.7, PL_GREEN, 10); }
  block(-0.3, 3.3, -2.17, -1.53);
  // behind: the big tea urns, the shakers and the sealer, the syrups; the menu over them
  b(3.5, 0.92, 0.6, 1.5, 0.46, -D + 0.33, WOOD_D); b(3.56, 0.05, 0.64, 1.5, 0.94, -D + 0.33, '#2A2421');
  for (const x of [2.45, 2.8, 3.12]) { cyl(0.12, 0.12, 0.5, x, 1.22, -D + 0.33, '#C9CED6', 14); b(0.04, 0.05, 0.06, x, 1.02, -D + 0.47, '#3A3F47'); }
  b(0.3, 0.42, 0.3, 1.85, 1.17, -D + 0.3, '#2B2F36');
  for (let k = 0; k < 6; k++) cyl(0.03, 0.03, 0.26, 0.2 + k * 0.1, 1.09, -D + 0.22, ['#7A2E1E', '#E8A14B', '#2F6E2C', '#C79A6B'][k % 4], 8);
  for (let k = 0; k < 4; k++) cyl(0.04, 0.045, 0.2, 0.9 + k * 0.13, 1.06, -D + 0.45, '#D8DDE2', 10);
  b(3.5, 0.72, 0.06, 1.5, 2.12, -D + 0.04, '#13261B');   // the menu's frame (printed over)
  block(-0.3, 3.3, -D, -D + 0.66);
  // your side: a bar along the window with two stools, a long table for a group by the green wall
  const seats = [];
  b(2.3, 0.05, 0.4, -2.05, 1.0, -0.25, WOOD); b(2.3, 0.98, 0.04, -2.05, 0.49, -0.07, WOOD_D);
  for (const x of [-2.6, -1.6]) {
    cyl(0.17, 0.17, 0.05, x, 0.72, -0.65, '#1E1E1E', 14); cyl(0.025, 0.025, 0.7, x, 0.36, -0.65, '#5E6670', 6); cyl(0.2, 0.2, 0.02, x, 0.01, -0.65, '#1E1E1E', 14);
    seats.push({ x, z: -0.65, top: 0.745, dir: [0, 1], put: [x, 1.03, -0.27] });
    block(x - 0.18, x + 0.18, -0.83, -0.47);
  }
  block(-3.25, -0.9, -0.45, 0);
  const tx = -1.85, tz = -2.6, tl = 1.5;
  b(tl, 0.05, 0.7, tx, 0.72, tz, WOOD); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.05, 0.7, 0.05, tx + sx * (tl / 2 - 0.08), 0.35, tz + sz * 0.28, '#1E1612');
  for (const s of [-1, 1]) {
    b(tl - 0.1, 0.05, 0.3, tx, 0.45, tz + s * 0.62, WOOD_D); for (const sx of [-1, 1]) b(0.04, 0.44, 0.04, tx + sx * (tl / 2 - 0.12), 0.22, tz + s * 0.62, '#1E1612');   // the benches
    for (const sx of [-0.4, 0.4]) seats.push({ x: tx + sx, z: tz + s * 0.62, top: 0.475, dir: [0, -s], put: [tx + sx, 0.75, tz + s * 0.18] });
  }
  block(tx - tl / 2 - 0.05, tx + tl / 2 + 0.05, tz - 0.8, tz + 0.8);
  // walking in: a Phúc Long milk tea or a peach tea at the counter (paid there); a stool at the window
  spots.push({ kind: 'pay', item: { id: 'traSuaPhucLong', price: 55, carry: 'cup' }, x: 0.9, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'traDao', price: 60, carry: 'cup' }, x: 2.3, z: -1.15, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.1, z: -1.0, face: 0, seat: seats[1] });
  return { inner, glass, fix, spots, seats, till: { x: 2.3, z: -1.15 }, cashier: { x: 2.65, z: -2.45 }, steam: [], aisle: [],
    stations: [[2.8, -D + 0.75, -1], [1.85, -D + 0.75, -1], [0.4, -2.4, 1], [1.0, -D + 0.75, -1]] };
}

/* ---------- the front: posters, the hours, the menu, the green wall's words, the board on the pavement ---------- */
function front({ n, D, put, out, faces, decal }) {
  put(decal(0.55, 0.7, n, RP.posterA).translate(-2.75, FL + 1.5, -0.015), faces);
  put(decal(0.55, 0.7, n, RP.posterB).translate(2.75, FL + 1.5, -0.015), faces);
  put(decal(0.42, 0.072, n, RP.hours).translate(1.12, FL + 1.3, -0.015), faces);
  put(decal(3.4, 0.6, n, RP.menu).translate(1.5, FL + 2.12, -D + 0.075), faces);
  put(decal(3.4, 0.66, n, RP.panel).translate(1.5, FL + 0.5, -1.545), faces);
  put(decal(2.6, 0.38, n, RP.wall).translate(-1.8, FL + 0.62, -D + 0.095), faces);
  // the A-frame board out on the pavement, left of the door
  const bx = -1.6, bz = 0.55;
  put(boxAt(0.5, 0.62, 0.04, bx, FL + 0.36, bz + 0.12, WOOD), out);
  put(boxAt(0.5, 0.62, 0.04, bx, FL + 0.36, bz - 0.12, WOOD), out);
  put(decal(0.42, 0.42, n, RP.stand).translate(bx, FL + 0.4, bz + 0.145), faces);
  return {};
}

/* ---------- its people: the cashier and the barista (black, the green apron), the hours' regulars, someone ordering, a
   delivery rider at the kerb at the busy times ---------- */
const SIT = [[[7, 9.5], 1, 'office', 'laptop'], [[9.5, 11.5], 2, 'office', 'plcup'], [[14, 17.5], 4, 'office', 'plcup'], [[18, 22], 5, 'genz', 'plcup']];
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, lay, held, sy, mid, r, LOOK, HAIR, isOpen } = c;
  const all = () => [cashier, staff, ...sit, ...out], apron = { shirt: APRON, sleeves: '#1E1E1E', pants: '#1E1E1E' };
  crowd.dress(cashier, { ...apron, hair: '#2B2420' }); crowd.dress(staff, { ...apron, hair: '#1E1A18' });
  crowd.dress(out[0], { shirt: '#00A651', pants: '#2B2F36', hair: '#2B2420' }); crowd.dress(out[1], { ...LOOK.office(r), hair: '#3A2A20' });
  let dressedFor = '';
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); return; }
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 12) < 1.6;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      { const k = Math.floor(t / 8) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), busy = (t % 8) > 1.4;
        crowd.pose(staff, { x, y: sy, z, yaw: face(0, dir), arms: busy ? [[1.1, -0.1], [1.25 + Math.sin(t * 5) * 0.12, -0.1]] : [[0.15, 0], [0.15, 0]] });
        if (busy && k === 0) hand(staff, 'plcup'); }
      const rule = SIT.find(([[a, b]]) => h >= a && h < b), many = rule ? Math.min(rule[1], sit.length) : 0;
      if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z), typing = rule[3] === 'laptop', sip = !typing && ((t + k * 3.1) % 7) < 1.3;
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir) + Math.sin(t * 0.3 + k) * 0.08, lean: -0.12,
          arms: typing ? [[1.25, -0.25 + Math.sin(t * 9 + k) * 0.03], [1.25, -0.25 + Math.cos(t * 9 + k) * 0.03]] : [[1.1, -0.3], sip ? [2.25, -0.4] : [1.1, -0.3]] });
        lay(rule[3], ...s.put); if (typing) lay('screen', ...s.put);
      });
      if ((t % 55) < 42) { show(out[1], { x: 1.6, z: -1.2, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 55) < 9 ? [0.9, -0.1] : [0.5, -0.1]] }); if ((t % 55) > 26) hand(out[1], 'plcup'); }
      else crowd.hide(out[1]);
      // a delivery rider on his scooter at the kerb, waiting for the order (lunch, the afternoon, the evening)
      if (((h >= 11 && h < 13) || (h >= 14.5 && h < 16.5) || (h >= 18 && h < 21)) && (t % 200) < 120) { show(out[0], { x: -2.4, z: 1.0, sit: 0.92, yaw: 0, lean: 0.15, arms: [[1.3, -0.2], [1.4, -0.2]], hat: true }); lay('courier', -2.15, 0, 1.0); }
      else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; },
  };
}

export const PHUCLONG = {
  chain: { name: 'Phúc Long', short: 'Phúc Long', face: PL_GREEN, stripes: [PL_GREEN], accent: PL_GREEN, shirt: APRON, hours: [7, 22.5], seats: true, greet: 'Phúc Long xin chào!' },
  kerb: [1.4, 2.2, 3.0], draw, paint, fit, front, people,
};
