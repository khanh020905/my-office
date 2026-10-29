// The walking graph, desk spots and stations people go to.
import { HQ, PRO, V2, randInt } from '../core/env.js';
import { DEPTS, inside } from '../world/layout.js';
import { DZ, LIFT_X } from '../world/entrance.js';
import { DESKS, PODS, TEAM_SIZE, dLocal } from '../world/desks.js';
import { MEET, MEET_SEATS } from '../world/furniture/meeting.js';
import { npcs, subs, workers } from './workers.js';
import { blocked, buildGrid, fp } from '../interact/first-person.js';

/* ---------- walking graph ----------
   People walk node to node, then straight to their spot; every edge is clear of furniture and walls, and rooms are
   entered through their doors. */
// pro: around each pod, a walkway behind each pair of chairs (pods A and B share their aisles)
const podAisle = (p, front) => PODS[p][1] + (front ? 1.8 : -1.8);
let podNodes;
export let NODES;
let EDGES;
export const ADJ = {};
// shortest walk (by distance) between two nodes
// floor just mopped (people/staff.js): {ax, az, bx, bz} strips; a way round costs less than walking across one
export const wet = [];
const offStrip = (x, z, w) => { const dx = w.bx - w.ax, dz = w.bz - w.az, k = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - w.ax - dx * k, z - w.az - dz * k); };
function wetCost(a, b) {
  if (!wet.length) return 0;
  const [ax, az] = NODES[a], [bx, bz] = NODES[b];
  for (const w of wet) for (let i = 0; i <= 4; i++) if (offStrip(ax + ((bx - ax) * i) / 4, az + ((bz - az) * i) / 4, w) < 0.6) return 30;
  return 0;
}
export function route(a, b) {
  if (a === b) return [a];
  const dist = { [a]: 0 }, prev = { [a]: null }, open = new Set([a]);
  while (open.size) {
    let n = null; for (const k of open) if (n === null || dist[k] < dist[n]) n = k;
    open.delete(n); if (n === b) break;
    for (const m of ADJ[n] || []) {
      const d = dist[n] + Math.hypot(NODES[m][0] - NODES[n][0], NODES[m][1] - NODES[n][1]) + wetCost(n, m);
      if (!(m in dist) || d < dist[m]) { dist[m] = d; prev[m] = n; open.add(m); }
    }
  }
  if (!(b in prev)) return [a, b];
  const out = []; let n = b; while (n) { out.unshift(n); n = prev[n]; } return out;
}
export function nearestNode(p) { let best = PRO ? 'L2' : 'L', bd = Infinity; for (const [k, [x, z]] of Object.entries(NODES)) { const d = Math.hypot(p.x - x, p.y - z); if (d < bd) { bd = d; best = k; } } return best; }
export const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const ROW_NODES = [['T0', 'T1', 'T2'], ['U0', 'U1', 'U2'], ['V0', 'V1', 'V2']];
export let DESK_SPOTS;
export const spotAt = (x, z, face, node, sit = false, extra = {}) => ({ x, z, face, node, sit, by: null, ...extra });
let DINING;
export let STATIONS;
// four chairs, then people stand around the table facing it: four between the chairs, eight a step further out
function meetStanding() {
  const out = [];
  for (const [r, n, a0] of [[1.95, 4, Math.PI / 4], [2.6, 8, Math.PI / 8]]) for (let k = 0; k < n; k++) {
    const a = a0 + (k * 2 * Math.PI) / n, x = MEET.x + Math.sin(a) * r, z = MEET.z + Math.cos(a) * r;
    if (x > 7.5 || x < 3.0 || z > 5.4 || z < -0.6) continue;
    out.push({ x, z, face: Math.atan2(MEET.x - x, MEET.z - z), node: z > MEET.z ? 'M' : x > MEET.x ? 'P' : 'GR2', sit: false, by: null });
  }
  return out;
}
/* headquarters' wing: corridor A along the core (z 9.9), corridor B down the middle (x 3.3), and in each department
   room a door, a lane between its two pods and the aisles behind each row of chairs. Pod p's aisle nodes are P{p}b0…. */
