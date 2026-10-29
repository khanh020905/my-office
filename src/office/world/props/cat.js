// The office cat.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from '../../core/state.js';
import { PRO, V2, el, rand, randInt, wrapAngle } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put } from '../../scene/blocks.js';
import { sofaAt } from '../layout.js';
import { NODES, nearestNode, route } from '../../people/navigation.js';
import { sessions, workers } from '../../people/workers.js';
import { fp } from '../../interact/first-person.js';
import { catToKeyboard } from '../../people/errands.js';
import { sfx } from '../../audio/sfx.js';
import { t as tr } from '../../../i18n/index.js';

export let cat;
export let SOFA;
let CAT_SPOTS;
export function catGo(x, z, then) {
  const from = nearestNode(cat.pos), to = nearestNode(new V2(x, z));
  cat.path = route(from, to).map((k) => new V2(NODES[k][0], NODES[k][1])); cat.path.push(new V2(x, z));
  cat.mode = 'walk'; cat.then = then;
}
function catNext() {
  if (cat.restless) { cat.restless = false; if (catToKeyboard(16)) return; }   // just petted: off to find a keyboard
  const r = Math.random(), working = [...workers.values()].filter((w) => sessions.get(w.id)?.status === 'work' && w.pose === 'sit');
  if (r < 0.3) catGo(SOFA.via.x, SOFA.via.z, () => { cat.hop = { t: 0, from: [SOFA.via.x, 0, SOFA.via.z], to: [SOFA.x, SOFA.y, SOFA.z], up: true }; cat.mode = 'hop'; cat.after = () => { cat.mode = 'sleep'; cat.until = state.sim + rand(18, 40); cat.face = 0.4; }; });
  else if (r < 0.45 && working.length && catToKeyboard()) return;
  else if (r < 0.6 && working.length) { const w = working[randInt(0, working.length - 1)]; catGo(w.pos.x + 0.6, w.pos.y - 0.2, () => { cat.mode = 'sit'; cat.until = state.sim + rand(8, 16); cat.face = -Math.PI / 2; }); }
  else { const s = CAT_SPOTS[randInt(0, CAT_SPOTS.length - 1)]; catGo(s.x + rand(-0.3, 0.3), s.z + rand(-0.3, 0.3), () => { cat.mode = Math.random() < 0.3 ? 'sleep' : 'sit'; cat.until = state.sim + rand(5, 12); }); }
}
let heartTex;
const hearts = [];
export function petCat() {
  sfx.play('meow');
  for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); s.scale.setScalar(0.18); s.position.set(cat.pos.x + rand(-0.15, 0.15), cat.y + 0.55 + i * 0.05, cat.pos.y + rand(-0.15, 0.15)); scene.add(s); hearts.push({ s, life: 1.6 + i * 0.25 }); }
  cat.sayUntil = state.sim + 2.2; if (cat.mode !== 'walk' && cat.mode !== 'hop') { cat.mode = 'sit'; cat.until = state.sim + 6; }
}
export function updateCat(dt, t) {
  const c = cat;
  if (c.mode === 'walk') {
    const tgt = c.path[0];
    if (!tgt) { c.mode = 'sit'; c.until = state.sim + 3; c.then && c.then(); }
    else {
      const dx = tgt.x - c.pos.x, dz = tgt.y - c.pos.y, d = Math.hypot(dx, dz), step = 0.85 * dt;
      if (d <= step) { c.pos.copy(tgt); c.path.shift(); if (!c.path.length) { const cb = c.then; c.then = null; c.mode = 'sit'; c.until = state.sim + 3; cb && cb(); } }
      else { c.pos.x += (dx / d) * step; c.pos.y += (dz / d) * step; c.face = Math.atan2(dx, dz); }
    }
  } else if (c.mode === 'hop' && c.hop) {
    const h = c.hop; h.t = Math.min(1, h.t + dt * 1.8); const k = h.t;
    c.pos.set(h.from[0] + (h.to[0] - h.from[0]) * k, h.from[2] + (h.to[2] - h.from[2]) * k); c.y = h.from[1] + (h.to[1] - h.from[1]) * k + Math.sin(k * Math.PI) * 0.35;
    c.face = Math.atan2(h.to[0] - h.from[0], h.to[2] - h.from[2]);
    if (k >= 1) { c.hop = null; const a = c.after; c.after = null; a && a(); }
  } else if (state.sim > c.until || (c.restless && state.sim > c.restlessAt)) {
    if (c.y > 0.01) { const [x, z] = c.down || [SOFA.via.x, SOFA.via.z]; c.down = null; c.hop = { t: 0, from: [c.pos.x, c.y, c.pos.y], to: [x, 0, z] }; c.mode = 'hop'; c.after = () => catNext(); }
    else catNext();
  }
  const walking = c.mode === 'walk', sleeping = c.mode === 'sleep';
  c.g.position.set(c.pos.x, c.y + (walking ? Math.abs(Math.sin(t * 12)) * 0.015 : 0), c.pos.y);
  c.g.rotation.y += wrapAngle(c.face - c.g.rotation.y) * Math.min(1, dt * 8);
  c.legs.forEach((l, i) => { l.rotation.x = walking ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0; l.visible = !sleeping; });
  c.body.position.y = sleeping ? -0.12 : c.mode === 'sit' ? -0.03 : 0;
  c.body.scale.set(sleeping ? 1.1 : 1, sleeping ? 0.8 : 1, sleeping ? 0.85 : 1);
  c.head.rotation.x = sleeping ? 0.45 : Math.sin(t * 0.7) * 0.08;
  c.head.rotation.y = fp.on && fp.near === c ? THREE.MathUtils.clamp(wrapAngle(Math.atan2(fp.pos.x - c.pos.x, fp.pos.y - c.pos.y) - c.g.rotation.y), -0.9, 0.9) : Math.sin(t * 0.4) * 0.3;
  c.segs.forEach((s, i) => { s.rotation.x = sleeping ? 0.5 : -0.25 + Math.sin(t * 2.2 - i * 0.6) * 0.12; s.rotation.z = Math.sin(t * (sleeping ? 0.8 : 2.6) - i * 0.5) * (sleeping ? 0.05 : 0.22); });
  c.say.visible = state.sim < c.sayUntil;
  for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.life -= dt; h.s.position.y += dt * 0.45; h.s.material.opacity = Math.min(1, h.life); if (h.life <= 0) { scene.remove(h.s); h.s.material.dispose(); hearts.splice(i, 1); } }
}

