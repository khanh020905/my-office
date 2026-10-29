// Shops near the office: the long street fronts nearest to it (one to a building) become shops, as in the city you picked
// for the weather. The convenience stores are real rooms cut into their building's ground floor that you can walk into:
// a glass front with an automatic door, two aisles, drinks fridges along the back, the till, and each chain's own corner
// (Circle K's sausage grill and cup noodles, GS25's tokbokki tray, fish cakes and ramyeon machines, 7-Eleven's bánh bao
// steamer and onigiri chiller, Ministop's fried chicken and soft-serve, WinMart+'s and Bách Hóa Xanh's vegetables and
// meat), staff in the chain's colour, and who each one draws at its hours: students with laptops at Circle K's window
// counter at night, Gen Z over tokbokki at GS25, office lunch at 7-Eleven with a courier waiting outside, a child with an
// ice cream at Ministop, an auntie with her shopping at WinMart+ after work. Real opening hours: the 24-hour chains stay
// lit all night, WinMart+ and Bách Hóa Xanh roll their shutters down at closing time. The signs carry the chains' real
// logos (public/assets/brands, from Wikimedia Commons: see the README there); the town's own eateries are painted fronts.
// All the printing (signs, posters, menus, the QR stand) is one canvas; the shops cost a handful of merged meshes, and
// their people are street-folk.js figures, stepped only when in view. Rebuilt when the city changes.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { HQ, PRO, el, officeNow } from '../../core/env.js';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { wx } from '../../life/weather.js';
import { quality } from '../../scene/quality.js';
import { sfx } from '../../audio/sfx.js';
import { parkedScooter } from './street-life.js';
import { folk, stepper } from './street-folk.js';
import { puffs } from './street-corner.js';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const SHOPS = 6, SHOP_W = 6.6, SHOP_CEIL = 2.75;   // how many, a shop's width and its ceiling (metres)
export const shopDepth = (deep) => Math.min(5.0, deep - 1.4);   // how far in a shop goes, in a building `deep` deep
const FL = 0.12, GLASS = 2.42, SIGN_H_M = 0.9, DOOR = 0.82;      // the floor (level with the pavement), the glass's top, the sign, half the door
/* what each city has, front-most first (Oct 2026: GS25, Circle K, 7-Eleven and Ministop in Ho Chi Minh City; Circle K, GS25
   and WinMart+ in Hanoi; WinMart+ everywhere; Bách Hóa Xanh in the south; none of the foreign chains confirmed in Đà Nẵng).
   'rent': a shuttered front to let. */
const SETS = {
  hcm: ['gs25', 'circlek', 'seven', 'ministop', 'winmart', 'bhx'], hn: ['circlek', 'gs25', 'winmart', 'pho', 'circlek', 'buncha'],
  hp: ['winmart', 'banhdacua', 'circlek', 'rent', 'winmart', 'haisan'], dn: ['winmart', 'miquang', 'haisan', 'rent', 'winmart', 'banhxeo'],
  hue: ['winmart', 'bunbo', 'comhen', 'rent', 'winmart', 'banhxeo'], nt: ['winmart', 'bunchaca', 'haisan', 'rent', 'winmart', 'banhxeo'],
  dl: ['winmart', 'banhcan', 'suadau', 'rent', 'winmart', 'banhxeo'], ct: ['bhx', 'winmart', 'hutieu', 'laumam', 'rent', 'bhx'],
};
/* the chains: logo, the sign (face, stripes), the staff's shirt, opening hours (null: day and night), a window counter to
   sit at, and the three things you can take: from the fridges, from the chain's own corner (`side`), at the till (`hot`).
   Prices in thousands of đồng, about what they are. */
const CHAINS = {
  circlek: { name: 'Circle K', logo: 'circle-k.svg', crop: [0.946, 1], stripes: ['#E21F26', '#F39C1F'], accent: '#E21F26', shirt: '#D7262E', hours: null, seats: true,
    fridge: { id: 'peachTea', price: 20, carry: 'cup' }, side: { id: 'noodle', price: 12, carry: 'noodle', unit: 'noodles' }, hot: { id: 'sausage', price: 15, carry: 'cup', unit: 'grill' } },
  gs25: { name: 'GS25', logo: 'gs25.svg', stripes: ['#0068B7', '#2BB8E6'], accent: '#0068B7', shirt: '#1F5FA8', hours: null, seats: true, outdoor: true,
    fridge: { id: 'bananaMilk', price: 28, carry: 'cup' }, side: { id: 'ramyeon', price: 29, carry: 'noodle', unit: 'ramyeon' }, hot: { id: 'tok', price: 35, carry: 'tok', unit: 'tok' } },
  seven: { name: '7-Eleven', logo: '7-eleven.svg', stripes: ['#F58220', '#008163', '#EE2526'], accent: '#008163', shirt: '#0E7A5C', hours: null, seats: true,
    fridge: { id: 'coffee', price: 20, carry: 'cup' }, side: { id: 'onigiri', price: 17, carry: 'onigiri', unit: 'chiller' }, hot: { id: 'bun', price: 19, carry: 'bun', unit: 'steamer' } },
  ministop: { name: 'Ministop', logo: 'ministop.svg', stripes: ['#003894', '#FFD200', '#E60012'], accent: '#003894', shirt: '#1E3F8F', hours: null, seats: true,
    fridge: { id: 'water', price: 8, carry: 'cup' }, side: { id: 'cone', price: 10, carry: 'cone', unit: 'softserve' }, hot: { id: 'chicken', price: 25, carry: 'chicken', unit: 'fryer' } },
  winmart: { name: 'WinMart+', logo: 'winmart.png', crop: [0.92, 0.7], plus: true, stripes: ['#E21B2A'], accent: '#E21B2A', shirt: '#D21F2C', hours: [6, 22], seats: false,
    fridge: { id: 'milk', price: 32, carry: 'grocery' }, side: { id: 'veg', price: 12, carry: 'grocery', unit: 'produce' }, hot: null },
  bhx: { name: 'Bách Hóa Xanh', logo: 'bach-hoa-xanh.png', face: '#008C44', stripes: ['#FFE600', '#008C44'], accent: '#008C44', shirt: '#0B8A43', hours: [6.5, 21.5], seats: false,
    fridge: { id: 'eggs', price: 30, carry: 'grocery' }, side: { id: 'meat', price: 65, carry: 'grocery', unit: 'meat' }, hot: null },
};
const isOpen = (c, h) => !c.hours || (h >= c.hours[0] && h < c.hours[1]);
// the posters on the glass and the menu over the till (the shop's own words, in Vietnamese as on any shop there)
const PROMO = {
  circlek: [['MÌ LY', '+ TRÀ ĐÀO', '25K', '#E21F26'], ['XÚC XÍCH', 'NƯỚNG', '15K', '#F39C1F']],
  gs25: [['TOKBOKKI', 'CHẢ CÁ', '35K', '#C8261B'], ['MÌ HÀN', 'NẤU MÁY', '29K', '#0068B7']],
  seven: [['ONIGIRI', 'CƠM NẮM', '17K', '#008163'], ['BÁNH BAO', 'NÓNG HỔI', '19K', '#F58220']],
  ministop: [['KEM TƯƠI', 'ỐC QUẾ', '10K', '#003894'], ['GÀ RÁN', 'GIÒN TAN', '25K', '#E60012']],
  winmart: [['GIÁ TỐT', 'MỖI NGÀY', '-20%', '#E21B2A'], ['RAU CỦ', 'TƯƠI MỚI', '9K', '#2E9E4A']],
  bhx: [['RAU TƯƠI', 'MỖI NGÀY', '9K', '#008C44'], ['THỊT CÁ', 'TƯƠI SỐNG', '-15%', '#E8A100']],
};
const MENU = {
  circlek: ['MÓN NÓNG', [['Mì ly', '12K'], ['Xúc xích nướng', '15K'], ['Bánh bao', '15K'], ['Trà đào', '20K']]],
  gs25: ['MÓN HÀN', [['Tokbokki chả cá', '35K'], ['Chả cá xiên', '12K'], ['Mì Hàn nấu máy', '29K'], ['Kimbap', '25K']]],
  seven: ['MÓN NGON', [['Cơm hộp', '35K'], ['Onigiri', '17K'], ['Bánh bao', '19K'], ['Cà phê', '20K']]],
  ministop: ['MÓN NÓNG', [['Gà rán', '25K'], ['Khoai tây chiên', '15K'], ['Kem tươi', '10K'], ['Xúc xích', '15K']]],
  winmart: ['GIÁ HÔM NAY', [['Trứng gà (10)', '32K'], ['Sữa tươi 1L', '32K'], ['Rau muống', '12K'], ['Gạo 5kg', '120K']]],
  bhx: ['GIÁ HÔM NAY', [['Thịt heo (kg)', '135K'], ['Cá basa (kg)', '70K'], ['Rau cải', '10K'], ['Trứng gà (10)', '30K']]],
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
  pho: { title: 'PHỞ BÒ', sub: 'GIA TRUYỀN – TÁI CHÍN NẠM', bg: '#7A1F12', fg: '#FFE7A8', kind: 'noodle', menu: ['Phở tái', 'Phở chín', 'Phở tái nạm', 'Quẩy'] },
  buncha: { title: 'BÚN CHẢ', sub: 'HÀ NỘI – NEM CUA BỂ', bg: '#2B4A1E', fg: '#FFE45C', kind: 'noodle', menu: ['Bún chả', 'Nem cua bể', 'Bún chả nem', 'Trà đá'] },
  banhxeo: { title: 'BÁNH XÈO', sub: 'NÓNG GIÒN – RAU RỪNG', bg: '#B8620F', fg: '#FFFFFF', kind: 'noodle', menu: ['Bánh xèo tôm', 'Bánh xèo mực', 'Nem lụi', 'Bánh khọt'] },
};
const cityKey = () => (SETS[wx.city] ? wx.city : 'hcm');
const hourNow = () => { const d = officeNow(); return d.getHours() + d.getMinutes() / 60; };