function wingGraph() {
  const nodes = { HAL: [-2.4, 9.9], HB0: [3.3, 9.9], HAR: [7.4, 9.9], HB1: [3.3, 22.2] };
  const edges = [['L4', 'HAL'], ['R4', 'HAR'], ['HAL', 'HB0'], ['HB0', 'HAR'], ['HB0', 'HB1']];
  DEPTS.forEach((d, i) => {
    const pl = 3 + i * 2, pr = pl + 1, zb = d.cz - 1.8, zf = d.cz + 1.8, lane = d.door.side === 'n' ? d.door.at : d.cx;
    nodes[`D${i}b`] = [lane, zb]; nodes[`D${i}f`] = [lane, zf];
    edges.push([`D${i}b`, `D${i}f`], [`D${i}b`, `P${pl}b1`], [`P${pl}b1`, `P${pl}b0`], [`D${i}b`, `P${pr}b0`], [`P${pr}b0`, `P${pr}b1`],
      [`D${i}f`, `P${pl}f1`], [`P${pl}f1`, `P${pl}f0`], [`D${i}f`, `P${pr}f0`], [`P${pr}f0`, `P${pr}f1`]);
    if (d.door.side === 'n') {   // through the room's back wall from corridor A, into the lane
      nodes[`D${i}i`] = [lane, d.z0 + 1.0];
      if (lane !== -2.4) { nodes[`HA${i}`] = [lane, 9.9]; edges.push(['HAR', `HA${i}`], [`HA${i}`, `D${i}i`]); } else edges.push(['HAL', `D${i}i`]);
      edges.push([`D${i}i`, `D${i}b`]);
    } else {                     // from corridor B through a side wall, then along that wall to both aisles
      const x = d.door.side === 'e' ? d.x1 - 0.4 : d.x0 + 0.5, near = d.door.side === 'e' ? pr : pl, k = d.door.side === 'e' ? 1 : 0;
      nodes[`D${i}i`] = [x, d.door.at]; nodes[`D${i}sb`] = [x, zb]; nodes[`D${i}sf`] = [x, zf];
      edges.push(['HB1', `D${i}i`], [`D${i}i`, `D${i}sb`], [`D${i}i`, `D${i}sf`], [`D${i}sb`, `P${near}b${k}`], [`D${i}sf`, `P${near}f${k}`]);
    }
  });
  return { nodes, edges };
}
/* Places to stand within arm's reach of something (a lamp, the printer). The floor is searched in 10 cm cells kept 20 cm
   clear of furniture, from the spots around the thing outward, and the cell path is pulled tight into a few straight
   legs (via), so someone can squeeze behind a desk into a corner:
     wayTo(w, x, z)   the way from where w is (seated: from beside the chair), walked straight there and back
     standBy(x, z)    the way from the nearest node of the walking graph, for anyone (kept: things don't move)
   front: stand only on that side of it ([nx, nz], a switch on a wall). Both null when out of reach. */
