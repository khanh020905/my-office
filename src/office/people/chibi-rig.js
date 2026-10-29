// Office characters, two looks on one rig:
//   toy   (A) designer-toy chibi, ~2 heads: big round head, low wide-set bean eyes, stubby legs, chunky sneakers, matte vinyl.
//   pixar (B) stylised chibi, ~2.6 heads: cheek/chin volume, layered eyes with a lash line, thick brows, sculpted hair, fabric sheen.
// Rig: root -> legs (hip -> knee -> shoe) and spine (pivots at the hips, leans) -> torso, arms (shoulder -> elbow -> hand), head.
// Arms reach targets with two-bone IK, so typing, sipping and thinking land on the desk, mouth and chin for either look.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t as tr } from '../../i18n/index.js';

// The two looks' names, translated when read (LOOKS.toy, LOOKS.pixar).
export const LOOKS = Object.defineProperties({}, {
  toy: { enumerable: true, get: () => tr('people.looks.toy') },
  pixar: { enumerable: true, get: () => tr('people.looks.pixar') },
});
const DIMS = {
  toy: { hipY: 0.44, hipX: 0.112, thigh: 0.17, shin: 0.17, legR: 0.105, shoeR: 0.13,
    torso: [[0, -0.06], [0.23, -0.06], [0.25, 0.02], [0.256, 0.16], [0.242, 0.29], [0.205, 0.38], [0.13, 0.45], [0, 0.46]],
    shX: 0.215, shY: 0.37, upper: 0.17, fore: 0.15, armR: 0.068, handR: 0.068, neck: 0.03, R: 0.44, sx: 1.06, sy: 0.96, sz: 1.0 },
  pixar: { hipY: 0.58, hipX: 0.108, thigh: 0.24, shin: 0.24, legR: 0.1, shoeR: 0.12,
    torso: [[0, -0.06], [0.205, -0.06], [0.222, 0.04], [0.205, 0.17], [0.214, 0.3], [0.238, 0.42], [0.236, 0.49], [0.19, 0.55], [0.1, 0.585], [0, 0.59]],
    shX: 0.236, shY: 0.49, upper: 0.2, fore: 0.18, armR: 0.064, handR: 0.062, neck: 0.075, R: 0.33, sx: 1.0, sy: 1.02, sz: 0.98 },
};
for (const D of Object.values(DIMS)) {
  const top = D.torso[D.torso.length - 1][1];
  D.headY = top + D.neck + D.R * 0.86;           // head centre, spine-local
  D.sitY = 0.49 + D.legR - D.hipY;               // chair seat top is at 0.49
}
const SKINS = ['#F7CBAA', '#F2BE98', '#E6AC82', '#F9D6BE', '#D49870'];
const IRIS = ['#5B3A24', '#3F6E9C', '#4D7A49', '#7A5230', '#3A2E28'];

let shadowTex = null;
function getShadowTex() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  r.addColorStop(0, 'rgba(0,0,0,.42)'); r.addColorStop(0.6, 'rgba(0,0,0,.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c); shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}
const lighten = (c, k) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k);
const darken = (c, k) => new THREE.Color(c).multiplyScalar(k);
const plainMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
// a wisp of steam over a hot mì ly (one, shared)
let steam = null;
function steamTex() {
  if (steam) return steam;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return (steam = new THREE.CanvasTexture(c));
}

