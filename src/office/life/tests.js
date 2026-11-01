// The test board: a screen on a stand in the server room (in the small office, on the wall by the racks) with a row for
// each session at a desk. Its lamp blinks amber while that session's tests run, turns green when they pass or red when
// they fail, and fades back to grey a few minutes later; the runner's name stays beside it. The session's character
// watches its run at the board (ui/event-text.js: the 'tests' station, cheering or puzzled after), and a failure brings
// a resting colleague over to look. One canvas, redrawn only when a row changes; the lamps are one instanced mesh.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, cyl, mat, put, rbox } from '../scene/blocks.js';
import { STATIONS } from '../people/navigation.js';
import { colorOf, dn, sessions, workers } from '../people/workers.js';
import { free, line } from '../people/errands.js';
import { t as tr } from '../../i18n/index.js';

const ROWS = 8, CW = 512, CH = 384, TOP = 58, ROW_H = 40;
const FADE = 180;                 // (sim seconds) a result's lamp stays lit this long, then fades back to grey
const LAMP = { idle: '#2E343D', run: '#F2B544', runDim: '#5A4416', ok: '#3DDC84', fail: '#FF5F5F' };
export const runs = new Map();    // session id -> { st: 'run' | 'ok' | 'fail', at (sim), runner }
let B = null, tex = null, lamps = null, shown = [], dirty = true, checkAt = 0, visitAt = -1e9;
const col = new THREE.Color(), grey = new THREE.Color(LAMP.idle);

// the sessions with a row: at a desk, in desk order
const rowsNow = () => [...sessions.values()].filter((s) => s.desk >= 0).sort((a, b) => a.desk - b.desk).slice(0, ROWS);

function draw(g) {
  g.fillStyle = '#12161D'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = '#1C2330'; g.fillRect(0, 0, CW, TOP - 8);
  g.fillStyle = '#E8ECF4'; g.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(tr('life.tests.title'), 22, (TOP - 8) / 2 + 1);
  g.fillStyle = '#3DDC84'; g.beginPath(); g.arc(CW - 30, (TOP - 8) / 2, 7, 0, Math.PI * 2); g.fill();   // (on)
  shown.forEach((s, i) => {
    const y = TOP + i * ROW_H + ROW_H / 2, r = runs.get(s.id), lit = r && (r.st === 'run' || state.sim - r.at < FADE);
    if (i % 2) { g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, y - ROW_H / 2, CW, ROW_H); }
    g.fillStyle = colorOf(s); g.fillRect(58, y - 9, 6, 18);
    g.fillStyle = lit ? '#E8ECF4' : '#9AA3B2'; g.font = '700 21px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'left';
    let name = dn(s); while (g.measureText(name).width > 250 && name.length > 3) name = name.slice(0, -2) + '…';
    g.fillText(name, 76, y + 1);
    const what = !r ? tr('life.tests.idle') : r.st === 'run' ? tr('life.tests.running') : `${tr(`life.tests.${r.st === 'ok' ? 'pass' : 'fail'}`)} · ${r.runner || ''}`;
    g.fillStyle = !r || !lit ? '#5E687B' : r.st === 'ok' ? '#8FEDB8' : r.st === 'fail' ? '#FF9C9C' : '#F6D08A';
    g.font = '600 17px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'right';
    let t = what; while (g.measureText(t).width > 160 && t.length > 3) t = t.slice(0, -2) + '…';
    g.fillText(t, CW - 18, y + 1);
  });
  if (!shown.length) { g.fillStyle = '#5E687B'; g.font = '600 18px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(tr('life.tests.idle'), CW / 2, CH / 2); }
}
function redraw() {
  dirty = false; shown = rowsNow();
  draw(tex.image.getContext('2d')); tex.needsUpdate = true;
  lamps.count = shown.length;
}

/* events from ui/event-text.js's test, testok and testfail (a subagent's run counts for its session) */
export function onTest(e) {
  if (!B || !sessions.get(e.sess)) return;
  const was = runs.get(e.sess);
  if (e.type === 'test') runs.set(e.sess, { st: 'run', at: state.sim, runner: e.runner || was?.runner || '' });
  else runs.set(e.sess, { st: e.type === 'testok' ? 'ok' : 'fail', at: state.sim, runner: e.label || was?.runner || '' });
  dirty = true;
  if (e.type === 'testfail') visit(e.sess);
}
// a failure: someone resting nearby comes over to have a look (one at a time, not more than once a minute)
function visit(id) {
  if (state.sim - visitAt < 60 || !B.look) return;
  const w = [...workers.values()].filter((o) => o.id !== id && !o.sub && free(o) && sessions.get(o.id)?.status === 'rest' && !o.onBreak && !o.doze && !o.outing)
    .sort((a, b) => Math.hypot(a.pos.x - B.x, a.pos.y - B.z) - Math.hypot(b.pos.x - B.x, b.pos.y - B.z))[0];
  if (!w) return;
  visitAt = state.sim;
  w.errand({ type: 'idle', spot: B.look, look: [B.x, B.z], anim: 'think', wait: 1.2, hold: 13, linger: 1.4, line: line('people.tests.look'), at: () => line('people.tests.hint') });
}

