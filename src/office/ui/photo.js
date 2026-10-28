// Photo mode: the office alone over the whole window, the camera free (any angle, closer or further, pan with the right
// button), then a PNG at the screen's size, Full HD or 4K. Name tags and a small "My Office" mark are painted into
// the picture when they are on (on screen the tags are HTML, so the 3D canvas alone would lose them).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, stage } from '../core/env.js';
import { SOFTWARE_GL, camera, composer, controls, renderer, resize, scene } from '../scene/renderer.js';
import { npcs, subs, workers } from '../people/workers.js';
import { exitFp, fp } from '../interact/first-person.js';
import { setTimeMode, syncTimeBtns } from './settings.js';
import { night } from '../world/room-update.js';
import { toast } from './activity.js';
import { OFFICE_MARK } from '../world/pro/pieces.js';
import { t as tr } from '../../i18n/index.js';

const FREE = { minPolarAngle: 0.05, maxPolarAngle: 1.52, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, minZoom: 0.3, maxZoom: 6, enablePan: true };
const WIDTHS = { fhd: 1920, '4k': 3840 };
let on = false, kept = null, size = 'fhd', names = true, mark = true, busy = false;
const _v = new THREE.Vector3();

export const photoOn = () => on;
export function enterPhoto() {
  if (on) return;
  if (fp.on) exitFp();
  on = true; state.photo = true;
  kept = Object.fromEntries(Object.keys(FREE).map((k) => [k, controls[k]]));
  Object.assign(controls, FREE);
  document.body.classList.add('is-photo');
  $('photo-bar').hidden = false;
  sync();
  $('ph-shoot').focus({ preventScroll: true });
}
export function exitPhoto() {
  if (!on) return;
  on = false; state.photo = false;
  Object.assign(controls, kept); controls.update();   // the camera slides back inside the usual limits
  document.body.classList.remove('is-photo', 'photo-nonames');
  $('photo-bar').hidden = true;
}
function sync() {
  $('ph-names').setAttribute('aria-pressed', String(names));
  $('ph-mark').setAttribute('aria-pressed', String(mark));
  document.body.classList.toggle('photo-nonames', !names);
  for (const b of document.querySelectorAll('[data-ph-size]')) b.setAttribute('aria-pressed', String(b.dataset.phSize === size));
  const m = state.nightManual ? (night ? 'night' : 'day') : 'auto';
  for (const b of document.querySelectorAll('[data-ph-time]')) b.setAttribute('aria-pressed', String(b.dataset.phTime === m));
}

