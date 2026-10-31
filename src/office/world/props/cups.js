// A cup of coffee on each resting desk ("Đồng hồ bộ nhớ đệm"): its steam fades as the session's prompt cache cools
// (src/shared/cache-clock.js) and is gone once the cache is cold, when writing to the session again means it reads the
// whole conversation back. Two draws for every desk together: one instanced mesh for the cups, one for the steam (a
// shared shader whose wisps rise by themselves). Each desk's warmth is a number written when it moves by a tenth, which
// is every few minutes on an hour's cache, every 30 seconds on five minutes'.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nowMs, reduceMotion } from '../../core/env.js';
import { state } from '../../core/state.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, mat } from '../../scene/blocks.js';
import { DESKS, dLocal, shaded } from '../desks.js';
import { sessions, workers } from '../../people/workers.js';
import { cacheClock } from '../../../shared/cache-clock.js';

// where it stands, in a desk's frame: on the desk mat right of the laptop, on the sitter's side (clear of the in-tray,
// the lamp and the mess: shredder.js, desks.js)
const CUP = [0.39, -0.1], DESK_TOP = 0.782, BIG = 1.6;   // (bigger than life, as the desks' mess is, so it reads from the usual camera)
const Z0 = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
let cups, steam, warm, steamMat, checkAt = 0, anyWarm = false, hooked = false;
let shown = [];   // desk -> what it shows: -1 no cup, 0 a cold cup, 1..10 the steam's warmth in tenths

const atDesk = new Map();   // desk -> its session (filled again at each look)
// what desk d shows now: a cup while its person rests there (not gone home), steaming while the cache is warm
function cupOf(d, now) {
  const s = atDesk.get(d), w = s && workers.get(s.id);
  if (!s || !w || w.away || w.leaving || s.status !== 'rest') return -1;
  const k = cacheClock(s.cache, now);
  if (k.state === 'none') return -1;
  return k.state === 'warm' ? Math.max(1, Math.ceil(k.warmth * 10)) : 0;   // (any warmth left shows a wisp)
}
function place(i, v) {
  if (v < 0) { cups.setMatrixAt(i, Z0); steam.setMatrixAt(i, Z0); warm.setX(i, 0); return; }
  const d = DESKS[i], [x, z] = dLocal(d, CUP[0], CUP[1]);
  Q.setFromAxisAngle(UP, d.ry + 0.5);   // (its handle turned a little toward the sitter)
  cups.setMatrixAt(i, M.compose(P.set(x, DESK_TOP, z), Q, S1));
  steam.setMatrixAt(i, v ? M.compose(P.set(x, DESK_TOP + 0.075 * BIG, z), Q.identity(), S1) : Z0);
  warm.setX(i, 0.25 + 0.75 * (v / 10));   // (faint but there until the very end)
}

/** Each frame: the wisps rise (one number for every desk); about once a second, which desks have a cup and how warm. */
export function updateCups(t) {
  if (!cups) return;
  if (!hooked && window.__office) { hooked = true; window.__office.cupsNow = cupsNow; }   // (?debug: the test hook)
  if (anyWarm && !reduceMotion) steamMat.uniforms.t.value = t;
  if (state.sim > checkAt || state.sim < checkAt - 5) {
    checkAt = state.sim + 1;
    const now = nowMs();
    let dirty = false;
    atDesk.clear(); for (const s of sessions.values()) if (s.desk >= 0) atDesk.set(s.desk, s);
    for (let i = 0; i < DESKS.length; i++) { const v = cupOf(i, now); if (v !== shown[i]) { shown[i] = v; place(i, v); dirty = true; } }
    if (dirty) { cups.instanceMatrix.needsUpdate = steam.instanceMatrix.needsUpdate = warm.needsUpdate = true; anyWarm = shown.some((v) => v > 0); steam.visible = anyWarm; cups.visible = shown.some((v) => v >= 0); }
  }
}
/** for tests (?debug): what each desk shows (-1 no cup, 0 cold, 1..10 warm) */
export const cupsNow = () => shown.slice();

export function setup() {
  const n = DESKS.length;
  // a terracotta mug (not the white pen pot every desk has) on a white saucer, the coffee in it
  const cupGeo = shaded([
    [new THREE.CylinderGeometry(0.036, 0.031, 0.075, 16).translate(0, 0.044, 0), '#C65B3A'],
    [new THREE.CylinderGeometry(0.033, 0.033, 0.003, 16).translate(0, 0.074, 0), '#4A2E1C'],
    [new THREE.TorusGeometry(0.019, 0.006, 6, 12, Math.PI).rotateZ(-Math.PI / 2).translate(0.035, 0.045, 0), '#C65B3A'],
    [new THREE.CylinderGeometry(0.06, 0.052, 0.006, 20).translate(0, 0.003, 0), '#E2DDD2'],
  ]).scale(BIG, BIG, BIG);
  cups = new THREE.InstancedMesh(cupGeo, mat('#FFFFFF', { roughness: 0.4, vertexColors: true }), n);
  // the steam: two crossed wisps over the cup, a soft texture scrolled up in the shader, faded by each desk's warmth
  const tex = canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (const [x0, ph, wd] of [[0.38, 0, 9], [0.6, 2.1, 8], [0.48, 4.2, 6]]) {
      g.beginPath();
      for (let y = 0; y <= h; y += 4) { const x = (x0 + Math.sin(y / h * Math.PI * 2 + ph) * 0.12) * w; if (y) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = wd; g.lineCap = 'round'; g.filter = 'blur(2px)'; g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const plane = () => new THREE.PlaneGeometry(0.15, 0.34).translate(0, 0.17, 0);
  const steamGeo = mergeGeometries([plane(), plane().rotateY(Math.PI / 2)]);
  warm = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); steamGeo.setAttribute('warm', warm);
  steamMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, t: { value: 0 } },
    vertexShader: `attribute float warm; varying vec2 vUv; varying float vWarm;
      void main() { vUv = uv; vWarm = warm; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform sampler2D map; uniform float t; varying vec2 vUv; varying float vWarm;
      void main() {
        vec4 c = texture2D(map, vec2(vUv.x + sin(vUv.y * 6.0 - t * 1.5) * 0.06 * vUv.y, vUv.y * 0.6 - t * 0.1));
        float a = c.a * vWarm * smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
        if (a < 0.01) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, min(1.0, a * 1.5));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  steam = new THREE.InstancedMesh(steamGeo, steamMat, n);
  for (const o of [cups, steam]) { o.userData.dynamic = true; o.userData.noCollide = true; o.frustumCulled = false; o.visible = false; scene.add(o); }
  cups.castShadow = true; cups.name = 'desk-cups'; steam.name = 'desk-steam';
  for (let i = 0; i < n; i++) { cups.setMatrixAt(i, Z0); steam.setMatrixAt(i, Z0); }
  shown = DESKS.map(() => -1);
}
