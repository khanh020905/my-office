// Điện Máy Xanh (dienmayxanh.com), the appliance chain of the Thế Giới Di Động group, as its shops look in Vietnam in 2026:
// the long sky-blue sign with the mark in a yellow circle (a runner made of slanted squares, a round head) and "Điện máy"
// then "XANH" in yellow, leaning forward, the second word heavy capitals; posters on the glass (máy lạnh for the hot
// season, trả góp 0%); inside, the TV wall at the back with the screens lit, front-loading washing machines on an
// island, a row of fridges, split air conditioners along the wall with yellow price cards, stand fans turning by the
// window, rice cookers and air fryers on a table, two massage chairs someone is always trying, and the till in blue and
// yellow; staff in blue; open 8:00–22:00. At the door a "người xanh" in a blue bodysuit (the chain's TV ads: "Bạn muốn
// mua tivi? Đến Điện máy XANH!") dances in the mornings and evenings. None of it is the chain's artwork: the lettering is
// set here, the mark drawn here from squares. shops.js places it (DMX), and paints it (paint) when it is too far off to
// walk into.
import * as THREE from 'three';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { figure, glassOver } from './shop-paint.js';

export const DMX_BLUE = '#00AEEF', DMX_YELLOW = '#FFF200';
const INK = '#111111', SHIRT = '#1690D8', FL = 0.12, CEIL = 2.75, FONT = '"Be Vietnam Pro", system-ui, sans-serif';

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
const RD = { sign: [0, 0, 1024, 140], band: [0, 140, 1024, 70], posterA: [0, 210, 200, 260], posterB: [200, 210, 200, 260], panel: [400, 210, 420, 110],
  hours: [400, 330, 200, 30], tag: [620, 330, 120, 60], screens: [820, 210, 204, 180], wall: [400, 400, 624, 70] };
const SCREEN = (k) => [RD.screens[0] + (k % 2) * 102 + 3, RD.screens[1] + Math.floor(k / 2) * 60 + 3, 96, 54];   // (six, 2 × 3)

