// The whiteboard's frame (its drawing lives in ui/whiteboard.js).
import * as THREE from 'three';
import { scene } from '../../scene/renderer.js';
import { put, rbox, toonMat } from '../../scene/blocks.js';
import { LAY } from '../layout.js';

/* whiteboard: a "Plan" title with a checklist; sticky notes appear on each new prompt */
export const board = new THREE.Group();
export let boardFace;
// six sticky notes on the right half of the board (your own to-dos); the left half is drawn by drawBoard()
export const STICKY_SLOTS = [];
export const STICKY_COLORS = ['#FFE787', '#FFB5C2', '#BDE7C8', '#BFDDF7'];

export function setup() {
   board.position.set(LAY.board[0], LAY.board[1], LAY.board[2]);
   board.rotation.y = LAY.board[3];
   scene.add(board);
  put(board, rbox(0.08, 1.75, 3.25, '#9AA3AD', 0.03), 0, 0, 0);
  boardFace = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), toonMat({ roughness: 0.4 }));
  boardFace.rotation.y = Math.PI / 2;
   boardFace.position.x = 0.045;
   board.add(boardFace);
  put(board, rbox(0.14, 0.05, 1.2, '#9AA3AD', 0.02), 0.1, -0.86, 0.6);
  for (const y of [0.25, -0.18]) for (const z of [-0.47, -0.89, -1.31]) STICKY_SLOTS.push({ y, z });
}
