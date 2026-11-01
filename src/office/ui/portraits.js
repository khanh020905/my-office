// Portraits of the two character looks for Settings → Characters: two people in each look, drawn by the office's own
// renderer (same materials, light and tone mapping, so they match what you will see) into a canvas, the first time the
// tab opens. The render targets are freed right after.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, envDay } from '../scene/renderer.js';
import { disposeChibi, makeChibi } from '../people/chibi-rig.js';

const W = 360, H = 260;   // twice the card's size, for sharp edges on Retina screens
const CAST = [
  { name: 'Mai', shirt: '#E8865F', hair: '#3B2618', style: 'ponytail', acc: 'headphones', pants: '#33415C', x: -0.42, ry: 0.32 },
  { name: 'Long', shirt: '#5F8FD8', hair: '#1E1E24', style: 'spiky', acc: 'glasses', pants: '#3A3A44', x: 0.42, ry: -0.32 },
];
const done = new Set();

function draw(look) {
  const scene = new THREE.Scene();
  scene.environment = envDay;
  scene.add(new THREE.HemisphereLight('#FFF4DC', '#8E9A7C', 1.2));
  const key = new THREE.DirectionalLight('#FFF0D6', 1.6); key.position.set(-2, 4, 5); scene.add(key);
  const group = new THREE.Group(); scene.add(group);
  const shadowM = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false });
  const rigs = [], circle = new THREE.CircleGeometry(0.3, 32);
  for (const c of CAST) {
    const { root, P } = makeChibi({ ...c, look }); rigs.push(P);
    const x = c.x * (look === 'toy' ? 1.28 : 1);   // the toy look's heads are wider
    root.position.x = x; root.rotation.y = c.ry; group.add(root);
    const sh = new THREE.Mesh(circle, shadowM); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.002, 0); group.add(sh);
  }
  // frame the pair: their bounding box, a little air above the heads
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 50);
  const fitH = size.y * 1.12, fitW = (size.x * 1.15) / cam.aspect, fit = Math.max(fitH, fitW);
  const dist = fit / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(mid.x, mid.y + size.y * 0.12, mid.z + dist); cam.lookAt(mid.x, mid.y + size.y * 0.02, mid.z);

  // HDR render, then the same tone mapping as the office (OutputPass), into 8-bit pixels we can read back
  const hdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }), ldr = new THREE.WebGLRenderTarget(W, H);
  const out = new OutputPass(), px = new Uint8Array(W * H * 4);
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(hdr); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    out.render(renderer, ldr, hdr);
    renderer.readRenderTargetPixels(ldr, 0, 0, W, H, px);
  } finally {
    renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha);
    hdr.dispose(); ldr.dispose(); out.dispose(); shadowM.dispose(); circle.dispose();
    for (const P of rigs) disposeChibi(P);   // (the two rigs were made for this picture only)
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL rows run bottom-up
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** Fills every [data-portrait] slot that is still empty (call when the Characters tab opens). */
export function drawPortraits() {
  for (const slot of document.querySelectorAll('[data-portrait]')) {
    const look = slot.dataset.portrait;
    if (done.has(slot)) continue;
    try { const c = draw(look); c.className = 'st-portrait-img'; slot.replaceChildren(c); done.add(slot); } catch (err) { console.error(err); }
  }
}
