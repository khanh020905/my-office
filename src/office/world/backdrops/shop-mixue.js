// Mixue (Mixue Ice Cream & Tea), as its shops look in Vietnam in 2026: a red front (about #E50914) with "MIXUE" in white
// letters lit from inside and standing off the board on black sides, "Since 1997" and "Ice Cream & Tea" beside it, the
// Snow King holding a cone; a round snowman light box out on a bracket; the "I LOVE YOU ♥ YOU LOVE ME" sign; an order
// counter facing the street with the soft-serve machine on it, the tea brewers and the cup sealer behind, the menu's light
// boxes across the back wall (the prices of the Đà Nẵng AEON store's June 2026 menu: the 10.000đ cone, the 25.000đ
// sundae and milk tea…), white tables and low brown stools; staff in black T-shirts; open 9:00–22:00; the Snow King's
// statue by the door, and on weekend evenings the Snow King himself dancing out front to the tune. None of it is the
// chain's artwork: the lettering is set in the office's font, the Snow King (a snowman, his crown, his red cape, his
// ice-cream sceptre) is drawn and modelled here, and the tune is "Oh! Susanna" (Stephen Foster, 1848), the melody the
// chain's song is sung to (audio/sfx.js). shops.js places it: its regions of a shop's canvas cell (RM), the printing
// (drawMixue), the fittings (fitMixue), the statue and the dancer (snowKing, snowDancer).
import * as THREE from 'three';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';

export const RED = '#E50914';
const FONT = '"Be Vietnam Pro", system-ui, sans-serif', GOLD = '#F6C343', SNOW = '#FBFBF8';
const FL = 0.12, CEIL = 2.75;   // (shops.js: the floor, level with the pavement, and the ceiling)

/* ---------- the printing: where each thing is in the shop's 1024 × 512 cell ---------- */
export const RM = { sign: [0, 0, 1024, 140], menu: [0, 140, 1024, 180], panel: [0, 320, 560, 110], slogan: [0, 430, 560, 82],
  posterA: [560, 320, 150, 192], posterB: [710, 320, 150, 192], blade: [860, 320, 164, 164], hours: [860, 484, 164, 28] };

