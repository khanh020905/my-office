// The arcade cabinet and its little game.
import * as THREE from 'three';
import { state } from '../../core/state.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { nightHooks } from './trinkets.js';
import { t as tr } from '../../../i18n/index.js';

export let ARC;
let arcCanvas;
let arcTex;
export let arcM;
let arcScreen;
let marqTex;
export let marqM;
export function drawArcade(t) {
  const g = arcCanvas.getContext('2d');
  g.fillStyle = '#05030C'; g.fillRect(0, 0, 96, 72);
  if (state.arcCoin > t) {
    g.textAlign = 'center'; g.font = 'bold 11px monospace';
    if (Math.floor(t * 4) % 2) { g.fillStyle = '#FFD166'; g.fillText('INSERT', 48, 30); g.fillText('COIN', 48, 44); }
    g.fillStyle = '#4CC9F0'; g.font = '7px monospace'; g.fillText(tr('world.arcadeSoon'), 48, 64); g.textAlign = 'left';
    arcTex.needsUpdate = true; return;
  }
  const sweep = Math.sin(t * 0.8) * 10;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = 14 + c * 12 + sweep, y = 8 + r * 9, f = Math.floor(t * 2) % 2;
    g.fillStyle = ['#F72585', '#4CC9F0', '#FFD166'][r];
    g.fillRect(x, y, 7, 4); g.fillRect(x + (f ? 0 : 1), y + 4, 2, 2); g.fillRect(x + (f ? 5 : 4), y + 4, 2, 2);
  }
  const sx = 48 + Math.sin(t * 1.3) * 30;
  g.fillStyle = '#7CFC9A'; g.fillRect(sx - 5, 62, 10, 4); g.fillRect(sx - 1, 59, 2, 3);
  g.fillStyle = '#FFFFFF'; const by = 58 - ((t * 60) % 50); g.fillRect(sx, by, 1, 3);
  g.fillStyle = '#FFD166'; g.font = '7px monospace'; g.fillText(`${String(Math.floor(t * 37) % 99999).padStart(5, '0')}`, 3, 70);
  arcTex.needsUpdate = true;
}

export function setup() {
  /* arcade cabinet with a tiny invaders game on its screen */
  ARC = { x: LAY.arc[0], z: LAY.arc[1] };
  put(scene, rbox(0.8, 1.75, 0.7, mat('#4B2E83', { roughness: 0.55 }), 0.04), ARC.x, 0.875, ARC.z);
  for (const s of [-1, 1]) put(scene, rbox(0.02, 1.5, 0.5, mat('#F72585', { roughness: 0.5 }), 0.005), ARC.x + s * 0.405, 0.95, ARC.z);
  put(scene, rbox(0.76, 0.1, 0.32, mat('#2A1B4F', { roughness: 0.5 }), 0.02), ARC.x, 0.98, ARC.z + 0.42).rotation.x = 0.25;
  put(scene, cyl(0.012, 0.012, 0.1, '#222', 6), ARC.x - 0.18, 1.06, ARC.z + 0.44);
  put(scene, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#E63946')), ARC.x - 0.18, 1.12, ARC.z + 0.44);
  for (const [k, c] of [[0, '#FFD166'], [1, '#4CC9F0'], [2, '#7CFC9A']]) put(scene, cyl(0.025, 0.025, 0.02, c, 12), ARC.x + 0.04 + k * 0.08, 1.05, ARC.z + 0.46);
  arcCanvas = document.createElement('canvas');
   arcCanvas.width = 96;
   arcCanvas.height = 72;
  arcTex = new THREE.CanvasTexture(arcCanvas);
   arcTex.colorSpace = THREE.SRGBColorSpace;
   arcTex.magFilter = THREE.NearestFilter;
   arcTex.minFilter = THREE.NearestFilter;
  arcM = new THREE.MeshBasicMaterial({ map: arcTex });
  arcScreen = put(scene, new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), arcM), ARC.x, 1.38, ARC.z + 0.33);
   arcScreen.rotation.x = -0.2;
  marqTex = canvasTex(256, 64, (g) => { g.fillStyle = '#12081F'; g.fillRect(0, 0, 256, 64); g.font = '900 38px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#F72585'; g.shadowBlur = 14; g.fillStyle = '#FFD6F0'; g.fillText('ARCADE', 128, 34); });
  marqM = new THREE.MeshBasicMaterial({ map: marqTex });
  put(scene, new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.19), marqM), ARC.x, 1.66, ARC.z + 0.355);
  nightHooks.push((on) => { marqM.color.setScalar(on ? 2.2 : 1); arcM.color.setScalar(on ? 1.6 : 1); });
}
