// Per-frame updates for the props.
import { AQ, bubbles, fishes, weeds } from './aquarium.js';
import { drawArcade } from './arcade.js';
import { PRN, paper, paperM, printQueue, prnLed } from './printer.js';
import { drawTV } from './tv.js';
import { updateCat } from './cat.js';
import { updateVac } from './vacuum.js';
import { updateBins } from './bins.js';
import { updateDevBoxes } from './dev-servers.js';
import { fishFeed } from '../../interact/props.js';

let tvAt = -1, arcAt = -1;
export function updateExtras(dt, t) {
  updateDevBoxes(t);
  for (const f of fishes) {
    const a = t * f.sp + f.ph, x = Math.sin(a) * f.ax, z = Math.cos(a * 0.7) * f.az;
    const fy = f.y0 + Math.sin(a * 1.3) * f.ay;
    f.g.position.set(AQ.x + x, fy + (1.34 - fy) * fishFeed.k * 0.9, AQ.z + z);
    f.g.rotation.y = Math.cos(a) >= 0 ? 0 : Math.PI; f.tail.rotation.y = Math.sin(t * 10 + f.ph) * 0.5;
  }
  bubbles.forEach((b, i) => { b.position.y += dt * (0.18 + (i % 3) * 0.05); b.position.x = AQ.x + 0.7 + Math.sin(t * 3 + i) * 0.015; if (b.position.y > 1.36) b.position.y = 0.8; });
  for (const w of weeds) w.w.rotation.z = Math.sin(t * 0.9 + w.ph) * 0.12;
  if (t - arcAt > 0.12) { arcAt = t; drawArcade(t); }
  if (t - tvAt > 2) { tvAt = t; drawTV(); }
  // printer: one page per finished turn
  if (printQueue.t < 0 && printQueue.n > 0) { printQueue.n--; printQueue.t = 0; paper.visible = true; paperM.opacity = 1; }
  if (printQueue.t >= 0) {
    printQueue.t += dt;
    const held = printQueue.keep && printQueue.t >= 1.4;   // a page you printed waits on the tray for whoever fetches it
    if (held) printQueue.t = 1.4;
    const k = Math.min(1, printQueue.t / 1.4);
    paper.position.set(PRN.x, 0.83 + (k > 0.85 ? (k - 0.85) * 0.6 : 0), PRN.z + 0.05 + k * 0.32);
    prnLed.color.set(held || Math.floor(t * 8) % 2 ? '#3DDC84' : '#1B5E3A');
    if (printQueue.t > 2.4) { paperM.opacity = Math.max(0, 1 - (printQueue.t - 2.4) * 2); }
    if (printQueue.t > 2.9) { printQueue.t = -1; paper.visible = false; prnLed.color.set('#3DDC84'); }
  }
  updateCat(dt, t);
  updateVac(dt, t);
  updateBins(dt, t);
}