// Hair shell: a sphere whose latitude range is squeezed so its rim follows a hairline ([front, side, back] angles from
// the crown). The rim dips into rounded locks, each lock bulges so grooves catch the light, the grooves twist away from
// the crown like a cowlick, and the rim tucks in so the tips rest on the skin.
function hairShell(R, line, o = {}) {
  const { locks = 9, tip = 0.15, bulge = 0.03, phase = 0, sweep = 0, tuck = 0.08, round = 1, bumps = 0, twist = 0.4 } = o;
  const NI = 160, NJ = 40, pos = [], idx = [];
  const smooth = (x) => x * x * (3 - 2 * x);
  for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) {
    const u = j / NJ, ph = -Math.PI + (2 * Math.PI * i) / NI, a = Math.abs(ph) / Math.PI;
    let edge = a < 0.5 ? line[0] + (line[1] - line[0]) * smooth(a / 0.5) : line[1] + (line[2] - line[1]) * smooth((a - 0.5) / 0.5);
    edge += sweep * Math.sin(ph) * Math.max(0, 1 - a * 2);
    const f = (((ph + twist * u) / (2 * Math.PI)) * locks + phase) % 1, lock = 1 - Math.abs(2 * ((f + 1) % 1) - 1);
    const th = u * (edge + tip * (Math.pow(lock, round) - 0.5));
    let r = R * (1 + bulge * Math.sin(Math.PI * lock) * Math.min(1, u * 2.2)) * (1 - tuck * smooth(Math.max(0, (u - 0.72) / 0.28)));
    if (bumps) r *= 1 + bumps * Math.sin(ph * 9 + u * 11) * Math.sin(u * 17 + ph * 3) * Math.min(1, u * 4);
    pos.push(r * Math.sin(th) * Math.sin(ph), r * Math.cos(th), r * Math.sin(th) * Math.cos(ph));
  }
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const k = j * (NI + 1) + i, n = k + NI + 1; idx.push(k, n, k + 1, n, n + 1, k + 1); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g = mergeVertices(g); g.computeVertexNormals();
  return g;
}
// A tube swept along a curve with a varying radius (radius(1) = 0 gives a pointed tip).
function sweep(points, radius, segs = 24, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)));
  const fr = curve.computeFrenetFrames(segs, false), pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), r = radius(t), N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) { const a = (j / radial) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r; pos.push(c.x + ca * N.x + sa * B.x, c.y + ca * N.y + sa * B.y, c.z + ca * N.z + sa * B.z); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const k = i * (radial + 1) + j, n = k + radial + 1; idx.push(k, n, k + 1, n, n + 1, k + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Hairline per style: [front, side, back] angles from the crown (pixar look; the toy look drops the fringe lower).
const HAIR = {
  bob: { line: [1.12, 1.98, 2.15], locks: 10 },
  plain: { line: [1.1, 1.6, 1.95], locks: 9, sweep: 0.16, phase: 0.3 },
  spiky: { line: [1.02, 1.5, 1.85], locks: 9, tip: 0.2, round: 2 },
  ponytail: { line: [1.12, 1.72, 1.82], locks: 10, sweep: -0.12 },
  bun: { line: [1.1, 1.6, 1.8], locks: 10 },
  curly: { line: [1.15, 1.85, 2.05], locks: 15, round: 0.5, bulge: 0.06, bumps: 0.045, tip: 0.1, twist: 0 },
};

export function makeChibi(cfg = {}, scale = 1) {
  const look = DIMS[cfg.look] ? cfg.look : 'pixar', D = DIMS[look], toy = look === 'toy', R = D.R;
  const root = new THREE.Group(); root.scale.setScalar(scale);
  const seed = [...String(cfg.name || cfg.shirt || 'x')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const skinC = cfg.skin || SKINS[seed % SKINS.length], shirtC = cfg.shirt || '#5F8FD8', hairC = cfg.hair || '#3B2618';
  const skin = new THREE.MeshPhysicalMaterial(toy
    ? { color: skinC, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.6, sheen: 0.25, sheenColor: new THREE.Color('#FFB496') }
    : { color: skinC, roughness: 0.5, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color('#FF9E80') });
  const fabric = (c, k = 1) => new THREE.MeshPhysicalMaterial({ color: darken(c, k), roughness: toy ? 0.7 : 0.85, sheen: toy ? 0.3 : 0.7, sheenRoughness: 0.8, sheenColor: lighten(c, 0.55) });
  const top = fabric(shirtC), topDark = fabric(shirtC, 0.74), pants = fabric(cfg.pants || '#3A4150');
  const hair = new THREE.MeshPhysicalMaterial({ color: hairC, side: THREE.DoubleSide, roughness: toy ? 0.5 : 0.42, clearcoat: toy ? 0.15 : 0.3, clearcoatRoughness: 0.45, sheen: 0.6, sheenRoughness: 0.3, sheenColor: lighten(hairC, 0.4) });
  const shoeM = plainMat(cfg.shoes || '#2D2A2E', { roughness: 0.45 }), soleM = plainMat('#F4F1EA', { roughness: 0.7 });
  const white = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const P = { D, look, blink: [] };
  const add = (parent, geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, Math.max(0.001, l), 6, 14);
  const sph = (r, w = 22, h = 16) => new THREE.SphereGeometry(r, w, h);

  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: getShadowTex(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = -1; root.add(sh); P.shadow = sh;

  /* legs: hip -> knee -> sneaker */
  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * D.hipX, D.hipY, 0); root.add(hip);
    add(hip, cap(D.legR, D.thigh - D.legR), pants, 0, -D.thigh / 2, 0);
    const knee = new THREE.Group(); knee.position.y = -D.thigh; hip.add(knee);
    add(knee, sph(D.legR * 0.96), pants);
    add(knee, new THREE.CylinderGeometry(D.legR * 0.95, D.legR * 0.98, D.shin, 18), pants, 0, -D.shin / 2, 0);
    add(knee, new THREE.CylinderGeometry(D.legR * 1.08, D.legR * 1.08, toy ? 0.05 : 0.035, 18), toy ? fabric(cfg.pants || '#3A4150', 0.85) : pants, 0, -D.shin + 0.02, 0);
    const shoe = new THREE.Group(); shoe.position.set(0, -D.shin, 0.035); knee.add(shoe);
    const s = D.shoeR;
    add(shoe, sph(s, 26, 18), shoeM, 0, 0, 0.02, 0.82, 0.58, 1.32);
    add(shoe, new THREE.CylinderGeometry(s, s, 0.045, 30), soleM, 0, -s * 0.58 - 0.008, 0.02, 0.86, 1, 1.36);
    add(shoe, new RoundedBoxGeometry(s * 0.7, 0.02, s * 0.75, 2, 0.008), soleM, 0, s * 0.42, s * 0.38).rotation.x = -0.35;
    return { hip, knee };
  };
  P.legL = leg(-1); P.legR = leg(1);
  add(root, sph(D.torso[1][0] * 0.98, 24, 16), pants, 0, D.hipY, 0, 1, 0.62, 0.8);

  /* spine: everything above the hips leans together */
  const spine = new THREE.Group(); spine.position.y = D.hipY; root.add(spine); P.spine = spine;
  const prof = D.torso.map(([x, y]) => new THREE.Vector2(x, y));
  const torso = add(spine, new THREE.LatheGeometry(prof, 36), top, 0, 0, 0, 1, 1, 0.82); P.torso = torso;
  const H = D.torso[D.torso.length - 1][1], tr = D.torso[2][0];
  const outfit = cfg.outfit || (seed % 2 ? 'hoodie' : 'shirt');
  if (outfit === 'hoodie') {
    add(torso, new THREE.TorusGeometry(tr * 0.93, 0.026, 8, 36), topDark, 0, -0.03, 0).rotation.x = Math.PI / 2;
    add(torso, new RoundedBoxGeometry(tr * 1.0, H * 0.2, 0.05, 2, 0.02), topDark, 0, H * 0.24, tr * 0.86);
    add(torso, new THREE.TorusGeometry(H * 0.21, 0.055, 10, 28), topDark, 0, H * 0.93, -0.02).rotation.x = Math.PI / 2 - 0.25;
    for (const sx of [-1, 1]) add(torso, new THREE.CylinderGeometry(0.009, 0.009, H * 0.24, 6), soleM, sx * 0.045, H * 0.74, tr * 0.88).rotation.x = 0.25;
  } else if (outfit === 'suit') {   // a jacket over a white shirt and a tie (the director)
    const shirtW = plainMat('#F4F1EA', { roughness: 0.8 }), tieM = plainMat(cfg.tie || '#B5323A', { roughness: 0.45 });
    const v = new THREE.Shape(); v.moveTo(-tr * 0.36, 0); v.lineTo(tr * 0.36, 0); v.lineTo(0, -H * 0.46); v.closePath();
    add(torso, new THREE.ShapeGeometry(v), shirtW, 0, H * 0.98, tr * 0.9).rotation.x = -0.12;
    add(torso, new THREE.TorusGeometry(H * 0.18, 0.026, 10, 28), shirtW, 0, H * 0.95, 0.01, 1, 1, 0.9).rotation.x = Math.PI / 2 - 0.15;
    add(torso, new RoundedBoxGeometry(0.05, H * 0.36, 0.014, 2, 0.006), tieM, 0, H * 0.7, tr * 0.93).rotation.x = -0.1;
    add(torso, sph(0.026, 10, 8), tieM, 0, H * 0.9, tr * 0.9, 1.2, 0.9, 0.7);
    for (const sx of [-1, 1]) { const l = add(torso, new RoundedBoxGeometry(0.05, H * 0.46, 0.016, 2, 0.006), topDark, sx * tr * 0.2, H * 0.74, tr * 0.92); l.rotation.set(-0.1, 0, sx * 0.42); }
    for (let i = 0; i < 2; i++) add(torso, sph(0.014, 8, 6), topDark, 0, H * (0.4 - i * 0.13), tr * 0.95);
    add(torso, new THREE.TorusGeometry(tr * 0.93, 0.016, 8, 36), topDark, 0, -0.03, 0).rotation.x = Math.PI / 2;
  } else {
    const collarM = plainMat('#F4F1EA', { roughness: 0.8 });
    add(torso, new THREE.TorusGeometry(H * 0.18, 0.028, 10, 28), collarM, 0, H * 0.95, 0.01, 1, 1, 0.9).rotation.x = Math.PI / 2 - 0.15;
    for (const sx of [-1, 1]) { const c = add(torso, new RoundedBoxGeometry(0.1, 0.07, 0.02, 2, 0.008), collarM, sx * 0.05, H * 0.88, H * 0.3); c.rotation.set(-0.45, sx * -0.35, sx * 0.55); }
    add(torso, new RoundedBoxGeometry(0.045, H * 0.4, 0.012, 2, 0.005), topDark, 0, H * 0.62, tr * 0.88).rotation.x = -0.1;
    for (let i = 0; i < 3; i++) add(torso, sph(0.011, 8, 6), collarM, 0, H * (0.78 - i * 0.12), tr * 0.9);
    add(torso, new THREE.TorusGeometry(tr * 0.93, 0.016, 8, 36), topDark, 0, -0.03, 0).rotation.x = Math.PI / 2;
  }
  add(spine, new THREE.CylinderGeometry(R * (toy ? 0.22 : 0.16), R * (toy ? 0.24 : 0.18), D.neck + 0.08, 14), skin, 0, H + D.neck / 2 - 0.02, 0);

  /* arms: shoulder -> elbow -> mitten hand with a thumb */
  const arm = (sx) => {
    const s = new THREE.Group(); s.position.set(sx * D.shX, D.shY, 0); spine.add(s);
    add(s, sph(D.armR * 1.08), top);
    add(s, cap(D.armR, D.upper - D.armR), top, 0, -D.upper / 2, 0);
    const el = new THREE.Group(); el.position.y = -D.upper; s.add(el);
    add(el, sph(D.armR * 0.96), top);
    add(el, cap(D.armR * 0.93, D.fore - D.armR * 1.4), top, 0, -D.fore / 2 + 0.01, 0);
    add(el, new THREE.CylinderGeometry(D.armR * 1.06, D.armR * 1.06, 0.045, 16), topDark, 0, -D.fore + 0.025, 0);
    const hand = new THREE.Group(); hand.position.y = -D.fore - D.handR * 0.55; el.add(hand);
    add(hand, sph(D.handR), skin, 0, 0, 0, 0.9, 1.05, 0.78);
    add(hand, cap(D.handR * 0.3, D.handR * 0.5), skin, -sx * D.handR * 0.72, D.handR * 0.2, D.handR * 0.35).rotation.z = sx * 0.5;
    return { sh: s, el, hand };
  };
  P.armL = arm(-1); P.armR = arm(1);

  /* head */
  const head = new THREE.Group(); head.position.y = D.headY; spine.add(head); P.head = head;
  // Sculpted skull: cheeks fill out below the eyes and the front of the lower face pushes forward; the pixar look
  // also tapers into a soft chin. surf() returns the face depth at (x, y) on that same shape.
  const cheek = toy ? 0.1 : 0.06, front = toy ? 0.07 : 0.06, chin = toy ? 0.05 : 0.2;
  const shapeX = (t) => { const lo = Math.max(0, -t); return 1 + cheek * Math.sin(Math.PI * Math.min(1, lo * 1.4)) - chin * lo ** 3; };
  const shapeZ = (t) => 1 + front * Math.sin(Math.PI * Math.max(0, -t));
  const skull = new THREE.SphereGeometry(R, 56, 40), sp = skull.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = sp.getY(i) / R;
    sp.setX(i, sp.getX(i) * D.sx * shapeX(t)); sp.setY(i, sp.getY(i) * D.sy);
    sp.setZ(i, sp.getZ(i) * D.sz * (sp.getZ(i) > 0 ? shapeZ(t) : 1));
  }
  skull.computeVertexNormals();
  add(head, skull, skin);
  const surf = (x, y) => { const t = y / (R * D.sy); return R * D.sz * shapeZ(t) * Math.sqrt(Math.max(0, 1 - (x / (R * D.sx * shapeX(t))) ** 2 - t ** 2)); };
  const earM = new THREE.MeshPhysicalMaterial({ color: darken(skinC, 0.94), roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#FF9E80') });
  for (const sx of [-1, 1]) {
    const ex = sx * R * D.sx * 0.97;
    add(head, sph(R * (toy ? 0.17 : 0.2), 16, 12), skin, ex, -R * 0.1, -R * 0.02, 0.45, 1, 0.75);
    if (!toy) add(head, sph(R * 0.12, 12, 10), earM, ex + sx * R * 0.05, -R * 0.1, -R * 0.0, 0.3, 0.8, 0.55);
  }
  const lashM = plainMat('#2A1D18', { roughness: 0.5 });
  const browM = plainMat(darken(hairC, 0.8), { roughness: 0.6 });
  const iris = plainMat(cfg.iris || IRIS[seed % IRIS.length], { roughness: 0.25 });
  for (const sx of [-1, 1]) {
    if (toy) {
      const x = sx * R * 0.37, y = -R * 0.1;
      const eye = new THREE.Group(); eye.position.set(x, y, surf(x, y) - R * 0.02); eye.rotation.y = sx * 0.36; head.add(eye);
      const ball = new THREE.Group(); eye.add(ball);
      add(ball, sph(R * 0.12, 22, 16), plainMat('#2B1D18', { roughness: 0.25 }), 0, 0, 0, 0.84, 1.12, 0.42);
      add(ball, sph(R * 0.042, 10, 8), white, -R * 0.03, R * 0.05, R * 0.04, 1, 1, 0.4);
      add(ball, sph(R * 0.02, 8, 6), white, R * 0.035, -R * 0.045, R * 0.042, 1, 1, 0.4);
      P.blink.push({ ball, lash: null });
      const bx = sx * R * 0.37, by = R * 0.11;
      const brow = add(head, new THREE.TorusGeometry(R * 0.08, R * 0.017, 6, 14, Math.PI * 0.6), browM, bx, by, surf(bx, by) - R * 0.01);
      brow.rotation.set(0, sx * 0.36, Math.PI * 0.2);
    } else {
      const x = sx * R * 0.35, y = -R * 0.06, e = R * 0.21, k = e / 0.068;
      const eye = new THREE.Group(); eye.position.set(x, y, surf(x, y) + R * 0.02 - e * 0.55); eye.rotation.y = sx * 0.32; head.add(eye);
      const ball = new THREE.Group(); eye.add(ball);
      add(ball, sph(e, 26, 18), plainMat('#FBFAF7', { roughness: 0.3 }), 0, 0, 0, 1, 1.06, 0.55);
      add(ball, sph(0.052 * k, 22, 16), plainMat('#1E1612', { roughness: 0.3 }), 0, -0.004 * k, 0.021 * k, 1, 1.06, 0.3);
      add(ball, sph(0.048 * k, 22, 16), iris, 0, -0.004 * k, 0.025 * k, 1, 1.06, 0.3);
      add(ball, sph(0.03 * k, 16, 12), plainMat(lighten(iris.color, 0.35), { roughness: 0.3 }), 0, -0.026 * k, 0.031 * k, 1.2, 0.6, 0.25);
      add(ball, sph(0.025 * k, 14, 10), plainMat('#14100E', { roughness: 0.2 }), 0, -0.006 * k, 0.035 * k, 1, 1.05, 0.3);
      add(ball, sph(0.014 * k, 8, 6), white, -0.016 * k, 0.022 * k, 0.042 * k, 1, 1, 0.4);
      add(ball, sph(0.007 * k, 8, 6), white, 0.014 * k, -0.02 * k, 0.041 * k, 1, 1, 0.4);
      const lash = add(eye, new THREE.TorusGeometry(0.07 * k, 0.011 * k, 6, 28, Math.PI), lashM, 0, 0, 0.012 * k, 1, 1.06, 0.7);
      add(lash, cap(0.008 * k, 0.03 * k), lashM, sx * 0.075 * k, 0.012 * k, 0).rotation.z = sx * -1.0;
      add(eye, new THREE.TorusGeometry(0.068 * k, 0.0035 * k, 5, 20, Math.PI * 0.7), plainMat(darken(skinC, 0.86), { roughness: 0.6 }), 0, 0.022 * k, 0.014 * k, 1, 1.06, 0.7).rotation.z = Math.PI * 0.15;
      P.blink.push({ ball, lash });
      const bx = sx * R * 0.35, by = R * 0.21;
      const brow = add(head, new THREE.TorusGeometry(R * 0.17, R * 0.032, 8, 16, Math.PI * 0.6), browM, bx, by - R * 0.1, surf(bx, by) - R * 0.03);
      brow.rotation.set(0, sx * 0.32, Math.PI * 0.2);
    }
  }
  const noseY = toy ? -R * 0.25 : -R * 0.24;
  add(head, sph(R * (toy ? 0.055 : 0.08), 14, 10), plainMat(darken(skinC, 0.95), { roughness: 0.5 }), 0, noseY, surf(0, noseY) - R * 0.01, 1.1, 0.85, 0.8);
  const mY = toy ? -R * 0.38 : -R * 0.42;
  const lipM = plainMat(toy ? '#A9483F' : '#B9544B', { roughness: 0.45 });
  const smile = add(head, new THREE.TorusGeometry(R * (toy ? 0.07 : 0.09), R * (toy ? 0.017 : 0.024), 6, 18, Math.PI), lipM, 0, mY + R * 0.04, surf(0, mY) - R * 0.005);
  smile.rotation.z = Math.PI; P.mouthSmile = smile;
  const o = add(head, sph(R * 0.07, 12, 10), plainMat('#6E2B26'), 0, mY, surf(0, mY) - R * 0.01, 0.9, 1.1, 0.4); o.visible = false; P.mouthO = o;
  const blushM = new THREE.MeshBasicMaterial({ color: '#FF8E8E', transparent: true, opacity: toy ? 0.42 : 0.3, depthWrite: false });
  for (const sx of [-1, 1]) {
    const bx = sx * R * 0.52, by = -R * 0.27;
    const b = new THREE.Mesh(sph(R * 0.14, 14, 10), blushM); b.scale.set(1.5, 0.75, 0.3); b.position.set(bx, by, surf(bx, by) + R * 0.02); b.rotation.y = sx * 0.55; head.add(b);
  }

  /* hair: one sculpted shell plus tails, buns, spikes and a stray strand */
  const style = HAIR[cfg.style] ? cfg.style : 'plain', Hs = HAIR[style];
  const line = toy ? [Hs.line[0] + 0.2, Hs.line[1] + 0.06, Hs.line[2]] : Hs.line;
  const shellOpts = toy
    ? { ...Hs, line, locks: Math.round(Hs.locks * 0.75), bulge: Hs.bulge ?? 0.055, round: Hs.round ?? 0.7, tip: Hs.tip ?? 0.12, twist: Hs.twist ?? 0.55 }
    : { ...Hs, line, bulge: Hs.bulge ?? 0.035, round: Hs.round ?? 1.3, tip: Hs.tip ?? 0.17, twist: Hs.twist ?? 0.35 };
  const HR = R * (toy ? 1.1 : 1.12);
  const shell = add(head, hairShell(HR, line, shellOpts), hair, 0, R * 0.02, -R * 0.02, D.sx, D.sy, D.sz);
  shell.rotation.x = -0.08;
  if (cfg.acc === 'cap' || cfg.acc === 'beanie') { shell.scale.multiplyScalar(0.97); shell.scale.y *= 0.84; }
  if (style === 'spiky') for (let i = 0; i < 6; i++) {
    const a = (i - 2.5) * 0.42, sx = Math.sin(a);
    add(head, sweep([[sx * R * 0.5, R * 0.75, R * 0.1], [sx * R * 0.66, R * 1.02, -R * 0.1], [sx * R * 0.82, R * 1.15, -R * 0.42]], (t) => R * (toy ? 0.3 : 0.25) * (1 - t) ** 0.8, 14, 12), hair);
  }
  if (style === 'ponytail') {
    add(head, new THREE.TorusGeometry(R * 0.14, R * 0.055, 8, 18), topDark, 0, R * 0.16, -R * 1.02).rotation.x = 0.3;
    add(head, sweep([[0, R * 0.18, -R * 0.9], [0, R * 0.05, -R * 1.25], [R * 0.02, -R * 0.55, -R * 1.38], [R * 0.08, -R * 1.2, -R * 1.18], [R * 0.15, -R * 1.62, -R * 0.9]], (t) => R * 0.28 * Math.sin(Math.PI * (0.28 + 0.72 * t)) + 0.004, 30, 16), hair);
  }
  if (style === 'bun') {
    add(head, sph(R * 0.38, 26, 20), hair, 0, R * 1.05, -R * 0.35, 1, 0.9, 1);
    add(head, new THREE.TorusGeometry(R * 0.3, R * 0.09, 10, 26), hair, 0, R * 1.04, -R * 0.35, 1, 1, 0.9).rotation.x = Math.PI / 2 - 0.35;
    add(head, new THREE.TorusGeometry(R * 0.25, R * 0.05, 8, 22), topDark, 0, R * 0.84, -R * 0.26).rotation.x = Math.PI / 2 - 0.35;
  }
  if (seed % 3 === 0 && style !== 'spiky' && style !== 'bun' && cfg.acc !== 'beanie' && cfg.acc !== 'cap') add(head, sweep([[R * 0.05, R * 1.0, R * 0.05], [R * 0.12, R * 1.28, R * 0.2], [0, R * 1.42, R * 0.4], [-R * 0.15, R * 1.35, R * 0.5]], (t) => R * 0.06 * (1 - t) + 0.002, 16, 8), hair);

  /* accessories */
  const acc = cfg.acc;
  if (acc === 'headphones') {
    const hpM = plainMat('#2B2F36', { roughness: 0.35, metalness: 0.3 }), padM = fabric(shirtC);
    add(head, new THREE.TorusGeometry(HR * 1.08, R * 0.07, 8, 40, Math.PI), hpM, 0, R * 0.05, 0);
    for (const sx of [-1, 1]) {
      add(head, new THREE.CylinderGeometry(R * 0.27, R * 0.27, R * 0.18, 26), hpM, sx * HR * 1.04, -R * 0.08, 0).rotation.z = Math.PI / 2;
      add(head, new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.05, 22), padM, sx * HR * 1.14, -R * 0.08, 0).rotation.z = Math.PI / 2;
    }
  }
  if (acc === 'glasses') {
    const frameM = plainMat('#2A211B', { roughness: 0.35, metalness: 0.3 });
    const gx = R * (toy ? 0.37 : 0.35), gy = toy ? -R * 0.1 : -R * 0.06, gr = R * (toy ? 0.2 : 0.24);
    for (const sx of [-1, 1]) {
      add(head, new THREE.TorusGeometry(gr, R * 0.024, 8, 30), frameM, sx * gx, gy, surf(gx, gy) + R * 0.06).rotation.y = sx * 0.25;
      add(head, new THREE.BoxGeometry(R * 0.03, R * 0.03, R * 0.75), frameM, sx * R * D.sx * 0.72, gy + R * 0.02, R * 0.48).rotation.y = sx * -0.28;
    }
    add(head, new THREE.TorusGeometry(R * 0.07, R * 0.02, 6, 12, Math.PI), frameM, 0, gy + R * 0.01, surf(0, gy) + R * 0.07);
  }
  if (acc === 'beanie') {
    const bm = fabric(shirtC, 0.8);
    add(head, new THREE.SphereGeometry(HR * 1.12, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.5), bm, 0, R * 0.04, -R * 0.03, D.sx, D.sy * 1.04, D.sz).rotation.x = -0.28;
    add(head, new THREE.TorusGeometry(HR * 1.1, R * 0.12, 10, 40), bm, 0, R * 0.02 + HR * 0.28, -R * 0.03 - HR * 0.03, D.sx, 1, D.sz).rotation.x = Math.PI / 2 - 0.28;
    add(head, sph(R * 0.2, 14, 12), soleM, 0, HR * 1.18, -R * 0.32);
  }
  if (acc === 'cap') {
    const cm = fabric(shirtC, 0.85), capG = new THREE.Group(); capG.position.set(0, R * 0.06, -R * 0.03); capG.rotation.x = -0.18; head.add(capG);
    add(capG, new THREE.SphereGeometry(HR * 1.08, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, 0, 0, 0, D.sx, D.sy * 0.86, D.sz);
    const brim = add(capG, new THREE.CylinderGeometry(HR * 0.66, HR * 0.66, R * 0.06, 30, 1, false, -Math.PI / 2, Math.PI), plainMat(darken(shirtC, 0.7), { roughness: 0.8 }), 0, R * 0.02, HR * 0.78, 1.0, 1, 1.0); brim.rotation.x = 0.1;
    add(capG, sph(R * 0.08, 10, 8), cm, 0, HR * 1.08 * D.sy * 0.86, 0);
  }

  /* props */
  const book = new THREE.Group(); book.position.set(0, D.shY - 0.2, 0.27); book.rotation.x = -1.0; spine.add(book);
  const coverM = plainMat('#C8553D'), pageM = plainMat('#FBF8F0');
  for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.25), coverM); c.position.x = sx * 0.09; c.rotation.z = -sx * 0.18; book.add(c); const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.23), pageM); p.position.set(sx * 0.09, 0.015, 0); p.rotation.z = -sx * 0.18; book.add(p); }
  book.visible = false; P.book = book;
  // a game controller held in both hands (the lounge TV: people/gaming.js): grips, two sticks, a touchpad, its light bar
  const pad = new THREE.Group(); pad.position.set(0, D.shY - 0.3, 0.24); pad.rotation.x = -0.55; spine.add(pad);
  { const body = plainMat('#F2F3F5', { roughness: 0.45 }), trim = plainMat('#1C1F25');
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); pad.add(o); return o; };
    box(0.15, 0.03, 0.065, body, 0, 0, 0);
    for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.04, 4, 8), body); g.rotation.x = Math.PI / 2 + 0.35; g.rotation.z = -sx * 0.35; g.position.set(sx * 0.062, -0.006, 0.035); pad.add(g); }
    for (const sx of [-1, 1]) box(0.018, 0.012, 0.018, trim, sx * 0.03, 0.02, 0.012);
    box(0.05, 0.004, 0.028, trim, 0, 0.016, -0.014);
    box(0.05, 0.004, 0.006, plainMat('#5FA8FF', { emissive: '#3A7BFF', emissiveIntensity: 0.8 }), 0, 0.012, -0.034); }
  pad.visible = false; P.pad = pad;
  const mug = new THREE.Group(); mug.position.set(0, -0.02, D.handR * 0.9); P.armR.hand.add(mug);
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 16), plainMat('#FFFFFF')));
  const mh = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.01, 6, 12), plainMat('#FFFFFF')); mh.position.x = 0.064; mug.add(mh);
  mug.visible = false; P.mug = mug;
  // brought back from the convenience store: an iced drink in a plastic cup, domed lid, a straw, the shop's band round it
  const cup = new THREE.Group(); cup.position.set(0, -0.02, D.handR * 0.9); P.armR.hand.add(cup);
  add(cup, new THREE.CylinderGeometry(0.056, 0.044, 0.1, 16), plainMat('#B98A5E', { roughness: 0.35 }), 0, -0.015, 0);
  add(cup, new THREE.CylinderGeometry(0.062, 0.056, 0.05, 16), plainMat('#E6EEF2', { roughness: 0.2 }), 0, 0.06, 0);
  add(cup, new THREE.SphereGeometry(0.062, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plainMat('#F2F6F8', { roughness: 0.2 }), 0, 0.085, 0, 1, 0.6, 1);
  add(cup, new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6), plainMat('#2E8B57'), 0.012, 0.15, 0).rotation.z = -0.15;
  const band = add(cup, new THREE.CylinderGeometry(0.0525, 0.049, 0.035, 16), plainMat('#E21F26', { roughness: 0.9 }), 0, 0, 0);
  cup.visible = false; P.cup = cup; P.cupBand = band;
  // the stores' own takeaways (outings.js picks one by the chain), held like the drink: Circle K's mì ly (the lid peeled
  // back, chopsticks in, steaming), GS25's tokbokki (red rice cakes, a fish-cake skewer), 7-Eleven's onigiri and bánh
  // bao, Ministop's soft-serve and fried chicken
  P.held = { cup };
  const hold = (k) => { const g = new THREE.Group(); g.position.set(0, -0.02, D.handR * 0.9); g.visible = false; P.armR.hand.add(g); P.held[k] = g; return g; };
  const stick = plainMat('#D9B98A', { roughness: 0.8 }), paper = plainMat('#FBF8F1', { roughness: 0.75 });
  {
    const g = hold('noodle');
    add(g, new THREE.CylinderGeometry(0.055, 0.042, 0.1, 14), paper, 0, -0.01, 0);
    add(g, new THREE.CylinderGeometry(0.0555, 0.05, 0.04, 14), plainMat('#E3412B', { roughness: 0.7 }), 0, 0.004, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.006, 14), plainMat('#E8C27A', { roughness: 0.8 }), 0, 0.037, 0);
    add(g, new THREE.CylinderGeometry(0.057, 0.057, 0.004, 14, 1, false, Math.PI / 2, Math.PI), plainMat('#F2D24B', { roughness: 0.5 }), 0, 0.041, 0).rotation.x = 1.15;
    for (const x of [-0.009, 0.009]) add(g, new THREE.CylinderGeometry(0.0035, 0.0035, 0.19, 5), stick, x, 0.09, 0.012).rotation.z = x * 5;
    const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex(), transparent: true, depthWrite: false, opacity: 0.45 }));
    st.position.y = 0.13; st.scale.setScalar(0.12); g.add(st); P.steam = st;
  }
  {
    const g = hold('tok');
    add(g, new THREE.CylinderGeometry(0.058, 0.044, 0.095, 14), paper, 0, -0.012, 0);
    add(g, new THREE.CylinderGeometry(0.0585, 0.054, 0.03, 14), plainMat('#0068B7', { roughness: 0.8 }), 0, 0.018, 0);
    add(g, new THREE.CylinderGeometry(0.052, 0.052, 0.012, 14), plainMat('#C8321F', { roughness: 0.4 }), 0, 0.03, 0);
    for (const [x, z, r] of [[-0.02, 0.012, 0.3], [0.014, -0.014, -0.6], [0.022, 0.018, 1.2]]) add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.042, 6), plainMat('#E0503A', { roughness: 0.4 }), x, 0.04, z).rotation.set(Math.PI / 2, r, 0);
    add(g, new THREE.CylinderGeometry(0.0025, 0.0025, 0.2, 4), stick, -0.012, 0.1, 0).rotation.z = 0.12;
    add(g, new THREE.BoxGeometry(0.05, 0.06, 0.008), plainMat('#D9A65B', { roughness: 0.8 }), -0.019, 0.155, 0).rotation.z = 0.12;
  }
  {
    const g = hold('onigiri');
    add(g, new THREE.CylinderGeometry(0.058, 0.058, 0.034, 3).rotateX(Math.PI / 2).rotateZ(Math.PI), plainMat('#F7F6F0', { roughness: 0.5 }), 0, 0.035, 0);
    add(g, new THREE.BoxGeometry(0.05, 0.034, 0.037), plainMat('#1F2A22', { roughness: 0.7 }), 0, 0.016, 0);
    add(g, new THREE.BoxGeometry(0.008, 0.07, 0.038), plainMat('#E2241B', { roughness: 0.6 }), 0, 0.04, 0);
  }
  {
    const g = hold('bun'), dough = plainMat('#FBF5E8', { roughness: 0.9 });
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.004, 12), plainMat('#E3D5B5', { roughness: 0.9 }), 0, -0.01, 0);
    add(g, new THREE.SphereGeometry(0.054, 12, 8), dough, 0, 0.026, 0, 1, 0.72, 1);
    add(g, new THREE.ConeGeometry(0.017, 0.02, 8), dough, 0, 0.068, 0);
  }
  {
    const g = hold('cone'), cream = plainMat('#FFF8EC', { roughness: 0.55 });
    add(g, new THREE.ConeGeometry(0.034, 0.11, 10).rotateX(Math.PI), plainMat('#D49A55', { roughness: 0.8 }), 0, -0.02, 0);
    add(g, new THREE.SphereGeometry(0.038, 10, 8), cream, 0, 0.045, 0, 1, 0.8, 1);
    add(g, new THREE.ConeGeometry(0.03, 0.05, 10), cream, 0, 0.088, 0);
  }
  {
    const g = hold('chicken');
    add(g, new THREE.BoxGeometry(0.08, 0.09, 0.05), paper, 0, 0, 0);
    add(g, new THREE.BoxGeometry(0.081, 0.024, 0.051), plainMat('#003894', { roughness: 0.8 }), 0, 0.022, 0);
    add(g, new THREE.CapsuleGeometry(0.022, 0.03, 4, 8), plainMat('#B8702E', { roughness: 0.6 }), 0.008, 0.07, 0).rotation.z = 0.3;
    add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.03, 5), plainMat('#F4EEE2'), -0.006, 0.112, 0).rotation.z = 0.3;
  }
  {   // a commit on its way to the lobby's post box (life/post.js): a white envelope, a red and blue airmail edge
    const g = hold('letter');
    add(g, new THREE.BoxGeometry(0.12, 0.08, 0.006), plainMat('#FBFAF5', { roughness: 0.8 }), 0, 0.03, 0);
    for (const [y, c] of [[0.068, '#D9342B'], [-0.008, '#2E5BBA']]) add(g, new THREE.BoxGeometry(0.12, 0.006, 0.007), plainMat(c), 0, y, 0);
    add(g, new THREE.BoxGeometry(0.022, 0.026, 0.007), plainMat('#E8742A'), 0.042, 0.052, 0.001);   // the stamp
    g.traverse((o) => { o.castShadow = false; });
  }
  {   // a slice of the month's birthday cake on a paper plate (people/hr.js)
    const g = hold('cake');
    add(g, new THREE.CylinderGeometry(0.075, 0.07, 0.006, 16), plainMat('#FBFAF5', { roughness: 0.8 }), 0, -0.012, 0);
    add(g, new THREE.CylinderGeometry(0.055, 0.055, 0.045, 12, 1, false, 0, Math.PI / 2.2), plainMat('#F3B6C4', { roughness: 0.7 }), -0.012, 0.014, -0.012);
    add(g, new THREE.CylinderGeometry(0.056, 0.056, 0.01, 12, 1, false, 0, Math.PI / 2.2), plainMat('#FFF6EC', { roughness: 0.6 }), -0.012, 0.041, -0.012);
    add(g, new THREE.SphereGeometry(0.01, 8, 6), plainMat('#D8322F', { roughness: 0.4 }), 0.004, 0.05, 0.004);
    g.traverse((o) => { o.castShadow = false; });
  }
  // the team's lunch from the GrabFood rider: a white carrier bag, the boxes' lids showing, hanging from the left hand
  const bag = new THREE.Group(); bag.position.set(0, -0.02, 0); P.armL.hand.add(bag);
  const bagM = plainMat('#F4F3EE', { roughness: 0.75 });
  add(bag, new THREE.BoxGeometry(0.27, 0.22, 0.15), bagM, 0, -0.19, 0);
  add(bag, new THREE.BoxGeometry(0.24, 0.025, 0.13), plainMat('#FFFFFF', { roughness: 0.5 }), 0, -0.07, 0);
  for (const x of [-0.07, 0.07]) add(bag, new THREE.TorusGeometry(0.045, 0.008, 6, 12, Math.PI), bagM, x, -0.075, 0);
  bag.visible = false; P.bag = bag;
  // going home past WinMart+ or Bách Hóa Xanh: a plastic bag, the shop's colour on it, greens and a carrot sticking out
  const groc = new THREE.Group(); groc.position.set(0, -0.02, 0); P.armL.hand.add(groc);
  const plastic = plainMat('#F6F6F2', { roughness: 0.45 });
  add(groc, new THREE.BoxGeometry(0.22, 0.19, 0.13), plastic, 0, -0.18, 0);
  for (const x of [-0.06, 0.06]) add(groc, new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), plastic, x, -0.08, 0);
  add(groc, new THREE.SphereGeometry(0.06, 8, 6), plainMat('#5BAA3A', { roughness: 0.8 }), -0.04, -0.07, 0, 1, 1.25, 0.75);
  add(groc, new THREE.SphereGeometry(0.045, 8, 6), plainMat('#3E8A2C', { roughness: 0.8 }), 0.035, -0.08, 0.01, 1, 1.2, 0.8);
  add(groc, new THREE.ConeGeometry(0.014, 0.1, 6).rotateX(Math.PI), plainMat('#E8742A', { roughness: 0.6 }), 0.07, -0.06, -0.02).rotation.z = -0.4;
  const grocBand = add(groc, new THREE.BoxGeometry(0.222, 0.035, 0.132), plainMat('#E21B2A', { roughness: 0.8 }), 0, -0.2, 0);
  groc.visible = false; P.grocery = groc; P.groceryBand = grocBand;
  const drop = new THREE.Mesh(sph(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: '#7EC8F0', transparent: true, opacity: 0.85 }));
  drop.scale.set(0.8, 1.3, 0.8); drop.position.set(R * 1.0, D.hipY + D.headY + R * 0.5, 0.2); drop.visible = false; root.add(drop); P.drop = drop;
  mergeRig(root, new Set([sh, drop, P.mouthSmile, P.mouthO, band, grocBand]));
  standIns(root, P);
  return { root, P };
}

