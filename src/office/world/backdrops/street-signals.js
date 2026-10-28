/* Countdown displays beside the traffic lights, as on Vietnam's crossings: a black box with a visor and two LED digits,
   red for the red light, green for the green, yellow in the last seconds of amber, counting down the light's own phase
   (street-life.js phaseOf). All the boxes are one merged mesh; all the faces are one mesh on one canvas, a cell each,
   redrawn when the second changes (at most once a second at normal speed) and only while a crossing is on screen. */
import * as THREE from 'three';
import { boxAt, mergeAll, vmat } from '../terrace.js';
import { seen } from './street-folk.js';

const CW = 64, CH = 40, COLS = 8;
// which of the seven segments (a b c d e f g) each digit lights
const SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const LIT = { r: '#FF3322', g: '#33FF66', y: '#FFC422' }, DIM = { r: '#3A0D0A', g: '#0B3316', y: '#3A2A08' };
function digit(g, n, x, y, w, h, on, off) {
  const t = Math.max(2, Math.round(w * 0.2)), segs = SEG[n] || '';
  const R = { a: [x + t, y, w - 2 * t, t], b: [x + w - t, y + t, t, h / 2 - t * 1.5], c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.5], d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + h / 2 + t / 2, t, h / 2 - t * 1.5], f: [x, y + t, t, h / 2 - t * 1.5], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t] };
  for (const [k, r] of Object.entries(R)) { g.fillStyle = segs.includes(k) ? on : off; g.fillRect(...r); }
}

/** poles: the signal poles ({ x, z, i, j, axis, fx, fz }); phaseOf, lightOf: street-life.js's; GY: the road's height */
export function buildSignals(G, { poles, phaseOf, lightOf, GY }) {
  if (!poles.length) return { update() {} };
  const n = poles.length, rows = Math.ceil(n / COLS), canvas = document.createElement('canvas');
  canvas.width = CW * COLS; canvas.height = CH * rows;
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  g.fillStyle = '#050505'; g.fillRect(0, 0, canvas.width, canvas.height);
  const boxes = [], faces = [], UP = new THREE.Vector3(0, 1, 0);
  poles.forEach((p, k) => {
    // beside the signal head, to its right as you face it, a little lower; facing the way the head faces
    const fl = Math.hypot(p.fx, p.fz) || 1, fx = p.fx / fl, fz = p.fz / fl, x = p.x - fz * 0.34, z = p.z + fx * 0.34, y = GY + 2.82;
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(fx, fz)), new THREE.Vector3(1, 1, 1));
    boxes.push(boxAt(0.36, 0.25, 0.12, 0, 0, 0, '#141518').applyMatrix4(M), boxAt(0.38, 0.02, 0.12, 0, 0.13, 0.07, '#141518').applyMatrix4(M), boxAt(0.05, 0.08, 0.05, 0, 0.17, -0.02, '#2E3238').applyMatrix4(M));
    const f = new THREE.PlaneGeometry(0.31, 0.19).translate(0, -0.005, 0.0615), uv = f.attributes.uv, cx = (k % COLS) * CW, cy = Math.floor(k / COLS) * CH;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i) * CW) / canvas.width, 1 - (cy + (1 - uv.getY(i)) * CH) / canvas.height);
    faces.push(f.applyMatrix4(M));
  });
  const box = new THREE.Mesh(mergeAll(boxes), vmat({ roughness: 0.6 })); box.matrixAutoUpdate = false; box.userData.part = 'signals'; G.add(box);
  const face = new THREE.Mesh(mergeAll(faces), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.matrixAutoUpdate = false; face.userData.part = 'signals'; G.add(face);
  const shown = new Array(n).fill('');
  let second = -1, lookAt = -1, inView = true;
  return {
    update(t) {
      const sec = Math.floor(t);
      if (sec === second) return;
      second = sec;
      if (t - lookAt > 1) { lookAt = t; inView = poles.some((p, k) => k % 4 === 0 && seen(p.x, p.z)); }   // (once a second: any crossing on screen?)
      if (!inView) return;
      let dirty = false;
      poles.forEach((p, k) => {
        // the seconds left of this light's colour: green 0–8, amber 8–10, red 10–22 of its 22 s cycle
        const ph = phaseOf(p.i, p.j, t, p.axis), s = lightOf(ph), left = Math.ceil((s === 'g' ? 8 : s === 'y' ? 10 : 22) - ph);
        const key = s + left;
        if (shown[k] === key) return;
        shown[k] = key; dirty = true;
        const cx = (k % COLS) * CW, cy = Math.floor(k / COLS) * CH;
        g.fillStyle = '#050505'; g.fillRect(cx, cy, CW, CH);
        const v = Math.min(99, Math.max(0, left));
        digit(g, Math.floor(v / 10), cx + 9, cy + 5, 20, 30, LIT[s], DIM[s]); digit(g, v % 10, cx + 35, cy + 5, 20, 30, LIT[s], DIM[s]);
      });
      if (dirty) tex.needsUpdate = true;
    },
  };
}
