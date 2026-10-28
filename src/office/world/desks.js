// Desks and office chairs, and each person's coat and backpack at their desk.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HQ, PRO } from '../core/env.js';
import { DEPTS } from './layout.js';
import { scene } from '../scene/renderer.js';
import { cyl, lampBulbs, mat, put, rbox, toonMat } from '../scene/blocks.js';
import { BULB_OFF, metal, potPlant } from './terrace.js';
import { makeBedding } from '../people/bedding.js';
import { offTexture } from './screens.js';

/* desks; a session keeps its desk while it is open. Cozy: 9 desks in rows (3 x 3), everyone facing the room.
   Pro: three team pods of four, two desks facing two across a fabric screen (the front pair turned round).
   Headquarters: the same three pods, then two pods in each department room of the wing. */
const DESK_COLS = [-2.1, 0, 2.1], DESK_ROWS = [-1.6, 0.4, 2.4];
export let PODS;
export let TEAM_SIZE;
export let TEAMS;
// teams sit by unit: on the company floor a unit is one pod (4 desks); in a department room it is the room's two pods
// (8 desks). UNITS[u] = { desks: [desk indices], dept: index in DEPTS or -1 }; unitOfDesk[d] = u.
export let UNITS = [];
export let unitOfDesk = [];
export const DESKS = [];
// a point given in a desk's own frame (x across the desk, z toward its screen side), in the room
export const dLocal = (d, lx, lz) => { const c = Math.cos(d.ry), sn = Math.sin(d.ry); return [d.x + lx * c + lz * sn, d.z - lx * sn + lz * c]; };
export const screens = [], chairs = [];
export const CHAIR_IDLE = '#596170';
let deskTop;
let deskMat;
export function officeChair(parent, x, z, seatM) {
  const c = new THREE.Group(); c.position.set(x, 0, z); parent.add(c);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const leg = rbox(0.045, 0.035, 0.27, metal, 0.01); leg.position.set(Math.sin(a) * 0.13, 0.07, Math.cos(a) * 0.13); leg.rotation.y = a; c.add(leg);
    put(c, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), metal), Math.sin(a) * 0.26, 0.035, Math.cos(a) * 0.26);
  }
  put(c, cyl(0.032, 0.032, 0.32, metal, 8), 0, 0.25, 0);
  put(c, rbox(0.54, 0.09, 0.52, seatM, 0.045), 0, 0.445, 0);
  const pivot = new THREE.Group(); pivot.position.set(0, 0.5, -0.26); pivot.rotation.x = -0.1; c.add(pivot);   // reclines for a nap
  put(pivot, rbox(0.5, 0.56, 0.09, seatM, 0.045), 0, 0.3, 0);
  put(c, rbox(0.06, 0.3, 0.05, metal, 0.01), 0, 0.56, -0.25);
  c.userData.back = pivot;
  return c;
}
let monitorM;
let pedM;
/* a person's things while they work: the coat over the chair back (it reclines with the chair) and the backpack on the
   floor beside it. They come in wearing them and take them home; one mesh each, shown only for an occupied desk. */
export const COATS = ['#2F3B52', '#6B4F3A', '#46553F', '#7D2E3A', '#C2A97E', '#26292E', '#4F6D8F', '#8A8F98'];
export const BAGS = ['#2B2F36', '#3F7CC4', '#E8742A', '#5E7A3A', '#8C4FA8', '#A0A8B2', '#C8553D'];
// pieces -> one geometry with vertex colours: a number up to 1 is a grey shade (the material colour tints the whole),
// anything else a colour of its own
export function shaded(parts) {
  return mergeGeometries(parts.map(([geo, k]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    const [r, gg, b] = typeof k === 'number' && k <= 1 ? [k, k, k] : new THREE.Color(k).toArray(), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }), false);
}
let JACKET_GEO;
let BAG_GEO;
export let deskKit;
export function syncKit(i) {
  const k = DESKS[i].kit, w = deskKit[i];
  if (k.owner === w) return;
  k.owner = w; k.jacket.visible = k.bag.visible = !!w;
  if (w) { k.jm.color.set(w.cfg.coat || COATS[0]); k.bm.color.set(w.cfg.bag || BAGS[0]); }
}

