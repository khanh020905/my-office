// The neon sign.
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { canvasTex, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { nightHooks } from './trinkets.js';

let neonTex;
export const neonG = new THREE.Group();
export let neonM;

export function setup() {
  /* neon sign above the library */
  neonTex = canvasTex(512, 128, (g) => { g.clearRect(0, 0, 512, 128); g.font = '900 76px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.shadowBlur = 22; g.shadowColor = '#FF4FA3'; g.strokeStyle = '#FF7DBE'; g.strokeText('SHIP IT', 230, 66); g.fillStyle = '#FFE3F1'; g.fillText('SHIP IT', 230, 66); g.shadowColor = '#4CC9F0'; g.fillStyle = '#BFF0FF'; g.font = '900 64px system-ui, sans-serif'; g.fillText('✦', 440, 64); });
   neonG.position.set(LAY.neon[0], LAY.neon[1], LAY.neon[2]);
   neonG.rotation.y = LAY.neon[3];
   scene.add(neonG);
  put(neonG, rbox(2.6, 0.72, 0.05, mat('#1C1F26', { roughness: 0.6 }), 0.03), 0, 0, 0);
  neonM = new THREE.MeshBasicMaterial({ map: neonTex, transparent: true });
  put(neonG, new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.62), neonM), 0, 0, 0.03);
  nightHooks.push((on) => neonM.color.setScalar(on ? 2.6 : 1.15));
}