const clearLine = (x0, z0, x1, z1, r = 0.18) => {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1);
  for (let i = 1; i < n; i++) if (blocked(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, r)) return false;
  return true;
};
const C = 0.1, R = 120, W = 2 * R + 1;   // a 24 m square around the thing
function search(x, z, goal, front, reach = [0.55, 0.7, 0.85]) {
  if (!fp.grid) fp.grid = buildGrid();
  const ox = x - R * C, oz = z - R * C;
  const cx = (c) => ox + (c % W) * C, cz = (c) => oz + Math.floor(c / W) * C, cell = (px, pz) => Math.round((pz - oz) / C) * W + Math.round((px - ox) / C);
  const ok = (px, pz) => inside(px, pz, 0.3) && !blocked(px, pz, 0.2);
  const from = new Int32Array(W * W).fill(-1), q = [], at = new Map();   // root cell -> where to stand exactly
  for (const r of reach) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, c = cell(px, pz);
    if (front && (px - x) * front[0] + (pz - z) * front[1] < 0.3) continue;
    if (from[c] < 0 && ok(px, pz) && !blocked(px, pz, 0.25)) { from[c] = c; q.push(c); at.set(c, [px, pz]); }
  }
  const targets = new Map();   // cell -> [label, x, z]: close enough to step onto the goal from
  for (const [label, gx, gz, rad] of goal) {
    if (Math.abs(gx - x) > R * C - 1 || Math.abs(gz - z) > R * C - 1) continue;
    const k = Math.ceil(rad / C);
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) if ((di * di + dj * dj) * C * C <= rad * rad) targets.set(cell(gx, gz) + dj * W + di, [label, gx, gz]);
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (targets.has(c)) {
      const [label, gx, gz] = targets.get(c), pts = [[gx, gz]];
      let k = c; for (; from[k] !== k; k = from[k]) pts.push([cx(k), cz(k)]);
      pts.push([cx(k), cz(k)]);
      const [sx, sz] = at.get(k); pts[pts.length - 1] = [sx, sz];
      const via = []; let i = 0;   // from each corner, straight to the farthest point still in view
      while (i < pts.length - 1) {
        let j = pts.length - 1; while (j > i + 1 && !clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
        if (j < pts.length - 1) via.push(pts[j]);
        i = j;
      }
      return { x: sx, z: sz, face: faceTo(sx, sz, x, z), label, via };
    }
    const i = c % W, j = Math.floor(c / W);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj, n = nj * W + ni;
      if (ni < 0 || nj < 0 || ni >= W || nj >= W || from[n] >= 0 || !ok(cx(n), cz(n))) continue;
      from[n] = c; q.push(n);
    }
  }
  return null;
}
export function wayTo(w, x, z, front) {
  const f = search(x, z, [['me', w.pos.x, w.pos.y, w.pose === 'sit' ? 0.65 : 0.3]], front);
  return f && { x: f.x, z: f.z, face: f.face, node: nearestNode(new V2(f.x, f.z)), sit: false, direct: true, via: f.via, origin: w.spot };
}
const standCache = new Map();
export function standBy(x, z, front) {
  const key = `${x.toFixed(2)},${z.toFixed(2)},${front || ''}`;
  if (!standCache.has(key)) {
    const f = search(x, z, Object.entries(NODES).map(([n, [nx, nz]]) => [n, nx, nz, 0.35]), front);
    standCache.set(key, f && { x: f.x, z: f.z, face: f.face, node: f.label, sit: false, ...(f.via.length ? { via: f.via } : {}) });
  }
  return standCache.get(key);
}
export let DOOR_IN;
export let DOOR_OUT;
// A free spot at the station; when every spot is taken, a place to wait a step back toward the room, at least 0.95 m
// from everyone (two people never share a spot: their heads would merge).
/* a station's place for w: their own, or a free one. All taken: a clear spot in the same room (its nearest path node is
   one of the station's own, on floor the walking grid says is clear, about a metre from anyone), nearest the station
   first, facing it. `orNull`: when the room is full that gives null, and the caller has it done from the desk instead
   (a crowd round the server racks, someone pushed through the glass into the next room: never). */
export function allocate(name, w, orNull = false) {
  const list = STATIONS[name], mine = list.find((s) => s.by === w) || list.find((s) => !s.by);
  if (mine) return mine;
  const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cz = list.reduce((a, s) => a + s.z, 0) / list.length;
  const others = [...workers.values(), ...subs.values(), ...npcs].filter((o) => o !== w).map((o) => (o.spot ? [o.spot.x, o.spot.z] : [o.pos.x, o.pos.y]));
  if (!fp.grid) fp.grid = buildGrid();   // (the furniture and the walls, once)
  const rooms = new Set(list.map((s) => s.node)), P = new V2(), cand = [];
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) cand.push([cx + i * 0.55, cz + j * 0.55, Math.hypot(i, j)]);
  cand.sort((a, b) => a[2] - b[2]);
  let best = null, room = -1;   // (if nowhere is quite clear: the free-est place found)
  for (const [x, z] of cand) {
    if (!inside(x, z) || blocked(x, z, 0.32) || list.some((s) => Math.hypot(s.x - x, s.z - z) < 0.75)) continue;
    const node = nearestNode(P.set(x, z));
    if (!rooms.has(node)) continue;   // (another room)
    const near = Math.min(Infinity, ...others.map(([ox, oz]) => Math.hypot(ox - x, oz - z)));
    const spot = { x, z, face: Math.atan2(cx - x, cz - z), node };
    if (near >= 0.9) return spot;
    if (near > room) { room = near; best = spot; }
  }
  if (orNull) return null;
  return best && room > 0.6 ? best : list[randInt(0, list.length - 1)];
}

