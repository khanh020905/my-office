// The karaoke box (company floor), where the front phone booth was, like the coin-op booths in Vietnamese malls: a
// soundproof cabin on a dark base, black frame, purple acoustic felt at the back and on the side toward the phone
// booth, glass toward the room so you can watch the singers, a lit KARAOKE band over the glass and over the door, an
// LED strip round the roof and the base. Inside: a screen on the back wall with a speaker each side, two mics on a
// shelf under it, headphones on a hook, a padded bench along the side and a light in the ceiling. The glass door faces
// the screen; it opens as people go in and out. What it shows and plays, and who sings: people/karaoke.js.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';

export const KTV_W = 512, KTV_H = 288;   // (the screen's canvas, 16:9)
// the box in its own frame: the screen's wall at -z, the door at +z, glass at -x, felt at +x
export const HX = 0.6, HZ = 0.62, TOP = 2.2;
export let KTV = null;

// the band over the glass: KARAOKE in white on a magenta-to-blue glow, notes either side
const bandTex = (text) => canvasTex(512, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#FF3D9A'); gr.addColorStop(0.5, '#A23CFF'); gr.addColorStop(1, '#3D7BFF');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF'; g.font = '900 40px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,255,255,.8)'; g.shadowBlur = 10; g.fillText(text, w / 2, h / 2 + 2);
  g.font = '700 34px system-ui, sans-serif'; g.fillText('♪', 40, h / 2 + 2); g.fillText('♫', w - 40, h / 2 + 2);
});

