// The pool table (company floor), on the lounge's right side between the sofa and the arcade: a 7-foot table (green
// cloth with its spots, cushions, walnut rails inlaid with pearl diamonds, six leather pockets, turned legs), a rug
// under it, chalk on the rail, and a round cue stand by the arcade. The balls are built here too (their numbers
// painted on); where they roll, the cues and the game are people/billiards.js's.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox, rug } from '../../scene/blocks.js';
import { LAY } from '../layout.js';

// the playing surface inside the cushions, in the table's own frame (x across, z along, centred); the cloth's height;
// the balls' radius (a little under a real ball's 28.5 mm: the table is a little under a real 7-footer)
export const PX = 0.47, PZ = 0.93, CLOTH_Y = 0.79, BALL_R = 0.025;
const CUSH = 0.04, RAIL = 0.085, OX = PX + CUSH + RAIL, OZ = PZ + CUSH + RAIL, RAIL_Y = CLOTH_Y + 0.045;
// the six pockets: their centres (a ball whose centre comes this close drops) and how far along a cushion each mouth opens
export const POCKETS = [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * (PX + (sz ? 0.012 : 0.03)), z: sz * (PZ + 0.012), r: sz ? 0.056 : 0.05, side: !sz }));
export const OUTER = [OX, OZ];   // (the table's half size, outside its rails)
export const BALL_COLORS = ['#F7F4EA', '#F2C230', '#2350A8', '#D2302A', '#5B2D8E', '#E9762B', '#1F7A45', '#7A1F2B', '#15161A'];
export let BIL = null;