export function setup() {
  podNodes = PRO ? Object.fromEntries(PODS.flatMap(([cx], p) => [0, 1].flatMap((k) => [[`P${p}b${k}`, [cx + (k ? 0.76 : -0.76), podAisle(p, false)]], [`P${p}f${k}`, [cx + (k ? 0.76 : -0.76), podAisle(p, true)]]]))) : {};
  NODES = PRO ? {
    O: [-7.5, 3.3], I: [-6.3, 3.3], LB: [-5.0, 3.3], SVo: [-3.1, -1.55], SVi: [-4.2, -1.55], WCo: [-4.9, 4.7], WCi: [-4.9, 6.2],
    ST1: [-6.05, 6.1], ST2: [-6.05, 7.4], WCs: [-6.05, 8.5],
    L0: [-3.1, -2.3], DRi: [-3.1, -3.9], DRc: [-5.4, -3.9], DRs: [-3.85, -6.7], DRw: [-4.05, -4.45],   // (DRw: round the accountant's desk, people/accountant.js)
    MTd: [2.35, -2.3], MTi: [2.35, -3.75], MF2: [1.35, -3.75], MF1: [0.2, -3.75], MF0: [-0.95, -3.75], MTf: [-2.05, -3.75],
    MTw: [-2.05, -7.45], MB0: [-0.95, -7.45], MB1: [0.2, -7.45], MB2: [1.35, -7.45], MTb: [2.5, -7.45],
    LBd: [3.8, -2.3], LBi: [3.8, -3.8], LBf: [6.25, -3.45], LBm: [4.6, -5.6], CE: [7.4, -2.3],
    L1: [-2.4, -0.3], L2: [-2.4, 3.3], L3: [-2.4, 4.8], L4: [-2.4, 8.4], R1: [7.4, -0.3], R2: [7.4, 3.3], R3: [7.4, 4.8], R4: [7.4, 8.4],
    M1: [2.5, -0.3], M2: [2.5, 3.3], ...podNodes, ...(HQ ? wingGraph().nodes : {}),
    PA1: [9.3, -2.6], PA2: [9.3, -6.15], PA3: [11.7, -2.6], PA4: [11.7, -6.15], PA5: [9.3, 0.45], PA6: [11.7, 0.45],
    LG1: [9.3, 1.6], LG2: [12.2, 1.5], LGs: [9.5, 3.7], LGr: [12.75, 3.9], LG3: [9.0, 6.0],
  } : {
    A: [-5.2, -3.3], BL: [-3.4, -3.15], T0: [-2.1, -3.15], T1: [0, -3.2], T2: [2.1, -3.15], D: [3.4, -3.1], E: [5.6, -3.2],
    F: [-6.3, -0.9], GL1: [-3.4, -0.9], U0: [-2.1, -0.9], U1: [0, -0.9], U2: [2.1, -0.9], GR1: [3.4, -0.9], P: [6.9, 0.6],
    I: [-6.5, 1.5], GL2: [-3.4, 1.1], V0: [-2.1, 1.1], V1: [0, 1.1], V2: [2.1, 1.1], GR2: [3.4, 1.1],
    J: [-5.5, 3.6], K: [-3.4, 3.6], L: [0, 3.7], M: [3.0, 4.1],
  };
  EDGES = PRO ? [['O', 'I'], ['I', 'LB'], ['L0', 'SVo'], ['L1', 'SVo'], ['SVo', 'SVi'], ['LB', 'WCo'], ['WCo', 'WCi'], ['WCi', 'ST1'], ['WCi', 'ST2'], ['WCi', 'WCs'], ['ST1', 'ST2'],
    ['LB', 'L2'], ['L0', 'L1'], ['L1', 'L2'], ['L2', 'L3'], ['L3', 'L4'], ['R1', 'R2'], ['R2', 'R3'], ['R3', 'R4'], ['M1', 'M2'],
    ['L1', 'P0b0'], ['P0b0', 'P0b1'], ['P0b1', 'M1'], ['M1', 'P1b0'], ['P1b0', 'P1b1'], ['P1b1', 'R1'],
    ['L2', 'P0f0'], ['P0f0', 'P0f1'], ['P0f1', 'M2'], ['M2', 'P1f0'], ['P1f0', 'P1f1'], ['P1f1', 'R2'],
    ['L3', 'P2b0'], ['P2b0', 'P2b1'], ['P2b1', 'R3'], ['L4', 'P2f0'], ['P2f0', 'P2f1'], ['P2f1', 'R4'],
    ['L0', 'DRi'], ['DRi', 'DRc'], ['DRi', 'DRw'], ['DRw', 'DRs'], ['L0', 'MTd'], ['MTd', 'MTi'], ['MTi', 'MF2'], ['MF2', 'MF1'], ['MF1', 'MF0'], ['MF0', 'MTf'], ['MTf', 'MTw'],
    ['MTw', 'MB0'], ['MB0', 'MB1'], ['MB1', 'MB2'], ['MB2', 'MTb'], ['MTb', 'MTi'], ['MTd', 'LBd'], ['LBd', 'LBi'], ['LBi', 'LBf'], ['LBi', 'LBm'], ['LBd', 'CE'], ['CE', 'R1'],
    ['CE', 'PA1'], ['PA1', 'PA2'], ['PA1', 'PA3'], ['PA2', 'PA4'], ['PA3', 'PA4'], ['PA1', 'PA5'], ['PA3', 'PA6'], ['PA5', 'PA6'],
    ['PA5', 'LG1'], ['LG1', 'LG2'], ['LG1', 'LGs'], ['LGs', 'LG3'], ['LG3', 'R3'], ['LG2', 'LGr'], ...(HQ ? wingGraph().edges : [])]
    : [['A', 'BL'], ['BL', 'T0'], ['T0', 'T1'], ['T1', 'T2'], ['T2', 'D'], ['D', 'E'], ['A', 'F'], ['F', 'I'], ['F', 'GL1'], ['BL', 'GL1'],
    ['GL1', 'U0'], ['U0', 'U1'], ['U1', 'U2'], ['U2', 'GR1'], ['GR1', 'D'], ['GL1', 'GL2'], ['I', 'GL2'], ['GL2', 'V0'], ['V0', 'V1'], ['V1', 'V2'],
    ['V2', 'GR2'], ['GR1', 'GR2'], ['GR1', 'P'], ['P', 'E'], ['I', 'J'], ['J', 'K'], ['K', 'GL2'], ['K', 'L'], ['L', 'M'], ['M', 'GR2']];
  for (const [a, b] of EDGES) { (ADJ[a] ||= []).push(b); (ADJ[b] ||= []).push(a); }
  // the chair of each desk (0.66 m from the desk, on its own side), walked to from the aisle right behind it
  DESK_SPOTS = DESKS.map((d, i) => {
    const [x, z] = dLocal(d, 0, -0.66);
    if (!PRO) return { x, z, face: 0, node: ROW_NODES[Math.floor(i / 3)][i % 3], sit: true };
    const p = Math.floor(i / TEAM_SIZE), k = i % TEAM_SIZE;
    return { x, z, face: d.ry, node: `P${p}${k < 2 ? 'b' : 'f'}${k % 2}`, sit: true };
  });
  // the pantry's dining seats: four tables, chairs on the long sides facing the table, each walked to from the nearest aisle
  DINING = PRO ? [[10.4, -4.9], [12.8, -4.9], [10.4, -0.9], [12.8, -0.9]].flatMap(([tx, tz], ti) => [-1, 1].flatMap((sz) => [-1, 1].map((sx) => {
    const x = tx + sx * 0.33, z = tz + sz * 0.62, near = x < 11.05 ? 0 : 1;
    const node = sz < 0 ? (ti < 2 ? ['PA2', 'PA4'] : ['PA1', 'PA3'])[near] : (ti < 2 ? ['PA1', 'PA3'] : ['PA5', 'PA6'])[near];
    return spotAt(x, z, sz < 0 ? 0 : Math.PI, node, true);
  }))) : [];
  STATIONS = PRO ? {
    library: [spotAt(5.6, -4.1, 0, 'LBf', true), spotAt(6.9, -4.1, 0, 'LBf', true), spotAt(4.0, -6.95, Math.PI, 'LBm'), spotAt(5.0, -6.95, Math.PI, 'LBm'), spotAt(6.0, -6.95, Math.PI, 'LBm')],
    board: [spotAt(-2.75, 6.55, -Math.PI / 2, 'L3'), spotAt(-2.75, 7.95, -Math.PI / 2, 'L4')],
    globe: [spotAt(7.1, -6.2, faceTo(7.1, -6.2, 8.0, -6.55), 'LBm'), spotAt(7.6, -5.3, faceTo(7.6, -5.3, 8.0, -6.55), 'LBm')],
    server: [spotAt(-6.55, -2.52, -Math.PI / 2, 'SVi'), spotAt(-6.55, -1.47, -Math.PI / 2, 'SVi'), spotAt(-6.55, -0.42, -Math.PI / 2, 'SVi')],
    coffee: [spotAt(10.5, 3.15, 0, 'LGs', true), spotAt(11.5, 3.15, 0, 'LGr', true), ...DINING, spotAt(11.45, -6.75, Math.PI, 'PA4'), spotAt(10.35, -6.75, Math.PI, 'PA2')],
    meeting: [...MEET_SEATS, spotAt(2.55, -4.7, -Math.PI / 2, 'MTi'), spotAt(2.6, -5.6, -Math.PI / 2, 'MTb'), spotAt(2.55, -6.5, -Math.PI / 2, 'MTb'), spotAt(-2.2, -6.6, Math.PI / 2, 'MTw'),
      spotAt(-2.2, -4.5, Math.PI / 2, 'MTf')],
    director: [spotAt(-5.95, -4.95, Math.PI, 'DRc', true), spotAt(-4.85, -4.95, Math.PI, 'DRc', true)],
    brief: [spotAt(-1.75, -7.2, faceTo(-1.75, -7.2, 0.2, -5.6), 'MTw'), spotAt(2.35, -6.9, faceTo(2.35, -6.9, 0.2, -5.6), 'MTb')],
    wc: [spotAt(-7.3, 6.1, Math.PI / 2, 'ST1', false, { stall: 0 }), spotAt(-7.3, 7.4, Math.PI / 2, 'ST2', false, { stall: 1 })],
    sink: [spotAt(-7.25, 8.5, -Math.PI / 2, 'WCs')],
    dining: DINING,
  } : {
    library: [{ x: -6.3, z: -4.45, face: Math.PI, node: 'A' }, { x: -4.1, z: -4.45, face: Math.PI, node: 'A' }, { x: -5.2, z: -4.35, face: Math.PI, node: 'A' }],
    board: [{ x: -6.95, z: -3.25, face: -Math.PI / 2, node: 'F' }, { x: -6.95, z: -1.95, face: -Math.PI / 2, node: 'F' }],
    globe: [{ x: 1.7, z: -4.4, face: faceTo(1.7, -4.4, 0.6, -5.0), node: 'T1' }, { x: -0.5, z: -4.4, face: faceTo(-0.5, -4.4, 0.6, -5.0), node: 'T1' }],
    server: [{ x: 4.5, z: -4.25, face: Math.PI, node: 'E' }, { x: 6.6, z: -4.25, face: Math.PI, node: 'E' }, { x: 5.55, z: -4.15, face: Math.PI, node: 'E' }],
    coffee: [{ x: -6.5, z: 4.4, face: 0, node: 'J' }, { x: -4.5, z: 4.4, face: 0, node: 'J' }, { x: -5.5, z: 4.45, face: 0, node: 'J' }],
    meeting: [...MEET_SEATS, ...meetStanding()],
  };
  for (const list of Object.values(STATIONS)) for (const s of list) s.by = null;
  // pro: DOOR_IN is the spot in front of the lift doors (facing them while waiting), DOOR_OUT the inside of the car
  DOOR_IN = PRO ? { x: -6.3, z: DZ, face: -Math.PI / 2, node: 'I' } : { x: -7.2, z: DZ, face: Math.PI / 2, node: 'I' };
  DOOR_OUT = PRO ? { x: LIFT_X, z: DZ, face: Math.PI / 2, node: 'O' } : { x: -8.9, z: DZ, face: -Math.PI / 2, node: 'I' };
}
