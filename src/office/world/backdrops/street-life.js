// Life on the city's streets: cars, taxis (Xanh SM's cyan VinFasts among them), SUVs, vans, buses and scooters (Grab and
// Xanh SM riders in their jackets, GrabFood with the green box) that keep their distance and stop at the lights, a bus
// that calls at the stop near the office, and people on the pavements who wait for the green and cross on the zebras
// (a few in conical hats; umbrellas when it rains). How busy it is follows the office clock: the rush hours, quiet
// nights. Cars pull in to the kerb and out again, indicating. The Grab and Xanh SM logos are the real ones
// (public/assets/brands). Every kind of thing is one instanced mesh, so the whole street costs about twenty draw calls;
// it all moves in plain JavaScript each frame. People from the office walk the same pavements (outings.js, by `street`).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HQ, PRO, officeNow } from '../../core/env.js';
import { canvasTex } from '../../scene/blocks.js';
import { quality } from '../../scene/quality.js';
import { wx } from '../../life/weather.js';
import { GY, boxAt, cPick, cR, colorize, cr, mergeAll, mergedTo, vmat } from '../terrace.js';
import { brandImage, officeMiddle } from './shops.js';
import { folk } from './street-folk.js';
import { buildPark } from './street-park.js';
import { buildWedding } from './street-wedding.js';
import { spotFinder } from './street-spots.js';
import { buildCorner } from './street-corner.js';
import { buildMorning } from './street-morning.js';
import { buildRepair } from './street-repair.js';
import { buildSirens } from './street-siren.js';
import { buildCsgt } from './street-csgt.js';
import { buildNhau } from './street-nhau.js';
import { buildAtm } from './street-atm.js';
import { buildCom } from './eat-com.js';
import { buildPickle } from './street-pickle.js';
import { buildPhoto } from './street-photo.js';
import { buildEv } from './street-ev.js';
import { buildWires } from './street-wires.js';
import { buildSignals } from './street-signals.js';
import { buildRiderExtras } from './street-riders.js';
import { buildShade, plantStreetTrees } from './street-shade.js';
import { buildLunar } from './street-lunar.js';

const W = (g) => colorize(g, '#FFFFFF');   // parts painted per instance (the instance colour multiplies white)
const at = (g, x, y, z) => g.translate(x, y, z);
function wheels(out, xs, half, r, w = 0.22) {
  for (const x of xs) for (const s of [-1, 1]) {
    out.push(colorize(at(new THREE.CylinderGeometry(r, r, w, 12).rotateX(Math.PI / 2), x, r, s * half), '#16181C'));
    out.push(colorize(at(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 10).rotateX(Math.PI / 2), x, r, s * half), '#AEB4BC'));
  }
}
const lights = (out, front, back, y, z, w = 0.3) => {
  for (const s of [-1, 1]) { out.push(boxAt(0.05, 0.12, w, front, y, s * z, '#FFF4D6')); out.push(boxAt(0.05, 0.12, w * 0.9, back, y + 0.04, s * z, '#C0392B')); }
};
/* the vehicles, nose along +x, wheels on y = 0: body = painted per instance, trim = glass, wheels, lights, bumpers */
const KINDS = {
  /* The cars Vietnam drives, on bodies from Kenney's Car Kit (CC0; public/assets/vehicles, made by scripts/build-cars.mjs),
     loaded with the city and painted per car. `len` is the model's length here (`w` half its width: the Car Kit's are read
     from the file); `extras` adds a maker's mark. */
  vios: { kit: 'sedan', len: 3.06, speed: [5.2, 7.2], head: 0.62, paints: ['#F2F2F2', '#C9CED6', '#2B2F36', '#8E2B2B', '#5C6B7A', '#B0B7BF'] },   // Toyota Vios, Hyundai Accent
  city: { kit: 'sedan-sports', len: 3.06, speed: [5.4, 7.4], head: 0.6, paints: ['#F2F2F2', '#B3121E', '#3B3B3B', '#9AA2AD', '#1F3A5F'] },   // Honda City RS
  morning: { kit: 'hatchback-sports', len: 3.42, speed: [5, 7], head: 0.6, paints: ['#F2F2F2', '#D9534F', '#F2C200', '#2E86DE', '#E9D8B4', '#7FB77E'] },   // Kia Morning, Hyundai i10
  fortuner: { kit: 'suv', len: 3.06, speed: [5, 7], head: 0.7, paints: ['#F2F2F2', '#2B2F36', '#6B4F3A', '#8A939B', '#C9CED6'] },   // Toyota Fortuner
  vf8: { kit: 'suv-luxury', len: 3.42, speed: [5.2, 7.2], head: 0.7, paints: ['#F2F2F2', '#24272B', '#1F4E8C', '#9A1B2F', '#A9B1B8', '#7FB7A8'], extras: vfLights },   // VinFast VF8
  ranger: { kit: 'truck', len: 3.54, speed: [5, 7], head: 0.7, paints: ['#E0662B', '#F2F2F2', '#2B2F36', '#8A939B', '#1F4E8C'] },   // Ford Ranger
  xpander: { kit: 'van', len: 3.3, speed: [4.8, 6.6], head: 0.68, paints: ['#F2F2F2', '#B9BEC6', '#6B4F3A', '#2B2F36', '#8E2B2B'] },   // Mitsubishi Xpander
  delivery: { kit: 'delivery', len: 3.9, speed: [4.4, 6], head: 0.75, paints: ['#F2F2F2', '#E0662B', '#2E86DE'] },
  taxi: { kit: 'taxi', len: 3.3, speed: [5.5, 7.5], head: 0.62, paints: ['#1E9E4A', '#F5F5F5'] },   // the green and the white taxi companies
  // out only when called, lights flashing (street-siren.js): an ambulance (115) and a fire engine (114)
  ambulance: { kit: 'ambulance', len: 3.9, speed: [8, 8.6], head: 0.72, paints: ['#D62828'], siren: true },
  firetruck: { kit: 'firetruck', len: 4.08, speed: [7.4, 8], head: 0.8, paints: ['#C8102E'], siren: true },
  // VinFast VF3: the tiny boxy two-door, tall glasshouse, square wheel arches, a light bar across the nose
  vf3: { len: 3.0, w: 0.83, speed: [4.8, 6.4], head: 0.72, paints: ['#F4D03F', '#7EC8E3', '#F2A7B8', '#B8D84A', '#F2F2F2', '#E0662B'],
    make() {
      const body = [W(at(new RoundedBoxGeometry(3.0, 0.66, 1.62, 2, 0.14), 0, 0.66, 0)), W(at(new RoundedBoxGeometry(2.08, 0.1, 1.6, 1, 0.04), -0.2, 1.67, 0))];
      const trim = [colorize(at(new RoundedBoxGeometry(2.0, 0.66, 1.54, 2, 0.08), -0.2, 1.3, 0), '#1C232B'), boxAt(3.04, 0.2, 1.66, 0, 0.36, 0, '#1E2125'),
        boxAt(0.72, 0.32, 1.68, 1.0, 0.5, 0, '#1E2125'), boxAt(0.72, 0.32, 1.68, -1.0, 0.5, 0, '#1E2125'),
        boxAt(0.04, 0.05, 1.24, 1.51, 0.92, 0, '#F4F7FA'), boxAt(0.03, 0.12, 0.32, 1.52, 0.5, 0, '#F2F2F2'), boxAt(0.03, 0.12, 0.32, -1.52, 0.52, 0, '#F2F2F2')];
      wheels(trim, [1.0, -1.0], 0.74, 0.34, 0.24); lights(trim, 1.51, -1.51, 0.74, 0.62, 0.24);
      return { body, trim };
    } },
  // Xanh SM: an electric VinFast crossover in the company's cyan, black cladding, its logo on the front doors, yellow
  // (commercial) plates
  xsm: { len: 3.52, w: 0.78, scale: 0.88, speed: [5.2, 7.2], head: 0.66, paints: ['#22B8BE'], doors: true,
    make() {
      const body = [W(at(new RoundedBoxGeometry(4.0, 0.6, 1.76, 2, 0.2), 0, 0.74, 0)), W(at(new RoundedBoxGeometry(2.4, 0.08, 1.62, 1, 0.03), -0.3, 1.62, 0))];
      const trim = [colorize(at(new RoundedBoxGeometry(2.5, 0.56, 1.64, 2, 0.14), -0.3, 1.3, 0), '#1C232B'), boxAt(4.04, 0.24, 1.8, 0, 0.4, 0, '#1E2125'),
        boxAt(0.04, 0.16, 0.36, 2.03, 0.44, 0, '#F2C200'), boxAt(0.04, 0.16, 0.36, -2.03, 0.52, 0, '#F2C200'), boxAt(0.05, 0.05, 1.3, 2.0, 0.88, 0, '#F4F7FA')];
      wheels(trim, [1.3, -1.3], 0.8, 0.36, 0.25); lights(trim, 2.0, -2.0, 0.74, 0.6);
      return { body, trim };
    } },
  // a city bus a little shorter than life: a block is 15 m from crossing to crossing
  bus: { len: 7.6, w: 1.11, speed: [4.2, 5.4], head: 0.75, paints: ['#2E9E4A', '#F0B323', '#D94B3D'],
    make() {
      const body = [W(at(new RoundedBoxGeometry(7.6, 2.5, 2.2, 2, 0.18), 0, 1.6, 0))];
      const trim = [boxAt(6.7, 0.85, 2.24, -0.3, 2.1, 0, '#22303D'), boxAt(0.06, 1.25, 2.0, 3.8, 2.0, 0, '#22303D'), boxAt(0.07, 0.24, 1.4, 3.81, 2.66, 0, '#FFB23F'),
        boxAt(2.2, 0.22, 1.4, -1.0, 2.95, 0, '#C9CED6'), boxAt(7.62, 0.3, 2.22, 0, 0.5, 0, '#2B2F36')];
      wheels(trim, [2.5, -2.4], 1.0, 0.48, 0.3); lights(trim, 3.81, -3.81, 0.75, 0.8);
      return { body, trim };
    } },
  // a scooter (painted per instance) and its driver: jacket and helmet painted per instance (`rider`), face, gloves,
  // trousers and shoes fixed (in `trim`), a face mask on many (`mask`). Passengers, logos and the GrabFood box are
  // added in buildStreetLife.
  moto: { len: 1.8, w: 0.24, speed: [4.6, 6.8], head: 1.09, paints: ['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B', '#F2C200', '#7A1F2B', '#1E9E4A', '#C9CED6'],
    jackets: ['#3A5A8C', '#8C3A3A', '#2F6B45', '#5B5B66', '#C77D2E', '#2B2F36', '#7E5BA6', '#E0E0E0', '#B0485A'],
    make() {
      const bike = scooterParts(), driver = riderParts(false);
      return { body: bike.body, trim: [...bike.trim, ...driver.trim], rider: driver.cloth, mask: driver.mask };
    } },
};

// VinFast's mark on the VF8: the thin light bar across the nose that dips into a V at the badge
function vfLights(box) {
  const x = box[3] + 0.005, y = box[4] * 0.56, bar = (a, b) => { const g = limb(a, b, 0.02, '#F4FAFF'); g.deleteAttribute('uv'); return g; };
  return [bar(V3(x, y - 0.06, 0), V3(x - 0.03, y, 0.7)), bar(V3(x, y - 0.06, 0), V3(x - 0.03, y, -0.7))];
}

/* ---------- scooters and the people on them (nose along +x, wheels on y = 0) ---------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UPY = new THREE.Vector3(0, 1, 0);
// a round bar from a to b: arms, legs, the fork, the handlebar
function limb(a, b, r, color, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPY, d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return color ? colorize(g, color) : W(g);
}
const ball = (r, x, y, z, color) => { const g = new THREE.SphereGeometry(r, 10, 8).translate(x, y, z); return color ? colorize(g, color) : W(g); };
// a step-through scooter as Vietnam rides them: leg shield, the headlight in the handlebar cover, mirrors, floorboard,
// a long seat, grab rail, tail light and a white number plate
function scooterParts() {
  const body = [
    W(at(new RoundedBoxGeometry(0.16, 0.66, 0.42, 2, 0.06).rotateZ(0.22), 0.47, 0.74, 0)),
    W(at(new RoundedBoxGeometry(0.24, 0.15, 0.46, 2, 0.06), 0.57, 1.1, 0)),
    W(at(new RoundedBoxGeometry(0.42, 0.07, 0.16, 2, 0.03).rotateZ(-0.35), 0.66, 0.6, 0)),
    W(at(new RoundedBoxGeometry(0.86, 0.36, 0.36, 2, 0.12), -0.36, 0.62, 0)),
  ];
  const trim = [
    boxAt(0.52, 0.05, 0.34, 0.1, 0.36, 0, '#3A3F47'), colorize(at(new RoundedBoxGeometry(0.76, 0.1, 0.33, 1, 0.045), -0.3, 0.85, 0), '#1C1E22'),
    limb(V3(0.64, 0.3, 0), V3(0.55, 1.04, 0), 0.03, '#2B2F36'), limb(V3(0.5, 1.13, -0.31), V3(0.5, 1.13, 0.31), 0.02, '#2B2F36'),
    boxAt(0.04, 0.07, 0.17, 0.69, 1.09, 0, '#FFF4D6'), boxAt(0.04, 0.06, 0.18, -0.8, 0.72, 0, '#C0392B'), boxAt(0.02, 0.09, 0.17, -0.81, 0.52, 0, '#F2F2F2'),
    limb(V3(-0.56, 0.91, -0.17), V3(-0.76, 0.9, 0), 0.014, '#B9BEC6'), limb(V3(-0.56, 0.91, 0.17), V3(-0.76, 0.9, 0), 0.014, '#B9BEC6'),
  ];
  for (const s of [-1, 1]) trim.push(limb(V3(0.52, 1.14, s * 0.2), V3(0.5, 1.33, s * 0.27), 0.008, '#1C1E22'), boxAt(0.02, 0.06, 0.1, 0.5, 1.35, s * 0.28, '#1C1E22'));
  for (const x of [0.62, -0.6]) {
    trim.push(colorize(at(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 14).rotateX(Math.PI / 2), x, 0.27, 0), '#16181C'));
    trim.push(colorize(at(new THREE.CylinderGeometry(0.13, 0.13, 0.11, 10).rotateX(Math.PI / 2), x, 0.27, 0), '#9AA2AD'));
  }
  return { body, trim };
}
const SKIN = '#E8C2A0', TROUSERS = '#2F3A4C', SHOES = '#1E2125', GLOVES = '#2B2F36';
/* Someone on a scooter: the driver, leaning a little over the bars, or a passenger on the back of the seat, hands on
   the knees. `cloth` is painted per instance (the jacket, and the driver's helmet), `helmet` separately (a passenger
   wears the company's helmet over their own clothes), `trim` keeps its colours (face, hands, trousers, shoes). For the
   traffic police's stops (street-csgt.js): `bare`, no helmet (hair); `phone`, the right hand up at the ear, a phone in it. */
