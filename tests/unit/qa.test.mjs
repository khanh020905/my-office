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

test('qa: each report is kept in the office history, so a new run does not erase the old one', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'vqa-')), hist = fs.mkdtempSync(path.join(os.tmpdir(), 'vqah-'));
  try {
    put(path.join(ws, 'tools', 'video_qa.py')); put(path.join(ws, 'PROJECTS', 'p', 'config.json'), '{}'); put(path.join(ws, 'PROJECTS', 'p', 'out', 'P.mp4'));
    const f = path.join(ws, 'qa_reports', 'P', 'findings.json');
    put(f, JSON.stringify({ total: 60, recommendation: 'fix', findings: [{ severity: 'HIGH' }, { severity: 'HIGH' }, { severity: 'LOW' }] }));
    fs.utimesSync(f, new Date(1e12), new Date(1e12));
    const calls = [], r = createQaRunner({ historyDir: hist, spawn: fakeSpawn(calls), python: 'python3' });
    assert.equal(r.start(ws, 'PROJECTS/p').ok, true);   // the old report is saved before the tool rewrites it
    put(f, JSON.stringify({ total: 90, recommendation: 'publish', findings: [] }));
    fs.utimesSync(f, new Date(2e12), new Date(2e12));
    calls.child.emit('close', 0);
    const h = projectQa(ws, 'PROJECTS/p', hist).history;
    assert.deepEqual(h, [
      { at: 2e12, total: 90, recommendation: 'publish', severities: {} },
      { at: 1e12, total: 60, recommendation: 'fix', severities: { HIGH: 2, LOW: 1 } }]);
    assert.equal(fs.readdirSync(path.join(hist, 'PROJECTS_p')).length, 2);
    assert.ok(!fs.existsSync(path.join(ws, 'qa_reports', 'P', 'history')));   // nothing written into the workspace
    assert.deepEqual(projectQa(ws, 'PROJECTS/p').history, []);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); fs.rmSync(hist, { recursive: true, force: true }); }
});