// the mark: a yellow disc, in it a runner of slanted black squares with a round head (measured off the chain's sign)
const CELLS = [[0.578, -0.444], [-0.178, -0.244], [0.067, -0.244], [0.311, -0.244], [-0.422, -0.044], [0.0, -0.02], [-0.289, 0.236], [0.187, 0.236], [-0.547, 0.436], [0.333, 0.436]];
export function mark(g, cx, cy, R, disc = DMX_YELLOW, ink = INK) {
  g.save();
  g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = ink; g.beginPath(); g.arc(cx + 0.124 * R, cy - 0.564 * R, 0.164 * R, 0, Math.PI * 2); g.fill();
  const w = 0.2 * R, h = 0.19 * R, s = 0.05 * R;
  for (const [u, v] of CELLS) {
    const x = cx + u * R, y = cy + v * R;
    g.beginPath(); g.moveTo(x - w / 2 - s, y + h / 2); g.lineTo(x + w / 2 - s, y + h / 2); g.lineTo(x + w / 2 + s, y - h / 2); g.lineTo(x - w / 2 + s, y - h / 2); g.closePath(); g.fill();
  }
  g.restore();
}
// "Điện máy" (medium) then "XANH" (heavy capitals), leaning forward, fitted in a width; returns the width used
function name(g, x, y, w, size, c) {
  g.save(); g.fillStyle = c; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `600 ${size}px ${FONT}`; const a = g.measureText('Điện máy').width + size * 0.06;
  g.font = `900 ${size}px ${FONT}`; const b = g.measureText('XANH').width;
  const k = Math.min(1, w / (a + b));
  g.translate(x, y); g.transform(1, 0, -0.2, 1, 0, 0); g.scale(k, 1);
  g.font = `600 ${size}px ${FONT}`; g.fillText('Điện máy', 0, 0);
  g.font = `900 ${size}px ${FONT}`; g.fillText('XANH', a, 0);
  g.restore();
  return (a + b) * k;
}
// the whole logo, centred on (cx, cy) at a disc radius R
function logo(g, cx, cy, R, c = DMX_YELLOW, ink = INK) {
  g.save(); g.font = `600 ${R * 1.32}px ${FONT}`; const a = g.measureText('Điện máy').width + R * 0.08; g.font = `900 ${R * 1.32}px ${FONT}`; const tw = a + g.measureText('XANH').width; g.restore();
  const total = 2 * R + R * 0.32 + tw, x0 = cx - total / 2;
  mark(g, x0 + R, cy, R, c, ink);
  name(g, x0 + 2.32 * R, cy + R * 0.46, tw, R * 1.32, c);
}
// a TV, front on (a thin bezel, the screen lit with something); an air conditioner's indoor unit
function tv(g, x, y, w, h, k) {
  g.fillStyle = '#16181C'; g.fillRect(x, y, w, h); screen(g, x + w * 0.03, y + w * 0.03, w * 0.94, h - w * 0.06, k);
}
function screen(g, x, y, w, h, k) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const lin = (a, b, stops) => { const gr = g.createLinearGradient(x, y + h * a, x, y + h * b); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  if (k === 0) {   // mountains under a blue sky
    g.fillStyle = lin(0, 1, [[0, '#3C8DDE'], [0.6, '#BFE2FF'], [1, '#E8F4FF']]); g.fillRect(x, y, w, h);
    g.fillStyle = '#3F6E4A'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.3, y + h * 0.35); g.lineTo(x + w * 0.55, y + h * 0.7); g.lineTo(x + w * 0.75, y + h * 0.3); g.lineTo(x + w, y + h * 0.6); g.lineTo(x + w, y + h); g.fill();
    g.fillStyle = '#F4F7FA'; g.beginPath(); g.moveTo(x + w * 0.25, y + h * 0.43); g.lineTo(x + w * 0.3, y + h * 0.35); g.lineTo(x + w * 0.35, y + h * 0.43); g.fill();
  } else if (k === 1) {   // the football: the pitch, its lines, the players
    g.fillStyle = '#2E8B3E'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2A7F38' : '#319443'; g.fillRect(x + (i * w) / 6, y, w / 6, h); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(1, w * 0.012); g.strokeRect(x + w * 0.04, y + h * 0.1, w * 0.92, h * 0.8); g.beginPath(); g.moveTo(x + w / 2, y + h * 0.1); g.lineTo(x + w / 2, y + h * 0.9); g.stroke(); g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.16, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 7; i++) { g.fillStyle = i < 4 ? '#D8262E' : '#F2F2F2'; g.fillRect(x + w * (0.18 + 0.1 * i + (i % 2) * 0.03), y + h * (0.3 + ((i * 37) % 40) / 100), w * 0.025, h * 0.08); }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + w * 0.03, y + h * 0.04, w * 0.3, h * 0.13); g.fillStyle = '#FFF'; g.font = `700 ${h * 0.1}px ${FONT}`; g.textBaseline = 'middle'; g.fillText('VIE 2 – 1 THA', x + w * 0.05, y + h * 0.105);
  } else if (k === 2) {   // the colour demo: bands of saturated light
    g.fillStyle = '#0B0B14'; g.fillRect(x, y, w, h);
    ['#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.ellipse(x + w * (0.1 + i * 0.13), y + h * (0.5 + Math.sin(i) * 0.2), w * 0.09, h * 0.32, 0.5, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#FFF'; g.font = `900 ${h * 0.2}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('4K UHD', x + w / 2, y + h * 0.82);
  } else if (k === 3) {   // under the sea
    g.fillStyle = lin(0, 1, [[0, '#33B5E5'], [1, '#063A6B']]); g.fillRect(x, y, w, h);
    [['#FF8A00', 0.3, 0.45], ['#FFD400', 0.62, 0.6], ['#FF5A5F', 0.45, 0.72]].forEach(([c, u, v]) => { g.fillStyle = c; g.beginPath(); g.ellipse(x + w * u, y + h * v, w * 0.06, h * 0.07, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x + w * (u - 0.05), y + h * v); g.lineTo(x + w * (u - 0.1), y + h * (v - 0.07)); g.lineTo(x + w * (u - 0.1), y + h * (v + 0.07)); g.fill(); });
    g.fillStyle = '#2F7D4A'; for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.08 + i * 0.2), y + h * 0.75, w * 0.02, h * 0.25);
  } else if (k === 4) {   // a sunset over the sea
    g.fillStyle = lin(0, 0.62, [[0, '#2B1E5C'], [0.55, '#E8603C'], [1, '#FFC46B']]); g.fillRect(x, y, w, h * 0.62);
    g.fillStyle = '#FFE1A0'; g.beginPath(); g.arc(x + w * 0.62, y + h * 0.6, h * 0.16, Math.PI, 0); g.fill();
    g.fillStyle = lin(0.62, 1, [[0, '#E07A4E'], [1, '#2B2F5C']]); g.fillRect(x, y + h * 0.62, w, h * 0.38);
  } else {   // the chain's own advert: blue, the mark, "Giá rẻ quá!"
    g.fillStyle = DMX_BLUE; g.fillRect(x, y, w, h);
    mark(g, x + h * 0.38, y + h * 0.5, h * 0.3);
    g.fillStyle = DMX_YELLOW; g.font = `900 ${h * 0.3}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('GIÁ RẺ QUÁ!', x + h * 0.78, y + h * 0.5, w - h * 0.85);
  }
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, w, h * 0.4);   // (the glass's sheen)
  g.restore();
}
function aircon(g, x, y, w, h) {
  g.fillStyle = '#F7F8FA'; g.beginPath(); g.roundRect(x, y, w, h, h * 0.25); g.fill(); g.strokeStyle = '#C9CED6'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#5A6270'; g.fillRect(x + w * 0.08, y + h * 0.7, w * 0.84, h * 0.1);
  g.fillStyle = '#00AEEF'; g.beginPath(); g.arc(x + w * 0.86, y + h * 0.3, h * 0.07, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#9FD8F5'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + w * (0.25 + i * 0.25), y + h * 0.95); g.quadraticCurveTo(x + w * (0.2 + i * 0.25), y + h * 1.25, x + w * (0.27 + i * 0.25), y + h * 1.5); g.stroke(); }
}

// the sign: sky blue, lit from inside, the logo in the middle (clear of the piers at the ends)
function sign(g, x, y, w, h, dark) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = DMX_BLUE; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, w, 12);
  g.fillStyle = '#0096D1'; g.fillRect(x, y + h - 8, w, 8);
  logo(g, x + w / 2, y + h * 0.47, 52);
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
  g.restore();
}
function draw(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  sign(g, ...at(RD.sign), dark);
  // the band along the back wall, over the TVs: the logo three times
  { const [x, y, w, h] = at(RD.band);
    g.fillStyle = DMX_BLUE; g.fillRect(x, y, w, h); g.fillStyle = DMX_YELLOW; g.fillRect(x, y + h - 6, w, 6);
    for (let k = 0; k < 3; k++) logo(g, x + 170 + k * 342, y + h / 2 - 3, 20); }
  // the posters on the glass: an air conditioner for the hot season, a TV in instalments at 0%
  { const [x, y, w, h] = at(RD.posterA);
    g.fillStyle = '#FFFFFF'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = DMX_BLUE; g.fillRect(x + 6, y + 6, w - 12, 62);
    g.fillStyle = DMX_YELLOW; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 30px ${FONT}`; g.fillText('MÁY LẠNH', x + w / 2, y + 38, w - 24);
    aircon(g, x + 30, y + 86, w - 60, 38);
    g.fillStyle = '#E3262B'; g.font = `900 22px ${FONT}`; g.fillText('GIẢM ĐẾN', x + w / 2, y + 168);
    g.font = `900 58px ${FONT}`; g.fillText('40%', x + w / 2, y + 210);
    g.fillStyle = '#16181C'; g.font = `700 13px ${FONT}`; g.fillText('Lắp đặt miễn phí', x + w / 2, y + h - 22, w - 20); }
  { const [x, y, w, h] = at(RD.posterB);
    g.fillStyle = DMX_YELLOW; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = '#0072BC'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 26px ${FONT}`; g.fillText('TRẢ GÓP', x + w / 2, y + 36);
    g.font = `900 64px ${FONT}`; g.fillText('0%', x + w / 2, y + 86);
    tv(g, x + 22, y + 124, w - 44, 80, 0);
    g.fillStyle = '#16181C'; g.fillRect(x + w / 2 - 14, y + 204, 28, 8);
    g.fillStyle = '#0072BC'; g.font = `800 15px ${FONT}`; g.fillText('Tivi 4K · Duyệt 15 phút', x + w / 2, y + h - 24, w - 20); }
  // the till's front: blue, the logo, THU NGÂN
  { const [x, y, w, h] = at(RD.panel);
    g.fillStyle = DMX_BLUE; g.fillRect(x, y, w, h); g.fillStyle = DMX_YELLOW; g.fillRect(x, y + h - 10, w, 10);
    logo(g, x + w / 2, y + h * 0.36, 23);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 18px ${FONT}`; g.fillText('THU NGÂN', x + w / 2, y + h * 0.76); }
  // the hours on the door; a price card (the little yellow ones on everything); the screens; the words on the wall
  { const [x, y, w, h] = at(RD.hours);
    g.fillStyle = DMX_YELLOW; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = '#0072BC'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 8:00 – 22:00', x + w / 2, y + h / 2 + 1, w - 10); }
  { const [x, y, w, h] = at(RD.tag);
    g.fillStyle = DMX_YELLOW; g.fillRect(x, y, w, h); g.fillStyle = '#0072BC'; g.fillRect(x, y, w, 14);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 11px ${FONT}`; g.fillText('GIÁ SỐC', x + w / 2, y + 7);
    g.fillStyle = '#E3262B'; g.font = `900 26px ${FONT}`; g.fillText('-30%', x + w / 2, y + 37); }
  for (let k = 0; k < 6; k++) screen(g, ...at(SCREEN(k)), k);
  { const [x, y, w, h] = at(RD.wall);
    g.clearRect(x, y, w, h);
    g.fillStyle = '#0072BC'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 30px ${FONT}`; g.fillText('Giao hàng · Lắp đặt miễn phí tận nhà', x + w / 2, y + h / 2, w - 20); }
}

/** The front too far off to walk into (shops.js farFront): the sign, and under it the inside through the glass (the TV
    wall lit, the air conditioners high on the wall, fridges and washing machines, a consultant in blue, a customer, the
    posters); shops.js rolls the shutter down over it at closing time. */
function paint(g, cx, cy, dark) {
  sign(g, cx, cy, 1024, 140, dark);
  const x = cx, y = cy + 140, w = 1024, h = 372;
  g.fillStyle = '#EEF2F5'; g.fillRect(x, y, w, h);
  g.fillStyle = DMX_BLUE; g.fillRect(x, y + h * 0.05, w, h * 0.06);
  g.fillStyle = '#3A3F47'; g.fillRect(x + w * 0.2, y + h * 0.16, w * 0.56, h * 0.42);
  for (let k = 0; k < 6; k++) tv(g, x + w * (0.215 + (k % 3) * 0.183), y + h * (0.18 + Math.floor(k / 3) * 0.2), w * 0.17, h * 0.18, k);
  for (let k = 0; k < 3; k++) {   // the fridges on the left, washing machines in front
    const fx = x + w * (0.04 + k * 0.085);
    g.fillStyle = ['#C9CED6', '#2B2F36', '#E8EAED'][k]; g.fillRect(fx, y + h * 0.3, w * 0.075, h * 0.56); g.fillStyle = '#1E2125'; g.fillRect(fx + w * 0.0365, y + h * 0.31, 2, h * 0.54);
  }
  for (let k = 0; k < 4; k++) {
    const fx = x + w * (0.3 + k * 0.1);
    g.fillStyle = '#FFFFFF'; g.fillRect(fx, y + h * 0.64, w * 0.085, h * 0.22); g.fillStyle = '#B9C0C8'; g.beginPath(); g.arc(fx + w * 0.0425, y + h * 0.76, h * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2B3440'; g.beginPath(); g.arc(fx + w * 0.0425, y + h * 0.76, h * 0.05, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#E1E5E9'; g.fillRect(x, y + h * 0.86, w, h * 0.14);
  figure(g, x + w * 0.74, y + h * 0.56, 15, SHIRT, '#1E1A18'); figure(g, x + w * 0.66, y + h * 0.58, 15, '#B85C7A', '#3A2A20');   // a consultant in blue, a customer
  g.fillStyle = DMX_BLUE; g.fillRect(x + w * 0.8, y + h * 0.62, w * 0.17, h * 0.24); g.fillStyle = DMX_YELLOW; g.fillRect(x + w * 0.8, y + h * 0.62, w * 0.17, 7);   // the till
  figure(g, x + w * 0.885, y + h * 0.5, 15, SHIRT);
  // the posters on the glass: the air conditioner sale, the instalments
  g.fillStyle = DMX_BLUE; g.fillRect(x + 6, y + h * 0.16, w * 0.15, h * 0.6); g.fillStyle = DMX_YELLOW; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${h * 0.07}px ${FONT}`; g.fillText('MÁY LẠNH', x + 6 + w * 0.075, y + h * 0.26, w * 0.14);
  g.fillStyle = '#FFFFFF'; g.font = `900 ${h * 0.13}px ${FONT}`; g.fillText('-40%', x + 6 + w * 0.075, y + h * 0.46, w * 0.14);
  g.fillStyle = DMX_YELLOW; g.fillRect(x + w * 0.845 - 6, y + h * 0.16, w * 0.155, h * 0.4); g.fillStyle = '#0072BC'; g.font = `900 ${h * 0.06}px ${FONT}`; g.fillText('TRẢ GÓP', x + w * 0.92 - 6, y + h * 0.24, w * 0.14);
  g.font = `900 ${h * 0.14}px ${FONT}`; g.fillText('0%', x + w * 0.92 - 6, y + h * 0.4, w * 0.14);
  glassOver(g, x, y, w, h);
}

/* ---------- the fittings, in the shop's own frame ---------- */
function fit(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (r0, r1, h, x, y, z, c, n = 14) => inner.push(colorize(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  for (let x = -half; x < half - 0.01; x += 0.6) for (let z = -D; z < -0.01; z += 0.6) {
    const w = Math.min(0.6, half - x), d = Math.min(0.6, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.6) + Math.round(-z / 0.6)) % 2 ? '#ECEEF1' : '#E1E5E9'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, '#F7F7F5');
  for (const s of [-1, 1]) { b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, '#F7F7F5'); b(0.02, 0.22, D - 0.1, s * (half - 0.065), CEIL - FL - 0.3, -D / 2, DMX_BLUE); }
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#FFFFFF');
  for (const x of [-1.8, 0.2, 2.2]) b(0.12, 0.02, D - 0.8, x, CEIL - FL - 0.07, -D / 2, '#FFFFFF');
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, '#F7F7F5');
  // the TV wall at the back: a dark panel, two rows of three big TVs in their bezels (the screens are printed: front())
  b(4.3, 1.56, 0.04, -0.85, 1.3, -D + 0.08, '#3A3F47');
  for (const [x, y] of TVS) b(1.24, 0.72, 0.05, x, y, -D + 0.125, '#15171B');
  // the table in front of it: rice cookers, kettles, air fryers, a blender
  const tz = -D + 0.85;
  b(2.6, 0.04, 0.55, -0.7, 0.75, tz, '#F4F4F2'); b(2.54, 0.73, 0.5, -0.7, 0.365, tz, '#CDD3DA');
  for (let i = 0, x = -1.85; x < 0.5; x += 0.33 * (low ? 2 : 1), i++) {
    const kind = i % 4;
    if (kind === 0) { cyl(0.12, 0.12, 0.17, x, 0.86, tz, '#F7F7F5'); inner.push(colorize(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(x, FL + 0.945, tz), '#E3262B')); }   // a rice cooker
    else if (kind === 1) { cyl(0.065, 0.08, 0.22, x, 0.88, tz, '#C9CED6'); b(0.02, 0.12, 0.03, x + 0.09, 0.9, tz, '#2B2F36'); }   // a kettle
    else if (kind === 2) { b(0.24, 0.27, 0.24, x, 0.9, tz, '#1E2125'); b(0.16, 0.06, 0.01, x, 0.97, tz + 0.12, '#3A4A6B'); }   // an air fryer
    else { cyl(0.07, 0.08, 0.1, x, 0.82, tz, '#2B2F36'); cyl(0.07, 0.055, 0.2, x, 0.97, tz, '#D7EEF8'); }   // a blender
    b(0.005, 0.05, 0.08, x, 0.76, tz + 0.278, DMX_YELLOW);
  }
  block(-2.02, 0.62, tz - 0.3, tz + 0.3);
  // the island of front-loading washing machines: two rows, back to back
  b(2.05, 0.08, 1.3, -0.4, 0.04, -1.9, '#D6DBE1');
  for (const [z, s] of [[-1.6, 1], [-2.2, -1]]) for (const x of [-1.1, -0.4, 0.3]) {
    const white = r() < 0.75;
    b(0.6, 0.84, 0.58, x, 0.5, z, white ? '#F7F8FA' : '#5E6670');
    b(0.6, 0.1, 0.02, x, 0.86, z + s * 0.29, white ? '#E6E9ED' : '#4A515B');
    const fz = z + s * 0.3;
    inner.push(colorize(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20).rotateX(Math.PI / 2).translate(x, FL + 0.45, fz), '#B9C0C8'));
    inner.push(colorize(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 20).rotateX(Math.PI / 2).translate(x, FL + 0.45, fz + s * 0.002), '#2B3440'));
  }
  block(-1.45, 0.65, -2.55, -1.25);
  // the fridges along the left wall, facing in: side-by-side doors, handles
  const FR = ['#C9CED6', '#2B2F36', '#E8EAED', '#8E959E'];
  const fridges = [];
  for (let z = -2.4, k = 0; z > -D + 0.5; z -= 0.76, k++) {
    const x = -half + 0.42;
    b(0.7, 1.78, 0.7, x, 0.89, z, FR[k % FR.length]);
    b(0.01, 1.7, 0.012, x + 0.351, 0.9, z, '#1E2125');
    for (const s of [-1, 1]) b(0.025, 0.5, 0.025, x + 0.365, 1.1, z + s * 0.07, '#9AA2AD');
    fridges.push(z);
  }
  if (fridges.length) block(-half, -half + 0.8, fridges[fridges.length - 1] - 0.36, -2.03);
  // two massage chairs by the window on the left, facing in (someone is always trying one)
  const seats = [];
  for (const [z, c, trim] of [[-0.78, '#3B2A22', '#C9A27A'], [-1.6, '#1E1E1E', '#C8A951']]) {
    const x = -half + 0.95;
    b(1.0, 0.3, 0.68, x, 0.15, z, c);
    b(0.56, 0.14, 0.56, x + 0.04, 0.37, z, c);
    inner.push(colorize(new THREE.BoxGeometry(0.16, 0.92, 0.6).rotateZ(0.42).translate(x - 0.36, FL + 0.82, z), c));
    inner.push(colorize(new THREE.BoxGeometry(0.2, 0.2, 0.62).rotateZ(0.42).translate(x - 0.52, FL + 1.25, z), trim));
    for (const s of [-1, 1]) b(0.62, 0.3, 0.12, x + 0.02, 0.56, z + s * 0.32, trim);
    inner.push(colorize(new THREE.BoxGeometry(0.14, 0.44, 0.42).rotateZ(0.5).translate(x + 0.44, FL + 0.24, z), c));
    seats.push({ x: x + 0.02, z, top: 0.44, dir: [1, 0], put: [x + 0.3, 0.7, z] });
    block(x - 0.62, x + 0.58, z - 0.38, z + 0.38);
  }
  // stand fans by the window on the right (their blades turn: front()), the split air conditioners high on that wall
  for (const z of FANS) {
    cyl(0.17, 0.19, 0.04, 3.0, 0.02, z, '#E6E9ED', 16); cyl(0.018, 0.018, 1.0, 3.0, 0.52, z, '#D8DCE1', 8);
    b(0.12, 0.13, 0.12, 3.06, 1.08, z, '#E6E9ED');
    inner.push(colorize(new THREE.TorusGeometry(0.21, 0.008, 6, 24).rotateY(Math.PI / 2).translate(2.98, FL + 1.08, z), '#C9CED6'));
  }
  block(2.74, 3.3, FANS[FANS.length - 1] - 0.26, FANS[0] + 0.26);
  for (const z of ACS) if (z > -D + 0.5) {
    b(0.22, 0.28, 0.86, half - 0.17, 2.12, z, '#F7F8FA');
    b(0.012, 0.045, 0.76, half - 0.285, 2.02, z, '#5A6270');
    b(0.01, 0.02, 0.02, half - 0.285, 2.2, z + 0.34, '#00AEEF');
  }
  // the till at the back on the right: blue with its yellow edge (printed), the register; boxed appliances behind
  b(1.6, 0.98, 0.6, 2.4, 0.49, -2.6, '#0E8FD0'); b(1.66, 0.05, 0.66, 2.4, 1.0, -2.6, '#F4F4F2');
  b(0.36, 0.1, 0.3, 2.75, 1.08, -2.72, '#1E2125'); b(0.32, 0.22, 0.02, 2.75, 1.24, -2.8, '#2B3A55'); b(0.22, 0.15, 0.02, 2.75, 1.17, -2.46, '#2B3A55');
  b(2.0, 1.9, 0.32, 2.3, 0.95, -D + 0.18, '#ECEEF0');
  for (let y = 0.3; y < 1.8; y += 0.36) for (let x = 1.42; x < 3.2; x += 0.3 * (low ? 2 : 1)) { b(0.26, 0.3, 0.24, x, y, -D + 0.22, r() < 0.6 ? '#F2F2F2' : '#DDE9F3'); b(0.26, 0.05, 0.005, x, y + 0.05, -D + 0.34, DMX_BLUE); }
  block(1.55, 3.3, -2.95, -2.25); block(1.25, 3.3, -D, -D + 0.38);
  // walking in: a kettle from the table, a pair of batteries at the till (paid there)
  spots.push({ kind: 'side', item: { id: 'kettle', price: 199, carry: 'grocery' }, x: -0.7, z: tz + 0.62, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'batteries', price: 25, carry: 'grocery' }, x: 2.4, z: -1.95, face: Math.PI });
  return { inner, glass, fix, spots, seats, till: { x: 2.4, z: -1.95 }, cashier: { x: 2.4, z: -3.15 }, steam: [], aisle: [], fridges, tz,
    stations: [[-0.85, tz + 0.65, 0, -1], [-0.4, -0.95, 0, -1], [-1.95, -2.75, -1, 0], [2.1, -1.0, 1, 0]] };
}
const TVS = [[-2.15, 1.7], [-0.85, 1.7], [0.45, 1.7], [-2.15, 0.93], [-0.85, 0.93], [0.45, 0.93]];
const FANS = [-0.5, -1.0, -1.5], ACS = [-0.75, -1.7, -2.65, -3.6];

