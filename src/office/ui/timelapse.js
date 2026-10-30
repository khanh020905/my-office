// A 15-second clip of the office to share: square (1080 × 1080) for a feed or vertical (1080 × 1920) for Reels, TikTok
// and Shorts, the camera turning slowly round the floor, people at four times their pace, the day running into the
// evening (a clock in the corner from 8:00 to 23:00, the lights coming on at six), a title at the start and the day's
// numbers over the last two and a half seconds, with an original lo-fi tune under it (clip-music.js; it can be turned
// off). The office is drawn into a canvas frame by frame and recorded from it; meanwhile the window shows the clip being
// made, with a way to stop.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { $, el, fmtBytes } from '../core/env.js';
import { camera, composer, controls, renderer, resize } from '../scene/renderer.js';
import { night } from '../world/room-update.js';
import { workers } from '../people/workers.js';
import { setTimeMode, syncTimeBtns } from './settings.js';
import { paintMark, paintNames } from './photo.js';
import { toast } from './activity.js';
import { musicTrack } from './clip-music.js';
import { t as tr, locale, num } from '../../i18n/index.js';

const SEC = 15, FPS = 30, W = 1080, DUSK = 10;   // the lights come on 10 s in (18:00 on the clip's clock)
// what MediaRecorder is asked for: with the music, MP4 (H.264 + AAC) first, then WebM (VP9 or VP8 + Opus); without it,
// or when none of those can carry sound, the picture alone
const WITH_SOUND = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'];
const PICTURE_ONLY = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
let rec = null, shape = 'square', music = true;   // (the last shape and music choice, remembered on this device)
export const clipOn = () => !!rec;

function bigText(g, text, y, size, alpha, weight = 800) {
  g.save(); g.globalAlpha = alpha; g.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = size / 6; g.strokeStyle = 'rgba(10, 14, 22, .65)'; g.strokeText(text, W / 2, y); g.fillStyle = '#FFFFFF'; g.fillText(text, W / 2, y); g.restore();
}
// the day so far, for the end card
function dayLine() {
  const st = state.stats || {}, parts = [];
  if (st.prompts) parts.push(tr('ui.clip.prompts', { n: num(st.prompts) }));
  if (st.edit) parts.push(tr('ui.clip.edits', { n: num(st.edit) }));
  if (st.cmd) parts.push(tr('ui.clip.cmds', { n: num(st.cmd) }));
  if (st.deploy) parts.push(tr('ui.clip.deploys', { n: num(st.deploy) }));
  return parts.join(' · ');
}

// a recorder for the stream, with its sound when a format can carry it; else the picture alone (a clip is never lost to
// the music) -> { mr, type, sound }
function recorder(stream, snd) {
  const ok = (x) => MediaRecorder.isTypeSupported(x), opts = (type, sound) => (type ? { mimeType: type, videoBitsPerSecond: 8e6, ...(sound && { audioBitsPerSecond: 128e3 }) } : undefined);
  const withSound = snd && WITH_SOUND.find(ok);
  if (withSound) { try { return { mr: new MediaRecorder(stream, opts(withSound, true)), type: withSound, sound: true }; } catch { /* the picture alone, below */ } }
  if (snd) { stream.removeTrack(snd.track); snd.stop(); }
  const type = PICTURE_ONLY.find(ok) || '';
  return { mr: new MediaRecorder(stream, opts(type, false)), type, sound: false };
}

