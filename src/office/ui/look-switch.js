// Switching the character look.
import { state } from '../core/state.js';
import { scene } from '../scene/renderer.js';
import { leaving, npcs, subs, workers } from '../people/workers.js';
import { fp, makeAvatar } from '../interact/first-person.js';
import { disposeRig } from '../people/chibi-rig.js';

/* ---------- character look (A / B) ---------- */
export function setLook(l) {
  if (l !== 'toy' && l !== 'pixar') return;
  state.LOOK = l;
  try { localStorage.setItem('office-look', l); } catch { /* storage blocked */ }
  for (const b of document.querySelectorAll('[data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === l));
  for (const w of [...workers.values(), ...subs.values(), ...leaving, ...npcs]) w.rebuild();
  if (fp.avatar) {   // (its name tag is a page element of its own: taken off the page too)
    scene.remove(fp.avatar); fp.tag?.element?.remove(); disposeRig(fp.avatar); fp.avatar = null; makeAvatar();
  }
}

export function setup() {
  for (const b of document.querySelectorAll('[data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === state.LOOK));
}
