// The camera toolbar.
import { state } from '../core/state.js';
import { $, HQ, PRO } from '../core/env.js';
import { BASE_ZOOM, camera, controls, fpCam } from '../scene/renderer.js';
import { queueUi, toast } from './activity.js';
import { drS } from './session-drawer.js';
import { exitFp, fp } from '../interact/first-person.js';
import { focusTarget } from '../core/loop.js';
import { t as tr } from '../../i18n/index.js';

let VIEWS;
export function setView(v) { for (const b of document.querySelectorAll('.seg-btn')) b.setAttribute('aria-pressed', String(b.dataset.view === v)); }
let panBack = null;
let panTimer = 0;
export const autoCam = () => state.camAuto && !fp.on && !state.photo && !state.selectedId && performance.now() - state.lastUserCam > 30000;
export function panTo(w) {
  if (!panBack) panBack = focusTarget.clone();
  focusTarget.set(w.pos.x, 0.9, w.pos.y);
  clearTimeout(panTimer); panTimer = setTimeout(() => { if (panBack && !state.selectedId) focusTarget.copy(panBack); panBack = null; }, 7000);
}
export function goView(v) { const V = VIEWS[v]; focusTarget.set(...V.t); state.zoomGoal = V.z * BASE_ZOOM; setView(v); }

export function setup() {
  /* ---------- camera toolbar ---------- */
  VIEWS = HQ ? { home: { t: [3, 0.3, 9], z: 1 }, desks: { t: [3, 0.6, 18.2], z: 1.6 }, meeting: { t: [-1.2, 0.6, -5.4], z: 2.8 }, server: { t: [-5.6, 1.0, -0.6], z: 3.3 } }
    : PRO ? { home: { t: [3, 0.3, 0.7], z: 1 }, desks: { t: [2.3, 0.6, 3.6], z: 1.9 }, meeting: { t: [-1.2, 0.6, -5.4], z: 2.0 }, server: { t: [-5.6, 1.0, -0.6], z: 2.4 } }
    : { home: { t: [0, 0.3, 0.2], z: 1 }, desks: { t: [0, 0.6, 0.4], z: 1.75 }, meeting: { t: [5.2, 0.6, 2.4], z: 2.3 }, server: { t: [5.4, 1.0, -4.4], z: 2.2 } };
  // Camera glides to important moments (a permission request, a deploy, an incident) unless you moved it in the last
  // 30 seconds, then returns to where it was.
  state.camAuto = true;
  try { state.camAuto = localStorage.getItem('office-autocam') !== 'off'; } catch { /* storage blocked */ }
  state.lastUserCam = -1e9;
  controls.addEventListener('start', () => { state.lastUserCam = performance.now(); panBack = null; clearTimeout(panTimer); });
  document.querySelector('.tb-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    if (fp.on) exitFp();
    if (state.selectedId) { state.selectedId = null; state.subView = null; drS.hidden = true; queueUi(); }
    goView(b.dataset.view);
  });
  $('zoom-in').addEventListener('click', () => { if (fp.on) { fpCam.fov = Math.max(40, fpCam.fov - 8); fpCam.updateProjectionMatrix(); return; } state.zoomGoal = Math.min(controls.maxZoom, (state.zoomGoal ?? camera.zoom) * 1.2); });
  $('zoom-out').addEventListener('click', () => { if (fp.on) { fpCam.fov = Math.min(90, fpCam.fov + 8); fpCam.updateProjectionMatrix(); return; } state.zoomGoal = Math.max(controls.minZoom, (state.zoomGoal ?? camera.zoom) / 1.2); });
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => toast(tr('ui.cameraToolbar.noFullscreen')));
  });
  setInterval(() => { $('zoom-val').textContent = `${Math.round((camera.zoom / BASE_ZOOM) * 100)}%`; }, 200);
}