export function setup() {
  PODS = PRO ? [[-0.1, 1.5], [5.1, 1.5], [2.5, 6.6], ...(HQ ? DEPTS.flatMap((d) => d.pods) : [])] : []; TEAM_SIZE = PRO ? 4 : DESK_COLS.length;
  const range = (a, n) => Array.from({ length: n }, (_, k) => a + k);
  // a team's area: half a pod on the open floor (the two desks face to face on its left or right side: a project with
  // more people takes the other half too), a whole department room on the headquarters' wing, a row in the small office
  UNITS = PRO ? [...[0, 1, 2].flatMap((p) => [[0, 2], [1, 3]].map((h) => ({ desks: h.map((k) => p * 4 + k), dept: -1, pod: p, side: h[0] ? 1 : -1 }))),
    ...(HQ ? DEPTS.map((_, i) => ({ desks: range(12 + i * 8, 8), dept: i })) : [])]
    : DESK_ROWS.map((_, r) => ({ desks: range(r * DESK_COLS.length, DESK_COLS.length), dept: -1 }));
  unitOfDesk = []; UNITS.forEach((u, i) => { for (const d of u.desks) unitOfDesk[d] = i; });
  TEAMS = UNITS.length;
  if (PRO) for (const [cx, cz] of PODS) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) DESKS.push({ x: cx + sx * 0.76, z: cz + sz * 0.375, ry: sz > 0 ? Math.PI : 0 });
  else for (const z of DESK_ROWS) for (const x of DESK_COLS) DESKS.push({ x, z, ry: 0 });
  deskTop = mat('#F4F0E8', { roughness: 0.45 }); deskMat = mat('#2C323C', { roughness: 0.8 });
  monitorM = mat('#1B1F26', { roughness: 0.4 }); pedM = mat('#D8D3CA', { roughness: 0.6 });
  DESKS.forEach((d, i) => {
    const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.ry; scene.add(g); d.g = g;
    put(g, rbox(1.5, 0.05, 0.74, deskTop, 0.02), 0, 0.75, 0);
    for (const sx of [-1, 1]) {
      put(g, rbox(0.05, 0.72, 0.05, metal, 0.01), sx * 0.68, 0.37, 0.3); put(g, rbox(0.05, 0.72, 0.05, metal, 0.01), sx * 0.68, 0.37, -0.3);
      put(g, rbox(0.05, 0.05, 0.64, metal, 0.01), sx * 0.68, 0.04, 0);
    }
    put(g, rbox(1.36, 0.3, 0.025, metal, 0.01), 0, 0.56, 0.33);
    put(g, rbox(0.95, 0.008, 0.42, deskMat, 0.004), 0, 0.778, -0.08);
    put(g, rbox(0.56, 0.03, 0.38, mat('#C9CED6', { metalness: 0.5, roughness: 0.35 }), 0.012), 0, 0.795, -0.04);
    const lid = new THREE.Group(); lid.position.set(0, 0.81, 0.15); lid.rotation.x = 0.28; g.add(lid);
    put(lid, rbox(0.56, 0.38, 0.025, mat('#C9CED6', { metalness: 0.5, roughness: 0.35 }), 0.012), 0, 0.19, 0);
    const scr = toonMat({ color: '#FFFFFF', map: offTexture(), emissive: '#FFFFFF', emissiveMap: offTexture(), emissiveIntensity: 0.05, roughness: 0.3 });
    put(lid, new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), scr), 0, 0.19, -0.014).rotation.y = Math.PI;
    put(lid, new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), new THREE.MeshBasicMaterial({ color: '#F7F3EA' })), 0, 0.2, 0.014);
    screens.push(scr);
    put(g, cyl(0.055, 0.05, 0.11, '#FFFFFF'), 0.52, 0.83, 0.16);
    if (PRO) {   // office desk: a second screen on the left corner, drawers under the desk
      const mon = new THREE.Group(); mon.position.set(-0.5, 0.775, 0.2); mon.rotation.y = 0.45; g.add(mon);
      put(mon, rbox(0.2, 0.02, 0.14, metal, 0.01), 0, 0.01, 0); put(mon, rbox(0.04, 0.24, 0.03, metal, 0.01), 0, 0.13, 0.02);
      put(mon, rbox(0.5, 0.31, 0.03, monitorM, 0.012), 0, 0.33, 0);
      put(mon, new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.27), scr), 0, 0.33, -0.017).rotation.y = Math.PI;
      put(g, rbox(0.4, 0.58, 0.55, pedM, 0.02), 0.45, 0.29, 0.04);
      for (const y of [0.18, 0.36, 0.52]) put(g, rbox(0.1, 0.015, 0.02, metal, 0.004), 0.45, y, -0.24);
    } else if (i % 3 === 0) potPlant(-0.58, -0.18, 0.32, i % 2 ? 'snake' : 'bush', 0.775, g);
    else put(g, rbox(0.26, 0.03, 0.33, '#FBFBF7', 0.01), -0.52, 0.79, 0.08).rotation.y = 0.2;
    if (i % 3 === 2) {
      put(g, cyl(0.08, 0.09, 0.03, metal, 12), 0.6, 0.79, -0.2);
      put(g, cyl(0.015, 0.015, 0.34, metal, 6), 0.6, 0.96, -0.2);
      put(g, new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 16, 1, true), mat('#2B2F36', { side: THREE.DoubleSide })), 0.6, 1.15, -0.2);
      const bm = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); lampBulbs.push(bm);
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bm), 0.6, 1.09, -0.2);
    }
    const chairM = mat(CHAIR_IDLE, { roughness: 0.9 }); chairs.push(chairM);
    d.chair = officeChair(g, 0, -0.66, chairM);
    d.bed = makeBedding(d.chair);
  });
  JACKET_GEO = shaded([   // chair-back space: the backrest is 0.5 x 0.56 x 0.09, its top at y 0.58
    [new RoundedBoxGeometry(0.5, 0.44, 0.03, 2, 0.012).translate(0, 0.35, -0.066), 1],
    [new THREE.CylinderGeometry(0.05, 0.05, 0.5, 14).rotateZ(Math.PI / 2).translate(0, 0.585, -0.012), 1],
    [new THREE.CylinderGeometry(0.056, 0.056, 0.2, 12).rotateZ(Math.PI / 2).translate(0, 0.592, -0.018), 0.68],
    ...[-1, 1].flatMap((sx) => [
      [new THREE.CapsuleGeometry(0.038, 0.3, 4, 10).rotateZ(sx * 0.1).translate(sx * 0.215, 0.33, -0.088), 0.94],
      [new THREE.CylinderGeometry(0.041, 0.041, 0.04, 10).translate(sx * 0.232, 0.13, -0.088), 0.68],
    ]),
  ]);
  BAG_GEO = shaded([      // standing on the floor, its back toward -z
    [new RoundedBoxGeometry(0.3, 0.38, 0.15, 3, 0.05).translate(0, 0.19, 0), 1],
    [new RoundedBoxGeometry(0.22, 0.15, 0.05, 2, 0.02).translate(0, 0.12, 0.085), 1],
    [new THREE.BoxGeometry(0.23, 0.01, 0.01).translate(0, 0.21, 0.111), 0.55],
    [new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI).translate(0, 0.375, 0), 0.55],
    ...[-1, 1].map((sx) => [new RoundedBoxGeometry(0.045, 0.3, 0.02, 1, 0.008).translate(sx * 0.08, 0.2, -0.083), 0.55]),
  ]);
  deskKit = DESKS.map(() => null);   // desk -> the worker whose things are there
  DESKS.forEach((d) => {
    const jm = mat('#FFFFFF', { roughness: 0.86, vertexColors: true }), bm = mat('#FFFFFF', { roughness: 0.7, vertexColors: true });
    const jacket = new THREE.Mesh(JACKET_GEO, jm); jacket.castShadow = true; jacket.visible = false; jacket.userData.noMerge = true; d.chair.userData.back.add(jacket);
    const bag = new THREE.Mesh(BAG_GEO, bm); bag.castShadow = true; bag.visible = false; bag.userData.noMerge = true;
    bag.position.set(-0.52, 0, -0.56); bag.rotation.set(-0.06, 0.4, 0); d.g.add(bag);
    d.kit = { jacket, bag, jm, bm, owner: null };
    // the mess: one merged mesh per level, shown as the repository's uncommitted files pile up
    d.mess = messGeo().map((geo) => { const m = new THREE.Mesh(geo, messM()); m.visible = false; m.castShadow = true; m.userData.noMerge = m.userData.noCollide = true; d.g.add(m); return m; });
    d.messLevel = 0;
  });
}

