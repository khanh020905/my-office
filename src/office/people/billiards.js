// Pool in the lounge (company floor; the table: world/props/billiards.js). Now and then two people who are
// resting play a frame: each takes a cue from the rack, one breaks, then they take turns, walking round the table to
// get behind the white, bending low over it and drawing the cue back and through. The balls run, kiss, come off the
// cushions and drop; whoever pots goes again, the white in a pocket hands the table over, and the first to five (or the
// one ahead when it runs long) wins and is pleased with themselves. Work coming in ends it where it stands. Click the
// table to call two people over. In first person, E at the table picks up a cue: aim with ←/→ (or by dragging), hold
// Space for power and let go to shoot, against a colleague who comes over, or on your own.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, PRO, el, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { BALL_R, BIL, CLOTH_Y, POCKETS, PX, PZ, cueMesh } from '../world/props/billiards.js';
import { napOn } from '../life/nap.js';
import { fp } from '../interact/first-person.js';
import { faceTo } from './navigation.js';
import { sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { chatSay } from '../ui/group-chat.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

const N = 16, H = 1 / 240, DECEL = 0.55, CUSHION_E = 0.74, BALL_E = 0.94, VMAX = 3.3, TARGET = 5, D2 = (2 * BALL_R) ** 2;
// where the balls are, in the table's frame (x across, z along; the white is 0): on the cloth, dropping, or gone
const bx = new Float64Array(N), bz = new Float64Array(N), vx = new Float64Array(N), vz = new Float64Array(N);
const on = new Uint8Array(N), dropT = new Float32Array(N), dropAt = new Int8Array(N);   // on: 1 on the cloth, 2 dropping, 0 potted
let G = null;              // the frame: { npc, p: [player, player], turn, stage, score, end, shot, at, shots }
let ME = null;             // first person at the table: { aim, power, charging, keys, at: [x, z] }
let nextAt = 0, hud = null, guide = null, ghost = null;
let RX = 0, RZ = 0;        // the walk round the table (its half size, in the table's frame)
const pick = (key) => { const l = tr(key, null, 'list'); return Array.isArray(l) ? l[Math.floor(Math.random() * l.length)] : l; };
const nameOf = (w) => { const n = sessions.get(w.id)?.name || w.cfg.name || ''; return n.length > 11 ? `${n.slice(0, 10)}…` : n; };
const called = (w) => { const s = sessions.get(w.id); return !s || s.status !== 'rest' || !!s.bg?.length || !!w.want; };
// who could play: resting, nothing else on (not out, not on a break, not carrying anything, not at tea)
function who() {
  return [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && !s.bg?.length && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.carry && !w.doze && !w.mealBox && !w.shred; });
}
const W = (x, z) => [BIL.x + x, BIL.z + z];   // the table's frame -> the floor

