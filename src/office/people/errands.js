// People reacting to what you do in the office: switch off the lamp someone is working by and they get up and switch it
// back on; print a page and someone fetches it; make a coffee and someone comes for it; the cat on a keyboard gets lifted
// down; a thirsty plant gets watered; click someone at work and they look up. (Gatherings, the meeting bell and parties,
// are in gatherings.js and use the helpers exported here.)
import * as THREE from 'three';
import { state } from '../core/state.js';
import { LAYOUT, PRO, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { ROOM_LAMPS } from '../scene/lights.js';
import { mat } from '../scene/blocks.js';
import { night } from '../world/room-update.js';
import { PRN, paper, printQueue, prnLed } from '../world/props/printer.js';
import { STEAM_AT } from '../world/furniture/coffee.js';
import { cat, catGo } from '../world/props/cat.js';
import { roomPlants } from '../world/furniture/plants-lamps.js';
import { PROPS } from '../interact/props.js';
import { DEMO } from '../demo/demo.js';
import { DESK_SPOTS, STATIONS, standBy, wayTo } from './navigation.js';
import { COFFEE_Q } from './breaks.js';
import { npcs, sessions, subs, workers } from './workers.js';
import { director } from './director.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

export const people = () => [...workers.values(), ...subs.values(), ...npcs];
export const line = (key) => tr(key);   // an array in the dictionary: one line picked at random
export const dist = (w, x, z) => Math.hypot(w.pos.x - x, w.pos.y - z);
const shown = (w) => w.root.parent && w.root.visible && !w.leaving && !w.away && !w.homeBound;
// free to get up: in place (not walking, riding the lift or in the middle of something), awake, nothing urgent waiting
export const free = (w) => shown(w) && !w.staff && !w.chore && w.phase !== 'walk' && !w.after && !w.liftHold && !w.liftWait && !w.inStall && !w.wcBusy && !w.queued
  && !w.want?.priority && w.anim !== 'sleep' && w.anim !== 'wake' && (w !== director || (!director.job && director.station === 'home'));
export const asleep = (w) => shown(w) && w.phase !== 'walk' && w.anim === 'sleep';
// on the company floor, only the people in the same room as the thing (walls in between: they would not notice)
const roomAt = (x, z) => (PRO ? ROOM_LAMPS.find((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) : null);
const inRoom = (w, r) => !r || (w.pos.x > r.x0 && w.pos.x < r.x1 && w.pos.y > r.z0 && w.pos.y < r.z1);
export function nearest(x, z, maxD, ok, sameRoom = true, room = null) {
  const r = room || (sameRoom ? roomAt(x, z) : null);
  let best = null, bd = maxD;
  for (const w of people()) {
    if (!ok(w) || !inRoom(w, r)) continue;
    const d = dist(w, x, z); if (d < bd) { bd = d; best = w; }
  }
  return best;
}
// a line said where they are, cleared a few seconds later (unless they have said something else since)
export function quip(w, text, kind = 'rest', type = 'idle') { w.say(type, text, kind); w.pokeHushAt = state.sim + 4; if (kind !== 'rest') setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 4000); }

/* ---------- lamps and the light switch ----------
   A floor lamp belongs on after dark and off by day; the floor's lights (the switch by the door) on after dark. Switch
   one the wrong way and whoever is nearest in that room says something, walks over and puts it right, then goes back to
   work (the lights out: everyone in the room says something). Keep doing it and they get crosser, and on the fourth
   time in a minute and a half they give up and leave it. If the only ones around are asleep, the nearest mumbles. */
const mood = new Map();
function wrongWay(T) {
  if (replay.on || T.right()) return;
  const m = mood.get(T.key), n = m && state.sim - m.at < 90 ? m.n + 1 : 1;
  mood.set(T.key, { n, at: state.sim });
  const fixer = people().find((w) => w.chore?.thing === T.key && shown(w));
  if (fixer) { if (fixer.chore.stage !== 'go') fix(fixer, T, n); return; }   // on the way there: they will see
  const w = nearest(T.x, T.z, T.range || 6.5, free, true, T.room);
  if (!w) { const z = T.dark && nearest(T.x, T.z, T.range || 6.5, asleep, true, T.room); if (z) quip(z, line('people.lamp.sleepy'), 'rest', 'lamp'); return; }
  fix(w, T, n);
  if (T.crowd && n === 1) {   // and the rest of the room says so too, one after another
    let k = 0;
    for (const p of people()) if (p !== w && free(p) && inRoom(p, T.room)) { const d = 300 + 350 * k++; setTimeout(() => { if (free(p)) quip(p, line(T.crowd), '', T.type); }, d); }
  }
}
function fix(w, T, n) {
  if (n >= 4) { quip(w, line(T.lines.giveUp), '', T.type); return; }
  const spot = wayTo(w, T.x, T.z, T.front) || standBy(T.x, T.z, T.front); if (!spot) return;
  w.errand({ thing: T.key, spot, look: [T.x, T.z], type: T.type, anim: T.anim, wait: 1.4, hold: 0.7, linger: 1.2,
    line: line(n === 1 ? T.lines.first : n === 2 ? 'people.lamp.again' : 'people.lamp.last'),
    at: () => { if (T.right()) return line('people.lamp.already'); T.flip(); return line(T.lines.fixed); } });
}
export function lampSwitched(L, flip) {
  const want = night;
  wrongWay({ key: L, x: L.g.position.x, z: L.g.position.z, right: () => L.on === night, flip, dark: want, type: 'lamp', anim: 'hand',
    lines: want ? { first: 'people.lamp.off', fixed: 'people.lamp.fixed', giveUp: 'people.lamp.giveUp' }
      : { first: 'people.lamp.on', fixed: 'people.lamp.fixedDay', giveUp: 'people.lamp.giveUpDay' } });
}
// by day the floor's lights are off anyway: someone nearby just says so
export function lightsSwitched(sw, flip) {
  if (replay.on) return;
  if (!night) { const w = nearest(sw.x, sw.z, 9, free, true, sw.room); if (w) quip(w, line('people.room.day'), '', 'lamp'); return; }
  wrongWay({ key: sw, x: sw.x, z: sw.z, front: sw.front, room: sw.room, range: 14, right: () => !sw.off, flip, dark: true, crowd: 'people.room.dark', type: 'lamp', anim: 'globe',
    lines: { first: 'people.room.off', fixed: 'people.room.fixed', giveUp: 'people.lamp.giveUp' } });
}

/* ---------- in sim time (the office's own clock: it slows with the frame rate and stops in the background) ---------- */
const timers = [];
export function later(sec, fn) { timers.push({ at: state.sim + sec, fn }); }

/* ---------- held things: a page, a cup, a watering can ---------- */
let paperGeo, paperM, cupGeo, cupM, canM, canDarkM, canGeos;
function hold(w, kind) {
  let m;
  if (kind === 'can') {
    canGeos ||= [new THREE.CylinderGeometry(0.06, 0.065, 0.13, 14), new THREE.CylinderGeometry(0.008, 0.012, 0.16, 6), new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI)];   // (shared: a can of its own each time stayed on the GPU)
    m = new THREE.Group();
    m.add(new THREE.Mesh(canGeos[0], canM));
    const spout = new THREE.Mesh(canGeos[1], canM); spout.position.set(0, 0.03, 0.09); spout.rotation.x = 1.05; m.add(spout);
    const handle = new THREE.Mesh(canGeos[2], canDarkM); handle.position.set(0, 0.07, -0.01); m.add(handle);
    m.position.set(0, -0.09, 0.05);
  } else m = kind === 'paper' ? new THREE.Mesh(paperGeo, paperM) : new THREE.Mesh(cupGeo, cupM);
  if (kind === 'paper') { m.position.set(0, -0.06, 0.07); m.rotation.x = 0.3; } else if (kind === 'cup') m.position.set(0, -0.05, 0.03);
  m.userData.dynamic = true; w.P.armR.hand.add(m); return m;
}

