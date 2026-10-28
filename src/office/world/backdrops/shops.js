// Shops near the office: the three street-facing ground floors nearest to it become shops, as in the city you picked
// for the weather. Convenience stores carry their real signs (the logos in public/assets/brands, from Wikimedia Commons:
// see the README there); Đà Nẵng and the other cities without those chains get WinMart+ and the town's own food. Each
// shop is a lit sign over a shop window you see the aisles through, scooters parked at the kerb. All the signs and
// windows are drawn into one canvas, so the shops cost two draw calls; the canvas is drawn again when the city changes.
import * as THREE from 'three';
import { HQ, PRO } from '../../core/env.js';
import { GY, boxAt, mergeAll, mergedTo, vmat } from '../terrace.js';
import { wx } from '../../life/weather.js';
import { parkedScooter } from './street-life.js';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const SHOP_W = 6.6, WIN_H = 2.3, SIGN_H_M = 0.9;   // metres: the shop window, and the sign above it
/* what each city has, front-most first (Oct 2026: GS25 and Circle K in Hanoi and Ho Chi Minh City, 7-Eleven almost only
   in Ho Chi Minh City; none of them confirmed in Đà Nẵng, where WinMart+ is) */
const SETS = {
  hcm: ['gs25', 'circlek', 'seven'], hn: ['circlek', 'gs25', 'winmart'], hp: ['winmart', 'banhdacua', 'circlek'],
  dn: ['winmart', 'miquang', 'haisan'], hue: ['winmart', 'bunbo', 'comhen'], nt: ['winmart', 'bunchaca', 'haisan'],
  dl: ['winmart', 'banhcan', 'suadau'], ct: ['winmart', 'hutieu', 'laumam'],
};
// the chains: logo file, the sign's stripes, the staff's shirt, the posters' colour
const CHAINS = {
  circlek: { name: 'Circle K', logo: 'circle-k.svg', crop: [0.946, 1], stripes: ['#E21F26', '#F39C1F'], accent: '#E21F26' },   // (crop: without the ™ beside it)
  gs25: { name: 'GS25', logo: 'gs25.svg', stripes: ['#0068B7', '#2BB8E6'], accent: '#0068B7' },
  seven: { name: '7-Eleven', logo: '7-eleven.svg', stripes: ['#F58220', '#008163', '#EE2526'], accent: '#008163' },
  winmart: { name: 'WinMart+', logo: 'winmart.png', crop: [0.92, 0.7], plus: true, stripes: ['#E21B2A'], accent: '#E21B2A' },   // (crop: without the slogan under it)
};
// local food: a painted signboard (no brand: the dish and the town), and what the shop front shows
const EATS = {
  miquang: { title: 'MÌ QUẢNG', sub: 'ĐẶC SẢN QUẢNG NAM – ĐÀ NẴNG', bg: '#B3121E', fg: '#FFD400', kind: 'noodle', menu: ['Mì Quảng gà', 'Mì Quảng tôm thịt', 'Mì Quảng cá lóc', 'Bánh tráng'] },
  haisan: { title: 'HẢI SẢN', sub: 'TƯƠI SỐNG MỖI NGÀY', bg: '#0B4F8A', fg: '#FFE45C', kind: 'seafood' },
  bunbo: { title: 'BÚN BÒ HUẾ', sub: 'GIÒ HEO – CHẢ CUA', bg: '#B3121E', fg: '#FFFFFF', kind: 'noodle', menu: ['Bún bò giò', 'Bún bò tái', 'Bún bò đặc biệt', 'Chả cua'] },
  comhen: { title: 'CƠM HẾN', sub: 'BÚN HẾN – HẾN XÚC BÁNH TRÁNG', bg: '#1F6F3B', fg: '#FFF2A8', kind: 'noodle', menu: ['Cơm hến', 'Bún hến', 'Hến xúc bánh tráng', 'Chè'] },
  bunchaca: { title: 'BÚN CHẢ CÁ', sub: 'ĐẶC SẢN NHA TRANG', bg: '#0B4F8A', fg: '#FFFFFF', kind: 'noodle', menu: ['Bún chả cá', 'Bún sứa', 'Bánh canh chả cá', 'Nem nướng'] },
  banhcan: { title: 'BÁNH CĂN', sub: 'ĐÀ LẠT', bg: '#7A3B12', fg: '#FFE7A8', kind: 'noodle', menu: ['Bánh căn trứng', 'Bánh căn mực', 'Bánh căn thập cẩm', 'Xíu mại'] },
  suadau: { title: 'SỮA ĐẬU NÀNH', sub: 'NÓNG – BÁNH NGỌT', bg: '#2F6B3A', fg: '#FFFFFF', kind: 'drink', menu: ['Sữa đậu nành', 'Sữa bắp', 'Sữa đậu xanh', 'Bánh bông lan'] },
  banhdacua: { title: 'BÁNH ĐA CUA', sub: 'ĐẶC SẢN HẢI PHÒNG', bg: '#A0281C', fg: '#FFE45C', kind: 'noodle', menu: ['Bánh đa cua', 'Bánh đa cua chả lá lốt', 'Bánh mì cay', 'Nem cua bể'] },
  hutieu: { title: 'HỦ TIẾU', sub: 'CÁI RĂNG – CẦN THƠ', bg: '#B3121E', fg: '#FFFFFF', kind: 'noodle', menu: ['Hủ tiếu nam vang', 'Hủ tiếu khô', 'Hủ tiếu bò kho', 'Bánh lọt'] },
  laumam: { title: 'LẨU MẮM', sub: 'MIỀN TÂY', bg: '#5C2E7E', fg: '#FFE45C', kind: 'noodle', menu: ['Lẩu mắm', 'Cá linh kho', 'Bông điên điển', 'Rau đồng'] },
};
const cityKey = () => (SETS[wx.city] ? wx.city : 'hcm');

