/* Breakfast on the way to work, 5:30–8:30, at the edge of a park a block from the bánh mì cart:
   - a woman with her gánh xôi: the shoulder pole on the grass, two baskets of sticky rice under banana leaves, sitting
     on a low stool under her conical hat;
   - a bánh cuốn stall: a pot steaming on a brazier, the cloth over it, a low table with plates and a couple of stools.
   People on their way in stop: some stand and eat in a hurry, a couple sit down for bánh cuốn, and now and then someone
   pulls in at the kerb on a scooter, buys without getting off, and rides on. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { puffs } from './street-corner.js';
import { inside } from './street-spots.js';
import { stepper } from './street-folk.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const OFFICE = [{ shirt: '#F2F2F2', pants: '#2F3A4C' }, { shirt: '#BFD4EA', pants: '#363D4C' }, { shirt: '#E8E4DA', pants: '#1F2430' }, { shirt: '#F2D7DF', pants: '#3B3B3B' }];
const JACKETS = ['#3A5A8C', '#8C3A3A', '#5B5B66', '#2B2F36', '#7E5BA6'], PAINTS = ['#D9534F', '#F2F2F2', '#2E86DE', '#3B3B3B', '#C9CED6'];

/** crowd: street-folk.js figures; finder: street-spots.js; far: what to keep away from ([x, z, r]: the bánh mì cart a
    block off); callRider (street-life.js) for the ones who buy from their scooters */
