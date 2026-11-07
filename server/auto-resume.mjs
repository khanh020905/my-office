// Going on by itself after an account switch: when the office has moved an editor's conversation off an account that
// ran out (moveNow in server/index.mjs: its Claude Code closed, the new account pinned for it), Claude Code is started
// once in the background on the new account with `claude --resume <id> -p "<go on>"`, so the turn the limit cut off is
// finished without anyone typing "continue". Only while the conversation is still waiting to be opened again (its pin
// is there: nobody has typed in the editor yet), at most a few times in a while per conversation, and only when on
// (prefs autoResume, on unless turned off). What it does shows in the office like any session; a tool call that needs
// approval is held for you there, as always.
import fs from 'node:fs';
import path from 'node:path';

const SID_RE = /^[0-9a-f-]{36}$/i;

/** { resumeSession(s, to) -> { ok, reason? }, history } */
export function createAutoResume({ findClaude, dirOfSlug, prefs, pinDir, spawn, prompt = () => 'Continue the work in progress.',
  delayMs = 1500, maxAttempts = 3, windowMs = 10 * 60e3, log = () => {} }) {
  const history = new Map();   // conversation id -> { count, firstAt }: no loop of resumes that keep running out

  function resumeSession(s, to) {
    if (prefs?.get('autoResume') === false) return { ok: false, reason: 'disabled' };
    if (!s?.sid || !SID_RE.test(s.sid)) return { ok: false, reason: 'badSid' };
    const now = Date.now(), h = history.get(s.sid) || { count: 0, firstAt: now };
    if (now - h.firstAt > windowMs) { h.count = 0; h.firstAt = now; }
    h.count++; history.set(s.sid, h);
    if (h.count > maxAttempts) {
      log(`${new Date().toISOString()} auto-resume ${s.name || s.sid} skipped: ${h.count} times within ${Math.round(windowMs / 60e3)} min\n`);
      return { ok: false, reason: 'rateLimited', attempts: h.count };
    }
    const bin = findClaude?.();
    if (!bin) return { ok: false, reason: 'noClaude' };
    const timer = setTimeout(() => {
      // (opened again from the editor meanwhile: its own Claude Code goes on there, not a second one beside it)
      if (pinDir && !fs.existsSync(path.join(pinDir, s.sid))) return;
      const dir = dirOfSlug?.(to), env = { ...process.env };
      if (dir) env.CLAUDE_CONFIG_DIR = dir; else delete env.CLAUDE_CONFIG_DIR;
      try {
        const child = spawn(bin.file || bin, ['--resume', s.sid, '-p', prompt()], { cwd: s.cwd && fs.existsSync(s.cwd) ? s.cwd : process.cwd(), env, stdio: 'ignore', detached: true });
        child.unref?.();
        log(`${new Date().toISOString()} auto-resume ${s.name || s.sid} on ${to || 'main'} (pid ${child.pid})\n`);
      } catch (e) { log(`${new Date().toISOString()} auto-resume ${s.name || s.sid} failed: ${String(e?.message || e).slice(0, 120)}\n`); }
    }, delayMs);
    timer.unref?.();
    return { ok: true, to, sid: s.sid };
  }
  return { resumeSession, history };
}
