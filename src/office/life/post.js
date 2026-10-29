// The post box: every commit is a letter in it. On the company floor it hangs on the work floor's side of the lobby
// wall, by the glass doors everyone goes through to the lift (away from the red altar); in the small office, on the wall
// by the door. A plate under it counts the day's letters. The session's character carries
// the letter down and posts it (at most one walk every two minutes each: the rest just go in), and a push calls the
// postman, who comes up, opens the box, empties it into his sack, waves and goes. Out of hours (before 7:00, after 21:00)
// the letters wait in the box for the morning.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, V2, officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, mat, put, rbox } from '../scene/blocks.js';
import { STATIONS, nearestNode } from '../people/navigation.js';
import { DZ } from '../world/entrance.js';
import { staffKit } from '../people/staff.js';
import { line } from '../people/errands.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

let box = null, plate = null, tips = [], door = null, spot = null, postman = null;
let inBox = 0, today = 0, day = '', shownN = -1, due = 0, trip = false, doorOpen = 0, slowAt = 0;
const WALK_EVERY = 120;   // (sim seconds) one walk to the box per session in this long

// the day's count: the server's (state.stats.commit, from the git watcher, all day), or ours since the page opened when
// that is more (a demo, a replay, a commit the watcher has not seen yet)
const dayCount = () => Math.max(today, state.stats?.commit || 0);
function drawPlate() {
  const n = dayCount(); if (n === shownN) return;
  shownN = n;
  const g = plate.image.getContext('2d'), w = plate.image.width, h = plate.image.height;
  g.fillStyle = '#F6EFE4'; g.fillRect(0, 0, w, h);   // (an enamel plate)
  g.fillStyle = '#7A1D16'; g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(tr('life.post.plate', { n }), w / 2, h / 2 + 1, w - 20);
  plate.needsUpdate = true;
}
const showTips = () => tips.forEach((t, k) => { t.visible = k < Math.min(inBox, tips.length); });

/* events (life/incidents.js) */
export function onCommit() {
  const d = officeNow().toDateString(); if (d !== day) { day = d; today = 0; }
  today++;
}
// the session's character walks the letter to the box (instead of tidying the desk), unless it did a moment ago
export function postAction(w, a) {
  if (!box || w.sub || w.leaving || w.away || state.sim - (w.postAt ?? -1e9) < WALK_EVERY) { inBox++; showTips(); return null; }
  w.postAt = state.sim;
  const act = { ...a, station: 'post', anim: 'tidy', dwell: 1.4,
    go: (p) => { if (act.station === 'post') p.carry = 'letter'; },   // (the box taken: done from the desk, no letter to carry)
    after: () => { w.carry = null; inBox++; showTips(); if (act.station === 'post') { sfx.play('pop'); w.say('commit', line('people.post.drop')); } } };
  return act;
}
export function onPush() { if (!due && !trip) due = state.sim + (reduceMotion ? 2 : rand(8, 16)); }

/* the postman's round */
function collect() {
  const { arrive, depart, say } = staffKit();
  trip = true; due = 0;
  const P = postman, later = (s, fn) => { P.afterAt = state.sim + (reduceMotion ? Math.min(s, 0.5) : s); P.after = fn; };
  arrive(P, () => P.goTo(spot.postman, () => {
    P.faceTarget = spot.postman.face; P.anim = 'tidy'; say(P, 'people.staff.postHi', null, 3500); doorOpen = 1;
    later(2.6, () => {
      inBox = 0; showTips(); doorOpen = 0; P.carry = 'bag'; P.anim = 'idle'; P.waveUntil = state.sim + 1.4; sfx.play('pop');
      say(P, 'people.staff.postBye', null, 3500);
      later(1.6, () => depart(P, () => { P.carry = null; trip = false; }));
    });
  }));
}

export function updatePost(dt) {
  if (!box) return;
  if (door) door.rotation.y += (-doorOpen * 1.9 - door.rotation.y) * Math.min(1, dt * 6);   // (the front swings open on its hinge)
  if (postman && !postman.offstage) { const show = postman.phase === 'walk' || state.hovered === postman; if (postman.tagObj.visible !== show) postman.tagObj.visible = show; }
  if (state.sim < slowAt) return;
  slowAt = state.sim + 0.5;
  drawPlate();
  if (!due || trip || replay.on || !postman?.offstage || state.sim < due) return;
  if (!inBox) { due = 0; return; }   // nothing to take
  const h = officeNow().getHours();
  if (h >= 7 && h < 21) collect();   // (otherwise in the morning)
}