export function setup() {
  /* the office cat: wanders the walk graph, naps on the sofa, sits beside whoever is working; pet it in first person */
  cat = (() => {
    const g = new THREE.Group(); scene.add(g);
    const fur = mat('#E59A4E', { roughness: 0.85 }), cream = mat('#F7DDBB', { roughness: 0.9 }), dark = mat('#B96A2A', { roughness: 0.85 }), pink = mat('#F4A7B9', { roughness: 0.6 });
    const body = new THREE.Group(); g.add(body);
    put(body, new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14).scale(0.85, 0.72, 1.35), fur), 0, 0.22, 0).castShadow = true;
    put(body, new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10).scale(0.8, 0.6, 1.1), cream), 0, 0.17, 0.05);
    for (let i = 0; i < 3; i++) put(body, new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 6, 16, Math.PI), dark), 0, 0.22, -0.12 + i * 0.1).rotation.y = Math.PI / 2;
    const head = new THREE.Group(); head.position.set(0, 0.36, 0.26); body.add(head);
    put(head, new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12).scale(1.08, 0.94, 0.95), fur), 0, 0, 0).castShadow = true;
    put(head, new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10).scale(1.2, 0.8, 0.8), cream), 0, -0.04, 0.09);
    for (const s of [-1, 1]) {
      const ear = put(head, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), fur), s * 0.075, 0.11, -0.01); ear.rotation.z = -s * 0.3;
      const inner = put(head, new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), pink), s * 0.073, 0.105, 0.012); inner.rotation.z = -s * 0.3;
      put(head, new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat('#1E1A16', { roughness: 0.2 })), s * 0.048, 0.02, 0.112);
      put(head, new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })), s * 0.044, 0.028, 0.128);
    }
    put(head, new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), pink), 0, -0.015, 0.142);
    const legs = [[-0.08, 0.16], [0.08, 0.16], [-0.08, -0.16], [0.08, -0.16]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, 0.16, z); body.add(l); put(l, cyl(0.036, 0.034, 0.15, fur, 8), 0, -0.075, 0); put(l, new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6).scale(1, 0.6, 1.2), cream), 0, -0.15, 0.01); return l; });
    const tail = new THREE.Group(); tail.position.set(0, 0.27, -0.26); body.add(tail);
    let seg = tail; const segs = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.Group(); s.position.set(0, i ? 0.055 : 0, i ? -0.02 : 0); seg.add(s); put(s, new THREE.Mesh(new THREE.SphereGeometry(0.034 - i * 0.002, 8, 6), i > 3 ? dark : fur), 0, 0.028, 0); segs.push(s); seg = s; }
    const bubble = el('div', 'tag cat-say'); bubble.textContent = tr('world.catSay'); const say = new CSS2DObject(bubble); say.position.set(0, 0.75, 0); say.visible = false; g.add(say);
    g.userData.dynamic = true;
    return { g, body, head, legs, segs, say, pos: PRO ? new V2(9.8, 6.4) : new V2(-0.9, 4.3), y: 0, face: 0, path: [], mode: 'sit', until: 4, target: null, hop: null, sayUntil: 0 };
  })();
  // where the cat naps (the coffee table in front of the sofa) and the spots it likes
  SOFA = PRO ? { x: sofaAt(0.05, 1.12)[0], z: sofaAt(0.05, 1.12)[1], y: 0.46, via: { x: sofaAt(0.05, 1.95)[0], z: sofaAt(0.05, 1.95)[1] } } : { x: -2.1, z: -4.72, y: 0.46, via: { x: -2.1, z: -3.85 } };
  CAT_SPOTS = PRO ? [{ x: 9.8, z: 6.4 }, { x: -5.6, z: 4.0 }, { x: 11.6, z: -2.9 }, { x: 4.6, z: -5.4 }, { x: 2.4, z: 7.9 }, { x: -2.9, z: -1.7 }, { x: 11.3, z: 7.5 }, { x: -6.1, z: -4.4 }]
    : [{ x: 1.0, z: -3.9 }, { x: -6.1, z: 3.4 }, { x: 6.2, z: 0.6 }, { x: -0.9, z: 4.3 }, { x: 3.0, z: 4.4 }, { x: -6.2, z: -0.6 }, { x: 5.0, z: -2.8 }];
  heartTex = canvasTex(64, 64, (g) => { g.fillStyle = '#FF5C8A'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(6, 36, 6, 12, 22, 12); g.bezierCurveTo(28, 12, 32, 18, 32, 22); g.bezierCurveTo(32, 18, 36, 12, 42, 12); g.bezierCurveTo(58, 12, 58, 36, 32, 54); g.fill(); });
}
