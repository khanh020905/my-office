import path from 'node:path';

const EVENTS = new Set(['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Stop', 'Interrupt']);

export function normalizeProjectFilePaths(cwd, paths) {
  if (typeof cwd !== 'string' || !cwd || !Array.isArray(paths)) return [];
  const root = path.resolve(cwd);
  return [...new Set(paths.filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 2048).map((p) => {
    const full = path.resolve(root, p);
    const rel = path.relative(root, full);
    return !rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/');
  }).filter(Boolean))].slice(0, 50);
}

export function codexToolType(tool) {
  if (typeof tool !== 'string') return 'other';
  if (tool === 'Bash') return 'bash';
  if (tool === 'apply_patch') return 'edit';
  const mcpTool = /^mcp__.+__(read_file|write_file|edit_file|apply_patch)$/i.exec(tool);
  if (mcpTool) return /^(read_file)$/i.test(mcpTool[1]) ? 'read' : 'edit';
  const fileAction = /^mcp__.+__(create_file|delete_file)$/i.exec(tool);
  if (fileAction) return fileAction[1].toLowerCase().replace('_file', '');
  return 'other';
}

export function createCodexEventDeduper(max = 5000, initial = []) {
  const seen = new Set(Array.isArray(initial) ? initial.filter((id) => typeof id === 'string').slice(-max) : []);
  const duplicate = (sessionId, eventId) => {
    if (!eventId) return false;
    const id = `${sessionId}:${eventId}`;
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > max) seen.delete(seen.values().next().value);
    return false;
  };
  duplicate.ids = () => [...seen];
  return duplicate;
}

// Codex hook payloads can contain tool inputs, output, transcript paths, or other private data.
// Keep only the fields the office needs to represent the App session and its activity.
export function normalizeCodexAppHook(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const provider = raw.provider ?? 'codex-app';
  if (!['codex-app', 'codex-cli'].includes(provider)) return null;
  const event = raw.hook_event_name;
  if (!EVENTS.has(event) || typeof raw.session_id !== 'string' || !raw.session_id.trim()) return null;
  return {
    provider,
    event,
    sessionId: raw.session_id.slice(0, 200),
    turnId: typeof raw.turn_id === 'string' ? raw.turn_id.slice(0, 200) : '',
    cwd: typeof raw.cwd === 'string' ? raw.cwd.slice(0, 2048) : '',
    model: typeof raw.model === 'string' ? raw.model.slice(0, 120) : '',
    prompt: '',
    tool: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'].includes(event) && typeof raw.tool_name === 'string' ? raw.tool_name.slice(0, 100) : '',
    toolUseId: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'].includes(event) && typeof raw.tool_use_id === 'string' ? raw.tool_use_id.slice(0, 200) : '',
    filePaths: ['PreToolUse', 'PostToolUse'].includes(event) ? normalizeProjectFilePaths(typeof raw.cwd === 'string' ? raw.cwd : '', raw.file_paths) : [],
    reason: event === 'SessionEnd' && typeof raw.reason === 'string' ? raw.reason.slice(0, 100) : '',
  };
}
