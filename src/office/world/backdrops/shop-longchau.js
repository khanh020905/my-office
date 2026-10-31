// Nhà thuốc FPT Long Châu (FPT Retail's pharmacies: 2,700 of them in all 34 provinces), as its shops look in 2026: the
// long blue sign (blue aluminium, unlit white letters) with the logo as its file has it: FPT's three slanted tiles in their
// own blue, orange and green (#034EA2, #F37021, #51B848), "FPT Retail" under them, and NHÀ THUỐC over LONG CHÂU in heavy
// white capitals; the GPP plate by the door, the posters for buying online with home delivery and the app ("Long Châu –
// Chuyên gia thuốc"), the free hotline 1800 6928; inside, bright and white, shelves of medicines behind the long counter
// (the prescription ones, as GPP wants them, out of reach), supplements and skin care along the wall, a bench to wait on;
// the pharmacists in white coats over blue; open 6:00–22:00, as most of them. A strip of Panadol Extra is 18.000đ
// (1.500đ a tablet), effervescent Hapacol 8.000đ. When the work keeps failing, someone goes down for something for the
// headache (people/outings.js). None of it is FPT's artwork: the tiles and the lettering are drawn here. shops.js places
// it (LONGCHAU).
import * as THREE from 'three';
import { boxAt, colorize } from '../terrace.js';
import { figure, glassOver, plant } from './shop-paint.js';

export const LC_BLUE = '#1554D1';
const FPT = ['#034EA2', '#F37021', '#51B848'];
const FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const WHITE = '#F5F7FA', COAT = '#F3F6FA', NAVY = '#1F3B73';
const BOXES = ['#FFFFFF', '#E8F0FB', '#D9534F', '#2E86DE', '#F39C1F', '#2E9E4A', '#8E44AD', '#F2F2F2', '#E84F7A', '#15A5C8', '#FFD43B', '#FFFFFF'];

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RL = { sign: [0, 0, 1024, 140], band: [0, 140, 1024, 56], side: [0, 196, 1024, 56], panel: [0, 252, 560, 110], posterA: [560, 252, 150, 192], posterB: [710, 252, 150, 192],
  plate: [860, 252, 164, 120], hotline: [0, 362, 560, 60] };

