// Seasonal decorations: Halloween, Christmas, Tết.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PRO, SEASON, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, mat, put, rbox } from '../scene/blocks.js';
import { DZ, LIFT_FRONT, lift } from '../world/entrance.js';
import { DESKS, PODS, shaded } from '../world/desks.js';
import { nightHooks } from '../world/props/trinkets.js';
import { starShape } from './trophies.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- decorations by season (SEASON, set from the date): Halloween, Christmas, Tết ----------
   Everything that stands still is merged into three meshes (solid, two-sided flags, glowing bits that bloom at night),
   so a season costs a handful of draw calls; bats fly as instanced meshes, a ghost bobs in the lobby. Nothing stands in
   a walkway. The centrepiece (pumpkins on a hay bale, a Christmas tree, a peach blossom tree) is a prop you can click. */
export const seasonName = (s) => tr('life.season.' + s);
export let SEASON_SPOT;
export const seasonFx = { bats: null, ghost: null, glowM: null, t: 0 };
export const floorBlocks = [];   // [x, z, radius] of decorations standing on the floor, for first-person collisions
export let seasonProp = null;
function buildSeason() {
  if (!SEASON) return;
  const S = SEASON_SPOT, solid = [], flags = [], glow = [], centre = [], centreGlow = [];
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), V3 = THREE.Vector3;
  // geometry placed at (x, y, z), turned ry, scaled s, added to a list with its colour
  const add = (list, geo, color, x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) => {
    list.push([geo.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new V3(s, s, s))), color]);
  };
  // a group of parts built around (0,0,0), then moved as one
  const group = (list, glowList, build, x, y, z, ry = 0, s = 1) => {
    const a = [], b = []; build(a, b);
    const m = new THREE.Matrix4().compose(new V3(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), new V3(s, s, s));
    for (const [g, c] of a) list.push([g.applyMatrix4(m), c]); for (const [g, c] of b) glowList.push([g.applyMatrix4(m), c]);
  };
  const toCamera = Math.PI / 4;   // faces turned toward the default camera

  /* pieces */
  const pumpkin = (a, b, size = 1) => {
    const g = new THREE.SphereGeometry(0.2, 24, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 8); p.setXYZ(i, x * k * 1.12, y * 0.78, z * k * 1.12); }
    g.computeVertexNormals(); g.translate(0, 0.156, 0);
    add(a, g, size > 0.9 ? '#E46F1E' : '#EF8A2B', 0, 0, 0, 0, size);
    add(a, new THREE.CylinderGeometry(0.016, 0.026, 0.08, 6), '#5B7A2E', 0.01 * size, 0.33 * size, 0, 0, size, 0, 0.25);
    const eye = (sx) => { const sh = new THREE.Shape(); sh.moveTo(sx * 0.03, 0.03); sh.lineTo(sx * 0.085, 0.03); sh.lineTo(sx * 0.06, 0.08); sh.closePath(); return sh; };
    const mouth = new THREE.Shape(); mouth.moveTo(-0.1, 0.0);
    [[-0.07, -0.025], [-0.045, 0.0], [-0.02, -0.03], [0.01, 0.0], [0.035, -0.03], [0.06, 0.0], [0.1, 0.0], [0.07, -0.06], [-0.07, -0.06]].forEach(([x, y]) => mouth.lineTo(x, y)); mouth.closePath();
    add(b, new THREE.ShapeGeometry([eye(-1), eye(1), mouth]), '#FFB22E', 0, 0.165 * size, 0.243 * size, 0, size, -0.12);
  };
  const lantern = (a, size = 1) => {   // a red Tết lantern: ribbed body, gold caps, a tassel
    const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.03 + Math.sin(t * Math.PI) * 0.11, t * 0.26)); }
    const g = new THREE.LatheGeometry(prof, 24), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = 1 + 0.05 * Math.cos(Math.atan2(z, x) * 10); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    add(a, g, '#D21F2B', 0, -0.32, 0, 0, size);
    add(a, new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14), '#E9B949', 0, -0.05 * size, 0, 0, size);
    add(a, new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14), '#E9B949', 0, -0.34 * size, 0, 0, size);
    add(a, new THREE.CylinderGeometry(0.006, 0.006, 0.05, 5), '#E9B949', 0, -0.02 * size, 0, 0, size);
    add(a, new THREE.CylinderGeometry(0.02, 0.008, 0.14, 8), '#D21F2B', 0, -0.43 * size, 0, 0, size);
  };
  const box = (a, w, h, d, color, ribbon) => {   // a wrapped present
    add(a, new RoundedBoxGeometry(w, h, d, 2, 0.012), color, 0, h / 2);
    add(a, new THREE.BoxGeometry(w + 0.006, h + 0.006, 0.035), ribbon, 0, h / 2); add(a, new THREE.BoxGeometry(0.035, h + 0.006, d + 0.006), ribbon, 0, h / 2);
    for (const sx of [-1, 1]) add(a, new THREE.TorusGeometry(0.035, 0.011, 6, 12), ribbon, sx * 0.03, h + 0.025, 0, sx * 0.6, 1, 0, sx * 0.5);
  };
  const string = (list, A, B, sag, step, hang) => {   // a cord between two points on a wall, sagging; hang(i, point) per stop
    const a = new V3(...A), b = new V3(...B), len = a.distanceTo(b), n = Math.max(2, Math.round(len / step)), pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new V3().lerpVectors(a, b, t).add(new V3(0, -sag * 4 * t * (1 - t), 0.03))); }
    for (let i = 0; i < 24; i++) { const d = pts[i + 1].clone().sub(pts[i]), L = d.length(), c = new THREE.CylinderGeometry(0.006, 0.006, L, 5); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize())); c.translate(...pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5).toArray()); list.push([c, '#3A3A3A']); }
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; hang(i, new V3().lerpVectors(a, b, t).add(new V3(0, -sag * 4 * t * (1 - t), 0.035)), b.clone().sub(a).normalize()); }
  };
  const flag = (p, dir, color) => {   // a pennant hanging from the cord
    const g = new THREE.BufferGeometry(), w = 0.08, l = p.clone().addScaledVector(dir, -w), r = p.clone().addScaledVector(dir, w), d = p.clone().add(new V3(0, -0.21, 0));
    g.setAttribute('position', new THREE.Float32BufferAttribute([...l.toArray(), ...d.toArray(), ...r.toArray()], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0.5, 0, 1, 1], 2));
    flags.push([g, color]);
  };

  /* Halloween */
  if (SEASON === 'halloween') {
    group(centre, centreGlow, (a, b) => {   // pumpkins on a hay bale
      add(a, new RoundedBoxGeometry(0.95, 0.42, 0.56, 2, 0.07), '#D8B45C', 0, 0.21);
      for (const x of [-0.24, 0.24]) add(a, new THREE.BoxGeometry(0.03, 0.43, 0.57), '#8A6A3A', x, 0.215);
      for (let i = 0; i < 26; i++) add(a, new THREE.CylinderGeometry(0.004, 0.004, rand(0.06, 0.12), 3), '#E2C377', rand(-0.45, 0.45), 0.42, rand(-0.26, 0.26), rand(0, 3), 1, rand(-0.6, 0.6), rand(-0.6, 0.6));
      const p1 = [], p1b = []; pumpkin(p1, p1b, 1.45); for (const [g, c] of p1) a.push([g.translate(0.05, 0.42, 0), c]); for (const [g, c] of p1b) b.push([g.translate(0.05, 0.42, 0), c]);
      for (const [x, z, s, ry] of [[-0.62, 0.32, 1.0, 0.3], [0.62, 0.34, 0.72, -0.2], [0.2, 0.55, 0.55, 0.1]]) { const q = [], qb = []; pumpkin(q, qb, s); const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z); for (const [g, c] of q) a.push([g.applyMatrix4(m), c]); for (const [g, c] of qb) b.push([g.applyMatrix4(m), c]); }
    }, S.centre[0], 0, S.centre[1], toCamera);
    floorBlocks.push([S.centre[0], S.centre[1], 0.75]);
    for (const [x, z, s, y = 0] of S.floorPumpkins) { group(solid, glow, (a, b) => pumpkin(a, b, s), x, y, z, toCamera + rand(-0.3, 0.3)); if (!y) floorBlocks.push([x, z, 0.24 * s]); }
    if (S.counterPumpkin) group(solid, glow, (a, b) => pumpkin(a, b, 0.55), S.counterPumpkin[0], S.counterPumpkin[1], S.counterPumpkin[2], toCamera);
    if (S.candy) group(solid, glow, (a) => {   // a bowl of sweets at reception
      add(a, new THREE.LatheGeometry([[0.0, 0], [0.06, 0], [0.1, 0.04], [0.115, 0.08], [0.11, 0.085]].map(([x, y]) => new THREE.Vector2(x, y)), 20), '#E8742A');
      for (let i = 0; i < 12; i++) add(a, new THREE.SphereGeometry(0.022, 8, 6), ['#D64550', '#8C4FA8', '#F2B33D', '#6A8042', '#F4F1EA'][i % 5], rand(-0.06, 0.06), 0.08 + rand(0, 0.03), rand(-0.06, 0.06), 0, 1, 0, 0);
    }, S.candy[0], S.candy[1], S.candy[2]);
    const HC = ['#E8742A', '#2B2238', '#8C4FA8', '#F2B33D'];
    for (const [A, B] of S.strings) string(solid, A, B, 0.24, 0.27, (i, p, dir) => flag(p, dir, HC[i % HC.length]));
    // cobwebs: spokes and rings in the corners of the tall walls and a few windows
    const web = [];
    for (const W of S.webs) {
      const o = new V3(...W.o), u = new V3(...W.u).normalize(), v = new V3(...W.v).normalize(), K = 7, rings = [0.3, 0.52, 0.74, 0.94];
      const at = (k, f) => o.clone().addScaledVector(u, Math.cos((k / (K - 1)) * Math.PI / 2) * W.r * f).addScaledVector(v, Math.sin((k / (K - 1)) * Math.PI / 2) * W.r * f);
      for (let k = 0; k < K; k++) web.push(o, at(k, 1));
      for (const f of rings) for (let k = 0; k < K - 1; k++) { const a = at(k, f), b = at(k + 1, f), mid = a.clone().add(b).multiplyScalar(0.5).lerp(o, 0.08); web.push(a, mid, mid, b); }
    }
    const webG = new THREE.BufferGeometry().setFromPoints(web), webL = new THREE.LineSegments(webG, new THREE.LineBasicMaterial({ color: '#F2F2F2', transparent: true, opacity: 0.55 }));
    webL.userData.noMerge = true; scene.add(webL);
    // bats: one instanced body, two instanced wings; they loop over the lobby, the pantry and the dev floor
    const wing = new THREE.Shape(); [[0, 0.01], [0.04, 0.035], [0.1, 0.04], [0.16, 0.012], [0.135, -0.012], [0.11, 0.005], [0.085, -0.02], [0.06, 0.0], [0.03, -0.018], [0, -0.01]].forEach(([x, y], i) => (i ? wing.lineTo(x, y) : wing.moveTo(x, y)));
    const batM = new THREE.MeshStandardMaterial({ color: '#221E2A', roughness: 0.8, side: THREE.DoubleSide });
    const n = S.bats.length * 3;
    const body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8).scale(1, 0.85, 1.35), batM, n);
    const wingR = new THREE.InstancedMesh(new THREE.ShapeGeometry(wing).rotateX(Math.PI / 2), batM, n), wingL = new THREE.InstancedMesh(new THREE.ShapeGeometry(wing).rotateX(Math.PI / 2).scale(-1, 1, 1), batM, n);
    for (const m of [body, wingR, wingL]) { m.frustumCulled = false; m.userData.noMerge = true; m.castShadow = true; scene.add(m); }
    seasonFx.bats = { body, wingR, wingL, list: S.bats.flatMap(([x, y, z, r], k) => [0, 1, 2].map((j) => ({ x, y, z, r: r * (0.75 + j * 0.2), sp: (0.55 + j * 0.15) * (k % 2 ? -1 : 1), ph: j * 2.1 + k }))) };
    // a little ghost in the lobby
    const gp = []; for (let i = 0; i <= 14; i++) { const t = i / 14; gp.push(new THREE.Vector2(t < 0.85 ? 0.2 - 0.02 * t : 0.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2)) * 0.9 + 0.02, t * 0.46)); }
    const gg = new THREE.LatheGeometry(gp, 28), pp = gg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i); if (y < 0.06) pp.setY(i, y + Math.sin(Math.atan2(z, x) * 6) * 0.025); }
    gg.computeVertexNormals();
    const ghost = new THREE.Group(); ghost.position.set(...S.ghost); ghost.scale.setScalar(1.35); ghost.userData.noMerge = true; scene.add(ghost);
    const sheet = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#F7F7FB', roughness: 0.6, emissive: '#9FB4FF', emissiveIntensity: 0.12, transparent: true, opacity: 0.9 })); sheet.castShadow = true; ghost.add(sheet);
    const face = new THREE.MeshBasicMaterial({ color: '#1E1E26' });
    for (const sx of [-1, 1]) put(ghost, new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8).scale(0.8, 1.2, 0.5), face), sx * 0.06, 0.32, 0.18);
    put(ghost, new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(1, 1.3, 0.5), face), 0, 0.24, 0.19);
    seasonFx.ghost = { g: ghost, y: S.ghost[1] };
  }

  /* Christmas */
  if (SEASON === 'noel') {
    group(centre, centreGlow, (a, b) => {
      add(a, new THREE.CylinderGeometry(0.3, 0.25, 0.36, 22), '#B3263A', 0, 0.18); add(a, new THREE.CylinderGeometry(0.305, 0.305, 0.05, 22), '#E9B949', 0, 0.3);
      add(a, new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), '#5A3B26', 0, 0.45);
      const tiers = [[0.72, 0.75, 0.55], [0.58, 0.66, 0.95], [0.44, 0.56, 1.32], [0.3, 0.46, 1.66]];
      tiers.forEach(([r, h, y], i) => {
        const c = new THREE.ConeGeometry(r, h, 16, 2), p = c.attributes.position;
        for (let k = 0; k < p.count; k++) if (p.getY(k) < -h / 2 + 0.001) { const x = p.getX(k), z = p.getZ(k), j = 1 + (Math.round(Math.atan2(z, x) / (Math.PI / 8)) % 2 ? 0.09 : -0.04); p.setX(k, x * j); p.setZ(k, z * j); p.setY(k, -h / 2 - (j > 1 ? 0.04 : 0)); }
        c.computeVertexNormals(); add(a, c, i % 2 ? '#24683F' : '#1F5E3B', 0, y + h / 2);
      });
      const COL = ['#D7263D', '#E9B949', '#3F7CC4', '#F4F1EA', '#8C4FA8'];
      for (let i = 0; i < 28; i++) { const [r, h, y] = tiers[i % 4], f = rand(0.15, 0.85), ang = rand(0, Math.PI * 2), rr = r * (1 - f) + 0.03; add(a, new THREE.SphereGeometry(0.045, 10, 8), COL[i % COL.length], Math.cos(ang) * rr, y + h * f, Math.sin(ang) * rr); }
      for (let i = 0; i < 46; i++) { const t = i / 46, y = 0.6 + t * 1.45, r = 0.74 * (1 - t) + 0.06, ang = t * Math.PI * 9; add(b, new THREE.SphereGeometry(0.022, 8, 6), i % 3 ? '#FFD98A' : '#FFF4D6', Math.cos(ang) * r, y, Math.sin(ang) * r); }
      add(b, new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }), '#FFD24A', 0, 2.2, -0.01, 0, 2.2);
      for (const [x, z, w, h, d, c, rb, ry] of [[0.5, 0.35, 0.3, 0.24, 0.26, '#3F7CC4', '#F4F1EA', 0.3], [-0.45, 0.42, 0.26, 0.2, 0.26, '#D7263D', '#E9B949', -0.4], [0.05, 0.62, 0.22, 0.16, 0.2, '#2E7D4F', '#D7263D', 0.1], [-0.6, -0.1, 0.24, 0.3, 0.24, '#E9B949', '#B3263A', 0.6]]) {
        const q = []; box(q, w, h, d, c, rb); const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z); for (const [g, cc] of q) a.push([g.applyMatrix4(m), cc]);
      }
    }, S.centre[0], 0, S.centre[1], 0);
    floorBlocks.push([S.centre[0], S.centre[1], 0.8]);
    if (S.wreath) group(solid, glow, (a, b) => {
      add(a, new THREE.TorusGeometry(0.22, 0.07, 10, 28), '#1F5E3B', 0, 0, 0.04);
      for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2; add(a, new THREE.IcosahedronGeometry(0.045, 0), i % 2 ? '#2E7D4F' : '#24683F', Math.cos(ang) * 0.22, Math.sin(ang) * 0.22, 0.07, rand(0, 3), 1, rand(0, 3)); }
      for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2 + 0.3; add(b, new THREE.SphereGeometry(0.026, 8, 6), '#FF5A5A', Math.cos(ang) * 0.24, Math.sin(ang) * 0.24, 0.1); }
      for (const sx of [-1, 1]) add(a, new THREE.TorusGeometry(0.05, 0.018, 6, 14), '#C8283A', sx * 0.05, -0.2, 0.1, 0, 1, 0, sx * 0.6);
    }, S.wreath[0], S.wreath[1], S.wreath[2], S.wreath[3]);
    const NC = ['#C8283A', '#2E7D4F', '#E9B949', '#F4F1EA'];
    for (const [A, B] of S.strings) string(solid, A, B, 0.22, 0.27, (i, p, dir) => flag(p, dir, NC[i % NC.length]));
  }

  /* Tết */
  if (SEASON === 'tet') {
    group(centre, centreGlow, (a) => {   // a peach blossom tree in a blue-and-white pot, red envelopes in it
      add(a, new THREE.LatheGeometry([[0.0, 0], [0.24, 0], [0.32, 0.12], [0.34, 0.3], [0.3, 0.44], [0.32, 0.47], [0.28, 0.47]].map(([x, y]) => new THREE.Vector2(x, y)), 26), '#2E5FA3');
      for (const y of [0.1, 0.36]) add(a, new THREE.TorusGeometry(y < 0.2 ? 0.3 : 0.325, 0.012, 6, 30), '#F4F1EA', 0, y, 0, 0, 1, Math.PI / 2);
      add(a, new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), '#4A3527', 0, 0.45);
      const twigs = [];
      const branch = (from, dir, len, r, depth) => {
        const to = from.clone().addScaledVector(dir, len), c = new THREE.CylinderGeometry(r * 0.7, r, len, 6);
        c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir)); c.translate(...from.clone().add(to).multiplyScalar(0.5).toArray()); a.push([c, '#4A2E1F']);
        twigs.push([from, to]);
        if (depth <= 0) return;
        for (let k = 0; k < (depth > 1 ? 3 : 2); k++) { const d = dir.clone().add(new V3(rand(-0.75, 0.75), rand(0.15, 0.55), rand(-0.75, 0.75))).normalize(); branch(to, d, len * rand(0.55, 0.75), r * 0.62, depth - 1); }
      };
      for (const [dx, dz, len] of [[0.05, 0.02, 0.62], [0.42, -0.25, 0.5], [-0.38, 0.3, 0.52]]) branch(new V3(0, 0.45, 0), new V3(dx, 1, dz).normalize(), len, 0.045, 3);
      const PINK = ['#F7A8C4', '#FBD3E0', '#F28DB2', '#FFE3EC', '#E05A8A'];
      for (const [f, t] of twigs) for (let k = 0; k < 6; k++) { const p = f.clone().lerp(t, 0.3 + Math.random() * 0.75).add(new V3(rand(-0.07, 0.07), rand(-0.04, 0.06), rand(-0.07, 0.07))); add(a, new THREE.IcosahedronGeometry(rand(0.03, 0.045), 0), PINK[k % PINK.length], p.x, p.y, p.z, rand(0, 3), 1, rand(0, 3)); }
      for (let i = 0; i < 5; i++) { const [f, t] = twigs[3 + i * 3] || twigs[0], p = f.clone().lerp(t, 0.6); add(a, new THREE.BoxGeometry(0.05, 0.08, 0.008), '#D21F2B', p.x, p.y - 0.06, p.z, rand(-0.5, 0.5)); add(a, new THREE.BoxGeometry(0.03, 0.012, 0.009), '#E9B949', p.x, p.y - 0.04, p.z, rand(-0.5, 0.5)); }
    }, S.centre[0], 0, S.centre[1], 0, 1.15);
    floorBlocks.push([S.centre[0], S.centre[1], 0.4]);
    if (S.lounge) group(solid, glow, (a) => {   // a kumquat tree
      add(a, new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.26, 0.1], [0.27, 0.3], [0.24, 0.36], [0.26, 0.38], [0.22, 0.38]].map(([x, y]) => new THREE.Vector2(x, y)), 24), '#E9B949');
      add(a, new THREE.TorusGeometry(0.27, 0.015, 6, 28), '#C8283A', 0, 0.2, 0, 0, 1, Math.PI / 2);
      add(a, new THREE.CylinderGeometry(0.035, 0.05, 0.5, 8), '#5A3B26', 0, 0.6);
      for (const [x, y, z, r] of [[0, 1.05, 0, 0.36], [0.2, 0.92, 0.1, 0.26], [-0.18, 0.9, -0.08, 0.27], [0.05, 1.3, -0.05, 0.24]]) add(a, new THREE.IcosahedronGeometry(r, 1), '#2F6B3A', x, y, z, rand(0, 3), 1, rand(0, 3));
      for (let i = 0; i < 38; i++) { const u = rand(0, Math.PI * 2), v = rand(-0.4, 1.2), r = 0.38; add(a, new THREE.SphereGeometry(0.036, 8, 6), i % 7 ? '#F28C1E' : '#FFB347', Math.cos(u) * Math.cos(v) * r, 1.05 + Math.sin(v) * r * 0.9, Math.sin(u) * Math.cos(v) * r); }
      for (let i = 0; i < 4; i++) { const u = (i / 4) * Math.PI * 2 + 0.4; add(a, new THREE.BoxGeometry(0.05, 0.08, 0.008), '#D21F2B', Math.cos(u) * 0.36, 0.9, Math.sin(u) * 0.36, -u); }
    }, S.lounge[0], 0, S.lounge[1], 0);
    if (S.lounge) floorBlocks.push([S.lounge[0], S.lounge[1], 0.32]);
    // lanterns: a string of them in the pantry; over the meeting room screen, a pair either side of the banner
    const hangLantern = (x, y, z, s = 0.9) => { const q = []; lantern(q, s); for (const [g, c] of q) solid.push([g.translate(x, y, z), c]); };
    for (const [A, B] of S.strings.slice(S.banner ? 1 : 0)) string(solid, A, B, 0.2, 0.85, (i, p) => hangLantern(p.x, p.y, p.z + 0.08));
    if (S.banner) for (const sx of [-1, 1]) { const x = S.banner[0] + sx * 1.42, y = S.banner[1] + 0.34, z = S.banner[2] + 0.1; add(solid, new THREE.BoxGeometry(0.03, 0.03, 0.14), '#3A3A3A', x, y + 0.02, z - 0.04); hangLantern(x, y, z, 1.05); }
    // a red banner over the meeting room screen; couplets either side of the lift
    const texMat = (w, h, draw) => mat('#FFFFFF', { map: canvasTex(w, h, draw), roughness: 0.7 });
    const redGold = (g, w, h) => { g.fillStyle = '#B5161F'; g.fillRect(0, 0, w, h); g.strokeStyle = '#E9B949'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#F6CF57'; g.textAlign = 'center'; g.textBaseline = 'middle'; };
    if (S.banner) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.36), texMat(1024, 154, (g, w, h) => { redGold(g, w, h); g.font = '800 84px "Be Vietnam Pro", system-ui, sans-serif'; const text = tr('life.tet.banner'); fitText(g, text, w - 64); g.fillText(text, w / 2, h / 2 + 4); }));
      m.position.set(S.banner[0], S.banner[1], S.banner[2] + 0.01); m.rotation.y = S.banner[3]; m.userData.noMerge = true; scene.add(m);
    }
    if (S.scrolls && lift) for (const [sz, words] of [[-1, tr('life.tet.coupletLeft').split(' ')], [1, tr('life.tet.coupletRight').split(' ')]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.92), texMat(96, 440, (g, w, h) => { redGold(g, w, h); g.font = '700 30px "Be Vietnam Pro", system-ui, sans-serif'; for (const t of words) fitText(g, t, w - 2); const y0 = h / 2 - (words.length - 1) * 50; words.forEach((t, i) => g.fillText(t, w / 2, y0 + i * 100)); }));
      m.position.set(LIFT_FRONT + 0.01, 1.45, DZ + sz * 0.8); m.rotation.y = Math.PI / 2; m.userData.noMerge = true; scene.add(m);
    }
    for (const d of DESKS) { put(d.g, rbox(0.09, 0.006, 0.16, '#C8283A', 0.002), 0.27, 0.782, -0.26).rotation.y = 0.35; put(d.g, rbox(0.05, 0.007, 0.03, '#E9B949', 0.002), 0.27, 0.783, -0.26).rotation.y = 0.35; }
  }

  /* merge into a few meshes */
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true }); seasonFx.glowM = glowM;
  nightHooks.push((on) => glowM.color.setScalar(on ? 2.4 : 1));
  const flagM = mat('#FFFFFF', { roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }), solidM = mat('#FFFFFF', { roughness: 0.62, vertexColors: true });
  const make = (list, m, parent = scene) => { if (!list.length) return null; const mesh = new THREE.Mesh(shaded(list), m); mesh.castShadow = m !== glowM; mesh.receiveShadow = true; mesh.userData.noMerge = mesh.userData.noCollide = true; parent.add(mesh); return mesh; };
  make(solid, solidM); make(flags, flagM); make(glow, glowM);
  const cg = new THREE.Group(); cg.userData.noMerge = true; scene.add(cg);
  make(centre, solidM, cg); make(centreGlow, glowM, cg);
  seasonProp = cg.children.length ? cg : null;
}

