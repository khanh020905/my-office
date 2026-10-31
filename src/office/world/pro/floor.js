// The company floor: rooms, partitions and furniture.
import * as THREE from 'three';
import { PRO, tint } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { canvasTex, cyl, lampBulbs, mat, put, rbox, rug, toonMat } from '../../scene/blocks.js';
import { BULB_OFF, metal, potPlant, woodDark, woodMid } from '../terrace.js';
import { wallWindow } from '../windows.js';
import { makeSofa } from '../furniture/room-pieces.js';
import { DZ, STAIR } from '../entrance.js';
import { PODS, officeChair } from '../desks.js';
import { nightHooks, trinket } from '../props/trinkets.js';
import { OFFICE_MARK, PRO_FX, armchair, backPanel, chairUph, diningSet, floorZone, glassWall, gridTex, leftPanel, lowWall, plankTex, plateTex, speckTex } from './pieces.js';
import { t as tr } from '../../../i18n/index.js';

function buildProFloor() {
  /* shell: slab, the two outer walls, their caps */
  put(scene, rbox(22.6, 0.5, 17.6, '#7A5A3E', 0.05), 3, -0.25, 0.5);
  const wallM = mat('#EEE8DE', { roughness: 0.9 });
  put(scene, rbox(22.6, 4.2, 0.3, wallM, 0.04), 3, 2.1, -8.15);
  // (the left one with the stairs' doorway in it, beside the lift: world/entrance.js hangs the door)
  { const a = STAIR.z - STAIR.w / 2, b = STAIR.z + STAIR.w / 2;
    put(scene, rbox(0.3, 4.2, a + 8.3, wallM, 0.01), -8.15, 2.1, (a - 8.3) / 2);
    put(scene, rbox(0.3, 4.2, 9.3 - b, wallM, 0.01), -8.15, 2.1, (b + 9.3) / 2);
    put(scene, rbox(0.3, 4.2 - STAIR.h, STAIR.w, wallM, 0.01), -8.15, (4.2 + STAIR.h) / 2, STAIR.z); }
  put(scene, rbox(22.6, 0.14, 0.42, '#E2D9C8', 0.03), 3, 4.25, -8.15);
  put(scene, rbox(0.42, 0.14, 17.6, '#E2D9C8', 0.03), -8.15, 4.25, 0.5);
  put(scene, rbox(22, 0.18, 0.06, '#6E5440', 0.02), 3, 0.09, -7.97);    // skirting
  for (const [z0, z1] of [[-8, STAIR.z - STAIR.w / 2 - 0.05], [STAIR.z + STAIR.w / 2 + 0.05, 9]]) put(scene, rbox(0.06, 0.18, z1 - z0, '#6E5440', 0.02), -7.97, 0.09, (z0 + z1) / 2);

  /* floors */
  const devWood = plankTex(32, 74, 22), darkWood = plankTex(24, 46, 34), warmWood = plankTex(28, 58);
  floorZone(-3.6, 8.6, -1.6, 9, devWood);                                                   // dev floor: pale oak walkway
  floorZone(-3.6, 8.6, -3, -1.6, gridTex('#D7D2CA', 'rgba(120,110,100,.25)', 2), 1.2);     // corridor
  floorZone(-8, -2.6, -8, -3, speckTex('#4A5566', 3000, 0.06), 0.8);                        // director: carpet
  floorZone(-2.6, 3.0, -8, -3, speckTex('#8D939C', 3000, 0.06), 0.8);                       // meeting: carpet
  floorZone(3.0, 8.6, -8, -3, darkWood);                                                    // library
  floorZone(8.6, 14, -8, 0.6, gridTex('#EFE7D8', 'rgba(150,130,100,.35)', 4, '#D8C3A3'), 1.6); // pantry: checker
  floorZone(8.6, 14, 0.6, 9, warmWood);                                                     // lounge
  floorZone(-8, -3.6, -3, 0.55, gridTex('#A3ABB6', 'rgba(60,70,85,.55)', 2, null, 3), 1.2);  // server: raised tiles
  floorZone(-8, -3.6, 0.55, 5.4, gridTex('#ECE8E1', 'rgba(170,160,150,.45)', 2), 1.6);       // lobby: stone
  floorZone(-8, -3.6, 5.4, 9, gridTex('#E3EBEF', 'rgba(140,160,175,.6)', 8), 1.2);          // restrooms: mosaic
  const carpet = gridTex('#9AA2AE', 'rgba(70,78,92,.35)', 4, '#929AA7', 2);                // carpet tiles under each pod
  for (const [cx, cz] of PODS) { const c = floorZone(cx - 2.0, cx + 2.0, cz - 1.75, cz + 1.75, carpet, 1.2); c.position.y = 0.006; }
  rug(-5.4, -5.3, 3.6, 2.9, '#B9A486');                                                     // director
  rug(5.75, -5.4, 3.4, 2.4, '#9E4A3F');                                                     // library
  rug(11.0, 2.55, 3.8, 3.1, '#D8C6A8');                                                     // lounge (TV to sofa)

  /* wall finishes, room by room */
  backPanel(-8, -2.6, '#6F5440', 0, 2.75); put(scene, rbox(5.4, 0.06, 0.06, '#4E3A2C', 0.02), -5.3, 2.78, -7.96);
  leftPanel(-8, -3, '#6F5440', 0, 2.75);
  backPanel(-2.6, 3.0, '#DCE2E8');
  backPanel(3.0, 8.6, '#C9D5B2', 0, 2.75);
  backPanel(8.6, 14, '#F4E6CF');
  { // backsplash: subway tiles on one plane a little in front of the paint (stacked panels flickered when zooming)
    const tiles = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#D9D4CA'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = -1; c < 18; c++) { g.fillStyle = r % 2 ? '#FBFAF6' : '#F7F5F0'; g.fillRect(c * 57 + (r % 2) * 28 + 2, r * 32 + 2, 53, 28); }
    });
    put(scene, new THREE.Mesh(new THREE.PlaneGeometry(5.36, 0.64), toonMat({ map: tiles, roughness: 0.35 })), 11.3, 1.3, -7.955); }
  leftPanel(-3, 1.2, '#38404C');
  { const a = STAIR.z - STAIR.w / 2 - 0.05, b = STAIR.z + STAIR.w / 2 + 0.05;   // (the lobby's green, round the stairs' door)
    leftPanel(1.2, a, '#2F4A3D'); leftPanel(a, b, '#2F4A3D', STAIR.h + 0.06); if (b < 5.38) leftPanel(b, 5.4, '#2F4A3D'); }
  leftPanel(5.4, 9, '#DDE8EE', 0, 2.0);

  /* windows (all show the backdrop) */
  wallWindow(-5.3, 2.05, -7.98, 2.6, 1.5);
  wallWindow(-7.98, 2.05, -5.9, 1.6, 1.5, Math.PI / 2, 2);
  wallWindow(7.7, 2.1, -7.98, 1.3, 1.7, 0, 2);
  wallWindow(12.55, 2.35, -7.98, 0.95, 1.0, 0, 2);
  wallWindow(-7.98, 2.6, 7.4, 1.4, 0.7, Math.PI / 2, 2);

  /* partitions: glass round the director, the meeting room and the server room, half walls elsewhere */
  glassWall(-8, -3, -2.6, -3, [[4.5, 5.3]]);          // director | server + its door
  glassWall(-2.6, -8, -2.6, -3);                      // director | meeting
  glassWall(-2.6, -3, 3.0, -3, [[4.5, 5.4]]);         // meeting front + door
  glassWall(3.0, -8, 3.0, -3);                        // meeting | library
  lowWall(3.0, -3, 8.6, -3, [[0.3, 1.3]]);            // library front + door
  lowWall(8.6, -8, 8.6, -3);                          // library | pantry
  glassWall(-3.6, -3, -3.6, 0.55, [[1.0, 1.9]]);      // server | dev floor + its door (the IT way in, from the work floor)
  glassWall(-8, 0.55, -3.6, 0.55);                    // server | lobby (set back to give the reception and the altar room)
  const tileWallM = mat('#DDE8EE', { roughness: 0.9 });
  lowWall(-8, 5.4, -3.6, 5.4, [[2.6, 3.6]], 1.3, tileWallM);   // lobby | restrooms + door
  lowWall(-3.6, 5.4, -3.6, 9, [], 1.3, tileWallM);             // restrooms | dev floor (the board hangs here)
  lowWall(-3.6, 0.6, -3.6, 5.33, [[2.1, 3.3]]);                 // lobby | dev floor, glass doors
  lowWall(8.6, -1.6, 8.6, 9, [[5.8, 8.0]]);                    // pantry and lounge | dev floor + the lounge's opening
  lowWall(8.6, 0.6, 14, 0.6, [[0.3, 1.3]]);                    // pantry | lounge + door
  // the office's glass double doors from the lobby, standing open
  for (const [z, s] of [[2.7, 1], [3.9, -1]]) {
    const leaf = new THREE.Group(); leaf.position.set(-3.6, 0, z); leaf.rotation.y = s * 1.1; scene.add(leaf);
    put(leaf, new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.1, 0.58), new THREE.MeshStandardMaterial({ color: '#BFD8EE', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false })), 0, 1.07, s * 0.3);
    for (const dz of [0.02, 0.58]) put(leaf, rbox(0.05, 2.12, 0.04, metal, 0.01), 0, 1.06, s * dz);
    put(leaf, rbox(0.05, 0.05, 0.6, metal, 0.01), 0, 2.1, s * 0.3); put(leaf, rbox(0.05, 0.05, 0.6, metal, 0.01), 0, 0.03, s * 0.3);
    put(leaf, cyl(0.015, 0.015, 0.5, metal, 8), 0.05, 1.05, s * 0.5);
  }
  for (const z of [2.66, 3.94]) put(scene, rbox(0.09, 2.2, 0.08, metal, 0.01), -3.6, 1.1, z);   // the door frame
  put(scene, rbox(0.09, 0.09, 1.36, metal, 0.01), -3.6, 2.17, 3.3);
  // door plaques on the glass, readable from the corridor
  const plaque = (x, y, z, text, sub) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2), new THREE.MeshBasicMaterial({ map: plateTex(text, sub), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(x, y, z); scene.add(m); PRO_FX.plaques.push(m); return m; };
  plaque(-3.88, 1.62, -2.96, tr('world.plaque.director'), tr('world.plaque.directorSub'));
  plaque(1.55, 1.62, -2.96, tr('world.plaque.meeting'), tr('world.plaque.meetingSub'));
  plaque(4.66, 0.8, -2.912, tr('world.plaque.library'), tr('world.plaque.librarySub'));   // a little in front of the wall's face (-2.93), never on it

  /* director's office: credenza and window, the desk, a leather chair, two visitor chairs, a sofa corner */
  put(scene, rbox(3.3, 0.74, 0.5, mat('#5A4232', { roughness: 0.6 }), 0.03), -5.3, 0.37, -7.7);
  for (const x of [-6.4, -5.3, -4.2]) put(scene, rbox(1.0, 0.56, 0.02, mat('#6B4F3C', { roughness: 0.6 }), 0.02), x, 0.4, -7.44);
  trinket('books', -6.4, 0.74, -7.7, 0.2); trinket('frame', -5.85, 0.74, -7.68, 0.1);
  potPlant(-4.0, -7.7, 0.32, 'snake', 0.74);
  const dk = new THREE.Group(); dk.position.set(-5.4, 0, -5.8); scene.add(dk); PRO_FX.execDesk = dk;
  const walnut = mat('#4A3628', { roughness: 0.5 });
  put(dk, rbox(2.1, 0.06, 0.95, walnut, 0.02), 0, 0.76, 0);
  for (const sx of [-1, 1]) put(dk, rbox(0.46, 0.73, 0.86, walnut, 0.02), sx * 0.79, 0.365, 0);
  put(dk, rbox(1.2, 0.5, 0.04, walnut, 0.01), 0, 0.48, 0.4);
  put(dk, rbox(0.06, 0.32, 0.06, metal, 0.01), 0, 0.95, 0.14);
  put(dk, rbox(0.7, 0.42, 0.04, mat('#1B1F26', { roughness: 0.4 }), 0.02), 0, 1.22, 0.16);
  const dscr = toonMat({ color: '#0E1A2B', emissive: '#8FD0FF', emissiveIntensity: 0.6, roughness: 0.3 }); PRO_FX.dirScreen = dscr;
  put(dk, new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), dscr), 0, 1.22, 0.135).rotation.y = Math.PI;
  put(dk, rbox(0.46, 0.02, 0.15, '#2B2F36', 0.005), 0, 0.8, -0.18);
  put(dk, rbox(0.3, 0.012, 0.22, '#FBFBF7', 0.004), -0.55, 0.796, -0.1).rotation.y = 0.3;
  put(dk, cyl(0.045, 0.04, 0.1, '#2B2F36'), 0.62, 0.84, 0.1);
  { const lamp = new THREE.Group(); lamp.position.set(-0.82, 0.79, 0.12); dk.add(lamp);   // banker's lamp
    put(lamp, cyl(0.07, 0.08, 0.03, '#C9A227'), 0, 0.015, 0); put(lamp, cyl(0.012, 0.012, 0.3, '#C9A227'), 0, 0.17, 0);
    put(lamp, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.09, 16, 1, true), mat('#2F6B45', { side: THREE.DoubleSide })), 0, 0.33, 0); }
  { const np = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshBasicMaterial({ map: plateTex(tr('world.nameplate'), null, { bg: '#2B2F36', fg: '#E2B04A', size: 64 }) }));
    np.position.set(0.5, 0.84, 0.46); np.rotation.x = -0.35; dk.add(np); put(dk, rbox(0.44, 0.1, 0.05, '#2B2F36', 0.01), 0.5, 0.83, 0.43).rotation.x = -0.35; }
  const leather = mat('#22262C', { roughness: 0.45 });
  const exec = officeChair(scene, -5.4, -6.75, leather); exec.userData.back.scale.set(1.15, 1.45, 1.2); PRO_FX.execChair = exec;
  chairUph(-5.95, -4.95, Math.PI, '#8C6A4E', 0.95); chairUph(-4.85, -4.95, Math.PI, '#8C6A4E', 0.95);
  makeSofa(-7.45, -4.1, 1.7, Math.PI / 2, '#7A5C48', ['#E2B04A', '#C8553D']);
  put(scene, rbox(0.62, 0.05, 1.0, walnut, 0.02), -6.55, 0.42, -4.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(scene, cyl(0.02, 0.02, 0.4, metal, 6), -6.55 + sx * 0.25, 0.2, -4.1 + sz * 0.42);

  /* meeting room: a screen with today's slide */
  { const slide = canvasTex(640, 360, (g, w, h) => {
      g.fillStyle = '#F7F5F0'; g.fillRect(0, 0, w, h); g.fillStyle = '#D97757'; g.fillRect(0, 0, 14, h);
      g.fillStyle = '#1E232B'; g.font = '800 40px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('Sprint review', 44, 70);
      g.fillStyle = '#7A8494'; g.font = '600 22px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.slideSub'), 44, 104);
      const bars = [0.42, 0.58, 0.51, 0.74, 0.66, 0.88]; bars.forEach((v, i) => { g.fillStyle = i === 5 ? '#D97757' : '#3F7CC4'; g.fillRect(60 + i * 88, 320 - v * 180, 52, v * 180); });
      g.fillStyle = '#C9CED6'; g.fillRect(44, 322, w - 88, 3);
    });
    put(scene, rbox(2.7, 1.55, 0.07, '#15181E', 0.03), 0.2, 1.75, -7.95);
    put(scene, new THREE.Mesh(new THREE.PlaneGeometry(2.56, 1.42), new THREE.MeshBasicMaterial({ map: slide })), 0.2, 1.75, -7.91); }

  /* library: reading chairs facing the room, a shelf and a ladder */
  armchair(5.6, -4.1, 0, '#7A4E3A'); armchair(6.9, -4.1, 0, '#3D5A80');
  put(scene, cyl(0.22, 0.22, 0.04, woodDark, 20), 6.25, 0.52, -4.15); put(scene, cyl(0.03, 0.03, 0.5, woodDark, 8), 6.25, 0.26, -4.15);
  trinket('books', 6.25, 0.54, -4.15, 0.4);
  { const lad = new THREE.Group(); lad.position.set(6.55, 0, -6.88); lad.rotation.x = -0.18; scene.add(lad);
    for (const sx of [-1, 1]) put(lad, rbox(0.05, 2.5, 0.05, woodMid, 0.01), sx * 0.22, 1.25, 0);
    for (let i = 0; i < 7; i++) put(lad, rbox(0.44, 0.04, 0.05, woodMid, 0.01), 0, 0.3 + i * 0.32, 0); }

  /* pantry: the rest of the kitchen (sink, fridge, wall cupboards), a water cooler and four tables */
  put(scene, rbox(0.95, 0.92, 0.75, mat('#E6E1D8', { roughness: 0.7 }), 0.04), 12.55, 0.46, -7.6);
  put(scene, rbox(1.0, 0.07, 0.84, mat('#3B3F46', { roughness: 0.35 }), 0.03), 12.55, 0.955, -7.6);
  put(scene, rbox(0.5, 0.03, 0.36, '#9AA3AD', 0.01), 12.55, 0.99, -7.55);
  { const tap = new THREE.Group(); tap.position.set(12.55, 0.99, -7.86); scene.add(tap);
    put(tap, cyl(0.02, 0.02, 0.3, metal, 8), 0, 0.15, 0); put(tap, cyl(0.016, 0.016, 0.18, metal, 8), 0, 0.3, 0.08).rotation.x = Math.PI / 2; }
  put(scene, rbox(0.86, 2.0, 0.74, mat('#D5DADF', { metalness: 0.45, roughness: 0.3 }), 0.05), 13.52, 1.0, -7.6);
  put(scene, rbox(0.86, 0.015, 0.02, '#9AA3AD', 0.003), 13.52, 1.32, -7.225);
  for (const y of [0.85, 1.65]) put(scene, rbox(0.03, 0.34, 0.04, metal, 0.01), 13.15, y, -7.2);
  put(scene, rbox(2.9, 0.72, 0.36, mat('#E6E1D8', { roughness: 0.7 }), 0.03), 10.6, 2.1, -7.8);
  for (const x of [9.65, 10.6, 11.55]) { put(scene, rbox(0.9, 0.66, 0.02, mat('#D9D2C6', { roughness: 0.7 }), 0.02), x, 2.1, -7.615); put(scene, rbox(0.14, 0.03, 0.03, metal, 0.01), x, 1.86, -7.6); }
  { const wc = new THREE.Group(); wc.position.set(8.92, 0, -6.6); scene.add(wc);   // water cooler
    put(wc, rbox(0.36, 1.0, 0.36, mat('#F1F1EE', { roughness: 0.5 }), 0.04), 0, 0.5, 0);
    put(wc, cyl(0.15, 0.15, 0.42, new THREE.MeshStandardMaterial({ color: '#7FC4F0', transparent: true, opacity: 0.65, roughness: 0.1 }), 18), 0, 1.22, 0);
    put(wc, rbox(0.06, 0.05, 0.04, '#3F7CC4', 0.01), -0.07, 0.78, 0.19); put(wc, rbox(0.06, 0.05, 0.04, '#E63946', 0.01), 0.07, 0.78, 0.19); }
  for (const [x, z] of [[10.4, -4.9], [12.8, -4.9], [10.4, -0.9], [12.8, -0.9]]) diningSet(x, z);

  /* lounge: a bean bag, a foosball table (the sofa, aquarium, arcade and rocket are shared; the pool table has the
     right side: world/props/billiards.js) */
  for (const [x, z, c] of [[9.9, 5.5, '#E8742A']]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), mat(c, { roughness: 0.95 })); b.scale.set(1.1, 0.62, 1.05); b.position.set(x, 0.26, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), mat(tint(c, 0.15), { roughness: 0.95 })); top.scale.set(1, 0.5, 1); top.position.set(x - 0.05, 0.5, z - 0.12); top.castShadow = true; scene.add(top);
  }
  { // foosball: a cabinet with walls and goals and a recessed pitch
    const fb = new THREE.Group(); fb.position.set(10.35, 0, 6.85); scene.add(fb); PRO_FX.foosball = fb;
    const body = mat('#8A5A3C', { roughness: 0.55 }), rim = mat('#4A3426', { roughness: 0.5 });
    const L = 1.2, W = 0.7, top = 0.92;
    put(fb, rbox(L, 0.2, W, body, 0.03), 0, top - 0.1, 0);                                     // the box
    put(fb, rbox(L - 0.08, 0.02, W - 0.08, mat('#3F8F4A', { roughness: 0.85 }), 0.004), 0, top - 0.08, 0);   // pitch
    put(fb, rbox(L - 0.1, 0.004, 0.012, '#EDEDE6', 0.001), 0, top - 0.068, 0).rotation.y = Math.PI / 2;     // centre line
    for (const sz of [-1, 1]) put(fb, rbox(L, 0.12, 0.05, rim, 0.01), 0, top + 0.03, sz * (W / 2 - 0.025));   // long walls
    for (const sx of [-1, 1]) { put(fb, rbox(0.05, 0.12, W, rim, 0.01), sx * (L / 2 - 0.025), top + 0.03, 0); put(fb, rbox(0.03, 0.07, 0.2, '#111317', 0.004), sx * (L / 2 - 0.05), top - 0.02, 0); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(fb, rbox(0.09, top - 0.2, 0.09, rim, 0.01), sx * (L / 2 - 0.08), (top - 0.2) / 2, sz * (W / 2 - 0.08));
    put(fb, rbox(L - 0.2, 0.05, 0.05, rim, 0.01), 0, 0.18, 0);
    // (the rods with their little players, and the ball: people/foosball.js, which plays with them)
  }

  /* server room: a precision cooler (its screen shows the Mac's CPU and the room temperature), a fire extinguisher */
  put(scene, rbox(0.7, 1.9, 0.44, mat('#E8EBEE', { roughness: 0.5 }), 0.04), -7.58, 0.95, 0.3);
  for (let i = 0; i < 6; i++) put(scene, rbox(0.02, 0.05, 0.36, '#9AA3AD', 0.005), -7.22, 1.2 + i * 0.1, 0.3);
  { put(scene, rbox(0.02, 0.24, 0.36, '#1B1F26', 0.01), -7.225, 0.72, 0.3);
    const tex = canvasTex(256, 150, () => {}), m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.19), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(-7.21, 0.72, 0.3); m.rotation.y = Math.PI / 2; m.userData.noMerge = true; scene.add(m);
    PRO_FX.cooler = { tex, shown: '' }; }
  put(scene, cyl(0.08, 0.08, 0.5, mat('#D62828', { roughness: 0.4 }), 14), -3.88, 0.25, 0.3);
  put(scene, cyl(0.03, 0.03, 0.08, '#2B2F36'), -3.88, 0.54, 0.3);

  /* lobby: the My Office sign over the entrance, a reception counter, two waiting chairs */
  { const logo = canvasTex(1024, 220, (g, w, h) => {
      g.fillStyle = '#1C2620'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(150, h / 2); g.scale(6.2, 6.2); g.translate(-12, -12); g.fillStyle = '#E8865F'; g.fill(new Path2D(OFFICE_MARK), 'evenodd'); g.restore();
      g.fillStyle = '#F6EFE4'; g.font = '800 92px "Be Vietnam Pro", system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('My Office', 260, h / 2 + 4);
    });
    const lm = new THREE.MeshBasicMaterial({ map: logo }); PRO_FX.logoM = lm;
    put(scene, rbox(0.06, 0.62, 2.7, '#1C2620', 0.02), -7.96, 3.6, DZ);
    put(scene, new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.56), lm), -7.92, 3.6, DZ).rotation.y = Math.PI / 2;
    nightHooks.push((on) => lm.color.setScalar(on ? 1.7 : 1)); }
  /* the reception: a U of walnut with a stone ledge for visitors (the My Office plaque on its front), a lower desk
     behind it where the receptionist sits (people/staff.js) with her screen, keyboard and phone, a low cabinet against
     the glass behind her. Across the lobby from the lift, which keeps an open space in front of it. Visitors stand at
     the ledge; she gets in round the open west end. */
  { const rc = new THREE.Group(); rc.position.set(-4.9, 0, 1.5); scene.add(rc);
    const walnut = mat('#7A5640', { roughness: 0.5 }), stone = mat('#F2EEE8', { roughness: 0.3 }), oak = mat('#E3DACB', { roughness: 0.55 });
    put(rc, rbox(2.1, 1.02, 0.1, walnut, 0.03), 0, 0.51, 0.48);                                     // front
    put(rc, rbox(2.12, 0.06, 0.12, '#D97757', 0.01), 0, 0.86, 0.49);                                 // the brand stripe
    for (const x of [-0.6, 0.6]) put(rc, rbox(0.02, 0.92, 0.02, '#5E412F', 0.005), x, 0.47, 0.535);  // panel grooves
    put(rc, new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.215), PRO_FX.logoM), 0, 0.58, 0.535);      // plaque
    put(rc, rbox(0.1, 1.02, 0.95, walnut, 0.03), 1.0, 0.51, 0.05);                                   // east end
    put(rc, rbox(2.22, 0.05, 0.34, stone, 0.02), 0, 1.045, 0.4);                                     // visitors' ledge
    put(rc, rbox(2.0, 0.04, 0.55, oak, 0.015), 0, 0.76, 0.12);                                       // the desk behind it
    put(rc, rbox(0.46, 0.72, 0.5, walnut, 0.02), -0.72, 0.36, 0.12);                                 // drawers
    for (let k = 0; k < 3; k++) put(rc, rbox(0.12, 0.02, 0.02, metal, 0.005), -0.72, 0.18 + k * 0.22, -0.14);
    put(rc, rbox(0.06, 0.72, 0.5, walnut, 0.02), -0.96, 0.36, 0.12);                                 // west leg
    { const scr = new THREE.Group(); scr.position.set(0.22, 0.78, 0.26); scr.rotation.y = Math.PI - 0.2; rc.add(scr);   // her screen
      put(scr, rbox(0.16, 0.012, 0.12, '#2B2F36', 0.004), 0, 0.006, 0); put(scr, cyl(0.014, 0.014, 0.16, '#2B2F36', 8), 0, 0.09, 0);
      put(scr, rbox(0.5, 0.3, 0.03, '#1B1F26', 0.01), 0, 0.3, 0.01);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), new THREE.MeshBasicMaterial({ color: '#CFE3F4' })); glow.position.set(0, 0.3, 0.027); scr.add(glow); }
    put(rc, rbox(0.38, 0.016, 0.13, '#2B2F36', 0.004), 0.0, 0.787, -0.02);                           // keyboard
    put(rc, rbox(0.07, 0.014, 0.1, '#3A3F47', 0.01), 0.27, 0.786, -0.04);                            // mouse
    { const ph = new THREE.Group(); ph.position.set(-0.5, 0.78, 0.0); ph.rotation.y = 0.3; rc.add(ph);   // desk phone
      put(ph, rbox(0.2, 0.05, 0.16, '#2B2F36', 0.02), 0, 0.025, 0); put(ph, rbox(0.2, 0.035, 0.05, '#1E2126', 0.015), 0, 0.065, -0.04); }
    trinket('frame', 0.62, 0.78, 0.25, Math.PI + 0.4, rc);
    // on the ledge: the service bell, the visitors' book, lilies in a glass vase, the desk sign
    put(rc, cyl(0.05, 0.06, 0.02, '#2B2F36'), -0.62, 1.08, 0.42); put(rc, new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#C9A227', { metalness: 0.7, roughness: 0.3 })), -0.62, 1.09, 0.42);
    { const bk = new THREE.Group(); bk.position.set(-0.1, 1.072, 0.42); bk.rotation.y = 0.15; rc.add(bk);
      for (const sx of [-1, 1]) { const p = put(bk, rbox(0.16, 0.012, 0.22, mat('#FBF8F0', { roughness: 0.9 }), 0.004), sx * 0.082, 0.006, 0); p.rotation.z = -sx * 0.06; }
      put(bk, rbox(0.006, 0.02, 0.15, '#1E2126', 0.002), 0.06, 0.016, 0).rotation.y = 0.4; }
    { const v = new THREE.Group(); v.position.set(0.78, 1.07, 0.4); rc.add(v);
      put(v, cyl(0.045, 0.035, 0.2, new THREE.MeshStandardMaterial({ color: '#CFE8F0', transparent: true, opacity: 0.55, roughness: 0.1 }), 12), 0, 0.1, 0);
      for (const [x, y, z] of [[0, 0.33, 0], [-0.06, 0.29, 0.03], [0.06, 0.3, -0.02], [0.02, 0.27, 0.07]]) {
        put(v, cyl(0.004, 0.004, y - 0.1, '#4E7A3A', 5), x * 0.5, 0.1 + (y - 0.1) / 2, z * 0.5);
        put(v, new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 6, 1, true), mat('#FFFFFF', { roughness: 0.6, side: THREE.DoubleSide })), x, y, z).rotation.x = Math.PI; }
      for (const [x, z] of [[-0.07, -0.03], [0.07, 0.04]]) put(v, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#5E8C3A', { roughness: 0.7 })), x, 0.24, z).scale.set(1, 0.4, 1.6); }
    { const tag = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1C2620'; g.fillRect(0, 0, w, h); g.fillStyle = '#F6EFE4'; g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tr('people.staff.desk'), w / 2, h / 2 + 2); });
      const sg = new THREE.Group(); sg.position.set(0.35, 1.07, 0.47); rc.add(sg);
      put(sg, rbox(0.26, 0.075, 0.035, '#1C2620', 0.008), 0, 0.04, 0).rotation.x = -0.25;
      put(sg, new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), new THREE.MeshBasicMaterial({ map: tag })), 0, 0.042, 0.02).rotation.x = -0.25; }
    officeChair(rc, 0, -0.45, mat('#2F3A48', { roughness: 0.6 })); }   // (behind her, against the glass: the altar, life/altar.js)
  potPlant(-3.95, 5.0, 0.42, 'bush');   // the corner by the glass doors (the one by the lift has the lobby's floor lamp)
  /* the waiting corner: two armchairs facing the reception, a little round table with magazines between them */
  /* (one armchair since the stairs' door came in beside the lift: the way to it passes where the other stood) */
  chairUph(-5.75, 4.88, Math.PI, '#2F4A3D');
  { const t = new THREE.Group(); t.position.set(-6.35, 0, 5.05); scene.add(t);
    put(t, cyl(0.22, 0.22, 0.03, mat('#E3DACB', { roughness: 0.4 }), 24), 0, 0.5, 0); put(t, cyl(0.03, 0.03, 0.48, metal, 8), 0, 0.25, 0); put(t, cyl(0.15, 0.15, 0.02, metal, 16), 0, 0.01, 0);
    for (const [c, r, y] of [['#D97757', 0.25, 0.525], ['#3F7CC4', -0.15, 0.537]]) put(t, rbox(0.17, 0.01, 0.23, c, 0.003), 0.03, y, -0.02).rotation.y = r;
    trinket('cactus', -0.1, 0.515, 0.08, 0, t); }

  /* restrooms: two stalls (doors open and shut), a basin and mirror, a sign */
  const tileM = mat('#F4F6F7', { roughness: 0.4 }), partM = mat('#B9C7D1', { roughness: 0.6 });
  for (const z of [5.45, 6.75, 8.05]) put(scene, rbox(1.25, 1.85, 0.05, partM, 0.01), -7.38, 0.97, z);
  for (let i = 0; i < 2; i++) {
    const z0 = 5.45 + i * 1.3, zc = z0 + 0.65;
    for (const [a, b] of [[z0, zc - 0.36], [zc + 0.36, z0 + 1.3]]) put(scene, rbox(0.05, 1.85, b - a, partM, 0.01), -6.75, 0.97, (a + b) / 2);
    put(scene, rbox(0.05, 0.08, 0.74, partM, 0.01), -6.75, 1.92, zc);
    const toilet = new THREE.Group(); toilet.position.set(-7.62, 0, zc); scene.add(toilet);
    put(toilet, cyl(0.17, 0.13, 0.4, tileM, 18), 0.12, 0.2, 0); put(toilet, rbox(0.18, 0.34, 0.36, tileM, 0.04), -0.16, 0.55, 0);
    const pivot = new THREE.Group(); pivot.position.set(-6.75, 0, zc - 0.36); scene.add(pivot);
    put(pivot, rbox(0.04, 1.62, 0.71, mat('#8FA6B6', { roughness: 0.55 }), 0.01), 0, 0.93, 0.355);
    const sign = new THREE.MeshBasicMaterial({ color: '#3DDC84' });
    put(pivot, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.12), sign), 0.03, 1.2, 0.62);
    PRO_FX.stalls.push({ pivot, sign, open: 1, z: zc });
  }
  put(scene, rbox(0.55, 0.86, 0.78, mat('#EDE9E2', { roughness: 0.5 }), 0.03), -7.72, 0.43, 8.5);
  put(scene, cyl(0.17, 0.13, 0.08, tileM, 18), -7.7, 0.88, 8.5);
  put(scene, cyl(0.015, 0.015, 0.16, metal, 8), -7.92, 0.98, 8.5);
  put(scene, new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.85), mat('#C9DCE8', { roughness: 0.05, metalness: 0.6 })), -7.965, 1.6, 8.5).rotation.y = Math.PI / 2;
  { const wcTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#1E232B'; g.fillRect(0, 0, w, h); g.fillStyle = '#F3EFE8';
      for (const [x, skirt] of [[70, false], [186, true]]) {
        g.beginPath(); g.arc(x, 30, 11, 0, Math.PI * 2); g.fill();
        if (skirt) { g.beginPath(); g.moveTo(x - 20, 92); g.lineTo(x, 46); g.lineTo(x + 20, 92); g.fill(); } else g.fillRect(x - 13, 46, 26, 46);
        g.fillRect(x - 10, 92, 7, 26); g.fillRect(x + 3, 92, 7, 26);
      }
      g.fillRect(126, 18, 4, 92);
    });
    const sm = new THREE.MeshBasicMaterial({ map: wcTex });
    for (const ry of [0, Math.PI]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), sm); m.position.set(-4.0, 1.55, 5.4 + (ry ? -0.035 : 0.035)); m.rotation.y = ry; scene.add(m); }
    put(scene, rbox(0.04, 0.42, 0.04, metal, 0.01), -4.0, 1.38, 5.4); }

  /* dev floor: each pod has a fabric screen down its middle and a low storage unit with a plant at one end */
  const felt = mat('#5F6E80', { roughness: 0.95 });
  for (const [cx, cz] of PODS) {
    put(scene, rbox(3.06, 0.42, 0.05, felt, 0.02), cx, 0.985, cz);
    put(scene, rbox(3.08, 0.025, 0.06, metal, 0.008), cx, 1.205, cz);
    put(scene, rbox(0.42, 0.62, 1.4, mat('#E4DFD6', { roughness: 0.6 }), 0.02), cx + 1.72, 0.31, cz);
    for (const z of [-0.35, 0.35]) put(scene, rbox(0.02, 0.5, 0.6, mat('#D6D0C5', { roughness: 0.6 }), 0.01), cx + 1.94, 0.31, cz + z);
    potPlant(cx + 1.72, cz + 0.32, 0.4, 'snake', 0.62); trinket('books', cx + 1.72, 0.62, cz - 0.3, 0.3);
  }
  // a phone booth for calls, felt walls, a glass door facing the pods, a stool and a light inside (the karaoke box
  // beside it: world/props/karaoke.js)
  for (const z of [6.0]) {
    const b = new THREE.Group(); b.position.set(-0.75, 0, z); scene.add(b);
    const fm = mat('#7E9A82', { roughness: 0.95 }), fr = mat('#2B2F36', { roughness: 0.5 });
    put(b, rbox(1.0, 0.08, 1.15, fr, 0.02), 0, 0.04, 0); put(b, rbox(1.0, 0.1, 1.15, fr, 0.02), 0, 2.2, 0);
    put(b, rbox(0.06, 2.12, 1.15, fm, 0.02), -0.47, 1.1, 0);
    for (const sz of [-1, 1]) put(b, rbox(1.0, 2.12, 0.06, fm, 0.02), 0, 1.1, sz * 0.545);
    put(b, new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.0, 1.02), new THREE.MeshStandardMaterial({ color: '#CFE3F2', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.3, depthWrite: false })), 0.48, 1.12, 0);
    for (const sz of [-1, 1]) put(b, rbox(0.06, 2.12, 0.06, fr, 0.01), 0.48, 1.1, sz * 0.52);
    put(b, cyl(0.016, 0.016, 0.42, metal, 6), 0.5, 1.1, 0.4);
    put(b, rbox(0.42, 0.04, 0.36, mat('#B88A5E'), 0.01), -0.22, 0.98, 0);   // a little shelf
    put(b, cyl(0.17, 0.15, 0.45, mat('#E8742A', { roughness: 0.9 }), 16), 0.05, 0.225, 0);   // stool
    const lm = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone() }); lampBulbs.push(lm);
    put(b, rbox(0.5, 0.03, 0.5, lm, 0.01), 0, 2.13, 0);
  }
  // filing cabinet and a copier station by the server-room glass
  { const fc = new THREE.Group(); fc.position.set(-3.15, 0, -0.35); scene.add(fc);
    put(fc, rbox(0.46, 1.3, 0.6, mat('#B9BEC5', { metalness: 0.35, roughness: 0.45 }), 0.02), 0, 0.65, 0);
    for (let k = 0; k < 4; k++) { put(fc, rbox(0.42, 0.005, 0.02, '#8E949C', 0.002), 0, 0.33 + k * 0.31, 0.305); put(fc, rbox(0.14, 0.025, 0.03, metal, 0.008), 0, 0.22 + k * 0.31, 0.31); } }
  // posters: the company's habits in the lobby, a team photo in the pantry
  { const poster = (x, y, z, ry, w, h, draw) => {
      const tex = canvasTex(256, Math.round((256 * h) / w), draw);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
      put(g, rbox(w + 0.08, h + 0.08, 0.04, '#2B2F36', 0.01), 0, 0, 0);
      put(g, new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex, roughness: 0.9 })), 0, 0, 0.022);
    };
    poster(-7.47, 1.75, 4.42, 0, 0.66, 0.9, (g, w, h) => {   // (on the lift's side, by the stairs' door)
      g.fillStyle = '#F6EFE4'; g.fillRect(0, 0, w, h); g.fillStyle = '#D97757'; g.fillRect(0, 0, w, 10);
      g.fillStyle = '#1E232B'; g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center';
      ['SHIP', 'SMALL,', 'SHIP', 'OFTEN'].forEach((t, i) => g.fillText(t, w / 2, 90 + i * 52));
      g.fillStyle = '#7A8494'; g.font = '600 15px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('My Office', w / 2, h - 22);
    });
    poster(9.6, 2.98, -7.96, 0, 0.8, 0.58, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9CC9E8'); sky.addColorStop(1, '#F3E3C2'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6A8042'; g.fillRect(0, h * 0.7, w, h * 0.3);
      for (let i = 0; i < 7; i++) { const x = 22 + i * 34, c = ['#6A8042', '#E8742A', '#3F7CC4', '#8C4FA8', '#D64550', '#2A9D8F', '#C9A227'][i]; g.fillStyle = c; g.fillRect(x - 9, h * 0.52, 18, 30); g.fillStyle = '#F2D3B3'; g.beginPath(); g.arc(x, h * 0.46, 10, 0, 7); g.fill(); }
      g.fillStyle = '#FFFFFF'; g.font = '700 14px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('Team outing 2026', 12, 20);
    }); }

  /* dev floor: a water cooler by the corridor */
  { const wc = new THREE.Group(); wc.position.set(7.95, 0, -1.95); scene.add(wc);
    put(wc, rbox(0.36, 1.0, 0.36, mat('#F1F1EE', { roughness: 0.5 }), 0.04), 0, 0.5, 0);
    put(wc, cyl(0.15, 0.15, 0.42, new THREE.MeshStandardMaterial({ color: '#7FC4F0', transparent: true, opacity: 0.65, roughness: 0.1 }), 18), 0, 1.22, 0); }
}

export function setup() {
  if (PRO) buildProFloor();
}
