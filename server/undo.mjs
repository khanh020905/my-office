// "Hoàn tác lượt cuối": the files Claude changed with its file tools (Edit, Write, MultiEdit, NotebookEdit) in a
// conversation's last turn, put back as they were before it. The office keeps its own copies: the synchronous hook that
// runs before every call (/hook/loop) asks before(), which copies a file the first time the turn touches it (or notes
// that it didn't exist yet), before Claude Code writes it. Not what a shell command changed (git, sed, a build): that is
// not known. A file changed again after the turn ended (by you, most likely) is left alone; what is there now is copied
// aside first, so the undo can itself be undone. The last 3 turns of each conversation, in <dir>/<session>/<turn>/.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SLACK = 5000;   // (a file written a moment after the turn's last word is still the turn's)
const SID = /^[\w-]{4,80}$/;

/**
 * @param {{ dir: string, now?: () => number, maxBytes?: number, keep?: number }} o
 */
export function createUndo({ dir, now = Date.now, maxBytes = 5e6, keep = 3 }) {
  const turns = new Map();   // session id -> [{ id, prompt, at, end, files: [{ file, existed, kept, big }], undone }] (newest last)
  const last = (sid) => turns.get(sid)?.at(-1) || null;
  const turnDir = (sid, t) => path.join(dir, sid, t.id);

  /** You wrote to the conversation: a new turn. Older turns' copies past `keep` go. */
  function prompt(sid, text = '') {
    if (!SID.test(String(sid))) return;
    const list = turns.get(sid) || [], t = { id: `${now().toString(36)}${list.length}`, prompt: String(text).slice(0, 200), at: now(), end: 0, files: [], undone: 0 };
    list.push(t);
    for (const old of list.splice(0, Math.max(0, list.length - keep))) fsp.rm(turnDir(sid, old), { recursive: true, force: true }).catch(() => {});
    turns.set(sid, list);
  }
  /** Before a file tool writes `file` (synchronous: the copy is made before Claude Code writes). */
  function before(sid, file) {
    const t = last(sid); if (!t || !file || t.undone || t.files.some((x) => x.file === file)) return;
    let st = null; try { st = fs.statSync(file); } catch { /* not there yet: a new file */ }
    if (st && !st.isFile()) return;
    const x = { file, existed: !!st, kept: null, big: false };
    if (st && st.size > maxBytes) x.big = true;
    else if (st) {
      try { fs.mkdirSync(turnDir(sid, t), { recursive: true }); x.kept = path.join(turnDir(sid, t), String(t.files.length + 1)); fs.copyFileSync(file, x.kept); } catch { x.kept = null; x.big = true; }
    }
    t.files.push(x);
  }
  /** The turn ended (Stop). */
  function stop(sid) { const t = last(sid); if (t && !t.end) t.end = now(); }

  /** What undoing the last turn would do, file by file: 'restore', 'delete' (new in that turn), 'same' (already as it
   *  was), 'changedAfter' (changed since the turn ended: left alone), 'big' (too big to have been copied: left alone). */
  async function plan(sid) {
    const t = last(sid); if (!t || !t.files.length) return null;
    const files = [];
    for (const x of t.files) {
      let st = null; try { st = await fsp.stat(x.file); } catch { /* gone */ }
      const later = !!st && t.end && st.mtimeMs > t.end + SLACK;
      if (x.big) { files.push({ file: x.file, action: 'big' }); continue; }
      if (!x.existed) { files.push({ file: x.file, action: !st ? 'same' : later ? 'changedAfter' : 'delete' }); continue; }
      let was = null, cur = null; try { was = await fsp.readFile(x.kept); } catch { files.push({ file: x.file, action: 'big' }); continue; }
      try { cur = await fsp.readFile(x.file); } catch { /* deleted since: put back */ }
      files.push({ file: x.file, action: cur && Buffer.compare(cur, was) === 0 ? 'same' : later ? 'changedAfter' : 'restore' });
    }
    return { prompt: t.prompt, at: t.at, end: t.end, undone: t.undone, files };
  }
  /** Does it (the plan worked out again here), what is there now copied into <turn>/after first. */
  async function apply(sid) {
    const t = last(sid), p = await plan(sid); if (!t || !p || t.undone) return { done: [] };
    const steps = p.files.filter((x) => x.action === 'restore' || x.action === 'delete');
    const after = path.join(turnDir(sid, t), 'after'), done = [];
    if (steps.length) await fsp.mkdir(after, { recursive: true });
    for (const [i, s] of steps.entries()) {
      try { await fsp.copyFile(s.file, path.join(after, `${i + 1}-${path.basename(s.file)}`)); } catch { /* (a file deleted since: nothing to keep) */ }
      try {
        if (s.action === 'delete') await fsp.unlink(s.file);
        else await fsp.writeFile(s.file, await fsp.readFile(t.files.find((x) => x.file === s.file).kept));
        done.push(s);
      } catch { /* left as it was */ }
    }
    if (steps.length) await fsp.writeFile(path.join(after, 'manifest.json'), JSON.stringify({ prompt: t.prompt, at: t.at, files: steps.map((s, i) => ({ file: s.file, was: s.action, kept: `${i + 1}-${path.basename(s.file)}` })) }, null, 2)).catch(() => {});
    t.undone = now();
    return { done, after: steps.length ? after : null };
  }
  /** For the session's pub: how many files the last turn's file tools touched, and whether it was undone. Cheap. */
  const info = (sid) => { const t = last(sid); return t && t.files.length ? { n: t.files.length, at: t.at, done: !!t.end, undone: t.undone } : null; };
  return { prompt, before, stop, plan, apply, info };
}