export function updateTests(t) {
  if (!B) return;
  if (t > checkAt || t < checkAt - 5) {   // a few times a second: rows come and go, results fade
    checkAt = t + 0.5;
    const now = rowsNow();
    if (now.length !== shown.length || now.some((s, i) => s !== shown[i])) dirty = true;
    for (const [id, r] of runs) { if (!sessions.has(id)) runs.delete(id); else if (r.st !== 'run' && !r.faded && state.sim - r.at >= FADE) { r.faded = true; dirty = true; } }   // (a closed session's row goes)
  }
  if (dirty) redraw();
  shown.forEach((s, i) => {
    const r = runs.get(s.id);
    if (!r) col.copy(grey);
    else if (r.st === 'run') col.set(Math.sin(t * 7) > 0 ? LAMP.run : LAMP.runDim);
    else { const k = Math.min(1, Math.max(0, (state.sim - r.at - FADE + 30) / 30)); col.set(r.st === 'ok' ? LAMP.ok : LAMP.fail).lerp(grey, k); }
    lamps.setColorAt(i, col);
  });
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
}

export function setup() {
  /* where it stands: in the server room on the company floor, along the glass to the director's office facing the room
     (clear of the racks' three places); in the small office on the back wall right of the racks */
  B = PRO ? { x: -5.05, z: -2.62, ry: 0.35, w: 1.5, y: 1.55, stand: true } : { x: 7.42, z: -5.93, ry: 0, w: 1.0, y: 1.75, stand: false };   // (turned a little to the room's way in)
  const h = (B.w * CH) / CW, g = new THREE.Group(); g.position.set(B.x, 0, B.z); g.rotation.y = B.ry; scene.add(g);
  const frame = mat('#1B1F26', { roughness: 0.45, metalness: 0.3 }), steel = mat('#8E949C', { roughness: 0.35, metalness: 0.6 });
  put(g, rbox(B.w + 0.08, h + 0.08, 0.05, frame, 0.015), 0, B.y, 0);
  if (B.stand) {   // two posts on a pair of feet
    for (const sx of [-1, 1]) { put(g, cyl(0.025, 0.025, B.y - h / 2, steel, 8), sx * B.w * 0.32, (B.y - h / 2) / 2, -0.02); put(g, rbox(0.08, 0.04, 0.5, frame, 0.01), sx * B.w * 0.32, 0.02, 0.02); }
  }
  tex = canvasTex(CW, CH, () => {}); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = put(g, new THREE.Mesh(new THREE.PlaneGeometry(B.w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })), 0, B.y, 0.027);
  screen.userData.noMerge = true;
  // the lamps: a disc at the start of each row
  const u = B.w / CW;
  lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(12 * u, 18), new THREE.MeshBasicMaterial({ toneMapped: false }), ROWS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < ROWS; i++) { lamps.setMatrixAt(i, m4.makeTranslation((34 - CW / 2) * u, B.y + (CH / 2 - (TOP + i * ROW_H + ROW_H / 2)) * u, 0.029)); lamps.setColorAt(i, grey); }
  lamps.count = 0; lamps.userData.noMerge = true; lamps.frustumCulled = false; g.add(lamps);
  // where people stand to watch (two places, clear of the glass), and where a colleague comes to look over a shoulder
  const fwd = [Math.sin(B.ry), Math.cos(B.ry)], side = [fwd[1], -fwd[0]], at = (a, d) => [B.x + side[0] * a + fwd[0] * d, B.z + side[1] * a + fwd[1] * d];
  const node = PRO ? 'SVi' : 'E', spot = (a, d) => { const [x, z] = at(a, d); return { x, z, face: Math.atan2(B.x - x, B.z - z), node, sit: false, by: null }; };
  STATIONS.tests = PRO ? [spot(-0.4, 0.77), spot(0.4, 0.77)] : [spot(-0.55, 1.0), spot(0.1, 1.0)];
  B.look = PRO ? spot(-0.9, 0.95) : spot(-1.2, 1.1);
  document.fonts?.ready.then(() => { dirty = true; });
}