/* ---------- the balls ---------- */
// racked: the white on the head spot, the fifteen in a triangle on the foot spot (the 1 at the apex, the 8 in the middle)
function rack() {
  const rest = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15].sort(() => Math.random() - 0.5), order = [1, ...rest.slice(0, 3), 8, ...rest.slice(3)], d = BALL_R * 2 + 0.0008;
  let k = 0;
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) { const n = order[k++]; bx[n] = (i - row / 2) * d; bz[n] = PZ / 2 + row * d * 0.866; }
  bx[0] = rand(-0.05, 0.05); bz[0] = -PZ / 2;
  for (let i = 0; i < N; i++) { vx[i] = vz[i] = 0; on[i] = 1; BIL.balls[i].visible = true; BIL.balls[i].quaternion.random(); }
  draw(0);
}
const left = () => { let n = 0; for (let i = 1; i < N; i++) if (on[i]) n++; return n; };
const moving = () => { for (let i = 0; i < N; i++) if (on[i] === 2 || (on[i] === 1 && (vx[i] || vz[i]))) return true; return false; };
let clickAt = 0;
function hit(rel) { if (rel > 0.25 && state.sim - clickAt > 0.06) { clickAt = state.sim; sfx.play('click'); } }
function potted(i, p) {
  on[i] = 2; dropT[i] = 0; dropAt[i] = p; vx[i] = vz[i] = 0;
  sfx.play('pop');
  if (G?.shot) { if (i === 0) G.shot.scratch = true; else G.shot.potted.push(i); }
}
// one small step: rolling (slowing on the cloth), balls meeting (equal masses, a little lost), cushions and pockets.
// A cushion opens where a pocket's mouth is: a ball there goes on toward the pocket, or rattles out of the jaws.
function physics(h) {
  for (let i = 0; i < N; i++) {
    if (on[i] !== 1 || !(vx[i] || vz[i])) continue;
    bx[i] += vx[i] * h; bz[i] += vz[i] * h;
    const sp = Math.hypot(vx[i], vz[i]), s2 = sp - DECEL * h;
    if (s2 <= 0.006) vx[i] = vz[i] = 0; else { vx[i] *= s2 / sp; vz[i] *= s2 / sp; }
  }
  for (let i = 0; i < N; i++) {
    if (on[i] !== 1) continue;
    for (let j = i + 1; j < N; j++) {
      if (on[j] !== 1) continue;
      const dx = bx[j] - bx[i], dz = bz[j] - bz[i], d2 = dx * dx + dz * dz;
      if (d2 >= D2 || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, over = (2 * BALL_R - d) / 2;
      bx[i] -= nx * over; bz[i] -= nz * over; bx[j] += nx * over; bz[j] += nz * over;
      const rel = (vx[i] - vx[j]) * nx + (vz[i] - vz[j]) * nz;
      if (rel <= 0) continue;
      const imp = (rel * (1 + BALL_E)) / 2;
      vx[i] -= imp * nx; vz[i] -= imp * nz; vx[j] += imp * nx; vz[j] += imp * nz;
      if (G?.shot && G.shot.first < 0 && (i === 0 || j === 0)) G.shot.first = i || j;
      hit(rel);
    }
  }
  for (let i = 0; i < N; i++) {
    if (on[i] !== 1) continue;
    for (let p = 0; p < POCKETS.length; p++) { const P = POCKETS[p], dx = bx[i] - P.x, dz = bz[i] - P.z; if (dx * dx + dz * dz < P.r * P.r) { potted(i, p); break; } }
    if (on[i] !== 1) continue;
    const ax = Math.abs(bx[i]), az = Math.abs(bz[i]);
    const limX = az > PZ - 0.075 || az < 0.052 ? PX + 0.02 : PX - BALL_R, limZ = ax > PX - 0.075 ? PZ + 0.02 : PZ - BALL_R;
    if (ax > limX) { const s = Math.sign(bx[i]); bx[i] = s * limX; if (vx[i] * s > 0) { hit(Math.abs(vx[i])); vx[i] = -vx[i] * CUSHION_E; vz[i] *= 0.92; } }
    if (az > limZ) { const s = Math.sign(bz[i]); bz[i] = s * limZ; if (vz[i] * s > 0) { hit(Math.abs(vz[i])); vz[i] = -vz[i] * CUSHION_E; vx[i] *= 0.92; } }
  }
}
// the meshes where the balls are, rolling as they go; a potted ball slides into its pocket and sinks
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
function draw(dt) {
  for (let i = 0; i < N; i++) {
    const m = BIL.balls[i];
    if (on[i] === 0) { m.visible = false; continue; }
    if (on[i] === 2) {
      dropT[i] += dt; const P = POCKETS[dropAt[i]], k = Math.min(1, dropT[i] / 0.12);
      bx[i] += (P.x - bx[i]) * k; bz[i] += (P.z - bz[i]) * k;
      m.position.set(bx[i], CLOTH_Y + BALL_R - Math.min(0.09, dropT[i] * 0.4), bz[i]);
      if (dropT[i] > 0.3) { on[i] = 0; m.visible = false; }
      continue;
    }
    const sp = Math.hypot(vx[i], vz[i]);
    if (sp > 0 && dt > 0) { _ax.set(vz[i] / sp, 0, -vx[i] / sp); _q.setFromAxisAngle(_ax, (sp * dt) / BALL_R); m.quaternion.premultiply(_q); }
    m.position.set(bx[i], CLOTH_Y + BALL_R, bz[i]);
  }
}
// the white back on the cloth after it went down: on the head spot, or the nearest clear place behind it
function respot() {
  for (let k = 0; k < 40; k++) {
    const x = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.06, z = -PZ / 2 - Math.floor(k / 8) * 0.06;
    let clear = Math.abs(x) < PX - BALL_R;
    for (let j = 1; j < N && clear; j++) if (on[j] && (bx[j] - x) ** 2 + (bz[j] - z) ** 2 < D2 * 1.2) clear = false;
    if (clear) { bx[0] = x; bz[0] = z; break; }
  }
  vx[0] = vz[0] = 0; on[0] = 1; BIL.balls[0].visible = true;
}
function strike(ax, az, power) {
  const v = 0.35 + power * (VMAX - 0.35);
  vx[0] = ax * v; vz[0] = az * v;
  G.shot = { potted: [], scratch: false, first: -1 }; G.shots++;
  sfx.play('click');
}

/* ---------- a shot, worked out (the people's turns) ---------- */
// is the way from (x0, z0) to (x1, z1) clear for a ball (none of the others within two radii of it)?
function clearWay(x0, z0, x1, z1, skip1, skip2) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
  for (let j = 0; j < N; j++) {
    if (j === skip1 || j === skip2 || on[j] !== 1) continue;
    const t = Math.max(0, Math.min(1, ((bx[j] - x0) * dx + (bz[j] - z0) * dz) / L2)), ex = x0 + dx * t - bx[j], ez = z0 + dz * t - bz[j];
    if (ex * ex + ez * ez < D2 * 0.98) return false;
  }
  return true;
}
// the shot a player would take: the easiest pot they can see (a short, straight one first), with their hand's wobble;
// none in sight: a firm one at the nearest ball
function plan(skill) {
  const cands = [];
  for (let i = 1; i < N; i++) {
    if (on[i] !== 1) continue;
    for (const P of POCKETS) {
      const px = P.x - bx[i], pz = P.z - bz[i], pl = Math.hypot(px, pz), ux = px / pl, uz = pz / pl;
      const gx = bx[i] - ux * 2 * BALL_R, gz = bz[i] - uz * 2 * BALL_R;   // the ghost ball: where the white must be at the kiss
      const cx = gx - bx[0], cz = gz - bz[0], cl = Math.hypot(cx, cz); if (cl < 0.02) continue;
      const cut = (cx * ux + cz * uz) / cl; if (cut < 0.35) continue;
      if (!clearWay(bx[0], bz[0], gx, gz, 0, i) || !clearWay(bx[i], bz[i], P.x, P.z, i, 0)) continue;
      cands.push({ ax: cx / cl, az: cz / cl, d: cl + pl, score: cut / (0.3 + cl + pl * 1.4) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  let s = cands[Math.floor(Math.random() * Math.min(2, cands.length))];
  if (!s) {
    let best = -1, bd = Infinity;
    for (let i = 1; i < N; i++) if (on[i] === 1) { const d = Math.hypot(bx[i] - bx[0], bz[i] - bz[0]); if (d < bd) { bd = d; best = i; } }
    if (best < 0) return { ax: 0, az: 1, power: 0.5 };
    const dx = bx[best] - bx[0], dz = bz[best] - bz[0], d = Math.hypot(dx, dz) || 1;
    s = { ax: dx / d, az: dz / d, d: bd + 0.5 };
  }
  const wob = (1 - skill) * 0.08 * (Math.random() + Math.random() - 1), c = Math.cos(wob), sn = Math.sin(wob);
  return { ax: s.ax * c - s.az * sn, az: s.ax * sn + s.az * c, power: Math.min(0.95, 0.22 + s.d * 0.32 + Math.random() * 0.08) };
}
// the break: hard, at the apex, from where the white is
const breakShot = () => { const dx = bx[1] - bx[0], dz = bz[1] - bz[0], d = Math.hypot(dx, dz); return { ax: dx / d + rand(-0.01, 0.01), az: dz / d, power: 0.95 }; };

/* ---------- the walk round the table ----------
   A rectangle 0.42 m out from the rails, walked along its edges: s runs 0 → 4 round it (each side 1; corner k at s = k).
   Where to stand for a shot: on it, straight back from the white along the cue. */
const corner = (k) => [[-RX, -RZ], [RX, -RZ], [RX, RZ], [-RX, RZ]][((k % 4) + 4) % 4];
function ringS(x, z) {
  const ex = Math.abs(Math.abs(x) - RX), ez = Math.abs(Math.abs(z) - RZ);
  if (ez <= ex) return z < 0 ? (x + RX) / (2 * RX) : 2 + (RX - x) / (2 * RX);
  return x > 0 ? 1 + (z + RZ) / (2 * RZ) : 3 + (RZ - z) / (2 * RZ);
}
function ringAt(s) {
  s = ((s % 4) + 4) % 4; const k = Math.floor(s), f = s - k, [ax, az] = corner(k), [cx, cz] = corner(k + 1);
  return [ax + (cx - ax) * f, az + (cz - az) * f];
}
// the corners passed going from a to b the shorter way round (floor coordinates)
function ringWay(a, b) {
  const fwd = (((b - a) % 4) + 4) % 4, out = [];
  if (fwd <= 2) { for (let k = Math.floor(a) + 1; k < a + fwd; k++) out.push(W(...corner(k))); }
  else { const back = 4 - fwd; for (let k = Math.ceil(a) - 1; k > a - back; k--) out.push(W(...corner(k))); }
  return out;
}
function behind(ax, az) {   // where the cue's line back from the white meets the walk
  let t = Infinity;
  if (ax) t = Math.min(t, ((ax < 0 ? RX : -RX) - bx[0]) / -ax);
  if (az) t = Math.min(t, ((az < 0 ? RZ : -RZ) - bz[0]) / -az);
  return [bx[0] - ax * t, bz[0] - az * t];
}
// the places each side starts from and leaves by: the two nearest the sofa's end, straight from its node
let EXITS = null;
const exits = () => (EXITS ??= [[-0.1, -RZ, 'LGr'], [-RX, -0.8, 'LGr']].map(([x, z, node]) => { const [wx, wz] = W(x, z); return { x: wx, z: wz, face: faceTo(wx, wz, BIL.x, BIL.z), node, s: ringS(x, z) }; }));
// someone walks along the walk to s, then turns to face `look` (floor point)
function walkTo(p, s, look, then) {
  const [x, z] = ringAt(s), [wx, wz] = W(x, z);
  p.s = s; p.look = look; p.then = then;
  if (!p.w) { p.arrived = true; then?.(); return; }
  p.arrived = false;
  const spot = { x: wx, z: wz, face: faceTo(wx, wz, look[0], look[1]), node: exits()[p.i].node, direct: true, via: ringWay(p.ws ?? s, s), origin: exits()[p.i] };
  p.ws = s;
  p.w.goTo(spot, () => { p.arrived = true; p.w.faceTarget = spot.face; p.then?.(); });
}

/* ---------- the cues in their hands ---------- */
const UP = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
// along the shot, its tip just behind the white (drawn back by `back` m), the butt raised a little; else upright beside
// them. Where the butt would reach past the walk round the table (into the arcade, the sofa, off the floor) it is jacked
// up steeper, the way you play off a wall.
function cueAim(c, ax, az, back) {
  const tipX = bx[0] - ax * (BALL_R + 0.012 + back), tipZ = bz[0] - az * (BALL_R + 0.012 + back);
  let e = 0.07;
  for (; e < 0.6; e += 0.12) { const h = 1.454 * Math.cos(e); if (Math.abs(tipX - ax * h) < RX + 0.18 && Math.abs(tipZ - az * h) < RZ + 0.18) break; }
  _d.set(ax * Math.cos(e), -Math.sin(e), az * Math.cos(e)).normalize();
  c.quaternion.setFromUnitVectors(UP, _d);
  c.position.set(BIL.x + tipX - _d.x * 1.454, CLOTH_Y + BALL_R + 0.005 - _d.y * 1.454, BIL.z + tipZ - _d.z * 1.454);
}
function cueBeside(c, w) {
  const f = w.root.rotation.y, rx = Math.cos(f), rz = -Math.sin(f);
  c.quaternion.identity(); c.rotation.set(0.06 * Math.sin(f), 0, -0.06 * Math.cos(f));
  c.position.set(w.pos.x + rx * 0.24 + Math.sin(f) * 0.08, 0, w.pos.y + rz * 0.24 + Math.cos(f) * 0.08);
}

/* ---------- a frame ---------- */
function player(w, i) { return { w, i, name: w ? nameOf(w) : tr('fp.bil.you'), e: null, cue: null, s: 0, ws: null, arrived: !w, look: null, skill: rand(0.55, 0.9) }; }
function takeCue(p, k) { p.cue = cueMesh(k ? '#7A4A2A' : '#2B2F36'); scene.add(p.cue); BIL.cues[k].visible = false; }
function dropCues() { for (const p of G?.p || []) p.cue?.removeFromParent(); for (const c of BIL.cues) c.visible = true; }
/** A frame now (?debug: __office.bilGame()), else now and then on its own. Returns whether one started. */
export function billiards(force = false) {
  if (G || ME || !BIL || replay.on || reduceMotion) return false;
  const h = officeNow().getHours();
  if (!force && (napOn || h < 10 || h >= 22)) return false;
  const list = who(); if (list.length < 2) return false;
  const a = list.splice(Math.floor(Math.random() * list.length), 1)[0], b = list[Math.floor(Math.random() * list.length)];
  start(true, [a, b]);
  chatSay(a.id, pick('people.billiards.chatInvite'));
  chatSay(b.id, pick('people.billiards.chatJoin'), { delay: 2600 });
  return true;
}
function start(npc, ws) {
  rack();
  const was = G?.p || [];   // (another frame at once, first person: whoever is already at the table stays there)
  G = { npc, p: ws.map((w, i) => player(w, i)), turn: 0, stage: 'gather', score: [0, 0], end: state.sim + rand(170, 300), shot: null, at: state.sim, shots: 0, broke: false };
  G.p.forEach((p, i) => {
    takeCue(p, i);
    if (!p.w) return;
    const old = was.find((q) => q.w === p.w && q.arrived && p.w.chore === q.e);
    if (old) { Object.assign(p, { e: old.e, s: old.s, ws: old.ws, arrived: true }); return; }
    const ex = exits()[i];
    p.s = p.ws = ex.s;
    p.e = p.w.errand({ type: 'idle', spot: { x: ex.x, z: ex.z, face: ex.face, node: ex.node }, look: [BIL.x, BIL.z], anim: 'idle', wait: i ? 2.4 : 0.4, hold: 0.4, anim2: 'idle', linger: 0.8,
      line: i ? pick('people.billiards.join') : pick('people.billiards.invite') });
    p.e.until = G.end + 600;
  });
}
// the end of it: both walk back round to where they came in, put the cues back, and go back to their places
function finish(after = 0) {
  if (!G || G.stage === 'over') return;
  G.stage = 'over'; G.at = state.sim;
  for (const p of G.p) {
    if (!p.w || p.w.chore !== p.e) continue;
    p.w.anim = 'idle';
    const ex = exits()[p.i];
    const end = () => { p.w.spot = { x: ex.x, z: ex.z, face: ex.face, node: ex.node }; p.e.until = state.sim + after; if (p.w.after) p.w.afterAt = Math.min(p.w.afterAt, p.e.until); };
    if (Math.abs(p.s - ex.s) < 0.02) end(); else walkTo(p, ex.s, [BIL.x, BIL.z], end);
  }
}
function gameOver() {
  const [a, b] = G.score, solo = !G.p[1];
  if (solo) { toast(tr('fp.bil.cleared', { n: G.shots })); }
  else if (a === b) { for (const p of G.p) if (p.w) quip(p.w, pick('people.billiards.draw'), 'idle'); }
  else {
    const win = G.p[a > b ? 0 : 1], lose = G.p[a > b ? 1 : 0];
    if (win.w) { quip(win.w, pick('people.billiards.win'), 'idle'); win.w.anim = 'celebrate'; chatSay(win.w.id, tr('people.billiards.chatWin', { name: lose.name, a: Math.max(a, b), b: Math.min(a, b) }), { react: ['😆', '👍', '❤️'] }); }
    if (lose.w) { quip(lose.w, pick('people.billiards.lose'), 'idle'); lose.w.anim = 'think'; }
    if (ME) toast(win.w ? tr('fp.bil.youLost', { name: win.name, a: Math.max(a, b), b: Math.min(a, b) }) : tr('fp.bil.youWon', { a: Math.max(a, b), b: Math.min(a, b) }), 6000);
  }
  sfx.play('clap');
  if (G.npc) finish(2.4); else { G.stage = 'over'; G.at = state.sim; }
}
// the shot has run out: count it, then whose turn
function settle() {
  const sh = G.shot, p = G.p[G.turn], n = sh.potted.length;
  G.score[G.turn] += n;
  if (sh.scratch) respot();
  if (p.w) {
    if (sh.scratch) quip(p.w, pick('people.billiards.scratch'), 'idle');
    else if (n) quip(p.w, pick(n > 1 ? 'people.billiards.double' : 'people.billiards.pot'), 'idle');
    else if (Math.random() < 0.4) quip(p.w, pick('people.billiards.miss'), 'idle');
  } else if (ME) toast(sh.scratch ? tr('fp.bil.scratch') : n ? tr('fp.bil.pot', { n: G.score[G.turn] }) : tr('fp.bil.miss'), 2200);
  const other = G.p[1 - G.turn];
  if (other?.w && n && !sh.scratch && Math.random() < 0.35) quip(other.w, pick('people.billiards.nice'), 'idle');
  G.shot = null;
  if (!left() || (G.p[1] && Math.max(...G.score) >= (G.npc ? TARGET : 8)) || (G.npc && state.sim > G.end && (G.score[0] !== G.score[1] || state.sim > G.end + 120))) { gameOver(); return; }
  if (sh.scratch || !n) G.turn = G.p[1] ? 1 - G.turn : 0;
  G.stage = 'turn';
}
// a person's turn: work out the shot, walk round behind the white, bend over, a few practice strokes, then through it
function npcTurn(p) {
  const sh = G.broke ? plan(p.skill) : breakShot();
  G.broke = true;
  G.aim = sh; G.stage = 'walk';
  const [sx, sz] = behind(sh.ax, sh.az), s = ringS(sx, sz), other = G.p[1 - G.turn];
  // the other one steps aside if they are in the way
  const d = ((other?.s - s + 6) % 4) - 2;
  if (other?.w && other.arrived && Math.abs(d) < 0.3) walkTo(other, other.s + (d >= 0 ? 0.35 : -0.35), W(bx[0], bz[0]));
  G.walkAt = state.sim;
  walkTo(p, s, W(bx[0], bz[0]), () => { if (G?.stage !== 'walk' || G.p[G.turn] !== p) return; G.stage = 'aim'; G.at = state.sim; G.strokes = rand(1.4, 2.6); p.w.anim = 'cue'; });
}

/* ---------- first person: a cue in your hands ---------- */
const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'p', ShiftLeft: 'f', ShiftRight: 'f' };
export function playFp() {
  if (!BIL || !fp?.on || ME) return;
  if (G?.npc) { toast(tr('fp.bil.busy', { a: G.p[0].name, b: G.p[1].name })); return; }
  const mate = who()[0] || null;
  start(false, mate ? [null, mate] : [null]);
  ME = { power: 0, charging: false, chargeAt: 0, keys: new Set() };
  document.body.classList.add('is-gaming');
  showHud(true);
  toast(tr(mate ? 'fp.bil.withMate' : 'fp.bil.alone', { name: mate ? nameOf(mate) : '' }), 6000);
  sfx.play('click');
}
function standUp() {
  if (!ME) return;
  if (G && !G.npc) { G.stage = 'playing'; finish(0); for (const p of G.p) p.cue?.removeFromParent(); dropCues(); G = null; rack(); }
  if (fp) fp.anim = null;
  document.body.classList.remove('is-gaming');
  showHud(false); if (guide) guide.visible = ghost.visible = false;
  ME = null;
}
function onKey(e, down) {
  if (!ME || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (down && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); standUp(); toast(tr('fp.bil.up')); return; }
  const k = KEYS[e.code]; if (!k && !/^Key[WS]|Arrow(Up|Down)$/.test(e.code)) return;
  e.preventDefault(); e.stopPropagation();   // (your feet stay put while you hold a cue)
  if (!k) return;
  if (down) ME.keys.add(k); else ME.keys.delete(k);
  if (k === 'p' && down && !ME.charging && myTurn() && !e.repeat) { ME.charging = true; ME.chargeAt = state.sim; }
  if (k === 'p' && !down && ME.charging) { ME.charging = false; if (myTurn()) shootMine(); }
}
const myTurn = () => !!(ME && G && !G.npc && G.stage === 'you' && !G.p[G.turn].w);
function shootMine() {
  const a = fp.yaw;
  G.stage = 'stroke'; G.at = state.sim; G.aim = { ax: Math.sin(a), az: Math.cos(a), power: Math.max(0.05, ME.power) };
}
// the line the white will take, to the first ball or cushion, and a ring where it would kiss a ball
function drawGuide(ax, az) {
  let t = 3;
  for (let j = 1; j < N; j++) {
    if (on[j] !== 1) continue;
    const ox = bx[j] - bx[0], oz = bz[j] - bz[0], along = ox * ax + oz * az; if (along <= 0) continue;
    const off2 = ox * ox + oz * oz - along * along; if (off2 >= D2) continue;
    t = Math.min(t, along - Math.sqrt(D2 - off2));
  }
  if (ax) t = Math.min(t, ((ax > 0 ? PX - BALL_R : -(PX - BALL_R)) - bx[0]) / ax);
  if (az) t = Math.min(t, ((az > 0 ? PZ - BALL_R : -(PZ - BALL_R)) - bz[0]) / az);
  const y = CLOTH_Y + 0.004, p = guide.geometry.attributes.position;
  p.setXYZ(0, BIL.x + bx[0], y, BIL.z + bz[0]); p.setXYZ(1, BIL.x + bx[0] + ax * t, y, BIL.z + bz[0] + az * t); p.needsUpdate = true;
  ghost.position.set(BIL.x + bx[0] + ax * t, y, BIL.z + bz[0] + az * t);
  guide.visible = ghost.visible = true;
}
function showHud(show) {
  if (!hud) {
    hud = el('div', 'bil-hud'); hud.innerHTML = '<b class="bil-score"></b><span class="bil-turn"></span><i class="bil-power"><i></i></i><small class="bil-help"></small>';
    $('stage-wrap').append(hud);
  }
  hud.hidden = !show;
}
function drawHud() {
  if (!hud || hud.hidden || !G) return;
  const [a, b] = G.score, mate = G.p[1];
  hud.querySelector('.bil-score').textContent = mate ? `${tr('fp.bil.you')} ${a} – ${b} ${mate.name}` : tr('fp.bil.soloScore', { n: a, left: left() });
  hud.querySelector('.bil-turn').textContent = G.stage === 'over' ? tr('fp.bil.again') : G.stage === 'gather' ? tr('fp.bil.waiting', { name: mate?.name || '' })
    : myTurn() || (G.stage === 'stroke' && !G.p[G.turn].w) ? tr('fp.bil.yourTurn') : G.stage === 'roll' ? '…' : tr('fp.bil.theirTurn', { name: mate?.name || '' });
  hud.querySelector('.bil-power > i').style.width = `${Math.round((ME?.charging ? ME.power : 0) * 100)}%`;
  hud.querySelector('.bil-help').textContent = tr('fp.bil.help');
}
// your place at the table while it's your turn: straight back from the white along your aim, looking down the cue
function placeMe(dt) {
  const ax = Math.sin(fp.yaw), az = Math.cos(fp.yaw), [sx, sz] = behind(ax, az), [wx, wz] = W(sx, sz);
  const k = Math.min(1, dt * 8); ME.at = [wx, wz];
  fp.pos.x += (wx - fp.pos.x) * k; fp.pos.y += (wz - fp.pos.y) * k;
  fp.pitch = -Math.atan2(1.28 - CLOTH_Y, Math.hypot(sx - bx[0], sz - bz[0])) - 0.12;   // (the white a little above the middle, the cue under it)
}

/* ---------- each frame ---------- */
export function updateBilliards(dt) {
  if (!BIL) return;
  if (!G && !ME && state.sim > nextAt) { nextAt = state.sim + 30; if (Math.random() < 0.15 && billiards()) nextAt = state.sim + rand(900, 1800); }
  if (ME && !fp.on) standUp();
  if (G) {
    const npcs = G.p.filter((p) => p?.w), cur = G.p[G.turn];
    const gone = (p) => p.w.chore !== p.e || p.w.leaving || !p.w.root.parent;
    if (G.stage === 'over') {
      if (G.npc && npcs.every(gone)) { dropCues(); G = null; nextAt = state.sim + rand(900, 1800); rack(); }
      else if (!G.npc && state.sim - G.at > 4) { for (const p of G.p) p.cue?.removeFromParent(); start(false, G.p.map((p) => p.w)); }
    } else if (npcs.some(gone) || npcs.some((p) => called(p.w))) {
      const c = npcs.find((p) => called(p.w)); if (c) quip(c.w, pick('people.billiards.called'), 'idle');
      if (G.npc) finish();
      else {   // (first person: your colleague goes, you carry on on your own)
        for (const p of npcs) { p.cue?.removeFromParent(); BIL.cues[p.i].visible = true; if (p.w.chore === p.e) { p.e.until = state.sim; if (p.w.after) p.w.afterAt = Math.min(p.w.afterAt, state.sim); } }
        G.p.length = 1; G.turn = 0; if (G.stage !== 'roll' && G.stage !== 'stroke') G.stage = 'turn';
      }
    } else if (G.stage === 'gather') { if (npcs.every((p) => p.arrived || (p.w.chore === p.e && p.e.stage === 'go' && p.w.phase !== 'walk' && Math.hypot(p.w.pos.x - exits()[p.i].x, p.w.pos.y - exits()[p.i].z) < 0.3))) { for (const p of npcs) p.arrived = true; G.stage = 'turn'; } }
    else if (G.stage === 'turn') { if (cur.w) npcTurn(cur); else { G.stage = 'you'; const a = G.broke ? plan(1) : breakShot(); G.broke = true; fp.yaw = Math.atan2(a.ax, a.az); } }   // (your cue starts on a sensible line)
    else if (G.stage === 'aim' || G.stage === 'stroke') {
      // practice strokes, then through: the ball goes as the cue crosses it
      const t = state.sim - G.at, a = G.aim, mine = !cur.w;
      let back;
      if (G.stage === 'aim') { back = 0.06 + 0.06 * Math.sin(t * 5.5) ** 2; if (t > G.strokes) { G.stage = 'stroke'; G.at = state.sim; } }
      else { const u = t / 0.22; back = u < 0.6 ? 0.06 + (u / 0.6) * 0.12 : 0.18 - ((u - 0.6) / 0.4) * 0.2; if (u >= 1) { strike(a.ax, a.az, a.power); G.stage = 'roll'; } }
      if (cur.cue) cueAim(cur.cue, a.ax, a.az, Math.max(0, back));
      const P = mine ? fp.P : cur.w.P; if (P) P.stroke = Math.max(0, back) / 0.18;
      if (mine) fp.anim = 'cue';
    } else if (G.stage === 'walk' && state.sim - G.walkAt > 25) { G.stage = 'aim'; G.at = state.sim; G.strokes = 1; cur.w.anim = 'cue'; }   // (held up on the way: take it from there)
    else if (G.stage === 'roll') {
      for (let t = Math.min(dt, 0.25); t > 0; t -= H) physics(Math.min(t, H));   // (real time even at a few frames a second)
      if (!moving()) { if (cur.w) cur.w.anim = 'idle'; if (!cur.w && fp) fp.anim = null; settle(); }
    }
    // cues held by whoever isn't bent over a shot
    for (const p of G?.p || []) {
      if (!p.cue) continue;
      const shooting = G.p[G.turn] === p && (G.stage === 'aim' || G.stage === 'stroke' || (G.stage === 'you' && !p.w));
      if (shooting) continue;
      if (p.w) cueBeside(p.cue, p.w); else if (fp?.avatar) cueBeside(p.cue, { root: fp.avatar, pos: fp.pos });
    }
  }
  // first person: aiming (←/→ or a drag turns you round the white), the power swinging while Space is held
  if (ME && G) {
    if (myTurn()) {
      const turn = (ME.keys.has('r') ? 1 : 0) - (ME.keys.has('l') ? 1 : 0);
      fp.yaw -= turn * dt * (ME.keys.has('f') ? 0.25 : 1.1);
      placeMe(dt);
      fp.anim = 'cue';
      if (ME.charging) ME.power = (1 - Math.cos(((state.sim - ME.chargeAt) * Math.PI) / 1.1)) / 2;
      const ax = Math.sin(fp.yaw), az = Math.cos(fp.yaw);
      cueAim(G.p[0].cue, ax, az, 0.05 + (ME.charging ? ME.power * 0.14 : 0));
      if (fp.P) fp.P.stroke = ME.charging ? ME.power : 0.3;
      drawGuide(ax, az);
    } else if (guide) guide.visible = ghost.visible = false;
    drawHud();
  }
  draw(dt);
}
// the table clicked (third person): the score, else two people called over; in first person, pick up a cue
export function tableClick() {
  if (fp?.on) { playFp(); return; }
  if (G?.npc) { toast(G.stage === 'gather' ? tr('props.billiards.coming', { a: G.p[0].name, b: G.p[1].name }) : tr('props.billiards.score', { a: G.p[0].name, b: G.p[1].name, x: G.score[0], y: G.score[1] })); return; }
  if (billiards(true)) toast(tr('props.billiards.called', { a: G.p[0].name, b: G.p[1].name }), 5000);
  else toast(tr(ME ? 'props.billiards.you' : 'props.billiards.nobody'));
}
export const bilState = () => ({ stage: G?.stage || null, npc: !!G?.npc, score: G?.score.slice() || null, turn: G?.turn ?? null, shots: G?.shots || 0, players: G ? G.p.map((p) => p.w?.id || 'you') : [],
  me: !!ME, left: left(), moving: moving(), white: [+bx[0].toFixed(3), +bz[0].toFixed(3)],
  cues: G ? G.p.map((p) => p.cue && [p.cue.position.x, p.cue.position.y, p.cue.position.z].map((v) => +v.toFixed(2))) : [],
  at: G ? G.p.map((p) => (p.w ? [+p.w.pos.x.toFixed(2), +p.w.pos.y.toFixed(2)] : null)) : [] });

let hooked = false;
export function setup() {
  if (!PRO || !BIL) return;
  RX = BIL.OX + 0.42; RZ = BIL.OZ + 0.42;
  rack();
  nextAt = rand(200, 500);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    guide = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.75 })); guide.userData.dynamic = true; guide.visible = false; guide.frustumCulled = false; scene.add(guide);
    ghost = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 0.85, BALL_R, 24), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ghost.rotation.x = -Math.PI / 2; ghost.userData.dynamic = true; ghost.visible = false; scene.add(ghost); }
  window.addEventListener('keydown', (e) => onKey(e, true), true);
  window.addEventListener('keyup', (e) => onKey(e, false), true);
  window.addEventListener('blur', () => { ME?.keys.clear(); if (ME) ME.charging = false; });
  if (new URLSearchParams(location.search).has('debug')) {
    const hook = () => { if (hooked) return; if (!window.__office) { setTimeout(hook, 500); return; } hooked = true;
      Object.assign(window.__office, { bilGame: () => billiards(true), bilPlay: playFp, bilStand: standUp,
        bilShot: (angle = 0, power = 0.8) => { if (!myTurn()) return false; fp.yaw = angle; ME.power = power; shootMine(); return true; } });
      Object.defineProperty(window.__office, 'bil', { get: bilState, configurable: true }); };
    setTimeout(hook, 0);
  }
}
