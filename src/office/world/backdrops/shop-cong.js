// Cộng Cà Phê (Hà Nội, 2007: the first one on Triệu Việt Vương; 75 in Vietnam in 2026, most in Hà Nội and Ho Chi Minh
// City), as its street shops look: an army-green front with the name in warm white letters on it, CỘNG big and CÀ PHÊ
// small beside it, olive window frames, wooden slats behind the glass, a little roof of terracotta tiles over the door,
// a plank over it painted "Ở ĐÂY CÓ BÁN CÀ PHÊ", the round wooden board with the hours (7:00–23:00), and out on its
// bracket the white box with the logo: CỘNG in olive over a red bar. Inside, the retro look of the 1980s' Hà Nội:
// olive walls, worn wooden floor and tables, low wooden stools, a bench with cushions in the red "chăn con công"
// (peacock blanket) print, enamel mugs and thermos flasks on the counter, an old radio on the shelf and a wooden-cased
// television in the corner, faded photographs and a tear-off calendar on the wall, coffee sacks, bulbs hanging low
// under a ceiling fan; the menu over the counter printed like old ration coupons, at the official prices (Cốt Dừa Cà Phê
// 59.000đ, Bạc Xỉu 45.000đ, Sữa Chua Cà Phê 55.000đ, Nâu and Đen 35.000đ); staff in olive shirts. Outside, folding
// metal chairs at low tables and an old bicycle with a basket of flowers. Someone resting goes for a cốt dừa on weekday
// afternoons and on weekend mornings (people/outings.js). The look is the chain's generic retro one only (no slogans or
// emblems), and none of it is the chain's artwork: the lettering is set and drawn here. shops.js places it (CONG).
import * as THREE from 'three';
import { officeNow } from '../../core/env.js';
import { boxAt, colorize } from '../terrace.js';
import { figure, glassOver, lamp, plant } from './shop-paint.js';

export const CG_OLIVE = '#4E5E2B', CG_RED = '#B1181F';
const FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';
const WALL = '#56663A', WALL_D = '#3F4B2A', CREAM = '#EAE1C9', PAPER = '#EFE3C4', WOOD = '#7A5232', WOOD_D = '#4E3422', WOOD_L = '#9C7048', UNIFORM = '#5B6B3A', TILE = '#B5562E';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RC = { sign: [0, 0, 1024, 140], menu: [0, 140, 1024, 180], panel: [0, 320, 520, 100], plank: [0, 420, 520, 92], posterA: [520, 320, 140, 192], posterB: [660, 320, 140, 192],
  badge: [800, 320, 112, 112], pattern: [912, 320, 112, 112], photos: [800, 432, 224, 80] };
const LOGO = [190, 330, 140, 80];   // (inside the panel: the white plate with the logo, also the faces of the box out front)

