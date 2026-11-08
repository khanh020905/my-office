import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readProjects, PIPELINES } from '../../server/production/projects.mjs';

const put = (f, s = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

test('projects: not configured gives no sample data', () => {
  assert.deepEqual(readProjects(''), { configured: false, projects: [] });
  assert.equal(readProjects(path.join(os.tmpdir(), 'no-such-ws-' + Date.now())).configured, false);
});

test('projects: stages come from files; type only from config; QA and revisions read', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'vws-'));
  try {
    const b = path.join(ws, 'studio', 'projects', 'b1');
    put(path.join(b, 'config.json'), JSON.stringify({ title: 'B one', type: 'B' }));
    put(path.join(b, 'input', 'script.txt')); put(path.join(b, 'story', 'shots.json'), '[]'); put(path.join(b, 'scenes', 'cast.js'));
    put(path.join(b, 'out', 'B one.mp4'));
    put(path.join(ws, 'qa_reports', 'B one', 'findings.json'), JSON.stringify({ total: 88.5, recommendation: 'PUBLISH', findings: [{ severity: 'major' }, { severity: 'minor' }, { severity: 'minor' }] }));
    put(path.join(b, 'out', 'revisions', 'revisions.json'), JSON.stringify({ revisions: [{ n: 1, file: 'video_revision_01.mp4', created: '2026-11-08 01:36', status: 'NEEDS REVIEW', total: 90 }] }));
    const u = path.join(ws, 'PROJECTS', 'u1');
    put(path.join(u, 'config.json'), '{"title":"untyped"}'); put(path.join(u, 'input', 'script.txt'));
    put(path.join(ws, 'PROJECTS', 'not-a-project', 'readme.md'));

    const r = readProjects(ws);
    assert.equal(r.configured, true);
    assert.equal(r.projects.length, 2);
    const p = r.projects.find((x) => x.id === 'studio/projects/b1');
    assert.equal(p.type, 'B');
    assert.deepEqual(p.stages.map((s) => s.id), PIPELINES.B);
    const st = Object.fromEntries(p.stages.map((s) => [s.id, s.status]));
    assert.equal(st.concept, 'unknown');
    assert.equal(st.script, 'done'); assert.equal(st.storyboard, 'done'); assert.equal(st.character_bible, 'done');
    assert.equal(st.visual_bible, 'missing'); assert.equal(st.voiceover, 'missing');
    assert.equal(st.editing, 'done'); assert.equal(st.qa, 'done');
    assert.equal(p.render, 'done');
    assert.equal(p.qa.total, 88.5); assert.deepEqual(p.qa.severities, { major: 1, minor: 2 });
    assert.equal(p.revisions[0].status, 'NEEDS REVIEW');
    assert.ok(p.timeline.some((x) => x.kind === 'revision'));
    assert.ok(p.timeline.every((x, i, a) => !i || a[i - 1].at <= x.at));
    const q = r.projects.find((x) => x.id === 'PROJECTS/u1');
    assert.equal(q.type, null); assert.equal(q.stages, null);   // never guessed
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});

test('projects: a fresh render log newer than the MP4 marks editing running', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'vws-'));
  try {
    const a = path.join(ws, 'PROJECTS', 'a1');
    put(path.join(a, 'config.json'), '{"type":"A"}');
    put(path.join(a, 'build', 'final_render.log'));
    const p = readProjects(ws).projects[0];
    assert.equal(p.render, 'rendering');
    assert.equal(p.stages.find((s) => s.id === 'editing').status, 'running');
    assert.equal(p.stages.find((s) => s.id === 'research').status, 'unknown');
    assert.equal(readProjects(ws, Date.now() + 10 * 60e3).projects[0].render, 'none');
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});
