// Lunch and the afternoon coffee queue.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { state } from '../core/state.js';
import { PRO, rand, reduceMotion } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { mat } from '../scene/blocks.js';
import { shaded } from '../world/desks.js';
import { spotAt } from './navigation.js';
import { brewCoffee } from '../interact/props.js';
import { t as tr } from '../../i18n/index.js';

let MEAL_GEO;
let MEAL_M;
const mealPool = [];
export function showMeal(w) {
  const sp = w.spot; if (!sp) return;
  let m = mealPool.find((x) => !x.visible);
  if (!m) { m = new THREE.Mesh(MEAL_GEO, MEAL_M); m.castShadow = true; m.userData.dynamic = true; scene.add(m); mealPool.push(m); }
  m.position.set(sp.x + Math.sin(sp.face) * 0.42, 0.772, sp.z + Math.cos(sp.face) * 0.42); m.rotation.y = sp.face; m.visible = true;
  w.mealBox = m;
}
export function hideMeal(w) { if (w.mealBox) { w.mealBox.visible = false; w.mealBox = null; } w.meal = false; }
export let COFFEE_Q;
const coffeeQ = [];
export function joinCoffee(w) {
  if (!COFFEE_Q.length || coffeeQ.length >= COFFEE_Q.length) return false;
  coffeeQ.push(w); w.queued = true; w.brewUntil = 0; w.hush();
  w.anim = 'wake'; w.afterAt = state.sim + (reduceMotion ? 0.2 : 1.4); w.after = () => { w.anim = 'idle'; lineUp(); };
  return true;
}
export function leaveCoffee(w) { const i = coffeeQ.indexOf(w); if (i >= 0) { coffeeQ.splice(i, 1); lineUp(); } w.queued = false; w.brewUntil = 0; }
function lineUp() { coffeeQ.forEach((w, i) => { if (w.after || w.spot === COFFEE_Q[i]) return; w.goTo(COFFEE_Q[i], () => { w.anim = 'idle'; }); }); }
export function updateCoffeeQueue() {
  const w = coffeeQ[0];
  if (!w || w.after || w.phase === 'walk' || w.spot !== COFFEE_Q[0]) return;
  if (!w.brewUntil) { w.brewUntil = state.sim + 4.2; w.anim = 'tidy'; w.say('idle', tr('people.brewing')); brewCoffee(); return; }
  if (state.sim < w.brewUntil) return;
  coffeeQ.shift(); w.queued = false; w.brewUntil = 0; w.hush(); lineUp();
  const text = tr('people.afternoonCoffee');
  w.want = { station: 'coffee', anim: 'coffee', type: 'idle', text, dwell: 2, rest: rand(150, 300), priority: true };
  setTimeout(() => { if (w.lastSay?.text === text) w.hush(); }, 6000);
}

export function setup() {
  /* ---------- lunch and the afternoon coffee (pro) ----------
     11:30–13:00 people who are resting go to the pantry and eat a boxed lunch at a free seat, then go back for a nap;
     15:00–15:45 they queue at the coffee machine, one cup each, and drink it sitting down. Once a day each, only from a
     nap, and anything real to do (a prompt, a question) sends them straight back to the desk. */
  MEAL_GEO = shaded([   // a takeaway lunch box, lid open behind it: rice, greens, an egg, pork; chopsticks; a cup of tea
    [new RoundedBoxGeometry(0.22, 0.05, 0.16, 2, 0.012).translate(0, 0.025, 0), 0xF4F1EA],
    [new RoundedBoxGeometry(0.22, 0.012, 0.16, 2, 0.005).rotateX(-1.2).translate(0, 0.075, -0.1), 0xEDE9E0],
    [new THREE.BoxGeometry(0.1, 0.012, 0.13).translate(-0.05, 0.051, 0), 0xFFFFFF],
    [new THREE.SphereGeometry(0.03, 8, 6).scale(1.3, 0.4, 1).translate(0.045, 0.054, -0.035), 0x6AA84F],
    [new THREE.SphereGeometry(0.026, 10, 8).scale(1, 0.45, 1).translate(0.05, 0.055, 0.035), 0xFFD43B],
    [new THREE.BoxGeometry(0.05, 0.016, 0.035).translate(0.04, 0.054, 0.0), 0x9C5B32],
    [new THREE.CylinderGeometry(0.004, 0.004, 0.2, 5).rotateZ(Math.PI / 2).rotateY(0.15).translate(0.02, 0.012, 0.11), 0x8A6A4A],
    [new THREE.CylinderGeometry(0.004, 0.004, 0.2, 5).rotateZ(Math.PI / 2).rotateY(0.1).translate(0.02, 0.012, 0.125), 0x8A6A4A],
    [new THREE.CylinderGeometry(0.03, 0.026, 0.07, 12).translate(0.17, 0.035, -0.02), 0xD9EBDD],
  ]);
  MEAL_M = mat('#FFFFFF', { roughness: 0.6, vertexColors: true });
  // the queue: the head stands at the machine (it brews about four seconds), the rest line up behind, facing it
  COFFEE_Q = PRO ? [[11.45, -6.72, 'PA4'], [11.55, -6.0, 'PA4'], [11.55, -5.3, 'PA4'], [11.55, -4.6, 'PA3'], [11.55, -3.9, 'PA3']].map(([x, z, n]) => spotAt(x, z, Math.PI, n)) : [];
}
