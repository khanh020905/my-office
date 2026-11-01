// Trực nhật: the pantry's daily chores and whose turn it is today (the office: people/duty.js; the board on the pantry
// wall and the cups at the sink: world/props/duty-board.js). Plain functions on a small record the page keeps in its
// storage, so a day's roster holds all day whoever comes and goes, the turn moves on each working day, and a chore left
// undone is remembered the next morning. No chores at the weekend or on a holiday (src/shared/workdays.js).
//
// As in Vietnamese offices: a rota on the pantry wall, one name a chore, the next names the next day. Rửa ly: the
// cups and glasses pile up at the sink through the day (the morning coffee, a glass of trà đá at lunch, the afternoon
// cà phê), washed after lunch. Đổ rác: the bag out of the pantry's big bin at about five. Tưới cây: in the morning.
// Lau bàn: the pantry's tables wiped at about five. The cleaner who comes at 18:30 mops the floors; the rest is ours.

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export const CHORES = ['cups', 'trash', 'plants', 'table'];
/** when each is done (minutes of the day): the plants from the morning, the cups after lunch and the nap (13:30), the
    bin and the tables at about five; past the end it is missed for today */
export const WINDOWS = { plants: [510, 1050], cups: [810, 1080], trash: [1015, 1100], table: [1015, 1100] };
/** a chore owed from yesterday is done first thing: from 8:00 */
export const OWE_FROM = 480;
export const PILE_MAX = 24;   // (the most cups the sink's counter can hold)
export const due = (chore, min) => min >= WINDOWS[chore][0] && min < WINDOWS[chore][1];

/** an empty record */
export const fresh = () => ({ v: 1, order: [], next: 0, day: '', who: {}, names: {}, done: {}, owe: [], seen: [], left: 0, extra: 0, washed: -1, told: '', grumbled: '' });

/** the minutes of the day this person (their project's key) brings a cup to the sink: the morning coffee or tea
    (8:00–9:59), a glass of trà đá at lunch (12:30–13:29: before the washing-up after the nap), and on most days the afternoon cà phê
    (14:30–15:59), each at a minute of their own every day */
export function cupMoments(key, day) {
  const h = hash(`${key}:${day}:cups`);
  const out = [480 + (h % 120), 750 + ((h >>> 7) % 60)];
  if ((h >>> 14) % 10 < 7) out.push(870 + ((h >>> 18) % 90));
  return out;
}
/** how many cups the people `keys` brought to the sink on `day` after minute `from` and up to `to` */
export function cupsBetween(keys, day, from, to) {
  let n = 0;
  for (const k of keys) for (const m of cupMoments(k, day)) if (m > from && m <= to) n++;
  return n;
}
/** the cups in the sink at minute `min` of the day */
export const pile = (st, min) => Math.min(PILE_MAX, st.left + st.extra + cupsBetween(st.seen, st.day, st.washed, min));

/** A new working day (`today`, 'YYYY-MM-DD'; `prev`: the working day before it). What yesterday's people left undone is
    owed today, by the same people (only from the working day just before: anything older is let go), and the cups
    still in the sink stay there. Today's names come with assign(), once someone is here. */
export function roll(st, today, prev) {
  if (st.day === today) return st;
  const last = st.day === prev;
  const owe = last ? CHORES.filter((c) => st.who[c] && !st.done[c]).map((c) => ({ chore: c, who: st.who[c], name: st.names[st.who[c]] || '' })) : [];
  const left = last ? pile(st, 1440) : 0;
  return { ...st, day: today, who: {}, done: {}, owe, seen: [], left, extra: 0, washed: -1, told: '', grumbled: '' };
}

/** Today's roster from those here (`here`: [{ key, name }], a project each): the turn goes on along the list everyone
    who has ever been here is on (in the order they first came), from where yesterday's stopped; four chores to four
    people, or several each when fewer are here. Nothing when nobody is (the next call tries again). */
export function assign(st, here) {
  if (Object.keys(st.who).length || !here.length) return st;
  const keys = [...new Set(here.map((p) => p.key))], names = { ...st.names };
  for (const p of here) names[p.key] = p.name;
  let order = [...st.order, ...keys.filter((k) => !st.order.includes(k)).sort()];
  if (order.length > 40) order = order.filter((k) => keys.includes(k)).concat(order.filter((k) => !keys.includes(k))).slice(0, 40);
  const n = Math.min(CHORES.length, keys.length), picked = [];
  let i = st.next % order.length, last = i;
  for (let k = 0; k < order.length && picked.length < n; k++, i = (i + 1) % order.length) if (keys.includes(order[i])) { picked.push(order[i]); last = i; }
  const who = Object.fromEntries(CHORES.map((c, k) => [c, picked[k % picked.length]]));
  for (const k of Object.keys(names)) if (!order.includes(k)) delete names[k];
  return { ...st, order, next: (last + 1) % order.length, who, names, seen: [...new Set([...st.seen, ...keys])].slice(0, 30) };
}
/** someone here today (whose cups count): added to the day's list */
export const saw = (st, keys) => (keys.every((k) => st.seen.includes(k)) ? st : { ...st, seen: [...new Set([...st.seen, ...keys])].slice(0, 30) });
/** a chore done at minute `min` (an owed one: off the list) */
export function done(st, chore, min, owed = false) {
  if (owed) return { ...st, owe: st.owe.filter((o) => o.chore !== chore) };
  return { ...st, done: { ...st.done, [chore]: min } };
}
/** the cups washed at minute `min` (`left`: the ones still there when they were called away) */
export const washed = (st, min, left = 0) => ({ ...st, left, extra: 0, washed: min });