export function buildMorning(G, { crowd, finder, far = [], callRider }) {
  const spot = finder.find({ len: 3.8, depth: 1.15, d: 1.95, lawn: true, mid: true, far });
  if (!spot) return { update() {}, debug: () => null };
  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(spot.M); g.visible = false; G.add(g);
  const solid = [];
  // the gánh xôi: two baskets of sticky rice (white, a banana leaf over), the pole down on the grass behind
  for (const x of [-1.62, -0.82]) {
    solid.push(colorize(new THREE.CylinderGeometry(0.24, 0.2, 0.22, 14).translate(x, 0.11, 0.18), '#B98A4E'), colorize(new THREE.TorusGeometry(0.24, 0.02, 4, 16).rotateX(Math.PI / 2).translate(x, 0.22, 0.18), '#8A6A3A'));
    solid.push(colorize(new THREE.SphereGeometry(0.21, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1).translate(x, 0.21, 0.18), '#F4F1E6'));
    solid.push(colorize(new THREE.SphereGeometry(0.2, 10, 4, 0, Math.PI * 1.2, 0, Math.PI / 2).scale(1, 0.3, 1).translate(x + 0.02, 0.24, 0.16), '#4E8B3A'));
  }
  solid.push(boxAt(1.75, 0.035, 0.05, -1.2, 0.03, -0.6, '#C9A86A'), colorize(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 10).translate(-1.22, 0.1, -0.3), '#2E6FD1'));   // the pole; her stool
  // the bánh cuốn stall: brazier, pot, the cloth; the lid by it; a low table, plates, two stools
  solid.push(colorize(new THREE.CylinderGeometry(0.19, 0.22, 0.25, 14).translate(0.62, 0.125, -0.12), '#3B3F45'), colorize(new THREE.CylinderGeometry(0.27, 0.25, 0.22, 16).translate(0.62, 0.36, -0.12), '#C9CED6'),
    colorize(new THREE.CylinderGeometry(0.255, 0.255, 0.012, 16).translate(0.62, 0.475, -0.12), '#F4F4F4'), colorize(new THREE.SphereGeometry(0.2, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).rotateX(0.5).translate(0.98, 0.12, -0.42), '#AEB4BC'),
    colorize(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 10).translate(0.62, 0.1, -0.62), '#D62F2F'));
  solid.push(boxAt(0.52, 0.03, 0.46, 1.42, 0.31, 0.12, '#2F6FB5'));
  for (const [lx, lz] of [[-0.22, -0.19], [-0.22, 0.19], [0.22, -0.19], [0.22, 0.19]]) solid.push(boxAt(0.035, 0.3, 0.035, 1.42 + lx, 0.15, 0.12 + lz, '#2F6FB5'));
  for (const [x, z] of [[1.3, 0.05], [1.55, 0.22]]) {
    solid.push(colorize(new THREE.CylinderGeometry(0.09, 0.08, 0.015, 12).translate(x, 0.335, z), '#F2F2F2'));
    for (let k = 0; k < 3; k++) solid.push(colorize(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 6).rotateZ(Math.PI / 2).translate(x, 0.355, z - 0.04 + k * 0.04), '#F4F1E6'));
  }
  solid.push(colorize(new THREE.CylinderGeometry(0.035, 0.03, 0.04, 8).translate(1.62, 0.345, 0.0), '#D9A441'));   // the dipping sauce
  for (const [x, z, c] of [[1.42, -0.42, '#2E6FD1'], [1.98, 0.12, '#D62F2F']]) solid.push(colorize(new THREE.CylinderGeometry(0.13, 0.11, 0.24, 10).translate(x, 0.12, z), c));
  const mesh = new THREE.Mesh(mergeAll(solid), vmat({ roughness: 0.7 })); g.add(mesh);   // (no shadow: the shadow pass is what costs)
  // a cardboard sign on the stall's side: XÔI · BÁNH CUỐN
  const sign = canvasTex(256, 96, (c) => { c.fillStyle = '#E9D7B0'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#B5122B'; c.font = '900 34px "Be Vietnam Pro", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('XÔI', 128, 30); c.fillText('BÁNH CUỐN', 128, 70); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.9 })); board.position.set(-0.25, 0.22, 0.52); board.rotation.x = -0.35; g.add(board);
  const steam = puffs(G, 3, { size: 0.32, rise: 0.65, period: 2.2, color: '#F4F4F4' }), pot = spot.at(0.62, -0.12);

  // the two sellers, two standing with a packet of xôi, two at the table
  const xoi = crowd.take(1)[0], cuon = crowd.take(1)[0], stand = crowd.take(2), sit = crowd.take(2);
  if (xoi != null) crowd.dress(xoi, { shirt: '#8E5B9A', hair: '#241E1A', pants: '#2B2B2B' });
  if (cuon != null) crowd.dress(cuon, { shirt: '#E8D9C4', hair: '#241E1A', pants: '#5B4B3B' });
  [...stand, ...sit].forEach((i, n) => i != null && crowd.dress(i, { ...OFFICE[n % 4], hair: n === 1 ? '#3A332E' : '#241E1A' }));
  const place = (i, x, z, f) => { if (i == null) return; const w = spot.at(x, z); crowd.pose(i, { ...f, x: w.x, z: w.z, y: spot.y, sit: f.sit != null ? spot.y + f.sit : undefined, yaw: spot.yaw + (f.yaw ?? 0) }); };
  const hide = (i) => i != null && crowd.hide(i);

  // whoever stops at the kerb: called up the street, waits a few seconds while she hands it over, rides on
  let rider = null, riderAt = 0, nextRider = 0;
  const kerbS = () => { let s = spot.s; for (const c of spot.L.cross) if (Math.abs(s - c) < 6.6) s = c + Math.sign(s - c || 1) * 6.6; return s; };
  return {
    update: stepper([{
      when: [5.5, 8.5], at: [spot.x, spot.z],
      update(t, dt, h) {
        g.visible = true;
        steam.show(t, pot.x, spot.y + 0.52, pot.z);
        const busy = h >= 6 && h < 8.25, many = busy ? 2 : 1;
        // the riders who buy from the scooter
        if (spot.L && busy && !rider && t > nextRider) {
          rider = callRider(spot.L, kerbS(), { livery: 'plain', side: 1.92, far: 40, jacket: JACKETS[Math.floor(rnd(0, JACKETS.length))], paint: PAINTS[Math.floor(rnd(0, PAINTS.length))] });
          riderAt = 0; nextRider = t + rnd(35, 75);
        }
        if (rider) {
          if (rider.state === 'waiting' && !riderAt) riderAt = t + rnd(6, 10);
          if (riderAt && t > riderAt) { rider.release(); rider = null; riderAt = 0; }
          else if (rider && rider.state === 'gone') rider = null;
        }
        const handing = !!(rider && riderAt);
        place(xoi, -1.22, -0.36, { sit: 0.2, yaw: -Math.PI / 2, hat: 'non', arms: [[0.7, 0.05], handing ? [1.35, 0.1] : [0.75 + Math.max(0, Math.sin(t * 1.3)) * 0.4, 0.05]], lean: -0.15 });
        place(cuon, 0.62, -0.66, { sit: 0.2, yaw: -Math.PI / 2, arms: [[0.95, -0.1], [1.05 + Math.sin(t * 3.1) * 0.22, -0.15 + Math.cos(t * 3.1) * 0.12]], lean: -0.22 });
        // standing with a packet, a bite every few seconds; at the table, eating
        stand.forEach((i, n) => {
          if (n >= many) { hide(i); return; }
          const bite = Math.max(0, Math.sin(t * 1.6 + n * 2)) ** 3;
          place(i, -0.22 + n * 0.5, 0.42 - n * 0.12, { y: 0, yaw: n ? Math.PI * 0.75 : -Math.PI * 0.15, arms: [[1.05, -0.25], [1.2 + bite * 1.05, -0.3]] });
        });
        sit.forEach((i, n) => {
          if (n >= many) { hide(i); return; }
          const bite = Math.max(0, Math.sin(t * 1.4 + n * 1.5)) ** 2;
          place(i, n ? 1.98 : 1.42, n ? 0.12 : -0.42, { sit: 0.26, yaw: n ? Math.PI : Math.PI / 2, arms: [[0.85, -0.1], [0.95 + bite * 0.8, -0.2]], lean: -0.18 });
        });
      },
      away() { if (rider) { if (rider.state === 'coming') rider.cancel(); else rider.release(); rider = null; } },
      off() {
        g.visible = false; steam.show(0, 0, 0, 0, false);
        for (const i of [xoi, cuon, ...stand, ...sit]) hide(i);
        if (rider) { if (rider.state === 'coming') rider.cancel(); else rider.release(); rider = null; }
      },
    }]),
    blocked: (x, z, r) => g.visible && inside(spot, x, z, r, -1.95, 2.15, -0.7, 0.6),
    debug: () => ({ at: [+spot.x.toFixed(1), +spot.z.toFixed(1)], lane: !!spot.L, rider: rider?.state ?? null }),
  };
}
