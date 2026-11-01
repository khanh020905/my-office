// People who work here but aren't sessions: the receptionist, the evening cleaner, a Shopee courier with a parcel.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, rand, reduceMotion, replay, short } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../scene/blocks.js';
import { DOOR_IN, DOOR_OUT, NODES, wet } from './navigation.js';
import { Worker, dn, hash, npcs, sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { liftArrive, liftDown } from '../world/entrance.js';
import { wetSign } from '../life/rain.js';
import { night } from '../world/room-update.js';
import { altar, arrange, arranged, lightIncense, offeringDay } from '../life/altar.js';
import { sfx } from '../audio/sfx.js';
import { chatLife } from '../ui/group-chat.js';
import { t as tr } from '../../i18n/index.js';

/* - The receptionist (company floor) stands behind the lobby counter from 7:45 to 18:15, up and down by the lift.
   - A Shopee courier comes twice a day (late morning, mid afternoon) with a parcel for someone who is resting. On the
     company floor he leaves it on the counter and the receptionist calls out the name; in the small office he calls
     from the door. The one it is for walks over, takes the box back to the desk and opens it.
   - At 18:30 the cleaner comes up with her trolley, mops the main aisles one by one (a yellow "wet floor" sign at the
     start of each, the floor shining until it dries; anyone walking goes round the wet strip), empties the big bin by
     the pantry and goes home. */
// the Shopee mark: Simple Icons (CC0 path data, v15.17.0); the trademark is Shopee's
const SHOPEE = 'M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z';
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const today = () => officeNow().toDateString();
function say(w, key, vars, ms = 4500) { const text = tr(key, vars); w.say('idle', text); setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, ms); }

let Staff;   // (a class once Worker exists)
let receptionist = null, cleaner = null, courier = null;

/* ---------- in and out: the lift on the company floor, the door in the small office ---------- */
function arrive(p, then) {
  p.offstage = false; p.hush(); p.path = []; p.phase = 'idle'; p.anim = 'idle';
  if (PRO) { liftArrive(p); p.waitLift = then; return; }
  p.pos.set(DOOR_OUT.x, DOOR_OUT.z); p.face = p.faceTarget = Math.PI / 2; p.spot = DOOR_OUT; then();
}
function depart(p, then) {
  const gone = () => { p.offstage = true; p.spot = null; p.leavingNow = false; then?.(); };
  p.leavingNow = true;
  p.goTo(DOOR_IN, () => {
    if (!PRO) { p.goTo(DOOR_OUT, gone); return; }
    liftDown(p, gone);
  });
}

/* ---------- the parcel: a brown carton, orange Shopee tape over the top, the label on the front ---------- */
let boxGeo, boxM, tapeM, labelM;
function parcel() {
  const g = new THREE.Group(); g.visible = false; g.userData.dynamic = true;
  const b = new THREE.Mesh(boxGeo, boxM); b.castShadow = true; g.add(b);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.232, 0.07), tapeM), 0, 0, 0);
  put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), labelM), 0.06, 0, 0.131);
  return g;
}
const carried = new Map();   // person -> the box in their hands (on the chest, kept there through a change of look)
function hold(w, box) { carried.set(w, box); w.carry = 'box'; box.visible = true; }
function updateCarried() {
  for (const [w, box] of carried) {
    if (w.carry !== 'box' || w.offstage) { box.visible = false; box.removeFromParent(); carried.delete(w); continue; }
    if (box.parent !== w.P.spine) { w.P.spine.add(box); box.position.set(0, w.P.D.shY - 0.36, 0.33); box.rotation.set(0, 0, 0); }
  }
}