// FPT's three tiles, leaning forward: blue, the taller orange, green (s: the side ones' height)
function tiles(g, x, y, s) {
  g.save(); g.lineJoin = 'round'; g.lineWidth = s * 0.08;
  const tile = (x0, y0, w, h, c) => { const k = h * 0.3; g.fillStyle = g.strokeStyle = c; g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0 + k, y0); g.lineTo(x0 + k + w, y0); g.lineTo(x0 + w, y0 + h); g.closePath(); g.fill(); g.stroke(); };
  tile(x, y + s * 0.2, s * 0.62, s, FPT[0]); tile(x + s * 0.6, y - s * 0.02, s * 0.56, s * 1.44, FPT[1]); tile(x + s * 1.25, y + s * 0.2, s * 0.62, s, FPT[2]);
  g.restore();
}
// the logo: the tiles, FPT Retail under them, NHÀ THUỐC over LONG CHÂU (x, y: its top left; s: the tiles' height)
function logo(g, x, y, s, c = '#FFFFFF') {
  tiles(g, x, y, s);
  g.fillStyle = c; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `500 ${Math.round(s * 0.36)}px ${FONT}`; g.fillText('FPT Retail', x + s * 0.02, y + s * 1.86, s * 2.0);
  g.font = `900 ${Math.round(s * 0.66)}px ${FONT}`; g.fillText('NHÀ THUỐC', x + s * 2.35, y + s * 0.78);
  g.font = `900 ${Math.round(s * 1.0)}px ${FONT}`; g.fillText('LONG CHÂU', x + s * 2.3, y + s * 1.86);
}
const logoW = (g, s) => { g.font = `900 ${Math.round(s * 1.0)}px ${FONT}`; return s * 2.3 + g.measureText('LONG CHÂU').width; };
// the sign: the blue panel, the logo across the middle (unlit letters: no glow at night, only the light thrown on it)
function sign(g, x, y, w, h, dark) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = LC_BLUE; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, w, 5); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, y + h - 8, w, 8);
  const s = 58; logo(g, x + (w - logoW(g, s)) / 2, y + 16, s);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
  g.restore();
}
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed. */
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  sign(g, ...at(RL.sign), dark);
  // the bands over the shelves: the prescription ones behind the counter, the rest along the wall
  for (const [r, text] of [[RL.band, 'THUỐC KÊ ĐƠN'], [RL.side, 'DƯỢC MỸ PHẨM · THỰC PHẨM CHỨC NĂNG']]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = LC_BLUE; g.fillRect(x, y, w, h); g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 32px ${FONT}`; g.fillText(text, x + w / 2, y + h / 2 + 1, w - 40);
  }
  // the counter's front: blue, the logo
  { const [x, y, w, h] = at(RL.panel);
    g.fillStyle = LC_BLUE; g.fillRect(x, y, w, h); g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, 6);
    const s = 40; logo(g, x + (w - logoW(g, s)) / 2, y + 16, s); }
  // the posters on the glass: online with home delivery, the app
  { const [x, y, w, h] = at(RL.posterA);
    g.fillStyle = '#FFFFFF'; g.fillRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = LC_BLUE; g.fillRect(x + 6, y + 6, w - 12, h * 0.48);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 17px ${FONT}`; g.fillText('MUA THUỐC', x + w / 2, y + 32, w - 18); g.fillText('ONLINE', x + w / 2, y + 54, w - 18);
    g.font = `700 13px ${FONT}`; g.fillText('GIAO TẬN NHÀ', x + w / 2, y + 78, w - 18);
    g.fillStyle = '#1E2125'; g.beginPath(); g.roundRect(x + w / 2 - 18, y + h * 0.53, 36, 56, 6); g.fill(); g.fillStyle = '#8FB4F5'; g.fillRect(x + w / 2 - 14, y + h * 0.53 + 6, 28, 42);
    g.fillStyle = LC_BLUE; g.font = `900 19px ${FONT}`; g.fillText('1800 6928', x + w / 2, y + h * 0.9, w - 16); }
  { const [x, y, w, h] = at(RL.posterB);
    g.fillStyle = '#FFFFFF'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = LC_BLUE; g.beginPath(); g.roundRect(x + w / 2 - 36, y + 20, 72, 72, 16); g.fill();
    tiles(g, x + w / 2 - 25, y + 36, 26);
    g.fillStyle = '#1E2125'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 18px ${FONT}`; g.fillText('Long Châu', x + w / 2, y + 116, w - 16);
    g.fillStyle = LC_BLUE; g.font = `700 14px ${FONT}`; g.fillText('Chuyên gia thuốc', x + w / 2, y + 138, w - 16);
    g.fillStyle = '#1E2125'; g.font = `600 12px ${FONT}`; g.fillText('TẢI ỨNG DỤNG', x + w / 2, y + 166, w - 16); }
  // the GPP plate by the door, the hours on it; the hotline along the counter's top
  { const [x, y, w, h] = at(RL.plate);
    g.fillStyle = '#FFFFFF'; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.strokeStyle = LC_BLUE; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = LC_BLUE; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 30px ${FONT}`; g.fillText('GPP', x + w / 2, y + 34);
    g.fillStyle = '#1E2125'; g.font = `700 12px ${FONT}`; g.fillText('NHÀ THUỐC ĐẠT CHUẨN', x + w / 2, y + 58, w - 22);
    g.fillStyle = LC_BLUE; g.font = `800 15px ${FONT}`; g.fillText('MỞ CỬA 6:00 – 22:00', x + w / 2, y + 86, w - 22); }
  { const [x, y, w, h] = at(RL.hotline);
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
    g.fillStyle = LC_BLUE; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 26px ${FONT}`; g.fillText('Tổng đài miễn phí 1800 6928', x + w / 2, y + h / 2 + 1, w - 30); }
}
/** Paints it as seen from across the street (a front too far to walk into): the sign, and the inside behind the glass. */
function paint(g, cx, cy, dark) {
  sign(g, cx, cy, 1024, 140, dark);
  const x = cx, y = cy + 140, w = 1024, h = 372;
  g.fillStyle = '#F7F9FC'; g.fillRect(x, y, w, h);
  g.fillStyle = LC_BLUE; g.fillRect(x + w * 0.42, y + h * 0.06, w * 0.56, h * 0.07); g.fillRect(x, y + h * 0.06, w * 0.38, h * 0.07);
  // the shelves: rows of small boxes, behind the counter and along the wall
  for (const [x0, x1] of [[0.02, 0.38], [0.44, 0.97]]) for (let k = 0; k < 4; k++) {
    g.fillStyle = '#D5DCE4'; g.fillRect(x + w * x0, y + h * (0.28 + k * 0.11), w * (x1 - x0), 4);
    for (let i = 0; x0 + i * 0.016 < x1 - 0.012; i++) { g.fillStyle = BOXES[(i * 5 + k * 3) % BOXES.length]; g.fillRect(x + w * (x0 + i * 0.016), y + h * (0.2 + k * 0.11), 13, h * 0.08); }
  }
  g.fillStyle = '#E3E8EE'; g.fillRect(x, y + h * 0.84, w, h * 0.16);
  figure(g, x + w * 0.68, y + h * 0.5, 15, COAT, '#1E1A18'); figure(g, x + w * 0.86, y + h * 0.48, 15, COAT);   // the pharmacists, the counter
  g.fillStyle = LC_BLUE; g.fillRect(x + w * 0.44, y + h * 0.6, w * 0.54, h * 0.24); g.fillStyle = '#FFFFFF'; g.fillRect(x + w * 0.44, y + h * 0.59, w * 0.54, 7);
  tiles(g, x + w * 0.62, y + h * 0.66, 30);
  figure(g, x + w * 0.42, y + h * 0.56, 15, '#B85C7A', '#3A2A20'); figure(g, x + w * 0.18, y + h * 0.58, 15, '#8C7A6B', '#BDBDBD');   // a customer, someone at the shelves
  plant(g, x + w * 0.035, y + h * 0.97, 55, '#E3E8EE');
  glassOver(g, x, y, w, h);
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street) ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2, thin = low ? 2 : 1;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 10) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // white tiles, white walls, a blue line along the top, a white ceiling with square lights
  for (let x = -half; x < half - 0.01; x += 0.6) for (let z = -D; z < -0.01; z += 0.6) {
    const w = Math.min(0.6, half - x), d = Math.min(0.6, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.6) + Math.round(-z / 0.6)) % 2 ? '#EEF1F4' : '#E4E9EE'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, WHITE);
  for (const s of [-1, 1]) b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, WHITE);
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#FAFBFC');
  for (const x of [-2.2, 0, 2.2]) for (let z = -1.0; z > -D + 0.4; z -= 1.4) b(0.6, 0.02, 0.6, x, CEIL - FL - 0.07, z, '#FFFFFF');
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, LC_BLUE);
  // an open shelf unit of boxes: (x, z) its middle, w long, 0.36 deep, `n` shelves up to `top`, open to +z (side: to +x);
  // a back, two ends, a top and a plinth in white, the boxes and bottles standing on grey shelves
  const shelf = (x, z, w, n, top, side = false) => {
    const at = (a, d) => (side ? [x + d, z + a] : [x + a, z + d]), box = (a, len, h, dep, y, d, c) => { const [px, pz] = at(a, d); b(side ? dep : len, h, side ? len : dep, px, y, pz, c); };
    box(0, w, top, 0.03, top / 2, -0.165, '#FFFFFF'); box(0, w, 0.04, 0.36, top - 0.02, 0, '#FFFFFF'); box(0, w, 0.12, 0.36, 0.06, 0, '#E9EDF2');
    for (const e of [-1, 1]) box(e * (w / 2 - 0.015), 0.03, top, 0.36, top / 2, 0, '#FFFFFF');
    for (let s = 0; s < n; s++) {
      const y = 0.18 + s * ((top - 0.3) / n);
      box(0, w - 0.04, 0.025, 0.34, y, 0.0, '#D5DCE4');
      for (let u = -w / 2 + 0.07; u < w / 2 - 0.06; u += (0.07 + r() * 0.05) * thin) {
        const bw = 0.05 + r() * 0.03, bh = 0.08 + r() * 0.1, c = BOXES[Math.floor(r() * BOXES.length)];
        if (r() < 0.25) { const [px, pz] = at(u, 0.05); cyl(0.026, 0.026, bh, px, y + 0.012 + bh / 2, pz, c, 8); }   // (a bottle)
        else box(u, bw, bh, 0.12, y + 0.012 + bh / 2, 0.04, c);
      }
    }
  };
  // behind the long counter, the medicines from floor to the band; along the left wall, the supplements and skin care
  shelf(1.5, -D + 0.2, 3.5, 5, 2.15);
  b(0.08, CEIL - FL, D - 2.15, -0.3, (CEIL - FL) / 2, -(2.15 + D) / 2, WHITE); block(-0.36, -0.24, -D, -2.15);
  block(-0.3, 3.3, -D, -D + 0.45);
  shelf(-3.08, -(1.35 + D - 0.4) / 2, D - 1.75, 4, 1.8, true);
  block(-half, -2.85, -D + 0.4, -1.35);
  // the counter: white, the blue front, two screens, the QR stand, a basket of what was asked for
  b(3.5, 0.98, 0.6, 1.5, 0.49, -1.85, '#FFFFFF'); b(3.56, 0.05, 0.66, 1.5, 1.0, -1.85, '#F2F5F8');
  for (const x of [0.6, 2.6]) { b(0.36, 0.24, 0.02, x, 1.25, -2.0, '#1E2125'); b(0.33, 0.21, 0.01, x, 1.25, -2.012, '#BFD8FF'); b(0.05, 0.12, 0.05, x, 1.08, -1.98, '#9AA2AD'); }   // (the screens face the pharmacists)
  b(0.1, 0.18, 0.03, 1.6, 1.12, -1.6, '#FFFFFF'); b(0.08, 0.08, 0.005, 1.6, 1.15, -1.583, '#1E2125');
  b(0.3, 0.1, 0.22, 1.2, 1.08, -1.75, '#3D7BE8'); for (let k = 0; k < 3; k++) b(0.07, 0.04, 0.05, 1.12 + k * 0.08, 1.15, -1.75, BOXES[k + 2]);
  block(-0.3, 3.3, -2.17, -1.53);
  // a low shelf island in the middle (masks, bandages, the things you pick up yourself); a bench to wait on by the window
  shelf(-1.55, -2.55, 1.3, 2, 0.95);
  block(-2.25, -0.85, -2.8, -2.3);
  const seats = [];
  b(1.5, 0.05, 0.42, -2.25, 0.43, -0.6, '#FFFFFF'); for (const sx of [-0.65, 0.65]) b(0.05, 0.42, 0.38, -2.25 + sx, 0.21, -0.6, '#9AA2AD');
  b(1.5, 0.4, 0.05, -2.25, 0.66, -0.4, LC_BLUE);
  for (const x of [-2.65, -1.85]) seats.push({ x, z: -0.62, top: 0.455, dir: [0, -1], put: [x + 0.25, 0.48, -0.62] });
  block(-3.05, -1.45, -0.85, 0);
  // walking in: a strip of something for a headache, at the counter (paid there)
  spots.push({ kind: 'pay', item: { id: 'panadol', price: 18, carry: 'grocery' }, x: 0.9, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'hapacol', price: 8, carry: 'grocery' }, x: 2.3, z: -1.15, face: Math.PI });
  return { inner, glass, fix, spots, seats, till: { x: 2.3, z: -1.15 }, cashier: { x: 2.65, z: -2.45 }, steam: [], aisle: [],
    stations: [[0.6, -D + 0.75, -1], [2.1, -D + 0.75, -1], [1.4, -2.4, 1], [2.9, -D + 0.75, -1]] };
}

/* ---------- the front: the posters, the GPP plate, the bands over the shelves, the counter's front and its hotline ---------- */
function front({ n, D, put, out, faces, decal }) {
  put(decal(0.55, 0.7, n, RL.posterA).translate(-2.75, FL + 1.5, -0.015), faces);
  put(decal(0.55, 0.7, n, RL.posterB).translate(2.75, FL + 1.5, -0.015), faces);
  put(decal(0.36, 0.26, n, RL.plate).translate(1.12, FL + 1.4, -0.015), faces);
  put(decal(3.4, 0.19, n, RL.band).translate(1.5, FL + 2.3, -D + 0.42), faces);
  put(decal(D - 1.75, 0.19, n, RL.side).rotateY(Math.PI / 2).translate(-2.88, FL + 1.95, -(1.35 + D - 0.4) / 2), faces);
  put(decal(3.4, 0.66, n, RL.panel).translate(1.5, FL + 0.5, -1.545), faces);
  put(decal(1.7, 0.18, n, RL.hotline).translate(1.5, FL + 0.93, -1.535), faces);
  // the shop's blue carried down both sides of the glass, as the aluminium louvres beside its fronts
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) put(boxAt(0.035, 2.3, 0.07, s * (3.37 + k * 0.05), FL + 1.15, 0.05, LC_BLUE), out);
  return {};
}

/* ---------- its people: two pharmacists in white coats (one at the counter, one fetching from the shelves), someone
   asking at the counter, someone along the shelves, people waiting on the bench (the old in the morning) ---------- */
const ELDER = (r) => ({ shirt: ['#8C7A6B', '#A9B4C2', '#C9B79C', '#6B7A8F'][Math.floor(r() * 4)], pants: '#3A3F47' });
const SIT = [[[6.5, 10.5], 2, 'elder'], [[10.5, 16.5], 1, 'office'], [[17, 21.5], 2, 'office']];
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, held, sy, mid, r, LOOK, HAIR, isOpen } = c;
  const all = () => [cashier, staff, ...sit, ...out], coat = { shirt: COAT, sleeves: COAT, pants: NAVY };
  crowd.dress(cashier, { ...coat, hair: '#1E1A18' }); crowd.dress(staff, { ...coat, hair: '#2B2420' });
  crowd.dress(out[0], { ...ELDER(r), hair: '#BDBDBD' }); crowd.dress(out[1], { shirt: '#B85C7A', pants: '#3A3F47', sleeves: '#F2E6D8', hair: '#3A2A20' });
  let dressedFor = '';
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); return; }
      { const [x, z] = at(S.cashier.x, S.cashier.z), talk = S.greetT > c.now() || (t % 14) < 3;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: talk ? [[0.9, -0.1], [0.7 + Math.sin(t * 3) * 0.25, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the other one fetches from the shelves (reaching up), back to the counter with it
      { const k = Math.floor(t / 9) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), reach = (t % 9) > 1.5 && (t % 9) < 4 && dir < 0;
        crowd.pose(staff, { x, y: sy, z, yaw: face(0, dir), arms: reach ? [[0.2, 0], [2.1, -0.15]] : [[0.5, -0.1], [0.5, -0.1]] }); }
      const rule = SIT.find(([[a, b]]) => h >= a && h < b), many = rule ? Math.min(rule[1], sit.length) : 0;
      if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, rule[2] === 'elder' ? { ...ELDER(r), hair: '#BDBDBD' } : { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z), look = ((t + k * 4) % 12) < 4;   // (looking up at the counter, then at the phone)
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir) + (look ? 0.5 : 0), lean: look ? 0 : 0.18, arms: look ? [[0.4, -0.2], [0.4, -0.2]] : [[1.0, -0.25], [1.0, 0.1]] });
        if (!look) hand(i, 'phone');
      });
      // someone asking at the counter, leaving with the little bag; someone along the wall of supplements
      if ((t % 48) < 38) { show(out[1], { x: 1.6, z: -1.2, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 48) < 12 ? [0.9 + Math.sin(t * 2) * 0.2, -0.1] : [0.5, -0.1]] }); if ((t % 48) > 26) hand(out[1], 'medbag'); }
      else crowd.hide(out[1]);
      if (h >= 7 && h < 20) { const reach = (t % 8) < 1.5; show(out[0], { x: -2.45, z: -2.0 - Math.sin(t * 0.05) * 0.3, yaw: Math.PI, lean: 0.1, arms: [[0.2, 0], reach ? [1.4, -0.1] : [0.3, 0]] }); }
      else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; },
  };
}

export const LONGCHAU = {
  chain: { name: 'Long Châu', short: 'Long Châu', face: LC_BLUE, stripes: [LC_BLUE], accent: LC_BLUE, shirt: COAT, hours: [6, 22], seats: false, greet: 'Long Châu xin chào!' },
  kerb: [1.2, 2.0, 2.8], draw, paint, fit, front, people,
};
