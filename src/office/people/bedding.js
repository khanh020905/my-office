// Nap bedding: blanket, pillow, folding it away.
import * as THREE from 'three';
import { canvasTex, mat, put, rbox } from '../scene/blocks.js';

let blanketTex;
// The blanket's shape over someone leaning back in the chair (chair-local metres): a centre line from the belly over
// the thighs and knees and down the shins, sides falling away from the middle, a few soft folds. One sided cloth.
function blanketGeo() {
  const prof = [[0.12, 0.85], [0.24, 0.81], [0.36, 0.77], [0.46, 0.745], [0.53, 0.68], [0.565, 0.55], [0.575, 0.42], [0.58, 0.31]];
  const len = [0]; for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = len.at(-1), SU = 20, SV = 26, W = 0.82, pos = [], uv = [], idx = [];
  const at = (d) => { let i = 1; while (i < prof.length - 1 && len[i] < d) i++; const k = (d - len[i - 1]) / (len[i] - len[i - 1] || 1); return [prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * k, prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * k]; };
  for (let j = 0; j <= SV; j++) {
    const v = j / SV, [z, y] = at(v * total), lap = Math.min(1, Math.max(0, (0.55 - Math.abs(v - 0.35)) / 0.35));
    for (let i = 0; i <= SU; i++) {
      const u = (i / SU) * 2 - 1, a = Math.abs(u);
      const fall = (a > 0.42 ? ((a - 0.42) / 0.58) ** 1.6 : 0) * (0.06 + 0.22 * lap);     // sides drape down over the thighs
      const fold = 0.011 * Math.sin(v * 21 + u * 2.4) * (1 - a * 0.4) + 0.008 * Math.sin(u * 9 + v * 5);
      pos.push(u * W / 2 * (1 - 0.06 * fall), y - fall + fold, z - fall * 0.18);
      uv.push(i / SU, 1 - v);
    }
  }
  for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) { const a = j * (SU + 1) + i, b = a + SU + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
let BLANKET_GEO;
// warm blanket colours, picked to stand apart from the sleeper's hoodie
const BLANKETS = ['#F4C95D', '#F28FA8', '#F7A05A', '#9ED9A8', '#C7A6F2', '#7FD3D9'];
export function blanketFor(shirt) {
  const c = new THREE.Color(shirt), hsl = {}; c.getHSL(hsl);
  let best = BLANKETS[0], far = -1;
  for (const b of BLANKETS) { const h = {}; new THREE.Color(b).getHSL(h); const d = Math.min(Math.abs(h.h - hsl.h), 1 - Math.abs(h.h - hsl.h)); if (d > far) { far = d; best = b; } }
  return best;
}
export let pillowM;
export function makeBedding(chair) {
  const m = mat('#9DB4D8', { map: blanketTex, roughness: 1, side: THREE.DoubleSide });
  const blanket = new THREE.Group(); chair.add(blanket);
  const cloth = new THREE.Mesh(BLANKET_GEO, m); cloth.castShadow = cloth.receiveShadow = true; blanket.add(cloth);
  const pillow = put(chair.userData.back, rbox(0.42, 0.24, 0.16, pillowM, 0.07), 0, 0.52, 0.13);
  const folded = put(chair, rbox(0.36, 0.12, 0.28, m, 0.05), 0, 0.72, 0.2);   // the blanket once folded
  blanket.visible = pillow.visible = folded.visible = false;
  return { blanket, pillow, folded, m, state: 'off', t: 0 };
}

export function setup() {
  /* nap bedding: a blanket (lap + the part hanging over the knees) and a pillow on the reclined chair back. Hidden until
     someone naps; on waking the blanket is folded, set on the desk, then put away. */
  // a knitted fleece blanket: soft plaid, a darker hem all round, a little fuzz (tinted per blanket, white = the colour)
  blanketTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 43) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(i + 10, 0, 16, 256); g.fillRect(0, i + 10, 256, 16); }
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 256; i += 43) { g.fillRect(i + 31, 0, 2, 256); g.fillRect(0, i + 31, 256, 2); }
    for (let k = 0; k < 2600; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.09)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 244);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.strokeRect(16, 16, 224, 224);
  });
  BLANKET_GEO = blanketGeo();
  blanketTex.anisotropy = 8;
  pillowM = mat('#F6F1E7', { roughness: 0.95 });
}
