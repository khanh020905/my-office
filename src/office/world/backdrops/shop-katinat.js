// Katinat (KATINAT Coffee & Tea House: the Saigon Kafé of 2016, named after rue Catinat, today's Đồng Khởi), as its shops
// look in 2026: the navy sign with KATINAT in warm-lit raised letters the colour of milk coffee (the brand's #BF9369), heavy
// narrow capitals whose foot bows (the outer letters longer), COFFEE & TEA HOUSE spaced out under them; glass all along
// the front, plants by the door; inside, navy and warm wood, globe lamps hung low, the counter with its row of layered
// cups (the "rainbow cup" that made the name), the menu lightbox at the official prices (Trà Sữa Oolong Nướng 42.000đ,
// Oolong Nướng Huyền Châu 55.000đ, Bơ Già Dừa Non 55.000đ, size S), and the navy wall with the name on it that everyone
// takes their picture against. Staff in long navy aprons over beige; open 7:00–23:00. Gen Z in the evening: a queue at
// the counter, someone out on the pavement photographing the front at the weekend. None of it is the chain's artwork: the
// lettering is set and drawn here. shops.js places it (KATINAT).
import * as THREE from 'three';
import { officeNow } from '../../core/env.js';
import { boxAt, colorize } from '../terrace.js';
import { figure, glassOver, lamp, plant } from './shop-paint.js';

export const KT_NAVY = '#1A2B4C', KT_CAMEL = '#BF9369';
const FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';
const WOOD = '#9A7552', WOOD_D = '#6B4E35', CREAM = '#F1ECE4', STONE = '#E4D9C8', APRON = '#22314F', BEIGE = '#CDB79A';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RK = { sign: [0, 0, 1024, 140], menu: [0, 140, 1024, 180], panel: [0, 320, 560, 110], posterA: [560, 320, 150, 192], posterB: [710, 320, 150, 192],
  badge: [860, 320, 164, 164], hours: [860, 484, 164, 28], wall: [0, 430, 560, 82] };