/* ---------- the printer ----------
   A page you print waits on the tray until someone nearby comes for it (half a minute at most) and takes it back to
   their desk. Pages a finished turn prints are not fetched: they come and go as before. */
export function pagePrinted() {
  if (replay.on || people().some((w) => w.chore?.print)) return;
  const w = nearest(PRN.x, PRN.z, 9, (p) => free(p) && p !== director, false), spot = w && (wayTo(w, PRN.x, PRN.z) || standBy(PRN.x, PRN.z));
  if (!spot) return;
  printQueue.keep = true;
  const giveUp = setTimeout(() => { printQueue.keep = false; }, 30000);
  let held = null;
  w.errand({ print: true, spot, look: [PRN.x, PRN.z], type: 'print', anim: 'tidy', hold: 0.9, wait: 0.8, line: line('people.print.whose'),
    at: () => {
      clearTimeout(giveUp);
      if (paper.visible) { printQueue.keep = false; printQueue.t = -1; paper.visible = false; prnLed.color.set('#3DDC84'); }
      held = hold(w, 'paper'); sfx.play('pop');
      return line('people.print.got');
    },
    done: () => { held?.removeFromParent(); } });
}

/* ---------- the coffee machine ----------
   Make a coffee and the nearest person free to come (anywhere on the floor) says so, takes the cup, and drinks it back
   at their seat. Not while the afternoon queue is at the machine. */
