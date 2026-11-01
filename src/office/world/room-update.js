// Room lights, particles, the rocket, the clock and day / night.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, PRO, officeNow, rand, reduceMotion } from '../core/env.js';
import { icon } from '../ui/icons.js';
import { bloom, envDay, envNight, renderer, scene } from '../scene/renderer.js';
import { ROOM_LAMPS, hemi, lamps, sun } from '../scene/lights.js';
import { lampBulbs } from '../scene/blocks.js';
import { BULB_OFF, BULB_ON, bollards, skyDay, skyNight } from './terrace.js';
import { glassM } from './windows.js';
import { globe, hourHand, minHand, secHand } from './furniture/room-pieces.js';
import { fans, leds, syncLeds } from './furniture/server-racks.js';
import { ROCKET_HOME, rocket } from './furniture/rocket.js';
import { DZ, doorPivot, lift, updateLift } from './entrance.js';
import { blanketFor } from '../people/bedding.js';
import { screenKind, updateScreen } from './screens.js';
import { syncMess, DESKS, screens, syncKit } from './desks.js';
import { coffeeLed } from './furniture/coffee.js';
import { nightHooks } from './props/trinkets.js';
import { PRO_FX } from './pro/pieces.js';
import { STATIONS } from '../people/navigation.js';
import { updateCoffeeQueue } from '../people/breaks.js';
import { colorOf, leaving, npcs, sessions, subs, workers } from '../people/workers.js';
import { updateSeason } from '../life/rain.js';
import { updateLiftService } from '../life/lift-service.js';
import { applyWeather } from '../life/weather.js';
import { macSnap } from '../ui/mac-drawer.js';
import { doorKick } from '../interact/props.js';
import { syncTimeBtns } from '../ui/settings.js';
import { THEME, THEMES } from './backdrops/index.js';
import { t as tr, locale } from '../../i18n/index.js';