/* ---------- the người xanh at the door: a dancer in a blue bodysuit head to toe, the chain's mark on the chest ---------- */
function nguoiXanh() {
  const m = vmat({ roughness: 0.55 }), root = new THREE.Group(), body = new THREE.Group();
  const C = '#1EA8E8', part = (list) => { const o = new THREE.Mesh(mergeAll(list), m); o.castShadow = true; return o; };
  // the chest's mark: a yellow disc, a black head and a few black squares (the runner)
  const chest = [boxAt(0.36, 0.56, 0.22, 0, 0.28, 0, C), colorize(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 20).rotateX(Math.PI / 2).translate(0, 0.36, 0.112), DMX_YELLOW)];
  chest.push(colorize(new THREE.SphereGeometry(0.016, 8, 6).translate(0.012, 0.416, 0.118), INK));
  for (const [u, v] of CELLS) chest.push(boxAt(0.019, 0.018, 0.006, u * 0.1, 0.36 - v * 0.1, 0.12, INK));
  body.add(part(chest));
  const head = part([colorize(new THREE.SphereGeometry(0.14, 14, 10).scale(0.95, 1.08, 0.95).translate(0, 0.73, 0), C), boxAt(0.12, 0.08, 0.2, 0, 0.6, 0, C)]);
  body.add(head);
  const limb = (w, l, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(part([boxAt(w, l, w, 0, -l / 2, 0, C), colorize(new THREE.SphereGeometry(w * 0.62, 8, 6).translate(0, -l, 0), C)])); return p; };
  const arms = [limb(0.09, 0.6, -0.23, 0.52), limb(0.09, 0.6, 0.23, 0.52)], legs = [limb(0.13, 0.86, -0.1, 0), limb(0.13, 0.86, 0.1, 0)];
  body.add(...arms); body.position.y = 0.9; root.add(body);
  legs.forEach((l) => { l.position.y = 0.92; root.add(l); });
  root.visible = false;
  return {
    root,
    // the moves from the ads: arms pumping up and out, hips swinging, a hop now and then, a point at the shop
    update(t, on) {
      root.visible = on; if (!on) return;
      const beat = t * 4.4, bar = Math.floor(t / 4) % 3, hop = Math.max(0, Math.sin(beat)) * 0.06;
      body.position.y = 0.9 + hop; body.rotation.z = Math.sin(beat / 2) * 0.12; body.rotation.y = Math.sin(t * 1.1) * 0.35;
      head.rotation.z = Math.sin(beat / 2 + 1) * 0.15;
      if (bar === 0) arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (2.4 + Math.sin(beat + i * Math.PI) * 0.5); a.rotation.x = 0; });   // up, pumping
      else if (bar === 1) arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (1.3 + Math.sin(beat * 2) * 0.25); a.rotation.x = Math.sin(beat + i) * 0.6; });   // out, waving
      else { arms[0].rotation.z = -0.3; arms[0].rotation.x = 0; arms[1].rotation.z = 1.5 + Math.sin(beat) * 0.12; arms[1].rotation.x = 0; }   // pointing at the door
      legs.forEach((l, i) => { l.rotation.z = (i ? -1 : 1) * Math.max(0, Math.sin(beat + i * Math.PI)) * 0.35; l.position.y = 0.92 + hop * 0.6; });
    },
  };
}
/* the stand fans' blades: three, on a hub, turning when the shop is open */
function fanBlades(S, built) {
  const m = vmat({ roughness: 0.4 }), hold = new THREE.Group(), blades = [];
  hold.matrixAutoUpdate = false; hold.matrix.copy(S.M);
  const geo = mergeAll([colorize(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10).rotateZ(Math.PI / 2), '#C9CED6'),
    ...[0, 1, 2].map((k) => colorize(new THREE.SphereGeometry(0.09, 10, 6).scale(0.12, 1, 0.55).translate(0, 0.1, 0).rotateX((k * Math.PI * 2) / 3), '#BFE3F5'))]);
  for (const z of FANS) { const o = new THREE.Mesh(geo, m); o.position.set(2.94, FL + 1.08, z); hold.add(o); blades.push(o); }
  built.add(hold);
  return { update(dt, on) { if (on) for (const [k, o] of blades.entries()) o.rotation.x += dt * (14 + k * 2); } };
}