// the logo: CỘNG in heavy olive capitals over a thick red bar and a thin red line, on white (or on `bg`)
function logo(g, x, y, w, h, bg = '#FFFFFF') {
  g.save();
  if (bg) { g.fillStyle = bg; g.fillRect(x, y, w, h); }
  g.fillStyle = CG_OLIVE; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `900 ${Math.round(h * 0.42)}px ${FONT}`;
  g.fillText('CỘNG', x + w / 2, y + h * 0.56, w * 0.86);
  g.fillStyle = CG_RED; g.fillRect(x + w * 0.08, y + h * 0.66, w * 0.84, h * 0.16); g.fillRect(x + w * 0.08, y + h * 0.86, w * 0.84, h * 0.035);
  g.restore();
}
// the front over the glass: army-green paint, the name in raised letters lit warm, CÀ PHÊ small beside it
function sign(g, x, y, w, h, dark) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = WALL; g.fillRect(x, y, w, h);
  for (let k = 0; k < 90; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.04)'; g.fillRect(x + ((k * 137) % w), y + ((k * 53) % h), 18 + (k % 5) * 9, 3); }   // (old paint, brushed)
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y + h - 10, w, 10); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, w, 4);
  g.font = `900 92px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const big = g.measureText('CỘNG').width; g.font = `800 40px ${FONT}`; const small = g.measureText('CÀ PHÊ').width;
  const x0 = x + (w - big - 26 - small) / 2, base = y + h * 0.78;
  if (!dark) { g.shadowColor = 'rgba(255,226,170,.75)'; g.shadowBlur = 18; }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.font = `900 92px ${FONT}`; g.fillText('CỘNG', x0 + 3, base + 3);
  g.fillStyle = '#F7F1E1'; g.fillText('CỘNG', x0, base);
  g.font = `800 40px ${FONT}`; g.fillText('CÀ PHÊ', x0 + big + 26, base);
  g.shadowBlur = 0;
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
  g.restore();
}
// an old ration coupon (tem phiếu) for one drink: a tinted ticket, notched edges, the name, the price, a red round stamp
function coupon(g, x, y, w, h, tint, name, price) {
  g.fillStyle = tint; g.fillRect(x, y, w, h);
  g.fillStyle = PAPER; for (let k = 0; k < Math.floor(w / 14); k++) { g.beginPath(); g.arc(x + 7 + k * 14, y, 3.5, 0, Math.PI * 2); g.arc(x + 7 + k * 14, y + h, 3.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(60,40,20,.55)'; g.lineWidth = 2; g.strokeRect(x + 6, y + 8, w - 12, h - 16);
  g.fillStyle = '#3B2A1C'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 13px ${SERIF}`; g.fillText('PHIẾU MUA HÀNG', x + w / 2, y + 22, w - 20);
  const words = name.split(' '), mid = Math.ceil(words.length / 2), lines = words.length > 2 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [name];
  g.font = `800 19px ${FONT}`; lines.forEach((l, i) => g.fillText(l, x + w / 2, y + 52 + i * 22 - (lines.length - 1) * 11, w - 18));
  g.font = `900 22px ${FONT}`; g.fillStyle = CG_RED; g.fillText(price, x + w / 2, y + h - 26, w - 20);
  g.strokeStyle = 'rgba(177,24,31,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x + w - 22, y + 24, 12, 0, Math.PI * 2); g.stroke();
}
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
const MENU = [['Cốt Dừa Cà Phê', 59, '#F1E6C8'], ['Cốt Dừa Cốm Xanh', 69, '#DCE8C8'], ['Bạc Xỉu', 45, '#F3D9CF'], ['Nâu', 35, '#D9E3EC'], ['Đen', 35, '#ECE1C9'], ['Sữa Chua Cà Phê', 55, '#E8D9EA']];
// a glass of it: clear, the drink, a cap of something on top
function glassOf(g, x, y, s, drink, top) {
  const w0 = s * 0.3, w1 = s * 0.24;
  g.save(); g.beginPath(); g.moveTo(x - w0, y); g.lineTo(x + w0, y); g.lineTo(x + w1, y + s); g.lineTo(x - w1, y + s); g.closePath(); g.clip();
  g.fillStyle = 'rgba(236,240,244,.9)'; g.fillRect(x - w0, y, w0 * 2, s); g.fillStyle = drink; g.fillRect(x - w0, y + s * 0.12, w0 * 2, s);
  if (top) { g.fillStyle = top; g.fillRect(x - w0, y + s * 0.12, w0 * 2, s * 0.16); }
  g.restore();
}
// the "chăn con công" print: red, big round flowers and the peacock's feathers in green, yellow and white
function peacock(g, x, y, w, h) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#C8202A'; g.fillRect(x, y, w, h);
  for (const [fx, fy, r] of [[0.25, 0.3, 0.2], [0.75, 0.7, 0.22], [0.8, 0.15, 0.12], [0.2, 0.85, 0.13]]) {
    const cx = x + w * fx, cy = y + h * fy, R = w * r;
    g.fillStyle = '#F2C230'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1E7A4A'; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95, R * 0.42, R * 0.2, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#F4EFE2'; g.beginPath(); g.arc(cx, cy, R * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2B4FA0'; g.beginPath(); g.arc(cx, cy, R * 0.2, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed, the front's letters unlit. */
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  sign(g, ...at(RC.sign), dark);
  // the menu over the back counter: an old board of coupons, one for each drink
  { const [x, y, w, h] = at(RC.menu);
    g.fillStyle = WOOD_D; g.fillRect(x, y, w, h); g.fillStyle = PAPER; g.fillRect(x + 10, y + 10, w - 20, h - 20);
    g.fillStyle = '#3B2A1C'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `800 20px ${SERIF}`; g.fillText('THỰC ĐƠN', x + 26, y + 30);
    logo(g, x + w - 132, y + 16, 108, 34, null);
    const cw = (w - 60) / MENU.length;
    MENU.forEach(([name, price, tint], k) => coupon(g, x + 30 + k * cw, y + 52, cw - 12, h - 66, tint, name, vnd(price))); }
  // the counter's front: old planks, an olive band, the white plate with the logo
  { const [x, y, w, h] = at(RC.panel);
    for (let k = 0; k * 40 < w; k++) { g.fillStyle = k % 2 ? WOOD : '#83593A'; g.fillRect(x + k * 40, y, 40, h); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + k * 40, y, 2, h); }
    g.fillStyle = WALL; g.fillRect(x, y + h * 0.18, w, h * 0.64);
    const [lx, ly, lw, lh] = LOGO; logo(g, cx + lx, cy + ly, lw, lh); }
  // the plank over the door: weathered wood, white letters painted by hand
  { const [x, y, w, h] = at(RC.plank);
    g.clearRect(x, y, w, h);
    g.fillStyle = '#6B4A32'; g.beginPath(); g.roundRect(x + 6, y + 10, w - 12, h - 20, 6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (const f of [0.35, 0.65]) { g.beginPath(); g.moveTo(x + 10, y + h * f); g.lineTo(x + w - 10, y + h * f); g.stroke(); }
    g.fillStyle = '#F4EFE4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT}`;
    for (const dx of [0, 1.5]) g.fillText('Ở ĐÂY CÓ BÁN CÀ PHÊ', x + w / 2 + dx, y + h / 2 + 6, w - 30); }   // (twice, a little apart: the brush's thick strokes, the marks still there far off)
  // the posters in the window: printed like old ones, the cốt dừa and the yoghurt coffee
  for (const [r, title, price, drink, top] of [[RC.posterA, 'CỐT DỪA CÀ PHÊ', '59K', '#F1EADB', '#5A3A22'], [RC.posterB, 'SỮA CHUA CÀ PHÊ', '55K', '#F5F1E8', '#6B4226']]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = PAPER; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.strokeStyle = CG_RED; g.lineWidth = 3; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    g.fillStyle = CG_OLIVE; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 14px ${FONT}`; g.fillText(title, x + w / 2, y + 30, w - 30);
    glassOf(g, x + w / 2, y + 48, h * 0.42, drink, top);
    g.fillStyle = CG_RED; g.font = `900 28px ${FONT}`; g.fillText(price, x + w / 2, y + h * 0.84);
  }
  // the round wooden board with the hours, by the door
  { const [x, y, w, h] = at(RC.badge), r = Math.min(w, h) / 2;
    g.clearRect(x, y, w, h);
    g.fillStyle = '#8A5E3A'; g.beginPath(); g.arc(x + w / 2, y + h / 2, r - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5E3E26'; g.lineWidth = 5; g.beginPath(); g.arc(x + w / 2, y + h / 2, r - 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#F4EFE4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 15px ${FONT}`; g.fillText('MỞ CỬA', x + w / 2, y + h * 0.36);
    g.font = `800 18px ${FONT}`; g.fillText('7:00 – 23:00', x + w / 2, y + h * 0.58, w - 20); }
  peacock(g, ...at(RC.pattern));
  // the wall: faded photographs in thin frames, a tear-off calendar with today's date
  { const [x, y, w, h] = at(RC.photos), d = officeNow();
    g.clearRect(x, y, w, h);
    for (const [fx, fy, fw, fh] of [[0.02, 0.1, 0.2, 0.55], [0.25, 0.25, 0.16, 0.5], [0.44, 0.08, 0.22, 0.6]]) {
      g.fillStyle = '#2B2016'; g.fillRect(x + w * fx, y + h * fy, w * fw, h * fh);
      g.fillStyle = '#CDBB97'; g.fillRect(x + w * fx + 3, y + h * fy + 3, w * fw - 6, h * fh - 6);
      g.fillStyle = 'rgba(70,50,30,.55)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + w * (fx + fw * (0.25 + k * 0.25)), y + h * (fy + fh * 0.45), 4, 0, Math.PI * 2); g.fill(); g.fillRect(x + w * (fx + fw * (0.25 + k * 0.25)) - 4, y + h * (fy + fh * 0.55), 8, h * fh * 0.3); }
    }
    g.fillStyle = '#F7F4EC'; g.fillRect(x + w * 0.72, y + h * 0.05, w * 0.24, h * 0.85);
    g.fillStyle = CG_RED; g.fillRect(x + w * 0.72, y + h * 0.05, w * 0.24, h * 0.2);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 9px ${FONT}`; g.fillText(`THÁNG ${d.getMonth() + 1}`, x + w * 0.84, y + h * 0.15);
    g.fillStyle = CG_RED; g.font = `900 30px ${SERIF}`; g.fillText(String(d.getDate()), x + w * 0.84, y + h * 0.55); }
}
/** Paints it as seen from across the street (a front too far to walk into): the front, and the inside behind the glass. */
function paint(g, cx, cy, dark) {
  sign(g, cx, cy, 1024, 140, dark);
  const x = cx, y = cy + 140, w = 1024, h = 372;
  g.fillStyle = WALL; g.fillRect(x, y, w, h);                                                      // olive walls, a cream band up high
  g.fillStyle = CREAM; g.fillRect(x, y, w, h * 0.12);
  g.fillStyle = '#5E412C'; g.fillRect(x, y + h * 0.84, w, h * 0.16);                              // the old wooden floor
  g.fillStyle = PAPER; g.fillRect(x + w * 0.54, y + h * 0.16, w * 0.42, h * 0.15);                 // the coupons over the counter
  for (let k = 0; k < 6; k++) { g.fillStyle = MENU[k][2]; g.fillRect(x + w * (0.56 + k * 0.066), y + h * 0.19, w * 0.055, h * 0.1); }
  g.fillStyle = WOOD_D; g.fillRect(x + w * 0.52, y + h * 0.42, w * 0.46, h * 0.08);              // the back counter: the radio, mugs
  g.fillStyle = '#6B4A32'; g.fillRect(x + w * 0.9, y + h * 0.34, w * 0.06, h * 0.08); g.fillStyle = '#C9B48A'; g.fillRect(x + w * 0.905, y + h * 0.36, w * 0.025, h * 0.045);
  figure(g, x + w * 0.78, y + h * 0.38, 15, UNIFORM, '#1E1A18');                                // the barista, in olive
  g.fillStyle = WOOD; g.fillRect(x + w * 0.5, y + h * 0.56, w * 0.48, h * 0.26); g.fillStyle = WALL_D; g.fillRect(x + w * 0.5, y + h * 0.62, w * 0.48, h * 0.1);
  for (let k = 0; k < 4; k++) { g.fillStyle = '#F4F2EC'; g.fillRect(x + w * (0.56 + k * 0.03), y + h * 0.5, 14, 16); g.fillStyle = '#2F5FA8'; g.fillRect(x + w * (0.56 + k * 0.03), y + h * 0.5, 14, 3); }
  g.fillStyle = '#C23B3B'; g.fillRect(x + w * 0.7, y + h * 0.45, 16, 34); g.fillStyle = '#D9B24A'; g.fillRect(x + w * 0.7, y + h * 0.45, 16, 6);   // a thermos
  for (const fx of [0.12, 0.3, 0.62, 0.86]) lamp(g, x + w * fx, y, y + h * 0.22, 9, '#FFE2A8');          // bulbs hung low
  g.fillStyle = '#4A3628'; g.fillRect(x + w * 0.02, y + h * 0.5, w * 0.1, h * 0.12); g.fillStyle = '#6F7A6A'; g.fillRect(x + w * 0.03, y + h * 0.52, w * 0.065, h * 0.08);   // the old television
  for (const [tx, people] of [[0.2, [['#F2F2F2', -1], ['#E8B4C8', 1]]], [0.4, [['#3F7CC4', -1], ['#2A2D33', 1], ['#F7D774', 0]]]]) {   // low tables, stools, people
    g.fillStyle = WOOD_L; g.fillRect(x + w * (tx - 0.05), y + h * 0.7, w * 0.1, 8); g.fillRect(x + w * tx - 3, y + h * 0.7, 6, h * 0.13);
    for (const [c, s] of people) { figure(g, x + w * (tx + s * 0.065), y + h * (s ? 0.62 : 0.6), 13, c); if (s) { g.fillStyle = WOOD_D; g.fillRect(x + w * (tx + s * 0.065) - 12, y + h * 0.78, 24, h * 0.06); } }
  }
  g.fillStyle = '#C8202A'; g.fillRect(x + w * 0.06, y + h * 0.66, w * 0.08, h * 0.05);            // a cushion in the peacock print
  plant(g, x + w * 0.49, y + h * 0.95, 50, WOOD_D);
  glassOver(g, x, y, w, h);
  g.fillStyle = 'rgba(122,82,50,.85)'; for (let k = 0; k < 24; k++) g.fillRect(x + w * 0.012 + k * 15, y + h * 0.66, 7, h * 0.3);   // the wooden slats behind the left pane
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street) ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 12) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, low ? Math.min(seg, 8) : seg).translate(x, FL + y, z), c));
  const ball = (s, x, y, z, c, sx = 1, sy = 1, sz = 1) => inner.push(colorize(new THREE.SphereGeometry(s, low ? 7 : 10, low ? 5 : 7).scale(sx, sy, sz).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // an old wooden floor in long boards, olive walls with a cream band up high, a dark wooden ceiling on beams
  for (let x = -half, k = 0; x < half - 0.01; x += 0.3, k++) inner.push(colorize(new THREE.PlaneGeometry(Math.min(0.3, half - x) - 0.008, D - 0.01).rotateX(-Math.PI / 2).translate(x + 0.15, FL + 0.004, -D / 2), ['#6B4A32', '#5E412C', '#73513A', '#634530'][k % 4]));
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, WALL);
  for (const s of [-1, 1]) { b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, WALL); b(0.02, 0.5, D, s * (half - 0.065), CEIL - FL - 0.3, -D / 2, CREAM); }
  b(SW - 0.12, 0.5, 0.02, 0, CEIL - FL - 0.3, -D + 0.065, CREAM);
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#3E2C1E');
  for (let z = -0.8; z > -D + 0.3; z -= 1.3) b(SW - 0.1, 0.1, 0.12, 0, CEIL - FL - 0.1, z, '#2E2016');
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, WALL_D);
  // the wooden slats behind the left pane (and a low sill under them)
  b(2.3, 0.06, 0.12, -2.08, 0.95, -0.09, WOOD_D);
  for (let x = -3.2; x < -0.95; x += low ? 0.18 : 0.09) b(0.035, 0.9, 0.035, x, 0.5, -0.1, WOOD);
  // the counter you order at: old planks, a dark top; on it the till, the enamel mugs, two thermos flasks, phin filters
  b(3.3, 0.98, 0.6, 1.6, 0.49, -1.85, WOOD); b(3.36, 0.05, 0.66, 1.6, 1.0, -1.85, '#2A2421');
  b(0.36, 0.1, 0.3, 2.7, 1.08, -1.98, '#1E2125'); b(0.32, 0.22, 0.02, 2.7, 1.24, -2.06, '#2B3A55'); b(0.22, 0.15, 0.02, 2.7, 1.17, -1.72, '#2B3A55');
  for (let k = 0; k < 6; k++) { const x = 0.25 + (k % 3) * 0.13, z = -1.75 - Math.floor(k / 3) * 0.14; cyl(0.045, 0.045, 0.09, x, 1.07, z, '#F4F2EC', 12); cyl(0.047, 0.047, 0.015, x, 1.115, z, '#2F5FA8', 12); }
  for (const [x, c] of [[0.85, '#C23B3B'], [1.02, '#2E7D5B']]) { cyl(0.06, 0.06, 0.32, x, 1.18, -1.95, c, 12); cyl(0.062, 0.062, 0.04, x, 1.2, -1.95, '#D9B24A', 12); cyl(0.035, 0.045, 0.05, x, 1.365, -1.95, '#3A3F47', 10); }
  for (let k = 0; k < 4; k++) { const x = 1.35 + k * 0.17; cyl(0.04, 0.035, 0.1, x, 1.075, -1.72, '#E6EEF2', 10); cyl(0.042, 0.038, 0.06, x, 1.155, -1.72, '#B8BEC6', 10); }   // (glasses, a phin on each)
  block(-0.05, 3.3, -2.17, -1.53);
  // behind: the espresso machine and the grinder, jars of beans; shelves over them with the radio, books, more mugs; the menu
  b(3.3, 0.92, 0.6, 1.6, 0.46, -D + 0.33, WOOD_D); b(3.36, 0.05, 0.64, 1.6, 0.94, -D + 0.33, '#2A2421');
  b(0.6, 0.42, 0.42, 2.55, 1.17, -D + 0.34, '#C9CED6'); b(0.56, 0.08, 0.4, 2.55, 1.42, -D + 0.34, '#9AA2AD'); for (const x of [2.4, 2.7]) b(0.06, 0.06, 0.08, x, 1.0, -D + 0.6, '#2B2F36');
  cyl(0.08, 0.1, 0.3, 1.95, 1.12, -D + 0.3, '#2B2F36', 10); cyl(0.09, 0.06, 0.16, 1.95, 1.35, -D + 0.3, '#B8BEC6', 10);
  for (let k = 0; k < 5; k++) { cyl(0.07, 0.07, 0.2, 0.35 + k * 0.2, 1.06, -D + 0.3, '#E8E2D2', 10); cyl(0.065, 0.065, 0.12, 0.35 + k * 0.2, 1.03, -D + 0.3, '#4A2E1C', 10); }
  b(3.0, 0.04, 0.26, 1.6, 1.62, -D + 0.17, WOOD_L);
  b(0.4, 0.26, 0.2, 2.8, 1.77, -D + 0.17, '#6B4A32'); b(0.2, 0.16, 0.01, 2.72, 1.77, -D + 0.07, '#C9B48A'); for (const x of [2.9, 2.96]) cyl(0.02, 0.02, 0.02, x, 1.8, -D + 0.07, '#2B2F36', 8);   // the radio
  for (let k = 0; k < 8; k++) b(0.05, 0.2 + (k % 3) * 0.03, 0.16, 0.7 + k * 0.06, 1.74, -D + 0.17, ['#7A2E1E', '#2F4A3A', '#C9A04B', '#5A4632'][k % 4]);   // old books
  for (let k = 0; k < 5; k++) { cyl(0.045, 0.045, 0.09, 1.4 + k * 0.12, 1.69, -D + 0.17, '#F4F2EC', 10); cyl(0.047, 0.047, 0.015, 1.4 + k * 0.12, 1.735, -D + 0.17, '#2F5FA8', 10); }
  b(3.4, 0.62, 0.06, 1.6, 2.2, -D + 0.04, '#3B2A1C');   // the menu's frame (printed over)
  block(-0.05, 3.3, -D, -D + 0.66);
  // coffee in hessian sacks at the counter's end
  for (const [x, z, y] of [[-0.2, -D + 0.45, 0.17], [0.15, -D + 0.5, 0.17], [-0.02, -D + 0.48, 0.45]]) { ball(0.3, x, y, z, '#B49A6E', 1, 0.62, 0.75); b(0.02, 0.1, 0.3, x + 0.29, y, z, '#7A2E1E'); }
  block(-0.5, 0.45, -D, -D + 0.75);
  // your side: a low table by the window with two low stools, a bench along the left wall with cushions in the peacock
  // print and a low table before it, a stool on its other side; the old television in the corner
  const seats = [], table = (tx, tz) => { b(0.7, 0.04, 0.5, tx, 0.45, tz, WOOD_L); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.04, 0.44, 0.04, tx + sx * 0.3, 0.22, tz + sz * 0.2, WOOD_D); block(tx - 0.37, tx + 0.37, tz - 0.27, tz + 0.27); };
  const stool = (x, z, dir, put) => { b(0.3, 0.035, 0.3, x, 0.29, z, WOOD); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.03, 0.28, 0.03, x + sx * 0.12, 0.14, z + sz * 0.12, WOOD_D); seats.push({ x, z, top: 0.31, dir, put }); block(x - 0.17, x + 0.17, z - 0.17, z + 0.17); };
  const bx = -2.95, bz0 = -2.0, bz1 = Math.max(-3.9, -D + 0.85), bm = (bz0 + bz1) / 2;
  b(0.5, 0.06, bz0 - bz1, bx, 0.36, bm, WOOD); b(0.08, 0.5, bz0 - bz1, bx - 0.24, 0.62, bm, WOOD); for (const z of [bz0 + 0.06, bz1 - 0.06]) b(0.46, 0.33, 0.05, bx, 0.165, z, WOOD_D);
  const cushions = [bm + 0.45, bm - 0.45].map((z) => { b(0.44, 0.07, 0.6, bx + 0.02, 0.425, z, '#C8202A'); return z; });
  table(-2.25, bm);
  for (const z of cushions) seats.push({ x: bx + 0.02, z, top: 0.46, dir: [1, 0], put: [-2.25, 0.47, z] });
  stool(-1.55, bm, [-1, 0], [-2.0, 0.47, bm]);
  block(bx - 0.28, bx + 0.26, bz1, bz0);
  table(-2.2, -0.95);
  stool(-2.75, -0.95, [1, 0], [-2.35, 0.47, -0.95]); stool(-1.65, -0.95, [-1, 0], [-2.05, 0.47, -0.95]);
  stool(-2.2, -0.4, [0, -1], [-2.2, 0.47, -0.82]);   // (the one by the glass: yours, walking in)
  // the television in its wooden case on a low cabinet, rabbit ears on top
  { const tx = -2.75, tz = -D + 0.35; b(0.6, 0.42, 0.42, tx, 0.21, tz, WOOD_D); b(0.56, 0.44, 0.4, tx, 0.64, tz, '#5E412C'); b(0.36, 0.3, 0.01, tx - 0.06, 0.64, tz + 0.2, '#56625A'); for (const y of [0.7, 0.56]) cyl(0.025, 0.025, 0.02, tx + 0.19, y, tz + 0.205, '#C9B48A', 8);
    for (const s of [-1, 1]) { const a = new THREE.CylinderGeometry(0.006, 0.006, 0.4, 5).rotateZ(s * 0.5).translate(tx + s * 0.1, FL + 1.02, tz); inner.push(colorize(a, '#9AA2AD')); }
    block(tx - 0.32, tx + 0.32, -D, tz + 0.22); }
  // bulbs hanging low on their cords; a ceiling fan over the tables
  for (const [x, z] of [[-2.2, -1.0], [-2.2, bm], [-0.9, -1.8], [1.1, -2.6], [2.4, -2.6]]) { b(0.01, 0.55, 0.01, x, CEIL - FL - 0.33, z, '#1E1612'); ball(0.055, x, CEIL - FL - 0.65, z, '#FFE7B8'); }
  { const fx = -1.6, fz = -2.4; cyl(0.015, 0.015, 0.3, fx, CEIL - FL - 0.2, fz, '#2B2F36', 6); cyl(0.09, 0.09, 0.07, fx, CEIL - FL - 0.37, fz, '#3A3F47', 10);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; inner.push(colorize(new THREE.BoxGeometry(0.5, 0.012, 0.11).translate(0.3, 0, 0).rotateY(a).translate(fx, FL + CEIL - FL - 0.39, fz), WOOD_D)); } }
  // walking in: at the counter, a cốt dừa, a yoghurt coffee or a bạc xỉu (paid there); the stool by the window
  spots.push({ kind: 'pay', item: { id: 'cotDuaCaPhe', price: 59, carry: 'cup' }, x: 0.6, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'suaChuaCaPhe', price: 55, carry: 'cup' }, x: 1.6, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'bacXiu', price: 45, carry: 'cup' }, x: 2.6, z: -1.15, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.2, z: -0.75, face: 0, seat: seats[seats.length - 1], label: 'fp.sitStool', done: 'fp.sitStoolDone' });
  return { inner, glass, fix, spots, seats, till: { x: 2.6, z: -1.15 }, cashier: { x: 2.7, z: -2.45 }, steam: [], aisle: [],
    stations: [[2.55, -D + 0.78, -1], [1.95, -D + 0.78, -1], [1.0, -2.45, 1], [0.4, -2.45, 1]] };
}

/* ---------- the front: the posters, the hours, the plank, the menu, the photographs; outside: the tiled roof over the
   door, the box with the logo on its bracket, folding chairs at low tables, the old bicycle ---------- */
function front({ n, D, put, out, faces, decal, decalOn }) {
  put(decal(0.5, 0.69, n, RC.posterA).translate(-2.75, FL + 1.55, -0.015), faces);
  put(decal(0.5, 0.69, n, RC.posterB).translate(2.75, FL + 1.55, -0.015), faces);
  put(decalOn(new THREE.CircleGeometry(0.19, 24).translate(1.18, FL + 1.45, 0.012), n, RC.badge), faces);
  put(decal(1.6, 0.28, n, RC.plank).translate(0, FL + 2.24, 0.045), faces);
  put(decal(3.4, 0.6, n, RC.menu).translate(1.6, FL + 2.2, -D + 0.075), faces);
  put(decal(3.3, 0.64, n, RC.panel).translate(1.6, FL + 0.5, -1.545), faces);
  put(decal(2.1, 0.75, n, RC.photos).translate(-1.5, FL + 1.55, -D + 0.07), faces);
  // the cushions' print, on their tops
  const bz0 = -2.0, bz1 = Math.max(-3.9, -D + 0.85), bm = (bz0 + bz1) / 2;
  for (const z of [bm + 0.45, bm - 0.45]) put(decal(0.42, 0.58, n, RC.pattern).rotateX(-Math.PI / 2).translate(-2.93, FL + 0.462, z), faces);
  // the little roof of terracotta tiles over the window on the left (the tables under it), on two brackets
  for (let k = 0; k < 10; k++) put(colorize(new THREE.BoxGeometry(0.24, 0.04, 0.8).rotateX(0.28).translate(-3.16 + k * 0.245, FL + 2.25, 0.42), k % 2 ? TILE : '#A54C27'), out);
  put(boxAt(2.5, 0.05, 0.06, -2.05, FL + 2.37, 0.05, '#6B4A32'), out);
  for (const x of [-3.1, -1.0]) put(colorize(new THREE.BoxGeometry(0.035, 0.035, 0.6).rotateX(-0.6).translate(x, FL + 2.1, 0.28), '#3A3F47'), out);
  // the box with the logo out on its bracket, at the front's right end (both faces lit)
  const lx = 3.42, ly = FL + 2.15, lz = 0.36;
  put(boxAt(0.04, 0.04, 0.42, lx, ly + 0.3, 0.18, '#2B2F36'), out);
  put(boxAt(0.07, 0.4, 0.5, lx, ly, lz, '#F4F2EC'), out);
  for (const s of [1, -1]) put(decal(0.46, 0.27, n, LOGO).rotateY(s * Math.PI / 2).translate(lx + s * 0.037, ly, lz), faces);
  // out on the pavement: two low wooden tables, folding metal chairs, a pot of plants; the old bicycle with its basket
  for (const [tx, tz] of [[-2.55, 0.62], [-1.45, 0.62]]) {
    put(boxAt(0.5, 0.03, 0.4, tx, FL + 0.48, tz, WOOD_L), out); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(boxAt(0.03, 0.47, 0.03, tx + sx * 0.21, FL + 0.235, tz + sz * 0.16, WOOD_D), out);
    for (const s of [-1, 1]) {   // a folding chair: the seat's slats, the back, the crossed legs
      const cx = tx + s * 0.42;
      put(boxAt(0.32, 0.025, 0.3, cx, FL + 0.44, tz, '#6E7A5A'), out); put(boxAt(0.02, 0.32, 0.3, cx + s * 0.16, FL + 0.62, tz, '#6E7A5A'), out);
      for (const sz of [-1, 1]) for (const a of [0.42, -0.42]) put(colorize(new THREE.BoxGeometry(0.02, 0.5, 0.02).rotateZ(a).translate(cx, FL + 0.23, tz + sz * 0.14), '#3A3F47'), out);
    }
  }
  put(colorize(new THREE.CylinderGeometry(0.18, 0.14, 0.34, 10).translate(0.98, FL + 0.17, 0.3), '#7A5232'), out);
  for (const [dy, s, c] of [[0.5, 0.24, '#3E7A3A'], [0.72, 0.18, '#5FA04F']]) put(colorize(new THREE.SphereGeometry(s, 8, 6).translate(0.98, FL + dy, 0.3), c), out);
  { const bx = -2.55, bz = 1.08, wheel = (x) => colorize(new THREE.TorusGeometry(0.3, 0.018, 5, 18).translate(bx + x, FL + 0.31, bz), '#1E1E1E');
    put(wheel(-0.52), out); put(wheel(0.52), out);
    for (const [x0, y0, x1, y1] of [[-0.52, 0.31, -0.05, 0.62], [-0.05, 0.62, 0.44, 0.62], [-0.05, 0.62, 0.0, 0.31], [0.0, 0.31, -0.52, 0.31], [0.44, 0.62, 0.52, 0.31], [0.44, 0.62, 0.4, 0.86], [-0.05, 0.62, -0.1, 0.8]]) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      put(colorize(new THREE.BoxGeometry(len, 0.025, 0.025).rotateZ(Math.atan2(dy, dx)).translate(bx + (x0 + x1) / 2, FL + (y0 + y1) / 2, bz), '#1F4E3A'), out);
    }
    put(boxAt(0.04, 0.03, 0.42, bx + 0.4, FL + 0.87, bz, '#2B2F36'), out); put(boxAt(0.2, 0.04, 0.12, bx - 0.1, FL + 0.82, bz, '#3A2A20'), out);   // the handlebar, the saddle
    put(boxAt(0.26, 0.16, 0.24, bx + 0.66, FL + 0.82, bz, '#B8955A'), out);   // the basket on the front, flowers in it
    for (const [dx, dz, c] of [[0.6, -0.05, '#E8597A'], [0.7, 0.05, '#F2C230'], [0.68, -0.08, '#F4F2EC'], [0.62, 0.07, '#E8597A']]) put(colorize(new THREE.SphereGeometry(0.05, 6, 5).translate(bx + dx, FL + 0.94, bz + dz), c), out);
  }
  return {};
}

/* ---------- its people: the cashier and the barista in olive, the hours' regulars on the bench and the stools (an enamel
   mug of nâu in the morning, cốt dừa in the afternoon, the young in the evening and at the weekend), someone ordering,
   two on the folding chairs out front on dry evenings, a delivery rider at the busy times ---------- */
const SIT = [[[7, 9.5], 2, 'office', 'cgmug'], [[9.5, 11.5], 3, 'student', 'cgcup'], [[11.5, 13.5], 2, 'office', 'cgmug'], [[14, 17.5], 4, 'student', 'cgcup'], [[18, 22.5], 5, 'genz', 'cgcup']];
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, lay, held, sy, mid, r, LOOK, HAIR, isOpen, wx } = c;
  const all = () => [cashier, staff, ...sit, ...out], uniform = { shirt: UNIFORM, pants: '#2E3326' };
  crowd.dress(cashier, { ...uniform, hair: '#2B2420' }); crowd.dress(staff, { ...uniform, hair: '#1E1A18' });
  let dressedFor = '', outFor = '';
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); return; }
      const day = officeNow().getDay(), weekend = day === 0 || day === 6, dry = wx.rain < 0.05;
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 11) < 1.7;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the barista: the espresso machine, the grinder, the phin on the counter, the mugs
      { const k = Math.floor(t / 8) % S.stations.length, [sx, sz, dir] = S.stations[k], [x, z] = at(sx, sz), busy = (t % 8) > 1.4;
        crowd.pose(staff, { x, y: sy, z, yaw: face(0, dir), arms: busy ? [[1.1, -0.1], [1.25 + Math.sin(t * 5) * 0.12, -0.1]] : [[0.15, 0], [0.15, 0]] });
        if (busy && k === 2) hand(staff, 'cgcup'); }
      const rule = weekend && h >= 9 && h < 22.5 ? [null, 5, 'genz', 'cgcup'] : SIT.find(([[a, b]]) => h >= a && h < b), many = rule ? Math.min(rule[1], sit.length - 1) : 0;   // (the stool by the glass left for you)
      if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z), sip = ((t + k * 3.1) % 7) < 1.3, talk = ((t + k * 2.3) % 9) < 2;
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir) + Math.sin(t * 0.3 + k) * 0.1, lean: 0.08,
          arms: [[0.9, -0.3], sip ? [2.25, -0.4] : talk ? [1.3, -0.1 + Math.sin(t * 4) * 0.1] : [0.9, -0.3]] });
        lay(rule[3], ...s.put);
      });
      // out front, dry evenings and weekends: two on the folding chairs; otherwise someone ordering at the counter, and a
      // rider at the kerb at the busy times
      const terrace = dry && ((h >= 17 && h < 22.5) || (weekend && h >= 8 && h < 22.5));
      if (terrace) {
        if (outFor !== 'terrace') { outFor = 'terrace'; out.forEach((i, k) => crowd.dress(i, { ...LOOK.genz(r), hair: HAIR[(k + 1) % 4] })); }
        [[0, -2.97, 0], [1, -2.13, Math.PI]].forEach(([k, x, yaw]) => show(out[k], { x, z: 0.62, sit: 0.46, yaw, arms: [[0.9, -0.3], ((t + k * 3) % 8) < 1.3 ? [2.25, -0.4] : [0.9, -0.3]] }));
        lay('cgcup', -2.65, 0.495, 0.62); lay('cgmug', -2.45, 0.495, 0.62);
      } else {
        if (outFor !== 'day') { outFor = 'day'; crowd.dress(out[0], { shirt: '#00A651', pants: '#2B2F36', hair: '#2B2420' }); crowd.dress(out[1], { ...LOOK.office(r), hair: '#3A2A20' }); }
        if ((t % 55) < 42) { show(out[1], { x: 1.2, z: -1.2, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 55) < 9 ? [0.9, -0.1] : [0.5, -0.1]] }); if ((t % 55) > 26) hand(out[1], 'cgcup'); }
        else crowd.hide(out[1]);
        if (((h >= 11 && h < 13) || (h >= 15 && h < 17)) && (t % 210) < 120) { show(out[0], { x: 1.0, z: 1.0, sit: 0.92, yaw: 0, lean: 0.15, arms: [[1.3, -0.2], [1.4, -0.2]], hat: true }); lay('courier', 1.25, 0, 1.0); }
        else crowd.hide(out[0]);
      }
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; },
  };
}

export const CONG = {
  chain: { name: 'Cộng Cà Phê', short: 'Cộng', face: WALL, stripes: [WALL, CG_RED], accent: CG_OLIVE, shirt: UNIFORM, hours: [7, 23], seats: true, greet: 'Cộng xin chào!' },
  frame: WALL_D,   // (the front's frames in olive, not the usual grey)
  kerb: [1.7, 2.45, 3.15], draw, paint, fit, front, people,
};