/* The sun's shadow of a character comes from a handful of low-poly stand-ins on the same joints (head, body, arms,
   legs), shown only while the shadow map is drawn (shadowStandIns). Drawing every detailed part into the shadow map
   cost about 50k triangles and 30 draw calls a character, as much as all the furniture, several times a second. */
const standInSets = new Set();   // [root, meshes]
let standInM;
function standIns(root, P) {
  root.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  standInM ||= new THREE.MeshBasicMaterial();
  const D = P.D, R = D.R, H = D.torso[D.torso.length - 1][1], meshes = [];
  const part = (parent, geo, x, y, z, sz = 1) => { const m = new THREE.Mesh(geo, standInM); m.position.set(x, y, z); m.scale.z = sz; m.castShadow = true; m.visible = false; m.matrixAutoUpdate = true; parent.add(m); meshes.push(m); };
  const cyl = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 7, 1);
  part(P.head, new THREE.SphereGeometry(R * 1.07, 10, 7), 0, R * 0.04, 0);
  part(P.spine, cyl(D.torso[5][0], D.torso[1][0], H + 0.06), 0, H / 2 - 0.03, 0, 0.82);
  for (const L of [P.legL, P.legR]) { part(L.hip, cyl(D.legR, D.legR, D.thigh), 0, -D.thigh / 2, 0); part(L.knee, cyl(D.legR, D.legR * 1.1, D.shin + 0.05), 0, -D.shin / 2 - 0.02, 0.02); }
  for (const A of [P.armL, P.armR]) { part(A.sh, cyl(D.armR, D.armR, D.upper), 0, -D.upper / 2, 0); part(A.el, cyl(D.armR, D.handR, D.fore + D.handR), 0, -D.fore / 2 - 0.02, 0); }
  standInSets.add([root, meshes]);
}
/** Once, with the renderer: the stand-ins show for the shadow pass only (and a rig thrown away is forgotten). */
export function shadowStandIns(renderer) {
  const sm = renderer.shadowMap, draw = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    if (!sm.enabled || (!sm.autoUpdate && !sm.needsUpdate)) { draw(lights, scene, camera); return; }
    for (const set of standInSets) { if (!set[0].parent) { standInSets.delete(set); continue; } for (const m of set[1]) m.visible = true; }
    draw(lights, scene, camera);
    for (const [, meshes] of standInSets) for (const m of meshes) m.visible = false;
  };
}