/* ---------- who a parcel is for: someone resting, awake or napping, in the office ---------- */
function recipient() {
  const ok = [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.carry && !w.doze; });
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}
let delivery = null;   // { w, stage }
let COUNTER, DROP, PICK, counterBox, courierBox, homeBox;
function collect(w, from) {
  const look = PRO ? [COUNTER.x, COUNTER.z] : [courier.pos.x, courier.pos.y];
  w.errand({ type: 'idle', spot: PICK, look, anim: 'tidy', wait: rand(0.5, 1.1), hold: 0.9, linger: 0.7, line: tr('people.staff.coming'),
    at: () => { from(); hold(w, homeBox); return tr('people.staff.got'); },
    done: () => { w.anim = 'tidy'; say(w, 'people.staff.unbox'); w.afterAt = state.sim + (reduceMotion ? 0.5 : 2.4); w.after = () => { w.carry = null; w.anim = 'idle'; }; } });
}
export function sendParcel() {
  if (!courier || delivery || !courier.offstage) return false;
  const w = recipient(); if (!w) return false;
  delivery = { w, stage: 'in', at: state.sim };
  hold(courier, courierBox);
  arrive(courier, () => courier.goTo(DROP, () => {
    courier.faceTarget = DROP.face; courier.anim = 'idle';
    sfx.play('pop');
    chatLife('parcel', { id: w.id });   // (the receptionist tells the group chat too)
    if (PRO) {   // onto the counter; the receptionist calls the name
      say(courier, 'people.staff.shipperHi');
      courier.afterAt = state.sim + 1.2;
      courier.after = () => {
        courier.carry = null; counterBox.visible = true; delivery.stage = 'counter'; delivery.callAt = state.sim + 0.6;
        courier.afterAt = state.sim + 1.4; courier.after = () => depart(courier);
      };
    } else {     // at the door: calls the name and waits for them
      say(courier, 'people.staff.shipperHi'); delivery.stage = 'door'; delivery.callAt = state.sim + 1.6;
    }
  }));
  return true;
}
function stepDelivery() {
  const d = delivery; if (!d) return;
  if ((d.stage === 'counter' || d.stage === 'door') && state.sim > d.callAt) {
    let w = d.w;
    const s = sessions.get(w?.id);
    if (!w || w.leaving || !s || s.status !== 'rest' || !(free(w) || asleep(w)) || w.onBreak) w = recipient();
    if (!w) { d.callAt = state.sim + 20; if (d.stage === 'door' && state.sim - d.at > 60) { delivery = null; depart(courier); } return; }
    d.w = w; d.stage = 'called';
    const name = short(dn(sessions.get(w.id)) || '', 18);
    if (!PRO) say(courier, 'people.staff.callDoor', { name }, 5000);
    else if (receptionist && !receptionist.offstage) { say(receptionist, 'people.staff.call', { name }, 5000); receptionist.waveUntil = state.sim + 1.4; }
    setTimeout(() => collect(w, () => {
      if (PRO) counterBox.visible = false;
      else { courier.carry = null; courier.afterAt = state.sim + 0.8; courier.after = () => depart(courier); }
      delivery = null;
    }), reduceMotion ? 300 : 1300);
  }
  if (d.stage === 'called' && state.sim - d.at > 240) {   // never came (work called them away): it waits on the counter
    delivery = null; if (!PRO && !courier.offstage) depart(courier);
  }
}

/* ---------- three sticks of incense in the receptionist's hands while she prays (on the chest, like the parcel) ---------- */
let sticks;
function holdIncense(w, on) {
  if (!sticks) {
    sticks = new THREE.Group();
    const tipM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.2) });
    for (const x of [-0.012, 0, 0.012]) { const st = put(sticks, cyl(0.003, 0.003, 0.26, '#B0302A', 4), x, 0.1, 0); st.castShadow = false; put(sticks, new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), tipM), x, 0.23, 0); }
  }
  if (!on) { sticks.removeFromParent(); return; }
  w.P.spine.add(sticks); sticks.position.set(0, w.P.D.shY - 0.3, 0.3); sticks.rotation.set(0.25, 0, 0);
}

