// The first visit: a short tour of what you can click. One card at a time, pointing at the thing it is about (the
// camera turns to it and it is outlined); clicking the thing itself does what it does and goes on to the next card.
// Once seen it does not come back by itself: Settings → More → "Show the tour again", or ?tips.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from '../core/state.js';
import { $, el, replay } from '../core/env.js';
import { BASE_ZOOM, scene } from '../scene/renderer.js';
import { focusTarget } from '../core/loop.js';
import { PROPS, hoverProp, setOutline } from '../interact/props.js';
import { fp } from '../interact/first-person.js';
import { cat } from '../world/props/cat.js';
import { workers } from '../people/workers.js';
import { lite } from './lite.js';
import { togglePop } from './settings.js';
import { t as tr } from '../../i18n/index.js';

const KEY = 'office-tips';
// in order: the things in the room, then the people, then walking in. A step whose thing this office lacks is left out.
const STEPS = [
  { key: 'lamp', prop: 'lamp0' }, { key: 'switch', prop: 'switch0' }, { key: 'coffee', prop: 'coffee' }, { key: 'printer', prop: 'printer' },
  { key: 'cat', prop: 'cat' }, { key: 'bell', prop: 'bell' }, { key: 'person' }, { key: 'walk', dom: 'btn-fp' },
];
let tour = null;      // { steps, i, card, anchor, outlined }
let pending = 0;      // a first visit: when to start (performance.now(), once the office has settled), 0 if not
const seen = () => { try { return localStorage.getItem(KEY) === 'seen'; } catch { return true; } };
const remember = () => { try { localStorage.setItem(KEY, 'seen'); } catch { /* storage blocked */ } };
// someone to point at: at work if anyone is, in sight
const somebody = () => { const all = [...workers.values()].filter((w) => w.root.visible && !w.street && !w.away); return all.find((w) => w.anim !== 'sleep') || all[0] || null; };

export function startTips() {
  endTips(false);
  const steps = STEPS.filter((s) => (s.prop ? PROPS.has(s.prop) : s.dom ? !!$(s.dom) : !!somebody()));
  if (!steps.length) return;
  tour = { steps, i: -1 };
  show(0);
}
export function endTips(done = true) {
  if (!tour) return;
  if (tour.outlined && !hoverProp) setOutline([]);
  tour.anchor?.removeFromParent(); tour.card?.remove();
  tour = null;
  if (done) remember();
}
// the thing for this step was used (props.js), or someone was opened: on to the next card
export function tipUsed(id) {
  const s = tour?.steps[tour.i];
  if (s && (s.prop === id || (s.key === 'person' && id === 'person'))) { const i = tour.i; setTimeout(() => tour?.i === i && show(i + 1), 1200); }
}

function card(s, n, total) {
  const box = el('div', 'tour'), top = el('div', 'tour-top');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite');
  top.append(el('b', 'tour-title', tr(`tips.${s.key}.title`)), el('span', 'tour-n', tr('tips.step', { n, total })));
  const acts = el('div', 'tour-acts'), skip = el('button', 'tour-skip', tr('tips.skip')), next = el('button', 'tour-next', tr(n === total ? 'tips.done' : 'tips.next'));
  skip.type = next.type = 'button';
  skip.addEventListener('click', () => endTips());
  next.addEventListener('click', () => show(tour.i + 1));
  if (n < total) acts.append(skip);
  acts.append(next);
  box.append(top, el('p', 'tour-text', tr(`tips.${s.key}.text`) + (s.prop || s.key === 'person' ? ' ' + tr('tips.orClick') : '')), acts);
  for (const ev of ['pointerdown', 'wheel']) box.addEventListener(ev, (e) => e.stopPropagation());   // (not a drag of the camera)
  return box;
}
// the camera to (x, z), a little closer than usual; the camera's own drift waits
function look(x, y, z) { focusTarget.set(x, y, z); state.zoomGoal = 1.7 * BASE_ZOOM; state.lastUserCam = performance.now(); }

function show(i) {
  if (!tour) return;
  if (tour.outlined && !hoverProp) setOutline([]);
  tour.anchor?.removeFromParent(); tour.card?.remove(); tour.anchor = tour.card = tour.meshes = null; tour.outlined = false;
  if (i >= tour.steps.length) { endTips(); return; }
  tour.i = i;
  const s = tour.steps[i], box = card(s, i + 1, tour.steps.length), wrap = el('div', 'tour-wrap');
  if (s.dom) {   // a button on the page: the card just above it, kept on the screen (the arrow still at the button)
    const b = $(s.dom), host = $('stage-wrap'), r = b.getBoundingClientRect(), h = host.getBoundingClientRect();
    box.classList.add('tour--page'); box.style.bottom = `${h.bottom - r.top + 14}px`;
    host.append(box); tour.card = box;
    const cx = r.left + r.width / 2 - h.left, half = box.offsetWidth / 2, x = Math.min(Math.max(cx, half + 10), h.width - half - 10);
    box.style.left = `${x}px`; box.style.setProperty('--arrow', `${half + cx - x}px`);
  } else {
    let anchor;
    if (s.prop) {
      const p = PROPS.get(s.prop);
      if (s.prop === 'cat') { anchor = new CSS2DObject(wrap); anchor.position.set(0, 0.75, 0); cat.g.add(anchor); look(cat.g.position.x, 0.5, cat.g.position.z); }
      else { anchor = new CSS2DObject(wrap); anchor.position.set(p.center.x, p.top + 0.25, p.center.z); scene.add(anchor); look(p.center.x, Math.min(1, p.center.y), p.center.z); }
      setOutline(p.meshes); tour.outlined = true; tour.meshes = p.meshes;
    } else {
      const w = somebody();
      if (!w) { show(i + 1); return; }
      anchor = new CSS2DObject(wrap); anchor.position.set(0, 2.55, 0); w.root.add(anchor); look(w.pos.x, 0.9, w.pos.y);
    }
    wrap.append(box); tour.anchor = anchor; tour.card = wrap;
  }
  box.querySelector('.tour-next').focus({ preventScroll: true });
}

// each frame: start on a first visit once things have settled; stand aside for walking in, photos, replays
export function updateTips() {
  if (pending && !tour && performance.now() > pending && state.sim > 0.5 && !fp.on && !state.photo && !replay.on && !lite) { pending = 0; startTips(); }
  if (!tour) return;
  if (fp.on || state.photo || replay.on || lite) { endTips(); return; }
  if (state.selectedId && tour.steps[tour.i]?.key === 'person') tipUsed('person');
  // the outline back once the pointer has left whatever else it was on
  if (tour.meshes && !hoverProp && !tour.outlined) { setOutline(tour.meshes); tour.outlined = true; } else if (hoverProp) tour.outlined = false;
}

export function setup() {
  pending = !seen() || new URLSearchParams(location.search).has('tips') ? performance.now() + 4500 : 0;   // (real time: a slow machine's office clock lags)
  addEventListener('keydown', (e) => { if (tour && e.key === 'Escape') endTips(); });
  $('btn-tips')?.addEventListener('click', () => { togglePop(false); startTips(); });
}
