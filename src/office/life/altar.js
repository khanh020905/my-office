// The Thần Tài – Thổ Địa altar in the lobby (company floor), and the offerings on the lunar 1st and 15th.
import * as THREE from 'three';
import { chatLife } from '../ui/group-chat.js';
import { PRO, officeNow, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../scene/blocks.js';
import { nightHooks } from '../world/props/trinkets.js';
import { night } from '../world/room-update.js';
import { t as tr } from '../../i18n/index.js';

/* As in most Vietnamese shops and offices: a small red-lacquered shrine standing on the floor by the reception,
   facing the way in (the lobby and the lift). Ông Địa (round belly, a fan) and Thần Tài (official's hat, a gold ingot) sit inside before a red
   back panel, the couplet "Thổ năng sinh bạch ngọc / Địa khả xuất hoàng kim" on its pillars, under a two-tier roof
   with upturned eaves; in front an incense bowl, a pair of red altar lamps (lit after dark), small vases, three cups of
   water and a gold toad. On the lunar 1st and 15th (the real lunar calendar; ?lunar=1 to see it any day) the
   receptionist (people/staff.js) sets out a tray of five fruits on a footed dish, red xôi gấc and yellow
   chrysanthemums, then lights three sticks of incense and bows; the smoke rises for the best part of an hour. */
const LUNAR = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric', day: 'numeric' });
const FORCE = new URLSearchParams(location.search).has('lunar');
let lunarKey = '', lunarDay = 0;
/** The lunar day of the month by the office clock (1–30). */
export function lunar() {
  const d = officeNow(), k = d.toDateString();
  if (k !== lunarKey) { lunarKey = k; lunarDay = +(LUNAR.formatToParts(d).find((p) => p.type === 'day')?.value || 0); }
  return lunarDay;
}
export const offeringDay = () => FORCE || lunar() === 1 || lunar() === 15;

export const altar = { spot: null, g: null, day: '', litAt: 0 };   // spot: where the receptionist stands to pray
let offer, flowersDaily, flowersOffer, incense, smoke = [], lampM, smokeTex;
const BURN_MS = 50 * 60e3;   // (office time a stick burns)

function textTex(w, h, draw) { return canvasTex(w, h, draw); }
const GOLD = '#D9A93A', RED = '#9C1F1F', REDDARK = '#6E1414';

function build() {
  const g = altar.g = new THREE.Group(); g.position.set(-6.85, 0, 0.84); scene.add(g);   // on the floor between the lift and the reception, facing the lobby
  const red = mat(RED, { roughness: 0.35 }), redDark = mat(REDDARK, { roughness: 0.45 }), gold = mat(GOLD, { metalness: 0.6, roughness: 0.3 }), wood = mat('#4A2A1A', { roughness: 0.5 });
  // base and cabinet
  put(g, rbox(0.72, 0.1, 0.54, wood, 0.015), 0, 0.05, 0);
  put(g, rbox(0.62, 0.04, 0.46, red, 0.01), 0, 0.12, 0);
  put(g, rbox(0.64, 0.015, 0.02, gold, 0.004), 0, 0.142, 0.225);
  put(g, rbox(0.62, 0.62, 0.03, red, 0.01), 0, 0.45, -0.215);
  for (const sx of [-1, 1]) put(g, rbox(0.03, 0.62, 0.46, red, 0.01), sx * 0.295, 0.45, 0);
  // back panel: gold border, a sunburst behind the two figures, the names above
  const back = textTex(256, 256, (c, w, h) => {
    c.fillStyle = '#A51E1E'; c.fillRect(0, 0, w, h);
    c.strokeStyle = GOLD; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.lineWidth = 2; c.strokeRect(20, 20, w - 40, h - 40);
    c.save(); c.translate(w / 2, h * 0.62); c.fillStyle = 'rgba(232,190,90,.35)';
    for (let i = 0; i < 24; i++) { c.rotate(Math.PI / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-7, -110); c.lineTo(7, -110); c.closePath(); c.fill(); }
    c.restore();
    c.fillStyle = '#F2CB62'; c.font = '700 26px "Be Vietnam Pro", Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(tr('life.altar.header'), w / 2, 46);
  });
  put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), mat('#FFFFFF', { map: back, roughness: 0.6 })), 0, 0.45, -0.198);
  // front pillars with the couplet, one word a line
  const couplet = (words) => textTex(48, 384, (c, w, h) => {
    c.fillStyle = '#7E1717'; c.fillRect(0, 0, w, h); c.fillStyle = '#F2CB62'; c.font = '700 15px "Be Vietnam Pro", Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    words.forEach((t, i) => c.fillText(t, w / 2, 40 + i * ((h - 80) / (words.length - 1))));
  });
  [[-1, tr('life.altar.left')], [1, tr('life.altar.right')]].forEach(([sx, text]) => {
    put(g, rbox(0.06, 0.64, 0.05, red, 0.01), sx * 0.29, 0.46, 0.205);
    put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.5), mat('#FFFFFF', { map: couplet(text.split(' ')), roughness: 0.6 })), sx * 0.29, 0.46, 0.231);
  });
  // two-tier roof with upturned gold eaves and a gold pearl on the ridge
  put(g, rbox(0.74, 0.04, 0.56, red, 0.01), 0, 0.78, 0);
  put(g, rbox(0.76, 0.018, 0.58, gold, 0.004), 0, 0.805, 0);
  const roof = (w, d, h, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0001, 0.5, h, 4, 1), red); m.rotation.y = Math.PI / 4; m.scale.set(w / 0.7071, 1, d / 0.7071); m.position.y = y; m.castShadow = true; g.add(m); };
  roof(0.8, 0.62, 0.1, 0.865); roof(0.5, 0.4, 0.09, 0.95);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const tip = put(g, new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 6), gold), sx * 0.4, 0.84, sz * 0.31); tip.rotation.set(sz * 0.7, 0, -sx * 0.7); }
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), gold), 0, 1.01, 0);
  // the two figures on a step: Ông Địa (left), Thần Tài (right)
  put(g, rbox(0.5, 0.05, 0.18, redDark, 0.01), 0, 0.165, -0.1);
  const skin = mat('#F1C9A0', { roughness: 0.55 });
  { const d = new THREE.Group(); d.position.set(-0.13, 0.19, -0.1); g.add(d);
    put(d, new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat('#D9822B', { roughness: 0.5 })), 0, 0.06, 0).scale.set(1, 0.95, 0.85);
    put(d, new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), skin), 0, 0.05, 0.045);
    put(d, new THREE.Mesh(new THREE.SphereGeometry(0.047, 14, 10), skin), 0, 0.165, 0);
    put(d, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 14), mat('#E8C15A', { roughness: 0.4 })), 0.06, 0.12, 0.05).rotation.set(1.2, 0, 0.4); }
  { const t = new THREE.Group(); t.position.set(0.13, 0.19, -0.1); g.add(t);
    put(t, cyl(0.045, 0.075, 0.15, mat('#B4232A', { roughness: 0.45 }), 12), 0, 0.075, 0);
    put(t, rbox(0.07, 0.03, 0.02, mat('#2E7D4F', { roughness: 0.5 }), 0.005), 0, 0.11, 0.045);
    put(t, new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), skin), 0, 0.19, 0);
    put(t, rbox(0.03, 0.035, 0.01, '#1E1E22', 0.003), 0, 0.165, 0.038);
    put(t, rbox(0.075, 0.035, 0.06, '#1E1E22', 0.008), 0, 0.235, -0.005);
    for (const sx of [-1, 1]) put(t, rbox(0.05, 0.008, 0.012, '#1E1E22', 0.003), sx * 0.06, 0.232, -0.02);
    put(t, rbox(0.06, 0.02, 0.03, gold, 0.008), 0, 0.075, 0.07); }
  // in front: the incense bowl with old stubs, the red altar lamps, three cups, the gold toad
  put(g, cyl(0.045, 0.038, 0.06, mat('#F4F1EA', { roughness: 0.25 }), 18), 0, 0.17, 0.1);
  put(g, cyl(0.046, 0.046, 0.012, mat('#2F5DA8', { roughness: 0.3 }), 18), 0, 0.185, 0.1);
  put(g, cyl(0.04, 0.04, 0.004, mat('#D9C9A8', { roughness: 1 }), 16), 0, 0.2, 0.1);
  for (let i = 0; i < 6; i++) put(g, cyl(0.002, 0.002, 0.04, '#C0392B', 4), rand(-0.025, 0.025), 0.22, 0.1 + rand(-0.025, 0.025));
  lampM = new THREE.MeshBasicMaterial({ color: '#FF5A3C' });
  for (const sx of [-1, 1]) {
    put(g, cyl(0.022, 0.03, 0.02, gold, 10), sx * 0.22, 0.15, 0.12);
    put(g, cyl(0.02, 0.02, 0.07, lampM, 10), sx * 0.22, 0.195, 0.12).userData.noMerge = true;   // (its own colour, brighter after dark)
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold), sx * 0.22, 0.23, 0.12);
  }
  nightHooks.push((on) => lampM.color.set(on ? '#FF6A40' : '#E04A34').multiplyScalar(on ? 2.4 : 1));
  for (const x of [-0.06, 0, 0.06]) put(g, cyl(0.014, 0.011, 0.02, mat('#FBF8F0', { roughness: 0.2 }), 10), x, 0.152, 0.185);
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), gold), 0.18, 0.165, 0.2).scale.set(1, 0.6, 1.1);
  // flowers: everyday pink roses in two small vases; on the 1st and 15th yellow chrysanthemums in taller ones
  const vase = (parent, sx, h, colour, n, r) => {
    put(parent, cyl(0.022, 0.016, h, mat('#E9E3D6', { roughness: 0.25 }), 10), sx * 0.14, 0.14 + h / 2, 0.05);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; put(parent, new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(colour, { roughness: 0.7 })), sx * 0.14 + Math.cos(a) * r * 1.2, 0.14 + h + 0.025 + (i % 2) * 0.015, 0.05 + Math.sin(a) * r * 1.2); }
  };
  flowersDaily = new THREE.Group(); g.add(flowersDaily);
  for (const sx of [-1, 1]) vase(flowersDaily, sx, 0.06, '#E35D7A', 3, 0.018);
  flowersOffer = new THREE.Group(); flowersOffer.visible = false; flowersOffer.userData.dynamic = true; g.add(flowersOffer);
  for (const sx of [-1, 1]) vase(flowersOffer, sx, 0.09, '#F2C12E', 6, 0.024);
  // the offerings on a red tray on the floor in front: five fruits on a footed dish, xôi gấc, a bowl of chè
  offer = new THREE.Group(); offer.position.set(0, 0, 0.42); offer.visible = false; offer.userData.dynamic = true; g.add(offer);
  put(offer, cyl(0.2, 0.2, 0.02, mat('#B22222', { roughness: 0.35 }), 24), 0, 0.01, 0);
  put(offer, cyl(0.03, 0.05, 0.08, gold, 12), -0.06, 0.06, 0); put(offer, cyl(0.12, 0.1, 0.015, gold, 18), -0.06, 0.105, 0);
  const fruit = (c, x, y, z, s = [1, 1, 1], r = 0.032) => put(offer, new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(c, { roughness: 0.5 })), x, y, z).scale.set(...s);
  for (let i = 0; i < 5; i++) { const b = put(offer, new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), mat('#F2D04B', { roughness: 0.6 })), -0.06 + (i - 2) * 0.022, 0.13, 0.06); b.rotation.set(Math.PI / 2, 0, 0.25); }   // bananas, the hand around the bottom
  fruit('#7DAF3C', -0.06, 0.17, -0.005, [1, 1, 1], 0.05);   // pomelo
  fruit('#E2456B', -0.12, 0.14, -0.04, [1, 1.25, 1], 0.03);  // dragon fruit
  fruit('#F3A93B', 0.0, 0.14, -0.05, [1.2, 0.85, 0.85]);      // mango
  fruit('#F28C28', -0.12, 0.14, 0.03); fruit('#F28C28', 0.0, 0.135, 0.03, [1, 1, 1], 0.028);   // oranges
  put(offer, cyl(0.06, 0.06, 0.01, mat('#F4F1EA', { roughness: 0.3 }), 18), 0.11, 0.025, 0.02);
  put(offer, new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#C8302A', { roughness: 0.7 })), 0.11, 0.03, 0.02).scale.set(1, 0.8, 1);   // xôi gấc
  put(offer, cyl(0.03, 0.022, 0.03, mat('#F4F1EA', { roughness: 0.3 }), 12), 0.13, 0.035, -0.1);
  // incense: three sticks with glowing tips, and their smoke (a few soft puffs rising, drifting, fading)
  incense = new THREE.Group(); incense.visible = false; incense.userData.dynamic = true; g.add(incense);
  const tipM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.2) });
  for (const [x, lean] of [[-0.014, -0.12], [0, 0], [0.014, 0.12]]) {
    const st = new THREE.Group(); st.position.set(x, 0.2, 0.1); st.rotation.z = lean; incense.add(st);
    put(st, cyl(0.0025, 0.0025, 0.2, '#B0302A', 4), 0, 0.1, 0); put(st, new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), tipM), 0, 0.2, 0);
  }
  smokeTex = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#E6E3DC', transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.setScalar(0.05); s.userData.t = i / 7; incense.add(s); smoke.push(s);
  }
  altar.spot = { x: -6.85, z: 1.74, face: Math.PI, node: 'I', direct: true, via: [[-6.2, 1.18], [-6.2, 1.74]] };   // (out round the end of the reception)
}

