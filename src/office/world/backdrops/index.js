// Choosing the backdrop: city, countryside or beach.
import * as THREE from 'three';
import { state } from '../../core/state.js';
import { $, hhmm, officeNow } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { buildCity } from './city.js';
import { buildCountry } from './countryside.js';
import { buildBeach } from './beach.js';
import { cityDay, cityNight, viewTex } from '../windows.js';
import { wxChip } from '../../life/weather.js';
import { isNightHour, night, setNight } from '../room-update.js';
import { renderSessionHead } from '../../ui/session-drawer.js';
import { loadMac } from '../../ui/mac-drawer.js';
import { buildGrid, fp } from '../../interact/first-person.js';
import { t as tr } from '../../../i18n/index.js';

export let THEMES;
export let THEME;
export function setScene(name, apply = true) {
  const t = THEMES[name] || THEMES.city;
  if (!t.group) { t.group = new THREE.Group(); t.group.userData.noMerge = true; scene.add(t.group); t.live = t.build(t.group); t.live.night(night); }
  if (!t.wins) t.wins = [viewTex(t.view, false), viewTex(t.view, true)];
  for (const x of Object.values(THEMES)) if (x.group) x.group.visible = x === t;
  THEME = t;
  try { localStorage.setItem('office-scene', name); } catch { /* storage blocked */ }
  for (const b of document.querySelectorAll('[data-scene]')) b.setAttribute('aria-pressed', String(b.dataset.scene === name));
  if (fp.grid) fp.grid = buildGrid();
  if (apply) setNight(night);
}

export function setup() {
  /* ---------- backdrop: city / countryside / beach ---------- */
  THEMES = {
    city: { label: tr('world.scene.city'), build: buildCity, fog: ['#CCD8E4', '#16223E'], wins: [cityDay, cityNight] },
    country: { label: tr('world.scene.country'), build: buildCountry, fog: ['#D6E4D3', '#14222C'], view: 'country' },
    beach: { label: tr('world.scene.beach'), build: buildBeach, fog: ['#D2E6F1', '#12223A'], view: 'beach' },
  };
  THEME = THEMES.city;
  { let saved = 'city'; try { saved = localStorage.getItem('office-scene') || 'city'; } catch { /* storage blocked */ } setScene(THEMES[saved] ? saved : 'city', false); }
  if (!state.nightManual) setNight(isNightHour()); else setNight(night);
  setInterval(() => {
    $('clock').textContent = hhmm(officeNow().getTime()) + wxChip();
    if (!state.nightManual && night !== isNightHour()) setNight(isNightHour());
    if (state.selectedId) renderSessionHead();
  }, 1000);
  $('clock').textContent = hhmm(officeNow().getTime()) + wxChip();
  loadMac();
   state.macTimer = setInterval(loadMac, 30000);
}
