// The render loop and its frame budget.
import * as THREE from 'three';
import { state } from './state.js';
import { reduceMotion, replay } from './env.js';
import { HOME, SOFTWARE_GL, camera, controls, fpCam, labels, renderer, resize, scene } from '../scene/renderer.js';
import { updateExtras } from '../world/props/update.js';
import { leaving, npcs, subs, updateZs, workers } from '../people/workers.js';
import { updateTeam } from '../people/team-lines.js';
import { flights, updateFlights } from '../people/director.js';
import { updateWeather } from '../life/weather.js';
import { updateNap } from '../life/nap.js';
import { updateQuota } from '../life/quota.js';
import { updateAltar } from '../life/altar.js';
import { lite } from '../ui/lite.js';
import { particles, rocketState, updateRoom } from '../world/room-update.js';
import { updateMarkers } from '../ui/activity.js';
import { setView } from '../ui/camera-bar.js';
import { updateProps } from '../interact/props.js';
import { updateErrands } from '../people/errands.js';
import { updateGatherings } from '../people/gatherings.js';
import { updateOutings } from '../people/outings.js';
import { updateStaff } from '../people/staff.js';
import { updateTeatime } from '../people/teatime.js';
import { shadowStandIns } from '../people/chibi-rig.js';
import { updateTips } from '../ui/tips.js';
import { updatePlaces } from '../interact/place-chips.js';
import { placePlc } from '../interact/place-cards.js';
import { updateBoard } from '../ui/whiteboard.js';
import { fp, fpUpdate } from '../interact/first-person.js';
import { updateIncident } from '../life/incidents.js';
import { REPLAY_MOTION, replayTick } from '../replay/replay.js';
import { recorder } from '../replay/timeline.js';
import { clipCamera, clipFrame } from '../ui/timelapse.js';
import { THEME } from '../world/backdrops/index.js';
import { drawFrame, onQualityChange, quality, stepDown } from '../scene/quality.js';
import { toast } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

export let focusTarget;
const clock = new THREE.Clock();
// Frame budget: 60 fps while you move the camera, point or walk in first person; 40 while people walk about; 30 when
// the office is calm; 10 when the window sits in the background (a hidden tab pauses on its own). Shadows only change
// when something moves, so the shadow map is redrawn every other frame unless someone is walking.
let lastFrame = 0, lastInput = 0, frameNo = 0;
const _camDelta = new THREE.Vector3();
const walkingNow = () => { for (const w of workers.values()) if (w.phase === 'walk') return true; for (const w of subs.values()) if (w.phase === 'walk') return true; for (const w of npcs) if (w.phase === 'walk') return true; return leaving.size > 0 || flights.length > 0; };
function frameGap(now) {
  if (SOFTWARE_GL) return 1000 / 5;
  if (fp.on) return 0;
  if (recorder) return 1000 / 30;
  if (!document.hasFocus()) return 1000 / 10;
  if (now - lastInput < 1500 || state.zoomGoal !== null || focusTarget.distanceToSquared(controls.target) > 1e-4) return 1000 / 60;
  return walkingNow() || particles.length || rocketState.t >= 0 || (replay.on && replay.playing) ? 1000 / 60 : 1000 / 40;
}
let PR_STEPS;
let prIdx = 0, prSlow = 0, prFast = 0, prHoldUntil = 0;
function adaptResolution(gap, target, dt) {
  if (target > 1000 / 55 || !PR_STEPS.length) { prSlow = prFast = 0; return; }   // only judged while aiming for 60
  if (gap > target * 1.3) { prSlow += dt; prFast = 0; } else if (gap < target * 1.1) { prFast += dt; prSlow = Math.max(0, prSlow - dt); }
  let next = prIdx;
  if (prSlow > 1.2 && prIdx < PR_STEPS.length - 1) { next = prIdx + 1; prHoldUntil = performance.now() + 60e3; }
  else if (prFast > 15 && prIdx > 0 && performance.now() > prHoldUntil) next = prIdx - 1;
  // already at the softest step and still late: Auto drops the graphics a level (shadows, anti-aliasing, effects)
  else if (prSlow > 4 && prIdx === PR_STEPS.length - 1) { prSlow = 0; if (stepDown()) toast(tr('settings.qDropped', { level: tr(`settings.q.${quality.level}`) }), 6000); return; }
  if (next === prIdx) return;
  prIdx = next; prSlow = prFast = 0;
  renderer.setPixelRatio(PR_STEPS[prIdx]); resize();
}
/* An orthographic picture does not change with the camera's distance, but at a low angle (photo mode) its bottom edge
   starts under the ground and shows the empty sky. So the camera backs off along its line of sight until that edge
   clears the ground, and the fog moves back with it; it comes forward again as the view rises. */
