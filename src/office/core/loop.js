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
import { updateTests } from '../life/tests.js';
import { updatePost } from '../life/post.js';
import { lite } from '../ui/lite.js';
import { particles, rocketState, updateRoom } from '../world/room-update.js';
import { updateMarkers } from '../ui/activity.js';
import { setView } from '../ui/camera-bar.js';
import { updateProps } from '../interact/props.js';
import { updateErrands } from '../people/errands.js';
import { updateGatherings } from '../people/gatherings.js';
import { updateOutings } from '../people/outings.js';
import { updateMicro } from '../people/comnha.js';
import { updateStaff } from '../people/staff.js';
import { updateDuty } from '../people/duty.js';
import { updateDrill } from '../life/drill.js';
import { updateDaySwaps } from '../life/day-swaps.js';
import { updateTeatime } from '../people/teatime.js';
import { updateAccountant } from '../people/accountant.js';
import { updateRounds } from '../people/rounds.js';
import { updateGuard } from '../people/guard.js';
import { updateHr } from '../people/hr.js';
import { updateFoosball } from '../people/foosball.js';
import { updateGaming } from '../people/gaming.js';
import { updateBilliards } from '../people/billiards.js';
import { updateKaraoke } from '../people/karaoke.js';
import { updateFarewell } from '../people/farewell.js';
import { updateInterns } from '../people/interns.js';
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
import { drawFrame, onQualityChange, phoneLike, quality, stepDown } from '../scene/quality.js';
import { toast } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

export let focusTarget;
const clock = new THREE.Clock();
// Frame budget. The office is a thing you leave open, so it runs smooth while you use it and light the rest of the
// time: 60 fps while you move the camera, point, type or walk in first person (never more, even on a 120 Hz screen); 30
// while something moves on its own (people walking, a rocket, a replay, a clip being recorded); 20 when the office is
// calm (a phone: 20 and 12); 8 when the window sits in the background (a hidden tab pauses on its own). Someone on the
// staff is nearly always walking somewhere, so "something moves" is the usual case: 30 instead of 60 halves what an open
// office costs. Shadows only change when something moves: the shadow map is redrawn every other frame while someone
// walks, else every fourth.
let lastFrame = 0, lastInput = 0, frameNo = 0;
const _camDelta = new THREE.Vector3();
const walkingNow = () => { for (const w of workers.values()) if (w.phase === 'walk') return true; for (const w of subs.values()) if (w.phase === 'walk') return true; for (const w of npcs) if (w.phase === 'walk') return true; return leaving.size > 0 || flights.length > 0; };
function frameGap(now) {
  if (SOFTWARE_GL) return 1000 / 5;
  if (state.covered) return 1000 / 2;   // (a phone's full-screen sheet over it, the chat say: nobody sees the office, its CPU goes to the sheet)
  if (fp.on) return 1000 / 60;
  if (recorder || state.clip) return 1000 / 30;
  if (!document.hasFocus()) return 1000 / 8;
  if (now - lastInput < 1500 || state.zoomGoal !== null || focusTarget.distanceToSquared(controls.target) > 1e-4) return 1000 / 60;
  const moving = walkingNow() || particles.length || rocketState.t >= 0 || (replay.on && replay.playing);
  if (phoneLike()) return moving ? 1000 / 20 : 1000 / 12;   // a phone: its battery and its CPU first (a glance at the office, not a game)
  return moving ? 1000 / 30 : 1000 / 20;
}
/* World matrices, once a frame, for what is drawn. Left to three, the whole scene is updated twice a frame (the 3D pass
   and the label pass each do it), hidden things included: ~3,600 objects, a tenth of the frame's script time. Here a
   hidden branch is skipped (nothing in it is drawn or casts a shadow; it is brought up to date the frame it shows
   again, the root being updated every frame), except the labels in it, whose pass looks at them anyway. */
function updateWorld(o, force) {
  if (!o.visible) { labelsIn(o); return; }
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.parent === null) o.matrixWorld.copy(o.matrix); else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
    o.matrixWorldNeedsUpdate = false; force = true;
  }
  const ch = o.children;
  for (let i = 0; i < ch.length; i++) if (ch[i].matrixWorldAutoUpdate === true || force === true) updateWorld(ch[i], force);
}
function labelsIn(o) { const ch = o.children; for (let i = 0; i < ch.length; i++) { if (ch[i].isCSS2DObject) ch[i].updateWorldMatrix(true, false); if (ch[i].children.length) labelsIn(ch[i]); } }
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
// ?debug: where a frame's time goes (ms summed since the page opened; frameMs in window.__office divides by frames)
let PERF = false, tLast = 0;
const T = { people: 0, life: 0, street: 0, world: 0, draw: 0, labels: 0 };
const lap = (k) => { const t = performance.now(); T[k] += t - tLast; tLast = t; };
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
  if (PERF) tLast = performance.now();
  for (const w of workers.values()) w.update(dt, state.sim);
  for (const w of subs.values()) w.update(dt, state.sim);
  for (const w of leaving) { w.update(dt, state.sim); if (!w.root.parent) leaving.delete(w); }
  for (const w of npcs) w.update(dt, state.sim);
  if (PERF) lap('people');
  updateFlights(dt);
  updateRoom(dt, state.sim);
  updateExtras(dt, state.sim);
  updateProps(dt, state.sim);
  updateErrands(dt);
  updateGatherings(dt, state.sim);
  updateOutings();
  updateMicro(dt);
  updateStaff(dt);
  updateDuty();
  updateDrill();
  updateDaySwaps();
  updateTeatime();
  updateAccountant();
  updateRounds();
  updateGuard(dt);
  updateHr();
  updateFoosball(dt);
  updateGaming(dt);
  updateBilliards(dt);
  updateKaraoke(dt);
  updateFarewell();
  updateInterns();
  updateBoard(state.sim);
  updatePlaces(now);
  updateTeam();
  updateWeather(dt0);
  updateNap(dt0);
  updateQuota(dt0);
  updateAltar(dt0);
  updateTests(state.sim);
  updatePost(dt);
  updateIncident(state.sim);
  if (PERF) lap('life');
  if (THEME.live) THEME.live.update(dt, state.sim);
  if (PERF) lap('street');
  updateZs(dt);
  updateMarkers(state.sim);
  updateTips();
  if (fp.on) {
    fpUpdate(dt0);
    updateWorld(scene, false); if (PERF) lap('world');
    drawFrame(fpCam); if (PERF) lap('draw');
    labels.render(scene, fpCam); placePlc(); if (PERF) lap('labels');
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
  updateWorld(scene, false); if (PERF) lap('world');
  drawFrame(camera); if (PERF) lap('draw');
  clipFrame();
  labels.render(scene, camera);
  placePlc(); if (PERF) lap('labels');
}

export function setup() {
  /* ---------- render loop ---------- */
  focusTarget = HOME.clone();
  state.zoomGoal = null;
  controls.addEventListener('start', () => { state.zoomGoal = null; setView(null); });
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
  renderer.shadowMap.autoUpdate = false;
  scene.matrixWorldAutoUpdate = false;   // (updateWorld above does it, once a frame)
  // the tests' and the performance checks' hooks (?debug): frames drawn so far, the renderer (its info: draw calls…)
  PERF = new URLSearchParams(location.search).has('debug');
  if (PERF) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } Object.defineProperties(window.__office, { frames: { get: () => frameNo }, renderer: { get: () => renderer }, frameTimes: { get: () => ({ ...T, frames: frameNo }) } }); }, 0);
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
