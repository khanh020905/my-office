/* The parks across the street by the hour, and a game of Chinese chess at the trà đá stall.
   Two of the parks near the office have a paved square in the middle (city.js) with a stone bench on each side:
   - 5:00–6:30: a row of old people at their morning exercise (dưỡng sinh), arms up and down, a twist at the waist,
     following the one in front, a little speaker on the ground beside her.
   - 16:30–18:30: badminton across one square (a net, the shuttle going back and forth over it) and a circle kicking
     the shuttlecock (đá cầu) in the other.
   - 16:00–19:00: children running round.
   - Evenings: people on the benches, a phone's glow after dark; a few by day.
   At the stall (7:00–11:30, 14:00–21:30) two old men play cờ tướng on a low table and a few stand round watching.
   Every now and then someone doesn't like a move. Nobody plays in the rain. The people are street-folk.js figures. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { GY, boxAt, colorize, mergeAll, vmat } from '../terrace.js';
import { stepper } from './street-folk.js';

const OLD_SHIRTS = ['#F2F2F2', '#DCE6EE', '#E8D9C4', '#B8CCE0', '#F2E2B8', '#C9D9C0', '#E6C7C7', '#9FB5C9'];
const OLD_HAIR = ['#E6E6E6', '#C9C9C9', '#A9A9A9', '#D8D8D8', '#3A332E'];
const SHIRTS = ['#E8742A', '#3F7CC4', '#F2F2F2', '#D64550', '#2A9D8F', '#C9A227', '#8C4FA8', '#5B6CD8', '#3B3B3B', '#F28FA8', '#6A8042'];
const KIDS = ['#F2C200', '#E8473B', '#2E86DE', '#2A9D8F', '#F28FA8', '#8C4FA8'];
const PANTS = ['#363D4C', '#2F3A4C', '#4A4A52', '#6B5B4B', '#1F2430'];
const pickOf = (a, i) => a[((i * 7 + 3) % a.length + a.length) % a.length];
const rnd = (a, b) => a + Math.random() * (b - a);
// a value by keyframes [[x, y], …] (held at the ends)
function keyed(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) if (x <= keys[k][0]) { const [x0, y0] = keys[k - 1], [x1, y1] = keys[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return keys[keys.length - 1][1];
}
const yawTo = (dx, dz) => Math.atan2(-dz, dx);   // the yaw that faces a figure (forward +x) along (dx, dz)
const V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// a shuttle (badminton: white feathers) or a shuttlecock (đá cầu: coloured feathers on a weighted base); its tip at the
// origin, the feathers up +y
function shuttle(feathers, base) {
  return new THREE.Mesh(mergeAll([colorize(new THREE.ConeGeometry(0.07, 0.11, 10, 1, true).rotateX(Math.PI).translate(0, 0.075, 0), feathers),
    colorize(new THREE.SphereGeometry(0.028, 8, 6).translate(0, 0.012, 0), base)]), vmat({ roughness: 0.7, side: THREE.DoubleSide }));
}
function bubbleTex(text, color) {
  return canvasTex(128, 96, (g) => {
    g.fillStyle = '#FFFFFF'; g.strokeStyle = '#2B2F36'; g.lineWidth = 5;
    g.beginPath(); g.roundRect(6, 6, 116, 66, 22); g.moveTo(52, 70); g.lineTo(46, 92); g.lineTo(72, 70); g.fill(); g.stroke();
    g.fillStyle = '#FFFFFF'; g.fillRect(50, 64, 20, 9);
    g.fillStyle = color; g.font = '900 50px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 42);
  });
}

/** crowd: the street-folk.js figures; plazas: the paved squares ([x0, x1, z0, z1]); trees ([x, z, size], to keep the chess
    game clear of them); stall: the trà đá stall ({ M: its frame, toMiddle: which way along its local x the park's edge goes
    on }) */