// Fewer draw calls, same character (80 meshes became ~30): inside each joint (head, hand, knee…), meshes that never move
// on their own and use the same kind of material become one mesh, each part keeping its colour as a vertex colour.
// Parts a pose changes (blinks, the two mouths, props, the shadow) and meshes that carry children stay as they are.
const _white = new THREE.Color(1, 1, 1);
function mergeRig(root, keep) {
  const holders = []; root.traverse((o) => { if (o.children.length) holders.push(o); });
  for (const g of holders) {
    const buckets = new Map();
    for (const m of g.children) {
      if (!m.isMesh || m.children.length || keep.has(m) || !m.visible || Array.isArray(m.material)) continue;
      m.updateMatrix(); if (m.matrix.determinant() < 0) continue;   // mirrored parts would turn inside out
      const x = m.material;
      const k = [x.type, x.side, x.transparent, x.opacity, x.depthWrite, x.map?.uuid ?? '', x.isMeshPhysicalMaterial ? `${x.sheen > 0}${x.clearcoat > 0}` : '', Math.round((x.roughness ?? 0) * 1.5), Math.round((x.metalness ?? 0) * 2)].join('|');
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(m.matrix);
        const c = m.material.color || _white, n = geo.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return geo;
      });
      const geo = mergeGeometries(geos, false); if (!geo) continue;
      const mat = list[0].material.clone(); mat.vertexColors = true; if (mat.color) mat.color.set(1, 1, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = list.some((m) => m.receiveShadow); mesh.renderOrder = list[0].renderOrder;
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
  // details smaller than a few centimetres (eyes, brows, lips, buttons) cast no shadow anyone could see
  root.traverse((m) => { if (!m.isMesh || !m.castShadow) return; if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); if (m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z) < 0.045) m.castShadow = false; });
}

