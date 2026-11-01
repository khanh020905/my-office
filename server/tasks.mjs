// "Giao việc": giving Claude work from the office, on a phone too. A Claude Code run on this Mac with your words and your
// photos, either carrying on from a conversation you tag (its whole context, as a new branch of it: --resume <its id>
// --fork-session, so the conversation open in your editor is left exactly as it is) or as a new conversation in a
// project folder the office knows (one a session has worked in: never a path typed on a phone). It runs as `claude -p`
// on the account the office picked; its tool calls ask for approval through the office's own hooks like any session's,
// and when it's done what it says goes to the group chat (onDone). Photos are kept in data/task-images for it to read.
// With "phone work as background sessions" on (bg.want()), it is a Claude Code background session instead
// (server/bg-sessions.mjs): the office learns its steps and its answer from its hooks (step(), settle()), sees how it is
// doing with `claude agents --json`, and you can open it on the Mac with `claude attach <id>`. A Claude Code without
// them, or a folder it won't start one in, runs it as `claude -p` as before (onBg(task, 'fallback', why)).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bgPhase, bgRefusal, parseBackgrounded } from './bg-sessions.mjs';

const MAX_TEXT = 4000, MAX_IMAGES = 4, MAX_IMAGE = 3_500_000;
const WATCH_MS = 8000;   // how often background sessions are looked at while one runs (`claude agents`, one per account)

/** claude() -> { file } | null; env() -> the environment to run with; onStart(task), onStep(task, { name, input }) (a tool
    it uses, as it goes), onDone(task) for the office. bg: { want(), settings(), probe, list, stop, run } (createBg with
    the office's switch and settings) or null; onBg(task, what, detail): 'started' | 'fallback' (why) | a phase it moved to
    ('work' | 'wait', what it waits for). printSettings(task): the `--settings` a `-p` run gets (the office told which
    session it is and where its inbox is: server/steer.mjs), or nothing. */