// a ball's skin: its colour all round (a solid) or a white ball with a broad band (a stripe), its number in a white disc
// on two sides; the cue ball plain, with a red dot
function ballTex(n) {
  return canvasTex(128, 64, (g, w, h) => {
    const c = BALL_COLORS[n > 8 ? n - 8 : n], stripe = n > 8;
    g.fillStyle = stripe ? '#F7F4EA' : c; g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = c; g.fillRect(0, h * 0.27, w, h * 0.46); }
    if (!n) { g.fillStyle = '#C8302A'; for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.arc(x, h / 2, 3, 0, 7); g.fill(); } return; }
    for (const x of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#FBFAF4'; g.beginPath(); g.ellipse(x, h / 2, 11, 13, 0, 0, 7); g.fill();
      g.fillStyle = '#15161A'; g.font = `800 ${n > 9 ? 12 : 15}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), x, h / 2 + 1);
    }
  });
}
// the cloth: green felt with a little grain, the head string's spot and the foot spot
const clothTex = () => canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#2C7A4E'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,.75)'; for (const y of [h * 0.25, h * 0.75]) { g.beginPath(); g.arc(w / 2, y, 2.4, 0, 7); g.fill(); }
});

export function setup() {
  if (!PRO || !LAY.bil) return;
  const [cx, cz] = LAY.bil, g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
  const walnut = mat('#5A3A26', { roughness: 0.45 }), body = mat('#3E281B', { roughness: 0.55 }), leather = mat('#1F1612', { roughness: 0.6 });
  const cushM = mat('#256B43', { roughness: 0.85 }), black = mat('#060607', { roughness: 0.9 }), pearl = mat('#F3EBDD', { roughness: 0.3, metalness: 0.2 }), brass = mat('#B8923E', { roughness: 0.35, metalness: 0.7 });
  rug(cx, cz, 2.4, 3.2, '#7A2E2A');

  /* the body: an apron round a slate bed, on six turned legs with a stretcher between the ends */
  put(g, rbox(OX * 2, 0.16, OZ * 2, body, 0.03), 0, CLOTH_Y - 0.1, 0);
  put(g, rbox(OX * 2 + 0.02, 0.025, OZ * 2 + 0.02, walnut, 0.01), 0, CLOTH_Y - 0.18, 0);                     // the apron's lip
  for (const sx of [-1, 1]) for (const z of [-1, 0, 1]) {
    const x = sx * (OX - 0.1), zz = z * (OZ - 0.12);
    put(g, cyl(0.055, 0.045, 0.5, walnut, 14), x, 0.33, zz);
    put(g, cyl(0.07, 0.07, 0.06, walnut, 14), x, 0.56, zz);                                                       // the collar under the apron
    put(g, cyl(0.06, 0.07, 0.07, walnut, 14), x, 0.035, zz);                                                      // the foot
  }
  put(g, rbox(0.07, 0.07, OZ * 2 - 0.3, walnut, 0.02), 0, 0.2, 0);

  /* the cloth, then cushions and rails around it, broken at the six pockets */
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(PX * 2 + CUSH * 2, PZ * 2 + CUSH * 2), mat('#FFFFFF', { map: clothTex(), roughness: 0.95 }));
  cloth.rotation.x = -Math.PI / 2; cloth.receiveShadow = true; put(g, cloth, 0, CLOTH_Y, 0);
  const gapC = 0.07, gapM = 0.055;   // (each pocket's mouth, along the cushion: the corner ones a little wider)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // the long sides, two runs each between a corner and the middle
    const z0 = gapM, z1 = PZ - gapC, len = z1 - z0, zc = sz * (z0 + len / 2);
    put(g, rbox(CUSH, 0.035, len, cushM, 0.008), sx * (PX + CUSH / 2), CLOTH_Y + 0.018, zc);
    put(g, rbox(RAIL, 0.05, len + 0.05, walnut, 0.012), sx * (PX + CUSH + RAIL / 2), RAIL_Y - 0.02, zc);
  }
  for (const sz of [-1, 1]) {                             // the ends
    const len = (PX - gapC) * 2;
    put(g, rbox(len, 0.035, CUSH, cushM, 0.008), 0, CLOTH_Y + 0.018, sz * (PZ + CUSH / 2));
    put(g, rbox(len + 0.05, 0.05, RAIL, walnut, 0.012), 0, RAIL_Y - 0.02, sz * (PZ + CUSH + RAIL / 2));
  }
  // the pockets: a hole in the cloth, and over the rails round it a leather cap open in the middle (a ring on top, its
  // outer wall down to the apron), a brass edge to the opening
  // (only over the rails' side of it: the side toward the cloth stays open for the balls)
  for (const p of POCKETS) {
    const sx = Math.sign(p.x), sz = Math.sign(p.z), arc = 1.15 * Math.PI;
    put(g, cyl(p.r, p.r * 0.92, 0.09, black, 18), p.x, CLOTH_Y + 0.003 - 0.045, p.z);
    const top = new THREE.Mesh(new THREE.RingGeometry(p.r + 0.003, 0.09, 24, 1, Math.atan2(-sz, sx) - arc / 2, arc), leather); top.rotation.x = -Math.PI / 2; put(g, top, p.x, RAIL_Y + 0.006, p.z);
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 24, 1, true, Math.atan2(sx, sz) - arc / 2, arc), leather), p.x, RAIL_Y - 0.029, p.z);
    put(g, new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.004, 0.004, 6, 22, arc), brass), p.x, RAIL_Y + 0.007, p.z).rotation.set(Math.PI / 2, 0, Math.atan2(sz, sx) - arc / 2);
  }
  // the diamonds on the rails: three to each half of a long side, three on each end
  const dia = (x, z) => { const d = put(g, rbox(0.016, 0.004, 0.016, pearl, 0.003), x, RAIL_Y + 0.006, z); d.rotation.y = Math.PI / 4; };
  for (const sx of [-1, 1]) for (const k of [-3, -2, -1, 1, 2, 3]) dia(sx * (PX + CUSH + RAIL / 2), (k * PZ) / 4);
  for (const sz of [-1, 1]) for (const k of [-1, 0, 1]) dia((k * PX) / 2, sz * (PZ + CUSH + RAIL / 2));
  // chalk on the rail, a cube by each end
  for (const [x, z] of [[PX + CUSH + RAIL / 2, -PZ * 0.62], [-(PX + CUSH + RAIL / 2), PZ * 0.62]]) {
    put(g, rbox(0.022, 0.02, 0.022, mat('#3B6FB6', { roughness: 0.8 }), 0.004), x, RAIL_Y + 0.016, z);
  }

  /* the balls (moved by the game: dynamic, so they are never merged into the table) */
  const geo = new THREE.SphereGeometry(BALL_R, 18, 12), balls = [];
  for (let n = 0; n <= 15; n++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTex(n), roughness: 0.18, metalness: 0.05 }));
    m.castShadow = true; m.userData.dynamic = true; g.add(m); balls.push(m);
  }

  /* the cue stand by the arcade: a round walnut base, a post, a ring of slots at waist height, six cues round it */
  const rack = new THREE.Group(); rack.position.set(cx - 0.3, 0, cz + 2.25); scene.add(rack);
  put(rack, cyl(0.17, 0.19, 0.06, walnut, 20), 0, 0.03, 0);
  put(rack, cyl(0.025, 0.025, 1.0, walnut, 10), 0, 0.53, 0);
  put(rack, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 24), walnut), 0, 0.95, 0).rotation.x = Math.PI / 2;
  const cues = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, c = cueMesh(k % 2 ? '#7A4A2A' : '#2B2F36'); c.position.set(Math.sin(a) * 0.13, 0.06, Math.cos(a) * 0.13); c.rotation.set(Math.cos(a) * 0.02, 0, -Math.sin(a) * 0.02); rack.add(c); cues.push(c); }
  BIL = { g, x: cx, z: cz, balls, rack, cues, OX, OZ };
}

// a cue, butt on its local origin and tip up +y, 1.45 m: maple shaft, a white ferrule, a blue chalked tip, a wrapped
// grip and a dark butt (also the cues people hold: people/billiards.js)
export function cueMesh(butt = '#2B2F36') {
  const c = new THREE.Group();
  // (a little thicker than a real one, 9–19 mm, so it reads at the office's distance)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.015, 1.0, 10), mat('#E2C99A', { roughness: 0.45 })); shaft.position.y = 0.95; c.add(shaft);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0175, 0.3, 10), mat('#1C1D21', { roughness: 0.8 })); wrap.position.y = 0.3; c.add(wrap);
  const end = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.019, 0.15, 10), mat(butt, { roughness: 0.4 })); end.position.y = 0.075; c.add(end);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), mat('#C9A227', { metalness: 0.6, roughness: 0.3 })); ring.position.y = 0.455; c.add(ring);
  const fer = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10), mat('#F5F2EA')); fer.position.y = 1.44; c.add(fer);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0088, 0.009, 0.008, 10), mat('#3B6FB6', { roughness: 0.9 })); tip.position.y = 1.454; c.add(tip);
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.dynamic = true; } });
  c.userData.dynamic = true;
  return c;
}