export function setup() {
  if (!PRO || !LAY.ktv) return;
  const [cx, cz, ry = 0] = LAY.ktv, g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
  const frame = mat('#1D1F26', { roughness: 0.35, metalness: 0.5 }), felt = mat('#3B2A5C', { roughness: 0.95 }), base = mat('#24222A', { roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#D7E6F5', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const keep = (o) => { o.userData.noMerge = true; return o; };   // (lit parts whose colour changes: never merged)
  const H = TOP - 0.07, midY = 0.07 + H / 2;

  /* base, floor, roof (its top a light lavender: from above it reads as a cabin, not a black box) */
  put(g, rbox(HX * 2 + 0.06, 0.07, HZ * 2 + 0.06, base, 0.02), 0, 0.035, 0);
  put(g, rbox(HX * 2 - 0.08, 0.012, HZ * 2 - 0.08, mat('#141418', { roughness: 0.3, metalness: 0.2 }), 0.004), 0, 0.076, 0);
  put(g, rbox(HX * 2 + 0.08, 0.08, HZ * 2 + 0.08, frame, 0.02), 0, TOP + 0.04, 0);
  put(g, rbox(HX * 2 - 0.02, 0.012, HZ * 2 - 0.02, mat('#E6DDF5', { roughness: 0.6 }), 0.004), 0, TOP + 0.085, 0);
  const ceilM = new THREE.MeshBasicMaterial({ color: '#B98CFF' });
  const ceil = keep(put(g, rbox(HX * 2 - 0.3, 0.012, HZ * 2 - 0.3, ceilM, 0.004), 0, TOP - 0.006, 0));
  const ledM = new THREE.MeshBasicMaterial({ color: '#FF4FB0' });   // (the strips round the roof's edge and the base, outside)
  for (const y of [TOP + 0.003, 0.074]) {
    for (const sz of [-1, 1]) keep(put(g, new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 0.09, 0.018, 0.012), ledM), 0, y, sz * (HZ + 0.045)));
    for (const sx of [-1, 1]) keep(put(g, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, HZ * 2 + 0.09), ledM), sx * (HX + 0.045), y, 0));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, rbox(0.06, H, 0.06, frame, 0.01), sx * HX, midY, sz * HZ);

  /* the back wall: felt, the screen in a black bezel with a speaker each side, a shelf with the two mics, headphones */
  put(g, rbox(HX * 2 - 0.06, H, 0.05, felt, 0.01), 0, midY, -HZ + 0.03);
  put(g, rbox(0.82, 0.5, 0.035, mat('#0C0D10', { roughness: 0.3 }), 0.012), 0, 1.42, -HZ + 0.07);
  const canvas = document.createElement('canvas'); canvas.width = KTV_W; canvas.height = KTV_H;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screen = keep(put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.43), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), 0, 1.42, -HZ + 0.089));
  for (const sx of [-1, 1]) {
    const sp = put(g, rbox(0.11, 0.32, 0.08, mat('#17181C', { roughness: 0.5 }), 0.02), sx * 0.49, 1.42, -HZ + 0.1);
    for (const y of [0.08, -0.07]) put(sp, cyl(y > 0 ? 0.026 : 0.04, y > 0 ? 0.026 : 0.04, 0.01, mat('#2C2E35', { roughness: 0.4, metalness: 0.4 }), 16), 0, y, 0.041).rotation.x = Math.PI / 2;
  }
  put(g, rbox(0.56, 0.03, 0.14, mat('#2A2530', { roughness: 0.5 }), 0.01), 0, 0.98, -HZ + 0.12);
  const mics = [-0.12, 0.12].map((x) => {
    const m = new THREE.Group(); m.position.set(x, 1.01, -HZ + 0.12); m.rotation.set(0, 0, Math.PI / 2 - 0.1); g.add(m);
    put(m, cyl(0.017, 0.012, 0.13, mat('#1C1D21', { roughness: 0.5 }), 12), 0, 0, 0);
    put(m, new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 10), mat('#AEB4BC', { metalness: 0.6, roughness: 0.45 })), 0, 0.09, 0);
    m.userData.dynamic = true;
    return m;
  });
  { const hp = new THREE.Group(); hp.position.set(-0.48, 1.0, -HZ + 0.08); g.add(hp);   // headphones on a hook
    put(hp, cyl(0.008, 0.008, 0.05, frame, 8), 0, 0.05, 0).rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 16, Math.PI), mat('#F2F2F4', { roughness: 0.5 })); band.position.set(0, 0, 0.04); hp.add(band);
    for (const sx of [-1, 1]) put(hp, cyl(0.035, 0.035, 0.025, mat('#F2F2F4', { roughness: 0.5 }), 14), sx * 0.07, -0.01, 0.04).rotation.z = Math.PI / 2; }

  /* the felt side (toward the phone booth), with the bench along it inside */
  put(g, rbox(0.05, H, HZ * 2 - 0.06, felt, 0.01), HX - 0.03, midY, 0);
  put(g, rbox(0.3, 0.38, HZ * 2 - 0.3, base, 0.03), HX - 0.2, 0.26, 0.04);
  put(g, rbox(0.32, 0.08, HZ * 2 - 0.28, mat('#C2477F', { roughness: 0.85 }), 0.04), HX - 0.2, 0.48, 0.04);

  /* the glass side, toward the room: a felt kick panel, glass, rails, the lit band at the top, the price on the glass */
  const bandM = new THREE.MeshBasicMaterial({ map: bandTex('KARAOKE'), toneMapped: false });
  put(g, rbox(0.04, 0.35, HZ * 2 - 0.06, felt, 0.01), -HX, 0.245, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.48, HZ * 2 - 0.06), glass), -HX, 1.17, 0);
  for (const y of [0.42, 1.92]) put(g, rbox(0.05, 0.04, HZ * 2, frame, 0.01), -HX, y, 0);
  put(g, rbox(0.02, 0.24, HZ * 2 - 0.06, frame, 0.01), -HX - 0.026, 2.05, 0);
  keep(put(g, new THREE.Mesh(new THREE.PlaneGeometry(HZ * 2 - 0.1, 0.2), bandM), -HX - 0.042, 2.05, 0)).rotation.y = -Math.PI / 2;
  { const d = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,.88)'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 14); c.fill();
      c.fillStyle = '#A23CFF'; c.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif'; c.fillText('5.000đ', 18, 48); c.fillStyle = '#4A4458'; c.font = '600 17px "Be Vietnam Pro", system-ui, sans-serif'; c.fillText('/ bài · QR', 20, 78);
      c.fillStyle = '#15161A'; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i * 7 + j * 3 + i * j) % 3 !== 0 || i % 6 === 0 || j % 6 === 0) c.fillRect(160 + i * 11, 22 + j * 11, 10, 10);
    });
    put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: d, transparent: true })), -HX - 0.009, 0.62, 0.3).rotation.y = -Math.PI / 2; }

  /* the door side: felt either side of a glass door on two hinges, a panel over it with the band, a long handle */
  const DW = 0.6;
  for (const sx of [-1, 1]) put(g, rbox((HX * 2 - DW) / 2 - 0.04, H, 0.05, felt, 0.01), sx * (HX + DW / 2 + 0.02) / 2, midY, HZ - 0.03);
  put(g, rbox(DW + 0.04, 0.22, 0.05, felt, 0.01), 0, TOP - 0.11, HZ - 0.03);
  keep(put(g, new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 - 0.1, 0.2), bandM), 0, 2.08, HZ + 0.006));
  const door = new THREE.Group(); door.position.set(DW / 2, 0, HZ - 0.02); g.add(door); door.userData.dynamic = true;
  put(door, rbox(0.035, 1.98, 0.035, frame, 0.008), -0.018, 1.06, 0);
  put(door, rbox(0.035, 1.98, 0.035, frame, 0.008), -DW + 0.018, 1.06, 0);
  put(door, rbox(DW, 0.04, 0.035, frame, 0.008), -DW / 2, 0.09, 0);
  put(door, rbox(DW, 0.04, 0.035, frame, 0.008), -DW / 2, 2.03, 0);
  put(door, new THREE.Mesh(new THREE.BoxGeometry(DW - 0.04, 1.9, 0.01), glass), -DW / 2, 1.06, 0);
  put(door, cyl(0.012, 0.012, 0.5, mat('#C9CDD3', { metalness: 0.7, roughness: 0.25 }), 8), -DW + 0.07, 1.05, 0.045);
  for (const y of [1.0, 1.1]) put(door, rbox(0.012, 0.012, 0.04, mat('#C9CDD3', { metalness: 0.7, roughness: 0.25 }), 0.003), -DW + 0.07, y, 0.025);

  // where people stand (floor coordinates): outside the door, just inside it, and the two places in front of the screen
  const c = Math.cos(ry), s = Math.sin(ry), at = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  KTV = { g, x: cx, z: cz, ry, canvas, ctx: canvas.getContext('2d'), tex, screen, door, ledM, ceilM, ceil, mics,
    out: at(0, HZ + 0.45), in: at(0, HZ - 0.32), sing: [at(-0.2, 0.02), at(0.06, 0.18)], face: ry + Math.PI, at };
}
