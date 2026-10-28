// The cozy plan's room: floor and walls.
import * as THREE from 'three';
import { PRO, rand } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, mat, noOutline, put, rbox, rug, toonMat } from '../scene/blocks.js';

export function setup() {
  /* room floor and walls */
  if (!PRO) {
  put(scene, rbox(16.6, 0.5, 12.6, '#7A5A3E', 0.05), 0, -0.25, 0);
  const floorTex = canvasTex(1024, 768, (g, w, h) => {
    const rows = 24, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * 200;
      while (x < w) {
        const pw = rand(200, 380), l = 66 + rand(-6, 5);
        const grd = g.createLinearGradient(x, 0, x + pw, 0); grd.addColorStop(0, `hsl(30, 42%, ${l}%)`); grd.addColorStop(1, `hsl(28, 40%, ${l - 4}%)`);
        g.fillStyle = grd; g.fillRect(x, r * rh, pw, rh);
        g.fillStyle = 'rgba(80,50,25,.35)'; g.fillRect(x, r * rh, 2, rh);
        x += pw;
      }
      g.fillStyle = 'rgba(80,50,25,.38)'; g.fillRect(0, r * rh, w, 1.5);
    }
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(110,70,35,${rand(0.03, 0.09)})`; g.fillRect(rand(0, w), rand(0, h), rand(20, 90), 1); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), noOutline(toonMat({ map: floorTex, roughness: 0.55 })));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true; scene.add(floor);
  const wallM = mat('#F1E6D2', { roughness: 0.9 }), wainM = mat('#C9D5B2', { roughness: 0.85 }), slatM = mat('#B9C6A1'), trimM = mat('#8C6646', { roughness: 0.6 });
  put(scene, rbox(16.6, 4.2, 0.3, wallM, 0.04), 0, 2.1, -6.15);
  put(scene, rbox(0.3, 4.2, 12.6, wallM, 0.04), -8.15, 2.1, 0);
  put(scene, rbox(16, 1.25, 0.04, wainM, 0.01), 0, 0.63, -5.99);
  put(scene, rbox(0.04, 1.25, 12, wainM, 0.01), -7.99, 0.63, 0);
  for (let x = -7.6; x < 8; x += 0.4) if (x < -1.5 || x > 3.3) put(scene, rbox(0.035, 1.05, 0.03, slatM, 0.01), x, 0.68, -5.955);
  for (let z = -5.6; z < 6; z += 0.4) if (z < 0.5 || z > 2.5) put(scene, rbox(0.03, 1.05, 0.035, slatM, 0.01), -7.955, 0.68, z);
  put(scene, rbox(16, 0.2, 0.07, trimM, 0.02), 0, 0.1, -5.96);
  put(scene, rbox(0.07, 0.2, 12, trimM, 0.02), -7.96, 0.1, 0);
  put(scene, rbox(16, 0.06, 0.08, trimM, 0.02), 0, 1.28, -5.96);
  put(scene, rbox(0.08, 0.06, 12, trimM, 0.02), -7.96, 1.28, 0);
  put(scene, rbox(16.6, 0.14, 0.42, '#E7DAC3', 0.03), 0, 4.25, -6.15);
  put(scene, rbox(0.42, 0.14, 12.6, '#E7DAC3', 0.03), -8.15, 4.25, 0);
  put(scene, rbox(16.6, 0.5, 0.3, wallM, 0.02), 0, 0.0, 6.15).visible = false;

  /* zone floors */
  rug(-5.2, -4.25, 4.3, 2.3, '#D9CCE3');
  rug(0.6, -4.35, 3.0, 2.0, '#C9DDEC');
  rug(-6.85, -1.83, 2.0, 2.45, '#CCE3D1');
  rug(0, 0.35, 6.9, 5.7, '#E6D3AE');
  rug(-5.5, 4.4, 3.8, 2.3, '#EFC9A2');
  rug(-7.45, 1.5, 0.9, 1.5, '#8F6240', 0.15);
  put(scene, rbox(3.9, 0.03, 2.5, mat('#262A31', { roughness: 0.6 }), 0.01), 5.55, 0.016, -4.85);
  const meetRug = cyl(2.25, 2.25, 0.025, noOutline(mat('#F0CDB6')), 48);
  meetRug.castShadow = false; put(scene, meetRug, 5.2, 0.016, 2.4);
  }
}