// a name tag as it looks on screen: dark pill, coloured dot, white text (s = picture pixels per screen pixel)
function pill(g, x, y, text, dot, s) {
  g.font = `600 ${12 * s}px "Be Vietnam Pro", system-ui, sans-serif`;
  const w = g.measureText(text).width + (dot ? 27 : 20) * s, h = 25 * s, r = h / 2, x0 = x - w / 2, y0 = y - h / 2;
  g.beginPath(); g.roundRect(x0, y0, w, h, r);
  g.fillStyle = 'rgba(14, 19, 27, .86)'; g.fill(); g.lineWidth = s; g.strokeStyle = 'rgba(255, 255, 255, .14)'; g.stroke();
  let tx = x0 + 10 * s;
  if (dot) { g.beginPath(); g.arc(tx + 3.5 * s, y, 3.5 * s, 0, Math.PI * 2); g.fillStyle = dot; g.fill(); tx += 12 * s; }
  g.fillStyle = '#EEF1F7'; g.textBaseline = 'middle'; g.fillText(text, tx, y + 0.5 * s);
}
export function paintNames(g, W, H, s) {
  for (const w of [...workers.values(), ...subs.values(), ...npcs]) {
    const el = w.tagEl, obj = w.tagObj;
    if (!el || !obj?.visible || !w.root?.visible || el.classList.contains('tag--muted') || el.style.display === 'none') continue;
    obj.getWorldPosition(_v).project(camera);
    if (_v.z < -1 || _v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
    const text = (w.tagText?.textContent || el.textContent || '').trim(); if (!text) continue;
    const dot = w.tagDot ? getComputedStyle(w.tagDot).backgroundColor : null;
    pill(g, ((_v.x + 1) / 2) * W, ((1 - _v.y) / 2) * H, text, dot, s);
  }
}
export function paintMark(g, W, H, s) {
  const text = 'My Office', pad = 16 * s;
  g.font = `700 ${13 * s}px "Be Vietnam Pro", system-ui, sans-serif`;
  const w = g.measureText(text).width + 40 * s, h = 30 * s, x = W - w - pad, y = H - h - pad;
  g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fillStyle = 'rgba(14, 19, 27, .72)'; g.fill();
  g.save(); g.translate(x + 9 * s, y + 6 * s); g.scale(0.75 * s, 0.75 * s); g.fillStyle = '#E8865F'; g.fill(new Path2D(OFFICE_MARK), 'evenodd'); g.restore();
  g.fillStyle = '#F6EFE4'; g.textBaseline = 'middle'; g.fillText(text, x + 32 * s, y + h / 2 + 0.5 * s);
}

function shoot() {
  if (busy) return;
  busy = true; $('ph-shoot').disabled = true;
  const w0 = stage.clientWidth || 1, h0 = stage.clientHeight || 1, pr0 = renderer.getPixelRatio();
  const W = size === 'screen' ? Math.round(w0 * pr0) : WIDTHS[size], H = Math.round((W * h0) / w0);
  let out = null;
  try {
    // the same view at the picture's size, through the full image pipeline whatever the graphics level
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    composer.setPixelRatio(1); composer.setSize(W, H);
    renderer.shadowMap.needsUpdate = true;
    if (SOFTWARE_GL) renderer.render(scene, camera); else composer.render();
    out = document.createElement('canvas'); out.width = W; out.height = H;
    const g = out.getContext('2d');
    g.drawImage(renderer.domElement, 0, 0, W, H);   // same task as the render: the drawing buffer is still there
    const s = W / w0;
    if (names) paintNames(g, W, H, s);
    if (mark) paintMark(g, W, H, s);
  } catch (err) {
    console.error(err); out = null;
  } finally {
    renderer.setPixelRatio(pr0); resize();
  }
  if (!out) { toast(tr('ui.photo.failed')); busy = false; $('ph-shoot').disabled = false; return; }
  out.toBlob((blob) => {
    busy = false; $('ph-shoot').disabled = false;
    if (!blob) { toast(tr('ui.photo.failed')); return; }
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `my-office-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(tr('ui.photo.saved', { w: W, h: H }));
    flash();
  }, 'image/png');
}
// a short white flash over the stage, like a shutter
function flash() {
  const f = document.createElement('div');
  f.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.55;pointer-events:none;z-index:7;transition:opacity .35s ease-out';
  $('stage-wrap').append(f); requestAnimationFrame(() => { f.style.opacity = '0'; }); setTimeout(() => f.remove(), 450);
}

export function setup() {
  $('btn-photo').addEventListener('click', () => (on ? exitPhoto() : enterPhoto()));
  $('ph-exit').addEventListener('click', exitPhoto);
  $('ph-shoot').addEventListener('click', shoot);
  $('ph-names').addEventListener('click', () => { names = !names; sync(); });
  $('ph-mark').addEventListener('click', () => { mark = !mark; sync(); });
  $('photo-bar').addEventListener('click', (e) => {
    const sz = e.target.closest('[data-ph-size]'); if (sz) { size = sz.dataset.phSize; sync(); return; }
    const tm = e.target.closest('[data-ph-time]'); if (tm) { setTimeMode(tm.dataset.phTime); syncTimeBtns(); sync(); }
  });
  // P toggles photo mode, Esc leaves it (not while typing in a field)
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && on) { exitPhoto(); return; }
    if ((e.key === 'p' || e.key === 'P') && !fp.on) { e.preventDefault(); on ? exitPhoto() : enterPhoto(); }
  });
}
