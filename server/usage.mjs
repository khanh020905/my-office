// Token usage and the API-price equivalent of each session, read incrementally from Claude Code transcripts (the
// session file plus its subagents). Price table and the dedupe rule come from azorkai/claude-code-office (MIT,
// cost-worker.js): the first sighting of a message id prices its input and cache, later sightings (streamed copies of
// the same message) only add the extra output tokens. On a Pro/Max plan this is not a bill, only a usage yardstick.
import fsp from 'node:fs/promises';
import path from 'node:path';

// $ per million tokens: [input, output, cache read]; cache writes cost 1.25x input (5 min) or 2x input (1 h).
const PRICES = [
  [/fable-5-1|mythos-5-1/, 10, 50, 0.25],
  [/fable-5|mythos-5/, 10, 50, 1.0],
  [/opus-5-5/, 4, 20, 0.2],
  [/opus-5/, 5, 25, 0.5],
  [/opus-4-[5-9]/, 5, 25, 0.5],
  [/opus-4|opus-3/, 15, 75, 1.5],
  [/sonnet-5/, 2, 10, 0.2],
  [/sonnet/, 3, 15, 0.3],
  [/haiku-4/, 1, 5, 0.1],
  [/haiku-3-5/, 0.8, 4, 0.08],
  [/haiku/, 0.25, 1.25, 0.03],
];
const priceOf = (model) => { for (const [re, i, o, cr] of PRICES) if (re.test(model)) return { i, o, cr }; return null; };
const CHUNK = 8 * 1024 * 1024;
const files = new Map();   // path -> { offset, seen: Map(message id -> output tokens) }

// New complete lines since the last read; a half-written last line stays for next time.
async function readNew(file) {
  let st; try { st = await fsp.stat(file); } catch { return null; }
  let f = files.get(file);
  if (!f || st.size < f.offset) { f = { offset: 0, seen: new Map() }; files.set(file, f); }
  if (st.size === f.offset) return null;
  const len = Math.min(CHUNK, st.size - f.offset), buf = Buffer.alloc(len);
  const fh = await fsp.open(file, 'r');
  try { await fh.read(buf, 0, len, f.offset); } finally { await fh.close(); }
  const end = buf.lastIndexOf(0x0a);
  if (end < 0) return len === CHUNK ? (f.offset += len, []) : null;
  f.offset += end + 1;
  return { f, lines: buf.subarray(0, end).toString('utf8').split('\n') };
}

export function blankUsage() { return { cost: 0, in: 0, out: 0, ctx: 0, model: '' }; }

// Adds whatever the transcripts gained since the last call to `u`; returns true when something changed.
export async function scanUsage(u, main, subDir) {
  const list = main ? [main] : [];
  if (subDir) { try { for (const n of await fsp.readdir(subDir)) if (n.endsWith('.jsonl')) list.push(path.join(subDir, n)); } catch { /* no subagents yet */ } }
  let changed = false;
  for (const file of list) {
    const r = await readNew(file);
    if (!r) continue;
    for (const line of r.lines) {
      // Esc in Claude Code writes this marker and sends no Stop hook: the turn is over.
      if (file === main && line.indexOf('[Request interrupted by user') >= 0 && line.indexOf('"type":"user"') >= 0) {
        const ts = Date.parse(/"timestamp":"([^"]+)"/.exec(line)?.[1] || '');
        if (Date.now() - ts < 120_000) { u.interrupted = ts; changed = true; }   // old markers in a history being read for the first time don't count
        continue;
      }
      if (line.indexOf('"usage"') < 0 || line.indexOf('"assistant"') < 0) continue;
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      const msg = rec.message, use = msg?.usage;
      if (rec.type !== 'assistant' || !use || !msg.model || msg.model === '<synthetic>') continue;
      const id = msg.id || rec.uuid, out = use.output_tokens || 0, prev = r.f.seen.get(id);
      if (prev != null && out <= prev) continue;
      const p = priceOf(msg.model), fast = use.speed === 'fast' ? 2 : 1;
      if (prev == null) {
        const cc = use.cache_creation || {}, w1 = cc.ephemeral_1h_input_tokens || 0;
        const w5 = cc.ephemeral_5m_input_tokens ?? Math.max(0, (use.cache_creation_input_tokens || 0) - w1);
        const inp = use.input_tokens || 0, cr = use.cache_read_input_tokens || 0, web = use.server_tool_use?.web_search_requests || 0;
        u.in += inp + w5 + w1 + cr;
        if (p) u.cost += fast * (inp * p.i + w5 * p.i * 1.25 + w1 * p.i * 2 + cr * p.cr) / 1e6 + web * 0.01;
        if (file === main && !rec.isSidechain) { u.ctx = inp + w5 + w1 + cr + out; u.model = msg.model; }
      } else if (file === main && !rec.isSidechain) u.ctx += out - prev;
      const add = out - (prev || 0);
      u.out += add; if (p) u.cost += fast * add * p.o / 1e6;
      r.f.seen.set(id, out);
      if (r.f.seen.size > 400) r.f.seen.delete(r.f.seen.keys().next().value);
      changed = true;
    }
  }
  return changed;
}
// Window size is not in the transcript: 200k unless the conversation already went past it (then the 1M window).
export const ctxMax = (u) => (/\[1m\]/i.test(u.model) || u.ctx > 200_000 ? 1_000_000 : 200_000);