export function coffeeMade() {
  if (replay.on || people().some((w) => w.chore?.coffee)) return;
  const head = PRO ? COFFEE_Q[0] : STATIONS.coffee[2];
  if (head?.by) return;
  const w = nearest(STEAM_AT.x, STEAM_AT.z, PRO ? 14 : 10, (p) => free(p) && p !== director, false);
  const spot = w && (head ? { x: head.x, z: head.z, face: head.face, node: head.node } : standBy(STEAM_AT.x, STEAM_AT.z));   // (a copy: nobody holds it)
  if (!spot) return;
  let cup = null;
  w.errand({ coffee: true, spot, look: [STEAM_AT.x, STEAM_AT.z], type: 'coffee', anim: 'tidy', hold: 2.2, wait: 0.7, line: line('people.coffee.who'),
    at: () => { cup = hold(w, 'cup'); return line('people.coffee.thanks'); },
    done: () => {
      cup?.removeFromParent();
      if (w.chore || w.want || w.anim === 'hand') return;
      const was = w.anim; w.anim = 'coffee';   // sips at the desk for a while (real work still comes first), then back to it
      setTimeout(() => { if (w.anim === 'coffee' && !w.chore && w.station === 'desk') w.anim = was; }, rand(6000, 9000));
    } });
}

/* ---------- the cat ----------
   Now and then (and right after you pet it) the cat hops onto the desk of someone at work and sits on the keyboard; they
   lift it down and carry on. */
export function catToKeyboard(range = 9) {
  if (replay.on) return false;
  // busy (walking, hopping, up on the sofa): it goes once it is done and back on the floor
  if (cat.hop || cat.mode === 'walk' || cat.y > 0.01) { cat.restless = true; cat.restlessAt = 0; return true; }
  let best = null, bd = range;
  for (const w of workers.values()) {
    const d = sessions.get(w.id)?.desk;
    if (d == null || d < 0 || !free(w) || w.station !== 'desk' || w.pose !== 'sit' || sessions.get(w.id)?.status !== 'work') continue;
    const k = dist(w, cat.pos.x, cat.pos.y); if (k < bd) { bd = k; best = w; }
  }
  if (!best) return false;
  const w = best, sp = DESK_SPOTS[sessions.get(w.id).desk], fx = Math.sin(sp.face), fz = Math.cos(sp.face);
  const bx = sp.x + fz * 0.62 - fx * 0.15, bz = sp.z - fx * 0.62 - fz * 0.15;          // on the floor beside the chair
  const kx = sp.x + fx * 0.58 + fz * 0.12, kz = sp.z + fz * 0.58 - fx * 0.12;          // on the desk, by the keyboard
  catGo(bx, bz, () => {
    if (!free(w) || w.station !== 'desk') { cat.mode = 'sit'; cat.until = state.sim + rand(4, 8); return; }
    cat.hop = { t: 0, from: [bx, 0, bz], to: [kx, 0.79, kz], up: true }; cat.mode = 'hop';
    cat.after = () => {
      cat.mode = 'sit'; cat.until = state.sim + 6; cat.down = [bx, bz]; cat.face = sp.face + Math.PI; cat.sayUntil = state.sim + 1.4; sfx.play('meow');
      if (!free(w)) return;
      w.errand({ type: 'cat', anim: 'tidy', wait: 0.7, hold: 1.2, linger: 1.4, line: line('people.cat.onDesk'),
        at: () => {
          if (cat.mode !== 'sit' || cat.y < 0.5) return null;
          cat.hop = { t: 0, from: [cat.pos.x, cat.y, cat.pos.y], to: [bx, 0, bz] }; cat.mode = 'hop'; cat.down = null;
          cat.after = () => { cat.mode = 'sit'; cat.until = state.sim + rand(3, 6); cat.face = sp.face + Math.PI / 2; };
          return line('people.cat.down');
        } });
    };
  });
  return true;
}

