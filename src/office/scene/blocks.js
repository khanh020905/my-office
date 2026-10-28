// Building blocks: materials, rounded boxes, cylinders, rugs, canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './renderer.js';

/* ---------- building blocks ---------- */
export const toonMat = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, ...o });
export const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };
export const mat = (color, o = {}) => toonMat({ color, ...o });
export const lampBulbs = [];
const asMat = (m) => (m && m.isMaterial ? m : mat(m));
export function rbox(w, h, d, m, r = 0.05) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, rr), asMat(m));
  mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
export function cyl(rt, rb, h, m, seg = 20) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), asMat(m)); mesh.castShadow = mesh.receiveShadow = true; return mesh; }
export function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
// Each rug sits a hair above the previous one, so overlapping rugs never z-fight.
let rugY = 0.004;
export function rug(x, z, w, d, color, r = 0.35) {
  const s = new THREE.Shape(), hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd); s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 8 }), noOutline(mat(color)));
  m.rotation.x = -Math.PI / 2; m.position.set(x, rugY, z); rugY += 0.0015; m.receiveShadow = true; scene.add(m); return m;
}
// Shrinks the canvas font (its px size) just enough for text to fit in maxW; text that already fits is left as drawn.
// Used where a translation may run longer than the sign or screen it is painted on.
export function fitText(g, text, maxW) { const w = g.measureText(text).width; if (w > maxW) g.font = g.font.replace(/(\d+(?:\.\d+)?)px/, (m, n) => `${Math.floor((n * maxW) / w)}px`); }
export function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
