import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createQaRunner, projectQa } from '../../server/production/qa.mjs';

const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const fakeSpawn = (calls) => (cmd, argv, opts) => {
  calls.push({ cmd, argv, opts });
  const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
  calls.child = c; return c;
};

test('qa: runs video_qa.py with a fixed argv on the project render; refuses the rest', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'vqa-'));
  try {
    const calls = [], r = createQaRunner({ spawn: fakeSpawn(calls), python: 'py' });
    assert.equal(r.start('', 'x').error, 'workspace_not_configured');
    assert.equal(r.start(ws, 'PROJECTS/p').error, 'qa_tool_missing');
    put(path.join(ws, 'tools', 'video_qa.py'));
    assert.equal(r.start(ws, '../etc').error, 'unknown_project');
    put(path.join(ws, 'PROJECTS', 'p', 'config.json'), '{}');
    assert.equal(r.start(ws, 'PROJECTS/p').error, 'no_render');
    put(path.join(ws, 'PROJECTS', 'p', 'out', 'P.mp4'));
    const s = r.start(ws, 'PROJECTS/p');
    assert.equal(s.ok, true); assert.equal(s.run.state, 'running');
    assert.equal(calls[0].cmd, 'py'); assert.equal(calls[0].opts.shell, false);
    assert.deepEqual(calls[0].argv, ['-3.14', path.join(ws, 'tools', 'video_qa.py'), path.join(ws, 'PROJECTS', 'p', 'out', 'P.mp4')]);
    assert.equal(r.start(ws, 'PROJECTS/p').error, 'busy');
    calls.child.stderr.emit('data', 'progress'); calls.child.emit('close', 0);
    assert.equal(r.status().state, 'done'); assert.equal(r.status().tail, 'progress');
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});

test('qa: findings come from the report without evidence paths', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'vqa-'));
  try {
    put(path.join(ws, 'PROJECTS', 'p', 'config.json'), '{}'); put(path.join(ws, 'PROJECTS', 'p', 'out', 'P.mp4'));
    assert.deepEqual(projectQa(ws, 'PROJECTS/p').findings, []);
    put(path.join(ws, 'qa_reports', 'P', 'findings.json'), JSON.stringify({ total: 80, findings: [{ category: 'audio', severity: 'HIGH', issue: 'clip', fix: 'lower', t: 3.5, t_end: 4, status: 'open', evidence: 'C:/secret/frame.jpg' }] }));
    const q = projectQa(ws, 'PROJECTS/p');
    assert.equal(q.video, 'PROJECTS/p/out/P.mp4');
    assert.deepEqual(q.findings[0], { t: 3.5, tEnd: 4, severity: 'HIGH', category: 'audio', issue: 'clip', fix: 'lower', status: 'open', source: '' });
    assert.equal(projectQa(ws, 'nope'), null);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});
