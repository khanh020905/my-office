// Company floor building pieces: floor finishes, walls, glass, chairs, dining sets.
import * as THREE from 'three';
import { rand, tint } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, fitText, mat, noOutline, put, rbox, toonMat } from '../../scene/blocks.js';
import { metal, woodDark, woodMid } from '../terrace.js';
import { partitionGlass } from '../furniture/server-racks.js';

/* ---------- the company floor (pro plan) ----------
   Rooms along the two outer walls (tall things only there, so nothing hides the floor from the camera), glass or
   half-height walls everywhere else, a floor finish per room. Furniture that people use is placed by the shared code
   (desks, shelf, racks, coffee corner, sofa…); this adds the rest. Moving parts are kept in PRO_FX. */
export const PRO_FX = { stalls: [], plaques: [] };
// My Office's own mark, a small office block (a 24-unit square; fill it 'evenodd': the windows and the door are holes),
// for the header, the lobby sign, photos and the weekly card
export const OFFICE_MARK = 'M7 2h10a3 3 0 0 1 3 3v17H4V5a3 3 0 0 1 3-3zM7.5 6h3v3h-3zM13.5 6h3v3h-3zM7.5 11h3v3h-3zM13.5 11h3v3h-3zM10.2 17h3.6v5h-3.6z';
// the Claude mark (Simple Icons, CC0 path data; the trademark is Anthropic's), on the session list for Claude Code sessions
export const CLAUDE_MARK = 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';
const frostM = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false });
// planks (hue, lightness), carpet, tiles and concrete for the room floors, drawn once
export function plankTex(h, l, sat = 40) {
  return canvasTex(1024, 768, (g, w, hh) => {
    const rows = 24, rh = hh / rows;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * 200;
      while (x < w) {
        const pw = rand(200, 380), ll = l + rand(-6, 5), grd = g.createLinearGradient(x, 0, x + pw, 0);
        grd.addColorStop(0, `hsl(${h}, ${sat}%, ${ll}%)`); grd.addColorStop(1, `hsl(${h - 2}, ${sat - 2}%, ${ll - 4}%)`);
        g.fillStyle = grd; g.fillRect(x, r * rh, pw, rh); g.fillStyle = 'rgba(60,40,20,.32)'; g.fillRect(x, r * rh, 2, rh); x += pw;
      }
      g.fillStyle = 'rgba(60,40,20,.34)'; g.fillRect(0, r * rh, w, 1.5);
    }
    for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(90,60,30,${rand(0.03, 0.08)})`; g.fillRect(rand(0, w), rand(0, hh), rand(20, 90), 1); }
  });
}
export function speckTex(base, n = 2600, a = 0.07) {
  return canvasTex(256, 256, (g) => { g.fillStyle = base; g.fillRect(0, 0, 256, 256); for (let i = 0; i < n; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
}
export function gridTex(base, line, n, checker = null, lw = 2) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256); const s = 256 / n;
    if (checker) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) { g.fillStyle = checker; g.fillRect(i * s, j * s, s, s); }
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.01, 0.04)})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = line; for (let i = 0; i <= n; i++) { g.fillRect(i * s - lw / 2, 0, lw, 256); g.fillRect(0, i * s - lw / 2, 256, lw); }
  });
}
export function floorZone(x0, x1, z0, z1, tex, tile = 0, o = {}) {
  const w = x1 - x0, d = z1 - z0;
  if (tile) { tex = tex.clone(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / tile, d / tile); tex.needsUpdate = true; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), noOutline(toonMat({ map: tex, roughness: 0.6, ...o })));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
}
// A wall from a to b along x or z. gaps: [from, to] distances from a that stay open (doorways, with a header).
function wallRun(ax, az, bx, bz, gaps, build) {
  const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
  const g = new THREE.Group(); g.position.set(ax, 0, az); g.rotation.y = -ang; scene.add(g);
  let t = 0; const segs = [];
  for (const [g0, g1] of gaps) { segs.push([t, g0]); t = g1; }
  segs.push([t, len]);
  for (const [t0, t1] of segs) if (t1 - t0 > 0.04) build(g, t0, t1);
  return g;
}
export function glassWall(ax, az, bx, bz, gaps = [], h = 2.5) {
  const g = wallRun(ax, az, bx, bz, gaps, (g, t0, t1) => {
    const w = t1 - t0, cx = (t0 + t1) / 2;
    put(g, new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.1, 0.03), partitionGlass), cx, h / 2, 0);
    put(g, new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, 0.036), frostM), cx, 1.15, 0);
    put(g, rbox(w, 0.08, 0.08, metal, 0.01), cx, 0.04, 0); put(g, rbox(w, 0.06, 0.08, metal, 0.01), cx, h, 0);
    const n = Math.max(1, Math.round(w / 1.25));
    for (let i = 0; i <= n; i++) put(g, rbox(0.05, h, 0.07, metal, 0.01), t0 + (i * w) / n, h / 2, 0);
  });
  for (const [g0, g1] of gaps) put(g, rbox(g1 - g0 + 0.05, 0.12, 0.09, metal, 0.01), (g0 + g1) / 2, h - 0.02, 0);
  return g;
}
let lowWallM;
let cutM;
let skirtM;
let jambM;
export function lowWall(ax, az, bx, bz, gaps = [], h = 1.3, m = lowWallM) {
  const g = wallRun(ax, az, bx, bz, gaps, (g, t0, t1) => {
    const w = t1 - t0, cx = (t0 + t1) / 2;
    put(g, rbox(w, h, 0.14, m, 0.01), cx, h / 2, 0);
    put(g, rbox(w + 0.005, 0.03, 0.145, cutM, 0.004), cx, h + 0.012, 0);
    put(g, rbox(w, 0.1, 0.17, skirtM, 0.01), cx, 0.05, 0);
  });
  for (const [g0, g1] of gaps) {
    for (const t of [g0, g1]) put(g, rbox(0.07, h + 0.02, 0.2, jambM, 0.01), t, (h + 0.02) / 2, 0);
    put(g, rbox(g1 - g0, 0.014, 0.18, skirtM, 0.004), (g0 + g1) / 2, 0.007, 0);
  }
  return g;
}
// a coloured panel painted on an outer wall: the back wall (z = -8) between x0 and x1, or the left wall (x = -8)
export const backPanel = (x0, x1, color, y0 = 0, y1 = 4.1) => put(scene, rbox(x1 - x0, y1 - y0, 0.03, mat(color, { roughness: 0.9 }), 0.005), (x0 + x1) / 2, (y0 + y1) / 2, -7.985);
export const leftPanel = (z0, z1, color, y0 = 0, y1 = 4.1) => put(scene, rbox(0.03, y1 - y0, z1 - z0, mat(color, { roughness: 0.9 }), 0.005), -7.985, (y0 + y1) / 2, (z0 + z1) / 2);
// text plates (room plaques, the logo) drawn on a canvas
export function plateTex(text, sub, o = {}) {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = o.bg || '#1E232B'; g.fillRect(0, 0, w, h);
    g.fillStyle = o.fg || '#F3EFE8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${o.size || 58}px "Be Vietnam Pro", system-ui, sans-serif`; fitText(g, text, w - 56); g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = `600 26px "Be Vietnam Pro", system-ui, sans-serif`; g.fillStyle = o.sub || '#A9B2C0'; g.fillText(sub, w / 2, h * 0.76); }
  });
}
export function chairUph(x, z, face, color, scale = 1) {   // an upholstered chair, back toward -z before turning
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = face; c.scale.setScalar(scale); scene.add(c);
  const m = mat(color, { roughness: 0.95 });
  put(c, rbox(0.56, 0.16, 0.54, m, 0.06), 0, 0.42, 0);
  const back = rbox(0.56, 0.52, 0.12, m, 0.06); back.position.set(0, 0.72, -0.24); back.rotation.x = -0.12; c.add(back);
  for (const sx of [-1, 1]) put(c, rbox(0.08, 0.22, 0.5, m, 0.04), sx * 0.29, 0.56, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(c, cyl(0.022, 0.018, 0.36, woodDark, 6), sx * 0.22, 0.18, sz * 0.2);
  return c;
}
export function armchair(x, z, face, color) {   // a deep reading chair
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = face; scene.add(c);
  const m = mat(color, { roughness: 0.9 });
  put(c, rbox(0.86, 0.3, 0.78, m, 0.1), 0, 0.3, 0);
  put(c, rbox(0.76, 0.12, 0.62, mat(tint(color, 0.2), { roughness: 0.9 }), 0.05), 0, 0.5, 0.06);
  put(c, rbox(0.86, 0.66, 0.2, m, 0.1), 0, 0.72, -0.3);
  for (const sx of [-1, 1]) put(c, rbox(0.16, 0.46, 0.78, m, 0.08), sx * 0.36, 0.5, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(c, cyl(0.03, 0.025, 0.14, woodDark, 6), sx * 0.34, 0.07, sz * 0.3);
  return c;
}
export function diningSet(x, z) {   // a table for four, chairs on the long sides
  put(scene, rbox(1.3, 0.05, 0.8, mat('#F3EFE8', { roughness: 0.4 }), 0.02), x, 0.745, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(scene, cyl(0.025, 0.025, 0.72, woodMid, 8), x + sx * 0.56, 0.36, z + sz * 0.32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Group(); c.position.set(x + sx * 0.33, 0, z + sz * 0.62); c.rotation.y = sz > 0 ? Math.PI : 0; scene.add(c);
    const m = mat(['#F2B33D', '#3F7CC4', '#E8742A', '#6A8042'][(sx + 1) + (sz + 1) / 2], { roughness: 0.6 });
    put(c, rbox(0.42, 0.06, 0.4, m, 0.03), 0, 0.45, 0);
    const b = rbox(0.42, 0.34, 0.05, m, 0.03); b.position.set(0, 0.66, -0.2); b.rotation.x = -0.1; c.add(b);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) put(c, cyl(0.016, 0.014, 0.44, woodMid, 6), lx * 0.17, 0.22, lz * 0.16);
  }
  put(scene, cyl(0.12, 0.09, 0.07, '#FFFFFF', 16), x + 0.25, 0.8, z);   // fruit bowl
  for (const [dx, c] of [[0.2, '#E63946'], [0.28, '#FFD166'], [0.24, '#7BC043']]) put(scene, new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(c)), x + dx, 0.85, z + (dx - 0.24) * 1.5);
  put(scene, cyl(0.05, 0.04, 0.12, '#BFE3F2'), x - 0.35, 0.83, z + 0.1);
}

export function setup() {
  // Interior walls are real walls, 14 cm thick, shown cut away at 1.3 m like an architect's model so the camera sees
  // into every room: a dark cap where the cut is, skirting on both faces, and at each doorway jambs and a threshold.
  lowWallM = mat('#ECE6DC', { roughness: 0.9 }); cutM = mat('#3B4049', { roughness: 0.7 }); skirtM = mat('#8D7F70', { roughness: 0.7 }); jambM = mat('#6E6052', { roughness: 0.6 });
}
