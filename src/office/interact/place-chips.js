// Place chips over the furniture and label decluttering.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from '../core/state.js';
import { PRO, el, stage } from '../core/env.js';
import { icon } from '../ui/icons.js';
import { camera, scene } from '../scene/renderer.js';
import { LAY } from '../world/layout.js';
import { ROCKET_HOME } from '../world/furniture/rocket.js';
import { DZ } from '../world/entrance.js';
import { DESKS } from '../world/desks.js';
import { cat } from '../world/props/cat.js';
import { lostObj } from '../world/props/dev-servers.js';
import { leaving, npcs, sessions, subs, workers } from '../people/workers.js';
import { director } from '../people/director.js';
import { macSnap, openMac } from '../ui/mac-drawer.js';
import { PROPS, hoverProp, propDist, setOutline } from './props.js';
import { openPlace } from './place-cards.js';
import { fp } from './first-person.js';
import { teamTags, updateTeamTags } from '../net/live.js';
import { t as tr } from '../../i18n/index.js';

export let PLACES;
export const placeMeshes = (id) => (PLACES[id]?.props || []).flatMap((k) => PROPS.get(k)?.meshes || []);
export const READ_T = ['read', 'grep', 'glob', 'skill'], WEB_T = ['web', 'fetch', 'mcp'], EDIT_T = ['edit', 'write'];
function placeLive(id) {
  const list = [...sessions.values()], doing = (types) => list.filter((s) => s.status === 'work' && types.includes(s.last?.type)).length;
  switch (id) {
    case 'library': { const n = doing(READ_T); return n ? tr('places.live.reading', { n }) : ''; }
    case 'window': { const n = doing(WEB_T); return n ? tr('places.live.searching', { n }) : ''; }
    case 'server': { const s = macSnap; return s?.mem ? `RAM ${Math.round((s.mem.used / s.mem.total) * 100)}%` : ''; }
    case 'deploy': return state.stats.deploy ? tr('places.live.deployToday', { n: state.stats.deploy }) : '';
    case 'board': { const n = list.filter((s) => s.lastPrompt && s.status !== 'rest').length + state.todos.filter((t) => !t.done).length; return n ? tr('places.live.tasks', { n }) : ''; }
    case 'coffee': { const n = list.filter((s) => s.status === 'rest').length; return n ? tr('places.live.resting', { n }) : ''; }
    case 'desks': return list.length ? tr('places.live.desks', { used: list.filter((s) => s.desk >= 0).length, total: DESKS.length }) : '';
    case 'meeting': { const n = list.reduce((a, s) => a + (s.subs?.length || 0), 0); return n ? tr('places.live.subagents', { n }) : ''; }
    case 'director': return director?.job ? tr('places.live.delivering') : director?.queue.length ? tr('places.live.queued', { n: director.queue.length }) : '';
    case 'wc': { const n = [...workers.values()].filter((w) => w.wcBusy).length; return n ? tr('places.live.people', { n }) : ''; }
    case 'lounge': return '';
    default: return '';
  }
}
let placesAt = 0;
const chipRay = new THREE.Raycaster(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _o = new THREE.Vector3();
// Is furniture nearer the camera covering this chip? Five rays: the centre and four points near the chip's corners.
export function chipCovered(pl, ppu) {
  _right.setFromMatrixColumn(camera.matrixWorld, 0); _up.setFromMatrixColumn(camera.matrixWorld, 1);
  const own = new Set(pl.props || []), hw = (pl.w * 0.4) / ppu, hh = (pl.h * 0.35) / ppu;
  for (const [sx, sy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _o.copy(pl.pos).addScaledVector(_right, sx * hw).addScaledVector(_up, sy * hh).addScaledVector(_fwd, -60);
    chipRay.ray.set(_o, _fwd);
    for (const p of PROPS.values()) if (!own.has(p.id) && !p.dyn && propDist(p, chipRay.ray) < 59.2) return true;
  }
  return false;
}
export const _a = new THREE.Vector3(), _fwd = new THREE.Vector3();
// Name tags of people standing close together: the nearer person keeps theirs, the others step up (bubbles follow).
const _tp = new THREE.Vector3();
function declutterTags() {
  // Each person's label is a stack: the name tag at the head, the speech bubble 22 px above it. Stacks are placed in
  // order (waiting for you or failing first, then sessions, then subagents; nearer before farther) and none may cover
  // one placed before it: a session's stack climbs up to three steps; failing that, its bubble waits (fades) and only
  // the tag stays. A subagent's tag never climbs, it hides instead (a crowded meeting room stays readable).
  const W = stage.clientWidth, H = stage.clientHeight, list = [];
  for (const w of [...workers.values(), ...subs.values(), ...npcs, ...leaving]) {
    const tagOn = w.tagObj.visible && w.tagEl.isConnected, bub = w.bubbleObj.visible;
    if (!w.root.parent || !w.root.visible || (!tagOn && !bub)) continue;
    w.tagObj.getWorldPosition(_tp); const d = _tp.clone().sub(camera.position).dot(_fwd); _tp.project(camera);
    const cl = w.bubbleEl.classList, urgent = bub && (cl.contains('bubble--wait') || cl.contains('bubble--fail'));
    // sizes are measured only when the text changes: reading them every tick forced a layout of every label
    const sz = (w.lblSize ||= {}), tk = `${w.tagText.data}|${w.teamEl?.textContent || ''}|${w.tagEl.classList.contains('tag--wait')}`, bk = `${w.sayKey}|${cl.contains('bubble--sub')}`;
    if (tagOn && sz.tk !== tk) { sz.tk = tk; sz.wd = w.tagEl.offsetWidth || 90; sz.h = w.tagEl.offsetHeight || 24; }
    if (bub && sz.bk !== bk) { sz.bk = bk; sz.bw = w.bubbleEl.offsetWidth || 180; sz.bh = w.bubbleEl.offsetHeight || 40; }
    list.push({ w, x: (_tp.x + 1) / 2 * W, y: (1 - _tp.y) / 2 * H, d, tagOn, bub, urgent, wd: sz.wd || 90, h: sz.h || 24, bw: sz.bw || 180, bh: sz.bh || 40 });
  }
  const rank = (t) => (t.urgent ? 0 : t.w.sub ? 2 : 1);
  list.sort((a, b) => rank(a) - rank(b) || a.d - b.d);
  const rects = [], free = (x, y, w, h) => !rects.some((r) => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.y - y) < (r.h + h) / 2 + 3);
  // fixed chips are obstacles: the forgotten-dev-server alert and each pod's team name
  for (const o of [lostObj, ...teamTags.map((x) => x.o)]) {
    if (!o.visible || !o.element.isConnected) continue;
    o.getWorldPosition(_tp); _tp.project(camera);
    rects.push({ x: (_tp.x + 1) / 2 * W, y: (1 - _tp.y) / 2 * H, w: o.element.offsetWidth || 120, h: o.element.offsetHeight || 24 });
  }
  for (const t of list) {
    const step = t.h + 4, tagY = (s) => t.y - s, bubY = (s) => t.y - s - 22 - t.bh / 2;
    const tagFree = (s) => !t.tagOn || free(t.x, tagY(s), t.wd, t.h), bubFree = (s) => !t.bub || free(t.x, bubY(s), t.bw, t.bh);
    // where it was last time comes first, so labels don't hop between equally good places as people walk
    const tries = [...new Set([t.w.lblShift ?? 0, ...Array.from({ length: (t.w.sub ? 0 : 3) + 1 }, (_, k) => k * step)])];
    const keep = t.w === state.hovered || t.w.id === state.selectedId || sessions.get(t.w.id)?.status === 'wait';
    let shift = tries.find((s) => tagFree(s) && bubFree(s)) ?? -1, showBub = t.bub, hideTag = false;
    if (shift < 0 && t.urgent) shift = 0;                    // "needs you" and errors always show
    if (shift < 0) {
      showBub = false;
      shift = tries.find((s) => tagFree(s)) ?? -1;
      if (shift < 0) { shift = 0; hideTag = !keep; }         // no room even for the name: the farther one steps back
    }
    t.w.lblShift = shift;
    if (t.tagOn && !hideTag) rects.push({ x: t.x, y: tagY(shift), w: t.wd, h: t.h });
    if (showBub) rects.push({ x: t.x, y: bubY(shift), w: t.bw, h: t.bh });
    if (t.w.tagEl.classList.contains('tag--muted') !== hideTag) t.w.tagEl.classList.toggle('tag--muted', hideTag);
    const muted = t.bub && !showBub;
    if (t.w.bubbleEl.classList.contains('bubble--muted') !== muted) t.w.bubbleEl.classList.toggle('bubble--muted', muted);
    const m = shift ? `-${shift}px` : '';
    if (t.w.tagEl.style.marginTop !== m) { t.w.tagEl.style.marginTop = m; t.w.bubbleEl.style.marginBottom = shift ? `${shift}px` : ''; }
  }
}
// Every 150 ms: refresh the live counts, and fade a chip when a person stands between it and the camera.
export function updatePlaces(now) {
  if (now - placesAt < 150) return; placesAt = now;
  updateTeamTags();
  if (!fp.on) { camera.getWorldDirection(_fwd); declutterTags(); }
  for (const [id, pl] of Object.entries(PLACES)) {
    if (!pl.el) continue;
    const t = placeLive(id);
    if (pl.liveEl.textContent !== t) { pl.liveEl.textContent = t; pl.liveEl.hidden = !t; pl.w = 0; }
  }
  if (fp.on) return;
  const W = stage.clientWidth, H = stage.clientHeight, ppu = H / ((camera.top - camera.bottom) / camera.zoom);
  camera.getWorldDirection(_fwd);
  const people = [...workers.values(), ...subs.values(), ...leaving].map((w) => ({ x: w.pos.x, z: w.pos.y, h: w.sub ? 1.4 : 1.9 }));
  people.push({ x: cat.pos.x, z: cat.pos.y, h: 0.7 });
  const boxes = people.map((p) => {
    _a.set(p.x, 0, p.z); const d = _a.clone().sub(camera.position).dot(_fwd);
    _a.project(camera); const fx = (_a.x + 1) / 2 * W, fy = (1 - _a.y) / 2 * H;
    _a.set(p.x, p.h, p.z).project(camera); const hy = (1 - _a.y) / 2 * H;
    return { l: fx - 0.42 * ppu, r: fx + 0.42 * ppu, t: hy, b: fy, d };
  });
  for (const pl of Object.values(PLACES)) {
    if (!pl.el) continue;
    if (!pl.w) { pl.w = pl.el.offsetWidth; pl.h = pl.el.offsetHeight; }
    const d = _a.copy(pl.pos).sub(camera.position).dot(_fwd);
    _a.copy(pl.pos).project(camera);
    const x = (_a.x + 1) / 2 * W, y = (1 - _a.y) / 2 * H, l = x - pl.w / 2, r = x + pl.w / 2, t = y - pl.h / 2, b = y + pl.h / 2;
    let behind = boxes.some((q) => q.d < d - 0.25 && q.l < r && q.r > l && q.t < b && q.b > t);
    if (!behind) behind = chipCovered(pl, ppu);
    pl.el.classList.toggle('zone--behind', behind);
  }
}

export function setup() {
  /* ---------- place chips ---------- */
  PLACES = PRO ? {
    director: { name: tr('places.chip.director'), icon: 'home', at: [-5.4, 2.7, -6.2], props: ['director'] },
    meeting: { name: tr('places.chip.meeting'), icon: 'users', at: [0.2, 2.7, -5.6], props: ['meeting'] },
    library: { name: tr('places.chip.libraryPro'), icon: 'book', at: [5.8, 2.85, -6.6], props: ['shelf'] },
    window: { name: tr('places.chip.window'), icon: 'globe', props: ['window'] },
    coffee: { name: tr('places.chip.dining'), icon: 'coffee', at: [11.3, 1.4, -3.0], props: ['coffee'] },
    lounge: { name: tr('places.chip.lounge'), icon: 'sparkle', at: [11.2, 1.3, 6.2], props: ['gametv', 'sofa', 'foosball', 'arcade', 'aquarium'] },
    deploy: { name: tr('places.chip.deploy'), icon: 'rocket', at: [ROCKET_HOME.x, 0.16, ROCKET_HOME.z + 0.7], props: ['rocket'] },
    server: { name: tr('places.chip.serverPro'), icon: 'server', at: [-5.8, 2.75, -1.0], props: ['racks', 'tv'], open: () => openMac() },
    door: { name: tr('places.chip.lobby'), icon: 'door', at: [-7.0, 3.2, DZ], props: ['door'] },
    wc: { name: tr('places.chip.wc'), icon: 'door', at: [-5.8, 2.1, 7.2], props: ['wc'] },
    board: { name: tr('places.chip.board'), icon: 'list', at: [-3.4, 3.15, LAY.board[2]], props: ['board'] },
    desks: { name: tr('places.chip.devTeam'), icon: 'monitor', props: DESKS.map((_, i) => 'desk' + i) },
    printer: { name: tr('places.chip.printer'), icon: 'file', props: ['printer'] },
  } : {
    library: { name: tr('places.chip.library'), icon: 'book', at: [-5.2, 2.8, -5.3], props: ['shelf'] },
    window: { name: tr('places.chip.window'), icon: 'globe', at: [0.9, 3.66, -5.86], props: ['window'] },
    server: { name: tr('places.chip.server'), icon: 'server', at: [5.5, 2.58, -5.08], props: ['racks', 'tv'], open: () => openMac() },
    deploy: { name: tr('places.chip.deploy'), icon: 'rocket', at: [7.25, 0.16, -2.9], props: ['rocket'] },
    board: { name: tr('places.chip.board'), icon: 'list', at: [-7.86, 3.4, -2.6], props: ['board'] },
    door: { name: tr('places.chip.door'), icon: 'door', at: [-7.86, 2.86, 1.5], props: ['door'] },
    coffee: { name: tr('places.chip.coffee'), icon: 'coffee', at: [-5.55, 1.02, 5.74], props: ['coffee'] },
    desks: { name: tr('places.chip.desks'), icon: 'monitor', props: DESKS.map((_, i) => 'desk' + i) },
    meeting: { name: tr('places.chip.meeting'), icon: 'users', at: [5.2, 0.9, 2.4], props: ['meeting'] },
    printer: { name: tr('places.chip.printer'), icon: 'file', props: ['printer'] },
  };
  for (const [id, pl] of Object.entries(PLACES)) {
    if (!pl.at) continue;
    const b = el('button', 'zone'); b.type = 'button'; b.dataset.place = id;
    const ic = el('span', 'z-ico'); ic.append(icon(pl.icon));
    pl.liveEl = el('span', 'z-live'); pl.liveEl.hidden = true;
    b.append(ic, el('span', 'z-name', pl.name), pl.liveEl);
    b.setAttribute('aria-label', pl.name);
    const o = new CSS2DObject(b); o.position.set(...pl.at); scene.add(o);
    pl.el = b; pl.obj = o; pl.pos = new THREE.Vector3(...pl.at); pl.id = id;
    b.addEventListener('click', (e) => { e.stopPropagation(); (pl.open || (() => openPlace(id)))(); });
    b.addEventListener('pointerenter', () => { state.hoverPlace = id; if (!hoverProp) setOutline(placeMeshes(id)); b.classList.add('zone--hot'); });
    b.addEventListener('pointerleave', () => { state.hoverPlace = null; if (!hoverProp) setOutline([]); b.classList.remove('zone--hot'); });
  }
}
