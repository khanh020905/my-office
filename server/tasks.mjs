// "Giao việc": giving Claude work from the office, on a phone too. A Claude Code run on this Mac with your words and your
// photos, either carrying on from a conversation you tag (its whole context, as a new branch of it: --resume <its id>
// --fork-session, so the conversation open in your editor is left exactly as it is) or as a new conversation in a
// project folder the office knows (one a session has worked in: never a path typed on a phone). It runs as `claude -p`
// on the account the office picked; its tool calls ask for approval through the office's own hooks like any session's,
// and when it's done what it says goes to the group chat (onDone). Photos are kept in data/task-images for it to read.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_TEXT = 4000, MAX_IMAGES = 4, MAX_IMAGE = 3_500_000;

/** claude() -> { file } | null; env() -> the environment to run with; onStart(task), onStep(task, { name, input }) (a tool
    it uses, as it goes), onDone(task) for the office. */
export function createTasks({ dataDir, claude, env, onStart, onStep, onDone, max = 3, perHour = 12 }) {
  const running = new Map(), recent = [];   // id -> task; when the last ones started (the hourly cap)
  const imgDir = path.join(dataDir, 'task-images');
  const pub = (t) => ({ id: t.id, dir: t.dir, text: t.text.slice(0, 200), at: t.at, from: t.from || null, sid: t.sid || null });
  /** { dir, text, images: [data URLs], from: { sid, name, fork } | null } -> { ok, task } or { ok: false, code } */
  function start({ dir, text, images = [], from = null, env: extra = null, system = '' }) {
    text = String(text || '').trim().slice(0, MAX_TEXT);
    if (!text) return { ok: false, code: 'empty' };
    if (running.size >= max) return { ok: false, code: 'busy' };
    const now = Date.now(); while (recent.length && now - recent[0] > 3600e3) recent.shift();
    if (recent.length >= perHour) return { ok: false, code: 'tooMany' };
    const bin = claude(); if (!bin) return { ok: false, code: 'noClaude' };
    if (!dir || !fs.existsSync(dir)) return { ok: false, code: 'noDir' };
    const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, files = [];
    for (const [i, d] of images.slice(0, MAX_IMAGES).entries()) {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ''));
      if (!m || d.length > MAX_IMAGE) continue;
      fs.mkdirSync(imgDir, { recursive: true });
      const f = path.join(imgDir, `${id}-${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      fs.writeFileSync(f, Buffer.from(m[2], 'base64'), { mode: 0o600 }); files.push(f);
    }
    // the photos by their paths: Claude Code reads them with its Read tool
    const prompt = files.length ? `${text}\n\n${files.length > 1 ? 'Attached images' : 'Attached image'} (read ${files.length > 1 ? 'them' : 'it'}):\n${files.join('\n')}` : text;
    // (from.fork false: carry on that very conversation, one this office started for you, instead of a branch of it)
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...(from?.sid ? ['--resume', from.sid, ...(from.fork === false ? [] : ['--fork-session'])] : []), ...(system ? ['--append-system-prompt', system] : [])];   // (system: a word from the office, outside the conversation)
    let proc;
    const e = { ...env(), ...extra }; for (const k of Object.keys(e)) if (e[k] == null) delete e[k];   // (extra: the conversation's own account; null unsets)
    try { proc = spawn(bin.file, args, { cwd: dir, env: e, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true }); }
    catch { return { ok: false, code: 'noClaude' }; }
    const t = { id, pid: proc.pid, proc, dir, text, at: now, from, sid: null, result: '', error: '', buf: '' };
    running.set(id, t); recent.push(now);
    // its stream: the new session's id (init) and its last words (result)
    proc.stdout.on('data', (c) => {
      t.buf += String(c);
      let nl;
      while ((nl = t.buf.indexOf('\n')) >= 0) {
        const line = t.buf.slice(0, nl); t.buf = t.buf.slice(nl + 1);
        try {
          const j = JSON.parse(line);
          if (j.type === 'system' && j.subtype === 'init' && j.session_id) t.sid = j.session_id;
          if (j.type === 'assistant' && !j.parent_tool_use_id) for (const c of j.message?.content || []) if (c?.type === 'tool_use') onStep?.(t, { name: c.name, input: c.input || {} });
          if (j.type === 'result') { t.result = String(j.result || ''); if (j.is_error) t.error = t.result || j.subtype || 'error'; }
        } catch { /* not a line of its stream */ }
      }
      if (t.buf.length > 1e6) t.buf = '';
    });
    proc.stderr.on('data', (c) => { t.error = String(c).trim().split('\n').pop().slice(0, 300); });
    proc.on('error', (e) => { t.error = String(e.message || e).slice(0, 300); });
    proc.on('exit', (code) => {
      running.delete(id);
      if (code && !t.error) t.error = `exit ${code}`;
      onDone?.(t);
    });
    onStart?.(t);
    return { ok: true, task: pub(t) };
  }
  /** Stops a task (its whole process group: the commands it started too). */
  function stop(id) {
    const t = running.get(id); if (!t) return false;
    try { if (process.platform === 'win32') t.proc.kill(); else process.kill(-t.pid, 'SIGTERM'); } catch { try { t.proc.kill(); } catch { /* gone */ } }
    return true;
  }
  return { start, stop, list: () => [...running.values()].map(pub) };
}