// Outerwear for arriving and going home: a coat over the top (open down the front, sleeves, a turned-up collar,
// pockets) and a backpack. Built on first use, then only shown or hidden. o: { coat, bag } colours.
export function wearOuter(P, on, o = {}) {
  if (!on) { if (P.outer) for (const m of P.outer) m.visible = false; return; }
  if (P.outer) { for (const m of P.outer) m.visible = true; return; }
  const D = P.D, H = D.torso[D.torso.length - 1][1], tr = D.torso[2][0], coatC = o.coat || '#2F3B52', bagC = o.bag || '#2B2F36';
  const coatM = new THREE.MeshPhysicalMaterial({ color: coatC, roughness: 0.82, sheen: 0.5, sheenRoughness: 0.8, sheenColor: lighten(coatC, 0.5), side: THREE.DoubleSide });
  const darkM = new THREE.MeshPhysicalMaterial({ color: darken(coatC, 0.72), roughness: 0.85, sheen: 0.4, sheenRoughness: 0.8, sheenColor: lighten(coatC, 0.4) });
  const bagM = new THREE.MeshPhysicalMaterial({ color: bagC, roughness: 0.7, sheen: 0.3, sheenRoughness: 0.7, sheenColor: lighten(bagC, 0.4) });
  const bagDark = plainMat(darken(bagC, 0.65), { roughness: 0.6 }), buckle = plainMat('#C9CED6', { metalness: 0.6, roughness: 0.3 });
  const out = [];
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); out.push(mesh); return mesh; };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, Math.max(0.001, l), 6, 14);
  // body: the torso's own profile a little wider and longer at the hem, open at the front (the torso mesh is squashed
  // front to back, and the coat inherits it)
  const prof = D.torso.slice(1).filter(([, y]) => y <= H * 0.94).map(([x, y]) => new THREE.Vector2(x * 1.09 + 0.006, y));
  prof.unshift(new THREE.Vector2(D.torso[1][0] * 1.14 + 0.006, -0.17));
  const gap = 0.36;
  add(P.torso, new THREE.LatheGeometry(prof, 36, gap, Math.PI * 2 - gap * 2), coatM);
  // lapels down the opening, a stand-up collar, two pocket flaps
  const r0 = D.torso[3][0] * 1.09 + 0.008;
  for (const sx of [-1, 1]) {
    const l = add(P.torso, new RoundedBoxGeometry(0.04, H * 0.62, 0.014, 2, 0.006), darkM, sx * Math.sin(gap) * r0, H * 0.5, Math.cos(gap) * r0);
    l.rotation.set(-0.06, sx * gap, sx * 0.12);
    const pk = add(P.torso, new RoundedBoxGeometry(0.09, 0.022, 0.03, 2, 0.008), darkM, sx * r0 * 0.62, H * 0.2, r0 * 0.8);
    pk.rotation.y = sx * 0.62;
  }
  add(P.torso, new THREE.TorusGeometry(H * 0.2, 0.034, 10, 28, Math.PI * 1.55), darkM, 0, H * 0.93, -0.01).rotation.set(Math.PI / 2 - 0.3, 0, Math.PI * 0.725);
  // sleeves over the arms
  for (const A of [P.armL, P.armR]) {
    add(A.sh, new THREE.SphereGeometry(D.armR * 1.2, 18, 12), coatM);
    add(A.sh, cap(D.armR * 1.16, D.upper - D.armR), coatM, 0, -D.upper / 2, 0);
    add(A.el, new THREE.SphereGeometry(D.armR * 1.1, 16, 12), coatM);
    add(A.el, cap(D.armR * 1.1, D.fore - D.armR * 1.6), coatM, 0, -D.fore / 2 + 0.02, 0);
    add(A.el, new THREE.CylinderGeometry(D.armR * 1.2, D.armR * 1.2, 0.05, 16), darkM, 0, -D.fore + 0.05, 0);
  }
  // backpack on the spine (not the torso, so it isn't squashed), with straps over the shoulders and a top handle
  const back = -(D.torso[4][0] * 0.82 * 1.09 + 0.01), bw = tr * 1.25, bh = H * 0.62, bd = 0.13;
  add(P.spine, new RoundedBoxGeometry(bw, bh, bd, 3, 0.045), bagM, 0, H * 0.5, back - bd / 2);
  add(P.spine, new RoundedBoxGeometry(bw * 0.72, bh * 0.38, 0.05, 2, 0.02), bagM, 0, H * 0.36, back - bd - 0.02);
  add(P.spine, new RoundedBoxGeometry(bw * 0.74, 0.012, 0.012, 1, 0.004), bagDark, 0, H * 0.46, back - bd - 0.046);
  add(P.spine, new THREE.TorusGeometry(0.035, 0.01, 6, 14, Math.PI), bagDark, 0, H * 0.5 + bh / 2, back - bd / 2);
  for (const sx of [-1, 1]) {
    const s = add(P.spine, new THREE.TorusGeometry(H * 0.3, 0.014, 6, 18, Math.PI), bagDark, sx * tr * 0.42, H * 0.6, back * 0.35);
    s.rotation.y = Math.PI / 2; s.scale.set(1, 1, 1.15);
    add(P.spine, new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), buckle, sx * tr * 0.42, H * 0.36, -back * 0.82).rotation.x = Math.PI / 2;
  }
  for (const m of out) m.traverse?.((x) => { if (x.isMesh) x.castShadow = false; });   // (the stand-ins cast the shadow)
  P.outer = out;
}