// The Snow King, drawn: his head (s: its radius), crown, blue eyes, pink cheeks, red cape, and the cone he holds up
function king(g, cx, cy, s, outline = false) {
  const blob = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); if (outline && c === SNOW) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = Math.max(1, s * 0.05); g.stroke(); } };
  blob(cx, cy + s * 1.5, s * 1.08, s * 0.92, RED);              // the cape
  blob(cx, cy + s * 1.62, s * 0.8, s * 0.74, SNOW);              // the body
  blob(cx, cy, s, s, SNOW);                                      // the head
  g.fillStyle = RED; g.beginPath(); g.ellipse(cx, cy + s * 0.92, s * 0.62, s * 0.16, 0, 0, Math.PI * 2); g.fill();   // the collar
  const cw = s * 0.95, top = cy - s * 0.78;                     // the crown
  g.fillStyle = GOLD; g.beginPath(); g.moveTo(cx - cw / 2, top); g.lineTo(cx - cw / 2, top - s * 0.46); g.lineTo(cx - cw / 4, top - s * 0.2);
  g.lineTo(cx, top - s * 0.58); g.lineTo(cx + cw / 4, top - s * 0.2); g.lineTo(cx + cw / 2, top - s * 0.46); g.lineTo(cx + cw / 2, top); g.closePath(); g.fill();
  blob(cx, top - s * 0.13, s * 0.09, s * 0.09, RED);
  for (const sx of [-1, 1]) { blob(cx + sx * s * 0.33, cy - s * 0.04, s * 0.11, s * 0.15, '#2B6CD8'); blob(cx + sx * s * 0.33 + s * 0.03, cy - s * 0.09, s * 0.035, s * 0.045, '#FFFFFF'); blob(cx + sx * s * 0.58, cy + s * 0.26, s * 0.14, s * 0.09, '#F7A1B5'); }
  g.strokeStyle = '#C8102E'; g.lineWidth = Math.max(1.5, s * 0.08); g.beginPath(); g.arc(cx, cy + s * 0.18, s * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  const hx = cx + s * 1.12, hy = cy + s * 0.78;                 // the cone, held up
  g.fillStyle = '#F2B33D'; g.beginPath(); g.moveTo(hx - s * 0.24, hy); g.lineTo(hx + s * 0.24, hy); g.lineTo(hx, hy + s * 0.72); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,90,20,.5)'; g.lineWidth = Math.max(1, s * 0.04); for (const k of [0.25, 0.5]) { g.beginPath(); g.moveTo(hx - s * 0.24 * (1 - k), hy + s * 0.72 * k); g.lineTo(hx + s * 0.24 * (1 - k), hy + s * 0.72 * k); g.stroke(); }
  blob(hx, hy - s * 0.06, s * 0.27, s * 0.16, SNOW); blob(hx, hy - s * 0.24, s * 0.19, s * 0.13, SNOW); blob(hx, hy - s * 0.38, s * 0.1, s * 0.08, SNOW);
  blob(hx - s * 0.16, hy + s * 0.2, s * 0.15, s * 0.15, SNOW);   // his mitten
}
// what's on the menu, drawn: a cone, a sundae, or a clear cup of the drink (pearls at the bottom of the milk teas)
function cone(g, x, y, s) {
  g.fillStyle = '#F2B33D'; g.beginPath(); g.moveTo(x - s * 0.3, y); g.lineTo(x + s * 0.3, y); g.lineTo(x, y + s); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,90,20,.45)'; g.lineWidth = 1.5; for (const k of [0.3, 0.6]) { g.beginPath(); g.moveTo(x - s * 0.3 * (1 - k), y + s * k); g.lineTo(x + s * 0.3 * (1 - k), y + s * k); g.stroke(); }
  g.fillStyle = '#FFFDF6'; g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5;
  for (const [dy, r] of [[-0.06, 0.34], [-0.3, 0.25], [-0.5, 0.15]]) { g.beginPath(); g.ellipse(x, y + s * dy, s * r, s * r * 0.62, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
}
function cup(g, x, y, s, drink, { pearls = false, sundae = false, top = null } = {}) {   // x: the middle, y: the rim; s: the height
  const w0 = s * 0.36, w1 = s * 0.27;
  const side = () => { g.beginPath(); g.moveTo(x - w0, y); g.lineTo(x + w0, y); g.lineTo(x + w1, y + s); g.lineTo(x - w1, y + s); g.closePath(); };
  g.fillStyle = 'rgba(225,235,242,.9)'; side(); g.fill();
  g.save(); side(); g.clip(); g.fillStyle = drink; g.fillRect(x - w0, y + s * (sundae ? 0.1 : 0.14), w0 * 2, s);
  if (top) { g.fillStyle = top; g.fillRect(x - w0, y + s * 0.1, w0 * 2, s * 0.16); }
  if (pearls) { g.fillStyle = '#3B2414'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x - w1 + 5 + (k % 5) * ((w1 * 2 - 10) / 4), y + s * (0.9 - Math.floor(k / 5) * 0.09), s * 0.045, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = RED; g.fillRect(x - w0, y + s * 0.42, w0 * 2, s * 0.2);                                      // the sleeve
  king(g, x, y + s * 0.5, s * 0.055);
  g.restore();
  g.strokeStyle = 'rgba(80,100,120,.4)'; g.lineWidth = 1.5; side(); g.stroke();
  if (sundae) { g.fillStyle = '#FFFDF6'; g.beginPath(); g.ellipse(x, y + s * 0.02, w0 * 0.9, s * 0.16, 0, Math.PI, 0); g.fill(); g.fillStyle = drink; g.beginPath(); g.ellipse(x, y - s * 0.02, w0 * 0.55, s * 0.07, 0, 0, Math.PI * 2); g.fill(); return; }
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x - w0 - 1, y - 2, w0 * 2 + 2, 4);                       // the sealed film
  g.fillStyle = '#F4F4F4'; g.fillRect(x + w0 * 0.25, y - s * 0.32, s * 0.06, s * 0.36);                       // the straw
}
const vnd = (k) => `${(k * 1000).toLocaleString('vi-VN')}đ`;
// the menu's light boxes, left to right (June 2026 prices, đồng in thousands)
const MENU = [
  ['Kem ốc quế', 10, 'cone'], ['Super Sundae dâu tây', 25, 'sundae', '#E2475E'], ['Nước chanh tươi lạnh', 15, 'cup', '#F3E58A'],
  ['Trà chanh lô hội', 17, 'cup', '#E9E3A8'], ['Trà đào bốn mùa', 22, 'cup', '#F3A65C'], ['Trà sữa trân châu', 25, 'cup', '#CFA57C', true],
  ['Trà sữa bá vương', 30, 'cup', '#B98A5E', true], ['Dương chi cam lộ', 30, 'cup', '#F6C76E', false, '#F48A3C'],
];
function wrap(g, text, x, y, w, lh) {
  const lines = [];
  for (const wd of text.split(' ')) { const l = lines.length ? `${lines[lines.length - 1]} ${wd}` : wd; if (lines.length && g.measureText(l).width <= w) lines[lines.length - 1] = l; else lines.push(wd); }
  lines.slice(0, 2).forEach((l, k) => g.fillText(l, x, y + k * lh, w));
}
/** Paints the shop's cell (cx, cy: its corner in the canvas); dark: closed, the sign's light off. */
export function drawMixue(g, cx, cy, dark) {
  const at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
  // the sign: the red board, the Snow King, MIXUE on its black returns, Ice Cream & Tea, Since 1997
  { const [x, y, w, h] = at(RM.sign);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = RED; g.fillRect(x, y, w, h);
    king(g, x + 110, y + 44, 30);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 100px ${FONT}`;
    const tx = x + w * 0.5, ty = y + h * 0.54;
    g.fillStyle = '#141414'; for (let k = 1; k <= 6; k++) g.fillText('MIXUE', tx + k * 0.9, ty + k * 0.9, w * 0.5);
    g.fillStyle = '#FFFFFF'; g.fillText('MIXUE', tx, ty, w * 0.5);
    g.textAlign = 'left'; g.font = `900 30px ${FONT}`; g.fillText('ICE CREAM', x + w * 0.775, y + h * 0.33); g.fillText('& TEA', x + w * 0.775, y + h * 0.58);
    g.font = `italic 600 21px ${FONT}`; g.fillText('Since 1997', x + w * 0.775, y + h * 0.83);
    if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }
    g.restore(); }
  // the menu's light boxes: a picture, the name, the price
  { const [x, y, w, h] = at(RM.menu), tw = w / MENU.length;
    g.fillStyle = '#1A1A1A'; g.fillRect(x, y, w, h);
    MENU.forEach(([name, price, kind, drink, pearls, top], k) => {
      const bx = x + k * tw + 3, bw = tw - 6, mx = bx + bw / 2;
      g.fillStyle = '#FFFFFF'; g.fillRect(bx, y + 3, bw, h - 6);
      g.fillStyle = '#FFE9EA'; g.fillRect(bx, y + 3, bw, h * 0.52);
      if (kind === 'cone') cone(g, mx, y + h * 0.2, h * 0.32);
      else cup(g, mx, y + h * 0.13, h * 0.38, drink, { pearls, sundae: kind === 'sundae', top });
      g.fillStyle = '#1C1F24'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 15px ${FONT}`;
      wrap(g, name, mx, y + h * 0.63, bw - 8, 17);
      g.fillStyle = RED; g.font = `900 21px ${FONT}`; g.fillText(vnd(price), mx, y + h * 0.88, bw - 6);
    }); }
  // the counter's front: red, the Snow King at both ends, MIXUE and ICE CREAM & TEA on a white band
  { const [x, y, w, h] = at(RM.panel);
    g.fillStyle = RED; g.fillRect(x, y, w, h);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + w * 0.2, y + h * 0.18, w * 0.6, h * 0.64, h * 0.32); g.fill();
    g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 44px ${FONT}`; g.fillText('MIXUE', x + w / 2, y + h * 0.43, w * 0.5);
    g.font = `800 15px ${FONT}`; g.fillText('ICE CREAM & TEA', x + w / 2, y + h * 0.7, w * 0.5);
    king(g, x + w * 0.09, y + h * 0.32, h * 0.17); king(g, x + w * 0.89, y + h * 0.32, h * 0.17); }
  // "I LOVE YOU ♥ YOU LOVE ME": lit letters on the wall (nothing round them: the wall shows through)
  { const [x, y, w, h] = at(RM.slogan);
    g.clearRect(x, y, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 40px ${FONT}`;
    g.shadowColor = 'rgba(255,90,120,.9)'; g.shadowBlur = 10; g.fillStyle = '#FFFFFF'; g.fillText('I LOVE YOU      YOU LOVE ME', x + w / 2, y + h / 2, w - 20);
    g.fillStyle = '#FF3B5C'; g.fillText('♥', x + w / 2, y + h / 2); g.shadowBlur = 0; g.shadowColor = 'transparent'; }
  // the posters on the glass: the 10k cone, the sundae
  for (const [r, title, price, draw] of [[RM.posterA, 'KEM ỐC QUẾ', '10K', (px, py, s) => cone(g, px, py, s)], [RM.posterB, 'SUPER SUNDAE', '25K', (px, py, s) => cup(g, px, py, s, '#E2475E', { sundae: true })]]) {
    const [x, y, w, h] = at(r);
    g.fillStyle = '#FFFFFF'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = RED; g.fillRect(x + 6, y + 6, w - 12, 34);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 17px ${FONT}`; g.fillText(title, x + w / 2, y + 24, w - 20);
    g.fillStyle = '#FFE9EA'; g.beginPath(); g.arc(x + w / 2, y + h * 0.5, w * 0.34, 0, Math.PI * 2); g.fill();
    draw(x + w / 2, y + h * 0.36, h * 0.3);
    g.fillStyle = '#FFD400'; g.beginPath(); g.arc(x + w * 0.5, y + h * 0.83, 25, 0, Math.PI * 2); g.fill();
    g.fillStyle = RED; g.font = `900 22px ${FONT}`; g.fillText(price, x + w * 0.5, y + h * 0.83 + 1);
  }
  // the round light box on its bracket
  { const [x, y, w, h] = at(RM.blade), r = Math.min(w, h) / 2;
    g.clearRect(x, y, w, h);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = RED; g.beginPath(); g.arc(x + w / 2, y + h / 2, r * 0.88, 0, Math.PI * 2); g.fill();
    king(g, x + w / 2 - r * 0.12, y + h / 2 - r * 0.22, r * 0.3);
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(r * 0.26)}px ${FONT}`; g.fillText('MIXUE', x + w / 2, y + h / 2 + r * 0.62, r * 1.3);
    if (dark) { g.fillStyle = 'rgba(8,10,14,.55)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); g.fill(); } }
  // the opening hours, on the door
  { const [x, y, w, h] = at(RM.hours);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('MỞ CỬA 9:00 – 22:00', x + w / 2, y + h / 2 + 1, w - 10); }
}

/* ---------- the fittings, in the shop's own frame (as shops.js's fitOut: x along the front, z out to the street, the glass
   at z = 0; SW: the shop's width) ---------- */
export function fitMixue(D, r, low, SW) {
  const inner = [], glass = [], fix = [], spots = [], half = SW / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 12) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  // the floor (pale tiles), white walls with a red dado, the ceiling and its lights, the band over the glass
  for (let x = -half; x < half - 0.01; x += 0.6) for (let z = -D; z < -0.01; z += 0.6) {
    const w = Math.min(0.6, half - x), d = Math.min(0.6, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.6) + Math.round(-z / 0.6)) % 2 ? '#F1ECE7' : '#E8E1DA'));
  }
  b(SW, CEIL - FL, 0.06, 0, (CEIL - FL) / 2, -D + 0.03, '#FAFAF8');
  for (const s of [-1, 1]) { b(0.06, CEIL - FL, D, s * (half - 0.03), (CEIL - FL) / 2, -D / 2, '#FAFAF8'); b(0.02, 0.95, D - 0.1, s * (half - 0.065), 0.475, -D / 2, RED); }
  b(3.0, 0.95, 0.02, -1.8, 0.475, -D + 0.065, RED);
  b(SW, 0.04, D, 0, CEIL - FL - 0.04, -D / 2, '#FFFFFF');
  for (const x of [-2.2, 0, 2.2]) for (let z = -0.9; z > -D + 0.4; z -= 1.3) b(0.9, 0.02, 0.3, x, CEIL - FL - 0.07, z, '#FFFFFF');
  b(SW, CEIL - 2.42, 0.05, 0, (2.42 + CEIL) / 2 - FL, -0.05, '#FAFAF8');
  // the staff's side behind a wall on its left; the counter you order at, facing the street: its red front (printed), a
  // white top, the till, the soft-serve machine at its left end with the cones beside it
  b(0.08, CEIL - FL, D - 2.15, -0.3, (CEIL - FL) / 2, -(2.15 + D) / 2, '#FAFAF8'); b(0.1, 0.95, D - 2.15, -0.3, 0.475, -(2.15 + D) / 2, RED);
  block(-0.36, -0.24, -D, -2.15);
  b(3.5, 0.98, 0.6, 1.5, 0.49, -1.85, RED); b(3.56, 0.05, 0.66, 1.5, 1.0, -1.85, '#F7F5F2');
  b(0.36, 0.1, 0.3, 2.6, 1.08, -1.98, '#1E2125'); b(0.32, 0.22, 0.02, 2.6, 1.24, -2.06, '#2B3A55'); b(0.22, 0.15, 0.02, 2.6, 1.17, -1.72, '#2B3A55');   // the till: its screen, and the one facing you
  b(0.09, 0.13, 0.06, 2.95, 1.09, -1.7, '#1E2125');                                                                                                   // the card reader
  b(0.5, 0.6, 0.5, 0.25, 1.33, -1.95, '#EEF0F2'); b(0.5, 0.08, 0.5, 0.25, 1.67, -1.95, RED); b(0.2, 0.12, 0.02, 0.25, 1.45, -1.69, '#3A3F47');   // the soft-serve machine
  for (const x of [0.13, 0.25, 0.37]) { b(0.035, 0.08, 0.05, x, 1.08, -2.22, '#C9CED6'); b(0.02, 0.12, 0.02, x, 1.2, -2.24, '#9AA2AD'); }            // its taps and handles (the staff's side)
  for (let k = 0; k < 6; k++) inner.push(colorize(new THREE.ConeGeometry(0.035, 0.11, 8).rotateX(Math.PI).translate(0.68, FL + 1.06 + k * 0.025, -1.85), '#E9A93A'));   // the cones, stacked
  b(0.28, 0.2, 0.02, 1.55, 1.13, -1.6, '#FFFFFF');                                                                                                    // a menu stand
  block(-0.3, 3.3, -2.17, -1.53);
  // behind: the back counter (fridges under it), the tea brewers, the cup sealer, the shaker, the syrups and the cups; the menu over it
  b(3.5, 0.92, 0.6, 1.5, 0.46, -D + 0.33, '#C9CED6'); b(3.56, 0.05, 0.64, 1.5, 0.94, -D + 0.33, '#ECEAE6');
  for (let x = 0.0; x < 3.2; x += 0.7) b(0.02, 0.7, 0.01, x, 0.42, -D + 0.635, '#9AA2AD');
  for (const x of [2.55, 2.95]) { cyl(0.13, 0.13, 0.5, x, 1.21, -D + 0.33, '#B8C0C9', 14); cyl(0.135, 0.135, 0.03, x, 1.47, -D + 0.33, '#8E949C', 14); b(0.04, 0.05, 0.06, x, 1.02, -D + 0.48, '#3A3F47'); }
  b(0.32, 0.42, 0.34, 1.95, 1.17, -D + 0.33, '#3A3F47'); cyl(0.09, 0.09, 0.06, 1.95, 1.0, -D + 0.42, '#EEF0F2'); b(0.05, 0.12, 0.2, 1.95, 1.42, -D + 0.42, '#C9CED6');   // the cup sealer
  b(0.3, 0.32, 0.3, 1.45, 1.12, -D + 0.33, '#E8E8E8'); cyl(0.06, 0.06, 0.18, 1.45, 1.38, -D + 0.33, '#D9E6EE');                                       // the shaker
  b(0.36, 0.3, 0.26, 0.95, 1.11, -D + 0.3, '#F2F2F2');                                                                                                // the syrup machine
  for (let k = 0; k < 4; k++) cyl(0.045, 0.045, 0.32 + (k % 2) * 0.08, 0.15 + k * 0.12, 1.12, -D + 0.3, '#EEF3F7', 10);                               // stacks of cups
  for (const [x, c] of [[0.62, '#3B2414'], [0.74, '#F3E3B0'], [0.86, '#E2475E']]) cyl(0.05, 0.05, 0.12, x, 1.02, -D + 0.45, c, 10);                    // pearls, jelly, strawberry
  b(3.4, 0.03, 0.24, 1.5, 1.62, -D + 0.14, '#F2F3F4');
  for (let x = -0.05; x < 3.1; x += 0.13 * (low ? 2 : 1)) { const h = 0.16 + r() * 0.08; b(0.07, h, 0.07, x, 1.64 + h / 2, -D + 0.14, ['#E2475E', '#F3A65C', '#F6C76E', '#7FB24A', '#6B3A1E'][Math.floor(r() * 5)]); }
  b(3.5, 0.72, 0.06, 1.5, 2.12, -D + 0.04, '#1A1A1A');                                                                                                // the menu's frame (printed over)
  block(-0.3, 3.3, -D, -D + 0.66);
  // your side: a bar along the window with tall stools; a white table and two low brown stools by the wall
  const seats = [];
  b(2.3, 0.04, 0.38, -2.05, 1.0, -0.25, '#F7F5F2'); b(2.3, 0.98, 0.04, -2.05, 0.49, -0.07, RED);
  for (const x of [-2.75, -1.6]) {
    cyl(0.17, 0.17, 0.05, x, 0.72, -0.65, '#FFFFFF', 14); cyl(0.025, 0.025, 0.7, x, 0.36, -0.65, '#9AA2AD', 6); cyl(0.2, 0.2, 0.02, x, 0.01, -0.65, '#5E6670', 14);
    seats.push({ x, z: -0.65, top: 0.745, dir: [0, 1], put: [x, 1.02, -0.27] });
    block(x - 0.18, x + 0.18, -0.83, -0.47);
  }
  block(-3.25, -0.9, -0.45, 0);
  const tx = -1.85, tz = -2.45;
  cyl(0.36, 0.36, 0.04, tx, 0.68, tz, '#FFFFFF', 18); cyl(0.04, 0.05, 0.66, tx, 0.33, tz, '#C9CED6', 8); cyl(0.24, 0.24, 0.02, tx, 0.01, tz, '#C9CED6', 14);
  for (const s of [-1, 1]) {
    const sx = tx + s * 0.62;
    cyl(0.18, 0.16, 0.42, sx, 0.21, tz, '#8B5A3C', 14);
    seats.push({ x: sx, z: tz, top: 0.44, dir: [-s, 0], put: [tx + s * 0.16, 0.71, tz] });
    block(sx - 0.2, sx + 0.2, tz - 0.2, tz + 0.2);
  }
  block(tx - 0.38, tx + 0.38, tz - 0.38, tz + 0.38);
  // what you can do (walking in): order a cone or a milk tea at the counter (and pay there); sit at the window
  spots.push({ kind: 'pay', item: { id: 'cone', price: 10, carry: 'cone' }, x: 0.9, z: -1.15, face: Math.PI });
  spots.push({ kind: 'pay', item: { id: 'bubbleTea', price: 25, carry: 'cup' }, x: 2.3, z: -1.15, face: Math.PI });
  spots.push({ kind: 'seat', x: -2.15, z: -1.0, face: 0, seat: seats[1] });
  // where the staff stand: the till; the soft-serve, the sealer, the tea, the syrups (x, z, which way: 1 the street, -1 the back)
  return { inner, glass, fix, spots, seats, till: { x: 2.3, z: -1.15 }, cashier: { x: 2.6, z: -2.45 }, steam: [], aisle: [],
    stations: [[0.25, -2.5, 1], [1.95, -2.75, -1], [2.75, -2.75, -1], [0.95, -2.75, -1]] };
}

