// Diễn tập PCCC: the quarterly fire drill (company floor). On the first working day of each quarter (src/shared/
// workdays.js) HR pins the notice in the group chat in the morning, and at 15:00 the fire alarm rings (with the sound
// on) and the horn-strobes on the walls flash. The lift goes down to the ground floor and parks (as a lift does on a
// fire alarm); nobody takes it. HR, the floor's fire marshal (đội viên PCCC cơ sở) in a red armband, calls everyone out,
// and everyone on the floor (every session's person, working or not, the receptionist, the director) walks to the
// stairs and down; HR checks the floor and goes last. With the city outside they come out at the street door to the
// assembly point on the pavement (a green "ĐIỂM TẬP KẾT" standee by the kerb), stand in two rows, and HR takes the roll
// on her clipboard, name by name ("Có!"), then reports the count and the time it took. The building's guard, the other
// marshal in a red armband, shows the extinguisher on a small practice fire in a steel tray: shake, pull the pin, aim at
// the base of the fire, squeeze; the powder, the fire out; a round of applause. Then everyone back up in the lift and on
// with the day. It is all for show: the sessions go on working all the while (their people just take part), and a
// session's own work waits for them only in the picture.
//   As the law has it: the Luật Phòng cháy, chữa cháy và cứu nạn, cứu hộ (2024) and Nghị định 105/2025/NĐ-CP, Điều 16:
//   a facility's fire plan is practised at least once a year (many companies do it every quarter); escape by the stairs
//   only, never the lift (Cục Cảnh sát PCCC và CNCH's guidance); the assembly, the roll call, and the hand
//   extinguisher's use (lắc bình, giật chốt, hướng loa phun vào gốc lửa, bóp van).
// Settings → More turns it off. ?drill: one now; ?debug: __office.drill.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, pad2, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex } from '../scene/blocks.js';
import { boxAt, colorize, mergeAll, vmat } from '../world/terrace.js';
import { lift, liftArrive, liftIdle, stairsDown } from '../world/entrance.js';
import { DOOR_OUT } from '../people/navigation.js';
import { dn, sessions, workers } from '../people/workers.js';
import { later } from '../people/errands.js';
import { mainExit, outside, resume, street, walk } from '../people/outings.js';
import { guardPost, marshal } from '../people/guard.js';
import { hrOnDuty } from '../people/hr.js';
import { director } from '../people/director.js';
import { staff } from '../people/staff.js';
import { sfx } from '../audio/sfx.js';
import { chatLife } from '../ui/group-chat.js';
import { queueUi, toast } from '../ui/activity.js';
import { dayKey, isWorkday, quarterStart } from '../../shared/workdays.js';
import { t as tr } from '../../i18n/index.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const FORCE = Q.has('drill'), AT = 900, KEY = 'office-drill', DONE_KEY = 'office-drill-day';
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
let D = null, last = null, checkAt = 0, noticeDay = '', strobes = null, kit = null, forced = false, bornAt = 0;
const minutes = (d = officeNow()) => d.getHours() * 60 + d.getMinutes();
const quarterOf = (d) => tr('life.drill.quarters', null, 'list')[Math.floor(d.getMonth() / 3)];   // (I–IV in Vietnamese, 1–4 in English)
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* storage blocked */ } return null; };
/** whether the drill is on (Settings → More) */
export const drillOn = () => store(KEY) !== 'off';
/** today is the quarter's first working day (the drill's day) */
export const drillDay = (d = officeNow()) => isWorkday(d) && dayKey(quarterStart(d)) === dayKey(d);
function say(w, key, vars, ms = 3500) { const text = tr(`life.drill.${key}`, vars); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); return text; }