/* ---------- the front: the posters, the hours, the band, the screens, the price cards, the till's front, the wall's
   words; the fans' blades; the người xanh ---------- */
function front({ n, D, put, faces, decal, built, S, GY }) {
  put(decal(0.62, 0.8, n, RD.posterA).translate(-2.7, FL + 1.45, -0.015), faces);
  put(decal(0.62, 0.8, n, RD.posterB).translate(2.7, FL + 1.45, -0.015), faces);
  put(decal(0.5, 0.075, n, RD.hours).translate(0.82 + 0.34, FL + 1.3, -0.015), faces);
  put(decal(6.4, 0.44, n, RD.band).translate(0, CEIL - 0.34, -D + 0.07), faces);
  put(decal(1.56, 0.4, n, RD.panel).translate(2.4, FL + 0.5, -2.295), faces);
  put(decal(D - 2.2, (D - 2.2) * 70 / 624, n, RD.wall).rotateY(Math.PI / 2).translate(-SHOP_HALF + 0.075, 2.12, -(D + 1.83) / 2), faces);   // (over the fridges)
  TVS.forEach(([x, y], k) => put(decal(1.16, 0.65, n, SCREEN(k % 6)).translate(x, FL + y, -D + 0.152), faces));
  // the price cards: on the fridges' doors, on the washing machines, under the air conditioners, on the table's TVs
  for (const z of S.fridges) put(decal(0.16, 0.08, n, RD.tag).rotateY(Math.PI / 2).translate(-SHOP_HALF + 0.78, FL + 1.18, z + 0.18), faces);
  for (const x of [-1.1, -0.4, 0.3]) put(decal(0.16, 0.08, n, RD.tag).translate(x, FL + 0.74, -1.29), faces);
  for (const z of ACS) if (z > -D + 0.5) put(decal(0.2, 0.1, n, RD.tag).rotateY(-Math.PI / 2).translate(SHOP_HALF - 0.065, FL + 1.78, z), faces);
  const man = nguoiXanh(); man.root.rotation.y = S.rot;
  const [mx, mz] = S.toW(-2.35, 0.85); man.root.position.set(mx, GY + FL, mz); built.add(man.root);
  return { dancer: man, fans: fanBlades(S, built) };
}
const SHOP_HALF = 3.3;

