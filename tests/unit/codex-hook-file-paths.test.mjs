import test from 'node:test';
import assert from 'node:assert/strict';
import { filePaths } from '../../plugins/my-office-codex-hooks/hooks/file-paths.mjs';

test('extracts apply_patch file headers only, including multiple files', () => {
  const event = { tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-secret contents\n*** Add File: tmp/b.txt\n*** End Patch' } };
  assert.deepEqual(filePaths(event, 'D:/repo'), ['src/a.js', 'tmp/b.txt']);
});

test('extracts explicit MCP path fields and rejects outside-root and traversal paths', () => {
  const event = { tool_name: 'mcp__fs__edit_file', tool_input: { file_path: 'src/a.js', paths: ['src/a.js', '../secret.txt', 'D:/other/file.txt'] } };
  assert.deepEqual(filePaths(event, 'D:/repo'), ['src/a.js']);
});

test('missing path and unsupported arbitrary command never produce inferred files', () => {
  assert.deepEqual(filePaths({ tool_name: 'Bash', tool_input: { command: 'edit src/private.txt' } }, 'D:/repo'), []);
  assert.deepEqual(filePaths({ tool_name: 'mcp__fs__read_file', tool_input: {} }, 'D:/repo'), []);
});