// A Santa hat for the Christmas weeks: a soft red cone that flops to one side, a white fur band and a pom-pom.
export function wearHat(P) {
  if (P.hat) return;
  const R = P.D.R, red = plainMat('#C8283A', { roughness: 0.85 }), fur = plainMat('#F7F4EE', { roughness: 1 });
  const g = new THREE.Group(); g.position.set(0, R * 0.62, -R * 0.06); g.rotation.set(-0.22, 0, 0.12); P.head.add(g);
  const cone = (rb, rt, h, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 22, 1, true), red); m.position.y = y; m.castShadow = true; return m; };
  g.add(cone(R * 0.86, R * 0.42, R * 0.55, R * 0.27));
  const tip = new THREE.Group(); tip.position.y = R * 0.54; tip.rotation.z = -0.9; g.add(tip);
  tip.add(cone(R * 0.42, R * 0.06, R * 0.62, R * 0.3));
  const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 14, 10), fur); pom.position.y = R * 0.62; tip.add(pom);
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, R * 0.12, 10, 32), fur); band.rotation.x = Math.PI / 2; band.castShadow = true; g.add(band);
  P.hat = g;
}

// Two-bone IK in the sagittal plane: rotations [shoulderX, shoulderZ, elbowX] that put the hand on a point
// (x sideways, y up, z forward, in root space). Negative X swings forward; the elbow only bends forward.
function armIK(D, side, tx, ty, tz, lean) {
  const sy = D.hipY + D.shY * Math.cos(lean), sz = D.shY * Math.sin(lean), sxp = side * D.shX;
  const dx = tx - sxp, dy = ty - sy, dz = tz - sz;
  const a = D.upper, b = D.fore + D.handR * 0.6;
  const rz = Math.asin(THREE.MathUtils.clamp(dx / (a + b), -0.9, 0.9)), c = Math.cos(rz);
  const L = THREE.MathUtils.clamp(Math.hypot(dz, dy), Math.abs(a - b) * c + 1e-3, (a + b) * c - 1e-3);
  const phT = Math.atan2(dz, -dy);
  const al = Math.acos(THREE.MathUtils.clamp((a * a * c * c + L * L - b * b * c * c) / (2 * a * c * L), -1, 1));
  const be = Math.acos(THREE.MathUtils.clamp((b * b * c * c + L * L - a * a * c * c) / (2 * b * c * L), -1, 1));
  return [-(phT - al + lean), rz, -(al + be)];
}

