// "Chen lời giữa chừng": a note from the chat or a phone into a Claude Code session while it works ("sửa luôn test",
// "sai file rồi, dừng"), instead of waiting for it to finish. It goes through the session's own inbox socket, the one
// Claude Code documents for "a script or hook to post into a session" (code.claude.com/docs/en/cross-session-messaging):
// a working session reads it between two tool calls, a resting one starts a turn with it. Its path is in the session's
// file (messagingSocketPath) or, for the runs the office starts, told by their SessionStart hook ($CLAUDE_CODE_MESSAGING_
// SOCKET). Claude Code hands it to Claude as a message from another session, never as your approval for anything.
// Where it can't go (an older Claude Code, a session that skips permission prompts and so holds such messages, settings
// that hold or refuse them) the office says so and sends it as an ordinary message once the session is done.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

/** The one line the socket takes. Its shape isn't in the docs yet (anthropics/claude-code#103048, which shows this one);
    checked by hand on Claude Code 2.1.316: queued, then given to Claude as "Another Claude session sent a message". */
export const steerLine = (text) => `${JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } })}\n`;

/** crossSessionInbound from settings files ({ accept | hold | refuse } each, or nothing): the strictest one found, as a
    project's stricter value wins over the user's (null: none set) */
export function inboundOf(values) {
  const v = values.filter((x) => ['accept', 'hold', 'refuse'].includes(x));
  return v.includes('refuse') ? 'refuse' : v.includes('hold') ? 'hold' : v.includes('accept') ? 'accept' : null;
}
/** The settings files that may set it for a session: yours (its account's folder) and its project's own two */
export function inboundFrom({ configDir, cwd }) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8'))?.crossSessionInbound; } catch { return undefined; } };
  return inboundOf([configDir && read(path.join(configDir, 'settings.json')), ...(cwd ? ['settings.json', 'settings.local.json'].map((f) => read(path.join(cwd, '.claude', f))) : [])]);
}

/** Can a note reach it now? { ok } or { ok: false, why: 'noInbox' | 'bypass' | 'refuse' | 'hold' }. A session that skips
    permission prompts holds a message from another session for your approval (unless its settings accept them), so a
    note from here would just wait there. */
export function steerable({ inbox, mode = '', inbound = null, isSocket = () => true }) {
  if (!inbox || !isSocket(inbox)) return { ok: false, why: 'noInbox' };
  if (inbound === 'refuse' || inbound === 'hold') return { ok: false, why: inbound };
  if (mode === 'bypassPermissions' && inbound !== 'accept') return { ok: false, why: 'bypass' };
  return { ok: true };
}
/** A Unix socket there (on Windows a named pipe, which can't be looked at this way) */
export const isSocket = (p) => process.platform === 'win32' ? /^\\\\[.?]\\pipe\\/.test(p) : (() => { try { return fs.statSync(p).isSocket(); } catch { return false; } })();

/** Writes the note into the session's inbox: true once written and closed (the socket answers nothing, so that is all
    there is to know), false if it couldn't be. */
export function deliver(inbox, text, { timeout = 3000 } = {}) {
  return new Promise((resolve) => {
    let done = false; const end = (ok) => { if (!done) { done = true; clearTimeout(t); try { sock.destroy(); } catch { /* gone */ } resolve(ok); } };
    const sock = net.createConnection(inbox, () => sock.end(steerLine(text), () => end(true)));
    const t = setTimeout(() => end(false), timeout);
    sock.on('error', () => end(false));
  });
}