/* ---------- the mess on a desk follows the git repository it works in: the more files changed and not yet committed,
   the more paper, cups and crumpled notes (on the floor too, past 15). A commit tidies it. ---------- */
const MESS_AT = [1, 6, 16, 41];   // uncommitted files where each level starts
let messGeos = null, messMat = null;
const messM = () => (messMat ||= mat('#FFFFFF', { roughness: 0.85, vertexColors: true }));
function messGeo() {
  if (messGeos) return messGeos;
  // each piece a little bigger than life, so the mess reads from the default camera
  const P = '#FBFBF7', C = '#EDEAE2', piece = (geo, color, x, y, z, ry = 0, rx = 0) => [geo.scale(1.25, 1.25, 1.25).rotateX(rx).rotateY(ry).translate(x, y, z), color];
  const sheet = () => new THREE.BoxGeometry(0.21, 0.003, 0.29), ball = (r = 0.035) => new THREE.IcosahedronGeometry(r, 0);
  const cup = (x, z) => [piece(new THREE.CylinderGeometry(0.036, 0.028, 0.11, 14), '#C8A27C', x, 0.835, z), piece(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 14), '#3B3B3B', x, 0.896, z)];
  const levels = [
    [piece(sheet(), P, -0.45, 0.779, -0.17, 0.35), piece(new THREE.BoxGeometry(0.07, 0.002, 0.07), '#FFE787', 0.33, 0.779, -0.3, 0.2), piece(new THREE.BoxGeometry(0.07, 0.002, 0.07), '#FFB3C7', 0.4, 0.779, -0.2, -0.3)],
    [piece(new THREE.BoxGeometry(0.21, 0.014, 0.29), '#F2F0E8', -0.63, 0.784, 0.04, -0.15), piece(sheet(), P, -0.62, 0.793, 0.05, 0.1), piece(ball(), C, 0.24, 0.81, -0.31), ...cup(-0.24, -0.29)],
    [piece(ball(0.04), C, 0.36, 0.035, -0.78), piece(ball(0.04), C, 0.52, 0.035, -0.6), piece(ball(0.038), C, -0.32, 0.035, -0.92),
      piece(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12), '#2EC4B6', 0.17, 0.83, 0.12), piece(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12), '#E63946', 0.08, 0.83, 0.21),
      piece(new THREE.BoxGeometry(0.16, 0.012, 0.22), '#3F7CC4', -0.66, 0.79, -0.24, 0.15, 0.08), piece(new THREE.BoxGeometry(0.15, 0.008, 0.21), P, -0.66, 0.8, -0.24, 0.15, 0.08)],
    [piece(sheet(), P, 0.2, 0.002, -0.98, 0.7), piece(sheet(), P, -0.46, 0.002, -0.76, -0.4), piece(sheet(), P, 0.58, 0.002, -0.92, 1.1), piece(sheet(), P, -0.1, 0.002, -1.12, -1.2),
      piece(ball(0.04), C, 0.05, 0.035, -1.08), piece(ball(0.045), C, -0.62, 0.04, -1.02), piece(ball(0.035), C, 0.7, 0.03, -0.7),
      piece(new THREE.BoxGeometry(0.21, 0.05, 0.29), '#F2F0E8', -0.65, 0.81, -0.27, 0.3), ...cup(0.3, 0.2), piece(ball(0.035), C, 0.12, 0.81, -0.33), piece(ball(0.03), C, 0.03, 0.805, -0.27),
      piece(new THREE.BoxGeometry(0.36, 0.045, 0.36), '#D9A066', 0.75, 0.023, -0.45, 0.3), piece(new THREE.BoxGeometry(0.2, 0.004, 0.06), '#C8553D', 0.75, 0.047, -0.45, 0.3)],
  ];
  return (messGeos = levels.map((parts) => shaded(parts)));
}
// level 0–4 for a number of uncommitted files
const messLevel = (dirty) => MESS_AT.filter((n) => (dirty || 0) >= n).length;
export function syncMess(i, dirty) {
  const d = DESKS[i], lv = messLevel(dirty);
  if (d.messLevel === lv) return;
  d.messLevel = lv; d.mess.forEach((m, k) => { m.visible = k < lv; });
}