// Target pose for an activity. o: { sit, look, wave, blink, scale }. Desk and seat heights are world units, so a
// scaled-down character (subagents) still sits on the seat and reaches the desk.
export function chibiPose(P, anim, ph, o = {}) {
  const D = P.D, sit = !!o.sit, R = D.R, W = 1 / (o.scale || 1);
  const p = { hipL: 0, hipR: 0, kneeL: 0.03, kneeR: 0.03, armL: [0.04, -0.08, -0.15], armR: [0.04, 0.08, -0.15], lean: 0,
    head: [0, o.look || 0, 0], y: sit ? 0.49 * W + D.legR - D.hipY : 0, tilt: 0, lid: 0, mouth: 'smile', book: false, mug: false, drop: false, shadow: !sit };
  if (sit) { p.hipL = p.hipR = -1.52; p.kneeL = p.kneeR = 1.45; }
  const reach = (side, x, y, z) => armIK(D, side, x, y - p.y, z, p.lean);           // body-relative target
  const reachW = (side, x, y, z) => armIK(D, side, x * W, y * W - p.y, z * W, p.lean); // world target (desk)
  const shoulderY = () => p.y + D.hipY + D.shY * Math.cos(p.lean);
  const headY = () => p.y + D.hipY + D.headY * Math.cos(p.lean), headZ = () => D.headY * Math.sin(p.lean);
  switch (anim) {
    case 'walk': {
      const s = Math.sin(ph * 9);
      p.hipL = s * 0.55; p.hipR = -s * 0.55; p.kneeL = Math.max(0, -s) * 0.85 + 0.05; p.kneeR = Math.max(0, s) * 0.85 + 0.05;
      p.armL = [-s * 0.5, -0.08, -0.35]; p.armR = [s * 0.5, 0.08, -0.35]; p.y = Math.abs(Math.cos(ph * 9)) * 0.03; p.head = [0, 0, 0]; p.lean = 0.05;
      break;
    }
    case 'type': case 'console': {
      // a big head (look A) leaning in would put its hair or cap brim through the laptop lid: sit straighter
      const big = R > 0.4;
      p.lean = sit ? (big ? 0.06 : 0.2) : 0.1; p.head = [big ? 0.02 : 0.12, 0, 0];
      const y = sit ? 0.82 : 1.0, z = sit ? 0.48 : 0.42, j = Math.sin(ph * 22) * 0.012, j2 = Math.sin(ph * 22 + 1.7) * 0.012;
      p.armL = reachW(-1, -0.11, y + j, z); p.armR = reachW(1, 0.11, y + j2, z);
      break;
    }
    case 'gamepad': {   // a controller in both hands, thumbs busy, leaning into it, swaying with the game (people/gaming.js)
      const m = Math.sin(ph * 0.53);
      p.lean = (sit ? 0.1 : 0.06) + Math.max(0, m) * 0.12; p.tilt = Math.sin(ph * 0.9) * (sit ? 0.06 : 0.03); p.pad = true;
      p.head = [-0.05, 0, Math.sin(ph * 0.9) * 0.05]; if (m > 0.88) p.mouth = 'o';
      const y = p.y + D.hipY + D.shY - 0.3, z = 0.24 + (D.shY - 0.3) * Math.sin(p.lean), j = Math.sin(ph * 25) * 0.007, j2 = Math.sin(ph * 31 + 1) * 0.007;
      p.armL = reach(-1, -0.085, y + j, z); p.armR = reach(1, 0.085, y + j2, z);
      break;
    }
    case 'read': {
      p.lean = 0.04; p.book = true; p.head = [0.3, 0, 0];
      const y = p.y + D.hipY + D.shY - 0.2, z = 0.27 + (D.shY - 0.2) * Math.sin(p.lean);
      p.armL = reach(-1, -0.15, y, z); p.armR = reach(1, 0.15, y, z);
      break;
    }
    case 'board': p.armR = [-1.9 + Math.sin(ph * 6) * 0.12, Math.sin(ph * 3.5) * 0.3, -0.35]; p.armL = [-0.1, -0.1, -0.2]; p.head = [-0.08, 0, 0]; break;
    case 'globe': p.armR = reach(1, 0.22, shoulderY() - 0.08, 0.42 + Math.sin(ph * 2) * 0.03); break;
    case 'hand': p.armR = [0, 2.75 + Math.sin(ph * 7) * 0.12, -0.25]; p.head = [-0.06, 0, 0.1]; p.mouth = 'o'; if (!sit) p.y = Math.abs(Math.sin(ph * 4)) * 0.04; break;
    case 'coffee': {
      p.mug = true; const sip = Math.sin(ph * 1.6) > 0.55;
      p.head = [sip ? -0.15 : 0, sip ? 0 : o.look || 0, 0];
      p.armR = sip ? reach(1, 0.06, headY() - R * 0.55, headZ() + R * 0.95 + 0.06) : reach(1, 0.16, shoulderY() - 0.3, 0.2);
      if (sit) p.armL = reach(-1, -0.14, p.y + D.hipY + 0.06, 0.2);
      break;
    }
    case 'sleep':   // seated: leaning back in a reclined chair, hands folded on the belly (under the blanket)
      p.lid = 1;
      if (sit && o.doze) {   // the midday nap (life/nap.js): forearms folded on the desk, head down on them, cheek to one side
        p.lean = 0.62; p.head = [0.5, 0, 0.42 + Math.sin(ph * 0.9) * 0.02];
        p.armL = reachW(-1, 0.1, 0.84, 0.4); p.armR = reachW(1, -0.1, 0.85, 0.42);
      } else if (sit) {   // hands rest on top of the blanket (floor-relative world target, as the desk poses use)
        p.lean = -0.36; p.head = [-0.05 + Math.sin(ph * 0.9) * 0.02, 0, 0.26];
        p.armL = reachW(-1, -0.09, 0.9, 0.24); p.armR = reachW(1, 0.07, 0.91, 0.26);
      } else { p.lean = 0.08; p.head = [-0.12, 0, 0.3]; p.armL = [-0.25, 0.25, -1.0]; p.armR = [-0.25, -0.25, -1.0]; }
      break;
    case 'wake': {  // stretch and yawn, then sit up
      const k = Math.min(1, Math.sin(ph * 2.2) * 0.5 + 0.6);
      p.lean = -0.15 * k; p.lid = 0.55; p.mouth = 'o'; p.head = [-0.18 * k, 0, 0];
      p.armL = [0, -2.5 * k - 0.2, -0.25]; p.armR = [0, 2.5 * k + 0.2, -0.25];
      break;
    }
    case 'tidy': {
      const s = Math.sin(ph * 5) * 0.06;
      p.lean = 0.12; p.head = [0.18, 0, 0];
      if (sit) { p.armL = reachW(-1, -0.16, 0.83, 0.38 + s); p.armR = reachW(1, 0.16, 0.83, 0.38 - s); }
      else { p.armL = reach(-1, -0.16, shoulderY() - 0.25, 0.38 + s); p.armR = reach(1, 0.16, shoulderY() - 0.25, 0.38 - s); }
      break;
    }
    case 'eat': {   // at a table: the left hand steadies the lunch box, the right brings a bite up now and then
      const bite = Math.sin(ph * 1.5) > 0.55;
      p.lean = 0.12; p.head = [bite ? 0.02 : 0.22, 0, 0]; p.mouth = bite ? 'o' : 'smile';
      p.armL = reachW(-1, -0.1, 0.8, 0.4);
      p.armR = bite ? reach(1, 0.04, headY() - R * 0.62, headZ() + R * 0.92 + 0.05) : reachW(1, 0.09, 0.83, 0.42 + Math.sin(ph * 6) * 0.02);
      break;
    }
    case 'sweat': p.armL = [-0.15, -0.3, -0.5]; p.armR = [-0.15, 0.3, -0.5]; p.tilt = Math.sin(ph * 30) * 0.04; p.head = [-0.1, 0, 0]; p.drop = true; p.mouth = 'o'; break;
    case 'slam': {   // second failure in a row: both fists come down on the desk (idea from agents-at-work's "temper")
      const k = Math.abs(Math.sin(ph * 7));
      p.lean = sit ? 0.28 : 0.12; p.head = [0.18, 0, Math.sin(ph * 14) * 0.06]; p.mouth = 'o'; p.drop = true;
      if (sit) { const y = 0.82 + 0.26 * k; p.armL = reachW(-1, -0.14, y, 0.36); p.armR = reachW(1, 0.14, y, 0.36); }
      else { p.armL = [-0.2 - 1.2 * k, -0.2, -0.4]; p.armR = [-0.2 - 1.2 * k, 0.2, -0.4]; }
      break;
    }
    case 'celebrate': p.armL = [0, -2.6, -0.3]; p.armR = [0, 2.6, -0.3]; p.y += Math.abs(Math.sin(ph * 8)) * 0.35; p.mouth = 'o'; p.lean = -0.08; break;
    case 'clap': {   // applause: the hands meet in front of the chest, quickly
      const s = Math.abs(Math.sin(ph * 13)) * 0.08, y = shoulderY() - 0.2;
      p.armL = reach(-1, -0.03 - s, y, 0.3); p.armR = reach(1, 0.03 + s, y, 0.3); p.mouth = 'o'; p.head = [-0.06, 0, 0];
      if (!sit) p.y += Math.abs(Math.sin(ph * 6.5)) * 0.02;
      break;
    }
    case 'stomp': {   // compaction: hop on the waste bin
      const k = Math.abs(Math.sin(ph * 7));
      p.hipL = p.hipR = -0.25 * (1 - k); p.kneeL = p.kneeR = 0.5 * (1 - k); p.y = k * 0.24; p.shadow = true;
      p.armL = [0, -1.15, -0.4]; p.armR = [0, 1.15, -0.4]; p.lean = 0.12; p.head = [0.35, 0, 0]; p.mouth = 'o';
      break;
    }
    case 'think': p.armR = reach(1, 0.03, headY() - R * 0.85, headZ() + R * 0.8 + 0.04); p.head = [0, 0, Math.sin(ph * 1.3) * 0.12]; break;
    case 'pray': {   // at the altar (life/altar.js): incense held in both hands before the chest, three slow bows
      const bow = Math.max(0, Math.sin(ph * 1.7)) * 0.34;
      p.lean = bow; p.head = [0.12 + bow * 0.4, 0, 0]; p.lid = bow > 0.2 ? 1 : 0;
      p.armL = reach(-1, -0.03, shoulderY() - 0.24, 0.26); p.armR = reach(1, 0.03, shoulderY() - 0.22, 0.26);
      break;
    }
    case 'mop': {   // the evening cleaner (staff.js): both hands down the mop handle, swinging it side to side
      const sw = Math.sin(ph * 3.2) * 0.1;
      p.lean = 0.14; p.head = [0.24, 0, 0];
      p.armL = reach(-1, 0.03 + sw, shoulderY() - 0.2, 0.3); p.armR = reach(1, 0.06 + sw, shoulderY() - 0.44, 0.34);
      break;
    }
    default:
      if (sit) { p.armL = reach(-1, -0.14, p.y + D.hipY + 0.07, 0.24); p.armR = reach(1, 0.14, p.y + D.hipY + 0.07, 0.24); }
      else { p.armL = [Math.sin(ph * 1.1) * 0.04, -0.08, -0.15]; p.armR = [-Math.sin(ph * 1.1) * 0.04, 0.08, -0.15]; }
  }
  // o.carry: a takeaway drink held in front of the chest (sipped instead of the mug), or a carrier bag hanging from the
  // left hand, that arm swinging less for the weight
  // (the stores' food is held, and eaten, the same way: P.held)
  if (P.held[o.carry]) { p.held = o.carry; if (anim === 'coffee') p.mug = false; else p.armR = reach(1, 0.1, shoulderY() - 0.32, 0.24); }
  if (o.carry === 'bag' || o.carry === 'grocery') { p[o.carry] = true; p.armL = [anim === 'walk' ? -Math.sin(ph * 9) * 0.14 : 0.06, -0.14, -0.12]; }
  // a parcel (staff.js puts the box on the chest): held in both hands in front
  if (o.carry === 'box') { p.armL = reach(-1, -0.19, shoulderY() - 0.4, 0.3); p.armR = reach(1, 0.19, shoulderY() - 0.4, 0.3); }
  if (o.wave) { p.armL = [-0.1, -2.5, -0.35 - Math.max(0, Math.sin(ph * 12)) * 0.6]; p.mouth = 'smile'; }
  if (o.blink) p.lid = 1;
  p.breathe = 1 + Math.sin(ph * 2.2) * 0.018;
  return p;
}

