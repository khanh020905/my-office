/* What some of the scooters' riders wear and carry, as anyone who has stood at a Vietnamese crossing has seen:
   - "ninja" sun suits: on sunny days a share of riders, mostly women, ride in a full floral suit in a pastel print: a
     hood under the helmet over the face, dark sunglasses, long sleeves, gloves, and a wrap skirt down over the legs.
     More of them the hotter and sunnier it is (life/weather.js, if a city is picked; else a few on any fine day); none
     at night or in the rain.
   - bulky loads, a handful at a time, by day: a fridge strapped upright behind the rider, a long aluminium ladder across
     the rear rack, a red gas cylinder at the rider's feet, a small tree in a pot, a bamboo chicken cage strapped across
     the rack, a stack of white styrofoam boxes taller than the rider.
   Each is one instanced mesh with a few slots, in the scooter's own frame (nose along +x), drawn with its matrix; who
   wears or carries what is settled once, as a scooter sets out (ride()). Nothing casts a shadow. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { wx } from '../../life/weather.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const HOT = Q.has('hot'), ALL = Q.has('loads');   // (?hot: a hot sunny day; ?loads: every free load out, to look at them)
const PASTEL = ['#F6C9D4', '#CFE3F5', '#F4E3B5', '#D7EFD2', '#E6D5F2', '#F9D9C4', '#FFFFFF', '#CDEBEA'];
const W = (g) => colorize(g, '#FFFFFF');
const Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UPY = new THREE.Vector3(0, 1, 0);
function limb(a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 8).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPY, d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return color ? colorize(g, color) : W(g);
}
const ball = (r, x, y, z, color) => { const g = new THREE.SphereGeometry(r, 10, 8).translate(x, y, z); return color ? colorize(g, color) : W(g); };

// the suit, over the driver of street-life.js's riderParts (same joints): tinted per rider, a small floral print on it
function suit() {
  const p = [W(new THREE.BoxGeometry(0.34, 0.55, 0.46).rotateZ(-0.1).translate(-0.14, 1.2, 0)), W(new THREE.SphereGeometry(0.135, 12, 10).translate(-0.1, 1.575, 0)), W(limb(V3(-0.12, 1.44, 0), V3(-0.11, 1.52, 0), 0.075))];
  for (const s of [-1, 1]) {
    const sh = V3(-0.1, 1.38, s * 0.2), el = V3(0.16, 1.22, s * 0.26), hd = V3(0.47, 1.12, s * 0.27);
    p.push(W(limb(sh, el, 0.07)), W(limb(el, hd, 0.063)), ball(0.055, hd.x, hd.y, hd.z));
  }
  // the wrap skirt: over the thighs and down the front of the shins to the feet
  p.push(W(new THREE.BoxGeometry(0.4, 0.07, 0.44).rotateZ(-0.05).translate(0.04, 1.05, 0)), W(new THREE.BoxGeometry(0.07, 0.6, 0.44).translate(0.25, 0.72, 0)));
  // dark sunglasses across the hood
  p.push(boxAt(0.035, 0.05, 0.22, 0.03, 1.6, 0, '#15171A'));
  return mergeAll(p);
}
const floral = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 26; k++) {
    const x = (k * 37) % 128, y = (k * 53 + (k % 3) * 11) % 128, c = ['#E8708A', '#6FA8DC', '#F2B544', '#9AC47A', '#B58ADB'][k % 5];
    g.fillStyle = c; for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(x + Math.cos(a * 1.26) * 4, y + Math.sin(a * 1.26) * 4, 3.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#FFF3B0'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7FB069'; g.beginPath(); g.ellipse(x + 7, y + 6, 4, 2, 0.7, 0, Math.PI * 2); g.fill();
  }
});

/* the loads, in the scooter's frame (the seat runs from about x -0.75 to 0.05, its top at 0.9; the floorboard at 0.36) */
const LOADS = {
  fridge() {   // upright on the back of the seat, two straps round it
    return [boxAt(0.6, 1.25, 0.62, -0.78, 1.52, 0, '#E9EDF0'), boxAt(0.02, 1.1, 0.04, -0.47, 1.55, 0.2, '#B9C0C8'), boxAt(0.62, 0.04, 0.64, -0.78, 1.25, 0, '#2B2F36'), boxAt(0.62, 0.04, 0.64, -0.78, 1.78, 0, '#2B2F36'), boxAt(0.58, 0.03, 0.6, -0.78, 2.15, 0, '#C9CED6')];
  },
  ladder() {   // across the rear rack, sticking out both sides
    const g = [];
    for (const x of [-0.82, -0.5]) g.push(boxAt(0.05, 0.05, 2.4, x, 1.0, 0, '#C9CED6'));
    for (let z = -1.1; z <= 1.11; z += 0.3) g.push(boxAt(0.32, 0.03, 0.04, -0.66, 1.0, z, '#AEB4BC'));
    return g;
  },
  gas() {   // the red cylinder between the rider's feet
    return [colorize(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 14).translate(0.13, 0.62, 0), '#C8102E'), colorize(new THREE.CylinderGeometry(0.09, 0.15, 0.08, 14).translate(0.13, 0.91, 0), '#C8102E'),
      colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10).translate(0.13, 0.99, 0), '#5E6670'), colorize(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 14).translate(0.13, 0.4, 0), '#8E0B1E')];
  },
  plant() {   // a small tree in a pot, held on the back seat
    const g = [colorize(new THREE.CylinderGeometry(0.24, 0.17, 0.32, 12).translate(-0.62, 1.06, 0), '#B5643C'), colorize(new THREE.CylinderGeometry(0.03, 0.045, 0.7, 6).translate(-0.62, 1.55, 0), '#6B4A33'),
      colorize(new THREE.IcosahedronGeometry(0.42, 1).translate(-0.62, 2.0, 0), '#4E8B3A'), colorize(new THREE.IcosahedronGeometry(0.3, 1).translate(-0.5, 2.3, 0.1), '#5E9B48')];
    for (let k = 0; k < 9; k++) g.push(ball(0.035, -0.62 + Math.cos(k * 2.1) * 0.38, 1.95 + Math.sin(k * 1.3) * 0.3, Math.sin(k * 2.1) * 0.38, '#F28C28'));
    return g;
  },
  cage() {   // a bamboo cage strapped across the rack, hens inside
    const g = [boxAt(0.6, 0.04, 1.1, -0.78, 0.92, 0, '#C9A86A'), boxAt(0.6, 0.04, 1.1, -0.78, 1.36, 0, '#C9A86A')];
    for (let z = -0.53; z <= 0.54; z += 0.09) for (const x of [-1.06, -0.5]) g.push(boxAt(0.02, 0.44, 0.02, x, 1.14, z, '#B08D52'));
    for (let x = -1.0; x <= -0.55; x += 0.09) for (const z of [-0.54, 0.54]) g.push(boxAt(0.02, 0.44, 0.02, x, 1.14, z, '#B08D52'));
    [[-0.85, -0.3, '#F2F2F2'], [-0.7, 0.05, '#B5703C'], [-0.85, 0.32, '#E8D9C4']].forEach(([x, z, c]) => g.push(colorize(new THREE.SphereGeometry(0.12, 8, 6).scale(1.2, 0.9, 0.9).translate(x, 1.06, z), c), ball(0.03, x + 0.13, 1.16, z, '#D62F2F')));
    g.push(boxAt(0.64, 0.03, 0.04, -0.78, 1.15, 0.58, '#2B2F36'), boxAt(0.64, 0.03, 0.04, -0.78, 1.15, -0.58, '#2B2F36'));
    return g;
  },
  foam() {   // white styrofoam boxes, seven high, a strap up the front
    const g = [];
    for (let k = 0; k < 7; k++) g.push(boxAt(0.5, 0.31, 0.62, -0.82 + (k % 2 ? 0.02 : -0.02), 1.08 + k * 0.32, (k % 3 - 1) * 0.015, '#F4F6F6'), boxAt(0.51, 0.012, 0.63, -0.82, 0.93 + k * 0.32, 0, '#D6DADC'));
    g.push(boxAt(0.02, 2.25, 0.06, -0.56, 2.0, 0.12, '#2E6FD1'), boxAt(0.02, 2.25, 0.06, -0.56, 2.0, -0.12, '#2E6FD1'));
    return g;
  },
};