/* ---------- its people: the cashier and a consultant in blue, someone in a massage chair, customers at the TVs and the
   washing machines, someone at the window ---------- */
function people(S, c) {
  const { crowd, props, cashier, staff, sit, out, at, face, hand, held, sy, mid, r, LOOK, HAIR, isOpen, wx } = c;
  const all = () => [cashier, staff, ...sit, ...out], uniform = { shirt: SHIRT, pants: '#1E1E1E' };
  crowd.dress(cashier, { ...uniform, hair: '#2B2420' }); crowd.dress(staff, { ...uniform, hair: '#1E1A18' });
  crowd.dress(out[0], { ...LOOK.office(r), hair: '#3A2A20' }); crowd.dress(out[1], { shirt: '#B85C7A', pants: '#3A3F47', sleeves: '#F2E6D8', hair: '#2B2420' });
  sit.forEach((i, k) => crowd.dress(i, { ...(k ? LOOK.office(r) : { shirt: '#7A8A9A', pants: '#4A4F5A' }), hair: HAIR[(k + 1) % 4] }));
  const show = (i, f) => { if (i == null) return; const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
  return {
    when: [0, 24], dry: true, at: mid,
    update(t, dt, h) {
      for (const p of held) props.hide(p); held.length = 0;
      const open = isOpen(S.ch, h);
      S.dancer?.update(t, open && wx.rain < 0.05 && ((h >= 9 && h < 11) || (h >= 17 && h < 20.5)));
      S.fans?.update(dt, open);
      if (!open) { all().forEach((i) => crowd.hide(i)); return; }
      { const [x, z] = at(S.cashier.x, S.cashier.z), take = S.greetT > c.now() || (t % 15) < 1.6;
        crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.12, arms: take ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
      // the consultant, from the TVs to the washing machines to the fridges to the air conditioners, showing each off
      { const k = Math.floor(t / 10) % S.stations.length, [sx, sz, dx, dz] = S.stations[k], [x, z] = at(sx, sz), talk = (t % 10) > 1.5;
        crowd.pose(staff, { x, y: sy, z, yaw: face(dx, dz), arms: talk ? [[0.4, -0.1], [1.3 + Math.sin(t * 3) * 0.3, -0.35]] : [[0.15, 0], [0.15, 0]] }); }
      // in the massage chairs: leant back, eyes shut, shaking a little as it works (one all day, two in the evening)
      const many = h >= 9 && h < 21.5 ? (h >= 17 ? 2 : 1) : 0;
      sit.forEach((i, k) => {
        if (k >= many) { crowd.hide(i); return; }
        const s = S.seats[k], [x, z] = at(s.x, s.z);
        crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(...s.dir), lean: 0.42, bob: Math.sin(t * 31 + k) * 0.006, arms: [[0.55, -0.22], [0.55, -0.22]] });
      });
      // a couple of customers: at the TVs a while, then bent over the washing machines; someone at the posters in the evening
      if ((t % 80) < 60) {
        if ((t % 80) < 32) show(out[1], { x: -0.2, z: S.tz + 0.75, yaw: Math.PI / 2, arms: [[0.2, 0], (t % 9) < 2 ? [1.4, -0.2] : [0.3, 0]] });
        else show(out[1], { x: 0.0, z: -0.85, yaw: Math.PI / 2, lean: -0.35, arms: [[0.6, -0.1], [0.9, -0.1]] });
      } else crowd.hide(out[1]);
      if (wx.rain < 0.05 && h >= 18 && h < 21.5 && (t % 110) < 64) { show(out[0], { x: -2.2, z: 0.62, yaw: Math.PI / 2, arms: [[0.2, 0], [0.5, -0.1]] }); hand(out[0], 'phone'); } else crowd.hide(out[0]);
    },
    off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; S.dancer?.update(0, false); },
  };
}

export const DMX = {
  chain: { name: 'Điện Máy Xanh', short: 'ĐMX', face: DMX_BLUE, stripes: [DMX_BLUE], accent: '#0096D1', shirt: SHIRT, hours: [8, 22], seats: true, greet: 'Điện máy XANH xin chào anh chị!' },
  kerb: [1.15, 2.0, 2.85], draw, fit, front, people, paint,
};
