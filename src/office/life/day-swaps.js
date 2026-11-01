// Làm bù, nghỉ bù: the office on the Government's swapped days (the dates and their notices: src/shared/workdays.js).
// A make-up Saturday (đi làm bù) is a working day like any other: the receptionist at her desk, lunch from home and the
// quán cơm, the duty rota (people/staff.js, comnha.js, comtrua.js, duty.js ask isWorkday()); and in the morning someone
// grumbles in the group chat ("Thứ Bảy mà vẫn phải lên công ty 😩 làm bù mà"). The day taken off for it (nghỉ bù) is a
// day off: the front desk shut, no lunch, no rota, no stand-up. On the last working day before a long break (three days
// or more: Tết, 30/4–1/5, 2/9, a swapped Friday or Monday) someone says so in the afternoon, and when there is a
// Saturday to make up for it, someone reminds everyone. ?debug: __office.daySwaps.
import { PRO, officeNow, pad2, replay } from '../core/env.js';
import { sessions, workers } from '../people/workers.js';
import { chatLife } from '../ui/group-chat.js';
import { breakAfter, dayKey, dayKind, swapOf } from '../../shared/workdays.js';

let checkAt = 0, saidMakeup = '', saidEve = '';
const here = () => [...workers.values()].filter((w) => !w.sub && !w.staff && !w.leaving && !w.away && sessions.has(w.id) && w.root.parent);
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export function updateDaySwaps() {
  const now = performance.now();   // (by the wall clock, every few seconds: the office's own clock crawls at a few frames a second)
  if (!PRO || replay.on || now < checkAt) return;
  checkAt = now + 8000;
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), today = dayKey(d), kind = dayKind(d), list = here();
  if (!list.length) return;
  const who = () => list[Math.floor(Math.random() * list.length)].id;
  // a make-up Saturday, in the morning: the grumble (and what it makes up for)
  if (kind === 'makeup' && saidMakeup !== today && m >= 480 && m < 630) {
    saidMakeup = today;
    const s = swapOf(d);
    chatLife('makeup', { id: who(), off: s ? dm(s.off) : '', every: 12 * 3600e3 });
  }
  // the afternoon before a long break: how many days, and the Saturday to come back on, if there is one
  if (kind !== 'work' && kind !== 'makeup') return;
  if (saidEve !== today && m >= 990 && m < 1080) {
    const b = breakAfter(d);
    if (b.days >= 3) { saidEve = today; chatLife('breakEve', { id: who(), n: b.days, makeup: b.makeup ? dm(b.makeup) : '', every: 12 * 3600e3 }); }
  }
}
// for tests (?debug)
const debug = { kind: () => dayKind(officeNow()), swap: () => swapOf(officeNow()), after: () => breakAfter(officeNow()), hm: () => `${pad2(officeNow().getHours())}:${pad2(officeNow().getMinutes())}` };
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) setTimeout(function hook() { if (!window.__office) { setTimeout(hook, 200); return; } window.__office.daySwaps = debug; }, 0);
export function setup() {}
