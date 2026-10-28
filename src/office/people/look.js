// Which character look (A / B) this viewer chose.
import { state } from '../core/state.js';

export function setup() {
  /* ---------- chibi ---------- */
  // Characters come from /assets/chibi.js (two looks on one rig). The look is each viewer's own choice.
  state.LOOK = 'pixar';
  try { state.LOOK = localStorage.getItem('office-look') === 'toy' ? 'toy' : 'pixar'; } catch { /* storage blocked */ }
}