export function setup() {
  SEASON_SPOT = PRO ? {
    centre: [5.8, 7.1], lounge: [13.35, 5.9],
    candy: [-6.8, 1.1, 1.9], counterPumpkin: [-7.45, 1.1, 1.85],
    floorPumpkins: [[-5.15, 4.95, 1.0], [-4.85, 4.6, 0.62], [12.55, 2.7, 0.9], [12.95, 3.2, 0.6], ...PODS.map(([cx, cz]) => [cx + 1.72, cz - 0.02, 0.5, 0.62])],
    strings: [[[-2.35, 3.3, -7.93], [2.75, 3.3, -7.93]], [[10.25, 3.22, -7.93], [13.85, 3.22, -7.93]]],
    ghost: [-6.6, 2.05, 5.05], bats: [[-5.6, 3.2, 3.3, 1.2], [11.3, 3.4, -3.8, 1.6], [2.5, 3.5, 3.6, 2.4]],
    wreath: [-2.05, 1.95, -7.93, 0], banner: [0.2, 2.9, -7.93, 0], scrolls: true,
    webs: [{ o: [-7.97, 4.17, -7.97], u: [1, -0.62, 0], v: [0, -0.62, 1], r: 0.95 }, { o: [12.1, 2.84, -7.93], u: [1, 0, 0], v: [0, -1, 0], r: 0.3 },
      { o: [8.33, 2.93, -7.93], u: [-1, 0, 0], v: [0, -1, 0], r: 0.34 }, { o: [-7.93, 2.93, 6.72], u: [0, 0, 1], v: [0, -1, 0], r: 0.26 }],
  } : {
    centre: [6.1, 4.55], lounge: null, candy: null, counterPumpkin: null,
    floorPumpkins: [[-7.2, 2.95, 0.9], [-6.85, 3.3, 0.6], [-0.75, -5.25, 0.8]],
    strings: [[[-1.6, 3.3, -5.93], [3.0, 3.3, -5.93]]], ghost: [-6.4, 2.0, 4.2], bats: [[-4, 3.2, 0, 1.6], [3, 3.3, -2, 2]],
    wreath: null, banner: null, scrolls: false,
    webs: [{ o: [-7.97, 4.17, -5.97], u: [1, -0.62, 0], v: [0, -0.62, 1], r: 0.9 }],
  };
  buildSeason();
}
