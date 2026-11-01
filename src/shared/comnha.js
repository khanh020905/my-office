// Cơm nhà: who brought lunch from home today, and when they go to warm it (the office: people/comnha.js). Plain
// functions of a person's id and the date, so every page (and the tests) agree on it without saying so to each other.
//
// As in Vietnamese offices: more and more people bring rice from home in a plastic or glass box with a clipped lid, or a
// stainless tin, in an insulated bag; at noon they line up at the pantry's microwaves, two or three minutes each. More of
// them on a Monday (the weekend's cooking), nobody at the weekend or on a holiday (src/shared/workdays.js).

import { dayKind } from './workdays.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** the share of people who bring lunch on that day, in percent: a Monday more than half, other working days (a
    make-up Saturday too) about a third, none at the weekend, on a holiday or a day off */
export function homeShare(d) {
  const k = dayKind(d);
  if (k !== 'work' && k !== 'makeup') return 0;
  return d.getDay() === 1 ? 55 : 30;
}
/** whether the person `id` brought lunch from home on day `d` (force: everyone, for ?comnha) */
export function bringsLunch(id, d, force = false) {
  if (!id) return false;
  return force || hash(`${id}:${dayKey(d)}:comnha`) % 100 < homeShare(d);
}
/** the minute of the day this person goes to warm it: between 11:45 and 12:14, their own each day */
export const warmAt = (id, d) => 705 + (hash(`${id}:${dayKey(d)}:warm`) % 30);
/** which box, and what is in it today: { kind (blue, green, pink, glass, inox), smelly (cá kho, mắm: a smell over the
    microwave), pop (the lid left clipped shut: it pops), pantry (eats at the pantry's table rather than at the desk) } */
export function lunchOf(id, d) {
  const h = hash(`${id}:${dayKey(d)}:box`);
  return { kind: ['blue', 'green', 'pink', 'glass', 'inox'][hash(id) % 5], smelly: h % 100 < 22, pop: (h >>> 8) % 100 < 14, pantry: (h >>> 16) % 3 !== 0 };
}
/** how long it is heated, in seconds: two to three minutes (quick: 15–25 s, for ?comnha) */
export const heatSecs = (id, d, quick = false) => { const k = hash(`${id}:${dayKey(d)}:secs`) % 61; return quick ? 15 + (k % 11) : 120 + k; };
/** lunch from home is warmed from 11:45 until 13:00 (after that it is eaten cold, or not at all) */
export const warmWindow = (min) => min >= 705 && min < 780;