/** rider: the scooters' jackets mesh (to paint a sun-suited rider's helmet); low quality */
export function buildRiderExtras(G, { rider, low = false }) {
  const SLOTS = low ? 6 : 14, CAP = low ? 1 : 2;
  const mk = (geo, mat, n) => { const o = new THREE.InstancedMesh(geo, mat, n); o.frustumCulled = false; o.castShadow = false; o.count = 0; o.userData.part = 'riders'; for (let i = 0; i < n; i++) o.setMatrixAt(i, Z0); G.add(o); return o; };
  const suits = mk(suit(), new THREE.MeshStandardMaterial({ map: floral(), vertexColors: true, roughness: 0.85 }), SLOTS);
  const loads = Object.fromEntries(Object.entries(LOADS).map(([k, f]) => [k, mk(mergeAll(f()), vmat({ roughness: 0.6 }), CAP)]));
  const free = { suit: [...Array(SLOTS).keys()], ...Object.fromEntries(Object.keys(LOADS).map((k) => [k, [...Array(CAP).keys()]])) };
  const jackets = new Map(), col = new THREE.Color();
  let share = 0, carry = 0, checkAt = -1;
  // how many in sun suits: the hotter and sunnier the more; a few on any fine day if no city is picked
  function shares(h) {
    const day = h >= 7 && h < 17.5, rain = wx.rain > 0.05;
    if (!day || rain) share = 0;
    else if (HOT) share = 0.45;
    else if (wx.code == null) share = 0.07;
    else { const sun = wx.code <= 2 ? 1 - wx.cloud * 0.6 : 0.25; share = Math.max(0, Math.min(0.5, (wx.temp - 24) / 22)) * sun; }
    carry = ALL ? 1 : h >= 6 && h < 20 ? 0.35 : 0;   // (of the riders on their own: a handful on the streets at a time)
  }
  const take = (k) => free[k].shift();
  function drop(v) {
    if (!v.extra) return;
    for (const [k, i] of Object.entries(v.extra)) { free[k].push(i); (k === 'suit' ? suits : loads[k]).setMatrixAt(i, Z0); }
    if (v.extra.suit != null) { const j = jackets.get(v); if (j) { rider.setColorAt(v.k, j); rider.instanceColor.needsUpdate = true; } }
    v.extra = null; dirty = true;
  }
  let dirty = false;
  return {
    // a scooter setting out (street-life.js join): what it wears and carries this time
    ride(v, h) {
      drop(v);
      if (v.livery !== 'plain') return;
      if (h !== checkAt) { checkAt = h; shares(h); }
      const extra = {};
      if (Math.random() < share && free.suit.length) {
        extra.suit = take('suit');
        suits.setColorAt(extra.suit, col.set(PASTEL[Math.floor(Math.random() * PASTEL.length)])); suits.instanceColor.needsUpdate = true;
        if (!jackets.has(v)) { const c = new THREE.Color(); rider.getColorAt(v.k, c); jackets.set(v, c); }
        rider.setColorAt(v.k, col.set(['#F2F2F2', '#F6C9D4', '#CFE3F5', '#2B2F36'][Math.floor(Math.random() * 4)])); rider.instanceColor.needsUpdate = true;   // (the helmet over the hood)
        v.mask = true;
      }
      if (!v.pax && Math.random() < carry) {
        const kinds = Object.keys(LOADS).filter((k) => free[k].length);
        if (kinds.length) { const k = kinds[Math.floor(Math.random() * kinds.length)]; extra[k] = take(k); }
      }
      if (Object.keys(extra).length) v.extra = extra;
    },
    drop,
    // each frame, for each scooter that has something: where it is now (m: its matrix); a rider for the office has none
    draw(v, m) {
      if (v.special) { drop(v); return; }
      for (const [k, i] of Object.entries(v.extra)) (k === 'suit' ? suits : loads[k]).setMatrixAt(i, m);
      dirty = true;
    },
    flush() {
      if (!dirty) return; dirty = false;
      for (const o of [suits, ...Object.values(loads)]) { o.count = o.instanceMatrix.count; o.instanceMatrix.needsUpdate = true; }
    },
    refresh(h) { shares(h); checkAt = h; },
  };
}