const _off = new THREE.Vector3();
let baseR = 0, backed = false;
function holdAboveGround() {
  _off.subVectors(camera.position, controls.target);
  const r = _off.length(); if (!r) return;
  if (!backed) baseR = r;
  const cos = _off.y / r, sin = Math.sqrt(Math.max(0, 1 - cos * cos)), half = camera.top / camera.zoom;
  const need = cos > 0.01 ? (half * sin - (controls.target.y + 0.6) + 1.2) / cos : 400;
  const want = Math.min(400, Math.max(baseR, need));
  backed = want > baseR + 0.01;
  if (Math.abs(want - r) > 0.01) camera.position.copy(controls.target).addScaledVector(_off, want / r);
  const extra = want - baseR, f = scene.fog;
  if (f && (f.extra || 0) !== extra) {
    const [n, fa] = f.base || [f.near, f.far];
    f.base = [n, fa]; f.extra = extra; f.near = n + extra; f.far = fa + extra;
  }
  const far = Math.max(200, want + 230);
  if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
}
export function loop(now = 0) {
  requestAnimationFrame(loop);
  const g = frameGap(now), gap = lite ? 1000 : quality.fps < 60 ? Math.max(g, 1000 / quality.fps) : g;   // list mode: the office keeps its state, barely draws
  if (now - lastFrame < gap - 2) return;
  if (lastFrame && !fp.on && !state.clip) adaptResolution(now - lastFrame, gap, Math.min(0.1, (now - lastFrame) / 1000));
  lastFrame = now; frameNo++;
  // the shadow map is redrawn every other frame while someone walks (30 a second at 60 fps), every fourth otherwise:
  // furniture never moves, and the shadow pass costs as many draw calls again as the picture
  if (frameNo % (fp.on || walkingNow() ? 2 : 4) === 0) renderer.shadowMap.needsUpdate = true;
  const dt0 = Math.min(clock.getDelta(), 0.1) * (reduceMotion ? 0.7 : 1);
  replayTick();
  const dt = dt0 * (replay.on && replay.playing ? REPLAY_MOTION : 1) * (state.speed || 1);   // (state.speed: a timelapse clip)
  state.sim += dt;
  for (const w of workers.values()) w.update(dt, state.sim);
  for (const w of subs.values()) w.update(dt, state.sim);
  for (const w of leaving) { w.update(dt, state.sim); if (!w.root.parent) leaving.delete(w); }
  for (const w of npcs) w.update(dt, state.sim);
  updateFlights(dt);
  updateRoom(dt, state.sim);
  updateExtras(dt, state.sim);
  updateProps(dt, state.sim);
  updateErrands(dt);
  updateGatherings(dt, state.sim);
  updateOutings();
  updateStaff(dt);
  updateTeatime();
  updateBoard(state.sim);
  updatePlaces(now);
  updateTeam();
  updateWeather(dt0);
  updateNap(dt0);
  updateQuota(dt0);
  updateAltar(dt0);
  updateIncident(state.sim);
  if (THEME.live) THEME.live.update(dt, state.sim);
  updateZs(dt);
  updateMarkers(state.sim);
  updateTips();
  if (fp.on) {
    fpUpdate(dt0);
    drawFrame(fpCam);
    labels.render(scene, fpCam); placePlc();
    return;
  }
  const sel = state.selectedId && workers.get(state.selectedId);
  if (sel) focusTarget.set(sel.pos.x, 0.9, sel.pos.y);
  const delta = _camDelta.copy(focusTarget).sub(controls.target).multiplyScalar(Math.min(1, dt0 * 4));
  controls.target.add(delta); camera.position.add(delta);
  if (state.zoomGoal !== null) { camera.zoom += (state.zoomGoal - camera.zoom) * Math.min(1, dt0 * 4); camera.updateProjectionMatrix(); if (Math.abs(state.zoomGoal - camera.zoom) < 0.005) state.zoomGoal = null; }
  controls.update();
  holdAboveGround();
  clipCamera();
  drawFrame(camera);
  clipFrame();
  labels.render(scene, camera);
  placePlc();
}

export function setup() {
  /* ---------- render loop ---------- */
  focusTarget = HOME.clone();
  state.zoomGoal = null;
  controls.addEventListener('start', () => { state.zoomGoal = null; setView(null); });
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
  renderer.shadowMap.autoUpdate = false;
  shadowStandIns(renderer);   // (characters' shadows from low-poly stand-ins: people/chibi-rig.js)
   renderer.shadowMap.needsUpdate = true;
  // Dynamic resolution: on a Retina screen the GPU draws four times the pixels. When frames keep arriving late while the
  // office aims for 60 a second, the 3D is drawn a step softer (2 → 1.75 → 1.5 → 1.25 → 1; labels stay sharp, they are
  // HTML); after a long stretch with room to spare it steps back up, and not again soon after having had to step down.
  // The graphics level caps the steps (Low: 1×, Medium: 1.5×); a level change starts again from its sharpest step.
  onQualityChange((q) => {
    PR_STEPS = [2, 1.75, 1.5, 1.25, 1].filter((x) => x <= Math.min(window.devicePixelRatio || 1, 2, q.prMax));
    prIdx = 0; prSlow = prFast = 0;
    renderer.setPixelRatio(PR_STEPS[0] ?? q.prMax); resize();
  });
}