/** The receptionist sets out the offerings (on an offering day). */
export function arrange() { chatLife('altar'); altar.day = officeNow().toDateString(); flowersOffer.visible = offer.visible = true; flowersDaily.visible = false; }
/** …and lights the incense. */
export function lightIncense() { altar.litAt = officeNow().getTime(); }
/** Whether this office day's offerings are out already (the receptionist does it once a day). */
export const arranged = () => altar.day === officeNow().toDateString();

let checkAt = 0;
export function updateAltar(dt) {
  if (!altar.g) return;
  const now = officeNow();
  if (performance.now() > checkAt) {   // the day changes rarely: a look once a second
    checkAt = performance.now() + 1000;
    const today = now.toDateString(), on = offeringDay();
    if (!on && altar.day) { altar.day = ''; altar.litAt = 0; }
    // opened later in the day: the offerings are already there (she came at 8:05)
    if (on && altar.day !== today && now.getHours() * 60 + now.getMinutes() >= 9 * 60 + 30) arrange();
    const show = on && altar.day === today;
    offer.visible = flowersOffer.visible = show; flowersDaily.visible = !show;
    incense.visible = show && altar.litAt > 0 && now.getTime() - altar.litAt < BURN_MS;
  }
  if (!incense.visible) return;
  const k = Math.min(1, (now.getTime() - altar.litAt) / BURN_MS);
  for (const st of incense.children) if (!st.isSprite) st.scale.y = 1 - 0.7 * k;   // the sticks burn down
  const top = 0.2 + 0.2 * (1 - 0.7 * k);
  for (const s of smoke) {
    s.userData.t = (s.userData.t + dt * 0.18) % 1;
    const t = s.userData.t;
    s.position.set(Math.sin(t * 7 + s.id) * 0.03 * t, top + t * 0.55, 0.1 + Math.cos(t * 5) * 0.02 * t);
    s.scale.setScalar(0.03 + t * 0.12); s.material.opacity = (night ? 0.35 : 0.5) * Math.sin(Math.PI * t) * (1 - k * 0.5);
  }
}

export function setup() { if (PRO) build(); }