/* ---------- plants ----------
   Each plant remembers when it was last watered (in this browser). After three hours without water it starts to droop,
   its leaves fading to olive; after nine it hangs limp. Click a thirsty one and the nearest person free to come fetches
   the watering can; the plant perks up as they pour. The look is a bend of the plant's own (merged) geometry: leaves
   above the pot's rim sag and spread, green vertices fade, all from the shape it was built with. */
const DRY_FROM = 3 * 3600e3, DRY_SPAN = 6 * 3600e3, KEY = 'office-plants';
let plants = null;
const dryness = (P) => Math.min(1, Math.max(0, (Date.now() - P.wet - DRY_FROM) / DRY_SPAN));
function plantList() {
  if (plants) return plants;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage blocked */ }
  const wet = saved[LAYOUT] || [];
  // first visit: watered now (the demo: a few already thirsty, to show it)
  plants = roomPlants.map((g, i) => ({ g, i, p: PROPS.get('plant' + i), wet: wet[i] || (DEMO ? Date.now() - (i % 3) * 5 * 3600e3 : Date.now()), k: -1, perk: null }));
  return plants;
}
function savePlants() { try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[LAYOUT] = plants.map((P) => P.wet); localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked */ } }
const OLIVE = [0.3, 0.22, 0.05];   // (linear: a dry yellow-brown)
function wilt(P, k) {
  if (Math.abs(k - P.k) < 0.015) return;
  P.k = k;
  for (const m of P.p?.meshes || []) {
    const g = m.geometry, pos = g?.attributes.position, col = g?.attributes.color;
    if (!pos || !col) continue;   // only the merged parts: they are this plant's alone
    g.userData.pos0 ??= pos.array.slice(); g.userData.col0 ??= col.array.slice();
    const p0 = g.userData.pos0, c0 = g.userData.col0;
    for (let v = 0; v < pos.count; v++) {
      const x = p0[v * 3], y = p0[v * 3 + 1], z = p0[v * 3 + 2], h = y - 0.43;
      if (h <= 0) continue;
      const spread = 1 + 0.9 * k * h;
      pos.array[v * 3] = x * spread; pos.array[v * 3 + 1] = 0.43 + h * (1 - 0.42 * k) - 0.2 * k * h * h; pos.array[v * 3 + 2] = z * spread;
      const r = c0[v * 3], gg = c0[v * 3 + 1], b = c0[v * 3 + 2];
      if (gg > r * 1.05 && gg > b) for (let c = 0; c < 3; c++) col.array[v * 3 + c] = c0[v * 3 + c] + (OLIVE[c] - c0[v * 3 + c]) * 0.7 * k;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}
export const plantThirsty = (i) => { const P = plantList()[i]; return !!P && dryness(P) > 0.12; };
const drops = [];
let dropGeo, dropM, plantsAt = 0;
export function waterPlant(i) {
  const P = plantList()[i];
  if (!P || replay.on || people().some((w) => w.chore?.plant === P)) return false;
  const x = P.g.position.x, z = P.g.position.z;
  const w = nearest(x, z, 14, free, false), spot = w && (wayTo(w, x, z) || standBy(x, z));
  if (!spot) return false;
  let can = null;
  w.errand({ plant: P, spot, look: [x, z], type: 'plant', anim: 'globe', wait: 0.9, hold: 1.9, line: line('people.plant.thirsty'),
    arrived: () => { can = hold(w, 'can'); can.rotation.x = 0.5; sfx.play('water'); P.pour = { w, until: state.sim + 1.8 }; },
    at: () => { P.wet = Date.now(); savePlants(); P.perk = { from: P.k, t: 0 }; return line('people.plant.done'); },
    done: () => { can?.removeFromParent(); } });
  return true;
}
/* for the rota's morning watering (people/duty.js): the thirstiest plants first, where to stand for one, and the
   pouring itself (the can, the water, the plant perking up; then()) */
export const plantsToWater = (n) => plantList().slice().sort((a, b) => dryness(b) - dryness(a) || a.i - b.i).slice(0, n).map((P) => P.i);
export function plantSpot(i, w) { const P = plantList()[i]; return P && (wayTo(w, P.g.position.x, P.g.position.z) || standBy(P.g.position.x, P.g.position.z)); }
export function pour(i, w, then) {
  const P = plantList()[i]; if (!P) { then(); return; }
  w.faceTarget = Math.atan2(P.g.position.x - w.pos.x, P.g.position.z - w.pos.y);
  const can = hold(w, 'can'); can.rotation.x = 0.5; sfx.play('water'); P.pour = { w, until: state.sim + 1.8 };
  later(reduceMotion ? 0.4 : 1.9, () => { can.removeFromParent(); P.wet = Date.now(); savePlants(); P.perk = { from: P.k, t: 0 }; then(); });
}
const _hand = new THREE.Vector3();
function updatePlants(dt) {
  const list = plantList();
  for (const P of list) {
    if (P.pour) {   // water from the can's spout to the soil
      if (state.sim > P.pour.until || !P.pour.w.chore) P.pour = null;
      else if (Math.random() < dt * 30) {
        P.pour.w.P.armR.hand.getWorldPosition(_hand);
        const m = new THREE.Mesh(dropGeo, dropM); m.position.set(_hand.x + rand(-0.03, 0.03), _hand.y - 0.05, _hand.z + rand(-0.03, 0.03)); scene.add(m);
        drops.push({ m, tx: P.g.position.x, tz: P.g.position.z, y0: P.g.position.y + 0.42 * P.g.scale.y, life: 0 });
      }
    }
    if (P.perk) { P.perk.t += dt / 1.4; wilt(P, P.perk.from * (1 - Math.min(1, P.perk.t))); if (P.perk.t >= 1) P.perk = null; }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.life += dt;
    d.m.position.x += (d.tx - d.m.position.x) * Math.min(1, dt * 3); d.m.position.z += (d.tz - d.m.position.z) * Math.min(1, dt * 3);
    d.m.position.y -= dt * (1.2 + d.life * 4);
    if (d.m.position.y < d.y0 || d.life > 1.2) { scene.remove(d.m); drops.splice(i, 1); }
  }
  if (state.sim < plantsAt) return;   // the slow drying: a look every few seconds is plenty
  plantsAt = state.sim + 4;
  for (const P of list) if (!P.perk) wilt(P, dryness(P));
}

export function updateErrands(dt) {
  for (let i = timers.length - 1; i >= 0; i--) if (state.sim >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  if (roomPlants?.length && PROPS.size) updatePlants(dt);
}

/* ---------- clicked while at work ----------
   They stop typing, wave and say they are busy, then go back to it (the session still opens beside). */
export function lookUp(w) {
  if (replay.on || w.sub || w === director || !free(w) || w.station !== 'desk' || sessions.get(w.id)?.status !== 'work') return;
  w.errand({ type: 'idle', anim: 'idle', wait: 0, hold: 1.5, linger: 0.2, line: line('people.busy') });
  w.waveUntil = state.sim + 1.2;
}

export function setup() {
  paperGeo = new THREE.BoxGeometry(0.17, 0.012, 0.23);
  paperM = mat('#FBFBF7', { roughness: 0.9 });
  cupGeo = new THREE.CylinderGeometry(0.035, 0.028, 0.08, 12).translate(0, 0.04, 0);
  cupM = mat('#FFFFFF', { roughness: 0.4 });
  canM = mat('#4FA36B', { roughness: 0.5, metalness: 0.2 }); canDarkM = mat('#2F6B45', { roughness: 0.6 });
  dropGeo = new THREE.SphereGeometry(0.014, 6, 4); dropM = new THREE.MeshBasicMaterial({ color: '#8FD3FF', transparent: true, opacity: 0.85 });
  printQueue.keep = false;
}
