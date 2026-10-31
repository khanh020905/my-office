// Highlands Coffee, as its street-front shops look in Vietnam in 2026: the deep red ("đỏ đô") sign with the name in white
// raised letters and the emblem beside it (the 2022 one: an oval, like a coffee bean, with its mountain, river and
// plain), warm wood inside with red set on the counters and a wall, the black and red of the staff; the order counter
// with the espresso machine, the phin filters and a case of cakes; the menu board over it at the official prices (Phin
// Sữa Đá 29.000đ, Freeze Trà Xanh 55.000đ, Trà Sen Vàng and Phindi Hạnh Nhân 45.000đ); wooden tables and a bar along the
// window, a table on the pavement; open 7:00–23:00. In the morning the day's first one in stops for a cà phê on the way up
// (people/outings.js). None of it is the chain's artwork: the lettering is set here, the emblem drawn here. shops.js
// places it (HIGHLANDS: the chain, the printing, the fittings, the front, the people).
import * as THREE from 'three';
import { boxAt, colorize } from '../terrace.js';

export const HL_RED = '#9B1C21';
const FL = 0.12, CEIL = 2.75, SERIF = 'Georgia, "Times New Roman", serif', FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const WOOD = '#7A4B2E', WOOD_D = '#5A3420', CREAM = '#EFE6D8';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RH = { sign: [0, 0, 1024, 140], menu: [0, 140, 1024, 180], panel: [0, 320, 560, 110], posterA: [560, 320, 150, 192], posterB: [710, 320, 150, 192],
  badge: [860, 320, 164, 164], hours: [860, 484, 164, 28], wall: [0, 430, 560, 82] };

