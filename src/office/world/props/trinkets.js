// Desk trinkets and the seeded random used by props.
import * as THREE from 'three';
import { PRO } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../../scene/blocks.js';
import { DESKS } from '../desks.js';

/* ---------- fun props: desk trinkets, an aquarium, an arcade cabinet, a printer that prints when a session finishes,
   a TV with live machine stats, a neon sign, string lights at night, and a cat and a robot vacuum that roam the
   walk graph. Everything is placed off the walk paths. ---------- */
export const nightHooks = [];
let propSeed = 77;
export const pr = () => (propSeed = (propSeed * 16807) % 2147483647) / 2147483647;
export const prPick = (a) => a[Math.floor(pr() * a.length)];
let photoTex;
export function trinket(kind, x, y, z, ry = 0, parent = scene) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  const m = (c, o = {}) => mat(c, { roughness: 0.45, ...o });
  switch (kind) {
    case 'duck':
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10).scale(1, 0.8, 1.25), m('#FFD43B')), 0, 0.05, 0);
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), m('#FFD43B')), 0, 0.13, 0.045);
      put(g, new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8).rotateX(Math.PI / 2), m('#F08A24')), 0, 0.125, 0.1);
      for (const s of [-1, 1]) put(g, new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), m('#141414')), s * 0.022, 0.145, 0.085);
      break;
    case 'cactus':
      put(g, cyl(0.05, 0.04, 0.07, m('#C96F4A'), 12), 0, 0.035, 0);
      put(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.08, 4, 8), m('#4F8A4A')), 0, 0.13, 0);
      put(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.04, 4, 6), m('#4F8A4A')), 0.035, 0.13, 0).rotation.z = -0.9;
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), m('#FF6F91')), 0, 0.2, 0);
      break;
    case 'frame': {
      const f = put(g, rbox(0.15, 0.115, 0.016, m('#2B2F36'), 0.004), 0, 0.065, 0); f.rotation.x = -0.22;
      const pic = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.088), new THREE.MeshBasicMaterial({ map: photoTex })), 0, 0.066, 0.01); pic.rotation.x = -0.22;
      break;
    }
    case 'can': put(g, cyl(0.032, 0.032, 0.115, m(prPick(['#2EC4B6', '#E63946', '#F4A261', '#6C5CE7'])), 14), 0, 0.058, 0); put(g, cyl(0.028, 0.032, 0.012, m('#C8CDD2', { metalness: 0.7, roughness: 0.3 }), 14), 0, 0.12, 0); break;
    case 'robot':
      put(g, cyl(0.05, 0.055, 0.015, m('#2B2F36'), 14), 0, 0.008, 0);
      put(g, rbox(0.07, 0.07, 0.05, m('#B8C2CC', { metalness: 0.4 }), 0.012), 0, 0.055, 0);
      put(g, rbox(0.075, 0.06, 0.06, m('#D9E1E8', { metalness: 0.3 }), 0.015), 0, 0.125, 0);
      for (const s of [-1, 1]) put(g, new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 1.8) })), s * 0.018, 0.13, 0.031);
      put(g, cyl(0.004, 0.004, 0.05, m('#2B2F36'), 5), 0, 0.18, 0); put(g, new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: '#FF5F5F' })), 0, 0.205, 0);
      break;
    case 'donut':
      put(g, cyl(0.08, 0.08, 0.01, m('#FFFFFF'), 18), 0, 0.005, 0);
      { const d = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.024, 10, 18), m('#C68B59')), 0, 0.03, 0); d.rotation.x = Math.PI / 2; const ic = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.02, 10, 18, Math.PI * 2), m(prPick(['#F28AB2', '#7B4B2A', '#FFF1C1']))), 0, 0.04, 0); ic.rotation.x = Math.PI / 2; ic.scale.z = 0.5; }
      break;
    case 'books': for (let i = 0; i < 3; i++) put(g, rbox(0.17 - i * 0.015, 0.03, 0.12, m(prPick(['#C8553D', '#3E8EDE', '#2A9D8F', '#F2B33D', '#6C5CE7'])), 0.006), (pr() - 0.5) * 0.02, 0.016 + i * 0.031, 0).rotation.y = (pr() - 0.5) * 0.3; break;
  }
  return g;
}

export function setup() {
  photoTex = canvasTex(64, 48, (g) => { const s = g.createLinearGradient(0, 0, 0, 48); s.addColorStop(0, '#8EC8F2'); s.addColorStop(1, '#E4F2F8'); g.fillStyle = s; g.fillRect(0, 0, 64, 48); g.fillStyle = '#FFD166'; g.beginPath(); g.arc(48, 12, 6, 0, 7); g.fill(); g.fillStyle = '#6A9A4C'; g.beginPath(); g.moveTo(0, 48); g.lineTo(18, 24); g.lineTo(34, 40); g.lineTo(46, 28); g.lineTo(64, 48); g.fill(); });
  DESKS.forEach((d) => {
    const kinds = ['duck', 'cactus', 'frame', 'can', 'robot', 'donut', 'books'];
    trinket(prPick(kinds), 0.5, 0.8, -0.22, pr() * 0.8 - 0.4, d.g);
    if (!PRO && pr() < 0.6) trinket(prPick(kinds), -0.33, 0.8, 0.26, pr() * 0.8 - 0.4, d.g);
    // sticky notes on the back of the laptop lid
    const lx = 0, ly = 0.81, lz = 0.15, a = 0.28;
    for (const [ox, oy, c] of [[-0.14, 0.28, '#FFE787'], [0.12, 0.22, prPick(['#FFB3C7', '#B9F2C9', '#BFDDF7'])]]) {
      if (pr() < 0.35) continue;
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), mat(c, { roughness: 0.9 }));
      n.position.set(lx + ox, ly + oy * Math.cos(a) - 0.015 * Math.sin(a), lz + oy * Math.sin(a) + 0.015 * Math.cos(a));
      n.rotation.set(a, 0, (pr() - 0.5) * 0.25); d.g.add(n);
    }
  });
}
