// Claude Code's version on this computer, watched: the newest of the editors' Claude Code extensions
// (<editor folder>/extensions/anthropic.claude-code-<version>-…), looked at every five minutes. A newer one than last
// time is news for the office (Thế Giới Di Động: someone goes to "lên đời", people/outings.js). The first one ever seen
// is not news. Kept in data/claude-version.json, so a restart doesn't tell it again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDITORS = ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.antigravity', '.antigravity-ide', '.kiro', '.trae', '.positron'];
const parts = (v) => v.split('.').map((n) => Number(n) || 0);
export const newer = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

/** { get() -> { version, prev, at } }: at, when it moved to this version (0: the first one seen, no news) */
export function createClaudeVersion({ dataDir, home = os.homedir(), every = 5 * 60e3 }) {
  const file = path.join(dataDir, 'claude-version.json');
  let st = { version: null, prev: null, at: 0 }, checked = 0;
  try { st = { ...st, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(st)); } catch { /* read-only data */ } };
  function scan() {
    let best = null;
    for (const d of EDITORS) {
      let list = []; try { list = fs.readdirSync(path.join(home, d, 'extensions')); } catch { continue; }
      for (const e of list) { const m = /^anthropic\.claude-code-(\d+\.\d+\.\d+)/.exec(e); if (m && (!best || newer(m[1], best))) best = m[1]; }
    }
    return best;
  }
  function check() {
    checked = Date.now();
    const v = scan(); if (!v) return st;
    if (!st.version) { st = { version: v, prev: null, at: 0 }; save(); }
    else if (newer(v, st.version)) { st = { version: v, prev: st.version, at: Date.now() }; save(); }
    return st;
  }
  check();
  setInterval(check, every).unref();
  return { get: () => (Date.now() - checked > 15e3 ? check() : st) };   // (asked for: looked at again, at most every 15 s)
}