/* ---------- particles, rocket ---------- */
export const particles = [];
export const puffGeo = new THREE.SphereGeometry(0.12, 10, 8), confGeo = new THREE.PlaneGeometry(0.14, 0.09);
const CONF = ['#ED7A13', '#FFE787', '#6A8042', '#3F7CC4', '#E8A0B4', '#8C4FA8'];
function puff(p) { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#F1F1F1', transparent: true, opacity: 0.85 })); m.position.set(p.x + rand(-0.08, 0.08), p.y, p.z + rand(-0.08, 0.08)); scene.add(m); particles.push({ m, v: new THREE.Vector3(rand(-0.3, 0.3), -0.4, rand(-0.3, 0.3)), life: 1.2, max: 1.2, kind: 'puff' }); }
export function confetti(x, y, z) { for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: CONF[i % CONF.length], side: THREE.DoubleSide, transparent: true })); m.position.set(x, y, z); scene.add(m); particles.push({ m, v: new THREE.Vector3(rand(-3, 3), rand(1, 4), rand(-3, 3)), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: 3.2, max: 3.2, kind: 'conf' }); } }
export const rocketState = { t: -1, confetti: false };
export function launchRocket() { if (rocketState.t < 0) { rocketState.t = 0; rocketState.confetti = false; } }
export let night = false;
let ledMood = 'normal';
let roomCheckAt = 0;
function updateRoomLights(dt) {
  if (!ROOM_LAMPS.length) return;
  if (state.sim > roomCheckAt) {   // who is where, four times a second
    roomCheckAt = state.sim + 0.25;
    const people = [...workers.values(), ...subs.values(), ...leaving, ...npcs];
    for (const r of ROOM_LAMPS) r.busy = people.some((w) => w.root.parent && !w.away && w.pos.x > r.x0 && w.pos.x < r.x1 && w.pos.y > r.z0 && w.pos.y < r.z1);
  }
  for (const r of ROOM_LAMPS) { const goal = night && !r.off ? (r.busy ? 4.5 : r.low) : 0;   // (r.off: the switch by the door)
    r.l.intensity += (goal - r.l.intensity) * Math.min(1, dt * (goal > r.l.intensity ? 6 : 1.5)); }
}
export function updateRoom(dt, t) {
  updateRoomLights(dt);
  const all = [...workers.values()];
  const at = (anim) => all.some((w) => w.phase !== 'walk' && w.anim === anim);
  globe.rotation.y += dt * (at('globe') ? 3 : 0.15);
  state.cpuLoad += ((macSnap?.cpu?.percent ?? 20) / 100 - state.cpuLoad) * Math.min(1, dt * 0.8);
  state.fanSpin += (3 + state.cpuLoad * 30) * dt; for (const f of fans) f.rotation.y = state.fanSpin;
  const ledRate = Math.max(at('console') ? 14 : 0, 1.5 + state.cpuLoad * 12);
  if (PRO_FX.cooler) drawCooler(PRO_FX.cooler);
  for (const m of leds) if (Math.random() < (ledRate * dt) / 3) m.emissiveIntensity = m.emissiveIntensity > 0.5 ? 0.12 : 1.6;
  syncLeds();
  screens.forEach((scr, i) => {
    const s = [...sessions.values()].find((x) => x.desk === i), w = s && workers.get(s.id);
    updateBedding(DESKS[i], s, w, dt); syncKit(i); syncMess(i, w && s ? s.git?.dirty : 0);
    { const g = DESKS[i].g, hit = w && w.anim === 'slam' && w.slamUntil > t && w.station === 'desk';   // the desk jumps under the fists
      g.position.y = hit ? Math.max(0, Math.sin(t * 44)) * 0.018 : 0; g.position.x = DESKS[i].x + (hit ? Math.sin(t * 61) * 0.008 : 0); }
    const busy = !!w && w.station === 'desk' && w.phase !== 'walk' && (w.anim === 'type' || w.anim === 'tidy');
    updateScreen(i, scr, screenKind(s, w), dt, busy);
    let target = 0.04;
    if (w) target = w.anim === 'sleep' ? 0.3 : busy ? 0.85 + Math.sin(t * 30 + i) * 0.06 : 0.55;
    if (night) target *= 1.5;
    scr.emissiveIntensity += (target - scr.emissiveIntensity) * Math.min(1, dt * 8);
  });
  updateCoffeeQueue();
  updateSeason(dt, t);
  if (lift) { updateLift(dt); updateLiftService(); }   // (and the lift's servicing after a restart: life/lift-service.js)
  else {
    const busyDoor = [...all, ...subs.values(), ...leaving].some((w) => w.pos.x < -6.2 && Math.abs(w.pos.y - DZ) < 1.3);
    doorPivot.rotation.y += ((busyDoor || doorKick > t ? 1.25 : 0) - doorPivot.rotation.y) * Math.min(1, dt * 5);
  }
  coffeeLed.color.set(at('coffee') ? '#5BE37D' : '#FF6B4A');
  if (rocketState.t >= 0) {
    rocketState.t += dt; const tt = rocketState.t;
    if (tt < 0.6) rocket.position.set(ROCKET_HOME.x + Math.sin(tt * 70) * 0.025, ROCKET_HOME.y, ROCKET_HOME.z);
    else { const u = tt - 0.6; rocket.position.set(ROCKET_HOME.x, ROCKET_HOME.y + u * u * 4.5, ROCKET_HOME.z); if (!reduceMotion && Math.random() < 0.7) puff(rocket.position); }
    if (tt > 0.9 && !rocketState.confetti) { rocketState.confetti = true; if (!reduceMotion) confetti(ROCKET_HOME.x - 1.6, 4.5, ROCKET_HOME.z + 1.0); }
    if (tt > 4.2) { rocketState.t = -1; rocket.position.copy(ROCKET_HOME); rocket.scale.setScalar(0.01); }
  }
  if (rocket.scale.x < 1) rocket.scale.setScalar(Math.min(1, rocket.scale.x + dt * 1.2));
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.kind === 'steam') { p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(0.3 + (1 - p.life / p.max) * 0.7); p.m.material.opacity = (p.life / p.max) * 0.5; }
    else if (p.kind === 'puff') { p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(1 + (1 - p.life / p.max) * 1.8); p.m.material.opacity = (p.life / p.max) * 0.85; }
    else { if (p.m.position.y > 0.03) { p.v.y -= 6 * dt; p.v.multiplyScalar(1 - dt * 0.6); p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; } else p.m.position.y = 0.03; p.m.material.opacity = Math.min(1, p.life / 0.6); }
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
  }
  if (PRO) PRO_FX.stalls.forEach((st, i) => {   // a stall door shuts while someone is inside
    const spot = STATIONS.wc[i], inUse = !!spot.by && spot.by.inStall === spot;
    st.open += ((inUse ? 0 : 1) - st.open) * Math.min(1, dt * 5); st.pivot.rotation.y = st.open * 1.25;
    st.sign.color.set(inUse ? '#FF4D4D' : '#3DDC84');
  });
  const d = new Date(), sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
  secHand.rotation.z = -(sec / 60) * Math.PI * 2; minHand.rotation.z = -(min / 60) * Math.PI * 2; hourHand.rotation.z = -(hr / 12) * Math.PI * 2;
}
// the cooler's little screen: CPU load as a number and a bar, the room temperature it would read
function drawCooler(c) {
  if (state.sim < (c.at || 0)) return; c.at = state.sim + 1.5;
  const pct = Math.round(state.cpuLoad * 100), temp = (20.5 + state.cpuLoad * 6.5).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const key = `${pct}|${temp}`; if (key === c.shown) return; c.shown = key;
  const g = c.tex.image.getContext('2d'), W = 256, H = 150, hot = pct >= 80, warm = pct >= 50;
  g.fillStyle = '#0A1A24'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7FB8D6'; g.font = '600 20px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(tr('world.cooler'), 16, 30);
  g.fillStyle = hot ? '#FF6B5B' : warm ? '#FFB547' : '#5BE3A0'; g.font = '800 52px "JetBrains Mono", ui-monospace, monospace'; g.fillText(`${pct}%`, 14, 88);
  g.fillStyle = '#16303F'; g.fillRect(16, 104, W - 32, 12); g.fillStyle = hot ? '#FF6B5B' : warm ? '#FFB547' : '#5BE3A0'; g.fillRect(16, 104, (W - 32) * Math.min(1, pct / 100), 12);
  g.fillStyle = '#CFE6F2'; g.font = '600 22px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(`${temp}°C`, W - 16, 30); g.textAlign = 'left';
  c.tex.needsUpdate = true;
}
function updateBedding(d, s, w, dt) {
  const b = d.bed, napping = !!w && w.anim === 'sleep' && w.phase !== 'walk' && w.station === 'desk' && w.pose === 'sit' && !w.doze;   // (head down on the desk: no blanket)
  const back = d.chair.userData.back;
  back.rotation.x += ((napping ? -0.62 : -0.1) - back.rotation.x) * Math.min(1, dt * (napping ? 1.5 : 4));
  b.t += dt;
  if (napping && b.state !== 'on') {   // tuck in: the blanket unfolds over the lap
    b.state = 'on'; b.t = reduceMotion ? 1 : 0; b.blanket.visible = b.pillow.visible = true; b.folded.visible = false;
    if (w) b.m.color.set(blanketFor(w.cfg.shirt || colorOf(s)));
  } else if (!napping && b.state === 'on') { b.state = 'fold'; b.t = reduceMotion ? 1.4 : 0; }
  if (b.state === 'on') {
    const k = Math.min(1, b.t / 0.7), e = 1 - (1 - k) ** 3;
    b.blanket.scale.set(0.3 + 0.7 * e, 1, 0.2 + 0.8 * e); b.pillow.scale.setScalar(Math.max(0.01, e));
  } else if (b.state === 'fold') {   // wake up: fold it on the lap, set it on the desk, then put it away
    const t = b.t, ease = (k) => k * k * (3 - 2 * k), f = b.folded;
    b.pillow.scale.setScalar(Math.max(0.01, 1 - t / 0.4));
    if (t < 0.35) {
      const k = ease(t / 0.35); b.blanket.scale.set(1 - 0.6 * k, 1, 1 - 0.7 * k);
      f.visible = true; f.position.set(0, 0.72, 0.2); f.scale.setScalar(Math.max(0.01, k));
    } else if (t < 0.95) {   // onto the left corner of the desk (desk top at y 0.8, 0.66 m in front of the chair)
      b.blanket.visible = false; const k = ease((t - 0.35) / 0.6);
      f.scale.setScalar(1); f.position.set(-0.42 * k, 0.72 + 0.14 * k + 0.25 * Math.sin(k * Math.PI), 0.2 + 0.62 * k); f.rotation.y = 0.5 * k;
    } else if (t < 1.4) { f.position.set(-0.42, 0.86, 0.82); }
    else if (t < 1.75) { const k = ease((t - 1.4) / 0.35); f.position.set(-0.42, 0.86 - 0.3 * k, 0.82); f.scale.setScalar(Math.max(0.01, 1 - k)); }   // into the drawer
    else { b.state = 'off'; b.blanket.visible = b.pillow.visible = f.visible = false; b.blanket.scale.set(1, 1, 1); f.rotation.y = 0; }
  }
}
export function setLedMood(level) {
  if (level === ledMood) return; ledMood = level;
  for (const m of leds) m.emissive.set(level === 'critical' ? '#FF5A4E' : level === 'warn' ? '#FFB347' : m.userData.base);
}
export function setNight(on) {
  night = on;
  $('stage-wrap').classList.toggle('is-day', !on);
  const nb = $('btn-night'); nb.setAttribute('aria-pressed', String(on)); nb.replaceChildren(icon(on ? 'moon' : 'sun'));
  scene.environment = on ? envNight : envDay;
  hemi.intensity = on ? 0.18 : 0.25; hemi.color.set(on ? '#8FA3D9' : '#FFF4DC'); hemi.groundColor.set(on ? '#2E3654' : '#A9B98A');
  sun.intensity = on ? 0.55 : 1.35; sun.color.set(on ? '#9DB2FF' : '#FFE6C7');
  for (const l of lamps) if (!ROOM_LAMPS.some((r) => r.l === l)) l.intensity = on ? 4.5 : 0;
  glassM.map = THEME.wins[on ? 1 : 0]; glassM.color.setScalar(on ? 1.35 : 0.95);
  for (const b of lampBulbs) b.color.copy(on ? BULB_ON : BULB_OFF);
  for (const b of bollards) b.color.copy(on ? BULB_ON : BULB_OFF);
  renderer.toneMappingExposure = on ? 1.0 : 0.78;
  bloom.strength = on ? 0.55 : 0.12; bloom.enabled = on;   // by day nothing reaches the threshold: skip its passes
  bloom.threshold = on ? 0.9 : 1.6;
  bloom.highPassUniforms.luminosityThreshold.value = bloom.threshold;
  scene.background = on ? skyNight : THEME.sky || skyDay;
  scene.fog.color.set(THEME.fog[on ? 1 : 0]);
  for (const t of Object.values(THEMES)) if (t.live) t.live.night(on);
  for (const f of nightHooks) f(on);
  syncTimeBtns();
  applyWeather();
}
export const isNightHour = () => { const h = officeNow().getHours(); return h >= 18 || h < 6; };

export function setup() {
  state.nightManual = false;
}
