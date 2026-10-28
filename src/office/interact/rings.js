// Selection and hover rings on the floor.
import * as THREE from 'three';
import { scene } from '../scene/renderer.js';

/* selection + hover rings on the floor */
export const selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.53, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 1.0), transparent: true, opacity: 0.9, depthWrite: false }));
export const hoverRing = new THREE.Mesh(selRing.geometry, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.35, depthWrite: false }));

export function setup() {
  selRing.rotation.x = -Math.PI / 2;
   selRing.visible = false;
   scene.add(selRing);
  hoverRing.rotation.x = -Math.PI / 2;
   hoverRing.visible = false;
   scene.add(hoverRing);
}
