// Friday 16:00: afternoon tea. Whoever is resting gathers round the pantry tables for bubble tea and bánh tráng trộn.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, rand, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { cyl, mat, put } from '../scene/blocks.js';
import { allocate } from './navigation.js';
import { MEET } from '../world/furniture/meeting.js';
import { sessions, workers } from './workers.js';
import { asleep, free, quip } from './errands.js';
import { toast } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

/* As in many young Vietnamese offices: on Friday afternoon someone orders milk tea for everyone, with a bag or two of
   bánh tráng trộn (rice-paper salad: orange strips, herbs, quail eggs, peanuts). The tables in the pantry (the meeting
   table in the small office) get a bowl and the cups; whoever is resting comes over, sits, sips through the fat straw,
   chats about the weekend, and goes back with the cup in hand after a few minutes. Anyone working keeps working. */
const LEN = 240;   // (seconds the tea goes on, sim time)
const TABLES = () => (PRO ? [[10.4, -4.9], [12.8, -4.9], [10.4, -0.9], [12.8, -0.9]] : [[MEET.x, MEET.z]]);
let sets = [], tea = null, teaDay = '', checkAt = 0;

function snackSet(x, z, top) {
  const g = new THREE.Group(); g.position.set(x, top, z); g.visible = false; g.userData.dynamic = true; scene.add(g);
  // bánh tráng trộn in a clear plastic bowl
  const bowl = put(g, cyl(0.09, 0.065, 0.05, new THREE.MeshStandardMaterial({ color: '#F4F2EC', transparent: true, opacity: 0.55, roughness: 0.2 }), 18), -0.12, 0.025, 0.02);
  bowl.castShadow = false;
  put(g, new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#E07A34', { roughness: 0.75 })), -0.12, 0.035, 0.02).scale.set(1, 0.5, 1);
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0, 0.06), kind = i % 3;
    const m = kind === 0 ? new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.012), mat('#5E9E3A', { roughness: 0.8 }))   // rau răm
      : kind === 1 ? new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#F4E6C8', { roughness: 0.5 }))            // quail egg
        : new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), mat('#9B6B3E', { roughness: 0.7 }));                     // peanut
    m.position.set(-0.12 + Math.cos(a) * r, 0.065 + rand(0, 0.01), 0.02 + Math.sin(a) * r); m.rotation.y = rand(0, 3); g.add(m);
  }
  // two milk teas: brown tea, black pearls at the bottom, a dome lid, a fat straw
  const lidM = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45, roughness: 0.15 });
  [[0.1, -0.08, '#C99A6B', '#E25C7A'], [0.16, 0.08, '#B98A5E', '#4FA36B']].forEach(([cx, cz, teaC, strawC]) => {
    put(g, cyl(0.036, 0.029, 0.13, mat(teaC, { roughness: 0.35 }), 14), cx, 0.065, cz);
    put(g, cyl(0.03, 0.028, 0.025, mat('#2B1B12', { roughness: 0.4 }), 12), cx, 0.014, cz);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.037, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), lidM), cx, 0.13, cz).scale.set(1, 0.55, 1);
    put(g, cyl(0.008, 0.008, 0.11, strawC, 6), cx + 0.01, 0.17, cz).rotation.z = -0.25;
  });
  return g;
}

function who() {
  return [...workers.values()].filter((w) => { const s = sessions.get(w.id);
    return !w.sub && s?.status === 'rest' && !s.bg?.length && (free(w) || asleep(w)) && !w.onBreak && !w.outing && !w.street && !w.mealBox && !w.carry && !w.doze; });
}
/** Friday 16:00 (once a day), or now when forced (?debug: __office.teatime()). Returns whether anyone came. */
export function teatime(force = false) {
  const d = officeNow(), day = d.toDateString();
  if (tea || replay.on) return false;
  if (!force && (d.getDay() !== 5 || d.getHours() !== 16 || d.getMinutes() > 20 || teaDay === day)) return false;
  teaDay = day;
  const people = who(); if (!people.length) return false;
  const end = state.sim + LEN;
  tea = { end, people: new Set(people), chatAt: state.sim + rand(8, 12) };
  for (const g of sets) g.visible = true;
  toast(tr('people.tea.toast'), 6000);
  people.forEach((w, i) => {
    const spot = allocate(PRO ? 'dining' : 'meeting', w); if ('by' in spot) spot.by = w;   // (taken now: everyone is seated in the same moment)
    const [tx, tz] = TABLES().reduce((b, t) => (Math.hypot(t[0] - spot.x, t[1] - spot.z) < Math.hypot(b[0] - spot.x, b[1] - spot.z) ? t : b));
    const e = w.errand({ type: 'idle', spot, look: [tx, tz], anim: 'coffee', wait: 0.4 + i * rand(0.4, 0.9), hold: 0.6, linger: 0.8,
      line: tr('people.tea.coming'), at: () => tr('people.tea.bye'), arrived: () => { w.carry = 'cup'; } });
    e.until = end;
  });
  return true;
}

export function updateTeatime() {
  if (!sets.length) return;
  if (state.sim > checkAt) { checkAt = state.sim + 3; teatime(); }
  if (!tea) return;
  if (state.sim > tea.end + 20) { tea = null; for (const g of sets) g.visible = false; return; }
  if (state.sim > tea.chatAt && state.sim < tea.end) {   // now and then someone at a table says something
    tea.chatAt = state.sim + rand(8, 14);
    const here = [...tea.people].filter((w) => w.chore?.stage === 'go' && w.phase !== 'walk' && w.anim === 'coffee' && !w.bubbleObj.visible);
    const w = here[Math.floor(Math.random() * here.length)];
    if (w) quip(w, tr('people.tea.chat'), 'idle');
  }
}

export function setup() {
  const top = PRO ? 0.77 : 0.8;
  sets = TABLES().map(([x, z]) => snackSet(x, z, top));
}
