// The floor plans (cozy, pro, hq): where the shared furniture stands, and the headquarters wing.
import { HQ, PRO } from '../core/env.js';

export let LAY;
/* Headquarters = the company floor (z -8 → 9) plus a wing in front of it (z 9 → 26). Two doors in the core's front wall
   (on its left and right aisles) open onto corridor A, which runs the width of the building; corridor B runs down the
   middle. Four department rooms, two pods (eight desks) each: the two at the back open onto corridor A, the two at the
   front onto corridor B. Each room is named after the project that sits in it. */
export const WING = { z0: 9, z1: 26, corA: [9, 10.8], corB: [2.3, 4.3], split: 18.4, doors: [-2.4, 7.4] };
export const DEPTS = [
  { x0: -8, x1: 2.3, z0: 10.8, z1: 18.4, cx: -2.85, door: { side: 'n', at: -2.4 } },
  { x0: 4.3, x1: 14, z0: 10.8, z1: 18.4, cx: 9.15, door: { side: 'n', at: 9.15 } },
  { x0: -8, x1: 2.3, z0: 18.4, z1: 26, cx: -3.05, door: { side: 'e', at: 22.2 } },
  { x0: 4.3, x1: 14, z0: 18.4, z1: 26, cx: 9.5, door: { side: 'w', at: 22.2 } },
].map((d) => ({ ...d, cz: (d.z0 + d.z1) / 2, pods: [[d.cx - 2.65, (d.z0 + d.z1) / 2], [d.cx + 2.65, (d.z0 + d.z1) / 2]] }));
// The ground the office stands on (building, terrace and its edge), for the backdrops to keep clear of
export const REACH = () => (HQ ? { x0: -11, x1: 16, z0: -9, z1: 29.5 } : { x0: -11, x1: 14.5, z0: -9, z1: 13.5 });
// Is (x, z) inside the building with a margin (people never stand closer than `m` to an outer wall)?
// a point in the sofa's own frame (x along it, z out from its seat toward the coffee table) on the floor plan; the
// company floor's sofa faces the back wall, where the lounge TV is
export function sofaAt(lx, lz) { const [x, z, , r] = LAY.sofa, c = Math.cos(r), s = Math.sin(r); return [x + lx * c + lz * s, z - lx * s + lz * c]; }
export const inside = (x, z, m = 0.4) => x > LAY.box.x0 + m && x < LAY.box.x1 - m && z > LAY.box.z0 + m && z < LAY.box.z1 - m;

export function setup() {
  /* ---------- the two floor plans ----------
     Cozy: one open room, 16 x 12 m. Pro: a company floor, 22 x 17 m, with a director's office, a meeting room and a
     library along the windows, a server room, lobby and restrooms by the entrance, a pantry and a lounge on the right,
     all around an open-plan dev floor. Furniture both plans share is placed from this table. */
  LAY = PRO ? {
    box: { x0: -8, x1: 14, z0: -8, z1: HQ ? WING.z1 : 9 }, center: HQ ? [3, 9] : [3, 0.5],
    shelf: [4.95, -7.62, 0], globe: [8.0, -6.55], board: [-3.42, 2.05, 7.25, 0], doorZ: 3.3, clock: [-7.96, 2.15, 1.7, Math.PI / 2],
    racks: [-7.55, -1.47, Math.PI / 2], tv: [-7.96, 3.35, -1.47, Math.PI / 2], neon: [0.2, 3.62, -7.97, 0], rocket: [13.15, 1.75],
    coffee: [10.6, -7.45, Math.PI], aq: [10.45, 8.45], arc: [13.4, 8.45], prn: [-3.15, 0.55],
    lost: [-5.2, -0.62, Math.PI / 2 - 0.5], lostTag: [-5.2, 0.85, -0.3], sofa: [11.0, 3.95, 2.2, Math.PI], gameTv: [11.0, 0.9],
    bil: [12.85, 6.2], ktv: [-0.75, 7.4, Math.PI / 2],   // the pool table (the lounge's right side) and the karaoke box (where the front phone booth was)
  } : {
    box: { x0: -8, x1: 8, z0: -6, z1: 6 }, center: [0, 0],
    shelf: [-5.2, -5.62, 0], globe: [0.6, -5.0], board: [-7.94, 2.05, -2.6, 0], doorZ: 1.5, clock: [-2.45, 3.05, -5.96, 0],
    racks: [5.5, -5.5, 0], tv: [5.55, 3.3, -5.96, 0], neon: [-5.2, 3.62, -5.97, 0], rocket: [7.25, -3.6],
    coffee: [-5.55, 5.3, 0], aq: [1.35, 5.3], arc: [-1.45, 5.42], prn: [-3.15, 5.4],
    lost: [4.18, -4.95, 0.5], lostTag: [4.12, 0.85, -4.6], sofa: [-2.15, -5.5, 2.1, 0],
  };
}