// the office's middle on the floor plan (street-life.js weighs the traffic by it too)
export const officeMiddle = () => (HQ ? [3, 9] : PRO ? [3, 0.7] : [0, 0.2]);

/* ---------- the printing: one canvas, a 1024 × 512 cell per shop ---------- */
const CELL = 1024, ROW = 512;
// where each thing is in a shop's cell (x, y, w, h): the sign on top; a chain's posters, menu, door sticker, the till's
// panel, the QR stand and the band along the back wall below it (an eatery's or a shuttered front's painting instead)
const R = { sign: [0, 0, 1024, 140], front: [0, 140, 1024, 372], posterA: [0, 140, 200, 290], posterB: [200, 140, 200, 290], menu: [400, 140, 420, 200],
  door: [820, 140, 204, 204], panel: [400, 340, 420, 90], qr: [830, 346, 84, 84], band: [0, 432, 1024, 80] };
const logos = {};
// A logo from public/assets/brands, or null until it has loaded (then `redraw` runs). An SVG drawn in part (the crop) goes
// wrong in Chrome unless it has a size of its own: it is given one (four times its viewBox).
export function brandImage(file, redraw) {
  if (logos[file]) return logos[file].complete && logos[file].naturalWidth ? logos[file] : null;
  const img = new Image(); img.decoding = 'async'; img.onload = redraw; logos[file] = img;
  const url = `${BASE}/assets/brands/${file}`;
  if (!file.endsWith('.svg')) { img.src = url; return null; }
  fetch(url).then((r) => r.text()).then((svg) => {
    const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number);
    if (vb) svg = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace(/<svg\b/, `<svg width="${vb[2] * 4}" height="${vb[3] * 4}"`));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }).catch(() => {});
  return null;
}
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
// a chain's logo fitted in a box (x, y, w, h), centred; WinMart+ gets its plus
function logo(g, ch, x, y, w, h, redraw) {
  const img = brandImage(ch.logo, redraw); if (!img) return;
  const [cw, chh] = ch.crop || [1, 1], sw = img.naturalWidth * cw, shh = img.naturalHeight * chh, scale = Math.min(w / sw, h / shh);
  const dw = sw * scale, dh = shh * scale, dx = x + (w - dw) / 2 - (ch.plus ? dh * 0.25 : 0), dy = y + (h - dh) / 2;
  g.drawImage(img, 0, 0, sw, shh, dx, dy, dw, dh);
  if (ch.plus) { const p = dh * 0.5, t = p * 0.3, px = dx + dw + p * 0.05, py = dy + dh * 0.22; g.fillStyle = '#E21B2A'; g.fillRect(px, py + (p - t) / 2, p, t); g.fillRect(px + (p - t) / 2, py, t, p); }
}
function stripes(g, ch, x, y, w, h) { const n = ch.stripes.length; ch.stripes.forEach((c, k) => { g.fillStyle = c; g.fillRect(x, y + (k * h) / n, w, h / n + 0.5); }); }
function sign(g, x, y, w, h, key, redraw, dark) {
  const ch = CHAINS[key];
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (ch) {   // a lightbox: the chain's face, the logo in the middle, its stripes along the bottom
    g.fillStyle = ch.face || '#FFFFFF'; g.fillRect(x, y, w, h);
    stripes(g, ch, x, y + h - 22, w, 22);
    logo(g, ch, x + w * 0.19, y + 11, w * 0.62, h - 44, redraw);
  } else if (key === 'rent') {   // an old sign, taken down to its frame
    g.fillStyle = '#3B4048'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 6; k++) g.fillRect(x + 40 + k * 160, y + 30, 90, h - 60);
  } else {    // a painted signboard: the dish in big letters, a line under it
    const e = EATS[key];
    g.fillStyle = e.bg; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = e.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(h * 0.46)}px ${FONT}`; g.fillText(e.title, x + w / 2, y + h * 0.42, w - 60);
    g.fillStyle = '#FFFFFF'; g.font = `700 ${Math.round(h * 0.15)}px ${FONT}`; g.fillText(e.sub, x + w / 2, y + h * 0.8, w - 80);
  }
  if (dark) { g.fillStyle = 'rgba(8,10,14,.62)'; g.fillRect(x, y, w, h); }   // (closed: the sign's light off)
  g.restore();
}
function poster(g, [x, y, w, h], [a, b, price, c]) {
  g.fillStyle = '#FFFFFF'; g.fillRect(x + 8, y + 8, w - 16, h - 16);
  g.fillStyle = c; g.fillRect(x + 14, y + 14, w - 28, h * 0.5);
  g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(w * 0.15)}px ${FONT}`;
  g.fillText(a, x + w / 2, y + h * 0.2, w - 36); g.font = `800 ${Math.round(w * 0.11)}px ${FONT}`; g.fillText(b, x + w / 2, y + h * 0.36, w - 36);
  g.fillStyle = c; g.font = `900 ${Math.round(w * 0.24)}px ${FONT}`; g.fillText(price, x + w / 2, y + h * 0.72, w - 30);
  g.fillStyle = '#FFD400'; g.beginPath(); g.arc(x + w - 36, y + h * 0.56, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#C8261B'; g.font = `900 15px ${FONT}`; g.fillText('MỚI', x + w - 36, y + h * 0.56 + 1);
}
function menuBoard(g, [x, y, w, h], ch, [title, rows]) {
  g.fillStyle = '#20252D'; g.fillRect(x, y, w, h);
  g.fillStyle = ch.accent; g.fillRect(x, y, w, 46);
  g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 28px ${FONT}`; g.fillText(title, x + 18, y + 24, w - 36);
  rows.forEach(([n, p], k) => {
    const ry = y + 70 + k * 34;
    g.fillStyle = '#E9EDF2'; g.font = `700 22px ${FONT}`; g.textAlign = 'left'; g.fillText(n, x + 18, ry, w * 0.66);
    g.fillStyle = '#FFD400'; g.textAlign = 'right'; g.fillText(p, x + w - 18, ry);
  });
}
const fmtH = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function doorSticker(g, [x, y, w, h], ch, redraw) {
  g.fillStyle = 'rgba(255,255,255,.94)'; g.beginPath(); g.roundRect(x + 10, y + 10, w - 20, h - 20, 18); g.fill();
  logo(g, ch, x + 24, y + 22, w - 48, 52, redraw);
  g.fillStyle = '#1C1F24'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 20px ${FONT}`; g.fillText('MỞ CỬA', x + w / 2, y + 100);
  g.fillStyle = ch.accent === '#FFE600' ? '#1C1F24' : ch.accent; g.font = `900 ${ch.hours ? 30 : 42}px ${FONT}`;
  g.fillText(ch.hours ? `${fmtH(ch.hours[0])} – ${fmtH(ch.hours[1])}` : '24/7', x + w / 2, y + 142, w - 30);
}
function counterPanel(g, [x, y, w, h], ch, redraw) { g.fillStyle = ch.accent; g.fillRect(x, y, w, h); g.fillStyle = ch.face || '#FFFFFF'; g.fillRect(x + w * 0.28, y + 8, w * 0.44, h - 16); logo(g, ch, x + w * 0.29, y + 12, w * 0.42, h - 24, redraw); }
function qrStand(g, [x, y, w, h], key) {
  const r = rnd(key.length * 977 + 3), n = 17, c = (w - 10) / n;
  g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r() < 0.48) { g.fillStyle = '#111'; g.fillRect(x + 5 + i * c, y + 5 + j * c, c, c); }
  for (const [i, j] of [[0, 0], [n - 5, 0], [0, n - 5]]) { g.fillStyle = '#111'; g.fillRect(x + 5 + i * c, y + 5 + j * c, c * 5, c * 5); g.fillStyle = '#FFF'; g.fillRect(x + 5 + (i + 1) * c, y + 5 + (j + 1) * c, c * 3, c * 3); g.fillStyle = '#111'; g.fillRect(x + 5 + (i + 2) * c, y + 5 + (j + 2) * c, c, c); }
}
function band(g, [x, y, w, h], ch, redraw) {
  g.fillStyle = ch.face || '#FFFFFF'; g.fillRect(x, y, w, h); stripes(g, ch, x, y + h - 16, w, 16);
  for (let k = 0; k < 3; k++) logo(g, ch, x + 60 + k * 340, y + 8, 220, h - 30, redraw);
}
// shelves of goods: rows of packs in shop colours (drinks, noodles, snacks, milk, biscuits)
const PACKS = ['#E41E2B', '#1C4FA0', '#F7C600', '#E8742A', '#2E9E4A', '#7E3FA6', '#F2F2F2', '#0B7FC2', '#D62F6B', '#8C5A2B', '#FF9F1C', '#46B1E1'];
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
// a front to let: the shutter down, a banner on it
function rentFront(g, x, y, w, h) {
  for (let k = 0; k * 10 < h; k++) { g.fillStyle = k % 2 ? '#8E949C' : '#A3A9B1'; g.fillRect(x, y + k * 10, w, 10); }
  g.fillStyle = '#FFFFFF'; g.fillRect(x + w * 0.22, y + h * 0.3, w * 0.56, h * 0.3);
  g.fillStyle = '#C8261B'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(h * 0.14)}px ${FONT}`;
  g.fillText('CHO THUÊ', x + w / 2, y + h * 0.4); g.fillStyle = '#1C1F24'; g.font = `700 ${Math.round(h * 0.06)}px ${FONT}`; g.fillText('MẶT BẰNG KINH DOANH', x + w / 2, y + h * 0.52);
}

/* ---------- inside a store: the fittings, in the shop's own frame ----------
   x along the front (-SW/2 … SW/2), y up from the ground (the floor is FL up, level with the pavement), z out to the
   street (+) and into the shop (-): the glass at z = 0. Boxes painted by vertex colour, merged with the rest. fix: the
   footprints you can't walk through ([x0, x1, z0, z1]). */
const DRINKS = ['#E41E2B', '#1C4FA0', '#F7C600', '#2E9E4A', '#F2F2F2', '#0B7FC2', '#FF9F1C', '#46B1E1', '#8FD14F', '#6B3A1E'];
const RAMEN = ['#D62F2F', '#E8742A', '#1E1E1E', '#C8261B', '#F7C600', '#B3121E'];
const GREENS = ['#3E8E3A', '#58A445', '#2F6E2C', '#7DBA4A'];
function fitOut(key, D, r, low) {
  const ch = CHAINS[key], inner = [], glass = [], fix = [], spots = [], half = SHOP_W / 2;
  const b = (w, h, d, x, y, z, c) => inner.push(boxAt(w, h, d, x, FL + y, z, c));
  const cyl = (rt, rb, h, x, y, z, c, seg = 10) => inner.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, FL + y, z), c));
  const ball = (s, x, y, z, c, sy = 1) => inner.push(colorize(new THREE.SphereGeometry(s, 7, 5).scale(1, sy, 1).translate(x, FL + y, z), c));
  // a glass display case on a counter (x, z its middle, y its foot): base, a lit top, corner posts, glass all round
  const vitrine = (w, h, d, x, y, z, tint = '#FFF6E0') => {
    b(w, 0.04, d, x, y + 0.02, z, '#9AA2AD'); b(w, 0.04, d, x, y + h - 0.02, z, '#9AA2AD'); b(w - 0.04, 0.01, d - 0.04, x, y + h - 0.045, z, tint);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.02, h, 0.02, x + sx * (w / 2 - 0.01), y + h / 2, z + sz * (d / 2 - 0.01), '#9AA2AD');
    for (const sz of [-1, 1]) glass.push(new THREE.PlaneGeometry(w - 0.02, h - 0.08).translate(x, FL + y + h / 2, z + sz * (d / 2 - 0.005)));
    for (const sx of [-1, 1]) glass.push(new THREE.PlaneGeometry(d - 0.02, h - 0.08).rotateY(Math.PI / 2).translate(x + sx * (w / 2 - 0.005), FL + y + h / 2, z));
  };
  const block = (x0, x1, z0, z1) => fix.push([x0, x1, z0, z1]);
  const thin = low ? 2 : 1;   // (low quality: every other pack)
  // the floor (a checker of 60 cm tiles), the walls, the ceiling and its light panels, the band over the glass inside
  for (let x = -half; x < half - 0.01; x += 0.6) for (let z = -D; z < -0.01; z += 0.6) {
    const w = Math.min(0.6, half - x), d = Math.min(0.6, -z);
    inner.push(colorize(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, FL + 0.004, z + d / 2), (Math.round((x + half) / 0.6) + Math.round(-z / 0.6)) % 2 ? '#E4E6E9' : '#D9DCE0'));
  }
  b(SHOP_W, SHOP_CEIL - FL, 0.06, 0, (SHOP_CEIL - FL) / 2, -D + 0.03, '#F2F3F4');   // (inside the cut in the building: on its faces they'd flicker)
  for (const s of [-1, 1]) b(0.06, SHOP_CEIL - FL, D, s * (half - 0.03), (SHOP_CEIL - FL) / 2, -D / 2, '#F2F3F4');
  b(SHOP_W, 0.04, D, 0, SHOP_CEIL - FL - 0.04, -D / 2, '#F7F7F5');
  for (const x of [-2.2, 0, 2.2]) for (let z = -1.0; z > -D + 0.4; z -= 1.4) b(1.2, 0.02, 0.3, x, SHOP_CEIL - FL - 0.07, z, '#FFFFFF');
  b(SHOP_W, SHOP_CEIL - GLASS, 0.05, 0, (GLASS + SHOP_CEIL) / 2 - FL, -0.05, '#F2F3F4');
  // drinks fridges along the back wall: lit insides, rows of bottles, glass doors
  const nF = 6, fw = 0.9, fx0 = -nF * fw / 2, fz = -D + 0.31;
  for (const [h, y] of [[0.14, 1.97], [0.16, 0.08]]) b(nF * fw + 0.08, h, 0.62, 0, y, fz, '#CDD3DA');   // (an open case: top, plinth, ends)
  for (const s of [-1, 1]) b(0.04, 2.04, 0.62, s * (nF * fw / 2 + 0.02), 1.02, fz, '#CDD3DA');
  for (let k = 0; k < nF; k++) {
    const cx = fx0 + fw * (k + 0.5);
    b(fw - 0.06, 1.8, 0.02, cx, 1.04, -D + 0.08, '#F4F9FF');
    for (let s = 0; s < 5; s++) {
      const y = 0.22 + s * 0.36;
      b(fw - 0.08, 0.015, 0.5, cx, y - 0.01, fz + 0.02, '#B8C0C9');
      for (let bx = -fw / 2 + 0.09; bx < fw / 2 - 0.06; bx += 0.1 * thin) { const h = 0.18 + r() * 0.08; b(0.07, h, 0.07, cx + bx, y + h / 2, fz + 0.2, DRINKS[Math.floor(r() * DRINKS.length)]); }
    }
    b(0.03, 1.96, 0.03, fx0 + fw * k, 1.02, fz + 0.32, '#5E6670');
    b(0.02, 0.5, 0.03, cx + fw / 2 - 0.1, 1.05, fz + 0.34, '#C9CED6');
    glass.push(new THREE.PlaneGeometry(fw - 0.04, 1.9).translate(cx, FL + 1.02, fz + 0.315));
  }
  b(0.03, 1.96, 0.03, fx0 + fw * nF, 1.02, fz + 0.32, '#5E6670');
  block(-half, half, -D, fz + 0.32);
  spots.push({ kind: 'fridge', item: ch.fridge, x: 0, z: fz + 0.85, face: Math.PI });
  // two aisles of shelves running in from the front (packs both sides, a yellow price strip on each shelf)
  const gz0 = -1.35, gz1 = Math.max(gz0 - 2.4, -D + 1.55), L = gz0 - gz1, pal = key === 'gs25' ? [...RAMEN, ...PACKS] : PACKS;
  for (const gx of [-1.85, -0.55]) {
    const gz = (gz0 + gz1) / 2;
    b(0.62, 0.12, L, gx, 0.06, gz, '#3B4048'); b(0.05, 1.45, L, gx, 0.72, gz, '#C3C9D0');
    for (const y of [0.3, 0.64, 0.98, 1.32]) {
      b(0.62, 0.025, L, gx, y, gz, '#BCC3CB');
      for (const s of [-1, 1]) {
        b(0.005, 0.035, L, gx + s * 0.31, y + 0.005, gz, '#FFE45C');
        for (let z = gz1 + 0.04; z < gz0 - 0.08;) {
          const w = (0.07 + r() * 0.08) * thin, h = 0.1 + r() * 0.12, c = pal[Math.floor(r() * pal.length)], n = 1 + Math.floor(r() * 3);
          for (let i = 0; i < n && z < gz0 - 0.08; i++) { b(0.17, h, w, gx + s * 0.17, y + 0.012 + h / 2, z + w / 2, c); z += w + 0.01; }
          z += 0.02;
        }
      }
    }
    for (let k = 0; k < 3; k++) b(0.5, 0.22, 0.2, gx, 0.23 + k * 0.23, gz0 + 0.12, k % 2 ? ch.accent : '#F7C600');   // the week's offer, stacked at the end
    block(gx - 0.33, gx + 0.33, gz1, gz0 + 0.24);
  }
  // the till: a counter with the register, a card reader and the QR stand facing you; the back counter and its shelves behind
  b(1.8, 0.94, 0.62, 2.2, 0.47, -1.6, '#2F343B'); b(1.86, 0.04, 0.68, 2.2, 0.96, -1.6, '#E8E6E1');
  b(0.4, 0.12, 0.32, 2.5, 1.04, -1.72, '#1E2125'); b(0.34, 0.24, 0.02, 2.5, 1.22, -1.78, '#2B3A55');
  b(0.08, 0.14, 0.05, 1.95, 1.05, -1.42, '#1E2125'); b(0.1, 0.18, 0.03, 1.6, 1.07, -1.36, '#E8E6E1');
  b(1.95, 0.95, 0.42, 2.27, 0.475, -2.95, '#3A3F47'); b(2.0, 0.04, 0.46, 2.27, 0.96, -2.95, '#C9CED6');
  b(1.95, 0.9, 0.3, 2.27, 1.75, -3.05, '#4A505A');
  for (let y = 1.45; y < 2.15; y += 0.22) for (let x = 1.4; x < 3.15; x += 0.11 * thin) b(0.08, 0.14, 0.08, x, y, -2.96, PACKS[Math.floor(r() * 8)]);
  block(1.25, 3.3, -3.2, -1.25);
  const till = { x: 2.2, z: -0.95 };
  spots.push({ kind: 'pay', item: ch.hot, x: till.x, z: till.z, face: Math.PI });
  // the chain's own corner: on the back counter or the till (what the cashier serves), along the left wall (`side`)
  const hot = ch.hot?.unit, steam = [];
  if (hot === 'grill') {   // sausages on the rollers; a bánh bao steamer beside
    b(0.5, 0.1, 0.36, 1.75, 1.03, -2.95, '#9AA2AD');
    for (let k = 0; k < 6; k++) inner.push(colorize(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6).rotateZ(Math.PI / 2).translate(1.75, FL + 1.1, -3.08 + k * 0.05), '#A6452A'));
    vitrine(0.34, 0.32, 0.3, 2.3, 0.98, -2.92); for (let k = 0; k < 4; k++) ball(0.05, 2.2 + (k % 2) * 0.18, 1.06 + Math.floor(k / 2) * 0.13, -2.9, '#FAF6EC', 0.75);
    steam.push([2.3, 1.35, -2.92]);
  } else if (hot === 'tok') {   // the tokbokki tray in its red sauce, the fish-cake pot full of skewers
    b(0.62, 0.1, 0.38, 1.7, 1.03, -2.92, '#B8C0C9'); b(0.56, 0.02, 0.32, 1.7, 1.09, -2.92, '#C8261B');
    for (let k = 0; k < 14; k++) inner.push(colorize(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6).rotateZ(Math.PI / 2).rotateY(r() * 3).translate(1.48 + r() * 0.44, FL + 1.105, -3.05 + r() * 0.26), '#F4EBDA'));
    cyl(0.17, 0.17, 0.16, 2.35, 1.06, -2.92, '#9AA2AD', 14); cyl(0.155, 0.155, 0.01, 2.35, 1.14, -2.92, '#B5803F', 14);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, sx = 2.35 + Math.cos(a) * 0.08, sz = -2.92 + Math.sin(a) * 0.08; b(0.008, 0.3, 0.008, sx, 1.22, sz, '#D8C49A'); b(0.07, 0.1, 0.012, sx, 1.21, sz, '#E9D2A4'); }
    steam.push([2.35, 1.25, -2.92]);
  } else if (hot === 'steamer') {   // a glass bánh bao cabinet on the till (your side); the coffee machine behind
    vitrine(0.5, 0.42, 0.36, 1.62, 0.98, -1.62); b(0.48, 0.015, 0.34, 1.62, 1.16, -1.62, '#B8C0C9');   // (and a shelf in it)
    for (let s = 0; s < 2; s++) for (let k = 0; k < 6; k++) ball(0.055, 1.45 + (k % 3) * 0.17, 1.06 + s * 0.18, -1.7 + Math.floor(k / 3) * 0.14, '#FAF6EC', 0.75);
    b(0.3, 0.5, 0.3, 2.6, 1.23, -2.95, '#2B2F36'); b(0.12, 0.03, 0.12, 2.6, 1.03, -2.88, '#9AA2AD');
    steam.push([1.62, 1.5, -1.62]);
  } else if (hot === 'fryer') {   // fried chicken under a warm lamp, on the till
    vitrine(0.55, 0.36, 0.38, 1.62, 0.98, -1.62, '#FFC46B'); b(0.5, 0.01, 0.34, 1.62, 1.0, -1.62, '#D9A441');   // (under a warm lamp)
    for (let k = 0; k < 8; k++) ball(0.05, 1.44 + (k % 4) * 0.12, 1.04, -1.7 + Math.floor(k / 4) * 0.14, '#C8862E', 0.8);
  }
  const sz0 = -1.35, sz1 = Math.max(sz0 - 2.4, -D + 1.55), sm = (sz0 + sz1) / 2, sl = sz0 - sz1, unit = ch.side.unit;   // along the left wall, beside the first aisle
  if (unit === 'noodles') {   // a wall of cup noodles and the hot water dispenser
    b(0.5, 1.5, sl, -3.02, 0.75, sm, '#C3C9D0');
    for (let y = 0.35; y < 1.4; y += 0.28) for (let z = sz1 + 0.08; z < sz0 - 0.06; z += 0.13 * thin) cyl(0.05, 0.04, 0.12, -2.86, y, z, RAMEN[Math.floor(r() * RAMEN.length)], 8);
    b(0.32, 0.5, 0.36, -2.98, 1.75, sz0 - 0.3, '#F2F2F2'); b(0.04, 0.05, 0.04, -2.8, 1.62, sz0 - 0.36, '#D62F2F'); b(0.04, 0.05, 0.04, -2.8, 1.62, sz0 - 0.24, '#2E6FD1');
  } else if (unit === 'ramyeon') {   // the ramyeon machines on a counter, a pot on each, the packs on the wall above
    b(0.55, 0.9, sl, -3.0, 0.45, sm, '#3A3F47'); b(0.58, 0.04, sl, -3.0, 0.92, sm, '#C9CED6');
    for (let k = 0; k < 3; k++) { const z = sz0 - 0.4 - k * 0.6; b(0.4, 0.22, 0.4, -3.0, 1.05, z, '#B8C0C9'); b(0.3, 0.01, 0.3, -2.96, 1.165, z, '#1E1E1E'); cyl(0.11, 0.1, 0.09, -2.96, 1.22, z, '#D9A441', 12); }
    for (let y = 1.45; y < 2.2; y += 0.24) for (let z = sz1 + 0.08; z < sz0 - 0.06; z += 0.16 * thin) b(0.06, 0.18, 0.13, -3.25, y, z, RAMEN[Math.floor(r() * RAMEN.length)]);
    steam.push([-2.96, 1.4, sz0 - 0.4]);
  } else if (unit === 'chiller') {   // the open chiller: onigiri and bento boxes; snacks above
    b(0.6, 1.0, sl, -3.0, 0.5, sm, '#DDE3E9'); b(0.5, 0.02, sl - 0.1, -2.98, 0.86, sm, '#5E6670');
    for (let z = sz1 + 0.1; z < sz0 - 0.1; z += 0.12) { inner.push(colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(-2.9, FL + 0.93, z), '#F5F2EA')); b(0.02, 0.04, 0.05, -2.875, 0.92, z, '#1E2B22'); }
    for (let z = sz1 + 0.12; z < sz0 - 0.12; z += 0.2) b(0.16, 0.05, 0.16, -3.1, 0.9, z, r() < 0.5 ? '#F7C600' : '#E8742A');
    b(0.5, 0.9, sl, -3.05, 1.75, sm, '#C3C9D0');
    for (let y = 1.4; y < 2.1; y += 0.24) for (let z = sz1 + 0.06; z < sz0 - 0.06; z += 0.12 * thin) b(0.08, 0.16, 0.09, -2.84, y, z, PACKS[Math.floor(r() * 12)]);
  } else if (unit === 'softserve') {   // the soft-serve machine and a stack of cones; snacks along the wall
    b(0.55, 0.9, sl, -3.0, 0.45, sm, '#3A3F47'); b(0.58, 0.04, sl, -3.0, 0.92, sm, '#E8E6E1');
    b(0.42, 0.62, 0.4, -3.02, 1.25, sz0 - 0.4, '#F2F2F2'); b(0.06, 0.08, 0.06, -2.82, 1.0, sz0 - 0.4, '#9AA2AD');
    for (let k = 0; k < 4; k++) inner.push(colorize(new THREE.ConeGeometry(0.035, 0.12, 8).rotateX(Math.PI).translate(-2.88, FL + 1.0 + k * 0.03, sz0 - 0.85), '#D9A441'));
    for (let y = 1.3; y < 2.1; y += 0.25) for (let z = sz1 + 0.08; z < sz0 - 1.0; z += 0.14 * thin) b(0.08, 0.18, 0.11, -3.2, y, z, PACKS[Math.floor(r() * 12)]);
  } else {   // crates of vegetables; at Bách Hóa Xanh an open case of meat and fish over them
    b(0.62, 0.6, sl, -3.0, 0.3, sm, '#7A5A3A');
    for (let z = sz1 + 0.12; z < sz0 - 0.1; z += 0.24) for (let k = 0; k < 4; k++) b(0.12, 0.08, 0.1, -3.18 + k * 0.12, 0.65, z + (k % 2) * 0.05, unit === 'meat' ? (k % 2 ? '#E7A39A' : '#F2F0EA') : GREENS[(k + Math.round(z * 10)) & 3]);
    if (unit === 'meat') { b(0.6, 0.9, sl, -3.02, 1.15, sm, '#DDE3E9'); for (let z = sz1 + 0.12; z < sz0 - 0.1; z += 0.22) b(0.18, 0.04, 0.16, -2.95, 0.93, z, '#D9666B'); }
  }
  block(-half, -2.7, sz1, sz0);
  spots.push({ kind: 'side', item: ch.side, x: -2.25, z: sm, face: Math.PI / 2 });
  // the window: a counter to sit at with three stools (the convenience stores), or crates of fruit (the grocers)
  const seats = [];
  if (ch.seats) {
    b(2.3, 0.04, 0.4, -2.05, 1.0, -0.25, '#C8A27A'); b(2.3, 0.98, 0.04, -2.05, 0.49, -0.07, '#8D7358');
    for (const x of [-2.85, -2.05, -1.25]) {
      cyl(0.17, 0.17, 0.05, x, 0.72, -0.65, ch.accent, 14); cyl(0.025, 0.025, 0.7, x, 0.36, -0.65, '#9AA2AD', 6); cyl(0.2, 0.2, 0.02, x, 0.01, -0.65, '#5E6670', 14);
      seats.push({ x, z: -0.65, top: 0.745 });
      block(x - 0.18, x + 0.18, -0.83, -0.47);
    }
    block(-3.25, -0.9, -0.45, 0);
    spots.push({ kind: 'seat', x: -2.05, z: -1.0, face: 0, seat: seats[1] });
  } else {
    for (let k = 0; k < 4; k++) { const x = -3.0 + k * 0.55; b(0.5, 0.4 + (k % 2) * 0.12, 0.5, x, 0.2 + (k % 2) * 0.06, -0.45, '#7A5A3A'); for (let i = 0; i < 6; i++) ball(0.06, x - 0.15 + (i % 3) * 0.15, 0.46 + (k % 2) * 0.12, -0.55 + Math.floor(i / 3) * 0.18, ['#E8742A', '#D62F2F', '#7DBA4A', '#F7C600'][k]); }
    block(-3.3, -0.7, -0.75, 0);
  }
  // where a shopper stands along the aisles (they move between these)
  const aisle = [[-1.2, -2.0], [-1.2, gz1 + 0.5], [0.3, -1.8], [0.3, gz1 + 0.6]];
  return { inner, glass, fix, spots, seats, till, cashier: { x: 2.3, z: -2.3 }, steam, aisle };
}

/* ---------- the shops ----------
   fronts: ground floors facing a street, nearest the office first: { dir: 'px' | 'pz', x, z, deep } on the facade, which
   faces +x or +z (the sides the camera sees); city.js has cut each shop's room out of its building. */
export function buildShops(G, fronts) {
  for (const f of fronts) f.store = true;   // (the city leaves its plain shop out)
  if (!fronts.length) return { update() {}, night() {}, doors: () => [], walk: () => undefined, shop: null };
  const canvas = document.createElement('canvas'); canvas.width = CELL * 2; canvas.height = ROW * Math.ceil(fronts.length / 2);
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const low = quality.level === 'low';
  let city = null, set = [], night = false, built = null, stores = [], shut = [], now = 0;
  const cellOf = (n) => [(n % 2) * CELL, Math.floor(n / 2) * ROW];
  function draw() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    fronts.forEach((_, n) => {
      const [cx, cy] = cellOf(n), key = set[n] || 'rent', ch = CHAINS[key], at = ([x, y, w, h]) => [cx + x, cy + y, w, h];
      sign(g, ...at(R.sign), key, draw, !!shut[n]);
      if (!ch) { if (EATS[key]) eateryFront(g, ...at(R.front), key); else rentFront(g, ...at(R.front)); return; }
      poster(g, at(R.posterA), PROMO[key][0]); poster(g, at(R.posterB), PROMO[key][1]);
      menuBoard(g, at(R.menu), ch, MENU[key]); doorSticker(g, at(R.door), ch, draw); counterPanel(g, at(R.panel), ch, draw); qrStand(g, at(R.qr), key); band(g, at(R.band), ch, draw);
    });
    tex.needsUpdate = true;
  }
  document.fonts?.ready.then(() => { if (city) draw(); });   // the lettering, once the font is in
  // a plane showing part of a cell (rect: x, y, w, h in the cell's pixels)
  const decal = (w, h, n, [rx, ry, rw, rh]) => {
    const p = new THREE.PlaneGeometry(w, h), uv = p.attributes.uv, [cx, cy] = cellOf(n);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + rx + uv.getX(i) * rw) / canvas.width, 1 - (cy + ry + (1 - uv.getY(i)) * rh) / canvas.height);
    return p;
  };
  const faceM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: 0.06, roughness: 0.45, alphaTest: 0.5 });
  // the insides: lit by their own tubes, so each glows in its own colours (per shop: open or shut, day or night)
  const glow = { value: new Array(8).fill(0) };
  const innerM = vmat({ roughness: 0.7 });
  innerM.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShop;\nvarying float vShop;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShop = aShop;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow[8];\nvarying float vShop;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float gl = 0.; for (int k = 0; k < 8; k++) if (abs(float(k) - vShop) < .5) gl = uGlow[k]; totalEmissiveRadiance += diffuseColor.rgb * gl; }');
  };
  innerM.customProgramCacheKey = () => 'shop-inner';
  const glassM = new THREE.MeshStandardMaterial({ color: '#BFD9E6', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const frameM = vmat({ roughness: 0.5, metalness: 0.3 }), shutterM = vmat({ roughness: 0.6, metalness: 0.35 });
  const poolM = new THREE.MeshBasicMaterial({ map: poolTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const tag = (geo, n) => { geo.setAttribute('aShop', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(n), 1)); return geo; };
  let poolMesh = null, doorGlass = null, doorFrame = null;

  /* (re)build everything for the city picked now */
  function build() {
    if (built) { built.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isCSS2DObject) o.element.remove(); }); G.remove(built); }
    built = new THREE.Group(); G.add(built);
    const out = [], inner = [], glass = [], faces = [], pools = [], leafs = [];
    stores = [];
    fronts.forEach((f, n) => {
      const key = set[n] || 'rent', ch = CHAINS[key], rot = f.dir === 'px' ? Math.PI / 2 : 0, D = shopDepth(f.deep);
      const M = new THREE.Matrix4().makeRotationY(rot).setPosition(f.x, GY, f.z);
      const put = (geo, list) => list.push(geo.applyMatrix4(M));
      const toW = (x, z) => (rot ? [f.x + z, f.z - x] : [f.x + x, f.z + z]);
      const S = { n, key, ch, f, rot, D, M, toW, door: 0, passUntil: 0, greetT: 0, inside: false };
      stores.push(S);
      // the front: the lightbox over it, scooters parked along the kerb
      put(boxAt(SHOP_W + 0.3, SIGN_H_M + 0.1, 0.18, 0, FL + GLASS + SIGN_H_M / 2 + 0.05, 0.09, '#D8DCE1'), out);
      put(decal(SHOP_W + 0.2, SIGN_H_M, n, R.sign).translate(0, FL + GLASS + SIGN_H_M / 2 + 0.05, 0.185), faces);
      // (in front of the till, not the window counter; at GS25 the other side, its table is there)
      const kerb = ch && !ch.outdoor ? [1.15, 2.0, 2.85] : [-2.6, -1.75, -0.9, -0.05].slice(0, ch?.outdoor ? 2 : 3 + (n % 2));
      kerb.forEach((x, k) => put(parkedScooter(['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B'][(k + n) % 4]).rotateY(0.18 * (k % 2 ? 1 : -1)).translate(x, FL, 1.0), out));
      if (!ch) {   // an eatery or a front to let: painted, in a plain frame
        put(boxAt(SHOP_W + 0.3, GLASS + 0.05, 0.08, 0, FL + GLASS / 2, 0.03, '#5E6670'), out);
        put(decal(SHOP_W, GLASS - FL, n, R.front).translate(0, FL + (GLASS - FL) / 2 + 0.02, 0.075), faces);
        return;
      }
      Object.assign(S, fitOut(key, D, rnd(n * 7919 + key.length * 131 + 17), low));
      inner.push(S.inner.map((geo) => tag(geo.applyMatrix4(M), n)));   // (each shop's own mesh: one out of view isn't drawn)
      for (const geo of S.glass) put(geo, glass);
      S.inner = S.glass = null;
      // the glass front: mullions, sill and head, the door's frame; fixed panes either side of the door, a pane over it
      for (const x of [-SHOP_W / 2, -2.2, -DOOR - 0.03, DOOR + 0.03, 2.2, SHOP_W / 2]) put(boxAt(0.07, GLASS - FL, 0.08, x, FL + (GLASS - FL) / 2, 0, '#4A515B'), out);
      put(boxAt(SHOP_W + 0.14, 0.12, 0.1, 0, FL + 0.06, 0, '#4A515B'), out); put(boxAt(SHOP_W + 0.14, 0.07, 0.1, 0, GLASS + 0.02, 0, '#4A515B'), out);
      put(boxAt(2 * DOOR + 0.1, 0.06, 0.09, 0, FL + 2.12, 0, '#4A515B'), out);
      for (const [x0, x1] of [[-SHOP_W / 2, -DOOR - 0.03], [DOOR + 0.03, SHOP_W / 2]]) put(new THREE.PlaneGeometry(x1 - x0, GLASS - FL - 0.12).translate((x0 + x1) / 2, FL + 0.12 + (GLASS - FL - 0.12) / 2, 0.01), glass);
      put(new THREE.PlaneGeometry(2 * DOOR, GLASS - FL - 2.15).translate(0, FL + 2.15 + (GLASS - FL - 2.15) / 2, 0.01), glass);
      // the printing: posters on the glass, the door sticker, the menu over the back counter, the till's front, the QR stand, the band along the back
      put(decal(0.62, 0.9, n, R.posterA).translate(-2.75, FL + 1.55, -0.015), faces);
      put(decal(0.62, 0.9, n, R.posterB).translate(2.7, FL + 1.55, -0.015), faces);
      put(decal(0.36, 0.36, n, R.door).translate(DOOR + 0.3, FL + 1.25, -0.015), faces);
      put(decal(1.48, 0.7, n, R.menu).translate(2.27, 2.3, -2.78), faces);   // (clear of the ceiling)
      put(decal(1.7, 0.36, n, R.panel).translate(2.2, FL + 0.55, -1.285), faces);
      put(decal(0.09, 0.09, n, R.qr).translate(1.6, FL + 1.09, -1.343), faces);
      put(decal(SHOP_W - 0.1, 0.48, n, R.band).translate(0, SHOP_CEIL - 0.3, -D + 0.02), faces);
      if (ch.outdoor) {   // GS25: a table and stools on the pavement under a parasol in its blue
        const tx = 2.3, tz = 0.7;
        put(colorize(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16).translate(tx, FL + 0.72, tz), '#F2F2F2'), out);
        put(colorize(new THREE.CylinderGeometry(0.03, 0.05, 0.72, 6).translate(tx, FL + 0.36, tz), '#9AA2AD'), out);
        put(colorize(new THREE.CylinderGeometry(0.018, 0.018, 1.7, 6).translate(tx, FL + 1.3, tz), '#E8E8E8'), out);
        put(colorize(new THREE.ConeGeometry(0.85, 0.32, 10, 1, true).translate(tx, FL + 2.18, tz), ch.accent), out);
        put(colorize(new THREE.CylinderGeometry(0.86, 0.86, 0.06, 10, 1, true).translate(tx, FL + 2.0, tz), '#FFFFFF'), out);
        for (const sx of [-0.55, 0.55]) put(boxAt(0.36, 0.42, 0.36, tx + sx, FL + 0.21, tz, '#2B5FA8'), out);
        S.table = { x: tx, z: tz };
      }
      if (ch.hours) {   // a shutter box over the front, and the shutter (rolled down at closing time)
        put(boxAt(SHOP_W + 0.2, 0.2, 0.22, 0, GLASS + 0.14, 0.16, '#8E949C'), out);
        const slats = [];
        for (let k = 0; k * 0.09 < GLASS - FL; k++) slats.push(boxAt(SHOP_W + 0.1, 0.1, 0.03 + (k % 2) * 0.012, 0, -0.045 - k * 0.09, (k % 2) * 0.006, k % 2 ? '#9AA1A9' : '#B2B8BF'));
        const sh = new THREE.Mesh(mergeAll(slats), shutterM), holder = new THREE.Group();
        holder.matrixAutoUpdate = false; holder.matrix.copy(M).multiply(new THREE.Matrix4().makeTranslation(0, GLASS + 0.03, 0.13)); holder.add(sh); built.add(holder);
        sh.visible = false; S.shutter = sh; S.roll = -1;
      }
      // the door's two sliding leaves; a pool of light on the pavement at night
      S.leaf = leafs.length; leafs.push(S, S);
      const p = new THREE.PlaneGeometry(4.4, 2.4).rotateX(-Math.PI / 2).translate(0, FL + 0.02, 1.0);
      p.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 3).fill(1), 3));
      S.poolAt = pools.reduce((a, q) => a + q.attributes.position.count, 0);
      pools.push(p.applyMatrix4(M));
    });
    const mesh = (list, mat, shadow, recv = true) => { if (!list.length) return null; const o = new THREE.Mesh(mergeAll(list), mat); o.castShadow = shadow; o.receiveShadow = recv; built.add(o); return o; };
    mesh(out, vmat({ roughness: 0.6 }), true);
    for (const list of inner) mesh(list, innerM, false, false);
    mesh(faces, faceM, false);
    const gl = mesh(glass, glassM, false, false); if (gl) gl.renderOrder = 2;
    poolMesh = mesh(pools, poolM, false, false); if (poolMesh) { poolMesh.renderOrder = 1; poolMesh.visible = night; }
    // the door leaves, instanced (moved as a door opens)
    const leafGlass = new THREE.PlaneGeometry(DOOR, 2.0).translate(0, 1.0, 0);
    const leafFrame = mergeAll([boxAt(0.04, 2.0, 0.04, -DOOR / 2, 1.0, 0, '#4A515B'), boxAt(0.04, 2.0, 0.04, DOOR / 2, 1.0, 0, '#4A515B'), boxAt(DOOR, 0.05, 0.04, 0, 0.025, 0, '#4A515B'), boxAt(DOOR, 0.05, 0.04, 0, 1.975, 0, '#4A515B'), boxAt(0.03, 0.4, 0.05, DOOR / 2 - 0.08, 1.05, 0, '#C9CED6')]);
    doorGlass = new THREE.InstancedMesh(leafGlass, glassM, Math.max(1, leafs.length)); doorFrame = new THREE.InstancedMesh(leafFrame, frameM, Math.max(1, leafs.length));
    for (const o of [doorGlass, doorFrame]) { o.frustumCulled = false; o.renderOrder = 2; o.count = leafs.length; built.add(o); }
    for (const S of stores) if (S.leaf != null) placeDoor(S);
    buildPeople();
  }
  const LM = new THREE.Matrix4(), LT = new THREE.Matrix4();
  function placeDoor(S) {
    const o = S.door * (DOOR - 0.06);
    for (const [k, s] of [[0, -1], [1, 1]]) {
      LM.copy(S.M).multiply(LT.makeTranslation(s * (DOOR / 2 + o), FL, -0.05));
      doorGlass.setMatrixAt(S.leaf + k, LM); doorFrame.setMatrixAt(S.leaf + k, LM);
    }
    doorGlass.instanceMatrix.needsUpdate = doorFrame.instanceMatrix.needsUpdate = true;
  }

  /* ---------- the people: the cashier, a shopper, who sits at the window, the chain's regulars outside ---------- */
  let crowd = null, props = null, step = () => {};
  const HAIR = ['#2B2420', '#3A2A20', '#1E1A18', '#5A3A28'];
  // who sits at the window counter, by chain: [from, to] hours (past midnight: + 24), how many, who, what's in front of them
  const SIT = {
    circlek: [[[6.5, 8], 1, 'office', 'cup'], [[11, 13.5], 2, 'school', 'noodle'], [[16.5, 18.5], 3, 'school', 'noodle'], [[19, 25], 3, 'student', 'laptop']],
    gs25: [[[10.5, 13.5], 1, 'genz', 'tok'], [[15, 23.5], 3, 'genz', 'tok']],
    seven: [[[7, 8.5], 1, 'office', 'cup'], [[11, 13.5], 3, 'office', 'bento'], [[19, 22.5], 1, 'student', 'cup']],
    ministop: [[[14, 21], 2, 'genz', 'chicken']],
  };
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const LOOK = {
    school: () => ({ shirt: '#F4F4F2', pants: '#1F2A44' }), office: (r) => ({ shirt: pick(r, ['#DCE6F2', '#F2F2F2', '#B8C8DC', '#E8DCC8']), pants: '#2B2F36' }),
    student: (r) => ({ shirt: pick(r, ['#3F7CC4', '#2A2D33', '#7A8A9A', '#5B3A6B', '#2A9D8F']), pants: '#33415C' }),
    genz: (r) => ({ shirt: pick(r, ['#F2F2F2', '#E8B4C8', '#1E1E1E', '#B8D8F0', '#F7D774']), pants: pick(r, ['#2B2F36', '#C9B79C', '#4A5A7A']) }),
  };
  // the two outside, by chain
  const OUT = { gs25: [LOOK.genz, LOOK.genz], seven: [() => ({ shirt: '#00A651', pants: '#2B2F36' })], ministop: [() => ({ shirt: '#E8B4C8', pants: '#4A5A7A' }), () => ({ shirt: '#F7D774', pants: '#3F7CC4' })],
    winmart: [() => ({ shirt: '#B85C7A', pants: '#3A3F47', sleeves: '#F2E6D8' })], bhx: [() => ({ shirt: '#8C6A9E', pants: '#3A3F47' }), () => ({ shirt: '#5E8C6A', pants: '#2B2F36' })] };
  const V3 = new THREE.Vector3();
  function buildPeople() {
    const slots = stores.reduce((a, S) => a + (S.ch ? 4 + S.seats.length : 0), 0);
    crowd = folk(built, Math.max(1, slots), { low, shadows: false });
    props = propSet(built, 40);
    const parts = [];
    for (const S of stores) {
      if (!S.ch) continue;
      const r = rnd(S.n * 271 + 9), at = (x, z) => S.toW(x, z), face = (dx, dz) => S.rot + Math.atan2(-dz, dx);
      const [cashier] = crowd.take(1), [browser] = crowd.take(1), sit = crowd.take(S.seats.length), out = crowd.take(2);
      crowd.dress(cashier, { shirt: S.ch.shirt, pants: '#2B2F36', hair: '#2B2420' });
      crowd.dress(browser, { ...LOOK.office(r), hair: pick(r, HAIR) });
      (OUT[S.key] || []).forEach((look, k) => out[k] != null && crowd.dress(out[k], { ...look(r), hair: pick(r, HAIR) }));
      const puff = !low && S.steam.length ? puffs(built, 2, { size: 0.22, rise: 0.5, period: 2.4 }) : null;
      const sy = GY + FL, mid = at(0, -2), held = [];
      let dressedFor = '', aisleAt = 0, aisleK = 0;
      const all = () => [cashier, browser, ...sit, ...out];
      const hand = (i, kind) => { const p = props.take(); if (p == null) return; held.push(p); const hp = crowd.hand(i, V3); props.show(p, kind, hp.x, hp.y - 0.05, hp.z, S.rot); };
      const lay = (kind, x, y, z) => { const p = props.take(); if (p == null) return; held.push(p); const [wx, wz] = at(x, z); props.show(p, kind, wx, sy + y, wz, S.rot); };
      parts.push({
        when: [0, 24], dry: true, at: mid,
        update(t, dt, h) {
          for (const p of held) props.hide(p); held.length = 0;
          if (!isOpen(S.ch, h)) { all().forEach((i) => crowd.hide(i)); puff?.show(t, 0, 0, 0, false); return; }
          // the cashier: behind the till facing the door, scanning now and then (and when someone walks in)
          const scan = S.greetT > now || (t % 11) < 1.4;
          { const [x, z] = at(S.cashier.x, S.cashier.z); crowd.pose(cashier, { x, y: sy, z, yaw: face(0, 1) + Math.sin(t * 0.4) * 0.15, arms: scan ? [[0.95, -0.1], [0.95 + Math.sin(t * 8) * 0.15, -0.1]] : [[0.15, 0], [0.15, 0]] }); }
          // a shopper along the aisles, a little while at each place, reaching for a shelf now and then
          if ((h >= 6.5 && h < 23.5) || S.n % 2) {
            if (t > aisleAt) { aisleAt = t + 25 + r() * 30; aisleK = (aisleK + 1) % S.aisle.length; }
            const [ax, az] = S.aisle[aisleK], [x, z] = at(ax, az), reach = (t % 6) < 1.2;
            crowd.pose(browser, { x, y: sy, z, yaw: face(ax < -1 ? (aisleK % 2 ? -1 : 1) : -1, 0), arms: [[0.1, 0], reach ? [1.3, -0.1] : [0.1, 0]] });
          } else crowd.hide(browser);
          // the window counter: the chain's regulars at their hours
          const rule = (SIT[S.key] || []).find(([[a, b]]) => (h >= a && h < b) || (h + 24 >= a && h + 24 < b));
          const many = rule ? Math.min(rule[1] + (S.key === 'gs25' && [5, 6].includes(officeNow().getDay()) ? 1 : 0), sit.length) : 0;
          if (rule && dressedFor !== rule[2]) { dressedFor = rule[2]; sit.forEach((i, k) => crowd.dress(i, { ...LOOK[rule[2]](r), hair: HAIR[k % 4] })); }
          sit.forEach((i, k) => {
            if (k >= many) { crowd.hide(i); return; }
            const s = S.seats[k], [x, z] = at(s.x, s.z), what = rule[3], typing = what === 'laptop', bite = !typing && ((t + k * 3.1) % 7) < 1.3;
            crowd.pose(i, { x, z, sit: sy + s.top, yaw: face(0, 1) + Math.sin(t * 0.3 + k) * 0.08, lean: -0.12,
              arms: typing ? [[1.25, -0.25 + Math.sin(t * 9 + k) * 0.03], [1.25, -0.25 + Math.cos(t * 9 + k) * 0.03]] : [[1.15, -0.3], bite ? [2.25, -0.4] : [1.15, -0.3]] });
            lay(what, s.x, 1.02, -0.27); if (typing) lay('screen', s.x, 1.02, -0.27);
          });
          // outside, the chain's own (out of the rain)
          const dry = wx.rain < 0.05;
          const shown = new Set(), show = (i, f) => { if (i == null) return; shown.add(i); const [x, z] = at(f.x, f.z); crowd.pose(i, { ...f, x, z, y: sy, sit: f.sit != null ? sy + f.sit : undefined, yaw: S.rot + (f.yaw || 0) }); };
          if (S.key === 'gs25' && dry && h >= 15 && h < 23.5) {   // two friends at the table under the parasol, tokbokki between them
            [[0, -0.55, 0], [1, 0.55, Math.PI]].forEach(([k, sx, yaw]) => show(out[k], { x: S.table.x + sx, z: S.table.z, sit: 0.42, yaw, arms: [[1.0, -0.2], ((t + k * 2) % 6) < 1 ? [2.2, -0.35] : [1.0, -0.2]] }));
            lay('tok', S.table.x, 0.74, S.table.z);
          } else if (S.key === 'seven' && h >= 9 && h < 22 && (t % 240) < 150) {   // a food courier on his scooter at the kerb, waiting for an order
            show(out[0], { x: -2.25, z: 1.0, sit: 0.92, yaw: 0, lean: 0.15, arms: [[1.3, -0.2], [1.4, -0.2]], hat: true });
            lay('courier', -2.0, 0, 1.0);
          } else if (S.key === 'ministop' && dry && h >= 14 && h < 20) {   // a mother and her child with a soft-serve by the door
            show(out[0], { x: -1.6, z: 0.65, yaw: -0.6, arms: [[0.2, 0], [0.5, -0.1]] });
            show(out[1], { x: -1.15, z: 0.85, s: 0.62, yaw: Math.PI - 0.5, arms: [[0.2, 0], (t % 4) < 1.6 ? [2.3, -0.3] : [1.4, -0.2]] });
            if (out[1] != null) hand(out[1], 'cone');
          } else if (S.key === 'winmart' && dry && h >= 17 && h < 19.3) {   // an auntie after work hangs her shopping on her scooter
            show(out[0], { x: -2.75, z: 0.62, yaw: 0, arms: [[0.3, 0], [1.1 + Math.sin(t * 1.5) * 0.2, -0.1]], hat: 'non' });
            lay('scooter', -2.0, 0, 1.0); lay('bag', -1.42, 0.98, 1.0);
          } else if (S.key === 'bhx' && ((h >= 6.5 && h < 9) || (h >= 16.5 && h < 18.5))) {   // aunties choosing vegetables at the crates
            show(out[0], { x: -2.4, z: -1.1, yaw: Math.PI / 2, lean: 0.25, arms: [[1.0, -0.1], [0.8 + Math.sin(t) * 0.2, -0.1]], hat: 'non' });
            show(out[1], { x: -1.4, z: -1.15, yaw: Math.PI / 2 + 0.3, lean: 0.2, arms: [[0.2, 0], [1.0, -0.1]] });
          }
          for (const i of out) if (!shown.has(i)) crowd.hide(i);
          if (puff) { const [sx, sh, sz] = S.steam[0], [x, z] = at(sx, sz); puff.show(t, x, sy + sh, z, true); }
        },
        off() { all().forEach((i) => crowd.hide(i)); for (const p of held) props.hide(p); held.length = 0; puff?.show(0, 0, 0, 0, false); },
      });
      S.say = (text) => {   // a word from the cashier, over their head
        const d = el('div', 'tag shop-say'); d.textContent = text; d.style.borderColor = S.ch.accent;
        const o = new CSS2DObject(d), [x, z] = at(S.cashier.x, S.cashier.z); o.position.set(x, GY + FL + 2.15, z); built.add(o);
        setTimeout(() => { o.removeFromParent(); d.remove(); }, 2600);
      };
    }
    step = stepper(parts);
  }

  /* ---------- each frame ---------- */
  let lastH = -1, walker = null;
  function refresh(h) {   // the opening hours: shutters, lights, signs (looked at every minute of office time)
    let redraw = false;
    for (const S of stores) {
      if (!S.ch) continue;
      const open = isOpen(S.ch, h);
      if (!!shut[S.n] === open) { shut[S.n] = !open; redraw = true; }
      glow.value[S.n] = open ? (night ? 0.55 : 0.22) : (night ? 0.0 : 0.06);
      if (poolMesh) { const c = poolMesh.geometry.attributes.color, v = open ? 1 : 0; for (let i = 0; i < 4; i++) c.setXYZ(S.poolAt + i, v, v, v); c.needsUpdate = true; }
    }
    if (redraw) draw();
  }
  function update(dt, t) {
    now = t;
    const k = cityKey();
    if (k !== city) { city = k; set = SETS[k]; shut = []; build(); draw(); lastH = -1; }
    const h = hourNow();
    if (Math.abs(h - lastH) > 0.016) { lastH = h; refresh(h); }
    // the shutters roll to where the hours say; the doors open for whoever comes up to them
    for (const S of stores) {
      if (S.shutter) {
        const want = shut[S.n] ? 1 : 0;
        if (S.roll < 0) S.roll = want;
        if (S.roll !== want) S.roll = THREE.MathUtils.clamp(S.roll + Math.sign(want - S.roll) * dt * 0.35, 0, 1);
        S.shutter.visible = S.roll > 0.01; S.shutter.scale.y = Math.max(0.001, S.roll);
      }
      if (S.leaf == null) continue;
      const dw = doorOf(S), near = !!walker && Math.hypot(walker[0] - dw[0], walker[1] - dw[1]) < 1.7, want = !shut[S.n] && (near || S.passUntil > t) ? 1 : 0;
      if (want && S.door === 0 && near) sfx.play('ding');
      if (S.door !== want) { S.door = THREE.MathUtils.clamp(S.door + Math.sign(want - S.door) * dt * 2.6, 0, 1); placeDoor(S); }
    }
    step(dt, t, h); crowd?.flush(); props?.flush();
  }
  const doorOf = (S) => (S.dw ??= S.toW(0, 0.1));
  const local = (S, x, z) => { const dx = x - S.f.x, dz = z - S.f.z; return S.rot ? [-dz, dx] : [dx, dz]; };
  // walking in (first person): whether (x, z) is blocked, at or in a shop (undefined: not ours to say)
  function walk(x, z, r = 0.25) {
    for (const S of stores) {
      const [lx, lz] = local(S, x, z), half = SHOP_W / 2;
      if (lx < -half - 0.3 || lx > half + 0.3 || lz < -S.D - 0.3 || lz > r + 0.02) continue;
      const doorway = S.ch && Math.abs(lx) < DOOR - r && S.door > 0.6;
      if (lz > -r - 0.05) return !doorway;   // at the front (either side of the glass): only through the open door
      if (!S.ch) return true;
      if (lx < -half + r || lx > half - r || lz < -S.D + r) return true;
      return S.fix.some(([x0, x1, z0, z1]) => lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r);
    }
    return undefined;
  }
  /* for walking in (first-person.js): feel([x, z]) each frame where you are on the street (null: not out there); inside():
     the shop you are in; spots(): what you can do there (the fridges, the chain's corner, the till, a seat at the
     window), each { kind, item, store, x, z, face, seatAt } */
  const shop = {
    feel(p) {
      walker = p;
      for (const S of stores) {
        if (!S.ch) continue;
        const [lx, lz] = p ? local(S, p[0], p[1]) : [99, 99], inside = Math.abs(lx) < SHOP_W / 2 && lz < -0.3 && lz > -S.D;
        if (inside && !S.inside && !shut[S.n]) { S.greetT = now + 1.5; S.say?.(`${S.ch.name} xin chào!`); }
        S.inside = inside;
      }
    },
    inside: () => stores.find((S) => S.inside) || null,
    spots: () => stores.flatMap((S) => (S.inside ? S.spots.map((o) => {
      const [x, z] = S.toW(o.x, o.z), seat = o.seat && S.toW(o.seat.x, o.seat.z);
      return { ...o, x, z, face: o.face + S.rot, store: { key: S.key, name: S.ch.name, accent: S.ch.accent }, seatAt: seat && { x: seat[0], z: seat[1], y: GY + FL + o.seat.top, yaw: S.rot } };
    }) : [])),
  };
  return {
    update,
    night(on) { night = on; faceM.emissiveIntensity = on ? 0.55 : 0.06; if (poolMesh) poolMesh.visible = on; lastH = -1; },   // (brighter, and the bloom blurs the logos)
    // the convenience stores (for the city picked now): where to stand on the pavement at the door, facing it; whether
    // it is open; the way in to the till (outings.js walks it); pass() opens the door for whoever steps through
    doors: () => stores.filter((S) => S.ch && S.leaf != null).map((S) => {
      const w = (lx, lz) => { const [a, b] = S.toW(lx, lz); return { x: a, z: b }; }, d = w(0, 0.45);
      return { key: S.key, name: S.ch.name, accent: S.ch.accent, x: d.x, z: d.z, face: S.rot ? -Math.PI / 2 : Math.PI, open: !shut[S.n], h24: !S.ch.hours, opens: S.ch.hours ? fmtH(S.ch.hours[0]) : null,
        inside: [w(0, -0.5), w(1.2, -0.95)], till: { ...w(S.till.x, S.till.z), face: S.rot + Math.PI }, pass: () => { S.passUntil = now + 2.5; } };
    }),
    walk, shop,
  };
}

/* the small things people have in front of them or in hand, instanced: a laptop and its lit screen, a paper cup, a
   tokbokki cup, a cup of noodles, a bento box, a box of fried chicken, a cone, a carrier bag, a scooter, a courier's */
function propSet(G, n) {
  const kinds = {
    laptop: mergeAll([boxAt(0.32, 0.015, 0.22, 0, 0.008, 0, '#3A3F47'), boxAt(0.32, 0.2, 0.012, 0, 0.11, -0.11, '#2B2F36')]),
    screen: colorize(new THREE.PlaneGeometry(0.28, 0.17).translate(0, 0.11, -0.103), '#BFD8FF'),
    cup: colorize(new THREE.CylinderGeometry(0.04, 0.032, 0.12, 8).translate(0, 0.06, 0), '#F2F2F2'),
    tok: mergeAll([colorize(new THREE.CylinderGeometry(0.055, 0.04, 0.09, 10).translate(0, 0.045, 0), '#D62F2F'), boxAt(0.006, 0.16, 0.006, 0.02, 0.1, 0, '#D8C49A')]),
    noodle: mergeAll([colorize(new THREE.CylinderGeometry(0.055, 0.042, 0.1, 10).translate(0, 0.05, 0), '#F2F2F2'), colorize(new THREE.CylinderGeometry(0.056, 0.056, 0.012, 10).translate(0, 0.1, 0), '#E8742A')]),
    bento: mergeAll([boxAt(0.2, 0.05, 0.14, 0, 0.025, 0, '#1E1E1E'), boxAt(0.2, 0.01, 0.14, 0, 0.055, 0, '#E8E8E8')]),
    chicken: boxAt(0.14, 0.1, 0.1, 0, 0.05, 0, '#E60012'),
    cone: mergeAll([colorize(new THREE.ConeGeometry(0.03, 0.1, 8).rotateX(Math.PI), '#D9A441'), colorize(new THREE.SphereGeometry(0.035, 8, 6).translate(0, 0.065, 0), '#FFF8EC')]),
    bag: mergeAll([boxAt(0.22, 0.24, 0.1, 0, -0.12, 0, '#F4F3EE'), colorize(new THREE.SphereGeometry(0.05, 6, 4).translate(0.04, 0.02, 0), '#3E8E3A')]),
    courier: mergeAll([parkedScooter('#2E9E4A'), boxAt(0.42, 0.42, 0.42, -0.45, 1.05, 0, '#00A651')]),
    scooter: parkedScooter('#D96A8A'),
  };
  const meshes = {}, kindOf = [], Z0 = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  for (const [k, geo] of Object.entries(kinds)) {
    const o = new THREE.InstancedMesh(geo, k === 'screen' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : vmat({ roughness: 0.6 }), n);
    o.frustumCulled = false; o.count = 0; o.visible = false;
    for (let i = 0; i < n; i++) o.setMatrixAt(i, Z0);
    G.add(o); meshes[k] = o;
  }
  const free = [...Array(n).keys()].reverse();
  let dirty = false;
  return {
    take: () => free.pop() ?? null,
    show(i, kind, x, y, z, yaw) {
      const k = kinds[kind] ? kind : 'cup';
      if (kindOf[i] && kindOf[i] !== k) meshes[kindOf[i]].setMatrixAt(i, Z0);
      kindOf[i] = k; Q.setFromAxisAngle(UP, yaw); P.set(x, y, z); M.compose(P, Q, ONE); meshes[k].setMatrixAt(i, M); dirty = true;
    },
    hide(i) { if (kindOf[i]) { meshes[kindOf[i]].setMatrixAt(i, Z0); kindOf[i] = null; } free.push(i); dirty = true; },
    flush() {
      if (!dirty) return; dirty = false;
      for (const [k, o] of Object.entries(meshes)) { let top = 0; for (let i = n - 1; i >= 0; i--) if (kindOf[i] === k) { top = i + 1; break; } o.count = top; o.visible = top > 0; o.instanceMatrix.needsUpdate = true; }
    },
  };
}
let POOL;
function poolTexture() {
  return (POOL ??= (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = g.createRadialGradient(64, 40, 4, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,250,235,.42)'); r.addColorStop(0.5, 'rgba(255,245,225,.14)'); r.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })());
}