export function makeClip() {
  if (rec) return;
  const tall = shape === 'tall', H = tall ? 1920 : W, out = el('canvas'); out.width = W; out.height = H;
  if (!window.MediaRecorder || !out.captureStream) { toast(tr('ui.clip.unsupported')); return; }
  const snd = music ? musicTrack(SEC) : null;   // (worked out before the recording starts: a fraction of a second)
  const stream = out.captureStream(FPS);
  if (snd) stream.addTrack(snd.track);
  let mr, type, sound;
  try { ({ mr, type, sound } = recorder(stream, snd)); } catch { snd?.stop(); toast(tr('ui.clip.unsupported')); return; }
  // what to put back afterwards
  const kept = { mode: state.nightManual ? (night ? 'night' : 'day') : 'auto', zoom: camera.zoom, pos: camera.position.clone(), target: controls.target.clone(), speed: state.speed || 1, pr: renderer.getPixelRatio() };
  // the window: a dark cover with the clip as it is made
  const cover = el('div', tall ? 'clip-cover clip-cover--tall' : 'clip-cover'), view = el('canvas', 'clip-view'), bar = el('i'), label = el('span', 'clip-label'), stop = el('button', 'clip-stop', tr('ui.clip.stop'));
  view.height = 720; view.width = Math.round((720 * W) / H); stop.type = 'button';
  const prog = el('div', 'clip-prog'); prog.append(bar);
  cover.append(view, prog, label, stop); $('stage-wrap').append(cover);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach((x) => x.stop()); if (sound) snd.stop();
    if (rec?.cancel) { finish(); toast(tr('ui.clip.canceled')); return; }
    const mime = mr.mimeType || type || 'video/webm', ext = mime.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type: mime });
    const a = el('a'); a.href = URL.createObjectURL(blob);
    a.download = `my-office-clip-${new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16)}${tall ? '-9x16' : ''}.${ext}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
    finish(); toast(tr('ui.clip.saved', { ext: ext.toUpperCase(), size: fmtBytes(blob.size) }), 6000);
  };
  function finish() {
    rec = null; cover.remove();
    state.speed = kept.speed; state.clip = false;
    renderer.setPixelRatio(kept.pr); resize();
    camera.zoom = kept.zoom; camera.position.copy(kept.pos); controls.target.copy(kept.target); camera.updateProjectionMatrix(); controls.update();
    setTimeMode(kept.mode); syncTimeBtns();
  }
  stop.addEventListener('click', () => { if (rec) { rec.cancel = true; mr.stop(); } });
  // the picture at its full size, whatever the window's shape: as wide as the floor, and for the vertical one that much
  // taller (a little closer across, the floor fills more of a phone)
  state.clip = true; state.speed = 4;
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); composer.setPixelRatio(1); composer.setSize(W, H);
  const hw = tall ? 11 : 12, hh = (hw * H) / W;
  camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
  setTimeMode('day'); syncTimeBtns();
  // the turn: round the point the camera looks at, from where it is now, a quarter turn and a little closer
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  // on a vertical clip the apps lay their buttons over the top and bottom of the picture (Reels: about the top 14%, the
  // bottom 22%): the clock and the mark go just under the top band, the words stay in the middle
  const top = tall ? Math.round(H * 0.14) : 0;
  rec = { t0: performance.now(), out, W, H, top, tall, g: out.getContext('2d'), view, vg: view.getContext('2d'), bar, label, mr, sph, z0: camera.zoom, dusk: false, line: dayLine(), people: workers.size, day: new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }) };
  mr.start(1000);
  if (sound) snd.start();
}

const _o = new THREE.Vector3();
// the camera for the next frame (called before the office is drawn)
export function clipCamera() {
  if (!rec) return;
  const k = Math.min(1, (performance.now() - rec.t0) / 1000 / SEC), e = k * k * (3 - 2 * k);
  const s = rec.sph.clone(); s.theta += e * 1.1;
  _o.setFromSpherical(s); camera.position.copy(controls.target).add(_o); camera.lookAt(controls.target);
  camera.zoom = rec.z0 * (1 + 0.18 * e); camera.updateProjectionMatrix();
}
// called right after the office is drawn (the same task: the drawing buffer is still there)
export function clipFrame() {
  if (!rec || rec.mr.state !== 'recording') return;
  const t = (performance.now() - rec.t0) / 1000, { g, H, top, tall } = rec;
  if (!rec.dusk && t >= DUSK) { rec.dusk = true; setTimeMode('night'); }
  g.drawImage(renderer.domElement, 0, 0, W, H);
  paintNames(g, W, H, 1.5);
  paintMark(g, W, tall ? top + 108 : H, 1.6);   // (vertical: top right, level with the clock; paintMark puts it at the bottom of the height it gets)
  // the clip's clock, top left: 8:00 → 23:00
  const mins = 8 * 60 + Math.min(1, t / SEC) * 15 * 60, clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;
  g.save(); g.font = '700 40px "JetBrains Mono", ui-monospace, monospace'; const w = g.measureText(clock).width + 44;
  g.beginPath(); g.roundRect(28, top + 28, w, 64, 32); g.fillStyle = 'rgba(14, 19, 27, .72)'; g.fill(); g.fillStyle = '#FFD166'; g.textBaseline = 'middle'; g.fillText(clock, 50, top + 61); g.restore();
  // a title at the start, the day's numbers at the end (a little above the middle: inside the safe band on a vertical clip too)
  if (t < 3) { const a = Math.min(1, t / 0.4) * Math.min(1, (3 - t) / 0.8); bigText(g, tr('ui.clip.title'), H * 0.42, 74, a); bigText(g, rec.day, H * 0.42 + 70, 34, a, 600); }
  if (t > SEC - 2.6) {
    const a = Math.min(1, (t - (SEC - 2.6)) / 0.3);
    g.save(); g.globalAlpha = a * 0.45; g.fillStyle = '#0B1018'; g.fillRect(0, 0, W, H); g.restore();
    bigText(g, tr('ui.clip.endTitle', { n: rec.people }), H * 0.44, 58, a);
    if (rec.line) bigText(g, rec.line, H * 0.44 + 66, 32, a, 600);
  }
  // the preview, and how far along it is
  rec.vg.drawImage(rec.out, 0, 0, rec.view.width, rec.view.height);
  rec.bar.style.width = `${Math.min(100, (t / SEC) * 100)}%`;
  rec.label.textContent = tr('ui.clip.making', { s: Math.min(SEC, Math.ceil(t)), total: SEC });
  if (t >= SEC) rec.mr.stop();
}

// the bar's choices: the clip's shape and the music, as they were last time on this device
function syncChoices() {
  for (const b of document.querySelectorAll('[data-clip-shape]')) b.setAttribute('aria-pressed', String(b.dataset.clipShape === shape));
  $('ph-music')?.setAttribute('aria-pressed', String(music));
}
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function setup() {
  try { shape = localStorage.getItem('office-clip-shape') === 'tall' ? 'tall' : 'square'; music = localStorage.getItem('office-clip-music') !== 'off'; } catch { /* storage blocked */ }
  syncChoices();
  $('ph-clip')?.addEventListener('click', makeClip);
  $('ph-music')?.addEventListener('click', () => { music = !music; keep('office-clip-music', music ? 'on' : 'off'); syncChoices(); });
  $('photo-bar')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-clip-shape]'); if (!b) return;
    shape = b.dataset.clipShape === 'tall' ? 'tall' : 'square'; keep('office-clip-shape', shape); syncChoices();
  });
}
