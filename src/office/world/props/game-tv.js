// The lounge TV (company floor): a 55" TV on a low walnut media unit against the back wall, facing the sofa, with a games
// console standing beside it, two controllers lying on top, a soundbar, a plant, and a glow on the wall behind it that
// takes the colour of the picture. What it shows (games, the menu, standby) is people/gaming.js's: it draws on GTV.ctx.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';

export const SCREEN_W = 384, SCREEN_H = 216;   // (the games' canvas: 16:9, drawn as chunky pixels)
export let GTV = null;

// a controller lying on the unit (or in someone's hands, people/gaming.js): grips, sticks, a touchpad, a light bar
export function padMesh(body = '#F2F3F5', trim = '#1C1F25') {
  const g = new THREE.Group(), b = mat(body, { roughness: 0.45 }), t = mat(trim, { roughness: 0.5 });
  put(g, rbox(0.15, 0.03, 0.068, b, 0.014), 0, 0.016, 0);                                          // (its underside on y 0)
  for (const sx of [-1, 1]) { const grip = put(g, new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), b), sx * 0.058, 0.016, 0.03); grip.scale.set(0.85, 0.5, 1.25); }
  for (const sx of [-1, 1]) put(g, cyl(0.011, 0.011, 0.008, t, 12), sx * 0.032, 0.034, 0.012);    // sticks
  put(g, rbox(0.05, 0.004, 0.026, t, 0.002), 0, 0.032, -0.01);                                     // touchpad
  put(g, rbox(0.044, 0.004, 0.005, mat('#5FA8FF', { emissive: '#3A7BFF', emissiveIntensity: 0.8 }), 0.002), 0, 0.026, -0.034);   // light bar
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.dynamic = true; } });
  return g;
}