// KATINAT: heavy, narrow capitals, the tops in a line, the foot bowed (each letter longer the further it is from the middle)
function wordmark(g, cx, top, size, c, maxW) {
  const L = [...'KATINAT'];
  g.save(); g.fillStyle = c; g.textAlign = 'center'; g.textBaseline = 'top'; g.font = `900 ${size}px ${FONT}`;
  const ws = L.map((ch) => g.measureText(ch).width * 0.74), gap = size * 0.05, total = ws.reduce((a, b) => a + b, 0) + gap * (L.length - 1), k = Math.min(1, maxW / total);
  let x = cx - (total * k) / 2;
  L.forEach((ch, i) => { const u = (i - 3) / 3; g.save(); g.translate(x + (ws[i] * k) / 2, top); g.scale(0.74 * k, 1 + 0.24 * u * u); g.fillText(ch, 0, 0); g.restore(); x += (ws[i] + gap) * k; });
  g.restore();
}
// a line of capitals spaced out, centred on cx
function spaced(g, text, cx, cy, sp) {
  const ws = [...text].map((ch) => g.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  let x = cx - total / 2; g.textAlign = 'left';
  [...text].forEach((ch, i) => { g.fillText(ch, x, cy); x += ws[i] + sp; });
}
// the sign: navy, the name in raised letters lit warm, the line under it
function sign(g, x, y, w, h, dark) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = KT_NAVY; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, w, 5); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + h - 8, w, 8);
  if (!dark) { g.shadowColor = 'rgba(255,214,150,.6)'; g.shadowBlur = 16; }
  wordmark(g, x + w / 2, y + 2, 98, KT_CAMEL, w * 0.56);
  g.shadowBlur = 0;
  g.fillStyle = KT_CAMEL; g.font = `600 21px ${SERIF}`; g.textBaseline = 'middle'; spaced(g, 'COFFEE & TEA HOUSE', x + w / 2, y + h - 24, 4);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
  g.restore();
}
// a clear cup of it, layered: pearls at the bottom, the tea, a cap of cream (or the avocado and young coconut)
function cup(g, x, y, s, layers) {
  const w0 = s * 0.34, w1 = s * 0.27;
  g.save(); g.beginPath(); g.moveTo(x - w0, y); g.lineTo(x + w0, y); g.lineTo(x + w1, y + s); g.lineTo(x - w1, y + s); g.closePath(); g.clip();
  g.fillStyle = 'rgba(236,240,244,.9)'; g.fillRect(x - w0, y, w0 * 2, s);
  let at = y + s; for (const [c, f] of layers) { g.fillStyle = c; g.fillRect(x - w0, at - s * f, w0 * 2, s * f); at -= s * f; }
  g.restore();
  g.fillStyle = 'rgba(236,240,244,.95)'; g.beginPath(); g.ellipse(x, y, w0 * 1.02, s * 0.06, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2B2F36'; g.fillRect(x + w0 * 0.3, y - s * 0.32, 4, s * 0.34);   // (the straw)
}
const OOLONG = [['#2A1D16', 0.14], ['#B98E66', 0.5], ['#F3E7D3', 0.18]], BO = [['#F4F1E6', 0.22], ['#8DB255', 0.44], ['#E9F0D8', 0.16]], VAI = [['#E8C0C8', 0.3], ['#F2D4B6', 0.36], ['#FFFFFF', 0.12]];
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
const MENU = [
  ['TRÀ SỮA', [['Trà Sữa Oolong Nướng', 42], ['Oolong Nướng Huyền Châu', 55], ['Trà Sữa Oolong Ba Lá', 42]]],
  ['ĐÁ XAY & TRÀ', [['Bơ Già Dừa Non', 55], ['Trà Sữa Chôm Chôm', 60], ['Hồng Trà Sữa Huyền Châu', 65]]],
];
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed, the sign's light off. */
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  sign(g, ...at(RK.sign), dark);
  // the menu lightbox over the back counter: cream, navy heads, the prices; the cups on the right
  { const [x, y, w, h] = at(RK.menu), col = (w - 260) / MENU.length;
    g.fillStyle = '#F6EEE2'; g.fillRect(x, y, w, h);
    g.fillStyle = KT_NAVY; g.fillRect(x, y, w, 8); g.fillRect(x, y + h - 8, w, 8);
    MENU.forEach(([head, rows], k) => {
      const bx = x + k * col + 22;
      g.fillStyle = KT_NAVY; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 22px ${FONT}`; g.fillText(head, bx, y + 34, col - 40);
      g.fillStyle = KT_CAMEL; g.fillRect(bx, y + 50, col - 50, 3);
      rows.forEach(([n, p], i) => {
        const ry = y + 78 + i * 32;
        g.fillStyle = '#26324A'; g.font = `600 18px ${FONT}`; g.textAlign = 'left'; g.fillText(n, bx, ry, col * 0.62);
        g.fillStyle = '#9A6B3F'; g.font = `800 18px ${FONT}`; g.textAlign = 'right'; g.fillText(vnd(p), bx + col - 50, ry);
      });
    });
    cup(g, x + w - 200, y + 50, 96, OOLONG); cup(g, x + w - 130, y + 50, 96, BO); cup(g, x + w - 60, y + 50, 96, VAI); }
  // the counter's front: navy, the name in the middle, thin camel lines
  { const [x, y, w, h] = at(RK.panel);
    g.fillStyle = KT_NAVY; g.fillRect(x, y, w, h);
    g.fillStyle = KT_CAMEL; g.fillRect(x, y + 10, w, 2); g.fillRect(x, y + h - 12, w, 2);
    wordmark(g, x + w / 2, y + 22, 58, KT_CAMEL, w * 0.5); }
  // the posters in the window: the roasted oolong with black pearls, the avocado and young coconut
  for (const [r, title, price, layers] of [[RK.posterA, 'OOLONG NƯỚNG HUYỀN CHÂU', '55K', OOLONG], [RK.posterB, 'BƠ GIÀ DỪA NON', '55K', BO]]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = '#F6EEE2'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = KT_NAVY; g.fillRect(x + 6, y + 6, w - 12, 40);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 13px ${FONT}`; g.fillText(title, x + w / 2, y + 27, w - 18);
    cup(g, x + w / 2, y + 66, h * 0.4, layers);
    g.fillStyle = KT_NAVY; g.font = `900 30px ${FONT}`; g.fillText(price, x + w / 2, y + h * 0.87);
  }
  // a round sticker on the glass (the K of the first sign), the hours on the door, the name on the navy wall
  { const [x, y, w, h] = at(RK.badge), r = Math.min(w, h) / 2;
    g.clearRect(x, y, w, h);
    g.fillStyle = KT_CAMEL; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = KT_NAVY; g.lineWidth = 5; g.beginPath(); g.arc(x + w / 2, y + h / 2, r - 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = KT_NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(r)}px ${FONT}`; g.fillText('K', x + w / 2, y + h / 2 + 4); }
  { const [x, y, w, h] = at(RK.hours);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = KT_NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 7:00 – 23:00', x + w / 2, y + h / 2 + 1, w - 10); }
  { const [x, y, w, h] = at(RK.wall);
    g.clearRect(x, y, w, h);
    g.shadowColor = 'rgba(255,214,150,.5)'; g.shadowBlur = 10; wordmark(g, x + w / 2, y - 4, 70, KT_CAMEL, w * 0.8); g.shadowBlur = 0; }
}
/** Paints it as seen from across the street (a front too far to walk into): the sign, and the inside behind the glass. */
function paint(g, cx, cy, dark) {
  sign(g, cx, cy, 1024, 140, dark);
  const x = cx, y = cy + 140, w = 1024, h = 372;
  g.fillStyle = '#EFE3CF'; g.fillRect(x, y, w, h);
  g.fillStyle = KT_NAVY; g.fillRect(x, y + h * 0.1, w * 0.5, h * 0.62);                       // the navy wall, the name on it
  wordmark(g, x + w * 0.25, y + h * 0.2, 46, KT_CAMEL, w * 0.32);
  g.fillStyle = '#F6EEE2'; g.fillRect(x + w * 0.54, y + h * 0.14, w * 0.42, h * 0.17);       // the menu lightbox
  g.fillStyle = KT_NAVY; for (let k = 0; k < 3; k++) g.fillRect(x + w * (0.57 + k * 0.13), y + h * 0.18, w * 0.1, 5);
  g.fillStyle = '#C9B79C'; g.fillRect(x, y + h * 0.8, w, h * 0.2);
  g.fillStyle = WOOD_D; g.fillRect(x + w * 0.52, y + h * 0.42, w * 0.46, h * 0.1);            // the back counter, the barista
  figure(g, x + w * 0.8, y + h * 0.38, 15, APRON);
  g.fillStyle = KT_NAVY; g.fillRect(x + w * 0.5, y + h * 0.56, w * 0.48, h * 0.26); g.fillStyle = STONE; g.fillRect(x + w * 0.5, y + h * 0.55, w * 0.48, 8);
  for (let k = 0; k < 5; k++) { const [a, b2, c] = [OOLONG, BO, VAI][k % 3]; g.fillStyle = c[0]; g.fillRect(x + w * (0.54 + k * 0.035), y + h * 0.48, 16, 14); g.fillStyle = b2[0]; g.fillRect(x + w * (0.54 + k * 0.035), y + h * 0.48 + 14, 16, 14); g.fillStyle = a[0]; g.fillRect(x + w * (0.54 + k * 0.035), y + h * 0.48 + 28, 16, 6); }
  for (const fx of [0.1, 0.3, 0.62, 0.86]) lamp(g, x + w * fx, y, y + h * 0.24, 13);
  for (const [fx, c] of [[0.43, '#F2F2F2'], [0.47, '#1E1E1E'], [0.51, '#E8B4C8']]) figure(g, x + w * fx, y + h * 0.5, 15, c, '#1E1A18');   // the queue
  g.fillStyle = WOOD; g.fillRect(x + w * 0.12, y + h * 0.66, w * 0.2, 10);                    // a table, two at it with their cups
  figure(g, x + w * 0.14, y + h * 0.56, 14, '#B8D8F0'); figure(g, x + w * 0.3, y + h * 0.56, 14, '#F7D774', '#3A2A20');
  plant(g, x + w * 0.04, y + h * 0.95, 70); plant(g, x + w * 0.97, y + h * 0.95, 70);
  glassOver(g, x, y, w, h);
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street) ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 12) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const ball = (s, x, y, z, c) => inner.push(colorize(new THREE.SphereGeometry(s, 10, 7).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // a pale terrazzo floor, cream walls, the navy wall at the back, a ceiling of wooden slats, globe lamps hung low
  for (let x = -half; x < half - 0.01; x += 1.1) for (let z = -D; z < -0.01; z += 1.1) {
    const w = Math.min(1.1, half - x), d = Math.min(1.1, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w - 0.01, d - 0.01).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 1.1) + Math.round(-z / 1.1)) % 2 ? '#E7DFD3' : '#DCD2C3'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, KT_NAVY);
  for (const s of [-1, 1]) b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, CREAM);
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#4A3626');
  for (let x = -half + 0.25; x < half - 0.1; x += low ? 0.8 : 0.4) b(0.07, 0.05, D - 0.1, x, CEIL - FL - 0.085, -D / 2, WOOD);
  for (const x of [-2.4, -1.2, 0.9, 2.3]) for (const z of [-1.15, -2.9]) { if (z < -D + 0.5) continue; b(0.01, 0.32, 0.01, x, CEIL - FL - 0.25, z, '#1E1612'); ball(0.12, x, CEIL - FL - 0.52, z, '#FFE7B8'); }
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, KT_NAVY);
  // a low navy wall between the seats and behind the counter
  b(0.08, CEIL - FL, D - 2.15, -0.3, (CEIL - FL) / 2, -(2.15 + D) / 2, KT_NAVY); block(-0.36, -0.24, -D, -2.15);
  // the counter you order at: navy, a stone top, the till, the row of layered cups, a case of cakes
  b(3.5, 0.98, 0.6, 1.5, 0.49, -1.85, KT_NAVY); b(3.56, 0.05, 0.66, 1.5, 1.0, -1.85, STONE);
  b(3.5, 0.03, 0.02, 1.5, 0.92, -1.54, KT_CAMEL);
  b(0.36, 0.1, 0.3, 2.65, 1.08, -1.98, '#1E2125'); b(0.32, 0.22, 0.02, 2.65, 1.24, -2.06, '#2B3A55'); b(0.22, 0.15, 0.02, 2.65, 1.17, -1.72, '#2B3A55');   // the till
  [OOLONG, BO, VAI, OOLONG, BO].forEach((lay, k) => {   // the layered cups, as they come over the counter
    const x = 1.25 + k * 0.17; let y = 1.03;
    for (const [c, f] of lay) { cyl(0.042, 0.036, 0.14 * f / 0.8, x, y + (0.14 * f / 0.8) / 2, -1.68, c, 10); y += 0.14 * f / 0.8; }
  });
  b(0.62, 0.34, 0.42, 0.35, 1.2, -1.85, '#F7F0E4');   // the case of cakes: lit, glass all round
  for (const sx of [-1, 1]) glass.push(new THREE.PlaneGeometry(0.4, 0.3).rotateY(Math.PI / 2).translate(0.35 + sx * 0.31, FL + 1.2, -1.85));
  glass.push(new THREE.PlaneGeometry(0.62, 0.3).translate(0.35, FL + 1.2, -1.64));
  for (let k = 0; k < 6; k++) b(0.12, 0.06, 0.1, 0.18 + (k % 3) * 0.17, 1.08 + Math.floor(k / 3) * 0.13, -1.85, ['#C68A4A', '#F2E6D0', '#8DB255'][k % 3]);
  block(-0.3, 3.3, -2.17, -1.53);
  // behind: the tea urns, the cup sealer, the shakers, the stacks of cups; the menu lightbox over them
  b(3.5, 0.92, 0.6, 1.5, 0.46, -D + 0.33, WOOD_D); b(3.56, 0.05, 0.64, 1.5, 0.94, -D + 0.33, STONE);
  for (const x of [2.55, 2.95]) { cyl(0.13, 0.13, 0.46, x, 1.2, -D + 0.33, '#C9CED6', 14); cyl(0.135, 0.135, 0.03, x, 1.44, -D + 0.33, '#9AA2AD', 14); b(0.04, 0.05, 0.06, x, 1.02, -D + 0.48, '#3A3F47'); }
  b(0.3, 0.42, 0.3, 1.95, 1.17, -D + 0.3, '#2B2F36'); b(0.24, 0.04, 0.2, 1.95, 1.0, -D + 0.42, '#C9CED6');   // the sealer
  for (let k = 0; k < 5; k++) cyl(0.04, 0.045, 0.2, 0.4 + k * 0.14, 1.06, -D + 0.42, '#D8DDE2', 10);   // the shakers
  for (let k = 0; k < 4; k++) cyl(0.045, 0.04, 0.34 + (k % 2) * 0.1, 0.1 + k * 0.12 + 1.0, 1.13, -D + 0.22, '#EEF1F4', 10);   // the cups, stacked
  b(3.5, 0.72, 0.06, 1.5, 2.12, -D + 0.04, '#0F1A2E');   // the menu's frame (printed over)
  block(-0.3, 3.3, -D, -D + 0.66);
  // a tall plant by the glass on the left; your side: a bar along the window with three stools, a round table by the navy wall
  cyl(0.2, 0.15, 0.42, -3.0, 0.21, -1.5, '#2B2F36'); for (const [dx, dy, s, c] of [[0, 0.75, 0.3, '#3E7A3A'], [0.1, 1.05, 0.24, '#5FA04F'], [-0.08, 1.25, 0.2, '#4E8E45']]) ball(s, -3.0 + dx, dy, -1.5, c);
  block(-3.25, -2.75, -1.75, -1.25);
  const seats = [];
  b(2.3, 0.05, 0.4, -2.05, 1.0, -0.25, WOOD); b(2.3, 0.98, 0.04, -2.05, 0.49, -0.07, KT_NAVY);
  for (const x of [-2.75, -2.0, -1.25]) {
    cyl(0.17, 0.17, 0.05, x, 0.72, -0.65, KT_NAVY, 14); cyl(0.025, 0.025, 0.7, x, 0.36, -0.65, '#B8975F', 6); cyl(0.2, 0.2, 0.02, x, 0.01, -0.65, '#1E1612', 14);
    seats.push({ x, z: -0.65, top: 0.745, dir: [0, 1], put: [x, 1.03, -0.27] });
    block(x - 0.18, x + 0.18, -0.83, -0.47);
  }
  block(-3.25, -0.9, -0.45, 0);
  const tx = -1.85, tz = -2.55;
  cyl(0.36, 0.36, 0.04, tx, 0.72, tz, STONE, 18); cyl(0.04, 0.04, 0.7, tx, 0.35, tz, '#B8975F', 6); cyl(0.22, 0.22, 0.02, tx, 0.01, tz, '#1E1612', 14);
  for (const s of [-1, 1]) {
    const sx = tx + s * 0.6;
    b(0.4, 0.05, 0.4, sx, 0.45, tz, WOOD); b(0.04, 0.4, 0.4, sx + s * 0.2, 0.67, tz, WOOD_D); for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.03, 0.44, 0.03, sx + ax * 0.17, 0.22, tz + az * 0.17, '#1E1612');
    seats.push({ x: sx, z: tz, top: 0.475, dir: [-s, 0], put: [tx + s * 0.16, 0.75, tz] });
    block(sx - 0.22, sx + 0.22, tz - 0.22, tz + 0.22);
  }
  block(tx - 0.38, tx + 0.38, tz - 0.38, tz + 0.38);
  // walking in: a roasted oolong milk tea or the avocado and young coconut, at the counter (paid there); a stool at the window
  spots.push({ kind: 'pay', item: { id: 'oolongNuong', price: 42, carry: 'cup' }, x: 0.9, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'boGiaDuaNon', price: 55, carry: 'cup' }, x: 2.3, z: -1.15, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.0, z: -1.0, face: 0, seat: seats[1] });
  return { inner, glass, fix, spots, seats, till: { x: 2.3, z: -1.15 }, cashier: { x: 2.65, z: -2.45 }, steam: [], aisle: [],
    stations: [[2.75, -D + 0.75, -1], [1.95, -D + 0.75, -1], [0.7, -D + 0.75, -1], [1.4, -2.4, 1]] };
}

/* ---------- the front: posters, the round sticker, the hours, the menu, the name on the navy wall, plants by the door ---------- */
function front({ n, D, put, out, faces, decal, decalOn }) {
  put(decal(0.55, 0.7, n, RK.posterA).translate(-2.75, FL + 1.5, -0.015), faces);
  put(decal(0.55, 0.7, n, RK.posterB).translate(2.75, FL + 1.5, -0.015), faces);
  put(decalOn(new THREE.CircleGeometry(0.2, 24).translate(-1.6, FL + 1.7, -0.012), n, RK.badge), faces);
  put(decal(0.42, 0.072, n, RK.hours).translate(1.12, FL + 1.3, -0.015), faces);
  put(decal(3.4, 0.6, n, RK.menu).translate(1.5, FL + 2.12, -D + 0.075), faces);
  put(decal(3.4, 0.66, n, RK.panel).translate(1.5, FL + 0.5, -1.545), faces);
  put(decal(2.5, 0.37, n, RK.wall).translate(-1.8, FL + 1.75, -D + 0.07), faces);
  // two tall plants in navy pots either side of the door
  for (const x of [-1.15, 1.15]) {
    put(colorize(new THREE.CylinderGeometry(0.2, 0.16, 0.46, 12).translate(x, FL + 0.23, 0.32), KT_NAVY), out);
    for (const [dy, s, c] of [[0.72, 0.28, '#3E7A3A'], [0.98, 0.22, '#4E8E45'], [1.16, 0.16, '#5FA04F']]) put(colorize(new THREE.SphereGeometry(s, 9, 6).translate(x, FL + dy, 0.32), c), out);
  }
  return {};
}

/* ---------- its people: the cashier and the barista (navy aprons over beige), the hours' regulars (laptops in the
   morning, Gen Z in the evening), someone ordering, a queue on weekday evenings, someone photographing the front at the
   weekend ---------- */
const SIT = [[[7, 9.5], 1, 'office', 'laptop'], [[9.5, 11.5], 2, 'office', 'ktcup'], [[14, 17.5], 3, 'student', 'laptop'], [[17.5, 23], 5, 'genz', 'ktcup']];
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, lay, held, sy, mid, r, LOOK, HAIR, isOpen, wx } = c;
  const all = () => [cashier, staff, ...sit, ...out], apron = { shirt: APRON, sleeves: BEIGE, pants: '#1E1E1E' };
  crowd.dress(cashier, { ...apron, hair: '#2B2420' }); crowd.dress(staff, { ...apron, hair: '#1E1A18' });
  crowd.dress(out[0], { ...LOOK.genz(r), hair: '#3A2A20' }); crowd.dress(out[1], { ...LOOK.genz(r), hair: '#1E1A18' });
  let dressedFor = '';
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); return; }
      const day = officeNow().getDay(), weekend = day === 0 || day === 6;
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 10) < 1.8;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the barista: the urns, the sealer, the shakers, the counter with a cup
      { const k = Math.floor(t / 7) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), busy = (t % 7) > 1.2;
        crowd.pose(staff, { x, y: sy, z, yaw: face(0, dir), arms: busy ? [[1.1, -0.1], [1.25 + Math.sin(t * 6) * 0.12, -0.1]] : [[0.15, 0], [0.15, 0]] });
        if (busy && k === 3) hand(staff, 'ktcup'); }
      const rule = weekend && h >= 14 ? [null, 5, 'genz', 'ktcup'] : SIT.find(([[a, b]]) => h >= a && h < b), many = rule ? Math.min(rule[1], sit.length) : 0;
      if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z), typing = rule[3] === 'laptop', snap = !typing && ((t + k * 5.3) % 23) < 2.4, sip = !typing && !snap && ((t + k * 3.1) % 7) < 1.3;
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir) + Math.sin(t * 0.3 + k) * 0.08, lean: -0.12,
          arms: typing ? [[1.25, -0.25 + Math.sin(t * 9 + k) * 0.03], [1.25, -0.25 + Math.cos(t * 9 + k) * 0.03]] : snap ? [[1.1, -0.3], [1.75, -0.1]] : [[1.1, -0.3], sip ? [2.25, -0.4] : [1.1, -0.3]] });
        lay(typing ? 'laptop' : 'ktcup', ...s.put); if (typing) lay('screen', ...s.put); else if (snap) hand(i, 'phone');   // (a picture of the cup first)
      });
      // someone ordering, then waiting with it; on weekday evenings a second one in the queue behind; at the weekend
      // (dry) someone out on the pavement taking the front's picture
      const busy = h >= 17.5 && h < 22.5;
      if ((t % 50) < 40 || busy) { show(out[1], { x: 1.6, z: -1.2, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 50) < 9 ? [0.9, -0.1] : [0.5, -0.1]] }); if ((t % 50) > 24) hand(out[1], 'ktcup'); }
      else crowd.hide(out[1]);
      if (weekend && wx.rain < 0.05 && h >= 9 && h < 21) {
        show(out[0], { x: -0.6, z: 1.65, yaw: -Math.PI / 2, arms: [[1.55, -0.12], [1.55, 0.12]] }); hand(out[0], 'phone');
      } else if (busy) show(out[0], { x: 1.6, z: -0.6, yaw: Math.PI / 2 + 0.2, arms: [[0.2, 0], ((t + 3) % 9) < 4 ? [1.2, -0.1] : [0.2, 0]] });
      else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; },
  };
}

export const KATINAT = {
  chain: { name: 'Katinat', short: 'Katinat', face: KT_NAVY, stripes: [KT_NAVY, KT_CAMEL], accent: KT_CAMEL, shirt: APRON, hours: [7, 23], seats: true, greet: 'Katinat xin chào!' },
  kerb: [1.6, 2.35, 3.05], draw, paint, fit, front, people,
};
