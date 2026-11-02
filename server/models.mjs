// "Model: người điều phối và subagent" (Settings → More): the model a session runs on (the coordinator: "model" in
// ~/.claude/settings.json) and the one its subagents run on (env CLAUDE_CODE_SUBAGENT_MODEL: the ones Claude doesn't
// pick a model for; with CLAUDE_CODE_SUBAGENT_MODEL_FORCE, every one), and a short note in ~/.claude/CLAUDE.md that asks
// Claude to hand the independent parts of a big task to subagents. Claude Code reads all of it as a session starts: the
// sessions open now keep what they started with. The other accounts share both files by a link.

export const MAIN = ['opus', 'sonnet', ''];          // ('' = Claude Code's own default)
export const SUB = ['', 'sonnet', 'haiku', 'opus'];  // ('' = the same as the main session)
const SUB_KEY = 'CLAUDE_CODE_SUBAGENT_MODEL', FORCE_KEY = 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE';

/** What settings.json says now: { main, sub, force } (a model the office doesn't offer is shown as it is). */
export function modelsOf(settings) {
  const env = settings?.env || {}, sub = String(env[SUB_KEY] || '');
  return { main: String(settings?.model || ''), sub: sub === 'inherit' ? '' : sub, force: !!sub && sub !== 'inherit' && /^(1|true)$/i.test(String(env[FORCE_KEY] || '')) };
}
/** settings.json with these set (what isn't given stays); the rest of the file as it was. */
export function withModels(settings, { main, sub, force } = {}) {
  const out = { ...(settings || {}) }, env = { ...(out.env || {}) };
  if (main !== undefined) { if (main) out.model = main; else delete out.model; }
  if (sub !== undefined) { if (sub) env[SUB_KEY] = sub; else delete env[SUB_KEY]; }
  if (force !== undefined || sub !== undefined) { if ((force ?? modelsOf(settings).force) && env[SUB_KEY]) env[FORCE_KEY] = '1'; else delete env[FORCE_KEY]; }
  if (Object.keys(env).length) out.env = env; else delete out.env;
  return out;
}

// the note, between two markers of the office's own: taken out again exactly as it went in
const OPEN = '<!-- my-office:subagents -->', CLOSE = '<!-- /my-office:subagents -->';
const BLOCK = new RegExp(`\\n*${OPEN}[\\s\\S]*?${CLOSE}\\n?`);
export const hasSplit = (md) => String(md || '').includes(OPEN);
/** CLAUDE.md with the note (on) or without it (off); what else is in it stays as it was. */
export function withSplit(md, on, note) {
  const rest = String(md || '').replace(BLOCK, '\n').replace(/\n{3,}$/, '\n\n').replace(/^\n+$/, '');
  if (!on) return rest.trim() ? `${rest.replace(/\n+$/, '')}\n` : '';
  return `${rest.trim() ? `${rest.replace(/\n+$/, '')}\n\n` : ''}${OPEN}\n${String(note).trim()}\n${CLOSE}\n`;
}