/* ---------- the receptionist greets whoever steps out of the lift and says goodbye to whoever waits for it ---------- */
const seenIn = new WeakSet(), seenOut = new WeakSet();
let greetAt = 0;
function greetings(r) {
  if (state.sim < greetAt || r.bubbleObj.visible) return;
  for (const set of [workers.values(), npcs]) for (const w of set) {
    if (w === r) continue;
    if (w.liftHold && !seenIn.has(w)) {   // the lift has brought someone up
      seenIn.add(w); seenOut.delete(w);
      if (w !== courier) { hello(r, officeNow().getHours() < 10 ? 'people.staff.greetMorning' : 'people.staff.greet'); return; }   // (he says his own piece)
    } else if (!w.liftHold && seenIn.has(w)) seenIn.delete(w);
    if (w.liftWait && !w.staff && !seenOut.has(w)) { seenOut.add(w); hello(r, 'people.staff.bye'); return; }   // waiting for it to go home
  }
}
function hello(r, key) { greetAt = state.sim + 6; say(r, key, null, 3500); r.waveUntil = state.sim + 1.3; r.faceTarget = 0; }

/* ---------- the cleaner: trolley, mop, signs, wet strips ---------- */
const CLEAN_FROM = 18 * 60 + 30, CLEAN_TO = 19 * 60 + 30, MOP_SPEED = 0.42;
let trolley, mopHand, mopCart, binG, heap, bagOnCart, cleanDay = '', cleanedAt = -1;
const strips = [];   // { mesh, sign, w (the nav strip), dryAt }
let stripGeo, stripM;
function sideOf(ax, az, bx, bz) { const L = Math.hypot(bx - ax, bz - az) || 1; return [-(bz - az) / L, (bx - ax) / L]; }
function startStrip(ax, az, bx, bz) {
  const m = new THREE.Mesh(stripGeo, stripM.clone()); m.material.color.set(night ? '#7F94A8' : '#FFFFFF'); m.rotation.y = Math.atan2(bx - ax, bz - az); m.position.set(ax, 0.03, az); m.scale.set(0.95, 1, 0.001);
  m.userData.dynamic = true; m.renderOrder = 1; scene.add(m);
  const [sx, sz] = sideOf(ax, az, bx, bz), sign = wetSign(); sign.position.set(ax + sx * 0.6, 0, az + sz * 0.6); sign.rotation.y = Math.atan2(bx - ax, bz - az); sign.userData.dynamic = true; scene.add(sign);
  const w = { ax, az, bx, bz }; wet.push(w);
  const s = { mesh: m, sign, w, dryAt: Infinity }; strips.push(s); return s;
}
function updateStrips() {
  for (let i = strips.length - 1; i >= 0; i--) {
    const s = strips[i], left = s.dryAt - state.sim;
    if (left < 20) s.mesh.material.opacity = 0.85 * Math.max(0, left / 20);
    if (left <= 0) {
      s.mesh.removeFromParent(); s.mesh.material.dispose(); s.sign.removeFromParent();
      const k = wet.indexOf(s.w); if (k >= 0) wet.splice(k, 1);
      strips.splice(i, 1);
    }
  }
}
const SEGS = () => (PRO ? [['LB', 'L2'], ['L2', 'M2'], ['M2', 'R2'], ['L1', 'M1'], ['M1', 'R1'], ['PA1', 'PA3']] : [['U0', 'U2'], ['V0', 'V2'], ['GL1', 'GL2'], ['K', 'L']]);
function startCleaning() {
  cleanDay = today(); cleaner.plan = SEGS().filter(([a, b]) => NODES[a] && NODES[b]); cleaner.parked = null;
  arrive(cleaner, () => { say(cleaner, 'people.staff.cleanHi', null, 5000); nextChore(); });
}
function nextChore() {
  const c = cleaner, seg = c.plan.shift();
  if (seg) {
    const [ax, az] = NODES[seg[0]], [bx, bz] = NODES[seg[1]];
    c.goTo({ x: ax, z: az, face: Math.atan2(bx - ax, bz - az), node: seg[0] }, () => {
      const [sx, sz] = sideOf(ax, az, bx, bz);
      c.parked = [ax - sx * 0.7, az - sz * 0.7];
      c.mop = { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az), k: 0, strip: startStrip(ax, az, bx, bz) };
      c.anim = 'mop'; mopHand.visible = true; mopCart.visible = false;
    });
    return;
  }
  if (!c.binned) {   // the big bin, then home
    c.binned = true;
    if (binHooks.leave?.()) {   // (a working day: the bin is the duty rota's (people/duty.js); she mops, and says so if it is still full)
      if (heap.scale.y > 0.5) say(c, 'people.staff.cleanLeave', null, 4500);
      nextChore(); return;
    }
    c.goTo(BIN_SPOT, () => {
      c.faceTarget = BIN_SPOT.face; c.anim = 'tidy'; say(c, 'people.staff.cleanBin');
      c.afterAt = state.sim + (reduceMotion ? 0.5 : 1.8);
      c.after = () => { cleanedAt = state.sim; heap.scale.y = 0.05; bagOnCart.visible = true; c.anim = 'idle'; nextChore(); };
    });
    return;
  }
  c.parked = null; say(c, 'people.staff.cleanBye', null, 4000);
  depart(c, () => { c.binned = false; bagOnCart.visible = false; trolley.visible = false; });
}
function stepMop(c, dt) {
  const m = c.mop; if (!m) return;
  m.k = Math.min(1, m.k + (dt * MOP_SPEED) / m.len);
  c.pos.set(m.ax + (m.bx - m.ax) * m.k, m.az + (m.bz - m.az) * m.k); c.faceTarget = Math.atan2(m.bx - m.ax, m.bz - m.az);
  m.strip.mesh.scale.z = Math.max(0.001, m.len * m.k);   // (the strip grows from where she started)
  if (m.k >= 1) { m.strip.dryAt = state.sim + 75; c.mop = null; c.anim = 'idle'; mopHand.visible = false; mopCart.visible = true; nextChore(); }
}
// the trolley rolls along in front of her as she walks, and waits beside the aisle while she mops
function updateTrolley(dt) {
  const c = cleaner; if (!c) return;
  trolley.visible = !c.offstage;
  if (!trolley.visible) return;
  const [tx, tz] = c.parked || [c.pos.x + Math.sin(c.face) * 0.62, c.pos.y + Math.cos(c.face) * 0.62];
  const k = c.parked ? Math.min(1, dt * 3) : 1;
  trolley.position.x += (tx - trolley.position.x) * k; trolley.position.z += (tz - trolley.position.z) * k; trolley.position.y = c.gy();
  if (!c.parked) trolley.rotation.y = c.face;
  if (mopHand.parent !== c.root) c.root.add(mopHand);   // (a change of look rebuilds the rig)
  if (mopHand.visible) { const ph = state.sim + c.seed; mopHand.rotation.z = Math.sin(ph * 3.2) * 0.35; }
}
let BIN_SPOT;
function buildCleaningKit() {
  // the trolley: a yellow bucket with a wringer on four castors, a push bar, the mop standing in it, a slot for the bag
  trolley = new THREE.Group(); trolley.visible = false; trolley.userData.dynamic = true; scene.add(trolley);
  const yellow = mat('#F2C230', { roughness: 0.45 }), grey = mat('#5C636E', { roughness: 0.5, metalness: 0.3 });
  put(trolley, rbox(0.46, 0.06, 0.36, grey, 0.02), 0, 0.09, 0);
  for (const [x, z] of [[-0.19, -0.14], [0.19, -0.14], [-0.19, 0.14], [0.19, 0.14]]) put(trolley, cyl(0.035, 0.035, 0.03, '#26292E', 10), x, 0.035, z).rotation.z = Math.PI / 2;
  put(trolley, rbox(0.34, 0.3, 0.3, yellow, 0.05), -0.04, 0.27, 0);
  put(trolley, rbox(0.14, 0.12, 0.26, grey, 0.02), 0.12, 0.47, 0);
  put(trolley, cyl(0.012, 0.012, 0.5, grey, 6), -0.22, 0.38, -0.15).rotation.x = 0.0;
  put(trolley, cyl(0.012, 0.012, 0.5, grey, 6), -0.22, 0.38, 0.15);
  put(trolley, cyl(0.012, 0.012, 0.32, grey, 6), -0.22, 0.63, 0).rotation.x = Math.PI / 2;
  mopCart = new THREE.Group(); mopCart.position.set(-0.04, 0.3, 0); mopCart.rotation.z = 0.12; trolley.add(mopCart);
  put(mopCart, cyl(0.014, 0.014, 1.15, mat('#3F7CC4', { roughness: 0.5 }), 6), 0, 0.5, 0);
  bagOnCart = put(trolley, new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), mat('#1E1F23', { roughness: 0.6 })), 0.24, 0.3, 0); bagOnCart.scale.set(0.9, 1.15, 0.9); bagOnCart.visible = false;
  // the mop in her hands: a pole down from the hands, a flat head with a fringe on the floor ahead of her
  mopHand = new THREE.Group(); mopHand.position.set(0.06, 0.95, 0.32); mopHand.visible = false;
  const tilt = new THREE.Group(); tilt.rotation.x = -0.62; mopHand.add(tilt);   // (the pole slopes forward, down to the floor)
  put(tilt, cyl(0.019, 0.019, 1.12, mat('#3F7CC4', { roughness: 0.5 }), 6), 0, -0.56, 0);
  put(tilt, rbox(0.34, 0.035, 0.12, mat('#7A8794', { roughness: 0.6 }), 0.015), 0, -1.12, 0).rotation.x = 0.62;
  put(tilt, rbox(0.38, 0.05, 0.16, mat('#EEE9DD', { roughness: 1 }), 0.025), 0, -1.16, 0).rotation.x = 0.62;
  // the big bin by the pantry (company floor) or the coffee corner: fills through the day, empty after 18:30
  const [bx, bz] = PRO ? [8.98, -5.25] : [-7.25, 4.55];
  binG = new THREE.Group(); binG.position.set(bx, 0, bz); binG.userData.dynamic = true; scene.add(binG);
  put(binG, cyl(0.22, 0.18, 0.66, mat('#3D6B4F', { roughness: 0.5 }), 18), 0, 0.33, 0);
  put(binG, new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.018, 6, 20).rotateX(Math.PI / 2), mat('#2C4F3A', { roughness: 0.5 })), 0, 0.66, 0);
  heap = put(binG, new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#E9E4D8', { roughness: 0.95 })), 0, 0.62, 0);
  BIN_SPOT = PRO ? { x: 9.45, z: -5.25, face: -Math.PI / 2, node: 'PA2' } : { x: -6.75, z: 4.2, face: Math.atan2(bx + 6.75, bz - 4.2), node: 'J' };
  // the shine of a freshly mopped floor
  stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  // (unlit, so it reads as a sheen on any floor; dimmer at night)
  stripM = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    map: canvasTex(64, 256, (g, w, h) => {   // a blue-grey film, streaks of light along it, the edges drying first
      g.clearRect(0, 0, w, h);
      const edge = g.createLinearGradient(0, 0, w, 0); edge.addColorStop(0, 'rgba(120,175,215,0)'); edge.addColorStop(0.18, 'rgba(120,175,215,.42)'); edge.addColorStop(0.82, 'rgba(120,175,215,.42)'); edge.addColorStop(1, 'rgba(120,175,215,0)');
      g.fillStyle = edge; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`; g.fillRect(10 + Math.random() * (w - 20), Math.random() * h, 1.5 + Math.random() * 2.5, 12 + Math.random() * 40); }
    }) });
}
function updateBin() {   // fuller as the day goes on; emptied by the cleaner (or by the duty rota: binHooks.level)
  const m = minutes(), emptied = cleanDay === today() && cleanedAt >= 0 && m >= CLEAN_FROM;
  heap.scale.y = binHooks.level?.(m) ?? (emptied ? 0.05 : Math.min(1, Math.max(0.1, (m - 480) / 600)));
}
/** the duty rota's say over the big bin (people/duty.js): level(m) its fill, or null for the usual; leave() true when
    the cleaner should leave it to the rota */
export const binHooks = { level: null, leave: null };

let slowAt = 0;
export function updateStaff(dt) {
  if (!Staff) return;
  updateCarried(); updateTrolley(dt); updateStrips();
  for (const p of [receptionist, courier, cleaner]) {   // their name only on the move (or under the pointer)
    if (!p || p.offstage) continue;
    const show = p.phase === 'walk' || !!p.mop || state.hovered === p;
    if (p.tagObj.visible !== show) p.tagObj.visible = show;
  }
  if (state.sim > slowAt) { slowAt = state.sim + 1; updateBin(); slippery(); }
}
// someone walking past a wet strip now and then says so
function slippery() {
  if (!wet.length) return;
  for (const w of workers.values()) {
    if (w.phase !== 'walk' || state.sim - (w.slipAt ?? -1e9) < 60 || w.bubbleObj.visible) continue;
    if (strips.some((s) => Math.hypot(w.pos.x - (s.w.ax + s.w.bx) / 2, w.pos.y - (s.w.az + s.w.bz) / 2) < 2.2) && Math.random() < 0.25) { w.slipAt = state.sim; quip(w, tr('people.staff.slippery'), 'idle'); }
  }
}
export function startCleaner() { if (cleaner?.offstage && !cleaner.leavingNow) startCleaning(); }

export function setup() {
  boxGeo = new THREE.BoxGeometry(0.3, 0.22, 0.26);
  boxM = mat('#C9955B', { roughness: 0.85 }); tapeM = mat('#EE4D2D', { roughness: 0.6 });
  labelM = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#EE4D2D'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.scale(4, 4); g.translate(-12, -12); g.fillStyle = '#FFFFFF'; g.fill(new Path2D(SHOPEE)); g.restore();
  }) });
  courierBox = parcel(); homeBox = parcel(); counterBox = parcel(); scene.add(counterBox);
  buildCleaningKit();
  COUNTER = PRO ? { x: -5.5, z: 1.9 } : null;   // (on the visitors' ledge of the reception, world/pro/floor.js)
  if (PRO) { counterBox.position.set(COUNTER.x, 1.07 + 0.11, COUNTER.z); counterBox.rotation.y = 0.3; }
  DROP = PRO ? { x: -5.35, z: 2.45, face: Math.PI, node: 'LB' } : DOOR_IN;
  PICK = PRO ? { x: -4.45, z: 2.45, face: Math.PI, node: 'LB' } : { x: DOOR_IN.x + 0.75, z: DOOR_IN.z, face: -Math.PI / 2, node: DOOR_IN.node };

  Staff = class Staff extends Worker {
    constructor(cfg, id) { super(cfg, { id }); this.staff = true; this.offstage = true; this.root.visible = this.tagObj.visible = false; npcs.push(this); }
    update(dt, t) {
      if (this.offstage && !this.liftRide) {   // (off the floor: just the clock)
        if (this.root.visible || this.tagObj.visible) { this.root.visible = false; this.root.matrixWorldAutoUpdate = false; this.tagObj.visible = false; this.bubbleObj.visible = false; }
        this.step(); return;
      }
      if (this.mop) stepMop(this, dt);
      super.update(dt, t);
    }
    tick() {
      if (this.waitLift) { if (!this.liftHold) { const f = this.waitLift; this.waitLift = null; f(); } return; }
      this.step();
    }
    step() {}
  };

  // the receptionist (company floor): behind the counter, the way in round its far end
  if (PRO) {
    const DESK = { x: -4.9, z: 1.05, face: 0, node: 'I', sit: true, via: [[-6.07, 2.45], [-6.07, 1.18], [-5.6, 1.18]] };   // (her chair behind the reception, in round its open west end)
    receptionist = new (class extends Staff {
      step() {
        const m = minutes(), on = !replay.on && m >= 465 && m < 1095;
        if (on && this.offstage && !this.coming) {
          if (!this.seen) { this.offstage = false; this.pos.set(DESK.x, DESK.z); this.face = this.faceTarget = 0; this.spot = DESK; this.pose = 'sit'; this.anim = 'type'; }
          else { this.coming = true; arrive(this, () => this.goTo(DESK, () => { this.coming = false; this.anim = 'type'; })); }
        } else if (!on && !this.offstage && !this.leavingNow && !this.coming && this.phase !== 'walk') depart(this);
        this.seen = true;
        if (this.ritual) return;   // (at the altar)
        // the lunar 1st and 15th, after 8:05: the offerings and incense at the altar in the lobby (life/altar.js)
        if (altar.spot && offeringDay() && !arranged() && m >= 485 && m < 570 && !this.offstage && !this.coming && !this.leavingNow && this.phase !== 'walk') { this.pray(DESK); return; }
        if (!this.offstage && !this.coming && !this.leavingNow && this.phase !== 'walk' && state.sim > (this.nextIdle || 0)) {   // types, looks up, reads
          this.anim = ['type', 'type', 'idle', 'read'][Math.floor(Math.random() * 4)]; this.nextIdle = state.sim + rand(6, 12);
        }
        if (!this.offstage && !this.coming && !this.leavingNow && this.phase !== 'walk') greetings(this);
      }
      // up from the desk to the altar: set out the fruit, the xôi and the flowers, then three sticks of incense, lit, held
      // before her and three bows; she plants them in the bowl and goes back to the desk
      pray(DESK) {
        this.ritual = true; this.hush();
        const later = (s, fn) => { this.afterAt = state.sim + (reduceMotion ? Math.min(s, 0.5) : s); this.after = fn; };
        this.goTo(altar.spot, () => {
          this.faceTarget = altar.spot.face; this.anim = 'tidy';
          later(2.4, () => {
            arrange(); this.anim = 'pray'; holdIncense(this, true);
            later(5.6, () => {
              holdIncense(this, false); lightIncense(); this.anim = 'tidy';
              later(1.2, () => this.goTo(DESK, () => { this.ritual = false; this.anim = 'type'; this.nextIdle = state.sim + rand(4, 8); }));
            });
          });
        });
      }
    })({ name: tr('people.staff.receptionist'), shirt: '#D97757', hair: '#1E1E24', style: 'ponytail', acc: null, outfit: 'shirt', pants: '#2B2F36', shoes: '#1B1B1E' }, '__reception');
  }

  // the courier: an orange jacket and cap; twice a day, at a minute of its own each day
  courier = new (class extends Staff {
    step() {
      stepDelivery();
      if (!this.offstage || replay.on || delivery) return;
      const day = today(), m = minutes();
      if (this.day !== day) { this.day = day; const h = hash(day); this.slots = [600 + (h % 100), 870 + ((h >>> 8) % 110)].map((at) => ({ at, done: m > at + 5 })); }
      for (const s of this.slots) if (!s.done && m >= s.at) { if (m > s.at + 120 || sendParcel()) s.done = true; break; }
    }
  })({ name: tr('people.staff.shipper'), shirt: '#EE4D2D', hair: '#2B2B2B', style: 'plain', acc: 'cap', outfit: 'shirt', pants: '#2B2F36', shoes: '#1B1B1E' }, '__courier');

  // the cleaner: light-blue uniform, hair in a bun
  cleaner = new (class extends Staff {
    step() {
      if (!this.offstage || this.leavingNow || replay.on) return;
      const m = minutes();
      if (cleanDay !== today() && m >= CLEAN_FROM && m < CLEAN_TO) startCleaning();
    }
  })({ name: tr('people.staff.cleaner'), shirt: '#6FA8D6', hair: '#2B2B2B', style: 'bun', acc: null, outfit: 'shirt', pants: '#3B5F86', shoes: '#3A3A40' }, '__cleaner');
  cleaner.root.add(mopHand);
}
export const staff = () => ({ receptionist, cleaner, courier, delivery, strips, bin: { spot: BIN_SPOT, level: heap?.scale.y ?? 0 } });
// for the other visitors (the postman, life/post.js): the class, the way up and back down, a line said
export const staffKit = () => ({ Staff, arrive, depart, say });
