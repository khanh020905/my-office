// The light switch by the door: on the company floor it puts out the open-plan floor's light (the one that follows its
// people after dark), in the cozy room the room's own lights. Floor lamps keep their own switches.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { ROOM_LAMPS, lamps } from '../../scene/lights.js';
import { mat, put, rbox } from '../../scene/blocks.js';
import { night } from '../room-update.js';
import { nightHooks } from './trinkets.js';
import { sfx } from '../../audio/sfx.js';

export const switches = [];
// the cozy room's lights are set straight from day/night; the company floor's room light eases there by itself
function apply(sw) {
  sw.lever.rotation.x = sw.off ? 0.45 : -0.45;
  if (sw.room.lamp) sw.room.lamp.off = sw.off;
  else for (const l of sw.lights) l.intensity = night && !sw.off ? 4.5 : 0;
}
export function flipSwitch(sw) { sw.off = !sw.off; apply(sw); sfx.play('click'); }

export function setup() {
  // on the dev floor's side of the low wall by the lobby doors; in the cozy room, on the left wall beside the door
  const at = PRO ? { x: -3.515, y: 1.0, z: 2.3, room: ROOM_LAMPS[0] } : { x: -7.93, y: 1.2, z: 0.2, room: { x0: -8, x1: 8, z0: -6, z1: 6 } };
  const g = new THREE.Group(); g.position.set(at.x, at.y, at.z); g.rotation.y = Math.PI / 2; scene.add(g);   // facing +x
  g.userData.noMerge = true; g.userData.noCollide = true;
  put(g, rbox(0.11, 0.16, 0.016, mat('#F4F1EA', { roughness: 0.5 }), 0.006), 0, 0, 0);
  const lever = new THREE.Group(); lever.position.set(0, 0, 0.01); g.add(lever);
  put(lever, rbox(0.032, 0.05, 0.018, mat('#E2DED5', { roughness: 0.4 }), 0.005), 0, 0.012, 0.004);
  // a bigger, invisible box to point at (the plate alone is a few pixels across)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.1)); hit.visible = false; g.add(hit);
  const sw = { g, lever, off: false, x: at.x, z: at.z, front: [1, 0],
    room: PRO ? { x0: at.room.x0, x1: at.room.x1, z0: at.room.z0, z1: at.room.z1, lamp: at.room } : at.room,
    lights: PRO ? [] : lamps.slice(0, 5) };
  switches.push(sw); apply(sw);
  // each evening starts with the lights on (and day/night sets the cozy room's lights afresh: keep them out if switched off)
  nightHooks.push((on) => { if (on) sw.off = false; apply(sw); });
}