export function createTasks({ dataDir, claude, env, onStart, onStep, onDone, onBg, bg = null, printSettings = null, max = 3, perHour = 12, watchMs = WATCH_MS }) {
  const running = new Map(), recent = [];   // id -> task; when the last ones started (the hourly cap)
  const binds = new Map();   // a background session's short id -> { sid, inbox }, told before its task knew the short id
  const imgDir = path.join(dataDir, 'task-images');
  const pub = (t) => ({ id: t.id, dir: t.dir, text: t.text.slice(0, 200), at: t.at, from: t.from || null, sid: t.sid || null, mode: t.mode, job: t.job || null });
  /** { dir, text, images: [data URLs], from: { sid, name, fork } | null } -> { ok, task } or { ok: false, code } */
  function start({ dir, text, images = [], from = null, env: extra = null, system = '', stopAfter = false }) {
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
    const e = { ...env(), ...extra }; for (const k of Object.keys(e)) if (e[k] == null) delete e[k];   // (extra: the conversation's own account; null unsets)
    // (stopAfter: a conversation taken from your editor, stopped once done so the editor takes it up again alone)
    const t = { id, dir, text, at: now, from, sid: null, result: '', error: '', buf: '', bin, env: e, prompt, system, stopAfter, mode: bg?.want() ? 'bg' : 'print' };
    if (t.mode === 'print' && !runPrint(t)) return { ok: false, code: 'noClaude' };
    running.set(id, t); recent.push(now);
    if (t.mode === 'bg') startBg(t);
    onStart?.(t);
    return { ok: true, task: pub(t) };
  }
  // `claude -p`, its stream on stdout: the new session's id (init), the tools it uses, its last words (result)
  function runPrint(t) {
    const { from, system } = t;
    // (from.fork false: carry on that very conversation, one this office started for you, instead of a branch of it)
    const set = printSettings?.(t);
    const args = ['-p', t.prompt, '--output-format', 'stream-json', '--verbose', ...(from?.sid ? ['--resume', from.sid, ...(from.fork === false ? [] : ['--fork-session'])] : []), ...(system ? ['--append-system-prompt', system] : []), ...(set ? ['--settings', set] : [])];   // (system: a word from the office, outside the conversation)
    let proc;
    try { proc = spawn(t.bin.file, args, { cwd: t.dir, env: t.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true }); }
    catch { return false; }
    Object.assign(t, { mode: 'print', proc, pid: proc.pid });
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
    // a process can be gone before the last of what it printed has been read (the result line: the answer itself), so
    // its output is read to the end first; 2 s at most, as something it started may keep the pipe open after it
    proc.on('exit', (code) => {
      let once = false;
      const done = () => {
        if (once) return; once = true;
        running.delete(t.id);
        if (code && !t.error) t.error = `exit ${code}`;
        onDone?.(t);
      };
      if (proc.stdout.readableEnded) done();
      else { proc.stdout.once('end', done); setTimeout(done, 2000); }
    });
    return true;
  }
  // a background session: carrying on one that is one already (stopped first if it runs, then woken with the options it
  // keeps), or a new one / any other conversation with the office's settings; `claude -p` when it can't be
  async function startBg(t) {
    const fall = (why) => { t.mode = 'print'; onBg?.(t, 'fallback', why); if (t.stopped) end(t); else if (!runPrint(t)) { t.error = 'claude'; end(t); } };
    const probe = await bg.probe(t.bin).catch(() => null);
    if (!probe?.ok) { fall('old'); return; }
    if (t.stopped) { end(t); return; }
    let keeps = false;
    if (t.from?.sid) {
      const row = (await bg.list(t.bin.file, t.env).catch(() => [])).find((r) => r.sessionId === t.from.sid);
      // (resting: stopped first, or a second one would be a copy; at work, someone on the Mac: never stopped, a copy it is)
      if (row?.id) { keeps = true; if (row.pid && row.state !== 'working' && row.status !== 'busy') await bg.stop(t.bin.file, row.id, t.env).catch(() => false); }
    }
    const args = ['--bg', ...(t.from?.sid ? ['--resume', t.from.sid] : []),
      ...(keeps ? [] : ['--settings', bg.settings(), ...(t.system ? ['--append-system-prompt', t.system] : [])]), '--', t.prompt];   // (--: words that start with "-" stay words)
    const r = await bg.run(t.bin.file, args, { cwd: t.dir, env: t.env, timeout: 150_000 });   // (a first start of its service may take a while)
    const got = r.code === 0 && parseBackgrounded(r.out);
    if (!got) { fall(bgRefusal(`${r.out}\n${r.err}`)); return; }
    t.job = got.id; t.copy = got.copy;
    const told = binds.get(t.job); if (told) { t.sid = told.sid; t.inbox = told.inbox || t.inbox; t.hooked = true; binds.delete(t.job); }
    onBg?.(t, 'started');
    if (t.stopped) { await bg.stop(t.bin.file, t.job, t.env).catch(() => false); end(t); return; }
    watch();
  }
  // background sessions, looked at while one runs: its session id, waiting for you, done, failed or stopped on the Mac
  let watchT = null, looking = false;
  function watch() { if (!watchT) watchT = setInterval(look, watchMs); watchT.unref?.(); }
  async function look() {
    const mine = [...running.values()].filter((t) => t.mode === 'bg' && t.job);
    if (!mine.length) { clearInterval(watchT); watchT = null; return; }
    if (looking) return; looking = true;
    try {
      const byAcct = new Map(); for (const t of mine) { const k = t.env.CLAUDE_CONFIG_DIR || ''; if (!byAcct.has(k)) byAcct.set(k, []); byAcct.get(k).push(t); }
      for (const list of byAcct.values()) {
        const rows = await bg.list(list[0].bin.file, list[0].env).catch(() => null); if (!rows) continue;
        for (const t of list) {
          if (t.ended) continue;
          const row = rows.find((x) => x.id === t.job);
          if (row?.sessionId && !t.sid) t.sid = row.sessionId;
          const { phase, wait } = bgPhase(row), now = Date.now();
          if (phase === 'gone') { if (now - t.at > 60e3) { t.error ||= 'gone'; end(t); } continue; }
          // (done: the Stop hook has said so already; this is for one the office missed, so not in the turn's first moments)
          if (phase === 'done') { if (now - t.at > 20e3) end(t); continue; }
          if (phase === 'fail') { t.error ||= 'failed'; end(t); continue; }
          if (phase === 'stopped') { t.stopped = true; end(t); continue; }
          if (phase !== t.phase || wait !== t.wait) { t.phase = phase; t.wait = wait; onBg?.(t, phase, wait); }
        }
      }
    } finally { looking = false; }
  }
  function end(t) {
    if (t.ended) return; t.ended = true;
    running.delete(t.id);
    if (t.mode === 'bg' && t.job && t.stopAfter && !t.stopped) bg.stop(t.bin.file, t.job, t.env).catch(() => false);
    onDone?.(t);
  }
  /** A session the office started told it which it is (its SessionStart hook): a background one by its short id, a `-p`
      run by its task's id; its session id, and its inbox (where a note can reach it while it works). */
  function bind({ job = '', task = '', sid = '', inbox = '' } = {}) {
    if (!sid || (!job && !task)) return;
    const t = task ? running.get(task) : [...running.values()].find((x) => x.job === job);
    if (t) { t.sid ||= sid; if (inbox) t.inbox = inbox; if (job) t.hooked = true; return; }   // (hooked: the office's settings are in that session, its long-waiting hooks too)
    if (!job) return;
    binds.set(job, { sid, inbox, at: Date.now() });   // (its task learns its short id a moment later)
    for (const [k, v] of binds) if (binds.size > 20 || Date.now() - v.at > 120e3) binds.delete(k);
  }
  /** Its turn is over (the session's Stop / StopFailure hook): what it said, or what went wrong. */
  function settle(id, { result = '', error = '' } = {}) {
    const t = running.get(id); if (!t || t.mode !== 'bg') return false;
    t.result = String(result || ''); if (error) t.error = String(error).slice(0, 300);
    end(t); return true;
  }
  /** Stops a task: a `-p` run's whole process group (the commands it started too); a background session with `claude
      stop` (its conversation is kept). */
  function stop(id) {
    const t = running.get(id); if (!t) return false;
    t.stopped = true;   // (on purpose: its card says stopped, not failed)
    if (t.mode === 'bg') { if (t.job) bg.stop(t.bin.file, t.job, t.env).catch(() => false).then(() => end(t)); return true; }   // (not started yet: stopped as it starts)
    try { if (process.platform === 'win32') t.proc.kill(); else process.kill(-t.pid, 'SIGTERM'); } catch { try { t.proc.kill(); } catch { /* gone */ } }
    return true;
  }
  return { start, stop, bind, settle, list: () => [...running.values()].map(pub),
    /** the running task a session is (or carries on), as it is kept: null when none */
    of: (sid) => (sid && [...running.values()].find((t) => t.sid === sid || t.from?.sid === sid)) || null,
    /** a running task by its id, or by the conversation it carries on in the office's chat (from.orig) */
    get: (id) => running.get(id) || null,
    byKey: (key) => (key && [...running.values()].find((t) => t.from?.orig === key)) || null };
}