/* ---------- the horn-strobes on the walls (always there, as in any office; flashing in a drill) ---------- */
const STROBES = [[-7.95, 2.55, 2.1, Math.PI / 2], [-7.95, 2.55, 6.3, Math.PI / 2], [0.3, 2.85, -7.95, 0], [4.2, 2.85, -7.95, 0], [13.52, 2.62, -7.95, 0]];
function buildStrobes() {
  const parts = [], lens = [];
  for (const [x, y, z, ry] of STROBES) {
    const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    parts.push(boxAt(0.15, 0.2, 0.05, 0, 0, 0.025, '#C8261B').applyMatrix4(M), boxAt(0.11, 0.05, 0.02, 0, -0.045, 0.055, '#E9ECEF').applyMatrix4(M));
    lens.push(new THREE.BoxGeometry(0.1, 0.05, 0.03).translate(0, 0.045, 0.06).applyMatrix4(M));
  }
  const body = new THREE.Mesh(mergeAll(parts), vmat({ roughness: 0.5 })); scene.add(body);
  const lensM = new THREE.MeshBasicMaterial({ color: '#E9D9D2', toneMapped: false });
  const lensMesh = new THREE.Mesh(mergeAll(lens), lensM); lensMesh.userData.noMerge = true; scene.add(lensMesh);
  return { lensM, on: false, flashAt: 0 };
}
function flash(on) {
  if (!strobes) return;
  if (!on) { if (strobes.on) { strobes.on = false; strobes.lensM.color.set('#E9D9D2'); } return; }
  const t = state.sim, k = (t % 1) < 0.12;   // (once a second, a hard white blink)
  if (k !== strobes.on) { strobes.on = k; strobes.lensM.color.setRGB(k ? 6 : 0.9, k ? 6 : 0.85, k ? 6 : 0.82); }
}