// the emblem, drawn: an oval (a bean) with its mountain, its river and its plain, in one colour
function emblem(g, cx, cy, s, c) {
  g.save(); g.strokeStyle = c; g.fillStyle = c; g.lineWidth = Math.max(2, s * 0.09);
  g.beginPath(); g.ellipse(cx, cy, s * 0.78, s, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, s * 0.78, s, 0, 0, Math.PI * 2); g.clip();
  g.beginPath(); g.moveTo(cx - s, cy + s * 0.15); g.lineTo(cx - s * 0.25, cy - s * 0.55); g.lineTo(cx + s * 0.05, cy - s * 0.2); g.lineTo(cx + s * 0.35, cy - s * 0.45); g.lineTo(cx + s, cy + s * 0.1); g.closePath(); g.fill();   // the mountain
  g.lineWidth = Math.max(2, s * 0.11);
  for (const k of [0.32, 0.56]) { g.beginPath(); g.moveTo(cx - s, cy + s * k); g.bezierCurveTo(cx - s * 0.3, cy + s * (k - 0.18), cx + s * 0.3, cy + s * (k + 0.18), cx + s, cy + s * k); g.stroke(); }   // the river, the plain
  g.restore();
}
// a cup of it: the brand's red band, the coffee or the matcha green, the dome of a freeze
function cup(g, x, y, s, drink, dome = false) {
  const w0 = s * 0.34, w1 = s * 0.26;
  g.fillStyle = 'rgba(232,236,240,.95)'; g.beginPath(); g.moveTo(x - w0, y); g.lineTo(x + w0, y); g.lineTo(x + w1, y + s); g.lineTo(x - w1, y + s); g.closePath(); g.fill();
  g.save(); g.clip(); g.fillStyle = drink; g.fillRect(x - w0, y + s * 0.18, w0 * 2, s); g.fillStyle = HL_RED; g.fillRect(x - w0, y + s * 0.42, w0 * 2, s * 0.22); g.restore();
  emblem(g, x, y + s * 0.53, s * 0.08, '#FFFFFF');
  if (dome) { g.fillStyle = '#F6F1E7'; g.beginPath(); g.ellipse(x, y + 1, w0 * 0.95, s * 0.2, 0, Math.PI, 0); g.fill(); g.fillStyle = '#6B3F25'; g.fillRect(x - 2, y - s * 0.3, 4, s * 0.12); }
}
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
const MENU = [
  ['CÀ PHÊ PHIN', [['Phin Sữa Đá', 29], ['Phin Đen Đá', 29], ['Phindi Hạnh Nhân', 45]]],
  ['FREEZE', [['Freeze Trà Xanh', 55], ['Caramel Phin Freeze', 55], ['Cookies & Cream', 55]]],
  ['TRÀ', [['Trà Sen Vàng', 45]]],
];
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed, the sign's light off. */
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  // the sign: deep red, the emblem, HIGHLANDS in white raised letters, COFFEE under it
  { const [x, y, w, h] = at(RH.sign);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = HL_RED; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + h - 10, w, 10);
    emblem(g, x + 150, y + h / 2, 44, '#FFFFFF');
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `700 74px ${SERIF}`;
    const hw = Math.min(w * 0.62, g.measureText('HIGHLANDS').width);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText('HIGHLANDS', x + 232, y + h * 0.44 + 3, w * 0.62);
    g.fillStyle = '#FFFFFF'; g.fillText('HIGHLANDS', x + 230, y + h * 0.44, w * 0.62);
    g.font = `600 28px ${SERIF}`; g.fillText('C O F F E E', x + 236, y + h * 0.82, w * 0.4);
    g.font = `400 18px ${FONT}`; g.fillText('®', x + 236 + hw, y + h * 0.2);
    if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
    g.restore(); }
  // the menu board over the counter: dark, chalk-white words, red heads, the prices
  { const [x, y, w, h] = at(RH.menu), col = w / MENU.length;
    g.fillStyle = '#231915'; g.fillRect(x, y, w, h);
    MENU.forEach(([head, rows], k) => {
      const bx = x + k * col + 14;
      g.fillStyle = HL_RED; g.fillRect(bx - 6, y + 10, col - 16, 32);
      g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `800 19px ${FONT}`; g.fillText(head, bx + 4, y + 27, col - 30);
      rows.forEach(([n, p], i) => {
        const ry = y + 66 + i * 34;
        g.fillStyle = '#F2EBDF'; g.font = `600 18px ${FONT}`; g.textAlign = 'left'; g.fillText(n, bx + 4, ry, col * 0.62);
        g.fillStyle = '#F2C14E'; g.textAlign = 'right'; g.fillText(vnd(p), bx + col - 30, ry);
      });
    });
    cup(g, x + col * 2 + 70, y + 108, 52, '#7FA350', true); cup(g, x + col * 2 + 160, y + 108, 52, '#8A5A3B'); }
  // the counter's front: wood, a red band with the emblem and the name
  { const [x, y, w, h] = at(RH.panel);
    g.fillStyle = WOOD; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 2; for (let k = 0; k < w; k += 28) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + h); g.stroke(); }
    g.fillStyle = HL_RED; g.fillRect(x, y + h * 0.3, w, h * 0.4);
    emblem(g, x + w * 0.3, y + h / 2, 15, '#FFFFFF');
    g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `700 26px ${SERIF}`; g.fillText('HIGHLANDS COFFEE', x + w * 0.36, y + h / 2 + 1, w * 0.6); }
  // the posters in the window: the phin, the freeze
  for (const [r, title, price, drink, dome] of [[RH.posterA, 'PHIN SỮA ĐÁ', '29K', '#8A5A3B', false], [RH.posterB, 'FREEZE TRÀ XANH', '55K', '#7FA350', true]]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = CREAM; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = HL_RED; g.fillRect(x + 6, y + 6, w - 12, 36);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 15px ${FONT}`; g.fillText(title, x + w / 2, y + 25, w - 18);
    cup(g, x + w / 2, y + 62, h * 0.42, drink, dome);
    g.fillStyle = HL_RED; g.font = `900 30px ${FONT}`; g.fillText(price, x + w / 2, y + h * 0.86);
  }
  // the emblem on the glass, round; the hours on the door; the red wall's words
  { const [x, y, w, h] = at(RH.badge), r = Math.min(w, h) / 2;
    g.clearRect(x, y, w, h);
    g.fillStyle = HL_RED; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); g.fill();
    emblem(g, x + w / 2, y + h / 2, r * 0.55, '#FFFFFF'); }
  { const [x, y, w, h] = at(RH.hours);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = HL_RED; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 7:00 – 23:00', x + w / 2, y + h / 2 + 1, w - 10); }
  { const [x, y, w, h] = at(RH.wall);
    g.clearRect(x, y, w, h);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 600 30px ${SERIF}`; g.fillText('Tự hào cà phê Việt', x + w / 2, y + h / 2, w - 20); }
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street) ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 12) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // a plank floor, cream walls, the red wall at the back of the seats, a dark ceiling with warm lamps hung low
  for (let x = -half; x < half - 0.01; x += 0.3) for (let z = -D; z < -0.01; z += 1.2) {
    const w = Math.min(0.3, half - x), d = Math.min(1.2, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w - 0.01, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), ['#8A5A3B', '#7E5134', '#93623F'][(Math.round((x + half) / 0.3) + Math.round(-z)) % 3]));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, CREAM);
  for (const s of [-1, 1]) b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, CREAM);
  b(3.0, CEIL - FL - 0.1, 0.03, -1.8, (CEIL - FL) / 2, -D + 0.07, HL_RED);   // (the red wall)
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#3A2A22');
  for (const x of [-2.4, -1.2, 0.6, 1.8, 2.8]) for (let z = -1.1; z > -D + 0.5; z -= 1.5) { b(0.01, 0.42, 0.01, x, CEIL - FL - 0.27, z, '#1E1612'); cyl(0.09, 0.13, 0.12, x, CEIL - FL - 0.54, z, '#2A1C14', 12); cyl(0.07, 0.07, 0.02, x, CEIL - FL - 0.61, z, '#FFE2A8', 12); }
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, CREAM);
  // behind a low wall on its left, the counter you order at: wood, a dark top, the till, the case of cakes
  b(0.08, CEIL - FL, D - 2.15, -0.3, (CEIL - FL) / 2, -(2.15 + D) / 2, CREAM); block(-0.36, -0.24, -D, -2.15);
  b(3.5, 0.98, 0.6, 1.5, 0.49, -1.85, WOOD); b(3.56, 0.05, 0.66, 1.5, 1.0, -1.85, '#2A2421');
  b(0.36, 0.1, 0.3, 2.65, 1.08, -1.98, '#1E2125'); b(0.32, 0.22, 0.02, 2.65, 1.24, -2.06, '#2B3A55'); b(0.22, 0.15, 0.02, 2.65, 1.17, -1.72, '#2B3A55');   // the till
  b(0.62, 0.36, 0.42, 0.45, 1.21, -1.85, '#F4EEE4');   // the case of cakes: lit, glass all round
  for (const sx of [-1, 1]) glass.push(new THREE.PlaneGeometry(0.4, 0.32).rotateY(Math.PI / 2).translate(0.45 + sx * 0.31, FL + 1.21, -1.85));
  glass.push(new THREE.PlaneGeometry(0.62, 0.32).translate(0.45, FL + 1.21, -1.64));
  for (let k = 0; k < 6; k++) b(0.12, 0.06, 0.1, 0.28 + (k % 3) * 0.17, 1.08 + Math.floor(k / 3) * 0.13, -1.85, ['#C68A4A', '#E8D3A8', '#6B3F25'][k % 3]);
  b(0.28, 0.2, 0.02, 1.4, 1.13, -1.6, '#231915');   // a menu stand
  block(-0.3, 3.3, -2.17, -1.53);
  // behind: the espresso machine, the grinder, the phin filters on their rack, the syrups, the cups; the menu over it
  b(3.5, 0.92, 0.6, 1.5, 0.46, -D + 0.33, WOOD_D); b(3.56, 0.05, 0.64, 1.5, 0.94, -D + 0.33, '#2A2421');
  b(0.8, 0.46, 0.46, 2.4, 1.2, -D + 0.33, '#C9CED6'); b(0.8, 0.06, 0.46, 2.4, 1.46, -D + 0.33, HL_RED);
  for (const x of [2.15, 2.65]) { b(0.06, 0.1, 0.06, x, 0.99, -D + 0.52, '#3A3F47'); b(0.1, 0.03, 0.1, x, 0.94, -D + 0.55, '#1E2125'); }
  b(0.2, 0.42, 0.2, 1.75, 1.18, -D + 0.3, '#2B2F36'); cyl(0.07, 0.04, 0.16, 1.75, 1.46, -D + 0.3, '#4A3528', 10);   // the grinder
  for (let k = 0; k < 8; k++) cyl(0.035, 0.03, 0.07, 0.25 + k * 0.13, 1.0, -D + 0.5, '#B8BDC4', 10);   // the phin filters in a row
  for (let k = 0; k < 4; k++) cyl(0.045, 0.045, 0.3 + (k % 2) * 0.08, 0.15 + k * 0.12, 1.1, -D + 0.25, '#F2F2F0', 10);
  b(3.4, 0.03, 0.24, 1.5, 1.62, -D + 0.14, '#3A2A22');
  for (let x = -0.05; x < 3.1; x += 0.14 * (low ? 2 : 1)) { const h = 0.16 + r() * 0.08; b(0.07, h, 0.07, x, 1.64 + h / 2, -D + 0.14, ['#6B3F25', '#C68A4A', '#7FA350', '#E8D3A8', HL_RED][Math.floor(r() * 5)]); }
  b(3.5, 0.72, 0.06, 1.5, 2.12, -D + 0.04, '#1A1310');   // the menu's frame (printed over)
  block(-0.3, 3.3, -D, -D + 0.66);
  // your side: a wooden bar along the window with tall stools; a wooden table and two chairs by the red wall
  const seats = [];
  b(2.3, 0.05, 0.4, -2.05, 1.0, -0.25, WOOD); b(2.3, 0.98, 0.04, -2.05, 0.49, -0.07, WOOD_D);
  for (const x of [-2.75, -1.6]) {
    cyl(0.17, 0.17, 0.05, x, 0.72, -0.65, '#3A2A22', 14); cyl(0.025, 0.025, 0.7, x, 0.36, -0.65, '#1E1612', 6); cyl(0.2, 0.2, 0.02, x, 0.01, -0.65, '#1E1612', 14);
    seats.push({ x, z: -0.65, top: 0.745, dir: [0, 1], put: [x, 1.03, -0.27] });
    block(x - 0.18, x + 0.18, -0.83, -0.47);
  }
  block(-3.25, -0.9, -0.45, 0);
  const tx = -1.85, tz = -2.45;
  b(0.8, 0.04, 0.6, tx, 0.72, tz, WOOD); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.04, 0.7, 0.04, tx + sx * 0.34, 0.35, tz + sz * 0.24, '#1E1612');
  for (const s of [-1, 1]) {
    const sx = tx + s * 0.62;
    b(0.4, 0.04, 0.4, sx, 0.45, tz, WOOD_D); b(0.04, 0.42, 0.4, sx + s * 0.2, 0.68, tz, WOOD_D); for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.03, 0.44, 0.03, sx + ax * 0.17, 0.22, tz + az * 0.17, '#1E1612');
    seats.push({ x: sx, z: tz, top: 0.47, dir: [-s, 0], put: [tx + s * 0.18, 0.74, tz] });
    block(sx - 0.22, sx + 0.22, tz - 0.22, tz + 0.22);
  }
  block(tx - 0.42, tx + 0.42, tz - 0.32, tz + 0.32);
  // walking in: a phin sữa đá or a freeze at the counter (paid there); a stool at the window
  spots.push({ kind: 'pay', item: { id: 'phinSuaDa', price: 29, carry: 'cup' }, x: 0.9, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'freezeTraXanh', price: 55, carry: 'cup' }, x: 2.3, z: -1.15, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.15, z: -1.0, face: 0, seat: seats[1] });
  return { inner, glass, fix, spots, seats, till: { x: 2.3, z: -1.15 }, cashier: { x: 2.65, z: -2.45 }, steam: [[2.4, 1.5, -D + 0.33]], aisle: [],
    stations: [[2.4, -D + 0.75, -1], [1.75, -D + 0.75, -1], [0.45, -2.4, 1], [0.9, -D + 0.75, -1]] };
}