export function setup() {
  if (!PRO || !LAY.gameTv) return;
  const [cx, cz] = LAY.gameTv, g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
  const walnut = mat('#6B4A33', { roughness: 0.6 }), dark = mat('#2A2420', { roughness: 0.7 }), oak = mat('#B58A60', { roughness: 0.55 });
  const black = mat('#16181C', { roughness: 0.35, metalness: 0.2 }), steel = mat('#2C3036', { roughness: 0.4, metalness: 0.5 });

  /* the media unit: 1.8 m on four steel legs; a cupboard each side behind a slatted door, and between them two open
     cubbies (the router below, game boxes above). Built from boards, so the cubbies really are open. */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, cyl(0.018, 0.012, 0.08, steel, 8), sx * 0.82, 0.04, sz * 0.16);
  put(g, rbox(1.8, 0.03, 0.42, walnut, 0.008), 0, 0.095, 0);                                       // bottom
  put(g, rbox(1.8, 0.42, 0.02, walnut, 0.006), 0, 0.29, -0.2);                                      // back
  for (const sx of [-1, 1]) put(g, rbox(0.03, 0.42, 0.42, walnut, 0.008), sx * 0.885, 0.29, 0);     // ends
  for (const sx of [-1, 1]) put(g, rbox(0.03, 0.39, 0.4, walnut, 0.006), sx * 0.3, 0.3, 0);         // the cubbies' sides
  put(g, rbox(1.82, 0.03, 0.44, oak, 0.01), 0, 0.515, 0);                                           // top
  put(g, rbox(0.57, 0.39, 0.01, dark, 0.004), 0, 0.3, -0.183);                                       // the cubbies' dark back
  put(g, rbox(0.57, 0.02, 0.38, walnut, 0.005), 0, 0.3, 0);                                          // the shelf between them
  for (const sx of [-1, 1]) {
    put(g, rbox(0.555, 0.38, 0.02, walnut, 0.006), sx * 0.5925, 0.3, 0.2);                           // door
    for (let i = 0; i < 9; i++) put(g, rbox(0.035, 0.36, 0.012, oak, 0.004), sx * (0.36 + i * 0.058), 0.3, 0.215);   // its slats
    put(g, rbox(0.012, 0.09, 0.012, steel, 0.004), sx * 0.335, 0.3, 0.228);                         // handle
  }
  put(g, rbox(0.22, 0.04, 0.15, mat('#F4F4F2', { roughness: 0.5 }), 0.01), -0.06, 0.13, 0.0);       // router, its lights blinking
  const routerLed = put(g, rbox(0.06, 0.008, 0.004, mat('#7CE38B', { emissive: '#3BD15A', emissiveIntensity: 1.2 }), 0.002), -0.06, 0.135, 0.077);
  routerLed.userData.noMerge = true;
  for (let i = 0; i < 4; i++) { const box = put(g, rbox(0.022, 0.17, 0.13, mat(['#2B6CB0', '#C53030', '#2F855A', '#E0A526'][i], { roughness: 0.6 }), 0.004), -0.2 + i * 0.026, 0.396, 0.02); if (i === 3) box.rotation.z = 0.18; }   // game boxes, standing

  /* the TV: a thin black bezel on a pedestal, the screen a canvas (people/gaming.js draws on it) */
  put(g, rbox(0.34, 0.012, 0.2, steel, 0.004), 0, 0.536, -0.02);
  put(g, rbox(0.07, 0.11, 0.03, steel, 0.006), 0, 0.6, -0.07);
  const H = 0.69, W = 1.22, y0 = 0.635 + H / 2 + 0.015;
  put(g, rbox(W + 0.03, H + 0.03, 0.03, black, 0.008), 0, y0, -0.06);
  put(g, rbox(W - 0.1, H - 0.1, 0.05, black, 0.02), 0, y0, -0.1);                                 // (its back)
  const canvas = document.createElement('canvas'); canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const screenM = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const screen = put(g, new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenM), 0, y0, -0.044);
  screen.userData.noMerge = true;
  // a sheen across the glass, faint, so the screen reads as glass when it is off
  const sheen = put(g, new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.05, depthWrite: false })), 0, y0, -0.043);
  sheen.userData.noMerge = true; sheen.renderOrder = 2;
  const led = put(g, rbox(0.012, 0.006, 0.004, new THREE.MeshBasicMaterial({ color: '#D63A3A' }), 0.001), 0.5, y0 - H / 2 - 0.009, -0.043);
  led.userData.noMerge = true;
  // the glow on the wall behind it (bias lighting): a soft patch that takes the picture's colour
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c); })();
  const glowM = new THREE.MeshBasicMaterial({ map: glowTex, color: '#5FA8FF', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = put(g, new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.45), glowM), 0, y0 + 0.05, -0.2);
  glow.userData.noMerge = true;

  /* beside it: the console standing up (white wings round a black core, a blue line of light), a soundbar, a plant */
  const con = new THREE.Group(); con.position.set(0.74, 0.53, -0.04); g.add(con);
  put(con, rbox(0.1, 0.38, 0.25, black, 0.02), 0, 0.2, 0);
  for (const sx of [-1, 1]) put(con, rbox(0.02, 0.4, 0.27, mat('#F4F5F7', { roughness: 0.35 }), 0.015), sx * 0.055, 0.21, 0);
  const conLed = put(con, rbox(0.004, 0.3, 0.004, new THREE.MeshBasicMaterial({ color: '#8EC5FF' }), 0.001), 0.068, 0.22, 0.12);
  conLed.userData.noMerge = true;
  put(con, rbox(0.16, 0.02, 0.14, black, 0.01), 0, 0.01, 0);
  put(g, rbox(0.86, 0.06, 0.09, mat('#22252B', { roughness: 0.5 }), 0.025), 0, 0.56, 0.13);       // soundbar
  put(g, rbox(0.8, 0.045, 0.004, mat('#3A3E46', { roughness: 0.9 }), 0.01), 0, 0.56, 0.176);
  put(g, cyl(0.08, 0.065, 0.15, mat('#E8E2D6', { roughness: 0.6 }), 16), -0.78, 0.6, 0.02);        // a little plant
  for (let i = 0; i < 7; i++) { const a = i * 0.9, leaf = put(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#4E8B4A', { roughness: 0.8 })), -0.78 + Math.cos(a) * 0.05, 0.72 + (i % 3) * 0.04, 0.02 + Math.sin(a) * 0.05); leaf.scale.set(1, 0.55, 1.6); leaf.rotation.y = a; }

  /* the two controllers, lying on the unit until someone picks them up */
  const pads = [padMesh('#F2F3F5'), padMesh('#1F2329', '#3A3F48')];
  pads.forEach((p, i) => { p.position.set(i ? 0.55 : -0.57, 0.53, i ? 0.15 : 0.11); p.rotation.y = i ? -0.22 : 0.3; g.add(p); });   // (clear of the soundbar, the plant, the console)

  g.traverse((o) => { if (o.isMesh && !o.userData.noMerge && !o.userData.dynamic) { o.castShadow = true; o.receiveShadow = true; } });
  GTV = { g, canvas, ctx, tex, screen, screenM, sheen, led, glow, glowM, conLed, routerLed, pads, center: [cx, y0, cz - 0.044], on: false };
}
