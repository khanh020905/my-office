// The release history on the whiteboard: each version tag sends four people to the photo booth across the street
// (people/photobooth.js) and the strip they bring back, four frames of silly poses with the version written under them,
// is pinned along the bottom of the board's right half. The six newest stay (the oldest comes down), kept in this
// browser. The strip is drawn here, the same picture for the board and for the group chat: the four of them in their own
// hair, skin and shirt colours, a frame each with the booth's props (cat-ear headbands, giant heart sunglasses, party
// hats, finger hearts), the studio's name, the version and the day.
import * as THREE from 'three';
import { board } from '../world/furniture/board.js';

const KEY = 'office-photostrips', MAX = 6, FONT = '"Be Vietnam Pro", system-ui, sans-serif';
const SKINS = ['#F5D0B5', '#EBC3A0', '#E2B48F', '#F7DAC4'];
export const strips = [];   // { tag, day, people: [{ hair, skin, shirt }], seed }, oldest first
const BG = ['#FFD6E4', '#D4F2E4', '#E3DAFF', '#FFF0B8'];

/* ---------- the strip: four frames, top to bottom, on white with the studio's band at the foot ---------- */
function head(g, x, y, r, p, frame, k, seed) {
  // shoulders in the shirt, the face, the hair over it
  g.fillStyle = p.shirt || '#5F8FD8'; g.beginPath(); g.ellipse(x, y + r * 1.75, r * 1.05, r * 0.75, 0, Math.PI, 0); g.fill();
  g.fillStyle = p.skin || SKINS[(seed + k) % SKINS.length]; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = p.hair || '#3B2618'; g.beginPath(); g.arc(x, y - r * 0.08, r * 1.04, Math.PI * 1.05, Math.PI * 1.95); g.fill();
  g.beginPath(); g.ellipse(x, y - r * 0.55, r * 0.95, r * 0.42, 0, Math.PI, 0); g.fill();
  // the face: each frame its own silliness
  const eye = (ex, shut) => { g.fillStyle = '#2B2420'; if (shut) { g.lineWidth = r * 0.09; g.strokeStyle = '#2B2420'; g.beginPath(); g.arc(ex, y + r * 0.02, r * 0.13, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } else { g.beginPath(); g.arc(ex, y, r * 0.11, 0, Math.PI * 2); g.fill(); } };
  const wink = frame === 3 && k % 2 === 0;
  if (frame !== 1) { eye(x - r * 0.35, wink); eye(x + r * 0.35, frame === 0 && k === 2); }
  g.fillStyle = 'rgba(255,120,140,.45)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.55, y + r * 0.3, r * 0.17, r * 0.1, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#7A2E2E'; g.lineWidth = r * 0.08; g.fillStyle = '#7A2E2E';
  if (frame === 2) { g.beginPath(); g.ellipse(x, y + r * 0.45, r * 0.12, r * 0.15, 0, 0, Math.PI * 2); g.fill(); }   // (an "o": puffed cheeks)
  else if (frame === 3 && k % 2) { g.beginPath(); g.arc(x, y + r * 0.35, r * 0.25, 0.1, Math.PI - 0.1); g.stroke(); g.fillStyle = '#E8607A'; g.beginPath(); g.ellipse(x + r * 0.05, y + r * 0.6, r * 0.12, r * 0.14, 0, 0, Math.PI * 2); g.fill(); }   // (a tongue out)
  else { g.beginPath(); g.arc(x, y + r * 0.3, r * 0.3, 0.15, Math.PI - 0.15); g.stroke(); }
  // the props
  if (frame === 0) {   // cat-ear headbands, a V by the face
    g.fillStyle = ['#FF8FB8', '#1E2125', '#F4F4F2', '#FFD84A'][k % 4]; g.fillRect(x - r * 0.95, y - r * 0.92, r * 1.9, r * 0.14);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * r * 0.85, y - r * 0.85); g.lineTo(x + s * r * 0.55, y - r * 1.55); g.lineTo(x + s * r * 0.25, y - r * 0.92); g.fill(); }
    vSign(g, x + (k % 2 ? -1 : 1) * r * 1.05, y + r * 0.35, r * 0.55, p.skin || SKINS[k % 4]);
  } else if (frame === 1) {   // giant heart sunglasses
    g.fillStyle = ['#E8327A', '#FF7A1A', '#7A4FD8', '#18A0C8'][k % 4];
    for (const s of [-1, 1]) heart(g, x + s * r * 0.42, y - r * 0.02, r * 0.5);
    g.fillRect(x - r * 0.15, y - r * 0.12, r * 0.3, r * 0.08);
    g.fillStyle = 'rgba(30,20,30,.75)'; for (const s of [-1, 1]) heart(g, x + s * r * 0.42, y, r * 0.36);
  } else if (frame === 2) {   // party hats
    const c = ['#3FB6E8', '#FF6B9A', '#FFC93C', '#5DD39E'][k % 4];
    g.fillStyle = c; g.beginPath(); g.moveTo(x - r * 0.55, y - r * 0.8); g.lineTo(x + r * 0.1, y - r * 2.0); g.lineTo(x + r * 0.6, y - r * 0.75); g.fill();
    g.fillStyle = '#FFFFFF'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x - r * 0.25 + i * r * 0.2, y - r * (1.0 + i * 0.3), r * 0.07, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x + r * 0.1, y - r * 2.02, r * 0.12, 0, Math.PI * 2); g.fill();
  } else {   // finger hearts, a crown on one of them
    g.fillStyle = '#E8327A'; heart(g, x + (k % 2 ? 1 : -1) * r * 1.05, y + r * 0.8, r * 0.28);
    if (k === seed % 4) { g.fillStyle = '#FFC93C'; g.beginPath(); g.moveTo(x - r * 0.55, y - r * 0.9); for (let i = 0; i <= 4; i++) g.lineTo(x - r * 0.55 + (i * r * 1.1) / 4, y - r * (i % 2 ? 1.25 : 1.6)); g.lineTo(x + r * 0.55, y - r * 0.9); g.fill(); }
  }
}
function heart(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.6);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.1, x - s * 0.55, y - s * 0.9, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.55, y - s * 0.9, x + s * 1.1, y - s * 0.1, x, y + s * 0.6); g.fill();
}
function vSign(g, x, y, s, skin) {
  g.fillStyle = skin; g.beginPath(); g.ellipse(x, y, s * 0.32, s * 0.28, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(x, y); for (const a of [-0.3, 0.25]) { g.save(); g.rotate(a); g.fillRect(-s * 0.08, -s * 0.85, s * 0.16, s * 0.65); g.restore(); } g.restore();
}
/** draws a strip into (x, y, w, h) of g: e = { tag, day, people, seed } */
export function drawStrip(g, x, y, w, h, e) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h);
  const pad = w * 0.06, fh = (h - pad * 5 - w * 0.42) / 4, fw = w - pad * 2;
  for (let f = 0; f < 4; f++) {
    const fy = y + pad + f * (fh + pad);
    g.fillStyle = BG[(f + (e.seed || 0)) % 4]; g.fillRect(x + pad, fy, fw, fh);
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + pad + ((i * 37 + f * 19 + (e.seed || 0) * 7) % fw), fy + ((i * 23 + f * 11) % fh), w * 0.025, 0, Math.PI * 2); g.fill(); }
    const ppl = e.people.slice(0, 4), n = Math.max(1, ppl.length), r = Math.min(fw / (n * 2.6), fh * 0.22);
    g.save(); g.beginPath(); g.rect(x + pad, fy, fw, fh); g.clip();
    ppl.forEach((p, k) => head(g, x + pad + (fw * (k + 0.5)) / n + (k % 2 ? 1 : -1) * r * 0.1, fy + fh * 0.55 - (f === 3 && k % 2 ? r * 0.25 : 0), r, p, f, k, e.seed || 0));
    g.restore();
  }
  // the foot: the studio, the version, the day
  const fy = y + h - w * 0.42 - pad * 0.2;
  g.fillStyle = '#E8327A'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(w * 0.17)}px ${FONT}`; g.fillText(e.tag || '', x + w / 2, fy + w * 0.13, w - pad * 2);
  g.fillStyle = '#7A6A72'; g.font = `600 ${Math.round(w * 0.075)}px ${FONT}`; g.fillText(`${e.day || ''} · 4 khung`, x + w / 2, fy + w * 0.27, w - pad * 2);
  g.font = `800 ${Math.round(w * 0.065)}px ${FONT}`; g.fillStyle = '#B03A6A'; g.fillText('CHỤP ẢNH HÀN QUỐC', x + w / 2, fy + w * 0.37, w - pad * 2);
  g.restore();
}
/** the strip as a picture for the group chat (JPEG data URL), or null with no canvas */
export function stripPhoto(e) {
  try {
    const c = document.createElement('canvas'); c.width = 300; c.height = 900;
    const g = c.getContext('2d'); g.fillStyle = '#F6E7EE'; g.fillRect(0, 0, 300, 900);
    drawStrip(g, 20, 20, 260, 860, e);
    return c.toDataURL('image/jpeg', 0.85);
  } catch { return null; }
}

/* ---------- on the board: one mesh, a slot of one canvas each ---------- */
const CW = 128, CH = 384;
let mesh = null, canvas = null, tex = null;
function load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(a)) strips.splice(0, strips.length, ...a.slice(-MAX).filter((x) => x && x.tag && Array.isArray(x.people))); } catch { /* storage blocked */ } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(strips)); } catch { /* storage blocked */ } }
function render() {
  if (!strips.length) { if (mesh) mesh.visible = false; return; }
  if (!canvas) { canvas = document.createElement('canvas'); canvas.width = CW * MAX; canvas.height = CH; tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
  const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, CH);
  strips.forEach((e, i) => {
    drawStrip(g, i * CW + 4, 10, CW - 8, CH - 14, e);
    g.fillStyle = ['#E8327A', '#2E86DE', '#F2C230', '#2EA44F'][i % 4]; g.beginPath(); g.arc(i * CW + CW / 2, 14, 7, 0, Math.PI * 2); g.fill();   // the pin
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(i * CW + CW / 2 - 2, 12, 2.5, 0, Math.PI * 2); g.fill();
  });
  tex.needsUpdate = true;
  // newest on the right: each a little askew, along the bottom of the board's right half (below the sticky notes)
  const quads = strips.map((_, i) => {
    const p = new THREE.PlaneGeometry(0.13, 0.38), uv = p.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / MAX);
    return p.rotateZ(((i * 37) % 7 - 3) * 0.02).rotateY(Math.PI / 2).translate(0.058 + i * 0.0005, -0.575, -0.28 - (MAX - strips.length + i) * 0.205);
  });
  const geo = mergeQuads(quads);
  if (!mesh) { mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); board.add(mesh); }
  else { mesh.geometry.dispose(); mesh.geometry = geo; }
  mesh.visible = true;
}
function mergeQuads(list) {
  const pos = [], uv = [], nor = [], idx = [];
  list.forEach((g) => { const o = pos.length / 3, gi = g.index.array; pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); nor.push(...g.attributes.normal.array); for (const k of gi) idx.push(o + k); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
  return geo;
}
/** pins a new strip (the oldest comes down past six) */
export function pinStrip(e) {
  strips.push(e); while (strips.length > MAX) strips.shift();
  save(); render();
}

export function setup() {
  load(); render();
  document.fonts?.ready.then(() => { if (strips.length) render(); });
  if (new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.strips = { list: () => strips.map((x) => ({ tag: x.tag, day: x.day, n: x.people.length })), mesh: () => !!mesh?.visible, photo: (i = strips.length - 1) => (strips[i] ? stripPhoto(strips[i]) : null) }; }, 0);
}