/* ---------- the front: posters, the round emblem on the glass, the hours, the menu, the red wall's words, a table out ---------- */
function front({ n, D, put, out, faces, decal, decalOn }) {
  put(decal(0.55, 0.7, n, RH.posterA).translate(-2.75, FL + 1.5, -0.015), faces);
  put(decal(0.55, 0.7, n, RH.posterB).translate(2.75, FL + 1.5, -0.015), faces);
  put(decalOn(new THREE.CircleGeometry(0.22, 24).translate(-1.6, FL + 1.65, -0.012), n, RH.badge), faces);
  put(decal(0.42, 0.072, n, RH.hours).translate(0.82 + 0.3, FL + 1.3, -0.015), faces);
  put(decal(3.4, 0.6, n, RH.menu).translate(1.5, FL + 2.12, -D + 0.075), faces);
  put(decal(3.4, 0.66, n, RH.panel).translate(1.5, FL + 0.5, -1.545), faces);
  put(decal(2.4, 0.36, n, RH.wall).translate(-1.8, FL + 1.95, -D + 0.09), faces);
  // a small wooden table and two chairs on the pavement, by the window on the left
  const tx = -2.4, tz = 0.78;
  put(boxAt(0.6, 0.04, 0.6, tx, FL + 0.72, tz, WOOD), out); put(boxAt(0.06, 0.7, 0.06, tx, FL + 0.36, tz, '#1E1612'), out);
  for (const s of [-1, 1]) { put(boxAt(0.38, 0.04, 0.38, tx + s * 0.55, FL + 0.45, tz, WOOD_D), out); put(boxAt(0.04, 0.42, 0.38, tx + s * 0.74, FL + 0.68, tz, WOOD_D), out); put(boxAt(0.04, 0.44, 0.04, tx + s * 0.55, FL + 0.22, tz, '#1E1612'), out); }
  return { table: { x: tx, z: tz } };
}