export function setup() {
  /* the box: red, a rounded top, the slot, a door below it on a hinge, three letters showing in the slot while it holds
     any; the plate on the wall under it. Built facing +z, turned to face into the room. */
  // (on the company floor a little lower, its top just under the low wall's; in the small office clear of the wainscot)
  const at = PRO ? { x: -3.53, z: DZ + 1.3, ry: Math.PI / 2, y: -0.15 } : { x: -7.9, z: 0.25, ry: Math.PI / 2, y: 0 };
  box = new THREE.Group(); box.position.set(at.x, at.y, at.z); box.rotation.y = at.ry; scene.add(box);
  const red = mat('#C8261B', { roughness: 0.45, metalness: 0.15 }), dark = mat('#8E1A13', { roughness: 0.5 }), slotM = mat('#1A1A1E', { roughness: 0.8 });
  put(box, rbox(0.36, 0.44, 0.2, red, 0.025), 0, 1.1, 0.1);
  { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 18, 1, false, 0, Math.PI), dark); top.rotation.z = Math.PI / 2; put(box, top, 0, 1.32, 0.1).castShadow = true; }   // (a half round, along the box)
  put(box, rbox(0.22, 0.026, 0.02, slotM, 0.006), 0, 1.24, 0.205);
  put(box, rbox(0.3, 0.012, 0.012, dark, 0.004), 0, 1.205, 0.206);   // (the slot's lip)
  // the door: hinged on its left edge
  const hinge = new THREE.Group(); hinge.position.set(-0.14, 0, 0.205); box.add(hinge); hinge.userData.noMerge = true;
  put(hinge, rbox(0.28, 0.22, 0.016, red, 0.01), 0.14, 1.0, 0.004);
  put(hinge, rbox(0.035, 0.012, 0.01, '#D9D2C2', 0.004), 0.24, 1.0, 0.014);   // (its handle)
  door = hinge;
  { const sign = canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = '#C8261B'; g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tr('life.post.sign'), w / 2, h / 2 + 1); });
    put(hinge, new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.056), new THREE.MeshBasicMaterial({ map: sign })), 0.14, 1.06, 0.0135); }
  tips = [-0.06, 0, 0.06].map((x, k) => { const e = put(box, rbox(0.07, 0.05, 0.006, '#FBFAF5', 0.002), x, 1.262 + (k % 2) * 0.008, 0.205); e.rotation.z = (k - 1) * 0.12; e.visible = false; e.userData.noMerge = true; return e; });
  plate = canvasTex(320, 64, () => {}); plate.colorSpace = THREE.SRGBColorSpace;
  const pm = put(box, new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.072), new THREE.MeshBasicMaterial({ map: plate })), 0, 0.8, 0.012); pm.userData.noMerge = true;
  put(box, rbox(0.38, 0.09, 0.012, mat('#B8912F', { roughness: 0.35, metalness: 0.6 }), 0.005), 0, 0.8, 0.004);   // (in a brass frame)
  document.fonts?.ready.then(() => { shownN = -1; });
  // where to stand to post a letter (people), and to empty the box (the postman): in front of it
  const front = (d) => { const x = at.x + Math.sin(at.ry) * d, z = at.z + Math.cos(at.ry) * d; return { x, z, face: at.ry + Math.PI, node: PRO ? nearestNode(new V2(x, z)) : 'I', sit: false, by: null }; };
  spot = { post: front(0.62), postman: front(0.55) };
  STATIONS.post = [spot.post];
  // the postman: a dark-green shirt and a cap, a white sack for the letters
  const { Staff } = staffKit();
  postman = new (class extends Staff { step() {} })({ name: tr('people.staff.postman'), shirt: '#2F5D3A', hair: '#2B2B2B', style: 'plain', acc: 'cap', outfit: 'shirt', pants: '#2B2F36', shoes: '#1B1B1E' }, '__postman');
}
// for tests and screenshots (?debug)
export const postState = () => ({ inBox, today: dayCount(), due: !!due, trip, postman: postman && { offstage: postman.offstage, phase: postman.phase, carry: postman.carry } });
