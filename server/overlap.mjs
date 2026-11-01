// Two sessions on one file, and a port another process holds ("chặn ghi đè và giành cổng"). What each session edited
// (from its PostToolUse events), so that when another one is about to edit the same file within the window its Claude is
// told first; and a word kept for a session until its next tool call (the synchronous hook carries it). Memory only.
import path from 'node:path';

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
export const WINDOW = 20 * 60e3;
/** The file a call edits: an absolute path, or '' (relative paths are taken from the session's folder). */
export function fileOf(input, cwd = '') {
  const f = String(input?.file_path || input?.notebook_path || '');
  return !f ? '' : path.isAbsolute(f) ? path.normalize(f) : cwd ? path.resolve(cwd, f) : '';
}
/** The port a command says it couldn't have, from what it printed: Node's EADDRINUSE, "address already in use", a dev
 *  server's "Port 3000 is in use" (Next, Vite and the rest word it alike); null when it says nothing of the kind. */
export function portInUse(text) {
  const s = String(text || '').slice(0, 20000);
  for (const re of [/EADDRINUSE[^\n]*?:(\d{2,5})\b/, /address already in use[^\n]*?:(\d{2,5})\b/i, /\bport (\d{2,5}) is (?:already )?in use\b/i, /\b(\d{2,5}) is already in use\b/i]) {
    const m = re.exec(s); if (m) { const n = Number(m[1]); if (n > 0 && n < 65536) return n; }
  }
  return null;
}

export function createOverlap({ now = Date.now, window = WINDOW } = {}) {
  const edits = new Map();   // file -> { sid, at }: the latest edit of each file
  const told = new Map();    // 'sid|file|other' or 'port|sid|port' -> when: each thing said once per window
  const notes = new Map();   // sid -> [text]: said to its Claude at its next tool call
  const prune = () => {
    const t = now();
    for (const [k, v] of edits) if (t - v.at > window) edits.delete(k);
    for (const [k, at] of told) if (t - at > window) told.delete(k);
    while (edits.size > 2000) edits.delete(edits.keys().next().value);
  };
  return {
    /** A session edited a file. */
    edited(sid, file) { if (!sid || !file) return; edits.delete(file); edits.set(file, { sid, at: now() }); prune(); },
    /** Before a session edits a file: { other, at } when another session edited it within the window, and this session
     *  hasn't been told about that one yet; else null. */
    before(sid, file) {
      if (!sid || !file) return null;
      prune();
      const e = edits.get(file); if (!e || e.sid === sid) return null;
      const k = `${sid}|${file}|${e.sid}`; if (told.has(k)) return null;
      told.set(k, now());
      return { other: e.sid, at: e.at };
    },
    /** A port clash for a session: true the first time in the window (then it is said). */
    portOnce(sid, port) { prune(); const k = `port|${sid}|${port}`; if (told.has(k)) return false; told.set(k, now()); return true; },
    /** A word for a session's Claude, given with its next tool call. */
    note(sid, text) { if (!sid || !text) return; const l = notes.get(sid) || []; if (!l.includes(text)) l.push(text); notes.set(sid, l.slice(-3)); },
    take(sid) { const l = notes.get(sid); notes.delete(sid); return l ? l.join('\n\n') : ''; },
  };
}
