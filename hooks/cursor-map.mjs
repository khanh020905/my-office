// Cursor agent hooks → the office's Claude Code event shape. Pure: no I/O, so the tests can feed it payloads.
// Cursor names are camelCase and a few fields differ (docs: cursor.com/docs/hooks). Unknown events are ignored.

const EVENT = {
  sessionStart: 'SessionStart',
  sessionEnd: 'SessionEnd',
  beforeSubmitPrompt: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  postToolUseFailure: 'PostToolUseFailure',
  subagentStart: 'SubagentStart',
  subagentStop: 'SubagentStop',
  stop: 'Stop',
  preCompact: 'PreCompact',
};

const TOOL = { Shell: 'Bash', StrReplace: 'Edit' };

const modelOf = (v) => {
  const s = String(v || '').trim();
  return s && s.toLowerCase() !== 'default' ? s : '';
};

const toolName = (name) => {
  const s = String(name || '');
  if (s.startsWith('MCP:')) return `mcp__${s.slice(4).replace(/:/g, '__')}`;
  return TOOL[s] || s;
};

/** @param {object} p Cursor's stdin JSON. @returns {object|null} a body for POST /event, or null when it isn't a session event. */
export function mapCursor(p) {
  if (!p || typeof p !== 'object') return null;
  let hook = EVENT[p.hook_event_name];
  if (!hook) return null;
  const sub = p.hook_event_name === 'subagentStart' || p.hook_event_name === 'subagentStop';
  const session_id = String((sub && p.parent_conversation_id) || p.session_id || p.conversation_id || '').trim();
  if (!session_id) return null;
  if (hook === 'Stop' && p.status === 'error') hook = 'StopFailure';

  const cwd = typeof p.cwd === 'string' && p.cwd ? p.cwd : (Array.isArray(p.workspace_roots) ? String(p.workspace_roots[0] || '') : '');
  const out = { hook_event_name: hook, session_id, cwd, agent: 'cursor' };
  if (p.transcript_path) out.transcript_path = p.transcript_path;
  const model = modelOf(p.model_id || p.model);
  if (model && !sub) out.model = model;

  if (p.prompt != null) out.prompt = p.prompt;
  if (hook === 'SessionStart') out.source = p.composer_mode || 'cursor';
  if (hook === 'SessionEnd' && p.reason) out.reason = p.reason;
  if (hook === 'PreCompact' && p.trigger) out.trigger = p.trigger;
  if (hook === 'StopFailure') out.error = String(p.error_message || p.status || 'error');

  if (sub) {
    const id = p.subagent_id || p.agent_id;
    if (id) out.agent_id = String(id);
    if (p.subagent_type) out.agent_type = String(p.subagent_type);
    if (p.task) out.task = String(p.task);
    const subModel = modelOf(p.subagent_model);
    if (subModel) out.subagent_model = subModel;
  }

  if (p.tool_name) {
    out.tool_name = toolName(p.tool_name);
    const input = p.tool_input && typeof p.tool_input === 'object' ? { ...p.tool_input } : {};
    if (input.path && !input.file_path) input.file_path = input.path;
    out.tool_input = input;
  }
  if (p.tool_output != null) {
    let resp = p.tool_output;
    if (typeof resp === 'string') { try { resp = JSON.parse(resp); } catch { /* keep the text */ } }
    out.tool_response = resp;
  }
  if (p.error_message && hook !== 'StopFailure') out.error = String(p.error_message);
  if (p.is_interrupt != null) out.is_interrupt = p.is_interrupt;
  return out;
}
