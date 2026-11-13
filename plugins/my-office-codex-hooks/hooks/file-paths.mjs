import path from 'node:path';

export function filePaths(event, cwd) {
  if (!cwd || !event.tool_input || typeof event.tool_input !== 'object') return [];
  const name = String(event.tool_name || '');
  let candidates = [];
  if (name === 'apply_patch' && typeof event.tool_input.command === 'string') {
    candidates = [...event.tool_input.command.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
  } else if (/^mcp__.+__(?:read_file|edit_file|write_file|create_file|delete_file)$/i.test(name)) {
    for (const key of ['file_path', 'path']) if (typeof event.tool_input[key] === 'string') candidates.push(event.tool_input[key]);
    for (const key of ['file_paths', 'paths']) if (Array.isArray(event.tool_input[key])) candidates.push(...event.tool_input[key].filter((p) => typeof p === 'string'));
  }
  const root = path.resolve(cwd);
  return [...new Set(candidates.map((p) => {
    const rel = path.relative(root, path.resolve(root, p));
    return !rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/');
  }).filter(Boolean))].slice(0, 50);
}