/* ---------- its people: the cashier and the barista (black, the red apron), the hours' regulars (laptops in the morning,
   friends in the evening), someone ordering, two on the pavement in the evening ---------- */
const SIT = [[[7, 9.5], 2, 'office', 'laptop'], [[9.5, 11.5], 3, 'office', 'hlcup'], [[14, 17], 4, 'student', 'laptop'], [[19, 22.5], 4, 'genz', 'hlcup']];
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, lay, held, sy, mid, r, LOOK, HAIR, isOpen, wx } = c;
  const all = () => [cashier, staff, ...sit, ...out], apron = { shirt: HL_RED, sleeves: '#1E1E1E', pants: '#1E1E1E' };
  crowd.dress(cashier, { ...apron, hair: '#2B2420' }); crowd.dress(staff, { ...apron, hair: '#1E1A18' });
  crowd.dress(out[0], { ...LOOK.genz(r), hair: '#3A2A20' }); crowd.dress(out[1], { ...LOOK.genz(r), hair: '#2B2420' });
  let dressedFor = '';
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); return; }
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 12) < 1.6;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the barista: the espresso machine, the grinder, the cakes, the phin
      { const k = Math.floor(t / 8) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), busy = (t % 8) > 1.4;
        crowd.pose(staff, { x, y: sy, z, yaw: face(0, dir), arms: busy ? [[1.1, -0.1], [1.25 + Math.sin(t * 5) * 0.12, -0.1]] : [[0.15, 0], [0.15, 0]] });
        if (busy && k === 0) hand(staff, 'hlcup'); }
      const rule = SIT.find(([[a, b]]) => h >= a && h < b), many = rule ? Math.min(rule[1], sit.length) : 0;
      if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z), typing = rule[3] === 'laptop', sip = !typing && ((t + k * 3.1) % 7) < 1.3;
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir) + Math.sin(t * 0.3 + k) * 0.08, lean: -0.12,
          arms: typing ? [[1.25, -0.25 + Math.sin(t * 9 + k) * 0.03], [1.25, -0.25 + Math.cos(t * 9 + k) * 0.03]] : [[1.1, -0.3], sip ? [2.25, -0.4] : [1.1, -0.3]] });
        lay(rule[3], ...s.put); if (typing) lay('screen', ...s.put);
      });
      // someone ordering, then waiting with it; in the evening (dry), two friends at the table out front
      if ((t % 60) < 44) { show(out[1], { x: 1.6, z: -1.2, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 60) < 9 ? [0.9, -0.1] : [0.5, -0.1]] }); if ((t % 60) > 26) hand(out[1], 'hlcup'); }
      else crowd.hide(out[1]);
      if (wx.rain < 0.05 && h >= 17 && h < 22.5) {
        show(out[0], { x: S.table.x - 0.55, z: S.table.z, sit: 0.47, yaw: 0, arms: [[1.0, -0.2], ((t + 2) % 6) < 1 ? [2.2, -0.35] : [1.0, -0.2]] });
        lay('hlcup', S.table.x - 0.12, 0.74, S.table.z);
      } else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; },
  };
}