/* ---------- on the pavement: the standee, the practice tray and its fire, the extinguisher and its powder ---------- */
function signTex() {
  return canvasTex(256, 320, (g, W, H) => {
    g.fillStyle = '#0E8A4A'; g.fillRect(0, 0, W, H); g.fillStyle = '#FFFFFF'; g.fillRect(14, 14, W - 28, 176);
    // the assembly sign: four arrows in to a group of people
    g.fillStyle = '#0E8A4A'; g.save(); g.translate(W / 2, 102);
    for (let k = 0; k < 4; k++) { g.save(); g.rotate((k * Math.PI) / 2); g.beginPath(); g.moveTo(-14, -78); g.lineTo(14, -78); g.lineTo(14, -60); g.lineTo(26, -60); g.lineTo(0, -40); g.lineTo(-26, -60); g.lineTo(-14, -60); g.closePath(); g.fill(); g.restore(); }
    for (const [x, s] of [[-22, 0.8], [22, 0.8], [0, 1]]) { g.beginPath(); g.arc(x, -14 * s, 8 * s, 0, 7); g.fill(); g.fillRect(x - 9 * s, -4 * s, 18 * s, 28 * s); }
    g.restore();
    g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 34px ${FONT}`; g.fillText(tr('life.drill.sign'), W / 2, 232, W - 20);
    g.font = `700 20px ${FONT}`; g.fillText(tr('life.drill.signSub'), W / 2, 274, W - 20);
  });
}
function buildKit() {
  const g = new THREE.Group(); g.visible = false; g.userData.dynamic = true; scene.add(g);
  // the standee: the board on a post, a weighted foot
  const stand = new THREE.Group(); g.add(stand);
  stand.add(new THREE.Mesh(mergeAll([colorize(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 14).translate(0, 0.025, 0), '#2B2F36'), colorize(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8).translate(0, 0.6, 0), '#9AA1A9')]), vmat({ roughness: 0.5 })));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.625), new THREE.MeshBasicMaterial({ map: signTex(), side: THREE.DoubleSide })); board.position.y = 1.45; stand.add(board);
  // the steel tray, the fuel's soot, the flames (three cones that flicker)
  const tray = new THREE.Group(); g.add(tray);
  tray.add(new THREE.Mesh(mergeAll([boxAt(0.62, 0.02, 0.62, 0, 0.01, 0, '#5E6670'), boxAt(0.62, 0.1, 0.02, 0, 0.05, 0.3, '#6E7680'), boxAt(0.62, 0.1, 0.02, 0, 0.05, -0.3, '#6E7680'), boxAt(0.02, 0.1, 0.62, 0.3, 0.05, 0, '#6E7680'), boxAt(0.02, 0.1, 0.62, -0.3, 0.05, 0, '#6E7680'), boxAt(0.56, 0.01, 0.56, 0, 0.03, 0, '#1E1F23')]), vmat({ roughness: 0.4, metalness: 0.4 })));
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.25), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const flames = [[0, 0, 0.5], [-0.12, 0.08, 0.36], [0.13, -0.06, 0.4]].map(([x, z, h]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1, 8).translate(0, 0.5, 0), flameM); f.position.set(x, 0.04, z); f.scale.set(1, h, 1); f.userData.h = h; tray.add(f); return f; });
  // the extinguisher (a red 4 kg powder one: the cylinder, the black valve and hose, its nozzle), carried in his hand
  const ext = new THREE.Mesh(mergeAll([colorize(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 14).translate(0, -0.24, 0), '#C8261B'), colorize(new THREE.CylinderGeometry(0.03, 0.04, 0.07, 10).translate(0, -0.01, 0), '#1E1F23'),
    boxAt(0.02, 0.02, 0.22, 0, 0.02, 0.1, '#1E1F23'), colorize(new THREE.CylinderGeometry(0.025, 0.012, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0.02, 0.24), '#1E1F23'), boxAt(0.1, 0.09, 0.002, 0, -0.22, 0.076, '#F4F4F2')]), vmat({ roughness: 0.4 }));
  g.add(ext);
  // the powder: a cone from the nozzle to the base of the fire
  const powder = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: '#F4F2EC', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  powder.visible = false; g.add(powder);
  return { g, stand, tray, flames, flameM, ext, powder, fire: 0 };
}
// the fire: 0 out, 1 burning; a flicker each frame while it burns
function stepFire(t) {
  const K = kit, f = K.fire;
  K.flameM.opacity = 0.9 * Math.min(1, f * 1.4);
  K.flames.forEach((m, i) => { const h = m.userData.h * f * (0.85 + 0.25 * Math.sin(t * (11 + i * 3) + i)); m.scale.set(0.8 + 0.3 * f, Math.max(0.001, h), 0.8 + 0.3 * f); m.visible = f > 0.02; });
}

/* ---------- the people ---------- */
// who is on the floor and can take part: in their place or walking about on the floor (not out, not in the lift, not
// in the middle of something of their own: a stall, a chore, an errand)
const onFloor = (w) => !!w.root.parent && !w.leaving && !w.coming && !w.leavingNow && !w.ritual && !w.job && !w.away && !w.homeBound && !w.street && !w.offstage && !w.outing && !w.chore && !w.liftHold && !w.liftWait && !w.liftRide && !w.stairs && !w.inStall && !w.wcBusy;
function gather() {
  const out = [];
  for (const w of workers.values()) if (!w.sub && onFloor(w)) out.push({ w, kind: 'worker', name: dn(sessions.get(w.id)) || w.cfg.name });
  const { receptionist } = staff();
  if (receptionist && onFloor(receptionist)) out.push({ w: receptionist, kind: 'staff', name: receptionist.cfg.name });
  if (director && onFloor(director) && !director.job && director.station === 'home') out.push({ w: director, kind: 'staff', name: director.cfg.name });
  return out;
}
const alive = (m) => !!D && !m.dead && m.w.chore?.drill === D && !m.w.leaving;
function join(m, k) {
  const w = m.w;
  m.home = { spot: w.spot, station: w.station, anim: w.anim, pose: w.pose };
  m.stage = 'go'; m.i = k;
  w.after = null; w.hush(); w.restAt = Infinity;
  w.chore = { drill: D, where: { ic: 'walk', text: tr('life.drill.where') } };
  later(reduceMotion ? 0.2 : rand(0.6, 2.4) + (m.hr ? 4 : 0), () => {
    if (!alive(m)) return;
    w.anim = 'idle'; if (Math.random() < 0.45 && !m.hr) say(w, 'go', null, 3000);
    m.stage = 'stairs';
    stairsDown(w, () => alive(m) && down(m), null);
  });
}
// down at the street door: out to the assembly point (with the city outside), or out of sight downstairs
function down(m) {
  const w = m.w, S = D.S;
  if (!S || !D.ex) { m.stage = 'there'; w.away = true; return; }
  outside(w, S, D.ex); m.stage = 'walk';
  const sp = m.hr ? D.front : D.spots[m.slot % D.spots.length];
  walk(w, S, [...(S.route(D.ex, sp) || []), { x: sp.x, z: sp.z }], () => {
    if (!alive(m)) return;
    m.stage = 'there'; w.faceTarget = Math.atan2(D.look.x - w.pos.x, D.look.z - w.pos.y); w.anim = m.hr ? 'idle' : Math.random() < 0.3 ? 'phone' : 'idle';
  }, Math.atan2(D.look.x - sp.x, D.look.z - sp.z));
}
// back up: to the street door, up in the lift (back in service), and back to where they were
function up(m) {
  const w = m.w, S = D?.S;
  m.stage = 'back';
  const ride = () => {
    if (!alive(m)) return;
    m.stage = 'up'; w.street = false; w.away = true; w.path = []; w.phase = 'idle';
    later(rand(2, 4.5), () => {
      if (!alive(m)) return;
      w.away = false; w.pos.set(DOOR_OUT.x, DOOR_OUT.z); w.face = w.faceTarget = Math.PI / 2; w.spot = DOOR_OUT;
      liftArrive(w);
      const home = m.kind === 'worker' ? w.homeSpot() : m.home.spot || w.homeSpot();
      w.goTo(home, () => settle(m));
    });
  };
  if (S && D.ex && w.street) walk(w, S, [...(S.route({ x: w.pos.x, z: w.pos.y }, D.ex) || []), { x: D.ex.x, z: D.ex.z }], ride); else ride();
}
// back in place: a session's person on with whatever is there; the staff as they were
function settle(m) {
  const w = m.w;
  m.dead = true; m.stage = 'done';
  if (w.chore?.drill) w.chore = null;
  armband(w, false);
  if (m.kind === 'worker') resume(w, false);
  else { w.station = m.home.station; w.anim = m.home.anim === 'walk' ? 'idle' : m.home.anim; w.pose = m.home.spot?.sit ? 'sit' : 'stand'; }
  queueUi();
}
// called off (a replay began, they left): back in their place at once
function drop(m) {
  if (m.dead) return;
  const w = m.w;
  m.dead = true; armband(w, false);
  if (w.chore?.drill) w.chore = null;
  if (w.leaving) return;
  w.street = false; w.away = false; w.stairs = null; w.liftHold = false; w.path = []; w.phase = 'idle'; w.onArrive = null; w.after = null;
  const at = m.kind === 'worker' ? w.homeSpot() : m.home?.spot || w.homeSpot();
  w.pos.set(at.x, at.z); w.spot = at; w.face = w.faceTarget = at.face; w.pose = at.sit ? 'sit' : 'stand';
  if (m.kind === 'worker') resume(w, false); else { w.station = m.home?.station; w.anim = m.home?.anim || 'idle'; }
}
// HR's clipboard with the list of names: held in front of her (chibi-rig's P.held, as the technician's meter)
let clipGeo;
function clipboard(w, on) {
  if (!on) { if (w.carry === 'clipboard') w.carry = null; return; }
  if (!w.P.held.clipboard) {
    clipGeo ||= mergeAll([boxAt(0.17, 0.23, 0.012, 0, 0, 0, '#9C6B3E'), boxAt(0.15, 0.19, 0.004, 0, -0.012, 0.008, '#FBFBF7'), boxAt(0.07, 0.03, 0.018, 0, 0.105, 0.006, '#9AA1A9'),
      ...[0, 1, 2, 3, 4].map((k) => boxAt(0.11, 0.008, 0.002, 0, 0.05 - k * 0.032, 0.011, '#3F7CC4'))]);
    const g = new THREE.Group(); g.position.set(0, -0.02, w.P.D.handR * 0.9); g.visible = false; w.P.armR.hand.add(g);
    const m = new THREE.Mesh(clipGeo, vmat({ roughness: 0.7 })); m.rotation.x = -0.9; g.add(m);
    w.P.held.clipboard = g;
  }
  w.carry = 'clipboard';
}
// the marshal's red armband on the upper left arm (HR; the guard's is drawn by people/guard.js)
let bandGeo, bandM;
function armband(w, on) {
  if (!on) { w.drillBand?.removeFromParent(); w.drillBand = null; return; }
  if (w.drillBand) return;
  bandGeo ||= new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); bandM ||= new THREE.MeshStandardMaterial({ color: '#D21F1F', roughness: 0.6, side: THREE.DoubleSide });
  const b = new THREE.Mesh(bandGeo, bandM), Dm = w.P.D;
  b.scale.set(Dm.armR * 1.25, 0.06, Dm.armR * 1.25); b.position.set(0, -Dm.upper * 0.42, 0); w.P.armL.sh.add(b); w.drillBand = b;
}

/* ---------- the assembly point on the office's own pavement (with the city outside) ---------- */
// two rows along the kerb's side (the scooters are parked along the building's side), beyond the guard's booth, away
// from the door; HR in front of them, the standee beside her, the practice tray a few steps further on
function layout(S, n) {
  const ex = mainExit(S); if (!ex) return null;
  const k = ex.L.axis === 'x' ? 0 : 1, lo = Math.min(ex.a[k], ex.b[k]) + 0.8, hi = Math.max(ex.a[k], ex.b[k]) - 0.8, booth = guardPost(ex);
  let dir = booth >= ex.s ? 1 : -1, s0 = booth + dir * 1.3;
  const cols = Math.max(2, Math.ceil(n / 2)), need = 1.3 + (cols - 1) * 0.62 + 3.2;
  if ((dir > 0 ? hi - s0 : s0 - lo) < need) { dir = -dir; s0 = ex.s + dir * 1.4; }   // (no room past the booth: the other way)
  const clamp = (s) => Math.min(hi, Math.max(lo, s)), side = S.pavementSide, P = (s, sd) => S.at(ex.L, clamp(s), sd);
  const spots = [];
  for (let c = 0; c < cols; c++) for (const sd of [side - 0.1, side - 0.6]) spots.push(P(s0 + dir * (1.3 + c * 0.62), sd));
  const front = P(s0, side - 0.35), end = s0 + dir * (1.3 + (cols - 1) * 0.62);
  return { ex, spots, front, look: P(s0 + dir * 1.6, side - 0.35), sign: P(s0 - dir * 0.2, side - 0.85), tray: P(end + dir * 2.4, side - 0.4), guardAt: P(end + dir * 0.9, side - 0.4), dir };
}

/* ---------- the drill ---------- */
function begin() {
  const d = officeNow(), S = street();
  const list = gather(), H = hrOnDuty();
  D = { phase: 'alarm', t0: state.sim, S, members: [], q: quarterOf(d), day: dayKey(d), ringUntil: state.sim + (reduceMotion ? 6 : 22), outAt: 0 };
  if (S) { const L = layout(S, list.length + 1); if (L) Object.assign(D, L); }
  strobes ||= buildStrobes();
  if (lift) lift.drill = true;
  sfx.play('alarm');
  toast(tr('life.drill.toast', { q: D.q }), 6000);
  // HR first to her feet: the armband on, the call, then she sees everyone out and goes last
  if (H && onFloor(H)) { list.push({ w: H, kind: 'staff', name: H.cfg.name, hr: true }); armband(H, true); later(0.8, () => D && say(H, 'call', null, 5000)); }
  list.forEach((m, k) => { m.slot = k; D.members.push(m); join(m, k); });
  if (D.S && D.ex) { kit ||= buildKit(); placeKit(); }
  marshal.on = !!(D.S && D.ex); marshal.at = D.guardAt || null; marshal.look = D.tray || null; marshal.act = 'walk';
  if (!FORCE) store(DONE_KEY, D.day);
  queueUi();
}
function placeKit() {
  const K = kit;
  K.g.visible = true; K.fire = 0; K.powder.visible = false; K.ext.visible = false;
  K.stand.position.set(D.sign.x, D.S.pavement, D.sign.z); K.stand.rotation.y = Math.atan2(D.look.x - D.sign.x, D.look.z - D.sign.z) + Math.PI;
  K.tray.position.set(D.tray.x, D.S.pavement, D.tray.z);
}
// the roll call: HR at the front with her clipboard, a name at a time, "Có!" and a wave; then the count
function rollCall() {
  D.phase = 'muster';
  const H = D.members.find((m) => m.hr && !m.dead), here = D.members.filter((m) => !m.hr && !m.dead);
  D.secs = Math.round(D.outAt - D.t0);
  if (!H || !D.S) { later(reduceMotion ? 2 : 20, () => D && demo()); return; }
  clipboard(H.w, true);
  const shown = here.slice(0, 12), gap = reduceMotion ? 0.4 : 1.25;
  shown.forEach((m, k) => later(1 + k * gap, () => {
    if (!D || !alive(H) || !alive(m)) return;
    H.w.say('idle', tr('life.drill.name', { name: m.name })); m.w.waveUntil = state.sim + 0.9;
    later(0.5, () => alive(m) && say(m.w, 'here', null, 1100));
  }));
  later(1.4 + shown.length * gap, () => {
    if (!D || !alive(H)) return;
    say(H.w, 'count', { n: here.length + 1, total: here.length + 1, time: `${Math.floor(D.secs / 60)}:${pad2(D.secs % 60)}` }, 5000);
    later(4, () => D && demo());
  });
}
// the extinguisher: the guard lights the tray, then shows how (with the city outside)
function demo() {
  D.phase = 'demo';
  if (!D.S || !kit || !marshal.on) { later(1, () => D && back()); return; }
  const steps = [[0, 'light', 'light'], [3, 'shake', 'shake'], [6, 'pin', 'pin'], [8, 'aim', 'aim'], [9.5, 'spray', 'spray'], [15, 'talk', 'done'], [21, 'walk', null]];
  D.demoAt = state.sim;
  for (const [s, act, line] of steps) later(reduceMotion ? s / 3 : s, () => {
    if (!D || D.phase !== 'demo') return;
    marshal.act = act; if (line) marshal.say(tr(`life.drill.guard.${line}`));
    if (act === 'light') kit.fire = 0.01;
    if (act === 'shake') kit.ext.visible = true;
    if (act === 'talk') { kit.powder.visible = false; sfx.play('clap'); for (const m of D.members) if (alive(m) && !m.hr) { m.w.anim = 'clap'; later(rand(2, 3.5), () => alive(m) && (m.w.anim = 'idle')); } }
    if (act === 'walk') { marshal.at = null; kit.ext.visible = false; later(2, () => D && back()); }
  });
  for (const m of D.members) if (alive(m) && m.stage === 'there') m.w.faceTarget = Math.atan2(D.tray.x - m.w.pos.x, D.tray.z - m.w.pos.y);
}
function back() {
  D.phase = 'back';
  if (lift) lift.drill = false;
  D.members.forEach((m, k) => { if (alive(m)) { if (m.hr) clipboard(m.w, false); later(reduceMotion ? 0.2 : 0.4 + k * rand(0.4, 0.9), () => alive(m) && up(m)); } });
}
function end() {
  const d = D; D = null;
  last = { ...state_(d), ended: true };
  if (lift) lift.drill = false;
  flash(false); marshal.on = false;
  if (kit) kit.g.visible = false;
  chatLife('drillDone', { q: d.q, n: d.members.length, time: `${Math.floor((d.secs || 0) / 60)}:${pad2((d.secs || 0) % 60)}`, every: 12 * 3600e3 });
  queueUi();
}
function stop() {   // called off (a replay): everyone back in place
  if (!D) return;
  for (const m of D.members) drop(m);
  const d = D; D = null; last = { ...state_(d), stopped: true };
  if (lift) lift.drill = false;
  flash(false); marshal.on = false; if (kit) kit.g.visible = false;
}

/* ---------- each frame ---------- */
export function updateDrill() {
  if (!PRO) return;
  if (D) { step(); return; }
  const now = performance.now();   // (by the wall clock: the office's own clock crawls when it draws a few frames a second)
  if (now < checkAt) return;
  checkAt = now + 4000;
  if (replay.on) return;
  const d = officeNow(), m = minutes(d), today = dayKey(d);
  if (FORCE && !forced && now - bornAt > 6000) { if (liftIdle() || now - bornAt > 20000) { forced = true; begin(); } return; }   // (?drill: once a page, the lift free first)
  if (!drillOn() || !drillDay(d)) return;
  // the morning: HR's notice, pinned in the group chat
  if (noticeDay !== today && m >= 510 && m < 690) { noticeDay = today; chatLife('drillNotice', { q: quarterOf(d), every: 12 * 3600e3 }); }
  // 15:00 (up to half past, if the page was closed at three), once
  if (m >= AT && m < AT + 30 && store(DONE_KEY) !== today && (liftIdle() || m >= AT + 2)) begin();
}
function step() {
  if (replay.on) { stop(); return; }
  const t = state.sim, dt = Math.min(0.2, t - (D.lastT ?? t)); D.lastT = t;
  flash(D.phase !== 'back' || t - D.t0 < 8);
  if (D.phase === 'alarm' && t < D.ringUntil && t > (D.ringAt || 0)) { D.ringAt = t + 1.7; sfx.play('alarm'); }
  if (kit?.g.visible) {
    if (kit.fire > 0 && marshal.act !== 'spray' && marshal.act !== 'talk' && marshal.act !== 'walk') kit.fire = Math.min(1, kit.fire + dt * 0.6);   // (it catches in a second or two)
    if (marshal.act === 'spray') { kit.fire = Math.max(0, kit.fire - dt * 0.3); aimPowder(); }   // (out in about three seconds of powder)
    stepFire(t);
    if (kit.ext.visible) marshal.hold(kit.ext);
  }
  for (const m of D.members) if (!m.dead && (m.w.leaving || !m.w.root.parent)) m.dead = true;
  const live = D.members.filter((m) => !m.dead);
  if (D.phase === 'alarm') {
    const out = live.every((m) => m.stage === 'there' || m.stage === 'walk');
    if (out && !D.outAt) D.outAt = t;
    if ((live.every((m) => m.stage === 'there') && live.length) || t - D.t0 > 150) { D.outAt ||= t; rollCall(); }
  }
  if ((D.phase === 'back' && live.every((m) => m.stage === 'done' || m.dead)) || (!live.length && D.phase !== 'alarm')) end();
}
// the powder from the nozzle to the base of the fire, sweeping a little
const _n = new THREE.Vector3();
function aimPowder() {
  const P = kit.powder, e = kit.ext;
  e.updateMatrixWorld(); _n.set(0, 0.02, 0.28).applyMatrix4(e.matrixWorld);
  const tx = D.tray.x + Math.sin(state.sim * 3) * 0.12, tz = D.tray.z, ty = D.S.pavement + 0.08, len = Math.hypot(tx - _n.x, ty - _n.y, tz - _n.z);
  P.visible = true; P.position.copy(_n); P.lookAt(tx, ty, tz); P.scale.set(1, 1, len); P.material.opacity = 0.35 + 0.2 * Math.random();
}

/* ---------- for tests (?debug) ---------- */
const state_ = (d) => d && ({ phase: d.phase, q: d.q, secs: d.secs ?? null, fire: kit ? +kit.fire.toFixed(2) : 0, lift: !!lift?.drill, strobe: !!strobes,
  members: d.members.map((m) => ({ id: m.w.id, stage: m.stage, hr: !!m.hr, street: !!m.w.street, x: +m.w.pos.x.toFixed(1), z: +m.w.pos.y.toFixed(1) })) });
const debug = {
  start: () => { if (D) return false; begin(); return true; },
  state: () => (D ? state_(D) : last),
  day: (iso) => { const d = new Date(`${iso}T12:00:00`); return { day: drillDay(d), first: dayKey(quarterStart(d)) }; },
};
if (Q.has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.drill = debug; }, 0);
export function setup() {
  bornAt = performance.now();
  if (!PRO) return;
  strobes = buildStrobes();
}