export function buildPark(G, { crowd, plazas = [], trees = [], stall = null, low = false }) {
  const Y = GY + 0.19, statics = [], obstacles = [], debugInfo = {};
  let chessAt = null;   // (for the street trades, to keep clear of it)   // (obstacles: [x0, x1, z0, z1, when?] for walking in)
  const parts = [];   // each activity: { update(t, dt, h, rain), off() }
  const slots = (k, look) => { const s = crowd.take(k); s.forEach((i, n) => crowd.dress(i, look(n))); return s; };
  // how badly the trees hide a spot: one for each standing between it and the camera (which looks in from +x +z, at
  // about 45°), ten for a trunk on it
  const hidden = (x, z) => {
    let n = 0;
    for (const [tx, tz, s] of trees) {
      const dx = tx - x, dz = tz - z, along = (dx + dz) * Math.SQRT1_2, across = Math.abs(dx - dz) * Math.SQRT1_2;
      if (Math.hypot(dx, dz) < 1.05 + 0.6 * s) n += 10;
      else if (along > 0.2 && along < 4.6 && across < 0.95 * s + 0.4) n++;   // (a crown 2–3 m up hides what is 1–4 m behind it)
    }
    return n;
  };

  /* ---------- the benches: one on each side of each square, facing in ---------- */
  const seats = [];
  for (const P of plazas.slice(0, 2)) {
    const cx = (P[0] + P[1]) / 2, cz = (P[2] + P[3]) / 2, reach = (P[1] - P[0]) / 2 - 0.35;
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const bx = cx + nx * reach, bz = cz + nz * reach, ax = nz ? 1 : 0, az = nx ? 1 : 0, w = 1.3, d = 0.38;
      statics.push(boxAt(nx ? d : w, 0.07, nx ? w : d, bx, Y + 0.285, bz, '#A7A39B'));
      for (const s of [-0.5, 0.5]) statics.push(boxAt(nx ? 0.3 : 0.1, 0.25, nx ? 0.1 : 0.3, bx + ax * s, Y + 0.125, bz + az * s, '#8B877F'));
      obstacles.push([bx - (nx ? d : w) / 2, bx + (nx ? d : w) / 2, bz - (nx ? w : d) / 2, bz + (nx ? w : d) / 2]);
      for (const s of [-0.34, 0.34]) seats.push({ x: bx + ax * s + nx * 0.07, z: bz + az * s + nz * 0.07, yaw: yawTo(-nx, -nz) });
    }
  }

  // (the all-day ones take the first slots: street-folk.js draws only up to the highest one out)
  /* ---------- people on the benches ---------- */
  if (seats.length) {
    const ORDER = seats.map((_, i) => i).sort((a, b) => ((a * 7 + 5) % 11) - ((b * 7 + 5) % 11) || a - b);
    const who = slots(seats.length, (n) => (n % 3 === 0 ? { shirt: pickOf(OLD_SHIRTS, n), hair: pickOf(OLD_HAIR, n), pants: pickOf(PANTS, n) } : { shirt: pickOf(SHIRTS, n + 4), hair: '#2B2420', pants: pickOf(PANTS, n + 2) }));
    const how = seats.map((_, n) => n % 3);   // 0 hands on the knees, 1 a phone, 2 arms folded
    const glowPos = new Float32Array(seats.length * 3), glow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(glowPos, 3)),
      new THREE.PointsMaterial({ map: canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }), color: new THREE.Color(1.2, 1.7, 2.6), size: 5, sizeAttenuation: false, transparent: true, depthWrite: false }));
    glow.frustumCulled = false; glow.visible = false; G.add(glow);
    let nightOn = false, sitting = 0;
    const H = new THREE.Vector3();
    // how many: a few old people after the morning exercise, one or two by day, parents by the children, most in the evening
    const many = (h) => (h >= 19 && h < 22 ? 10 : h >= 16 && h < 19 ? 4 : h >= 6.5 && h < 8 ? 3 : h >= 8 && h < 16 ? 2 : h >= 22 && h < 23 ? 3 : 0);
    const mid = plazas.length > 1 ? [(plazas[0][0] + plazas[1][1]) / 2, (plazas[0][2] + plazas[1][3]) / 2] : [(plazas[0][0] + plazas[0][1]) / 2, (plazas[0][2] + plazas[0][3]) / 2];
    parts.push({
      when: [[6.5, 23]], at: mid,
      update(t, dt, h) {
        sitting = Math.min(many(h), seats.length);
        ORDER.forEach((s, n) => {
          const i = who[s];
          if (n >= sitting) { crowd.hide(i); glowPos[s * 3 + 1] = -1e4; return; }
          const p = seats[s], k = how[s], sway = Math.sin(t * 0.4 + s) * 0.08;
          const arms = k === 0 ? [[0.55, 0], [0.55, 0]] : k === 1 ? [[0.5, 0], [1.3, -0.12]] : [[1.0, -0.42], [1.0, -0.42]];
          crowd.pose(i, { x: p.x, sit: Y + 0.32, z: p.z, yaw: p.yaw + sway, arms, lean: k === 1 ? -0.14 : 0 });
          if (k === 1 && nightOn) { crowd.hand(i, H); glowPos.set([H.x, H.y + 0.05, H.z], s * 3); } else glowPos[s * 3 + 1] = -1e4;
        });
        glow.visible = nightOn; glow.geometry.attributes.position.needsUpdate = true;
      },
      off() { who.forEach((i) => crowd.hide(i)); glow.visible = false; },
      night(on) { nightOn = on; },
    });
  }

  /* ---------- cờ tướng at the trà đá stall ---------- */
  if (stall) {
    const side = stall.toMiddle || 1, ground = GY + 0.18;
    // beside the stall, towards the middle of the park's edge (or behind it, in the park): clear of the trees' trunks, and
    // where no tree stands between it and the camera (which looks in from +x +z, at about 45°)
    const SM = stall.M, spots = [[2.7, -0.3], [3.5, -0.3], [2.7, -1.4], [4.3, -0.6], [1.4, -2.5], [3.4, -2.4], [5.0, -1.5], [0.4, -2.6]].map(([x, z]) => [x * side, z]);
    const score = ([x, z]) => { V.set(x, 0, z).applyMatrix4(SM); return hidden(V.x, V.z); };
    const [sx, sz] = spots.reduce((best, p) => (score(p) < score(best) ? p : best), spots[0]);
    const CM = new THREE.Matrix4().multiplyMatrices(SM, new THREE.Matrix4().makeTranslation(sx, 0, sz)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    const ex = CM.elements, yawF = Math.atan2(-ex[2], ex[0]), world = (x, z) => V.set(x, 0, z).applyMatrix4(CM).clone();
    const game = new THREE.Group(); game.matrixAutoUpdate = false; game.matrix.copy(CM); game.visible = false; G.add(game);
    // a low plastic table with the board on it, and the two players' stools
    const furniture = [boxAt(0.52, 0.03, 0.5, 0, 0.285, 0, '#2F6FB5')];
    for (const [lx, lz] of [[-0.22, -0.21], [-0.22, 0.21], [0.22, -0.21], [0.22, 0.21]]) furniture.push(boxAt(0.04, 0.28, 0.04, lx, 0.14, lz, '#2F6FB5'));
    for (const s of [-1, 1]) furniture.push(colorize(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 12).translate(s * 0.66, 0.15, 0), s < 0 ? '#D62F2F' : '#2E6FD1'));
    const fm = new THREE.Mesh(mergeAll(furniture), vmat({ roughness: 0.6 })); fm.castShadow = !low; game.add(fm);
    // the board: nine files and ten ranks (along x, the players at either end), the river across the middle, the palaces
    const STEP = 0.045, PX = 600, BW = 0.48, BD = 0.42;
    const boardTex = canvasTex(BW * PX, BD * PX, (g, w, h) => {
      g.fillStyle = '#E3B872'; g.fillRect(0, 0, w, h);
      const X = (r) => w / 2 + (r - 4.5) * STEP * PX, Z = (f) => h / 2 + (f - 4) * STEP * PX;
      g.strokeStyle = '#5A3A1A'; g.lineWidth = 2;
      for (let f = 0; f < 9; f++) { g.beginPath(); g.moveTo(X(0), Z(f)); g.lineTo(X(9), Z(f)); g.stroke(); }
      for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(X(r), Z(0)); g.lineTo(X(r), Z(8)); g.stroke(); }
      g.fillStyle = '#E3B872'; g.fillRect(X(4) + 1, Z(0) + 1, X(5) - X(4) - 2, Z(8) - Z(0) - 2);   // the river
      for (const [r0, r1] of [[0, 2], [7, 9]]) { g.beginPath(); g.moveTo(X(r0), Z(3)); g.lineTo(X(r1), Z(5)); g.moveTo(X(r0), Z(5)); g.lineTo(X(r1), Z(3)); g.stroke(); }
      g.lineWidth = 3; g.strokeRect(X(0), Z(0), X(9) - X(0), Z(8) - Z(0));
    });
    const boardM = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD).rotateX(-Math.PI / 2).translate(0, 0.302, 0), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 }));
    game.add(boardM);
    // 32 pieces: a cream disc with the side's colour on top
    const disc = new THREE.InstancedMesh(colorize(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 12), '#EAD7B0'), vmat({ roughness: 0.6 }), 32);
    const mark = new THREE.InstancedMesh(colorize(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 10), '#FFFFFF'), vmat({ roughness: 0.6 }), 32);
    for (const o of [disc, mark]) { o.frustumCulled = false; game.add(o); }
    const START = [[0, [0, 1, 2, 3, 4, 5, 6, 7, 8]], [2, [1, 7]], [3, [0, 2, 4, 6, 8]]];
    const pcs = [];
    for (const sideNo of [0, 1]) for (const [r, files] of START) for (const f of files) pcs.push({ side: sideNo, r: sideNo ? 9 - r : r, f, soldier: r === 3, alive: true, from: null, t0: 0 });
    pcs.forEach((p, i) => mark.setColorAt(i, new THREE.Color(p.side ? '#1E2125' : '#C8102E')));
    const at = (r, f) => [(r - 4.5) * STEP, (f - 4) * STEP];
    const M4 = new THREE.Matrix4();
    let taken = [0, 0];
    function placePieces(t) {
      pcs.forEach((p, i) => {
        let [x, z] = p.alive ? at(p.r, p.f) : p.out, y = p.alive ? 0.309 : 0.006;
        if (p.from && t - p.t0 < 0.45) { const u = (t - p.t0) / 0.45; x = p.from[0] + (x - p.from[0]) * u; z = p.from[1] + (z - p.from[1]) * u; y += Math.sin(Math.PI * u) * 0.04; }
        disc.setMatrixAt(i, M4.makeTranslation(x, y, z)); mark.setMatrixAt(i, M4.makeTranslation(x, y + 0.0065, z));
      });
      disc.instanceMatrix.needsUpdate = mark.instanceMatrix.needsUpdate = true;
    }
    function reset() { const fresh = []; for (const s of [0, 1]) for (const [r, files] of START) for (const f of files) fresh.push([s ? 9 - r : r, f]); pcs.forEach((p, i) => Object.assign(p, { r: fresh[i][0], f: fresh[i][1], alive: true, from: null })); taken = [0, 0]; }
    const occupant = (r, f) => pcs.find((p) => p.alive && p.r === r && p.f === f);
    // a move that looks like one: a soldier steps forward, anything else goes a step or three along a line (taking what is there)
    function move(sideNo, t) {
      const mine = pcs.filter((p) => p.alive && p.side === sideNo);
      for (let tries = 0; tries < 30; tries++) {
        const p = mine[Math.floor(Math.random() * mine.length)], fwd = sideNo ? -1 : 1;
        const [dr, df] = p.soldier ? [fwd, 0] : [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)], n = p.soldier ? 1 : 1 + Math.floor(Math.random() * 3);
        const r = p.r + dr * n, f = p.f + df * n;
        if (r < 0 || r > 9 || f < 0 || f > 8) continue;
        const o = occupant(r, f);
        if (o?.side === sideNo) continue;
        if (o) { o.alive = false; o.out = [(sideNo ? 1 : -1) * (0.3 + 0.04 * (taken[sideNo] % 5)), 0.33 + 0.04 * Math.floor(taken[sideNo]++ / 5)]; }   // (by the taker's stool)
        p.from = at(p.r, p.f); p.t0 = t; p.r = r; p.f = f;
        return;
      }
    }
    // the two players (red sits at -x) and up to three watching
    const seat = [[-0.74, 0, 0], [0.74, 0, Math.PI]], watch = [[0.15, 0.85, Math.PI / 2], [-0.4, -0.86, -Math.PI / 2], [1.28, 0.42, yawTo(-1.28, -0.42)]];
    const who = slots(5, (n) => (n === 0 ? { shirt: '#F2F2F2', hair: '#D8D8D8', pants: '#3B3F45' } : n === 1 ? { shirt: '#9FB5C9', hair: '#A9A9A9', pants: '#363D4C' } : { shirt: pickOf(OLD_SHIRTS, n + 2), hair: pickOf(OLD_HAIR, n), pants: pickOf(PANTS, n) }));
    const bubbles = [bubbleTex('?!', '#C8102E'), bubbleTex('!!', '#2B2F36')].map((map) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false })); s.scale.set(0.42, 0.315, 1); s.visible = false; game.add(s); return s; });
    const C = { turn: 0, next: 0, moves: 0, mover: -1, moveAt: -9, row: -9, rowNext: 0 };
    obstacles.push((() => { const pts = [[-1.1, -1.1], [1.6, -1.1], [-1.1, 1.1], [1.6, 1.1]].map(([x, z]) => world(x, z)); return [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.z)), Math.max(...pts.map((p) => p.z)), () => game.visible]; })());
    let watchers = 0;
    const cw = world(0.3, 0); chessAt = [cw.x, cw.z];
    parts.push({
      when: [[7, 11.5], [14, 21.5]], at: [cw.x, cw.z],
      update(t, dt, h) {
        if (!game.visible) { game.visible = true; C.next = t + rnd(2, 5); C.rowNext = t + rnd(20, 45); }
        watchers = h < 11.5 ? 2 : h < 17 ? 2 : 3;
        if (t > C.next) {
          if (C.moves > 44 || pcs.filter((p) => p.alive).length < 12) { reset(); C.moves = 0; C.turn = 0; C.next = t + 8; }
          else { move(C.turn, t); C.mover = C.turn; C.moveAt = t; C.turn = 1 - C.turn; C.moves++; C.next = t + rnd(4, 11); }
        }
        // a row: the one who just lost a piece (or the one waiting) throws his hands up, a watcher points at the board
        if (t > C.rowNext) { C.row = t; C.rowNext = t + rnd(40, 85); }
        const row = t - C.row < 5, shake = Math.sin(t * 13) * 0.22;
        bubbles[0].visible = bubbles[1].visible = row;
        if (row) { bubbles[0].position.set(seat[1][0], 1.78 + Math.abs(Math.sin(t * 6)) * 0.04, 0); bubbles[1].position.set(watch[0][0], 2.15, watch[0][1]); }
        seat.forEach(([x, z, y], n) => {
          const reach = n === C.mover ? Math.max(0, 1 - Math.abs(t - C.moveAt - 0.1) / 0.75) : 0, w = world(x, z);
          const thinking = n === C.turn && !reach && Math.sin(t * 0.3 + n) > 0.2;   // a hand to the chin
          let arms = [[0.62, 0], [0.62 + reach * 0.75, -0.08 * reach]], lean = -0.08 - 0.32 * reach;
          if (thinking) { arms = [[0.62, 0], [2.35, -0.3]]; lean = -0.22; }
          if (row && n === 1) { arms = [[2.4 + shake, 0.45], [2.4 - shake, 0.45]]; lean = 0.1; }
          crowd.pose(who[n], { x: w.x, sit: ground + 0.3, z: w.z, yaw: yawF + y, arms, lean });
        });
        watch.forEach(([x, z, y], k) => {
          const i = who[2 + k];
          if (k >= watchers) { crowd.hide(i); return; }
          const w = world(x, z), point = row && k === 0;
          crowd.pose(i, { x: w.x, y: ground, z: w.z, yaw: yawF + y + Math.sin(t * 0.5 + k) * 0.06, arms: point ? [[-0.3, -0.1], [1.25 + shake * 0.4, 0]] : [[-0.4, -0.15], [-0.4, -0.15]], lean: point ? -0.3 : -0.1, hat: k === 1 });
        });
        placePieces(t);
      },
      off() { game.visible = false; who.forEach((i) => crowd.hide(i)); },
    });
  }

  /* ---------- morning exercise, on the first square ---------- */
  const A = plazas[0], B = plazas[1];
  if (A) {
    const cx = (A[0] + A[1]) / 2, cz = (A[2] + A[3]) / 2, row = [];
    for (const v of [-0.9, 0.2]) for (const u of [-1.5, -0.5, 0.5, 1.5]) row.push({ x: cx + u + rnd(-0.08, 0.08), z: cz + v + rnd(-0.06, 0.06), lag: rnd(0, 0.25), yaw: -Math.PI / 2 });
    row.push({ x: cx, z: cz + 1.45, lag: 0, yaw: Math.PI / 2, lead: true });   // the one in front, facing them
    const who = slots(row.length, (n) => (n === row.length - 1 ? { shirt: '#F2F2F2', hair: '#3A332E', pants: '#C8102E' } : { shirt: pickOf(OLD_SHIRTS, n), hair: pickOf(OLD_HAIR, n * 3), pants: pickOf(['#363D4C', '#E8E4DA', '#4A4A52', '#2F3A4C'], n) }));
    const speaker = new THREE.Mesh(mergeAll([boxAt(0.26, 0.34, 0.16, 0, 0.17, 0, '#2B2F36'), colorize(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0.2, 0.085), '#5E6670'),
      boxAt(0.2, 0.03, 0.03, 0, 0.36, 0, '#1C1E22'), boxAt(0.03, 0.12, 0.03, -0.09, 0.41, 0, '#1C1E22'), boxAt(0.03, 0.12, 0.03, 0.09, 0.41, 0, '#1C1E22')]), vmat({ roughness: 0.6 }));
    speaker.position.set(cx + 0.75, Y, cz + 1.5); speaker.visible = false; G.add(speaker);
    // three movements of 8 s each, round and round; every one starts and ends at rest, so they follow on smoothly
    parts.push({
      when: [[5, 6.5]], at: [cx, cz],
      update(t) {
        speaker.visible = true;
        row.forEach((p, n) => {
          const k = t - p.lag, cyc = Math.floor(k / 8) % 3, ph = ((k % 8) / 8) * Math.PI * 2, up = (1 - Math.cos(ph)) / 2;
          let arms, yaw = p.yaw;
          if (cyc === 0) arms = [[0, up * 2.8], [0, up * 2.8]];   // arms out and up over the head
          else if (cyc === 1) arms = [[up * 2.6, 0.12], [up * 2.6, 0.12]];   // forward and up
          else { const out = Math.sin(ph / 2) * 1.45; arms = [[0, out], [0, out]]; yaw += Math.sin(ph) * 0.5 * (p.lead ? -1 : 1); }   // arms out, a twist
          crowd.pose(who[n], { x: p.x, y: Y, z: p.z, yaw, arms, s: p.lead ? 1 : 0.97 });
        });
      },
      off() { speaker.visible = false; who.forEach((i) => crowd.hide(i)); },
    });
  }

  /* ---------- badminton across the first square ---------- */
  if (A) {
    const cx = (A[0] + A[1]) / 2, cz = (A[2] + A[3]) / 2;
    // along a diagonal or across the middle, whichever has neither player behind the trees (the first, the net face-on, if all can)
    const COURTS = [[[-1.7, -1.7], [1.7, 1.7]], [[-1.2, -1.3], [1.9, -1.3]], [[-1.3, -1.2], [-1.3, 1.9]], [[-1.95, 0], [1.95, 0]], [[0, -1.95], [0, 1.95]],
      [[-1.9, 1.3], [1.2, 1.3]], [[1.3, -1.9], [1.3, 1.2]], [[-1.7, 1.7], [1.7, -1.7]]];
    const cost = ([a, b]) => hidden(cx + a[0], cz + a[1]) + hidden(cx + b[0], cz + b[1]);
    debugInfo.courts = COURTS.map(cost);
    const [ca, cb] = COURTS.reduce((best, c) => (cost(c) < cost(best) ? c : best)), len = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]), f0 = [(cb[0] - ca[0]) / len, (cb[1] - ca[1]) / len];
    const pl = [{ x: cx + ca[0], z: cz + ca[1], f: f0 }, { x: cx + cb[0], z: cz + cb[1], f: [-f0[0], -f0[1]] }].map((p) => ({ ...p, r: [-p.f[1], p.f[0]], lat: 0, goal: 0 }));
    // (r: the player's right, along its local +z: forward (fx, fz) turned a quarter to the right)
    const who = slots(2, (n) => ({ shirt: n ? '#2A9D8F' : '#F2F2F2', hair: '#2B2420', pants: n ? '#2F3A4C' : '#3B3B3B' }));
    const net = new THREE.Group(), netTex = canvasTex(128, 32, (g) => { g.clearRect(0, 0, 128, 32); g.strokeStyle = 'rgba(30,30,30,.75)'; g.lineWidth = 1; for (let x = 0; x <= 128; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); } for (let y = 0; y <= 32; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } g.fillStyle = '#F2F2F2'; g.fillRect(0, 0, 128, 4); });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.y = 1.27; net.add(mesh);
    net.add(new THREE.Mesh(mergeAll([colorize(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6).translate(-1.22, 0.775, 0), '#5E6670'), colorize(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6).translate(1.22, 0.775, 0), '#5E6670'),
      colorize(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10).translate(-1.22, 0.02, 0), '#3B3F45'), colorize(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10).translate(1.22, 0.02, 0), '#3B3F45')]), vmat({ roughness: 0.5, metalness: 0.4 })));
    net.position.set(cx, Y, cz); net.rotation.y = Math.atan2(-f0[0], -f0[1]); net.visible = false; G.add(net);   // (across the line between them)
    const cock = shuttle('#F4F4F4', '#C9A86A'); cock.visible = false; G.add(cock);
    // the racket meets the shuttle overhead and in front: the arm up-and-forward (swing 2.0), a racket's length on
    const hitAt = (p) => [p.x + p.r[0] * p.lat + p.f[0] * 0.82 + p.r[0] * 0.25, Y + 1.61, p.z + p.r[1] * p.lat + p.f[1] * 0.82 + p.r[1] * 0.25];
    const R = { from: 0, t0: -1, dur: 1, apex: 3.2, miss: false, a: null, b: null };
    const SWING = [[-0.6, 0.55], [-0.16, 2.9], [0, 2.0], [0.15, 1.0], [0.5, 0.55]], OTHER = [[-0.6, 0.4], [-0.2, 2.2], [0.05, 0.9], [0.4, 0.4]];
    function serve(t, from) {
      const to = pl[1 - from];
      to.goal = rnd(-0.55, 0.55);
      Object.assign(R, { from, t0: t, dur: rnd(1.25, 1.65), apex: Y + rnd(3.0, 3.6), miss: Math.random() < 0.1, a: hitAt(pl[from]) });
      R.b = R.miss ? [to.x + to.r[0] * (to.goal + rnd(0.7, 1.1)) - to.f[0] * 0.3, Y + 0.02, to.z + to.r[1] * (to.goal + rnd(0.7, 1.1)) - to.f[1] * 0.3] : null;
    }
    parts.push({
      when: [[16.5, 18.5]], at: [cx, cz],
      update(t, dt) {
        net.visible = cock.visible = true;
        if (R.t0 < 0 || t - R.t0 > 12) serve(t, 0);
        const end = R.t0 + R.dur;
        if (t > end + (R.miss ? 2.5 : 0)) serve(R.miss ? end + 2.5 : end, 1 - R.from);
        const to = pl[1 - R.from];
        for (const p of pl) p.lat += THREE.MathUtils.clamp(p.goal - p.lat, -1.3 * dt, 1.3 * dt);
        // the shuttle: from the hitter's racket to the other's (where they will be), or down by them when missed
        const u = THREE.MathUtils.clamp((t - R.t0) / R.dur, 0, 1), b = R.b || hitAt({ ...to, lat: to.goal });
        const a = R.a, y0 = a[1], y1 = b[1], h = Math.max(R.apex - Math.max(y0, y1), 0.2);
        const y = y0 + (y1 - y0) * u + 4 * h * u * (1 - u);
        cock.position.set(a[0] + (b[0] - a[0]) * u, y, a[2] + (b[2] - a[2]) * u);
        if (u < 1) { V.set(b[0] - a[0], (y1 - y0) + 4 * h * (1 - 2 * u), b[2] - a[2]).normalize().negate(); cock.quaternion.setFromUnitVectors(UP, V); }
        else cock.quaternion.identity();
        pl.forEach((p, n) => {
          // its swing: the follow-through after its hit, or getting ready for the one coming
          const tau = n === R.from ? t - R.t0 : R.miss ? 9 : t - end, moving = Math.abs(p.goal - p.lat) > 0.02;
          const legs = moving ? [Math.sin(t * 9) * 0.35, -Math.sin(t * 9) * 0.35] : [0.14, -0.14];
          crowd.pose(who[n], { x: p.x + p.r[0] * p.lat, y: Y, z: p.z + p.r[1] * p.lat, yaw: yawTo(...p.f), arms: [[keyed(OTHER, tau), 0.15], [keyed(SWING, tau), 0.18]], legs, racket: true, bob: moving ? Math.abs(Math.cos(t * 9)) * 0.03 : 0 });
        });
      },
      off() { net.visible = cock.visible = false; R.t0 = -1; who.forEach((i) => crowd.hide(i)); },
    });
    obstacles.push([cx - 1.25, cx + 1.25, cz - 1.25, cz + 1.25, () => net.visible]);
  }

  /* ---------- đá cầu and children on the second square ---------- */
  if (B) {
    const cx = (B[0] + B[1]) / 2, cz = (B[2] + B[3]) / 2, ox = cx - 1.0, oz = cz - 0.8;
    const pl = [0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + (k * Math.PI) / 2, x = ox + Math.cos(a) * 1.05, z = oz + Math.sin(a) * 1.05, f = [-Math.cos(a), -Math.sin(a)]; return { x, z, f, r: [-f[1], f[0]] }; });
    const who = slots(4, (n) => ({ shirt: pickOf(SHIRTS, n * 2 + 1), hair: '#2B2420', pants: pickOf(PANTS, n) }));
    const cau = shuttle('#E8473B', '#F2C200'); cau.scale.setScalar(1.25); cau.visible = false; G.add(cau);
    // where each kicks it: in front of the right foot, at the height a kick reaches
    const kickAt = (p) => [p.x + p.f[0] * 0.52 + p.r[0] * 0.1, Y + 0.42, p.z + p.f[1] * 0.52 + p.r[1] * 0.1];
    const S = { from: 0, to: 1, t0: -1, dur: 1, apex: 2.4, last: [-9, -9, -9, -9] };
    function kick(t) {
      const from = S.to, to = Math.random() < 0.25 ? from : (from + 1 + Math.floor(Math.random() * 3)) % 4;
      Object.assign(S, { from, to, t0: t, dur: to === from ? 0.7 : rnd(0.95, 1.3), apex: Y + (to === from ? 1.4 : rnd(2.0, 2.8)) });
      S.last[from] = t;
    }
    const lift = (tau) => (tau < -0.28 || tau > 0.3 ? 0 : tau < 0 ? (1 + Math.cos(Math.PI * tau / 0.28)) / 2 : (1 + Math.cos(Math.PI * tau / 0.3)) / 2);
    parts.push({
      when: [[16.5, 18.5]], at: [ox, oz],
      update(t) {
        cau.visible = true;
        if (S.t0 < 0 || t - S.t0 > 6) kick(t);
        while (t > S.t0 + S.dur) kick(S.t0 + S.dur);
        const a = kickAt(pl[S.from]), b = kickAt(pl[S.to]), u = (t - S.t0) / S.dur, h = S.apex - a[1];
        cau.position.set(a[0] + (b[0] - a[0]) * u, a[1] + 4 * h * u * (1 - u), a[2] + (b[2] - a[2]) * u);
        pl.forEach((p, n) => {
          const k = Math.max(lift(t - S.last[n]), n === S.to ? lift(t - (S.t0 + S.dur)) : 0);
          crowd.pose(who[n], { x: p.x, y: Y, z: p.z, yaw: yawTo(...p.f), legs: [0, 1.05 * k], lean: 0.12 * k, arms: [[0.1, 0.3 + 0.45 * k], [0.1, 0.3 + 0.45 * k]], bob: 0.02 * k });
        });
      },
      off() { cau.visible = false; S.t0 = -1; who.forEach((i) => crowd.hide(i)); },
    });
    // children chasing each other round, each a little faster, then slower, than the one in front
    const kx = cx + 1.0, kz = cz + 0.9, kids = slots(4, (n) => ({ shirt: KIDS[n], hair: '#241E1A', pants: pickOf(['#2E86DE', '#363D4C', '#F2F2F2', '#E8742A'], n) }));
    parts.push({
      when: [[16, 19]], at: [kx, kz],
      update(t) {
        kids.forEach((i, k) => {
          const th = 1.75 * t + (k * Math.PI) / 2 + 0.45 * Math.sin(0.8 * t + k * 1.7), w = 1.75 + 0.36 * Math.cos(0.8 * t + k * 1.7);
          const x = kx + Math.cos(th) * 0.78, z = kz + Math.sin(th) * 0.98, tx = -Math.sin(th) * 0.78 * w, tz = Math.cos(th) * 0.98 * w, ph = t * 11 + k * 1.3;
          crowd.pose(i, { x, y: Y, z, yaw: yawTo(tx, tz), s: 0.62, legs: [Math.sin(ph) * 0.85, -Math.sin(ph) * 0.85], arms: [[-Math.sin(ph) * 0.8, 0.15], [Math.sin(ph) * 0.8, 0.15]], bob: Math.abs(Math.cos(ph)) * 0.05, lean: -0.12 });
        });
      },
      off() { kids.forEach((i) => crowd.hide(i)); },
    });
  }

  if (statics.length) { const o = new THREE.Mesh(mergeAll(statics), vmat({ roughness: 0.9 })); o.castShadow = !low; o.receiveShadow = true; G.add(o); }
  return {
    chessAt,
    update: stepper(parts),   // (hours, rain and whether it is in view a few times a second; only what is on and seen moves)
    night(on) { for (const p of parts) p.night?.(on); },
    // walking in: the benches, and the chess game and the net while they are out
    blocked: (x, z, r = 0.25) => obstacles.some(([x0, x1, z0, z1, when]) => (!when || when()) && x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r),
    debug: () => ({ ...debugInfo, plazas, near: trees.filter(([x, z]) => plazas.some((P) => x > P[0] - 2 && x < P[1] + 2 && z > P[2] - 2 && z < P[3] + 2)).map((t) => t.map((n) => +n.toFixed(2))) }),
  };
}