/* ---------- far off: the front under the sign as a picture (no room to walk into): the glass and what is behind it.
   Any rect (x, y, w, h): everything is placed in its fractions. dark: closed, the lights off. ---------- */
// someone seen through the glass: the hair, the face, the shirt
function figure(g, cx, top, s, shirt) {
  g.fillStyle = shirt; g.beginPath(); g.roundRect(cx - s * 0.26, top + s * 0.32, s * 0.52, s * 0.68, s * 0.12); g.fill();
  g.fillStyle = '#E8B98F'; g.beginPath(); g.arc(cx, top + s * 0.17, s * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1E1A17'; g.beginPath(); g.arc(cx, top + s * 0.13, s * 0.16, Math.PI, 0); g.fill();
}
const FRAMES = [0, 0.167, 0.376, 0.624, 0.833, 1];   // (where the real frames are: ±2.2 m and the door's ±0.82 m of 6.6 m)
function paint(g, x, y, w, h, dark) {
  const X = (f) => x + f * w, Y = (f) => y + f * h;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  // inside: the dark ceiling and its lamps, cream walls, the red wall with the emblem, the menu board over the counter
  g.fillStyle = CREAM; g.fillRect(x, y, w, h);
  g.fillStyle = '#2A2320'; g.fillRect(x, y, w, h * 0.12);
  g.fillStyle = HL_RED; g.fillRect(X(0.06), Y(0.12), w * 0.36, h * 0.52);
  emblem(g, X(0.27), Y(0.3), h * 0.08, '#FFFFFF');
  g.fillStyle = '#231915'; g.fillRect(X(0.5), Y(0.15), w * 0.44, h * 0.22);
  for (let k = 0; k < 3; k++) {
    g.fillStyle = HL_RED; g.fillRect(X(0.52 + k * 0.14), Y(0.17), w * 0.12, h * 0.04);
    g.fillStyle = 'rgba(242,235,223,.75)'; for (let i = 0; i < 3; i++) g.fillRect(X(0.52 + k * 0.14), Y(0.24 + i * 0.04), w * 0.08, h * 0.014);
  }
  for (const f of [0.16, 0.38, 0.6, 0.82]) {
    const r = h * 0.24, gl = g.createRadialGradient(X(f), Y(0.17), 1, X(f), Y(0.17), r);
    gl.addColorStop(0, 'rgba(255,214,150,.6)'); gl.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = gl; g.fillRect(X(f) - r, Y(0.17) - r, r * 2, r * 2);
    g.fillStyle = '#1C1C1C'; g.beginPath(); g.moveTo(X(f) - h * 0.04, Y(0.17)); g.lineTo(X(f) + h * 0.04, Y(0.17)); g.lineTo(X(f) + h * 0.015, Y(0.12)); g.lineTo(X(f) - h * 0.015, Y(0.12)); g.fill();
  }
  // the barista behind the wood counter (its red band), the cake case; a table by the window, two at it with their cups
  figure(g, X(0.6), Y(0.4), h * 0.26, HL_RED);
  g.fillStyle = WOOD; g.fillRect(X(0.46), Y(0.6), w * 0.5, h * 0.3); g.fillStyle = HL_RED; g.fillRect(X(0.46), Y(0.68), w * 0.5, h * 0.06);
  g.fillStyle = 'rgba(214,232,238,.75)'; g.fillRect(X(0.64), Y(0.5), w * 0.08, h * 0.1);
  figure(g, X(0.21), Y(0.5), h * 0.24, '#3E6E8E'); figure(g, X(0.32), Y(0.5), h * 0.24, '#E4E0D6');
  g.fillStyle = WOOD_D; g.fillRect(X(0.06), Y(0.68), w * 0.34, h * 0.04); g.fillRect(X(0.22), Y(0.72), w * 0.02, h * 0.18);
  cup(g, X(0.245), Y(0.6), h * 0.08, '#8A5A3B'); cup(g, X(0.285), Y(0.6), h * 0.08, '#7FA350', true);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.72)'; g.fillRect(x, y, w, h); }
  // the glass: a sheen across it, the dark frames and the door in the middle, the kickplate; on it, the posters, the
  // round emblem, the hours on the door
  const sh = g.createLinearGradient(x, y, x + w, y + h);
  sh.addColorStop(0, 'rgba(255,255,255,.2)'); sh.addColorStop(0.5, 'rgba(255,255,255,.03)'); sh.addColorStop(1, 'rgba(255,255,255,.16)'); g.fillStyle = sh; g.fillRect(x, y, w, h);
  g.fillStyle = '#2B2622'; for (const f of FRAMES) g.fillRect(X(f) - w * 0.006, y, w * 0.012, h);
  g.fillRect(x, Y(0.92), w, h * 0.08); g.fillRect(X(0.376), Y(0.08), w * 0.248, h * 0.015);
  for (const [f, title, price, drink, dome] of [[0.03, 'PHIN SỮA ĐÁ', '29K', '#8A5A3B', false], [0.86, 'FREEZE', '55K', '#7FA350', true]]) {
    const px = X(f), pw = w * 0.11, py = Y(0.3), ph = h * 0.42;
    g.fillStyle = CREAM; g.fillRect(px, py, pw, ph); g.fillStyle = HL_RED; g.fillRect(px, py, pw, ph * 0.18);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.round(ph * 0.09)}px ${FONT}`; g.fillText(title, px + pw / 2, py + ph * 0.09, pw * 0.9);
    cup(g, px + pw / 2, py + ph * 0.28, ph * 0.42, drink, dome);
    g.fillStyle = HL_RED; g.font = `900 ${Math.round(ph * 0.15)}px ${FONT}`; g.fillText(price, px + pw / 2, py + ph * 0.86);
  }
  g.fillStyle = HL_RED; g.beginPath(); g.arc(X(0.77), Y(0.4), h * 0.09, 0, Math.PI * 2); g.fill(); emblem(g, X(0.77), Y(0.4), h * 0.05, '#FFFFFF');
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(X(0.455), Y(0.7), w * 0.09, h * 0.06, h * 0.015); g.fill();
  g.fillStyle = HL_RED; g.font = `800 ${Math.round(h * 0.03)}px ${FONT}`; g.fillText('7:00 – 23:00', X(0.5), Y(0.73), w * 0.085);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.35)'; g.fillRect(x, y, w, h); }
  g.restore();
}

export const HIGHLANDS = {
  chain: { name: 'Highlands Coffee', short: 'Highlands', face: HL_RED, stripes: [HL_RED], accent: HL_RED, shirt: HL_RED, hours: [7, 23], seats: true, greet: 'Highlands Coffee xin chào!' },
  kerb: [2.0, 2.85], draw, fit, front, people, paint,
};