// the office's middle on the floor plan (street-life.js weighs the traffic by it too)
export const officeMiddle = () => (HQ ? [3, 9] : PRO ? [3, 0.7] : [0, 0.2]);
/* ---------- drawing the signs and shop windows ---------- */
const CELL = 1024, SIGN_H = 140, FRONT_H = 372;   // per shop: a 1024 × 512 cell, sign on top, shop window below
const logos = {};
// A logo from public/assets/brands, or null until it has loaded (then `redraw` runs). An SVG with only a viewBox has no
// size of its own, and drawing part of it (the crop) then goes wrong in Chrome: it is given one (four times its viewBox).
export function brandImage(file, redraw) {
  if (logos[file]) return logos[file].complete && logos[file].naturalWidth ? logos[file] : null;
  const img = new Image(); img.decoding = 'async'; img.onload = redraw; logos[file] = img;
  const url = `${BASE}/assets/brands/${file}`;
  if (!file.endsWith('.svg')) { img.src = url; return null; }
  fetch(url).then((r) => r.text()).then((svg) => {
    const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number);
    if (vb && !/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace(/<svg\b/, `<svg width="${vb[2] * 4}" height="${vb[3] * 4}"`);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }).catch(() => {});
  return null;
}
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
function sign(g, x, y, w, h, key, redraw) {
  const ch = CHAINS[key];
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (ch) {   // a lightbox: white face, the logo in the middle, the chain's stripes along the bottom
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
    const sh = 22, n = ch.stripes.length;
    ch.stripes.forEach((c, k) => { g.fillStyle = c; g.fillRect(x, y + h - sh + (k * sh) / n, w, sh / n + 0.5); });
    const img = brandImage(ch.logo, redraw);
    if (img) {
      const [cw, chh] = ch.crop || [1, 1], sw = img.naturalWidth * cw, shh = img.naturalHeight * chh, boxH = h - sh - 22, scale = Math.min((w * 0.62) / sw, boxH / shh);
      const dw = sw * scale, dh = shh * scale, dx = x + (w - dw) / 2 - (ch.plus ? dh * 0.25 : 0), dy = y + 11 + (boxH - dh) / 2;
      g.drawImage(img, 0, 0, sw, shh, dx, dy, dw, dh);
      if (ch.plus) {   // WinMart+: the chain's sign is the WinMart wordmark with a plus
        const p = dh * 0.5, t = p * 0.3, px = dx + dw + p * 0.05, py = dy + dh * 0.22;
        g.fillStyle = '#E21B2A'; g.fillRect(px, py + (p - t) / 2, p, t); g.fillRect(px + (p - t) / 2, py, t, p);
      }
    }
  } else {    // a painted signboard: the dish in big letters, a line under it
    const e = EATS[key];
    g.fillStyle = e.bg; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = e.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(h * 0.46)}px ${FONT}`; g.fillText(e.title, x + w / 2, y + h * 0.42, w - 60);
    g.fillStyle = '#FFFFFF'; g.font = `700 ${Math.round(h * 0.15)}px ${FONT}`; g.fillText(e.sub, x + w / 2, y + h * 0.8, w - 80);
  }
  g.restore();
}
// shelves of goods: rows of packs in shop colours (drinks, noodles, snacks, milk, biscuits)
const PACKS = ['#E41E2B', '#1C4FA0', '#F7C600', '#E8742A', '#2E9E4A', '#7E3FA6', '#F2F2F2', '#0B7FC2', '#D62F6B', '#8C5A2B', '#FF9F1C', '#46B1E1'];
function shelves(g, x, y, w, h, r) {
  g.fillStyle = '#C9CED6'; g.fillRect(x, y, w, h);
  const rows = 4, rh = h / rows;
  for (let k = 0; k < rows; k++) {
    const sy = y + k * rh;
    g.fillStyle = '#9AA2AD'; g.fillRect(x, sy + rh - 5, w, 5);
    for (let px = x + 3; px < x + w - 8;) {
      const pw = 7 + r() * 10, ph = rh * (0.45 + r() * 0.4), c = PACKS[Math.floor(r() * PACKS.length)];
      const n = 1 + Math.floor(r() * 3);   // a few of the same side by side
      for (let i = 0; i < n && px < x + w - 8; i++) { g.fillStyle = c; g.fillRect(px, sy + rh - 5 - ph, pw, ph); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(px + 1, sy + rh - 5 - ph + 2, pw - 2, 3); px += pw + 1.5; }
      px += 2;
    }
  }
}
function fridge(g, x, y, w, h, r, doors = 3) {
  g.fillStyle = '#E9EEF2'; g.fillRect(x, y, w, h);
  const dw = w / doors;
  for (let d = 0; d < doors; d++) {
    const dx = x + d * dw + 3;
    g.fillStyle = '#EAF6FF'; g.fillRect(dx, y + 4, dw - 6, h - 8);
    for (let k = 0; k < 5; k++) {
      const ry = y + 10 + k * ((h - 18) / 5);
      for (let bx = dx + 3; bx < dx + dw - 10; bx += 7) { g.fillStyle = PACKS[Math.floor(r() * 8)]; g.fillRect(bx, ry + 4, 5, (h - 18) / 5 - 8); }
    }
    g.strokeStyle = '#7C8794'; g.lineWidth = 2; g.strokeRect(dx, y + 4, dw - 6, h - 8);
  }
}
function storeWindow(g, x, y, w, h, key) {
  const ch = CHAINS[key], r = rnd(key.length * 7919 + 13);
  g.fillStyle = '#F5F7F9'; g.fillRect(x, y, w, h);                                   // inside: bright, white light
  g.fillStyle = '#DADFE5'; g.fillRect(x, y + h * 0.86, w, h * 0.14);                 // floor
  fridge(g, x + w * 0.7, y + h * 0.12, w * 0.29, h * 0.74, r, 3);                    // drinks along the back
  shelves(g, x + w * 0.27, y + h * 0.3, w * 0.4, h * 0.56, r);                       // an aisle
  g.fillStyle = '#3A3F47'; g.fillRect(x + w * 0.03, y + h * 0.58, w * 0.2, h * 0.28); // the counter
  g.fillStyle = '#1C1F24'; g.fillRect(x + w * 0.06, y + h * 0.46, w * 0.06, h * 0.1);
  g.fillStyle = ch.accent; g.fillRect(x + w * 0.14, y + h * 0.4, w * 0.05, h * 0.2); // the cashier, in the chain's colour
  g.fillStyle = '#EDC4A2'; g.beginPath(); g.arc(x + w * 0.165, y + h * 0.36, h * 0.05, 0, Math.PI * 2); g.fill();
  // the glass: frames, the door, a soft reflection, the posters on it
  g.fillStyle = 'rgba(160,190,210,.18)'; g.fillRect(x, y, w, h);
  g.fillStyle = '#5E6670';
  for (let k = 0; k <= 6; k++) g.fillRect(x + (k * w) / 6 - 3, y, 6, h);
  g.fillRect(x, y, w, 7); g.fillRect(x, y + h - 14, w, 14);
  g.fillRect(x + w * 0.42, y + h * 0.05, 4, h * 0.95); g.fillRect(x + w * 0.58, y + h * 0.05, 4, h * 0.95);
  g.fillStyle = '#C9CED6'; g.fillRect(x + w * 0.49, y + h * 0.5, 4, h * 0.16); g.fillRect(x + w * 0.51, y + h * 0.5, 4, h * 0.16);
  g.save(); g.globalAlpha = 0.13; g.fillStyle = '#FFFFFF';
  for (const [a, b] of [[0.08, 0.14], [0.6, 0.64], [0.78, 0.8]]) { g.beginPath(); g.moveTo(x + w * a, y + h); g.lineTo(x + w * (a + 0.12), y); g.lineTo(x + w * (b + 0.12), y); g.lineTo(x + w * b, y + h); g.fill(); }
  g.restore();
  g.fillStyle = ch.accent; g.fillRect(x + w * 0.2, y + h * 0.18, w * 0.13, h * 0.3);
  g.fillStyle = '#FFFFFF'; g.font = `800 ${Math.round(h * 0.075)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('MUA 1', x + w * 0.265, y + h * 0.27); g.fillText('TẶNG 1', x + w * 0.265, y + h * 0.37);
  g.fillStyle = '#1C1F24'; g.fillRect(x + w * 0.45, y + h * 0.16, w * 0.1, h * 0.09);
  g.fillStyle = '#3DDC84'; g.font = `800 ${Math.round(h * 0.06)}px ${FONT}`; g.fillText('OPEN 24/7', x + w * 0.5, y + h * 0.205);
}
// someone on a low stool at a table, seen from the street: a head, a shirt, sometimes a bowl lifted
function diner(g, x, y, h, shirt, r) {
  g.fillStyle = shirt; g.beginPath(); g.roundRect(x - h * 0.05, y - h * 0.2, h * 0.1, h * 0.17, 6); g.fill();
  g.fillStyle = '#EDC4A2'; g.beginPath(); g.arc(x, y - h * 0.25, h * 0.045, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2B2420'; g.beginPath(); g.arc(x, y - h * 0.265, h * 0.046, Math.PI, Math.PI * 2); g.fill();
  if (r() < 0.6) { g.fillStyle = '#F2F2F2'; g.beginPath(); g.ellipse(x + h * 0.05, y - h * 0.15, h * 0.035, h * 0.018, 0, 0, Math.PI * 2); g.fill(); }
}
function eateryFront(g, x, y, w, h, key) {
  const e = EATS[key], r = rnd(key.length * 4271 + 7);
  g.fillStyle = '#F3E3C4'; g.fillRect(x, y, w, h);                                   // warm light, open to the street
  g.fillStyle = '#F6F4EE'; g.fillRect(x, y + h * 0.42, w, h * 0.42);                 // white tiles up to the waist
  g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1;
  for (let ty = y + h * 0.42; ty < y + h * 0.84; ty += 14) { g.beginPath(); g.moveTo(x, ty); g.lineTo(x + w, ty); g.stroke(); }
  for (let tx = x; tx < x + w; tx += 14) { g.beginPath(); g.moveTo(tx, y + h * 0.42); g.lineTo(tx, y + h * 0.84); g.stroke(); }
  g.fillStyle = '#B9A88C'; g.fillRect(x, y + h * 0.84, w, h * 0.16);                 // the floor
  g.fillStyle = '#6E7681'; g.fillRect(x, y, w, h * 0.08);                            // the rolled-up shutter
  for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + k * h * 0.016, w, 2); }
  for (const fx of [0.3, 0.7]) { g.fillStyle = '#FFFFFF'; g.fillRect(x + w * fx - 50, y + h * 0.11, 100, 6); }   // tube lights
  g.fillStyle = '#5E6670'; g.fillRect(x + w * 0.5 - 2, y + h * 0.08, 4, h * 0.07);                                    // a ceiling fan
  g.beginPath(); g.ellipse(x + w * 0.5, y + h * 0.155, 58, 6, 0, 0, Math.PI * 2); g.fill();
  const tables = e.kind === 'seafood' ? [0.62, 0.76] : [0.4, 0.58, 0.76];
  if (e.kind === 'seafood') {   // tanks of crab, prawns and fish
    for (let t = 0; t < 3; t++) {
      const tx = x + w * (0.03 + t * 0.19), ty = y + h * 0.3, tw = w * 0.17, th = h * 0.42;
      g.fillStyle = '#5FB6E6'; g.fillRect(tx, ty, tw, th); g.fillStyle = '#9FD8F5'; g.fillRect(tx, ty, tw, th * 0.15);
      for (let k = 0; k < 7; k++) { g.fillStyle = ['#D9532B', '#E8742A', '#7A8AA0', '#C23B22'][k % 4]; g.beginPath(); g.ellipse(tx + 8 + r() * (tw - 16), ty + th * (0.3 + r() * 0.6), 9, 6, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#3A3F47'; g.lineWidth = 4; g.strokeRect(tx, ty, tw, th);
      g.fillStyle = '#3A3F47'; g.fillRect(tx, ty + th, tw, h * 0.12);
    }
  } else {   // the cook at the pot, the menu on the back wall
    g.fillStyle = '#9AA2AD'; g.fillRect(x + w * 0.03, y + h * 0.52, w * 0.24, h * 0.32);
    g.fillStyle = '#C9CED6'; g.beginPath(); g.ellipse(x + w * 0.09, y + h * 0.5, w * 0.045, h * 0.045, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + w * (0.085 + k * 0.012), y + h * (0.38 - k * 0.07), h * 0.032, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(x + w * 0.17, y + h * 0.34, w * 0.05, h * 0.18, 6); g.fill();   // the cook, in white
    g.fillStyle = '#EDC4A2'; g.beginPath(); g.arc(x + w * 0.195, y + h * 0.3, h * 0.045, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2B2F36'; g.fillRect(x + w * 0.3, y + h * 0.17, w * 0.28, h * 0.22);
    g.fillStyle = '#FFE7A8'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(h * 0.045)}px ${FONT}`;
    (e.menu || []).forEach((m, k) => g.fillText(m, x + w * 0.315, y + h * (0.205 + k * 0.05), w * 0.25));
  }
  // a drinks fridge at the back on the right
  g.fillStyle = '#E9EEF2'; g.fillRect(x + w * 0.9, y + h * 0.3, w * 0.08, h * 0.54);
  for (let k = 0; k < 5; k++) for (let bx = 0; bx < 4; bx++) { g.fillStyle = PACKS[(k * 4 + bx) % 8]; g.fillRect(x + w * 0.905 + bx * 17, y + h * (0.33 + k * 0.1), 12, h * 0.07); }
  // tables, the low plastic stools, and the people eating
  const SHIRTS = ['#3F7CC4', '#D64550', '#F2F2F2', '#2A9D8F', '#E8742A', '#5B6CD8', '#3B3B3B'];
  for (const t of tables) {
    const tx = x + w * t;
    g.fillStyle = '#C9CED6'; g.fillRect(tx, y + h * 0.66, w * 0.12, h * 0.035); g.fillRect(tx + w * 0.055, y + h * 0.69, 5, h * 0.15);
    g.fillStyle = '#E9E2D2'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(tx + w * (0.02 + k * 0.04), y + h * 0.655, 12, 5, 0, 0, Math.PI * 2); g.fill(); }
    for (const [sx, who] of [[-0.03, r() < 0.8], [0.13, r() < 0.6]]) {
      g.fillStyle = r() < 0.5 ? '#D62F2F' : '#2E6FD1'; g.fillRect(tx + w * sx, y + h * 0.75, w * 0.035, h * 0.09);
      if (who) diner(g, tx + w * (sx + 0.0175), y + h * 0.76, h, SHIRTS[Math.floor(r() * SHIRTS.length)], r);
    }
  }
}

/* ---------- the shops ----------
   fronts: ground floors facing a street, nearest the office first: { dir: 'px' | 'pz', x, z } on the facade, which
   faces +x or +z (the sides the camera sees). Each one used is marked `store`, so the city leaves its plain shop out. */
export function buildShops(G, fronts) {
  const canvas = document.createElement('canvas'); canvas.width = CELL * 2; canvas.height = 1024;
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  let city = null;
  function draw() {
    const set = SETS[city];
    g.clearRect(0, 0, canvas.width, canvas.height);
    fronts.forEach((_, n) => {
      const cx = (n % 2) * CELL, cy = Math.floor(n / 2) * 512, key = set[n];
      sign(g, cx, cy, CELL, SIGN_H, key, draw);
      if (CHAINS[key]) storeWindow(g, cx, cy + SIGN_H, CELL, FRONT_H, key); else eateryFront(g, cx, cy + SIGN_H, CELL, FRONT_H, key);
    });
    tex.needsUpdate = true;
  }
  // a plane showing its cell's part of the canvas
  const uvPlane = (w, h, n, part) => {
    const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv, cx = (n % 2) * CELL, cy = Math.floor(n / 2) * 512;
    const [y0, y1] = part === 'sign' ? [cy, cy + SIGN_H] : [cy + SIGN_H, cy + SIGN_H + FRONT_H];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * CELL) / canvas.width, 1 - (y1 - uv.getY(i) * (y1 - y0)) / canvas.height);
    return p;
  };
  const faces = [], body = [], m4 = new THREE.Matrix4();
  fronts.forEach((f, n) => {
    f.store = true;
    // the shop's own frame: the facade at z = 0, the street towards +z, the pavement's kerb at z = 1.3
    m4.makeRotationY(f.dir === 'px' ? Math.PI / 2 : 0).setPosition(f.x, GY, f.z);
    const put = (geo, list) => list.push(geo.applyMatrix4(m4));
    put(boxAt(SHOP_W + 0.3, WIN_H + 0.12, 0.08, 0, 0.12 + WIN_H / 2, 0.03, '#5E6670'), body);                      // the shop-front frame
    put(boxAt(SHOP_W + 0.3, SIGN_H_M + 0.1, 0.18, 0, 0.12 + WIN_H + SIGN_H_M / 2 + 0.02, 0.09, '#D8DCE1'), body);   // the lightbox
    put(uvPlane(SHOP_W, WIN_H, n, 'front').translate(0, 0.12 + WIN_H / 2, 0.075), faces);
    put(uvPlane(SHOP_W + 0.2, SIGN_H_M, n, 'sign').translate(0, 0.12 + WIN_H + SIGN_H_M / 2 + 0.02, 0.185), faces);
    // scooters parked along the kerb, a little askew
    ['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B'].slice(0, 3 + (n % 2)).forEach((c, k) => {
      put(parkedScooter(c).rotateY(0.18 * (k % 2 ? 1 : -1)).translate(-2.6 + k * 0.85, 0.12, 1.0), body);
    });
  });
  if (!fronts.length) return { update() {}, night() {}, doors: () => [] };
  mergedTo(G, body, vmat({ roughness: 0.6 }));
  const faceM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0.06, roughness: 0.45 });
  const faceMesh = new THREE.Mesh(mergeAll(faces), faceM); faceMesh.receiveShadow = true; G.add(faceMesh);
  document.fonts?.ready.then(() => { if (city) draw(); });   // the signboards' lettering, once the font is in
  return {
    update() { const k = cityKey(); if (k !== city) { city = k; draw(); } },
    night(on) { faceM.emissiveIntensity = on ? 0.55 : 0.06; },   // (brighter, and the bloom blurs the logos)
    // the convenience stores among them (for the city picked now): where to stand on the pavement at the door, facing it
    doors: () => fronts.flatMap((f, n) => {
      const ch = CHAINS[SETS[cityKey()][n]];
      if (!ch) return [];
      const px = f.dir === 'px', x = px ? f.x + 0.45 : f.x, z = px ? f.z : f.z + 0.45;
      return [{ name: ch.name, accent: ch.accent, x, z, face: px ? -Math.PI / 2 : Math.PI }];
    }),
  };
}