/* ---------- the Snow King: a snowman 1.3 m tall, his crown, his red cape and collar, his ice-cream sceptre ---------- */
function parts({ base = false, arms = true } = {}) {
  const list = [], up = base ? 0.1 : 0;
  const ball = (r, x, y, z, c, sy = 1, sz = 1) => list.push(colorize(new THREE.SphereGeometry(r, 14, 10).scale(1, sy, sz).translate(x, y + up, z), c));
  if (base) list.push(colorize(new THREE.CylinderGeometry(0.34, 0.36, 0.1, 18).translate(0, 0.05, 0), RED));
  ball(0.36, 0, 0.36, 0, SNOW, 0.94);                                                      // the body
  list.push(boxAt(0.6, 0.62, 0.06, 0, 0.47 + up, -0.31, RED));                             // the cape
  list.push(colorize(new THREE.TorusGeometry(0.22, 0.055, 8, 18).rotateX(Math.PI / 2).translate(0, 0.73 + up, 0), RED));   // the collar
  ball(0.3, 0, 0.99, 0, SNOW);                                                             // the head
  for (const s of [-1, 1]) { ball(0.048, s * 0.1, 1.03, 0.265, '#2B6CD8', 1.3, 0.5); ball(0.04, s * 0.17, 0.94, 0.25, '#F7A1B5', 0.7, 0.5); }
  list.push(boxAt(0.09, 0.02, 0.01, 0, 0.9 + up, 0.29, '#C8102E'));
  list.push(colorize(new THREE.CylinderGeometry(0.16, 0.15, 0.12, 16).translate(0, 1.3 + up, 0), GOLD));    // the crown
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; list.push(colorize(new THREE.ConeGeometry(0.035, 0.1, 6).translate(Math.sin(a) * 0.13, 1.41 + up, Math.cos(a) * 0.13), GOLD)); }
  ball(0.03, 0, 1.3, 0.155, RED);
  if (arms) list.push(...armParts(-1, up), ...armParts(1, up));
  return list;
}
// an arm from the shoulder: a white mitten; the right one holds the sceptre (a cone of soft-serve on a gold stick)
function armParts(s, up = 0, pivot = false) {
  const [ox, oy] = pivot ? [0, 0] : [s * 0.3, 0.62 + up], list = [];
  list.push(colorize(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 8).rotateZ(-s * 0.9).translate(ox + s * 0.1, oy - 0.07, 0.04), SNOW));
  list.push(colorize(new THREE.SphereGeometry(0.075, 10, 8).translate(ox + s * 0.2, oy - 0.14, 0.08), SNOW));
  if (s > 0) {
    list.push(colorize(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6).translate(ox + 0.2, oy + 0.08, 0.1), GOLD));
    list.push(colorize(new THREE.ConeGeometry(0.075, 0.18, 10).rotateX(Math.PI).translate(ox + 0.2, oy + 0.4, 0.1), '#F2B33D'));
    for (const [dy, rr] of [[0.5, 0.08], [0.57, 0.06], [0.62, 0.035]]) list.push(colorize(new THREE.SphereGeometry(rr, 10, 8).translate(ox + 0.2, oy + dy, 0.1), SNOW));
  }
  return list;
}
/** The statue by the door, on its round base: one geometry, feet at y 0, facing +z. */
export const snowKing = () => mergeAll(parts({ base: true }));
/** The Snow King himself (someone in the costume, 1.9 m tall): { root, update(t, on) }; root placed facing +z. */
export function snowDancer() {
  const m = vmat({ roughness: 0.75 }), root = new THREE.Group(), body = new THREE.Mesh(mergeAll(parts({ arms: false })), m);
  const arm = (s) => { const p = new THREE.Group(); p.position.set(s * 0.3, 0.62, 0); p.add(new THREE.Mesh(mergeAll(armParts(s, 0, true)), m)); return p; };
  const inner = new THREE.Group(), L = arm(-1), R = arm(1);
  inner.scale.setScalar(1.45); inner.add(body, L, R); root.add(inner);
  body.castShadow = true; root.visible = false;
  return {
    root,
    // a little dance: bouncing on the beat, swaying, the sceptre waved, a spin now and then
    update(t, on) {
      root.visible = on; if (!on) return;
      const beat = t * Math.PI * 2 * 1.1, spin = t % 16;
      inner.position.y = Math.abs(Math.sin(beat / 2)) * 0.09;
      inner.rotation.y = Math.sin(beat / 4) * 0.45 + (spin < 1.2 ? (spin / 1.2) * Math.PI * 2 : 0);
      inner.rotation.z = Math.sin(beat / 2) * 0.06;
      L.rotation.z = -0.4 - Math.max(0, Math.sin(beat / 2)) * 1.1; R.rotation.z = 0.5 + Math.max(0, Math.sin(beat / 2 + Math.PI)) * 1.3;
    },
  };
}
