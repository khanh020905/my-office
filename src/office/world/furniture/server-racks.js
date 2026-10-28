// Server racks with LEDs and fans that follow the Mac's CPU.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from '../../core/state.js';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { cyl, mat, noOutline, put, rbox } from '../../scene/blocks.js';
import { metal } from '../terrace.js';
import { LAY } from '../layout.js';

/* server room: glass partition, racks with glass doors, LEDs follow the Mac's memory pressure */
export const leds = [], ledSpots = [];
// three racks side by side, built facing +z around the group's origin, then turned to face the room
export const rackG = new THREE.Group();
const rackGlass = new THREE.MeshStandardMaterial({ color: '#0E1116', transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.4 });
export let ledMesh;
const _led = new THREE.Color();
export function syncLeds() { leds.forEach((L, i) => ledMesh.setColorAt(i, _led.copy(L.emissive).multiplyScalar(L.emissiveIntensity))); ledMesh.instanceColor.needsUpdate = true; }
let fanBladeGeo;
let fanBladeM;
export const fans = [];
export const partitionGlass = new THREE.MeshStandardMaterial({ color: '#BFD8EE', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false });

export function setup() {
   rackG.position.set(LAY.racks[0], 0, LAY.racks[1]);
   rackG.rotation.y = LAY.racks[2];
   scene.add(rackG);
  for (let i = 0; i < 3; i++) {
    const x = -1.05 + i * 1.05;
    put(rackG, rbox(0.95, 2.4, 0.8, '#1E2229', 0.04), x, 1.2, 0);
    for (let r = 0; r < 7; r++) {
      put(rackG, rbox(0.8, 0.22, 0.03, '#2C323B', 0.01), x, 0.34 + r * 0.29, 0.41);
      for (let k = 0; k < 4; k++) {
        const base = k === 3 ? '#4FB6FF' : k === 1 ? '#FFB347' : '#5BE37D';
        leds.push({ emissive: new THREE.Color(base), emissiveIntensity: 1.6, userData: { base } });
        ledSpots.push([x + 0.12 + k * 0.08, 0.34 + r * 0.29, 0.434]);
      }
    }
    put(rackG, new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.3, 0.02), rackGlass), x, 1.2, 0.43);
  }
  // all 84 rack LEDs are one instanced mesh (one draw call instead of 84); colour = emissive x intensity, as before
  ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), noOutline(new THREE.MeshBasicMaterial({ color: '#FFFFFF' })), ledSpots.length);
  ledSpots.forEach(([x, y, z], i) => ledMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  ledMesh.computeBoundingSphere();
   rackG.add(ledMesh);
  syncLeds();
  put(rackG, rbox(3.3, 0.06, 0.4, metal, 0.01), 0, 2.5, -0.05);
  // two exhaust fans on top of each rack: they spin with the Mac's real CPU load (and the LEDs blink with it)
  fanBladeGeo = mergeGeometries([0, 1, 2, 3, 4].map((k) => new THREE.BoxGeometry(0.11, 0.008, 0.04).translate(0.065, 0, 0).rotateY((k * 2 * Math.PI) / 5).rotateX(0)));
  fanBladeM = mat('#9AA3AD', { metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 3; i++) for (const fx of [-0.22, 0.22]) {
    const x = -1.05 + i * 1.05 + fx, z = 0.2;
    put(rackG, cyl(0.15, 0.15, 0.03, mat('#15181D', { roughness: 0.6 }), 24), x, 2.415, z);
    put(rackG, new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 28).rotateX(Math.PI / 2), metal), x, 2.435, z);
    const b = new THREE.Mesh(fanBladeGeo, fanBladeM); b.position.set(x, 2.43, z); b.userData.noMerge = true; rackG.add(b);
    put(rackG, cyl(0.03, 0.03, 0.02, metal, 12), x, 2.445, z);
    fans.push(b);
  }
  state.cpuLoad = 0.2; state.fanSpin = 0;
  if (!PRO) {
    put(scene, new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.6, 2.1), partitionGlass), 3.75, 1.3, -4.95);
    for (const z of [-6.0, -3.9]) put(scene, rbox(0.06, 2.6, 0.06, metal, 0.01), 3.75, 1.3, z);
    put(scene, rbox(0.06, 0.06, 2.16, metal, 0.01), 3.75, 2.6, -4.95);
  }
}
