// "✨ Viết lại cho rõ" in the group chat's prompt helper (the rest of the helper is in the page: src/shared/prompt-coach.js):
// what you are about to send Claude, rewritten as the goal, the context and when it is done, by Claude Code on this Mac.
// One turn of a small fast model (haiku) with no tools at all, nothing saved as a session, the hooks off (so nobody walks
// into the office for it) and no CLAUDE.md, MCP servers or plugins loaded (safe mode), in an empty folder of the office's
// own, on the account new sessions start on. Text only: photos never go, only how many there are. One at a time, 20 an
// hour, 45 seconds at most.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const MAX_IN = 2000, MAX_OUT = 4000;
const LABELS = { vi: ['Mục tiêu', 'Bối cảnh', 'Xong khi'], en: ['Goal', 'Context', 'Done when'] };

/** The instruction it runs with: the three parts, in the message's own language, nothing added. */
export function rewriteSystem(lang) {
  const [goal, ctx, done] = LABELS[lang] || LABELS.en;
  return [
    'You rewrite a short message that a developer is about to send to an AI coding agent (Claude Code), so the agent gets it right the first time.',
    'Reply with the rewritten message only: no preamble, no comment, no code fence, and never answer or carry out the request yourself.',
    `Write three short parts, each starting on its own line with its label: "${goal}:" what to do, "${ctx}:" what the agent needs to know (where, what it is about), "${done}:" how to tell it is finished.`,
    'If the message has several jobs, list them under the first part as numbered lines, in the order they should be done.',
    'Write in the language of the message, in the sender\'s own voice. Vietnamese typed without diacritics is written back with them.',
    'Keep every requirement, name, number, file, quote and word of feedback. Invent nothing: no new requirements, facts, files or steps.',
    'Where something the agent will need is missing, leave a short question in square brackets in its place, e.g. [which page?].',
    'Keep it short: under 90 words unless the message itself is longer.',
  ].join('\n');
}
// the message itself, between markers (so it is read as the text to rewrite, and a leading "-" is never taken as a flag)
const wrap = (text, photos) => `Rewrite this message:\n<message>\n${text}\n</message>${photos ? `\n(${photos} screenshot${photos > 1 ? 's' : ''} will be attached to it; you cannot see ${photos > 1 ? 'them' : 'it'}.)` : ''}`;
// what comes back: the text, without a fence or quotes round it
export function cleanRewrite(s) {
  let t = String(s || '').trim();
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t); if (fence) t = fence[1].trim();
  if (/^<message>[\s\S]*<\/message>$/.test(t)) t = t.slice(9, -10).trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t.slice(0, MAX_OUT);
}

/** claude() -> { file } | null; env() -> the environment the office's runs start with; dir: an empty folder to run in. */
export function createRewriter({ claude, env, dir, perHour = 20, timeout = 45_000 }) {
  const recent = []; let busy = false;
  /** { text, lang, photos } -> Promise<{ ok, text } | { ok: false, code, detail? }> */
  async function rewrite({ text, lang = 'en', photos = 0 }) {
    text = String(text || '').trim().slice(0, MAX_IN);
    if (!text) return { ok: false, code: 'empty' };
    if (busy) return { ok: false, code: 'busy' };
    const now = Date.now(); while (recent.length && now - recent[0] > 3600e3) recent.shift();
    if (recent.length >= perHour) return { ok: false, code: 'tooMany' };
    const bin = claude(); if (!bin) return { ok: false, code: 'noClaude' };
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* the data folder is read-only: it runs where it can */ }
    const n = Math.max(0, Math.min(4, Number(photos) || 0)), l = LABELS[lang] ? lang : 'en';
    const args = ['-p', wrap(text, n), '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--max-turns', '1', '--output-format', 'json',
      '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--system-prompt', rewriteSystem(l)];
    // (safe mode, and the env switches for CLAUDE.md and auto memory: an older Claude Code ignores the ones it doesn't know)
    const e = { ...env(), CLAUDE_CODE_SAFE_MODE: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
    for (const k of Object.keys(e)) if (e[k] == null) delete e[k];
    busy = true; recent.push(now);
    try {
      return await new Promise((resolve) => {
        let out = '', err = '', done = false, proc, timer = 0;
        const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
        try { proc = spawn(bin.file, args, { cwd: fs.existsSync(dir) ? dir : undefined, env: e, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true }); }
        catch { finish({ ok: false, code: 'noClaude' }); return; }
        timer = setTimeout(() => {
          try { if (process.platform === 'win32') proc.kill(); else process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill(); } catch { /* gone */ } }
          finish({ ok: false, code: 'timeout' });
        }, timeout);
        proc.stdout.on('data', (c) => { if (out.length < 1e6) out += c; });
        proc.stderr.on('data', (c) => { err = String(c).trim().split('\n').pop().slice(0, 200); });
        proc.on('error', () => finish({ ok: false, code: 'noClaude' }));
        // 'close', not 'exit': a process can be gone before the last of what it printed has been read (its answer). It
        // runs with no tools, so nothing it starts holds the pipe open after it; the timeout covers the rest
        proc.on('close', (code) => {
          // its one JSON answer (the last line that is one, should anything be printed before it)
          let j = null;
          for (const line of [out.trim(), ...out.trim().split('\n').reverse()]) { try { j = JSON.parse(line); break; } catch { /* not it */ } }
          const said = cleanRewrite(j?.result);
          if (j && !j.is_error && j.subtype === 'success' && said) finish({ ok: true, text: said });
          else finish({ ok: false, code: 'failed', detail: String((j?.is_error && j.result) || err || (code ? `exit ${code}` : '')).slice(0, 200) });
        });
      });
    } finally { busy = false; }
  }
  return { rewrite };
}
