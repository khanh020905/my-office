/* Now and then an ambulance (white, red stripes, CẤP CỨU 115) or a fire engine (red, 114) comes through, its lights
   flashing red and blue: every 25–45 minutes of the office clock, along a street by the office (street-life.js drives
   it: down the middle, through red lights slowly, everyone pulling over for it). The siren sounds once a pass, if it
   comes into view. ?siren sends one a few seconds after load; __office.street.siren('ambulance' | 'firetruck') any time.
   The bodies are Kenney's Car Kit ambulance and firetruck (CC0, public/assets/vehicles); the lettering and the lamps are
   added here. Nothing runs while none is out but a look at the clock twice a second. */
import * as THREE from 'three';
import { canvasTex } from '../../scene/blocks.js';
import { sfx } from '../../audio/sfx.js';
import { seen } from './street-folk.js';

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('siren');
// where each one's light bar is (the kit's own blue lamps), and its lettering
const LOOK = {
  ambulance: { lamps: [0.98, 1.72, 0.38], text: ['CẤP CỨU', '115'], ink: '#C8102E', paper: '#FFFFFF', at: [-0.75, 1.42, 0.915], size: [1.25, 0.47] },
  firetruck: { lamps: [1.27, 1.97, 0.62], text: ['CỨU HOẢ', '114'], ink: '#FFFFFF', paper: '#C8102E', at: [-0.55, 1.2, 0.915], size: [1.2, 0.45] },
};
let DOT;
const dot = () => (DOT ??= canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }));

/** call(kind): street-life.js sends one out (null if it can't); list(): those out; vehicle(kind): each one's vehicle */
export function buildSirens(G, { call, list, vehicle }) {
  const kinds = Object.keys(LOOK), parts = {};
  for (const kind of kinds) {
    const L = LOOK[kind], tex = canvasTex(256, 96, (g) => {
      g.fillStyle = L.paper; g.fillRect(0, 0, 256, 96); g.fillStyle = L.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(L.text[0], 128, 22);
      g.font = '900 58px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(L.text[1], 128, 64);
    });
    // the lettering on both sides, in the vehicle's own frame (nose along +x)
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), g = new THREE.Group();
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(...L.size), m); p.position.set(L.at[0], L.at[1], s * L.at[2]); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
    g.matrixAutoUpdate = false; g.visible = false; G.add(g);
    // the lamps: one red, one blue, changing sides three times a second; a halo round each after dark
    const pos = new Float32Array(6), halo = new Float32Array(6);
    const pts = (arr, c, size, add) => { const o = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)), new THREE.PointsMaterial({ map: dot(), color: c, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: false })); o.frustumCulled = false; o.visible = false; G.add(o); return o; };
    const red = pts(pos.subarray(0, 3), new THREE.Color(3.2, 0.4, 0.3), 11), blue = pts(pos.subarray(3, 6), new THREE.Color(0.5, 1.2, 3.4), 11);
    const glowR = pts(halo.subarray(0, 3), new THREE.Color(1.6, 0.15, 0.1), 46, true), glowB = pts(halo.subarray(3, 6), new THREE.Color(0.2, 0.5, 1.8), 46, true);
    parts[kind] = { g, red, blue, glowR, glowB, drawn: false, sounded: false };
    const P = new THREE.Vector3();
    vehicle(kind).deco = (mat) => {   // (each frame it is drawn: street-life.js)
      const q = parts[kind], [lx, ly, lz] = L.lamps, flip = (performance.now() / 333) % 2 < 1, lit = vehicle(kind).siren;
      q.g.matrix.copy(mat); q.g.visible = true; q.drawn = true;
      for (const o of [q.red, q.blue, q.glowR, q.glowB]) o.visible = false;
      if (!lit) return;   // (past, and back to plain driving: the lamps off)
      for (const [o, h, side] of [[q.red, q.glowR, flip ? 1 : -1], [q.blue, q.glowB, flip ? -1 : 1]]) {
        P.set(lx, ly, side * lz).applyMatrix4(mat);
        o.geometry.attributes.position.array.set([P.x, P.y, P.z]); o.geometry.attributes.position.needsUpdate = true;
        h.geometry.attributes.position.array.set([P.x, P.y, P.z]); h.geometry.attributes.position.needsUpdate = true;
        o.visible = true; h.visible = nightOn;
      }
    };
  }
  let nightOn = false, next = -1, checkAt = -1;
  const rnd = (a, b) => a + Math.random() * (b - a);
  return {
    call(kind) { return call(kind || (Math.random() < 0.7 ? 'ambulance' : 'firetruck')); },
    update(dt, t) {
      const out = list();
      if (!out.length && t - checkAt < 0.5) return;
      if (!out.length || t - checkAt >= 0.5) {
        // twice a second: put away the lettering of one gone off the streets, and see whether it's time for the next
        checkAt = t;
        for (const kind of kinds) { const q = parts[kind]; if (q.drawn && !vehicle(kind).on) { q.drawn = q.sounded = false; for (const o of [q.g, q.red, q.blue, q.glowR, q.glowB]) o.visible = false; } }
        if (next < 0) next = t + (DEBUG ? 4 : rnd(5, 20) * 60);
        if (!out.length && t > next) { this.call(); next = t + rnd(25, 45) * 60; }
        if (!out.length) return;
      }
      // one out: the lamps keep up with it (deco, above); the siren once a pass, when it is in view
      for (const v of out) {
        const q = parts[v.name];
        if (q && !q.sounded && v.px != null && seen(v.px, v.pz, 0.5)) { q.sounded = true; sfx.play('siren'); }
      }
    },
    night(on) { nightOn = on; },
  };
}
