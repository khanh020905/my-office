// Real weather outside (Open-Meteo).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, hhmm, rand, reduceMotion, officeNow } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { hemi, sun } from '../scene/lights.js';
import { LAY } from '../world/layout.js';
import { rainKit } from './rain.js';
import { night } from '../world/room-update.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- real weather outside: Open-Meteo (free, no key). Off until you pick a city, then every 15 minutes.
   Rain falls around the office (never inside the room), clouds dim the sun, storms flash, fog closes in.
   Idea from cubicle-crew (MIT, weather.js). ---------- */
// City names are proper nouns and stay as written, except Ho Chi Minh City, whose "TP." (city) prefix is translated.
const WX_CITIES = { hn: ['Hà Nội', 21.03, 105.85], hcm: [null, 10.78, 106.7], dn: ['Đà Nẵng', 16.05, 108.2], hue: ['Huế', 16.46, 107.59],
  hp: ['Hải Phòng', 20.86, 106.68], ct: ['Cần Thơ', 10.03, 105.78], dl: ['Đà Lạt', 11.94, 108.44], nt: ['Nha Trang', 12.24, 109.19] };
const cityName = (k) => WX_CITIES[k][0] ?? tr('life.weather.' + k);
const WX_TEXT = (c) => tr('life.weather.' + (c === 0 ? 'clear' : c <= 2 ? 'partly' : c === 3 ? 'cloudy' : c <= 48 ? 'fog' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'snow' : c <= 82 ? 'showers' : 'storm'));
const WX_ICON = (c) => (c === 0 ? '☀️' : c <= 2 ? '🌤' : c === 3 ? '☁️' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '❄️' : c <= 82 ? '🌦' : '⛈');
export const wx = { city: '', code: null, temp: null, cloud: 0, rain: 0, storm: false, fog: false, at: 0, flashAt: 0, flash: 0 };
export const wxChip = () => (wx.city && wx.code != null ? ` · ${WX_ICON(wx.code)} ${Math.round(wx.temp)}°` : '');
async function fetchWeather() {
  const c = WX_CITIES[wx.city]; if (!c) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c[1]}&longitude=${c[2]}&current=temperature_2m,weather_code,precipitation,cloud_cover&timezone=auto`);
    const cur = (await r.json()).current; if (!cur) return;
    const code = cur.weather_code;
    Object.assign(wx, { code, temp: cur.temperature_2m, cloud: (cur.cloud_cover ?? 0) / 100, at: Date.now(), storm: code >= 95, fog: code === 45 || code === 48,
      rain: code >= 95 ? 1 : (code >= 80 && code <= 82) ? 0.55 + (code - 80) * 0.2 : (code >= 61 && code <= 67) ? 0.35 + (code - 61) * 0.12 : (code >= 51 && code <= 57) ? 0.18 : 0 });
    applyWeather();
  } catch { $('wx-now').textContent = tr('life.weather.failed'); }
}
let rain = null;
function rainLines() {
  const N = 3600, pos = new Float32Array(N * 6), seed = new Float32Array(N * 3);
  const spot = (i) => { let x, z; do { x = rand(-42, 42); z = rand(-42, 42); } while (x > LAY.box.x0 - 0.6 && x < LAY.box.x1 + 0.6 && z > LAY.box.z0 - 0.6 && z < LAY.box.z1 + 0.6); seed[i * 3] = x; seed[i * 3 + 1] = rand(0, 26); seed[i * 3 + 2] = z; };
  for (let i = 0; i < N; i++) spot(i);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#B8CCEA', transparent: true, opacity: 0.5, depthWrite: false }));
  lines.frustumCulled = false; lines.userData.dynamic = true; scene.add(lines);
  return { lines, geo, pos, seed, N, spot };
}
export function applyWeather() {
  const on = !!WX_CITIES[wx.city] && wx.code != null;
  for (const b of document.querySelectorAll('[data-wx]')) b.setAttribute('aria-pressed', String(b.dataset.wx === (wx.city || '')));
  if (wx.city && wx.code != null) $('wx-now').textContent = `${cityName(wx.city)} · ${Math.round(wx.temp)}° · ${WX_TEXT(wx.code)}`;
  else if (!wx.city) $('wx-now').textContent = tr('life.weather.off');
  const dim = on ? Math.min(0.55, wx.cloud * 0.35 + wx.rain * 0.3) : 0;
  sun.intensity = (night ? 0.55 : 1.35) * (1 - dim);
  // (the base: core/loop.js adds how far the camera has backed off at a low angle)
  const fogBase = [on && wx.fog ? 14 : on && wx.rain ? 30 : 40, on && wx.fog ? 52 : on && wx.rain ? 78 : 96], extra = scene.fog.extra || 0;
  scene.fog.base = fogBase; scene.fog.near = fogBase[0] + extra; scene.fog.far = fogBase[1] + extra;
  if (on && wx.rain > 0) { rain ||= rainLines(); rain.lines.visible = true; rain.count = Math.round(rain.N * wx.rain); }
  else if (rain) rain.lines.visible = false;
  rainKit.visible = on && wx.rain > 0;
  $('clock').textContent = hhmm(officeNow().getTime()) + wxChip();
}
export function updateWeather(dt) {
  if (rain?.lines.visible) {
    const { pos, seed, count } = rain, fall = 16 * dt, len = 0.55;
    for (let i = 0; i < count; i++) {
      let y = seed[i * 3 + 1] - fall; if (y < -0.3) { rain.spot(i); y = 26; } seed[i * 3 + 1] = y;
      const x = seed[i * 3], z = seed[i * 3 + 2], k = i * 6;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; pos[k + 3] = x + 0.04; pos[k + 4] = y + len; pos[k + 5] = z + 0.02;
    }
    rain.geo.setDrawRange(0, count * 2); rain.geo.attributes.position.needsUpdate = true;
  }
  if (wx.storm && WX_CITIES[wx.city] && !reduceMotion) {   // a flash now and then, the thunder a moment later
    if (!wx.flashAt) wx.flashAt = state.sim + rand(6, 20);
    if (state.sim > wx.flashAt) { wx.flash = 0.35; wx.flashAt = state.sim + rand(8, 25); setTimeout(() => sfx.play('thunder'), rand(400, 1600)); }
  }
  if (wx.flash > 0) { wx.flash -= dt; hemi.intensity = (night ? 0.18 : 0.25) + (wx.flash > 0.22 || (wx.flash > 0.08 && wx.flash < 0.14) ? 3.2 : 0); if (wx.flash <= 0) hemi.intensity = night ? 0.18 : 0.25; }
}

export function setup() {
  try { wx.city = localStorage.getItem('office-wx') || ''; } catch { /* storage blocked */ }
  for (const b of document.querySelectorAll('[data-wx]')) b.setAttribute('aria-pressed', String(b.dataset.wx === wx.city));
  // Settings → Real weather: one chip per city, "Off" first
  $('wx-cities').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wx]'); if (!b) return;
    wx.city = b.dataset.wx; wx.code = null;
    for (const x of document.querySelectorAll('[data-wx]')) x.setAttribute('aria-pressed', String(x === b));
    try { localStorage.setItem('office-wx', wx.city); } catch { /* storage blocked */ }
    if (wx.city) { $('wx-now').textContent = tr('life.weather.loading'); fetchWeather(); } else applyWeather();
  });
  if (wx.city) fetchWeather();
  setInterval(() => { if (wx.city && document.visibilityState === 'visible') fetchWeather(); }, 15 * 60e3);
}
