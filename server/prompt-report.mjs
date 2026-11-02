// The weekly prompt report ("Phiếu điểm prompt"): what you wrote to Claude over a week (from the history vault,
// server/vault.mjs), looked at with the very rules of the chat's prompt helper (src/shared/prompt-coach.js): how many
// would have gone through without a round trip, which habits cost the most, a few real examples with what to add.
// Nothing is sent anywhere; nothing is scored by a model.
import { coach } from '../src/shared/prompt-coach.js';

export const HINTS = ['photoBare', 'dangling', 'vague', 'multi', 'tooShort'];
// what is not a prompt to judge: a slash command, a word of agreement or a choice ("ok", "2"), Claude Code's own notes
const SKIP = /^\s*(\/|\[|<)|^\s*(ok(e|ay|ie)?|yes|no|có|không|ừ|uh|ờ|được|dc|đc|tiếp|tiếp tục|continue|go|làm đi|làm tiếp|\d{1,2}|[a-e])\s*[.!]*\s*$/iu;

/** prompts [{ t, ph, at, sid, title }] -> { n, clear, pct, convs, by: { hint: n }, examples: [{ t, hint, phrase, n, at, title }] } */
export function report(prompts, { examples = 3 } = {}) {
  const by = Object.fromEntries(HINTS.map((h) => [h, 0])), worst = [];
  let n = 0, clear = 0;
  const convs = new Set();
  for (const p of prompts) {
    if (!p?.t && !p?.ph) continue;
    if (!p.ph && SKIP.test(p.t || '')) continue;
    n++; convs.add(p.sid);
    const hints = coach({ text: p.t || '', photos: p.ph || 0 });
    if (!hints.length) { clear++; continue; }
    for (const h of hints) by[h.id]++;
    worst.push({ p, h: hints[0] });
  }
  // the examples: one of each kind first (the most common kinds first), the newest of each
  const order = HINTS.filter((h) => by[h]).sort((a, b) => by[b] - by[a]), picked = [];
  for (const kind of order) { const x = worst.filter((w) => w.h.id === kind).at(-1); if (x && picked.length < examples) picked.push(x); }
  return {
    n, clear, pct: n ? Math.round((clear / n) * 100) : null, convs: convs.size, by,
    examples: picked.map(({ p, h }) => ({ t: p.t.length > 240 ? `${p.t.slice(0, 239)}…` : p.t, ph: p.ph || 0, hint: h.id, phrase: h.phrase || '', n: h.n || 0, at: p.at, title: p.title || '' })),
  };
}
