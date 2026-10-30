// Round photos for the group chat (group-chat-view.js): each person's own chibi, head and shoulders, drawn once by the
// office's renderer (the way Settings draws its portraits: same materials, light and tone mapping) and kept as a data
// URL. Until it is drawn, and for anyone without a look (you), a coloured circle with their initials, the way Zalo shows
// someone without a photo. At most one is drawn per frame, so a long chat never stalls the office.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, envDay } from '../scene/renderer.js';
import { makeChibi } from '../people/chibi-rig.js';
import { state } from '../core/state.js';
import { hash } from '../people/workers.js';

const S = 96, BG = [['#BFD8FF', '#5E9BF0'], ['#FFD2B0', '#EE8A52'], ['#C6EDCF', '#5DB477'], ['#E9CDF5', '#A66BCB'], ['#FFEBA8', '#E0AE2A'], ['#C3E6EA', '#4E9CA8'], ['#FFC9D3', '#E26A86']];
const INITIAL_BG = ['#4F8EF7', '#F2994A', '#27AE60', '#9B51E0', '#EB5757', '#2D9CDB', '#F2C94C', '#219653'];
const cache = new Map(), waiting = new Map();   // look key -> data URL; look key -> the elements waiting for it
let busy = false;
const keyOf = (look) => `${state.LOOK}|${look.shirt}|${look.hair}|${look.style}|${look.acc}|${look.outfit}|${look.skin}`;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);

function draw(look) {
  const scene = new THREE.Scene(); scene.environment = envDay;
  scene.add(new THREE.HemisphereLight('#FFF4DC', '#8E9A7C', 1.25));
  const key = new THREE.DirectionalLight('#FFF0D6', 1.7); key.position.set(-2, 4, 5); scene.add(key);
  const { root } = makeChibi({ name: '', ...look, look: state.LOOK }); root.rotation.y = 0.18; scene.add(root);
  // the head and the shoulders, like a profile photo: the top 64% of the figure, with the backdrop showing round it
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50), top = box.max.y, h = size.y * 0.64, cy = top - h * 0.47;
  const dist = (h * 1.05) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(mid.x, cy + h * 0.06, mid.z + dist); cam.lookAt(mid.x, cy, mid.z);
  const hdr = new THREE.WebGLRenderTarget(S, S, { type: THREE.HalfFloatType, samples: 4 }), ldr = new THREE.WebGLRenderTarget(S, S);
  const out = new OutputPass(), px = new Uint8Array(S * S * 4), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(hdr); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    out.render(renderer, ldr, hdr); renderer.readRenderTargetPixels(ldr, 0, 0, S, S, px);
  } finally { renderer.setRenderTarget(null); renderer.setClearColor(clear, alpha); hdr.dispose(); ldr.dispose(); out.dispose(); }
  // a soft backdrop like a profile photo's, then the figure over it
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), [a, b] = BG[hash(look.shirt + look.hair) % BG.length], grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, a); grad.addColorStop(1, b); g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const fig = document.createElement('canvas'); fig.width = fig.height = S;
  const img = new ImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);   // GL rows run bottom-up
  fig.getContext('2d').putImageData(img, 0, 0); g.drawImage(fig, 0, 0);
  return c.toDataURL('image/png');
}
function next() {
  busy = false;
  const [k, job] = waiting.entries().next().value || [];
  if (!k) return;
  busy = true;
  requestAnimationFrame(() => {
    let url = null; try { url = draw(job.look); } catch (err) { console.error(err); }
    cache.set(k, url); waiting.delete(k);
    for (const el of job.els) if (url) { el.style.backgroundImage = `url(${url})`; el.textContent = ''; }
    next();
  });
}
/** A round avatar for { name, look }: the chibi when it has a look, its initials until then. size in px. */
export function avatar(p, size = 40) {
  const el = document.createElement('span'); el.className = 'zc-av'; el.style.width = el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  if (p?.key === 'me' || !p?.look) { el.textContent = initials(p?.name); el.style.background = p?.key === 'me' ? 'linear-gradient(135deg, #2B3A55, #4A6491)' : INITIAL_BG[hash(p?.name || '') % INITIAL_BG.length]; el.style.fontSize = `${Math.round(size * 0.38)}px`; return el; }
  const k = keyOf(p.look);
  el.style.background = INITIAL_BG[hash(p.name || '') % INITIAL_BG.length]; el.style.backgroundSize = 'cover'; el.style.fontSize = `${Math.round(size * 0.38)}px`;
  const url = cache.get(k);
  if (url) { el.style.backgroundImage = `url(${url})`; return el; }
  el.textContent = initials(p.name);
  if (cache.has(k)) return el;   // (it failed to draw: the initials stay)
  const job = waiting.get(k) || { look: p.look, els: [] }; job.els.push(el); waiting.set(k, job);
  if (!busy) next();
  return el;
}
