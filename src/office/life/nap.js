// The midday nap, 12:30–13:30: blinds down, the room a little dimmer, everyone resting naps at their desk.
import { state } from '../core/state.js';
import { chatLife } from '../ui/group-chat.js';
import { officeNow, rand, reduceMotion, replay } from '../core/env.js';
import { renderer } from '../scene/renderer.js';
import { blinds } from '../world/windows.js';
import { night } from '../world/room-update.js';
import { hash, sessions, workers } from '../people/workers.js';
import { free, later } from '../people/errands.js';
import { toast } from '../ui/activity.js';
import { sfx } from '../audio/sfx.js';
import { t as tr } from '../../i18n/index.js';

/* As in most Vietnamese offices: after lunch the blinds come down and whoever has nothing running sleeps where they
   sit, half of them leaning back under a blanket, half head down on the desk. Anyone whose session is working keeps
   working. At 13:30 an alarm, the blinds go up, the ones on the desk sit up and stretch. */
const FROM = 12 * 60 + 30, TO = 13 * 60 + 30;
export let napOn = false;
let k = 0, seen = false, checkAt = 0;
const dozer = (w) => hash(w.id) % 2 === 0;   // head down on the desk (the others recline, as at any other rest)

function begin(live) {
  if (!live) return;   // (opened in the middle of it: no announcement)
  toast(tr('life.nap.start'), 5000);
  chatLife('nap');
}
function end(live) {
  for (const w of workers.values()) {
    if (!w.doze) continue;
    w.doze = false;
    if (w.anim === 'sleep' && w.phase !== 'walk') { w.anim = 'wake'; w.wakeUntil = state.sim + (reduceMotion ? 0.3 : rand(1.4, 2.4)); }
  }
  if (live) { sfx.play('beep'); toast(tr('life.nap.end'), 4000); chatLife('wake'); }
}

export function updateNap(dt) {
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), on = !replay.on && m >= FROM && m < TO;
  if (on !== napOn) { napOn = on; (on ? begin : end)(seen); }
  seen = true;
  // the blinds (down over three seconds) and the light
  const goal = napOn ? 1 : 0;
  if (k !== goal) {
    k = reduceMotion ? goal : Math.min(1, Math.max(0, k + Math.sign(goal - k) * dt / 3));
    for (const { blind, cloth } of blinds) { blind.visible = k > 0; cloth.scale.y = Math.max(0.001, k); }
    renderer.toneMappingExposure = (night ? 1.0 : 0.78) * (1 - 0.16 * k);
  }
  if (!napOn) return;
  for (const w of workers.values()) w.doze = !w.sub && dozer(w) && w.anim === 'sleep' && w.station === 'desk';
  if (state.sim < checkAt) return;
  checkAt = state.sim + 1;
  // someone resting but up and about (back from an errand, sitting somewhere) goes to their desk for it
  let n = 0;
  for (const w of workers.values()) {
    if (w.sub) continue;
    const s = sessions.get(w.id);
    if (!s || s.status !== 'rest' || s.bg?.length || w.anim === 'sleep' || w.onBreak || w.napSent) continue;
    if (!free(w) || w.anim === 'eat' || w.mealBox || w.carry || w.outing || w.street) continue;
    w.napSent = true;
    later(0.5 + n++ * rand(0.6, 1.4), () => { w.napSent = false; if (napOn && free(w) && sessions.get(w.id)?.status === 'rest' && w.anim !== 'sleep') w.goHomeAndRest(); });
  }
}

export function setup() {}