export function riderParts(passenger, { bare = false, phone = false } = {}) {
  const x0 = passenger ? -0.38 : 0, cloth = [], helmet = [], trim = [];
  cloth.push(W(at(new RoundedBoxGeometry(0.3, 0.5, 0.4, 2, 0.1).rotateZ(-0.1), x0 - 0.14, 1.2, 0)));
  for (const s of [-1, 1]) {
    const ear = phone && s > 0, sh = V3(x0 - 0.1, 1.38, s * 0.2);
    const el = ear ? V3(-0.02, 1.27, 0.32) : passenger ? V3(x0 - 0.02, 1.12, s * 0.25) : V3(0.16, 1.22, s * 0.26), hd = ear ? V3(-0.07, 1.55, 0.17) : passenger ? V3(x0 + 0.12, 1.0, s * 0.19) : V3(0.47, 1.12, s * 0.27);
    if (ear) trim.push(boxAt(0.035, 0.14, 0.075, -0.08, 1.6, 0.14, '#15171A'));
    cloth.push(limb(sh, el, 0.058), ball(0.058, el.x, el.y, el.z), limb(el, hd, 0.05));
    trim.push(ball(0.048, hd.x, hd.y, hd.z, passenger ? SKIN : GLOVES));
    const hip = V3(x0 - 0.12, 0.98, s * 0.11), knee = passenger ? V3(x0 + 0.16, 0.95, s * 0.17) : V3(0.2, 1.0, s * 0.13), ank = passenger ? V3(x0 + 0.1, 0.42, s * 0.2) : V3(0.22, 0.43, s * 0.14);
    trim.push(limb(hip, knee, 0.075, TROUSERS), ball(0.07, knee.x, knee.y, knee.z, TROUSERS), limb(knee, ank, 0.062, TROUSERS), boxAt(0.21, 0.07, 0.1, ank.x + 0.06, ank.y - 0.03, ank.z, SHOES));
  }
  trim.push(limb(V3(x0 - 0.12, 1.44, 0), V3(x0 - 0.11, 1.52, 0), 0.06, SKIN), ball(0.12, x0 - 0.1, 1.58, 0, SKIN));
  // a half-face helmet with a short peak over the face (or, bare-headed, the hair)
  if (bare) trim.push(colorize(new THREE.SphereGeometry(0.128, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateZ(0.3).translate(x0 - 0.12, 1.6, 0), '#221D19'));
  else (passenger ? helmet : cloth).push(W(new THREE.SphereGeometry(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56).translate(x0 - 0.11, 1.62, 0)),
    W(at(new RoundedBoxGeometry(0.1, 0.025, 0.22, 1, 0.01).rotateZ(-0.25), x0 + 0.05, 1.68, 0)));
  const mask = passenger ? null : [W(new THREE.SphereGeometry(0.1, 10, 8).scale(0.55, 0.6, 1.05).translate(x0 + 0.005, 1.535, 0))];
  return { cloth, helmet, trim, mask };
}

// a scooter standing on its own (parked by a shop), painted `color`
export function parkedScooter(color) {
  const { body, trim } = scooterParts();
  return mergeAll([...body.map((g) => colorize(g, color)), ...trim]);
}

/* ---------- the Car Kit's models (public/assets/vehicles/cars.json) ---------- */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
let kitLoad = null;
const loadKit = () => (kitLoad ??= fetch(`${BASE}/assets/vehicles/cars.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const unb64 = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);   // the palette's sRGB bytes, as three wants vertex colours
function kitGeometry(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(unb64(part.pos, Int16Array), (v) => v / 2000), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(unb64(part.nrm, Int8Array), (v) => v / 127), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Float32Array.from(unb64(part.col, Uint8Array), (v) => linear(v / 255)), 3));
  g.setIndex(new THREE.BufferAttribute(unb64(part.idx, Uint16Array), 1));
  return g;
}
// one car: its paint, and the rest with the wheels where the kit puts them (the kit's frame turned nose along +x, scaled)
function kitCar(kit, name, extras) {
  const m = kit.models[name], turn = new THREE.Matrix4().makeScale(kit.scale, kit.scale, kit.scale).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const rest = [kitGeometry(m.rest)];
  for (const w of m.wheels) rest.push(kitGeometry(kit.wheel).applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, new THREE.Matrix4().compose(new THREE.Vector3(...w.t), new THREE.Quaternion(...w.r), new THREE.Vector3(...w.s)))));
  if (extras) rest.push(...extras(m.box));
  return { body: kitGeometry(m.paint), trim: mergeAll(rest), box: m.box };
}

/* ---------- liveries ----------
   The ride-hailing companies' logos, white, in one small canvas: Xanh SM (car doors, drivers' jackets and helmets),
   Grab (jackets and helmets), and a GrabFood box's face (the logo on Grab green). Each decal is a plane (or the box) in the vehicle's own
   frame, drawn with the vehicles' matrices: one instanced mesh per kind of decal. */
// Each logo is printed on a patch of the colour it is worn on: a white logo on a see-through patch loses its thin
// strokes once the texture is shrunk (they fall under the alpha cut-off and vanish); on the cloth's own colour the
// patch disappears into the jacket and the logo stays.
const DW = 512, DH = 256, SLOT = { xsm: [0, 0, 256, 128], xsmCloth: [256, 0, 256, 128], grab: [0, 128, 256, 128], box: [256, 128, 256, 128] };
const PATCH = { xsm: '#22B8BE', xsmCloth: '#1FA9AF', grab: '#00B14F', box: '#00B14F' };
function decalCanvas() {
  const c = document.createElement('canvas'); c.width = DW; c.height = DH;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const white = (img, [x, y, w, h], pad) => {   // the logo fitted in the slot, every pixel of it white
    const k = document.createElement('canvas'); k.width = w; k.height = h; const kg = k.getContext('2d');
    const s = Math.min((w - pad * 2) / img.naturalWidth, (h - pad * 2) / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    kg.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    kg.globalCompositeOperation = 'source-in'; kg.fillStyle = '#FFFFFF'; kg.fillRect(0, 0, w, h);
    g.drawImage(k, x, y);
  };
  const draw = () => {
    for (const [k, [x, y, w, h]] of Object.entries(SLOT)) { g.fillStyle = PATCH[k]; g.fillRect(x, y, w, h); }
    const xsm = brandImage('xanh-sm.svg', draw), grab = brandImage('grab.svg', draw);
    if (xsm) { white(xsm, SLOT.xsm, 14); white(xsm, SLOT.xsmCloth, 10); }
    if (grab) { white(grab, SLOT.grab, 6); white(grab, SLOT.box, 18); }
    tex.needsUpdate = true;
  };
  draw();
  return tex;
}
// a plane showing one slot, facing +z before `ry` turns it
function decal(slot, w, h, x, y, z, ry = 0) {
  const p = new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z), uv = p.attributes.uv, [sx, sy, sw, sh] = SLOT[slot];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (sx + uv.getX(i) * sw) / DW, 1 - (sy + (1 - uv.getY(i)) * sh) / DH);
  return p;
}
// a box with the slot on its four sides, plain (the slot's corner colour) on top and underneath
function slotBox(slot, w, h, d, x, y, z) {
  const b = new THREE.BoxGeometry(w, h, d).translate(x, y, z), uv = b.attributes.uv, [sx, sy, sw, sh] = SLOT[slot];
  for (let i = 0; i < uv.count; i++) {
    const flat = i >= 8 && i < 16;   // BoxGeometry's faces: +x, -x, +y, -y, +z, -z, four vertices each
    uv.setXY(i, (sx + (flat ? 0.02 : uv.getX(i)) * sw) / DW, 1 - (sy + (1 - (flat ? 0.98 : uv.getY(i))) * sh) / DH);
  }
  return b;
}
// the company's logo where a driver wears it: big on the back of the jacket, small over the heart, on both sides of the
// helmet; and on a passenger's helmet, both sides and the back
const driverLogos = (slot) => mergeAll([decal(slot, 0.36, 0.18, -0.3, 1.24, 0, -Math.PI / 2), decal(slot, 0.15, 0.075, 0.017, 1.33, 0.09, Math.PI / 2),
  decal(slot, 0.14, 0.07, -0.11, 1.65, 0.164), decal(slot, 0.14, 0.07, -0.11, 1.65, -0.164, Math.PI)]);
const passengerLogos = (slot) => mergeAll([decal(slot, 0.14, 0.07, -0.49, 1.65, 0.164), decal(slot, 0.14, 0.07, -0.49, 1.65, -0.164, Math.PI), decal(slot, 0.14, 0.07, -0.656, 1.64, 0, -Math.PI / 2)]);
/* who rides a scooter: a GrabBike driver (green jacket and helmet), a GrabFood one (with the box, never a passenger), a
   Xanh SM Bike driver (cyan, on a cyan VinFast), or someone on their own way. Ride-hailing drivers mostly carry a
   passenger, who wears the company's helmet; many people ride with a face mask. */
const LIVERIES = { grab: { jacket: '#00B14F', helmet: '#00B14F' }, food: { jacket: '#00B14F' }, xsm: { jacket: '#1FA9AF', bike: '#22B8BE', helmet: '#1FA9AF' } };
const pickLivery = () => { const r = cr(); return r < 0.22 ? 'xsm' : r < 0.47 ? 'grab' : r < 0.62 ? 'food' : 'plain'; };
const MASKS = ['#E8EEF5', '#2B2F36', '#9EC9E8', '#E8EEF5'];

/* the lights: a cycle of 22 s per crossing, each a little later than its neighbour (a green wave) */
const CYCLE = 22;
function phaseOf(i, j, t, axis) {
  const p = ((t + (i * 5 + j * 3) * 1.7) % CYCLE + CYCLE) % CYCLE;
  return axis === 'x' ? p : (p + 11) % CYCLE;   // x: green 0–8, amber 8–10, red after; z: the same 11 s later
}
const lightOf = (k) => (k < 8 ? 'g' : k < 10 ? 'y' : 'r');

/* how busy the streets are by the office clock (0–1, by the hour): a Vietnamese city's morning and evening rush, a
   steady day, a lively evening, near-empty small hours */
const BUSY = [[0, 0.12], [5, 0.12], [6, 0.45], [6.75, 0.9], [7.25, 1], [8.25, 1], [9, 0.6], [11, 0.55], [12, 0.62], [13.5, 0.52],
  [16.25, 0.6], [17, 1], [18.5, 1], [19.5, 0.7], [21.5, 0.5], [23, 0.25], [24, 0.12]];
function busyAt(h) {
  let k = 1; while (k < BUSY.length - 1 && BUSY[k][0] <= h) k++;
  const [h0, b0] = BUSY[k - 1], [h1, b1] = BUSY[k];
  return b0 + (b1 - b0) * THREE.MathUtils.clamp((h - h0) / (h1 - h0), 0, 1);
}
// the share of each kind's vehicles out at busy-ness b: scooters most of all (in the rush twice as many as by day),
// taxis around the clock, buses from 5:00 to 22:00, people on the pavements late into the evening
function shareOf(name, b, h) {
  if (KINDS[name].siren) return 0;   // (only when called)
  if (name === 'moto') return THREE.MathUtils.clamp((b - 0.2) / 0.8, 0.08, 1);
  if (name === 'bus') return h >= 5 && h < 22 ? 1 : 0;
  if (name === 'taxi' || name === 'xsm') return 0.45 + 0.55 * b;
  if (name === 'delivery' || name === 'ranger') return 0.2 + 0.8 * b;
  return 0.25 + 0.75 * b;
}
const walkersAt = (h) => (h >= 7 && h < 22 ? 1 : h >= 6 && h < 23 ? 0.6 : 0.22);

/** G: the city group; the street grid (XS, ZS, STREET_W), SB (the office's superblock), shops: the shop fronts (shops.js),
    parks: the blocks left as parks, solids: the buildings' footprints ([x0, x1, z0, z1], for walking in); for the park
    life and the weekend's wedding: trees ([x, z, size]), plazas (the parks' paved squares), faces (the buildings' fronts) */
export function buildStreetLife(G, { XS, ZS, STREET_W, SB, shops = [], parks = [], solids = [], trees = [], plazas = [], faces = [], inShop = () => undefined, pickle: court = null }) {
  textures();
  const low = quality.level === 'low';
  const C = officeMiddle();
  const TER = HQ ? { x0: -8.9, x1: 15.7, z0: -8.5, z1: 28.7 } : PRO ? { x0: -8.9, x1: 15.7, z0: -8.5, z1: 11.7 } : { x0: -8.9, x1: 12.1, z0: -6.7, z1: 10.7 };
  const inSB = (x, z) => x > SB.x0 && x < SB.x1 && z > SB.z0 && z < SB.z1;
  const near = (x, z, r) => Math.hypot(x - C[0], z - C[1]) < r;
  const HALF = STREET_W / 2, LO = -110, HI = 110, LEN = HI - LO;
  const statics = [], marks = [];

  /* ---------- crossings: lights, zebras, stop lines ---------- */
  const crossings = [];   // [{ i, j, x, z }]
  XS.forEach((x, i) => ZS.forEach((z, j) => { if (!inSB(x, z)) crossings.push({ i, j, x, z }); }));
  const poles = [];   // a pole at a corner, serving traffic along `axis`: { x, z, i, j, axis }
  for (const c of crossings) {
    if (!near(c.x, c.z, 62)) continue;
    // zebras on the four arms (where the arm is a street), stop lines before them on the incoming lane
    for (const s of [-1, 1]) {
      if (!inSB(c.x, c.z + s * 3.6)) for (let k = -1.6; k <= 1.61; k += 0.55) marks.push(boxAt(0.32, 0.012, 2.4, c.x + k, GY + 0.013, c.z + s * 3.6, '#A9ADB3'));
      if (!inSB(c.x + s * 3.6, c.z)) for (let k = -1.6; k <= 1.61; k += 0.55) marks.push(boxAt(2.4, 0.012, 0.32, c.x + s * 3.6, GY + 0.013, c.z + k, '#A9ADB3'));
      // traffic coming from -s along z drives at x = c.x + s * … (right-hand traffic): its stop line is at z = c.z - s * 5.2
      if (!inSB(c.x, c.z - s * 5.2)) marks.push(boxAt(2.0, 0.012, 0.2, c.x - s * 1.05, GY + 0.013, c.z - s * 5.2, '#C9CDD2'));
      if (!inSB(c.x - s * 5.2, c.z)) marks.push(boxAt(0.2, 0.012, 2.0, c.x - s * 5.2, GY + 0.013, c.z + s * 1.05, '#C9CDD2'));
    }
    for (const [dx, dz, axis] of [[1, 1, 'z'], [-1, -1, 'z'], [1, -1, 'x'], [-1, 1, 'x']]) {
      const x = c.x + dx * (HALF + 0.45), z = c.z + dz * (HALF + 0.45);
      if (x > TER.x0 - 0.6 && x < TER.x1 + 0.6 && z > TER.z0 - 0.6 && z < TER.z1 + 0.6) continue;   // not on the terrace
      poles.push({ x, z, i: c.i, j: c.j, axis, fx: -dx, fz: -dz });
    }
  }
  const LENS = { r: 0.32, y: 0.06, g: -0.2 };
  for (const p of poles) {
    statics.push(colorize(at(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 6), p.x, GY + 1.55, p.z), '#2B2F36'));
    statics.push(boxAt(0.3, 0.86, 0.3, p.x, GY + 2.95, p.z, '#1C1F24'));
    for (const y of Object.values(LENS)) statics.push(colorize(at(new THREE.SphereGeometry(0.075, 8, 6), p.x + p.fx * 0.15, GY + 2.95 + y, p.z + p.fz * 0.15), '#2E3238'));
  }
  const lampM = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const lit = poles.length ? new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), lampM, poles.length) : null;
  if (lit) { lit.frustumCulled = false; G.add(lit); }
  const LIT = { g: new THREE.Color(0.3, 2.2, 0.8), y: new THREE.Color(2.4, 1.5, 0.2), r: new THREE.Color(2.6, 0.3, 0.25) };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  let litAt = -1;
  function updateLights(t) {
    if (!lit || t - litAt < 0.25) return; litAt = t;
    poles.forEach((p, n) => {
      const s = lightOf(phaseOf(p.i, p.j, t, p.axis)), y = s === 'g' ? LENS.g : s === 'y' ? LENS.y : LENS.r;
      m4.makeTranslation(p.x + p.fx * 0.17, GY + 2.95 + y, p.z + p.fz * 0.17); lit.setMatrixAt(n, m4); lit.setColorAt(n, LIT[s]);
    });
    lit.instanceMatrix.needsUpdate = true; lit.instanceColor.needsUpdate = true;
  }

  /* ---------- the bus stop across the street from the office, on the right-hand street ---------- */
  // on the street to the office's right, mid-block (clear of both crossings), level with the office's middle
  const STOP = { x: XS.find((x) => x > SB.x1) ?? 18, s: (ZS.find((z) => z >= C[1]) ?? 16.2) - 7.5 };
  {
    const x = STOP.x + HALF + 0.42, z = STOP.s;
    statics.push(boxAt(0.95, 0.07, 3.1, x + 0.1, GY + 2.45, z, '#2B2F36'), boxAt(0.05, 1.7, 2.9, x + 0.5, GY + 1.35, z, '#8FB4C9'));
    for (const dz of [-1.45, 1.45]) statics.push(boxAt(0.07, 2.35, 0.07, x + 0.5, GY + 1.2, z + dz, '#2B2F36'));
    statics.push(boxAt(0.4, 0.06, 2.2, x + 0.28, GY + 0.62, z, '#B9874E'), boxAt(0.05, 2.6, 0.05, x - 0.3, GY + 1.3, z - 1.9, '#2B2F36'), boxAt(0.04, 0.45, 0.45, x - 0.3, GY + 2.4, z - 1.9, '#2E6FD1'));
  }

  /* ---------- traffic ----------
     Every vehicle keeps to its lane (one direction of one street, looping), follows the one ahead and stops for red
     lights. How many are out follows the office clock (busyAt): in the rush there are twice the scooters of the day and
     everyone crawls; in the small hours the streets are nearly empty. They join and leave out of sight, at the far ends
     of their lanes. Some cars pull in to the kerb (in front of the shops, along the park) indicating, and pull out again
     later; taxis stop for a fare with their hazard lights on. Whoever comes up behind one parked swings out round it,
     or, a car with traffic coming the other way, waits behind it. */
  const lanes = [];
  XS.forEach((v, i) => { if (v > SB.x0 && v < SB.x1) return; for (const dir of [1, -1]) lanes.push({ axis: 'z', v, i, dir, cross: ZS, list: [], parked: [] }); });
  ZS.forEach((v, j) => { if (v > SB.z0 && v < SB.z1) return; for (const dir of [1, -1]) lanes.push({ axis: 'x', v, j, dir, cross: XS, list: [], parked: [] }); });
  for (const L of lanes) L.opp = lanes.find((o) => o.axis === L.axis && o.v === L.v && o.dir === -L.dir);
  const laneAt = (axis, v, dir) => lanes.find((L) => L.axis === axis && Math.abs(L.v - v) < 0.01 && L.dir === dir);
  // where on the map a vehicle is: s along its lane, `side` out from the middle of the road towards its kerb
  const spotOf = (L, s, side) => (L.axis === 'x' ? [s, L.v + L.dir * side] : [L.v - L.dir * side, s]);
  const yawOf = (L) => (L.axis === 'x' ? (L.dir > 0 ? 0 : Math.PI) : (L.dir > 0 ? -Math.PI / 2 : Math.PI / 2));
  // more traffic on the streets near the office (that is where you look); in the rush, most of it on the four streets
  // round the office's block, where the jams are seen
  const ring = (L) => (L.axis === 'z' ? [SB.x0 - HALF, SB.x1 + HALF] : [SB.z0 - HALF, SB.z1 + HALF]).some((v) => Math.abs(L.v - v) < 0.01);
  const weight = (L, jam) => (jam && ring(L) ? 1 : (jam ? 0.4 : 1) / (1 + (Math.abs(L.v - (L.axis === 'z' ? C[0] : C[1])) / 12) ** 2));
  const pickLane = (jam) => { const tot = lanes.reduce((a, L) => a + weight(L, jam), 0); let r = cr() * tot; for (const L of lanes) if ((r -= weight(L, jam)) <= 0) return L; return lanes[0]; };
  const stopLane = laneAt('z', STOP.x, -1);
  // how many of each there are at the busiest (the rush hours); census() keeps the right share of them out
  const COUNT = { vios: 10, city: 5, morning: 5, fortuner: 5, vf8: 5, ranger: 4, xpander: 4, delivery: 4, taxi: 4, ambulance: 1, firetruck: 1, vf3: 7, xsm: 8, bus: 3, moto: 100 };   // (thinned by a third on 28/10: the rush looked too crowded)
  const paintM = vmat({ roughness: 0.35, metalness: 0.3 }), trimM = vmat({ roughness: 0.5, metalness: 0.2 }), counts = {};
  const decalTex = decalCanvas(), decalM = new THREE.MeshStandardMaterial({ map: decalTex, roughness: 0.75 });
  const Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  const extra = (geo, n) => { const o = new THREE.InstancedMesh(geo, decalM, n); o.frustumCulled = false; G.add(o); return o; };
  const meshes = {}, vehicles = [], byKind = {};
  for (const [name, K] of Object.entries(KINDS)) {
    const n = low ? Math.ceil(COUNT[name] / 2) : COUNT[name], parts = K.kit ? null : K.make();
    counts[name] = n; K.scaleV = new THREE.Vector3().setScalar(K.scale || 1); byKind[name] = [];
    const body = parts && new THREE.InstancedMesh(mergeAll(parts.body), paintM, n);
    const trim = parts && new THREE.InstancedMesh(mergeAll(parts.trim), trimM, n);
    const rider = parts?.rider ? new THREE.InstancedMesh(mergeAll(parts.rider), vmat({ roughness: 0.8 }), n) : null;
    for (const o of [body, trim, rider]) if (o) { o.frustumCulled = false; G.add(o); }
    if (body) body.castShadow = name !== 'moto' && !low; if (rider) rider.castShadow = !low;
    meshes[name] = parts ? { body, trim, rider,
      doors: K.doors ? extra(mergeAll([decal('xsm', 0.86, 0.43, 0.35, 0.8, 0.885), decal('xsm', 0.86, 0.43, 0.35, 0.8, -0.885, Math.PI)]), n) : null } : null;
    if (rider) {   // the scooters' extras: masks, the companies' logos, the GrabFood box, passengers
      const inst = (list, m) => { const o = new THREE.InstancedMesh(mergeAll(list), m, n); o.frustumCulled = false; G.add(o); return o; };
      const pax = riderParts(true), cloth = vmat({ roughness: 0.8 });
      Object.assign(meshes[name], {
        mask: inst(parts.mask, cloth), xsmLogo: extra(driverLogos('xsmCloth'), n), grabLogo: extra(driverLogos('grab'), n), box: extra(slotBox('box', 0.44, 0.42, 0.44, -0.62, 1.1, 0), n),
        paxCloth: inst(pax.cloth, cloth), paxHelmet: inst(pax.helmet, vmat({ roughness: 0.35, metalness: 0.1 })), paxTrim: inst(pax.trim, vmat({ roughness: 0.8 })),
        paxXsm: extra(passengerLogos('xsmCloth'), n), paxGrab: extra(passengerLogos('grab'), n) });
      meshes[name].box.castShadow = meshes[name].paxCloth.castShadow = !low;
    }
    for (let k = 0; k < n; k++) {
      const livery = rider ? pickLivery() : null, L0 = LIVERIES[livery], M0 = meshes[name];
      const pax = !!rider && livery !== 'food' && cr() < (livery === 'plain' ? 0.22 : 0.6), mask = !!rider && cr() < 0.55;
      const paint = new THREE.Color(L0?.bike || cPick(K.paints));
      body?.setColorAt(k, paint);
      if (rider) {
        rider.setColorAt(k, new THREE.Color(L0?.jacket || cPick(K.jackets)));
        M0.mask.setColorAt(k, new THREE.Color(cPick(MASKS)));
        M0.paxCloth.setColorAt(k, new THREE.Color(cPick(K.jackets)));
        M0.paxHelmet.setColorAt(k, new THREE.Color(L0?.helmet || cPick(['#F2F2F2', '#2B2F36', '#D9534F', '#F2C200'])));
      }
      const side = name === 'moto' ? 1.5 + cR(-0.12, 0.12) : name === 'bus' ? 1.15 : 1.05;
      const v = { name, K, k, L: null, livery, pax, mask, paint, half: K.len / 2, w: K.w ?? 0.9, vmax: cR(...K.speed), v: 0, s: 0,
        base: side, side, sideGoal: side, steer: 0, on: false, mode: 'drive', blink: 0, stopUntil: 0, served: false };
      vehicles.push(v); byKind[name].push(v);
    }
  }
  // what some riders wear and carry: sun suits, fridges, ladders, chicken cages… (street-riders.js)
  const extras = buildRiderExtras(G, { rider: meshes.moto.rider, low });
  // the Car Kit's cars, once their file is in (until then they drive unseen: only their lights show at night)
  loadKit().then((kit) => {
    if (!kit) return;
    for (const [name, K] of Object.entries(KINDS)) {
      if (!K.kit) continue;
      const { body: bg, trim: tg, box } = kitCar(kit, K.kit, K.extras), n = counts[name];
      const body = new THREE.InstancedMesh(bg, paintM, n), trim = new THREE.InstancedMesh(tg, trimM, n);
      for (const o of [body, trim]) { o.frustumCulled = false; G.add(o); }
      body.castShadow = !low;
      for (const v of byKind[name]) { body.setColorAt(v.k, v.paint); v.w = (box[5] - box[2]) / 2; v.box = box; }
      meshes[name] = { body, trim };
    }
  });
  // ?showroom: the first of each kind parked in a row on a street in front, to compare them side by side
  const SHOW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('showroom') ? Object.keys(KINDS) : null;
  const showZ = (ZS.find((z) => z > SB.z1 + 20) ?? 46.2) + 1.05;

  // out onto the streets, far away at the start of a lane, clear of whoever is there (`first`: straight in, on load).
  // Scooters ride two abreast, three in the rush.
  function join(v, first) {
    const L = v.name === 'bus' && v.k < 2 && stopLane ? stopLane : pickLane(rush > 0.5);
    const s = first ? 0 : L.dir > 0 ? LO + cR(0, 25) : HI - cR(0, 25);
    if (!first && L.list.some((o) => Math.abs(o.s - s) < 10)) return false;
    if (v.name === 'moto') v.base = cPick(rush > 0.3 ? [0.62, 1.15, 1.68] : [1.15, 1.68]) + cR(-0.07, 0.07);
    Object.assign(v, { L, s, on: true, mode: 'drive', v: v.vmax * 0.6, side: v.base, sideGoal: v.base, steer: 0, blink: 0, blinkOff: 0, passing: null, slot: null, served: false, stopUntil: 0 });
    L.list.push(v);
    if (v.name === 'moto') extras.ride(v, hour);
    return true;
  }
  function retire(v) { const i = v.L.list.indexOf(v); if (i >= 0) v.L.list.splice(i, 1); v.on = false; if (v.extra) extras.drop(v); }
  const outOfSight = (v) => { const [x, z] = spotOf(v.L, v.s, v.side); return !near(x, z, 72); };
  let censusAt = -1, rush = 0, hour = 12, shade = null, shadeOn = false;
  function census(t, first = false) {
    if (!first && t - censusAt < 1) return; censusAt = t;
    if (shade) shadeOn = shade.check(t, hour);
    const d = officeNow(), b = SHOW ? 1 : busyAt((hour = d.getHours() + d.getMinutes() / 60));
    rush = THREE.MathUtils.clamp((b - 0.75) / 0.25, 0, 1);
    for (const [name, list] of Object.entries(byKind)) {
      const want = Math.round(list.length * shareOf(name, b, hour));
      let on = 0; for (const v of list) if (v.on) on++;
      // the lowest numbers join first and the highest leave first: each kind's meshes draw only up to the highest out
      for (const v of list) { if (on >= want) break; if (!v.on && !v.special && join(v, first)) on++; }
      for (let i = list.length - 1; i >= 0 && on > want; i--) { const v = list[i]; if (v.on && !v.special && v.mode === 'drive' && outOfSight(v)) { retire(v); on--; } }
      for (const v of list) if (v.special && !v.slot && !v.siren && v.on && outOfSight(v)) v.special = false;   // (a rider for the office, or a siren, gone again)
    }
    if (first) for (const L of lanes) { const n = L.list.length; L.list.forEach((v, idx) => { v.s = LO + ((idx + cR(0.1, 0.6)) / n) * LEN; }); }
  }

  /* ---------- parking at the kerb ---------- */
  const slots = [];   // { L, s, kind: 'shop' | 'kerb' | 'taxi' | 'rider', side, v, next }
  // a place at the kerb along lane L near s, moved clear of the crossings (their zebras and stop lines)
  function addSlot(L, s, kind) {
    if (!L) return;
    for (const c of L.cross) if (Math.abs(s - c) < 7.4) s = c + Math.sign(s - c || 1) * 7.4;
    slots.push({ L, s, kind, side: 1.5, v: null, next: cR(0, 8) });
  }
  for (const f of shops) {   // in front of each shop, beside the scooters parked on its pavement
    if (f.dir === 'pz') addSlot(laneAt('x', f.z + 1.3 + HALF, -1), f.x + 1.0, 'shop');
    else addSlot(laneAt('z', f.x + 1.3 + HALF, 1), f.z - 1.0, 'shop');
  }
  {   // along the park across the street in front of the office, and a taxi rank at the office's own kerb
    const zf = SB.z1 + HALF;
    for (const x of [C[0] - 8, C[0] + 8]) addSlot(laneAt('x', zf, 1), x, 'kerb');
    addSlot(laneAt('x', zf, -1), C[0] + 6, 'taxi');
  }
  const fits = (sl, v) => v.mode === 'drive' && !v.special && v.name !== 'bus' && v.name !== 'moto' && (sl.kind === 'taxi') === (v.name === 'taxi' || v.name === 'xsm');
  // nobody alongside, or coming up behind it in its lane (one standing still behind lets it out; after a while a shorter
  // gap will do, someone lets it in)
  const clearBehind = (v, t) => !v.L.list.some((o) => {
    const d = (v.s - o.s) * v.L.dir, reach = v.half + o.half;
    if (o === v || d < -(reach + 1)) return false;
    return d < reach + 0.3 || (o.v > 0.5 && d < (t - v.until > 8 ? 9 : 16));
  });
  // in at the kerb: off the lane (the traffic goes round it), lights off; a taxi or a van unloading keeps its hazards on
  function settle(v, t) {
    const L = v.L, i = L.list.indexOf(v); if (i >= 0) L.list.splice(i, 1);
    L.parked.push(v); v.mode = 'parked'; v.v = 0; v.steer = 0;
    const kind = v.slot.kind, hazard = kind === 'taxi' || v.name === 'delivery';
    v.until = kind === 'rider' ? Infinity : t + (kind === 'taxi' ? cR(8, 16) : v.name === 'delivery' ? cR(18, 35) : kind === 'shop' ? cR(40, 150) : cR(60, 240));
    v.blink = hazard ? 2 : kind === 'rider' ? 0 : 1; v.blinkOff = hazard || kind === 'rider' ? 0 : t + 1.6;
  }
  function updateParking(t) {
    for (let i = slots.length - 1; i >= 0; i--) {
      const sl = slots[i], v = sl.v;
      if (!v) {
        if (t < sl.next) continue;
        sl.next = t + cR(5, 18);
        let best = null, bd = 70;   // the nearest one that may park here, coming up 25–70 m before it
        for (const o of sl.L.list) { const d = (sl.s - o.s) * sl.L.dir; if (d > 25 && d < bd && fits(sl, o)) { best = o; bd = d; } }
        if (best) { best.mode = 'park'; best.slot = sl; sl.v = best; }
        continue;
      }
      if (v.blinkOff && t > v.blinkOff) v.blink = v.blinkOff = 0;
      // someone stuck behind it for a while (a car can't get past with traffic the other way): it moves off
      if (v.waitSeen && t - v.waitSeen > 1) v.waitFrom = v.waitSeen = 0;
      if (v.mode === 'parked' && v.waitFrom && t - v.waitFrom > 6 && !sl.stay) v.until = Math.min(v.until, t);   // (not the bridal car)
      if (v.mode === 'parked' && t > v.until) { v.mode = 'out'; v.blink = -1; v.until = t + (sl.kind === 'rider' ? 1.2 : 2.5); }   // indicate, then out once clear
      else if (v.mode === 'out' && t > v.until && clearBehind(v, t)) {
        const L = v.L; L.parked.splice(L.parked.indexOf(v), 1); L.list.push(v);
        v.mode = 'merge'; v.sideGoal = v.base;
      } else if (v.mode === 'merge' && Math.abs(v.side - v.base) < 0.05) {
        v.mode = 'drive'; v.blink = 0; v.slot = null; sl.v = null; sl.next = t + cR(10, 30);
        if (sl.kind === 'rider') slots.splice(i, 1);
      }
    }
  }
  // a vehicle parked ahead in this lane: swing out round it (towards the middle of the road), or wait behind it while
  // something comes the other way that a car swinging out would hit. Returns how far it may go.
  function roundParked(v, L, t) {
    let goal = v.base, room = Infinity;
    if (v.passing && (v.passing.mode !== 'parked' && v.passing.mode !== 'out' || (v.passing.s - v.s) * L.dir < -(v.passing.half + v.half + 0.6))) v.passing = null;
    for (const p of L.parked) {
      if (p.lets?.(v)) continue;
      const d = (p.s - v.s) * L.dir, reach = p.half + v.half;
      if (d < -(reach + 0.6) || d > reach + 16) continue;
      const max = p.side - p.w - v.w - 0.03;   // the furthest towards the kerb it can keep and still clear it
      if (v.base <= max) continue;
      if (v.passing !== p) {
        const edge = max - v.w;   // its other side, past the middle of the road when below 0
        // (the other way: anyone by it now, or getting there within a few seconds; a queue standing further off is no bother)
        const blocked = edge < 0 && L.opp?.list.some((o) => {
          if (edge >= -(o.side - o.w)) return false;
          const d = (p.s - o.s) * L.opp.dir;
          return Math.abs(d) < reach + 1.5 || (d > 0 && d - reach < o.v * 2.5 + 2);
        });
        if (blocked) { room = Math.min(room, d - reach - 1.2); if (d < reach + 4) { p.waitFrom ||= t; p.waitSeen = t; } continue; }
        v.passing = p;
      }
      goal = Math.min(goal, max);
      // not out far enough yet: no further than just behind it (from a standstill it pulls out slowly)
      const out = THREE.MathUtils.clamp((v.base - v.side) / (v.base - max), 0, 1);
      if (out < 0.9) room = Math.min(room, d - reach - 0.3 + out * (2 * reach + 1));
    }
    // (one on its way to a kerb further on steers round too: else it waits behind a parked car for good)
    if (v.mode === 'drive' || (v.mode === 'park' && (v.slot.s - v.s) * L.dir > 14)) v.sideGoal = goal;
    return room;
  }
  // spread each lane's vehicles out along it, as many as this hour has
  census(0, true);

  // how far (metres, along the lane) the vehicle may still go before the next red light's stop line; Infinity if green
  function roomAtLight(v, t) {
    const L = v.L, front = v.s + L.dir * v.half;
    let best = Infinity;
    L.cross.forEach((c, idx) => {
      const stop = c - L.dir * 5.2, d = (stop - front) * L.dir;
      if (d < -0.4 || d > 40 || d >= best) return;
      const [i, j] = L.axis === 'z' ? [L.i, idx] : [idx, L.j], x = L.axis === 'z' ? L.v : c, z = L.axis === 'z' ? c : L.v;
      if (inSB(x, z)) return;
      if (sirens.length && sirens.some((e) => e !== v && e.L.axis !== L.axis && Math.abs(e.px - x) < 10 && Math.abs(e.pz - z) < 10)) { best = d; return; }   // (a siren going through)
      const s = lightOf(phaseOf(i, j, t, L.axis));
      if (s === 'g' || (s === 'y' && d < 3)) return;   // on amber, too close to stop: keep going
      // on a hot sunny day a scooter waits back in the shade (street-shade.js), unless it is already past it
      const sh = shadeOn && v.name === 'moto' ? L.shade?.[idx] : null, ds = sh != null ? (sh - front) * L.dir : -1;
      best = ds > 0.2 && ds < d ? ds : d;
    });
    return best;
  }
  // you, walking in (first-person.js) out on the road: whoever is coming in that lane stops short of you
  let walker = null;
  function roomForWalker(v, L) {
    if (!walker) return Infinity;
    const [wx, wz] = walker, along = L.axis === 'x' ? wx : wz, across = (L.axis === 'x' ? wz - L.v : L.v - wx) * L.dir;
    if (across < -0.4 || across > HALF + 0.3) return Infinity;
    const d = (along - v.s) * L.dir - v.half;
    return d > -0.6 && d < 14 ? d - 1.3 : Infinity;
  }
  /* an ambulance or a fire engine (street-siren.js): in along a street by the office, down the middle, through red lights
     slowly; whoever it comes up behind, or who meets it, pulls over to the kerb and slows until it is by */
  const sirens = [];
  function sirenCall(kind) {
    const v = byKind[kind]?.[0];
    if (!v || v.on || v.special) return null;
    const opts = lanes.filter((L) => Math.abs(L.v - (L.axis === 'z' ? C[0] : C[1])) < 24), L = opts[Math.floor(Math.random() * opts.length)];
    if (!L) return null;
    const mid = L.axis === 'x' ? C[0] : C[1];
    let s = mid - L.dir * 58;   // (out of sight, well inside the lane's loop: it ends 62 past the office)
    for (let k = 0; k < 3 && L.list.some((o) => Math.abs(o.s - s) < 6); k++) s -= L.dir * 4;
    Object.assign(v, { L, s, on: true, special: true, siren: true, sirenEnd: mid + L.dir * 62, mode: 'drive', v: v.vmax * 0.8, base: 0.05, side: 0.05, sideGoal: 0.05, steer: 0, blink: 0, blinkOff: 0, passing: null, slot: null, served: false, stopUntil: 0 });
    L.list.push(v); sirens.push(v);
    return v;
  }
  const yields = (v, L) => sirens.some((e) => (e.L === L ? (v.s - e.s) * L.dir > -1 && (v.s - e.s) * L.dir < 38 : e.L === L.opp && (e.s - v.s) * L.dir > -4 && (e.s - v.s) * L.dir < 40));
  function sirenStep() {
    for (let i = sirens.length - 1; i >= 0; i--) {
      const v = sirens[i];
      [v.px, v.pz] = spotOf(v.L, v.s, v.side);
      if (v.on && (v.s - v.sirenEnd) * v.L.dir < 0) continue;
      v.siren = false; v.base = 1.05; sirens.splice(i, 1);   // (past: back into its lane, off out of sight)
      if (!sirens.length) for (const o of vehicles) o.yielding = false;
    }
  }
  const arrived = [];
  function updateTraffic(dt, t) {
    const slow = 1 - 0.3 * rush, motoGap = 1.1 - 0.55 * rush;   // the rush: everyone slower, scooters nose to tail
    if (sirens.length) sirenStep();
    for (const L of lanes) {
      const list = L.list; if (!list.length) continue;
      list.sort((a, b) => b.s * L.dir - a.s * L.dir);   // front-most first
      list.forEach((v, n) => {
        // the one it would run into: the nearest ahead whose width overlaps its own (scooters side by side pass)
        let lead = null, gap = Infinity;
        for (let k = 1; k < list.length; k++) { const o = list[(n - k + list.length) % list.length]; if (v.siren && o.yielding) continue; if (Math.abs(o.side - v.side) < o.w + v.w + 0.06) { lead = o; break; } }
        if (lead) { let du = (lead.s - v.s) * L.dir; if (du <= 0) du += LEN; gap = du - lead.half - v.half; }
        let room = Math.min(gap - (v.name === 'moto' ? motoGap : 1.1) - v.v * 0.35, v.siren || v.runsRed ? Infinity : roomAtLight(v, t), roundParked(v, L, t), roomForWalker(v, L)), cap = Infinity;   // (runsRed: one the traffic police will stop, street-csgt.js)
        if (sirens.length) {
          if (v.siren) { const red = roomAtLight(v, t); if (red < 14) cap = 3 + red * 0.3; }   // through a red light, slowly
          else if (yields(v, L)) { v.yielding = true; cap = v.vmax * 0.35; if (v.mode === 'drive' && !v.passing) v.sideGoal = Math.max(v.sideGoal, v.name === 'moto' ? 1.95 : v.w > 1 ? 1.35 : 1.72); }
          else v.yielding = false;
        }
        if (v.name === 'bus' && L === stopLane && !v.served) {   // the stop by the office
          const d = (STOP.s - v.s) * L.dir;
          if (d > -0.5) room = Math.min(room, d);
          if (Math.abs(d) < 0.4 && v.v < 0.3) { v.served = true; v.stopUntil = t + 7; }
        }
        if (v.mode === 'park') {   // pulling in to its place: indicating, slowing, in to the kerb, stop
          const d = (v.slot.s - v.s) * L.dir;
          room = Math.min(room, d);
          if (d < 30) v.blink = 1;
          if (d < 12) v.sideGoal = v.slot.side;
          if (d < 0.4 && v.v < 0.3) arrived.push(v);
        }
        let want = Math.min(v.vmax * (v.siren ? 1 : slow * (v.passing ? 0.7 : 1)), Math.sqrt(Math.max(0, 2 * 4.5 * (room - 0.15))), cap);
        if (t < v.stopUntil) want = 0;
        v.v += THREE.MathUtils.clamp(want - v.v, -10 * dt, 2.6 * dt);
        v.s += v.v * L.dir * dt;
        if (v.s > HI) { v.s -= LEN; v.served = false; } else if (v.s < LO) { v.s += LEN; v.served = false; }
      });
    }
    for (const v of arrived) settle(v, t);
    arrived.length = 0;
    // sideways, towards where it wants to be across the road: only as fast as it rolls forward, the nose turned that way
    for (const v of vehicles) {
      if (!v.on || v.side === v.sideGoal) { v.steer *= 0.8; continue; }
      const step = (0.12 + 0.3 * v.v) * dt, ds = THREE.MathUtils.clamp(v.sideGoal - v.side, -step, step);
      v.side += ds;
      v.steer += (THREE.MathUtils.clamp(Math.atan2(ds / dt, Math.max(v.v, 0.6)), -0.4, 0.4) - v.steer) * Math.min(1, dt * 8);
    }
  }
  const headPos = new Float32Array(vehicles.length * 3), tailPos = new Float32Array(vehicles.length * 3), blinkPos = new Float32Array(vehicles.length * 12);
  const dotMat = (c, size) => new THREE.PointsMaterial({ map: DOT, color: c, size, sizeAttenuation: false, transparent: true, depthWrite: false });
  const points = (arr, color, size) => { const o = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)), dotMat(color, size)); o.frustumCulled = false; G.add(o); return o; };
  const headPts = points(headPos, new THREE.Color(2.4, 2.2, 1.7), 6), tailPts = points(tailPos, new THREE.Color(2.6, 0.25, 0.2), 5);
  const blinkPts = points(blinkPos, new THREE.Color(3.4, 1.8, 0.12), 9);   // indicators and hazard lights, day and night
  const beams = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BEAM, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), vehicles.length);
  beams.frustumCulled = false; beams.renderOrder = 2; G.add(beams);

  const OFF = -1e4, tops = {};
  function drawVehicles(t) {
    for (const name in byKind) tops[name] = 0;
    const flash = (t * 1.6) % 1 < 0.55;
    vehicles.forEach((v, n) => {
      const M = meshes[v.name], shown = SHOW && v.k === 0 ? SHOW.indexOf(v.name) : -1;
      if (!v.on && shown < 0) {   // not out: nothing drawn
        if (M) for (const o of Object.values(M)) o?.setMatrixAt(v.k, Z0);
        headPos[n * 3 + 1] = tailPos[n * 3 + 1] = OFF; beams.setMatrixAt(n, Z0);
        for (let i = 0; i < 4; i++) blinkPos[(n * 4 + i) * 3 + 1] = OFF;
        return;
      }
      tops[v.name] = Math.max(tops[v.name], v.k + 1);
      const L = v.L, [lx, lz] = shown >= 0 ? [0, 0] : spotOf(L, v.s, v.side);
      const x = shown >= 0 ? -8 + shown * 4.6 : lx, z = shown >= 0 ? showZ : lz;
      const yaw = shown >= 0 ? 0 : yawOf(L) - v.steer;
      q.setFromAxisAngle(UP, yaw); P.set(x, GY + (shown < 0 && v.side > HALF + 0.15 ? 0.12 : 0), z); m4.compose(P, q, v.K.scaleV);   // (up on the pavement: parking there)
      // (ownRider: street-csgt.js draws the rider, or they got off; ownAll: it draws the whole thing, a patrol bike)
      if (M) { const mm = v.ownAll ? Z0 : m4; M.body.setMatrixAt(v.k, mm); M.trim.setMatrixAt(v.k, mm); M.rider?.setMatrixAt(v.k, v.ownRider || v.ownAll ? Z0 : m4); M.doors?.setMatrixAt(v.k, mm); }
      v.deco?.(m4);   // (a bridal car's flowers: street-wedding.js)
      if (M?.box) {   // a scooter: what this one carries
        const lv = v.livery, on = (yes) => (yes ? m4 : Z0);
        M.xsmLogo.setMatrixAt(v.k, on(lv === 'xsm')); M.grabLogo.setMatrixAt(v.k, on(lv === 'grab' || lv === 'food')); M.box.setMatrixAt(v.k, on(lv === 'food'));
        M.mask.setMatrixAt(v.k, on(v.mask && !v.ownRider && !v.ownAll));
        M.paxCloth.setMatrixAt(v.k, on(v.pax)); M.paxHelmet.setMatrixAt(v.k, on(v.pax)); M.paxTrim.setMatrixAt(v.k, on(v.pax));
        M.paxXsm.setMatrixAt(v.k, on(v.pax && lv === 'xsm')); M.paxGrab.setMatrixAt(v.k, on(v.pax && lv === 'grab'));
        if (v.extra && !v.ownAll) extras.draw(v, m4);
      }
      const fx = Math.cos(yaw), fz = -Math.sin(yaw), rx = -fz, rz = fx, lit = v.mode !== 'parked';   // heading, its right; parked: lights off
      if (lit) {
        headPos.set([x + fx * (v.half + 0.05), GY + v.K.head, z + fz * (v.half + 0.05)], n * 3);
        tailPos.set([x - fx * (v.half + 0.05), GY + v.K.head + 0.04, z - fz * (v.half + 0.05)], n * 3);
        P.set(x + fx * (v.half + 2.6), GY + 0.03, z + fz * (v.half + 2.6)); q.setFromAxisAngle(UP, yaw - Math.PI / 2); m4.compose(P, q, S1); beams.setMatrixAt(n, m4);
      } else { headPos[n * 3 + 1] = tailPos[n * 3 + 1] = OFF; beams.setMatrixAt(n, Z0); }
      // indicators: the right pair (pulling in), the left pair (pulling out) or all four (hazards), flashing
      const hy = GY + Math.min(v.K.head, 0.8), fl = v.half + 0.04, sd = v.w - 0.14;   // (just outside the nose and the tail)
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([side, end], i) => {
        const k = (n * 4 + i) * 3, show = flash && (v.blink === 2 || v.blink === side);
        if (!show) { blinkPos[k + 1] = OFF; return; }
        blinkPos[k] = x + fx * end * fl + rx * side * sd; blinkPos[k + 1] = hy; blinkPos[k + 2] = z + fz * end * fl + rz * side * sd;
      });
    });
    // each kind's meshes draw only up to the highest one out (the quiet hours cost little)
    for (const [name, M] of Object.entries(meshes)) if (M) for (const o of Object.values(M)) if (o) { o.count = tops[name]; o.instanceMatrix.needsUpdate = true; }
    beams.instanceMatrix.needsUpdate = true; extras.flush();
    headPts.geometry.attributes.position.needsUpdate = tailPts.geometry.attributes.position.needsUpdate = blinkPts.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- riders for the office (outings.js) ----------
     A scooter or a taxi comes from out of sight up lane L and pulls in at the kerb near s (or, with `side`, up onto the
     pavement), and waits there until release(); then it indicates, pulls out and rides off. livery: 'food' (GrabFood),
     'grab' / 'xsm' (a ride: the passenger wears the company's helmet), 'plain' (someone's own scooter, painted `paint`,
     ridden in `jacket`), 'taxi' (a Xanh SM car); or with `kind`, a car of that kind (the bridal car). pax: someone on the
     back from the start, in that colour. stay: no hooting moves it on (it waits for release() whoever is behind). */
  function pick(livery, kind) {
    const pool = (kind ? byKind[kind] || [] : livery === 'taxi' ? byKind.xsm : byKind.moto.filter((v) => v.livery === livery)).filter((v) => !v.special);
    return pool.find((o) => !o.on) || pool.find((o) => o.on && o.mode === 'drive' && outOfSight(o)) || null;
  }
  function dress(v, { paint, jacket, pax } = {}) {
    const M = meshes[v.name];
    if (paint) { v.paint.set(paint); M?.body.setColorAt(v.k, v.paint); }
    if (jacket && M?.rider) M.rider.setColorAt(v.k, new THREE.Color(jacket));
    if (M?.paxCloth) { v.pax = !!pax; if (pax) M.paxCloth.setColorAt(v.k, new THREE.Color(pax)); }
    for (const o of [M?.body, M?.rider, M?.paxCloth]) if (o?.instanceColor) o.instanceColor.needsUpdate = true;
  }
  function riderOf(v, sl, L) {
    return {
      vehicle: v,
      get state() { return v.slot !== sl ? 'gone' : v.mode === 'park' ? 'coming' : v.mode === 'parked' ? 'waiting' : 'going'; },
      // where it stands, and which way it faces
      where() { const [x, z] = spotOf(L, v.s, v.side); return { x, z, fx: L.axis === 'x' ? L.dir : 0, fz: L.axis === 'z' ? L.dir : 0 }; },
      // where it will stop (while it is still on its way)
      stop() { const [x, z] = spotOf(L, sl.s, sl.side); return { x, z, fx: L.axis === 'x' ? L.dir : 0, fz: L.axis === 'z' ? L.dir : 0 }; },
      release() { if (v.mode === 'parked') v.until = 0; },
      // not wanted after all: still on its way, it rides on by
      cancel() { if (v.mode !== 'park') return; Object.assign(v, { mode: 'drive', slot: null, blink: 0, sideGoal: v.base }); slots.splice(slots.indexOf(sl), 1); },
      board(color) { if (v.name === 'moto') dress(v, { pax: color }); },   // someone gets on the back
      alight() { if (v.name === 'moto') dress(v, { pax: null }); },
      // its rider got off and left it here (a parked scooter takes its place): off the street
      vanish() { const i = L.parked.indexOf(v); if (i >= 0) L.parked.splice(i, 1); retire(v); slots.splice(slots.indexOf(sl), 1); v.slot = null; v.special = false; },
    };
  }
  function callRider(L, s0, opt = {}) {
    const livery = opt.livery || 'food', car = livery === 'taxi' || !!opt.kind, v = L && pick(livery, opt.kind);
    if (!v) return null;
    if (!opt.side) for (const c of L.cross) if (Math.abs(s0 - c) < 6.5) s0 = c + Math.sign(s0 - c || 1) * 6.5;
    if (v.on) retire(v);
    let s = s0 - L.dir * (opt.far ?? 70);
    for (let k = 0; k < 6 && L.list.some((o) => Math.abs(o.s - s) < 8); k++) s -= L.dir * 9;
    s = ((s - LO) % LEN + LEN) % LEN + LO;
    dress(v, opt);
    const sl = { L, s: s0, kind: 'rider', side: opt.side ?? (car ? 1.5 : 1.92), v, next: Infinity, stay: !!opt.stay };
    slots.push(sl);
    Object.assign(v, { L, s, on: true, special: true, mode: 'park', slot: sl, v: v.vmax * 0.7, side: v.base, sideGoal: v.base, steer: 0, blink: 0, blinkOff: 0, passing: null });
    L.list.push(v);
    return riderOf(v, sl, L);
  }
  // one standing there already (at the kerb, or on the pavement: `side`), that pulls out now: someone off on their own
  function depart(L, s, opt = {}) {
    const v = L && pick(opt.livery || 'plain', opt.kind);
    if (!v) return null;
    if (v.on) retire(v);
    dress(v, opt);
    const sl = { L, s, kind: 'rider', side: opt.side ?? 1.92, v, next: Infinity, stay: !!opt.stay };
    slots.push(sl);
    Object.assign(v, { L, s, on: true, special: true, mode: 'parked', slot: sl, v: 0, side: sl.side, sideGoal: sl.side, steer: 0, blink: 0, blinkOff: 0, passing: null, until: opt.stay ? Infinity : 0 });
    L.parked.push(v);
    return riderOf(v, sl, L);
  }

  // one riding in its lane, pulled over at the kerb near s0 (the traffic police, street-csgt.js): it indicates, slows,
  // pulls in and waits there until release(), then rides on
  function pullOver(v, s0, side = 1.92) {
    if (!v?.on || v.mode !== 'drive') return null;
    const sl = { L: v.L, s: s0, kind: 'rider', side, v, next: Infinity, stay: true };
    slots.push(sl);
    Object.assign(v, { special: true, mode: 'park', slot: sl, passing: null });
    return riderOf(v, sl, v.L);
  }
  // a scooter's colours as drawn: the rider's jacket (and helmet), the bike, a passenger's clothes and helmet
  const col4 = new THREE.Color();
  function lookOf(v) {
    const M = meshes[v.name], hex = (o) => (o?.instanceColor ? (o.getColorAt(v.k, col4), `#${col4.getHexString()}`) : null);
    return { jacket: hex(M?.rider), paint: `#${v.paint.getHexString()}`, pax: v.pax ? hex(M?.paxCloth) : null, paxHelmet: v.pax ? hex(M?.paxHelmet) : null };
  }
  // the light at crossing idx of lane L for the traffic along it: 'g', 'y' or 'r'
  const lightAt = (L, idx, t) => { const [i, j] = L.axis === 'z' ? [L.i, idx] : [idx, L.j]; return lightOf(phaseOf(i, j, t, L.axis)); };

  /* ---------- scooters parked on the office's pavement (the staff's own, outings.js) ---------- */
  let ev = null;   // (the e-scooters: built with the set pieces, below)
  const BIKES = low ? 12 : 24, scoot = scooterParts(), bikeFree = [...Array(BIKES).keys()];
  const bikeBody = new THREE.InstancedMesh(mergeAll(scoot.body), paintM, BIKES), bikeTrim = new THREE.InstancedMesh(mergeAll(scoot.trim), trimM, BIKES);
  for (const o of [bikeBody, bikeTrim]) { o.frustumCulled = false; for (let i = 0; i < BIKES; i++) o.setMatrixAt(i, Z0); G.add(o); }
  bikeBody.castShadow = !low;
  // (electric: one of the e-scooters, street-ev.js, its ids from 1000; seed: its owner's, for its share of the charge)
  function parkBike(L, s, side, color, electric = false, seed = 0) {
    if (electric && ev) { const i = L ? ev.park(L, s, side, color, seed) : -1; return i < 0 ? -1 : 1000 + i; }
    const id = bikeFree.shift();
    if (id == null || !L) return -1;
    const [x, z] = spotOf(L, s, side);
    q.setFromAxisAngle(UP, yawOf(L)); P.set(x, GY + 0.12, z); m4.compose(P, q, S1);
    bikeBody.setMatrixAt(id, m4); bikeTrim.setMatrixAt(id, m4); bikeBody.setColorAt(id, new THREE.Color(color));
    bikeBody.instanceMatrix.needsUpdate = bikeTrim.instanceMatrix.needsUpdate = bikeBody.instanceColor.needsUpdate = true;
    return id;
  }
  function unparkBike(id) {
    if (id == null || id < 0) return;
    if (id >= 1000) { ev?.unpark(id - 1000); return; }
    bikeBody.setMatrixAt(id, Z0); bikeTrim.setMatrixAt(id, Z0); bikeBody.instanceMatrix.needsUpdate = bikeTrim.instanceMatrix.needsUpdate = true;
    bikeFree.push(id);
  }

  /* ---------- people on the pavements ----------
     A walk network: each block's corners (just inside the pavement), its sides, and the zebra crossings between the
     corners at every crossing. The office's own block only where its pavement is clear of the terrace. People wander
     it, and wait at the kerb until the lights let them cross; fewer late at night (they go home where you don't see). */
  const INS = 0.95, nodes = [], byKey = new Map(), adj = [];
  const node = (x, z) => { const key = `${x.toFixed(2)},${z.toFixed(2)}`; if (!byKey.has(key)) { byKey.set(key, nodes.length); nodes.push([x, z]); adj.push([]); } return byKey.get(key); };
  const link = (a, b, cross = null) => { if (a === b || adj[a].some((e) => e.to === b)) return; adj[a].push({ to: b, cross }); adj[b].push({ to: a, cross }); };
  const shut = new Set(), ek = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`), walkable = (a, b) => !shut.has(ek(a, b));   // (a stretch nobody walks: a wedding's tent on it)
  const clearOfTerrace = (x0, z0, x1, z1) => Math.max(x0, x1) < TER.x0 - 0.5 || Math.min(x0, x1) > TER.x1 + 0.5 || Math.max(z0, z1) < TER.z0 - 0.5 || Math.min(z0, z1) > TER.z1 + 0.5;
  const blocks = [{ x0: SB.x0, x1: SB.x1, z0: SB.z0, z1: SB.z1, office: true }], officeSides = [];
  for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
    const b = { x0: XS[i] + HALF, x1: XS[i + 1] - HALF, z0: ZS[j] + HALF, z1: ZS[j + 1] - HALF };
    if (!inSB((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) && near((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 70)) blocks.push(b);
  }
  for (const b of blocks) {
    const X0 = b.x0 + INS, X1 = b.x1 - INS, Z0 = b.z0 + INS, Z1 = b.z1 - INS;
    for (const [ax, az, bx, bz, nx, nz] of [[X0, Z0, X1, Z0, 0, -1], [X1, Z0, X1, Z1, 1, 0], [X1, Z1, X0, Z1, 0, 1], [X0, Z1, X0, Z0, -1, 0]]) {
      if (b.office && !clearOfTerrace(ax, az, bx, bz)) continue;
      link(node(ax, az), node(bx, bz));
      if (b.office) officeSides.push({ a: [ax, az], b: [bx, bz], n: [nx, nz] });   // (n: out, towards the street)
    }
  }
  const D = HALF + INS;
  for (const c of crossings) {
    if (!near(c.x, c.z, 70)) continue;
    const id = (dx, dz) => byKey.get(`${(c.x + dx * D).toFixed(2)},${(c.z + dz * D).toFixed(2)}`);
    for (const [a, b, axis] of [[id(1, 1), id(-1, 1), 'x'], [id(1, -1), id(-1, -1), 'x'], [id(1, 1), id(1, -1), 'z'], [id(-1, 1), id(-1, -1), 'z']]) {
      if (a != null && b != null && adj[a].length && adj[b].length) link(a, b, { i: c.i, j: c.j, axis });
    }
  }
  const usable = nodes.map((_, n) => n).filter((n) => adj[n].length);
  const PN = usable.length ? (low ? 28 : 64) : 0;
  const ped = {
    torso: [W(at(new RoundedBoxGeometry(0.26, 0.56, 0.4, 2, 0.08), 0, 1.0, 0)), W(at(new THREE.BoxGeometry(0.12, 0.5, 0.1), 0, 0.98, 0.25)), W(at(new THREE.BoxGeometry(0.12, 0.5, 0.1), 0, 0.98, -0.25))],
    head: [colorize(at(new THREE.SphereGeometry(0.24, 14, 10), 0, 1.52, 0), '#EDC4A2'), colorize(at(new THREE.SphereGeometry(0.255, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateZ(0.35), -0.03, 1.55, 0), '#2B2420')],
    leg: [colorize(at(new THREE.BoxGeometry(0.15, 0.62, 0.15), 0, -0.31, 0), '#363D4C'), colorize(at(new THREE.BoxGeometry(0.22, 0.08, 0.16), 0.03, -0.6, 0), '#1E2125')],
    hat: [colorize(at(new THREE.ConeGeometry(0.4, 0.22, 16), 0, 1.84, 0), '#E5D49C')],
    umbrella: [W(at(new THREE.ConeGeometry(0.62, 0.26, 10, 1, true), 0, 2.15, 0)), colorize(at(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), 0, 1.7, 0), '#2B2F36')],
  };
  const pm = {};
  for (const [k, list] of Object.entries(ped)) {
    const n = Math.max(1, k === 'leg' ? PN * 2 : PN);
    pm[k] = new THREE.InstancedMesh(mergeAll(list), vmat({ roughness: 0.85, side: k === 'umbrella' ? THREE.DoubleSide : THREE.FrontSide }), n);
    pm[k].frustumCulled = false; pm[k].count = k === 'leg' ? PN * 2 : PN; G.add(pm[k]);
  }
  pm.torso.castShadow = pm.head.castShadow = !low;
  const SHIRTS = ['#E8742A', '#3F7CC4', '#F2F2F2', '#D64550', '#2A9D8F', '#C9A227', '#8C4FA8', '#5B6CD8', '#3B3B3B', '#F28FA8', '#6A8042'];
  const UMBRELLAS = ['#D64550', '#2E86DE', '#F2C200', '#2A9D8F', '#3B3B3B', '#8C4FA8'];
  /* street sellers among them: two women carrying fruit in baskets on a shoulder pole, under a conical hat (6:00–19:00),
     two lottery ticket sellers with a fan of tickets (8:00–21:00). Slower, and they stop now and then to sell. */
  const JOBS = PN >= 4 ? ['pole', 'pole', 'tickets', 'tickets'] : [], HOURS = { pole: [6, 19], tickets: [8, 21] };
  const working = (job) => hour >= HOURS[job][0] && hour < HOURS[job][1];
  const FRUIT = ['#F28C28', '#F2C200', '#7DBB3C', '#D9442B', '#F2C200'];
  const poleParts = [limb(V3(-0.86, 1.3, 0.22), V3(0.86, 1.3, 0.22), 0.022, '#C9A86A')];
  for (const x of [-0.8, 0.8]) {
    poleParts.push(limb(V3(x, 1.29, 0.22), V3(x, 0.74, 0.22), 0.008, '#8A6A4A'), colorize(at(new THREE.CylinderGeometry(0.25, 0.2, 0.16, 12), x, 0.66, 0.22), '#B98A4E'));
    for (let i = 0; i < 5; i++) poleParts.push(ball(0.075, x + Math.cos(i * 1.3) * 0.12, 0.77, 0.22 + Math.sin(i * 1.3) * 0.12, FRUIT[i]));
  }
  const ticketParts = [boxAt(0.18, 0.14, 0.08, 0.05, 0.86, 0.2, '#3B3B3B')];
  ['#E8473B', '#2E86DE', '#F2C200', '#2A9D8F', '#E8742A'].forEach((c, i) => ticketParts.push(colorize(at(new THREE.BoxGeometry(0.004, 0.14, 0.07).rotateX((i - 2) * 0.22), 0.3, 1.1, 0), c)));
  const jobMesh = (list, n) => { const o = new THREE.InstancedMesh(mergeAll(list), vmat({ roughness: 0.8 }), Math.max(1, n)); o.frustumCulled = false; for (let i = 0; i < o.count; i++) o.setMatrixAt(i, Z0); G.add(o); return o; };
  const jm = { pole: jobMesh(poleParts, 2), tickets: jobMesh(ticketParts, 2) };
  const people = [], farNodes = usable.filter((n) => !near(nodes[n][0], nodes[n][1], 34));
  let walkersWant = Math.round(PN * walkersAt(hour)), walkersOn = 0;
  for (let k = 0; k < PN; k++) {
    const a = cPick(usable), e = cPick(adj[a]), job = JOBS[k] || null, on = job ? working(job) : k - JOBS.length < walkersWant;
    people.push({ a, b: e.to, cross: e.cross, u: cr(), speed: job === 'pole' ? 0.75 : job ? 0.9 : cR(0.95, 1.45), off: cR(-0.22, 0.22), hat: job === 'pole' || (!job && cr() < 0.14),
      walk: cR(0, 6), yaw: 0, waiting: false, on, job, slot: job ? JOBS.slice(0, k).filter((j) => j === job).length : -1, restUntil: 0 });
    if (on && !job) walkersOn++;
    pm.torso.setColorAt(k, new THREE.Color(cPick(SHIRTS)));
    pm.umbrella.setColorAt(k, new THREE.Color(cPick(UMBRELLAS)));
  }
  const qs = new THREE.Quaternion(), ZA = new THREE.Vector3(0, 0, 1);
  function nextEdge(p) {
    const ways = adj[p.b].filter((e) => walkable(p.b, e.to)), opts = ways.filter((e) => e.to !== p.a), list = opts.length ? opts : ways.length ? ways : adj[p.b];
    // crossings a little less often than walking on round the block
    const w = list.map((e) => (e.cross ? 0.55 : 1)), tot = w.reduce((s, x) => s + x, 0);
    let r = Math.random() * tot, pick = list[0];
    for (let n = 0; n < list.length; n++) if ((r -= w[n]) <= 0) { pick = list[n]; break; }
    p.a = p.b; p.b = pick.to; p.cross = pick.cross; p.u = 0;
  }
  // as many out as the hour has: newcomers start somewhere out of sight, and those over go home at a far corner
  let walkersSeen = -1;
  function walkersCensus(t) {
    if (t - walkersSeen < 1) return; walkersSeen = t;
    walkersWant = Math.round(PN * walkersAt(hour));
    const start = (p) => { const a = cPick(farNodes), ways = adj[a].filter((x) => walkable(a, x.to)), e = cPick(ways.length ? ways : adj[a]); Object.assign(p, { a, b: e.to, cross: e.cross, u: 0, on: true }); };
    for (const p of people) {
      if (!farNodes.length) break;
      if (p.job) { if (!p.on && working(p.job)) start(p); continue; }   // (sellers keep their own hours)
      if (walkersOn >= walkersWant || p.on) continue;
      start(p); walkersOn++;
    }
  }
  function updatePeople(dt, t) {
    const rain = wx.rain > 0.05;
    pm.umbrella.visible = rain;
    walkersCensus(t);
    people.forEach((p, k) => {
      if (!p.on) { for (const o of [pm.torso, pm.head, pm.hat, pm.umbrella]) o.setMatrixAt(k, Z0); pm.leg.setMatrixAt(k * 2, Z0); pm.leg.setMatrixAt(k * 2 + 1, Z0); if (p.job) jm[p.job].setMatrixAt(p.slot, Z0); return; }
      const [ax, az] = nodes[p.a], [bx, bz] = nodes[p.b], len = Math.hypot(bx - ax, bz - az) || 1;
      p.waiting = t < p.restUntil;   // (a seller stopped to sell)
      if (p.cross && p.u === 0) {   // at the kerb: the lights for this direction, with time to get across
        const ph = phaseOf(p.cross.i, p.cross.j, t, p.cross.axis);
        if (!(ph < 8 - len / p.speed * 0.6)) p.waiting = true;
      }
      if (!p.waiting) { p.u += (p.speed * dt) / len; p.walk += dt * p.speed * 5.6; }
      if (p.u >= 1) {
        const home = p.job ? !working(p.job) : walkersOn > walkersWant;
        if (home && !near(bx, bz, 34)) { p.on = false; if (!p.job) walkersOn--; return; }   // (drawn hidden next frame)
        p.u = 0; nextEdge(p);
        if (p.job && !p.cross && Math.random() < 0.35) p.restUntil = t + cR(5, 10);
      }
      const ux = (bx - ax) / len, uz = (bz - az) / len, x = ax + (bx - ax) * Math.min(1, p.u) - uz * p.off, z = az + (bz - az) * Math.min(1, p.u) + ux * p.off;
      const yaw = Math.atan2(-uz, ux); p.yaw += (THREE.MathUtils.euclideanModulo(yaw - p.yaw + Math.PI, Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
      const swing = p.waiting ? 0 : Math.sin(p.walk) * 0.5, bob = p.waiting ? 0 : Math.abs(Math.cos(p.walk)) * 0.035;
      q.setFromAxisAngle(UP, p.yaw);
      const yb = p.cross ? GY : GY + 0.12;   // on the pavement (12 cm up) or on the road
      P.set(x, yb + bob, z); m4.compose(P, q, S1);
      pm.torso.setMatrixAt(k, m4); pm.head.setMatrixAt(k, m4);
      if (p.job) jm[p.job].setMatrixAt(p.slot, m4);
      pm.hat.setMatrixAt(k, p.hat && !rain ? m4 : Z0);
      if (rain) pm.umbrella.setMatrixAt(k, m4);
      for (const [n, sgn] of [[0, 1], [1, -1]]) {   // legs from the hips, swinging opposite ways
        qs.setFromAxisAngle(ZA, swing * sgn).premultiply(q);
        P.set(x + Math.sin(p.yaw) * 0.1 * sgn, yb + 0.72 + bob, z + Math.cos(p.yaw) * 0.1 * sgn);   // (the body's left-right is its local z)
        m4.compose(P, qs, S1); pm.leg.setMatrixAt(k * 2 + n, m4);
      }
    });
    for (const k of ['torso', 'head', 'leg', 'hat', 'umbrella']) pm[k].instanceMatrix.needsUpdate = true;
    jm.pole.instanceMatrix.needsUpdate = jm.tickets.instanceMatrix.needsUpdate = true;
  }

  /* ---------- street food ----------
     Across the street in front of the office, on the parks' edges: a bánh mì cart at the kerb (6:00–10:30 and
     15:00–20:30) with its seller, and a trà đá stall of low plastic tables and stools on the grass at the corner, more
     people on it towards the evening, a bulb over it after dark. Each is built in its own frame: x along the kerb, z out
     towards the street. */
  const toPark = ([x0, x1, z0, z1]) => Math.hypot(C[0] - THREE.MathUtils.clamp(C[0], x0, x1), C[1] - THREE.MathUtils.clamp(C[1], z0, z1));
  const nearParks = parks.filter((r) => toPark(r) < 30).sort((a, b) => toPark(a) - toPark(b));
  // the park's edge that faces the office: its middle, along it, out of the park; and the corner end nearest the office
  function facing([x0, x1, z0, z1]) {
    const dx = C[0] < x0 ? x0 - C[0] : C[0] > x1 ? C[0] - x1 : 0, dz = C[1] < z0 ? z0 - C[1] : C[1] > z1 ? C[1] - z1 : 0;
    const f = dz >= dx ? { o: [(x0 + x1) / 2, C[1] < z0 ? z0 : z1], along: [1, 0], out: [0, C[1] < z0 ? -1 : 1], half: (x1 - x0) / 2 }
      : { o: [C[0] < x0 ? x0 : x1, (z0 + z1) / 2], along: [0, 1], out: [C[0] < x0 ? -1 : 1, 0], half: (z1 - z0) / 2 };
    f.end = Math.sign((C[0] - f.o[0]) * f.along[0] + (C[1] - f.o[1]) * f.along[1]) || 1;
    return f;
  }
  // a frame on that edge: `a` along it from the middle, `d` in from the kerb
  function frame(f, a, d, y = 0.12) {
    const x = f.o[0] + f.along[0] * a - f.out[0] * d, z = f.o[1] + f.along[1] * a - f.out[1] * d;
    const M = new THREE.Matrix4().makeBasis(V3(f.out[1], 0, -f.out[0]), UPY, V3(f.out[0], 0, f.out[1])).setPosition(x, GY + y, z);
    return { M, x, z };
  }
  const SKINS = ['#E8C2A0', '#D9AE88', '#F0CCAA'];
  // someone standing (the seller) or sitting on a stool facing +x (people at the stall), in local units
  function standing(shirt) {
    return [boxAt(0.26, 0.56, 0.38, 0, 1.0, 0, shirt), boxAt(0.27, 0.42, 0.39, 0.02, 0.78, 0, '#F2F2F2'), ball(0.23, 0, 1.5, 0, SKINS[0]),
      colorize(at(new THREE.ConeGeometry(0.4, 0.22, 16), 0, 1.78, 0), '#E5D49C'), boxAt(0.15, 0.7, 0.15, 0, 0.35, 0.1, '#363D4C'), boxAt(0.15, 0.7, 0.15, 0, 0.35, -0.1, '#363D4C')];
  }
  const seated = { shirt: [W(at(new RoundedBoxGeometry(0.26, 0.48, 0.38, 2, 0.08).rotateZ(-0.12), -0.02, 0.6, 0))], rest: [ball(0.22, 0.04, 1.0, 0, SKINS[1]),
    colorize(at(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateZ(0.35), 0.01, 1.03, 0), '#2B2420')] };
  for (const z of [-0.1, 0.1]) seated.rest.push(boxAt(0.34, 0.13, 0.13, 0.15, 0.36, z, '#363D4C'), boxAt(0.13, 0.32, 0.13, 0.32, 0.16, z, '#363D4C'), boxAt(0.2, 0.06, 0.12, 0.36, 0.03, z, '#1E2125'),
    limb(V3(0.0, 0.78, z * 2.2), V3(0.22, 0.45, z * 1.8), 0.05, SKINS[1]));
  // a board readable from both sides (one face each way: a double-sided plane reads backwards from behind)
  const board = (map, w, h) => { const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ map }); for (const r of [0, Math.PI]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.rotation.y = r; p.position.z = r ? -0.004 : 0.004; g.add(p); } return g; };
  const sign = (text, bg, fg, w = 256) => canvasTex(w, 64, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, 64); g.fillStyle = fg; g.font = '900 40px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34); });
  const food = { cart: null, stall: null };
  if (nearParks.length) {
    // the bánh mì cart
    const f = facing(nearParks[0]), c = frame(f, f.end * Math.max(0, f.half - 2.6), 0.42), solid = [], glass = [];
    for (const z of [-0.3, 0.3]) solid.push(colorize(at(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14).rotateX(Math.PI / 2), -0.38, 0.17, z), '#22252A'));
    solid.push(boxAt(0.04, 0.3, 0.04, 0.55, 0.15, 0, '#5E6670'), boxAt(1.3, 0.55, 0.6, 0, 0.58, 0, '#B9C0C8'), boxAt(1.36, 0.04, 0.66, 0, 0.87, 0, '#DCE1E6'),
      colorize(at(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 14), 0.48, 0.92, 0.08), '#2B2F36'));
    for (const [x, z] of [[-0.6, -0.24], [-0.6, 0.24], [0.6, -0.24], [0.6, 0.24]]) solid.push(boxAt(0.025, 0.46, 0.025, x * 0.92, 1.12, z, '#5E6670'), boxAt(0.03, 0.72, 0.03, x * 0.92, 1.6, z * 0.2, '#5E6670'));
    for (let i = 0; i < 6; i++) solid.push(colorize(new THREE.SphereGeometry(0.06, 10, 6).scale(2.4, 0.8, 0.9).translate(-0.35 + (i % 3) * 0.3, 0.95 + Math.floor(i / 3) * 0.05, i < 3 ? -0.1 : 0.12), '#D9A441'));
    glass.push(new THREE.BoxGeometry(1.12, 0.42, 0.5).translate(0, 1.11, 0));
    solid.push(...standing('#5B6CD8').map((g) => g.translate(0.98, 0, 0.05)));   // the seller, at the end of the cart
    const cart = new THREE.Group();
    cart.add(new THREE.Mesh(mergeAll(solid), vmat({ roughness: 0.55, metalness: 0.25 })), new THREE.Mesh(mergeAll(glass), new THREE.MeshStandardMaterial({ color: '#D6ECF5', transparent: true, opacity: 0.32, roughness: 0.1 })));
    const plate = board(sign('BÁNH MÌ', '#C8102E', '#FFE45C'), 1.15, 0.28); plate.position.set(0, 1.86, 0); cart.add(plate);
    cart.children[0].castShadow = !low;
    cart.matrixAutoUpdate = false; cart.matrix.copy(c.M); G.add(cart);
    food.cart = { g: cart, x: c.x, z: c.z, hours: [[6, 10.5], [15, 20.5]] };
    // the trà đá stall, on the grass at the corner of the next park (or the same one, at its other end)
    const f2 = nearParks[1] ? facing(nearParks[1]) : f, end = nearParks[1] ? f2.end : -f.end, st = frame(f2, end * Math.max(0, f2.half - 2.6), 2.4, 0.18);   // (on the grass)
    const parts = [], seats = [], STOOL = ['#D62F2F', '#2E6FD1', '#D62F2F', '#2E6FD1', '#F2C200', '#D62F2F'];
    for (const tx of [-0.65, 0.75]) {
      parts.push(boxAt(0.56, 0.04, 0.56, tx, 0.42, 0, '#2F6FB5'));
      for (const [lx, lz] of [[-0.24, -0.24], [-0.24, 0.24], [0.24, -0.24], [0.24, 0.24]]) parts.push(boxAt(0.04, 0.4, 0.04, tx + lx, 0.2, lz, '#2F6FB5'));
      for (let i = 0; i < 3; i++) parts.push(colorize(at(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 10), tx - 0.12 + i * 0.12, 0.48, (i - 1) * 0.1), '#C98A3A'));
    }
    [[-1.15, 0, 0], [-0.65, -0.55, -Math.PI / 2], [-0.15, 0.05, Math.PI], [0.75, 0.55, Math.PI / 2], [1.25, 0, Math.PI], [0.25, 0, 0]].forEach(([x, z, r], i) => {
      parts.push(colorize(at(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 12), x, 0.15, z), STOOL[i]));
      seats.push({ x, z, r });   // (r: which way they face, towards their table)
    });
    parts.push(colorize(at(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 12), 0.25, 0.48, -0.55), '#C0392B'), colorize(at(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 12), 0.25, 0.15, -0.55), '#2E6FD1'));
    parts.push(boxAt(0.05, 2.3, 0.05, -1.55, 1.15, -0.6, '#2B2F36'), boxAt(0.6, 0.04, 0.04, -1.27, 2.28, -0.6, '#2B2F36'));
    const stall = new THREE.Group();
    stall.add(new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.7 })));
    const tea = board(sign('TRÀ ĐÁ', '#1F6F3B', '#FFFFFF'), 0.62, 0.3); tea.position.set(-1.2, 0.36, 0.45); tea.rotation.x = -0.25; stall.add(tea);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.3) })); bulb.position.set(-0.98, 2.16, -0.6); stall.add(bulb);
    const sitShirt = new THREE.InstancedMesh(mergeAll(seated.shirt), vmat({ roughness: 0.85 }), seats.length), sitRest = new THREE.InstancedMesh(mergeAll(seated.rest), vmat({ roughness: 0.85 }), seats.length);
    seats.forEach((p, i) => {
      // on the stool, facing the table, a little back from its middle (their knees towards the table)
      const m = new THREE.Matrix4().compose(V3(p.x - Math.cos(p.r) * 0.12, 0.0, p.z + Math.sin(p.r) * 0.12), new THREE.Quaternion().setFromAxisAngle(UP, p.r), S1);
      sitShirt.setMatrixAt(i, m); sitRest.setMatrixAt(i, m); sitShirt.setColorAt(i, new THREE.Color(SHIRTS[(i * 5 + 2) % SHIRTS.length]));
    });
    for (const o of [sitShirt, sitRest]) { o.frustumCulled = false; o.castShadow = !low; stall.add(o); }
    stall.matrixAutoUpdate = false; stall.matrix.copy(st.M); G.add(stall);
    // (toMiddle: which way along the stall's own x the rest of the park's edge is, for the chess game beside it)
    const lx = [f2.out[1], -f2.out[0]], toMiddle = Math.sign(-end * (f2.along[0] * lx[0] + f2.along[1] * lx[1])) || 1;
    food.stall = { g: stall, x: st.x, z: st.z, bulb, sitShirt, sitRest, hours: [[6.5, 23]], M: st.M, toMiddle };
  }
  const open = (h, list) => list.some(([a, b]) => h >= a && h < b);
  // who is at the stall: a few in the morning, fewer by day, full in the evening
  const sitters = (h) => (h < 9 ? 3 : h < 16 ? 2 : h < 18 ? 3 : h < 22 ? 6 : 3);
  let foodAt = -1, nightOn = false;
  function updateFood(t) {
    if (t - foodAt < 1 || !food.cart) return; foodAt = t;
    food.cart.g.visible = open(hour, food.cart.hours);
    const S = food.stall; S.g.visible = open(hour, S.hours); S.bulb.visible = nightOn;
    S.sitShirt.count = S.sitRest.count = sitters(hour);
  }

  /* ---------- on foot from the office (outings.js) ----------
     The same pavements and zebras, for people from the office going out: the shortest way between two points on the
     network, a crossing waiting for the green man; and where the office's people come out onto the pavement. */
  const edges = [];
  adj.forEach((list, a) => { for (const e of list) if (a < e.to) edges.push({ a, b: e.to, cross: e.cross }); });
  // the nearest point on the network: which edge, and where on it
  function onNet(x, z) {
    let best = null;
    for (const e of edges) {
      if (!walkable(e.a, e.b)) continue;
      const [ax, az] = nodes[e.a], [bx, bz] = nodes[e.b], dx = bx - ax, dz = bz - az;
      const u = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { e, d, x: px, z: pz };
    }
    return best;
  }
  let now = 0;
  const green = (c, len) => () => phaseOf(c.i, c.j, now, c.axis) < 8 - (len / 2.7) * 0.75;
  /* from P to Q ({ x, z }, each on or by the network): the points to walk to, in order. `road`: that leg crosses the
     road (walked at road level); `gate`: wait at the kerb until it says yes. Null if there is no way. */
  function route(P, Q) {
    const A = onNet(P.x, P.z), B = onNet(Q.x, Q.z);
    if (!A || !B) return null;
    const out = [], pt = (x, z, road = null, gate = null) => out.push({ x, z, road: !!road, gate });
    if (A.d > 0.05) pt(A.x, A.z);
    if (A.e === B.e) { pt(B.x, B.z, A.e.cross); if (B.d > 0.05) pt(Q.x, Q.z); return out; }
    const N = nodes.length, dist = new Array(N).fill(Infinity), via = new Array(N).fill(null), done = new Uint8Array(N);
    const far = (n, x, z) => Math.hypot(nodes[n][0] - x, nodes[n][1] - z);
    dist[A.e.a] = far(A.e.a, A.x, A.z); dist[A.e.b] = far(A.e.b, A.x, A.z);
    for (;;) {
      let u = -1;
      for (let n = 0; n < N; n++) if (!done[n] && dist[n] < Infinity && (u < 0 || dist[n] < dist[u])) u = n;
      if (u < 0) break;
      done[u] = 1;
      for (const e of adj[u]) { if (!walkable(u, e.to)) continue; const d = dist[u] + far(e.to, ...nodes[u]); if (d < dist[e.to]) { dist[e.to] = d; via[e.to] = { from: u, cross: e.cross }; } }
    }
    const ea = dist[B.e.a] + far(B.e.a, B.x, B.z), eb = dist[B.e.b] + far(B.e.b, B.x, B.z);
    if (!Number.isFinite(Math.min(ea, eb))) return null;
    const chain = [];
    for (let n = ea <= eb ? B.e.a : B.e.b; ; n = via[n].from) { chain.unshift(n); if (!via[n]) break; }
    pt(...nodes[chain[0]], A.e.cross);
    for (let k = 1; k < chain.length; k++) {
      const c = via[chain[k]].cross, [x, z] = nodes[chain[k]];
      pt(x, z, c, c ? green(c, Math.hypot(x - nodes[chain[k - 1]][0], z - nodes[chain[k - 1]][1])) : null);
    }
    pt(B.x, B.z, B.e.cross);
    if (B.d > 0.05) pt(Q.x, Q.z);
    return out;
  }
  /* where people from the office come out onto the pavement, nearest first: on each side of the block they can walk,
     the point nearest (x, z) (the lift or the door), clear of the corners; with the lane along that kerb */
  function exits(x, z) {
    return officeSides.map(({ a: [ax, az], b: [bx, bz], n: [nx, nz] }) => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      const u = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (l * l), 1.6 / l, 1 - 1.6 / l), ex = ax + dx * u, ez = az + dz * u;
      const L = nz ? laneAt('x', nz > 0 ? SB.z1 + HALF : SB.z0 - HALF, -nz) : laneAt('z', nx > 0 ? SB.x1 + HALF : SB.x0 - HALF, nx);
      return { x: ex, z: ez, n: [nx, nz], a: [ax, az], b: [bx, bz], L, s: L ? (L.axis === 'x' ? ex : ez) : 0, d: Math.hypot(ex - x, ez - z) };
    }).sort((e1, e2) => e1.d - e2.d);
  }

  /* ---------- set pieces: the parks by the hour, cờ tướng at the stall (street-park.js), a weekend wedding (street-wedding.js) ---------- */
  // a stretch of pavement out of use (pass the corners at its ends): nobody walks it; whoever is on it turns back
  function closeWalk(ax, az, bx, bz, on) {
    const a = byKey.get(`${ax.toFixed(2)},${az.toFixed(2)}`), b = byKey.get(`${bx.toFixed(2)},${bz.toFixed(2)}`);
    if (a == null || b == null) return;
    if (!on) { shut.delete(ek(a, b)); return; }
    shut.add(ek(a, b));
    for (const p of people) if (p.on && ek(p.a, p.b) === ek(a, b)) { if (p.u < 0.5) [p.a, p.b, p.u] = [p.b, p.a, 1 - p.u]; p.u = Math.max(p.u, 0.999); }
  }
  // something standing in lane L at the kerb (s along it, `half` its length, `side`/`w` as a vehicle's): the traffic goes
  // round it as round a parked car, but for whoever lets(v) lets by (the traffic police's own: pulling in beside their
  // cones, and out again). Returns its removal.
  function obstacle(L, s, half, side, w, lets = null) {
    const o = { s, half, side, w, mode: 'parked', lets };
    L.parked.push(o);
    return () => { const i = L.parked.indexOf(o); if (i >= 0) L.parked.splice(i, 1); };
  }
  const before = G.children.length, crowd = folk(G, 44, { low }), guests = folk(G, 20, { low });   // (the wedding's own: drawn only on its days)
  const park = buildPark(G, { crowd, plazas, trees, stall: food.stall, low });
  const wedding = buildWedding(G, { crowd: guests, low, HALF, INS, C, blocks, parks, faces, shops, slots, laneAt, closeWalk, obstacle, callRider, depart, scooterParts, limb });
  /* the street trades round the parks (street-corner.js, street-repair.js, street-morning.js), placed clear of what is
     there already; their own figures, which cast no shadows (the shadow pass is the street's cost) */
  const trades = folk(G, 18, { low, shadows: false }), finder = spotFinder({ C, parks, plazas, trees, laneAt, HALF });
  if (food.cart) finder.taken.push([food.cart.x, food.cart.z, 2.4], [food.stall.x, food.stall.z, 2.8]);
  if (park.chessAt) finder.taken.push([...park.chessAt, 2.0]);
  finder.taken.push([STOP.x + HALF + 0.42, STOP.s, 2.6]);   // (the bus stop)
  // the pickleball court by a park (street-pickle.js; city.js chose where): kept clear like the rest
  // (?debug&without=pickle,photo,ev: built without them, to measure what they cost)
  const WITHOUT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug') ? (new URLSearchParams(location.search).get('without') || '').split(',') : [];
  const pickle = buildPickle(G, { site: WITHOUT.includes('pickle') ? null : court, folk, low, closeWalk, INS });
  if (court) { const along = court.axis === 'x', len = along ? court.x1 - court.x0 : court.z1 - court.z0, wid = along ? court.z1 - court.z0 : court.x1 - court.x0, n = Math.ceil(len / wid);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; finder.taken.push(along ? [court.x0 + u * len, (court.z0 + court.z1) / 2, Math.hypot(wid / 2, len / n / 2) + 0.3] : [(court.x0 + court.x1) / 2, court.z0 + u * len, Math.hypot(wid / 2, len / n / 2) + 0.3]); } }
  const corner = buildCorner(G, { crowd: trades, finder, trees, scooterParts, C });
  const repair = buildRepair(G, { crowd: trades, finder, trees, C, scooterParts });
  const morning = buildMorning(G, { crowd: trades, finder, far: food.cart ? [[food.cart.x, food.cart.z, 13]] : [], callRider });
  const lunar = buildLunar(G, { crowd: trades, faces, C, avoid: wedding.sites.map(([x, z]) => [x, z, 4.5]), GY });   // (rằm, mùng một)
  const trade = [corner, repair, morning, lunar];
  // the quán nhậu on a park's edge across the street (street-nhau.js): open in the evening, the office's people some nights
  const nhau = buildNhau(G, { finder, folk, low, depart, far: wedding.sites.map(([x, z]) => [x, z, 4.5]) });
  // the quán cơm bình dân for lunch (eat-com.js) and the bank's ATM booth with its payday line (street-atm.js): their figures in one set
  const eats = folk(G, 18, { low, shadows: false }), clear = wedding.sites.map(([x, z]) => [x, z, 4.5]);
  const com = buildCom(G, { finder, crowd: eats, low, far: clear }), atm = buildAtm(G, { finder, crowd: eats, far: clear });
  // the Korean-style photo studio, where a release takes four of the office for a strip (street-photo.js)
  const photo = buildPhoto(G, { finder: WITHOUT.includes('photo') ? { find: () => null } : finder, folk, low, far: clear });
  // the e-scooters in the office's row and the battery-swap cabinet on a corner (street-ev.js)
  if (!WITHOUT.includes('ev')) ev = buildEv(G, { finder, low, riderParts, place: (L, s, side, m) => { const [x, z] = spotOf(L, s, side); q.setFromAxisAngle(UP, yawOf(L)); P.set(x, GY + (side > HALF + 0.15 ? 0.12 : 0), z); return m.compose(P, q, S1); } });
  trade.push(com, atm, pickle, photo, ...(ev ? [ev] : []));
  // a few big street trees by the kerb near the office, where their shade falls just before a stop line (street-shade.js)
  const streetTrees = plantStreetTrees(G, { lanes, spotOf, inSB, HALF, XS, ZS, C, GY, avoid: [...finder.taken, ...wedding.sites.map(([x, z]) => [x, z, 4.0])] });
  // the countdowns beside the lights, and the shade scooters wait in on a hot day
  const signals = buildSignals(G, { poles, phaseOf, lightOf, GY });
  shade = buildShade({ lanes, spotOf, inSB, solids, trees: [...trees, ...streetTrees], office: [[TER.x0, TER.x1, TER.z0, TER.z1, GY + 3.4]], C, GY });
  // the power lines: one merged mesh, clear of all the above and of where a wedding's tent may go
  buildWires(G, { XS, ZS, HALF, SB, C, avoid: [...finder.taken, ...wedding.sites.map(([x, z]) => [x, z, 3.8]), ...streetTrees.map(([x, z]) => [x, z, 1.2]), ...lunar.spots] });
  const siren = buildSirens(G, { call: sirenCall, list: () => sirens, vehicle: (kind) => byKind[kind][0] });
  // the traffic police: a patrol now and then, a checkpoint on the office's pavement some mornings and evenings
  const csgt = buildCsgt(G, { laneAt, spotOf, SB, HALF, C, slots, pullOver, callRider, depart, lookOf, lightAt, riderParts, obstacle, inShop, eveningAt: nhau.lane ? { L: nhau.lane, s: nhau.s } : null,
    avoid: [...finder.taken, ...wedding.sites.map(([x, z]) => [x, z, 4.5]), ...streetTrees.map(([x, z]) => [x, z, 1.4])] });
  nhau.police(csgt.expect);   // (a regular riding home after a few passes the evening's alcohol checkpoint)
  for (const o of G.children.slice(before)) o.userData.setPiece = true;   // (for ?debug: what they cost)

  // what you can walk up to in first person (first-person.js): the cart and the stall, while they are open
  const spots = () => [...(food.cart ? [food.cart.g.visible && { kind: 'banhmi', x: food.cart.x, z: food.cart.z }, food.stall.g.visible && { kind: 'tea', x: food.stall.x, z: food.stall.z }].filter(Boolean) : []), ...csgt.spots(), ...nhau.spots(), ...com.spots(), ...atm.spots(), ...pickle.spots(), ...photo.spots(), ...(ev?.spots() || [])];
  // walking in on the street: the ground under you (the pavement is a step up from the road) and what is in the way (the
  // buildings, the office's raised terrace, the edge of the city)
  const pads = blocks.map((b) => [b.x0, b.x1, b.z0, b.z1]), TERR = [TER.x0, TER.x1, TER.z0, TER.z1];
  const inRect = (x, z, [x0, x1, z0, z1], r = 0) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;
  const groundAt = (x, z) => (pads.some((p) => inRect(x, z, p)) ? GY + 0.12 : GY);
  // (in a shop, or at its front: the shop says, shops.js)
  const blockedAt = (x, z, r = 0.25) => inShop(x, z, r) ?? (!near(x, z, 66) || inRect(x, z, TERR, r) || solids.some((sd) => inRect(x, z, sd, r)) || park.blocked(x, z, r) || wedding.blocked(x, z, r) || trade.some((p) => p.blocked?.(x, z, r)));

  if (statics.length) mergedTo(G, statics, vmat({ roughness: 0.6, metalness: 0.2 }));
  return {
    marks,   // zebras and stop lines, merged with the city's other road paint
    update(dt, t) {
      now = t; updateLights(t); census(t); updateParking(t); updateTraffic(dt, t); drawVehicles(t); if (PN) updatePeople(dt, t); updateFood(t); park.update(dt, t, hour); wedding.update(dt, t, hour); for (const p of trade) p.update(dt, t, hour); siren.update(dt, t); nhau.update(dt, t, hour); csgt.update(dt, t, hour); signals.update(t); crowd.flush(); guests.flush(); trades.flush(); },
    night(on) { headPts.visible = tailPts.visible = beams.visible = on; nightOn = on; foodAt = -1; park.night(on); wedding.night(on); siren.night(on); csgt.night(on); nhau.night(on); pickle.night(on); photo.night(on); },
    // for outings.js and walking in (first-person.js); slots: for ?debug
    street: { route, exits, callRider, depart, parkBike, unparkBike, at: (L, s, side) => { const [x, z] = spotOf(L, s, side); return { x, z }; },
      pavement: GY + 0.12, road: GY, pavementSide: HALF + INS, spots, groundAt, blockedAt, setWalker: (p) => { walker = p; }, slots, wedding: wedding.debug, park: park.debug, trades: () => ({ corner: corner.debug(), repair: repair.debug(), morning: morning.debug(), lunar: lunar.debug(), shade: shadeOn, shadeStops: lanes.flatMap((L) => Object.entries(L.shade || {}).map(([idx, sh]) => { const [x, z] = spotOf(L, sh, 1.3), [lx, lz] = spotOf(L, L.cross[idx] - L.dir * 5.2, 1.3); return { at: [+x.toFixed(1), +z.toFixed(1)], line: [+lx.toFixed(1), +lz.toFixed(1)], waiting: L.list.filter((v) => v.name === 'moto' && v.v < 0.3 && Math.abs(v.s - sh) < 3).length }; })) }),
      carrying: () => vehicles.filter((v) => v.on && v.extra).map((v) => { const [x, z] = spotOf(v.L, v.s, v.side); return { what: Object.keys(v.extra), at: [+x.toFixed(1), +z.toFixed(1)], v: +v.v.toFixed(1) }; }),
      csgt: csgt.debug, nhau: nhau.office, nhauDebug: nhau.debug, com: com.office, comDebug: com.debug, atm: atm.office, atmDebug: atm.debug, pickle: pickle.office, pickleDebug: pickle.debug, photo: photo.office, photoDebug: photo.debug, ev: ev?.office || null, evDebug: ev?.debug || null,
      siren: (kind) => { const v = siren.call(kind); return v ? { kind: v.name, lane: `${v.L.axis}${v.L.v}${v.L.dir > 0 ? '+' : '-'}`, s: +v.s.toFixed(1) } : null; }, sirens: () => sirens.map((v) => ({ kind: v.name, s: +v.s.toFixed(1), v: +v.v.toFixed(1), side: +v.side.toFixed(2), at: [+v.px?.toFixed(1), +v.pz?.toFixed(1)] })) },
  };
}

let DOT, BEAM;
function textures() {
  if (DOT) return;
  DOT = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  BEAM = canvasTex(64, 128, (g) => { const r = g.createLinearGradient(0, 128, 0, 0); r.addColorStop(0, 'rgba(255,240,200,.5)'); r.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(24, 128); g.lineTo(40, 128); g.lineTo(64, 0); g.lineTo(0, 0); g.closePath(); g.fill(); });
}