// Ease the rig toward a pose; returns the root height to use (sitting raises it onto the seat).
export function applyChibiPose(P, p, dt) {
  const k = Math.min(1, dt * 12);
  const to = (obj, key, v) => { obj[key] += (v - obj[key]) * k; };
  to(P.legL.hip.rotation, 'x', p.hipL); to(P.legR.hip.rotation, 'x', p.hipR);
  to(P.legL.knee.rotation, 'x', p.kneeL); to(P.legR.knee.rotation, 'x', p.kneeR);
  for (const [A, v] of [[P.armL, p.armL], [P.armR, p.armR]]) { to(A.sh.rotation, 'x', v[0]); to(A.sh.rotation, 'z', v[1]); to(A.el.rotation, 'x', v[2]); }
  to(P.spine.rotation, 'x', p.lean);
  to(P.head.rotation, 'x', p.head[0]); to(P.head.rotation, 'z', p.head[2]);
  P.head.rotation.y += (p.head[1] - P.head.rotation.y) * Math.min(1, dt * 3);
  P.lid = (P.lid || 0) + ((p.lid ? 1 : 0) - (P.lid || 0)) * Math.min(1, dt * 30);
  for (const { ball, lash } of P.blink) {
    ball.scale.y = 1 - 0.9 * P.lid;
    if (lash) { lash.position.y = -0.02 * (P.D.R * 0.21 / 0.068) * P.lid; lash.scale.y = 1.06 * (1 - 0.58 * P.lid); }
  }
  P.torso.scale.y = p.breathe;
  P.mouthSmile.visible = p.mouth === 'smile'; P.mouthO.visible = p.mouth === 'o';
  P.mug.rotation.set(-(P.armR.sh.rotation.x + P.armR.el.rotation.x + P.spine.rotation.x), 0, -P.armR.sh.rotation.z);
  for (const k in P.held) { const g = P.held[k]; g.visible = p.held === k; if (g.visible) g.rotation.copy(P.mug.rotation); }
  P.bag.rotation.set(-(P.armL.sh.rotation.x + P.armL.el.rotation.x + P.spine.rotation.x), 0, -P.armL.sh.rotation.z);   // (hangs straight down)
  P.grocery.rotation.copy(P.bag.rotation);
  P.book.visible = p.book; P.pad.visible = !!p.pad; P.mug.visible = p.mug; P.drop.visible = p.drop; P.shadow.visible = p.shadow;
  P.bag.visible = !!p.bag; P.grocery.visible = !!p.grocery;
  if (p.held === 'noodle') { const u = (performance.now() / 1600) % 1; P.steam.position.y = 0.12 + u * 0.12; P.steam.material.opacity = 0.5 * (1 - u) * Math.min(1, u * 6); P.steam.scale.setScalar(0.08 + u * 0.1); }
  if (p.drop) P.drop.position.y = P.D.hipY + P.D.headY + P.D.R * 0.6 - ((performance.now() / 1000) * 1.3 % 1) * 0.3;
  return p.y;
}
