import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analytics } from '../../server/production/analytics.mjs';

test('analytics: real counts only; missing metrics stay null', () => {
  const projects = [
    { id: 'a', type: 'A', artifacts: [{ kind: 'script', at: 1000 }, { kind: 'render', at: 5000 }], revisions: [{}, {}],
      qa: { total: 90, recommendation: 'PUBLISH AFTER MANUAL REVIEW', severities: { HIGH: 1, LOW: 2 } } },
    { id: 'b', type: null, artifacts: [{ kind: 'render', at: 7000 }], revisions: [], qa: { total: 50, recommendation: 'DO NOT PUBLISH', severities: { HIGH: 3 } } },
    { id: 'c', type: 'B', artifacts: [], revisions: [], qa: null },
  ];
  const agents = [{ state: 'running', tools: 3, fails: 1, files: 2 }, { state: 'failed', tools: 1, fails: 1, files: 0 }, { state: 'done', tools: 2, fails: 0, files: 1 }];
  const r = analytics(projects, agents);
  assert.equal(r.projects[0].spanMs, 4000); assert.equal(r.projects[1].spanMs, null); assert.equal(r.projects[2].lastRenderAt, null);
  assert.equal(r.qa.reviewed, 2); assert.equal(r.qa.passed, 1); assert.equal(r.qa.passRate, 0.5);
  assert.deepEqual(r.qa.severities, { HIGH: 4, LOW: 2 });
  assert.equal(r.revisions, 2);
  assert.deepEqual([r.agents.total, r.agents.active, r.agents.completed, r.agents.failed, r.agents.tools, r.agents.toolFailures], [3, 1, 1, 1, 6, 2]);
  assert.equal(r.tokens, null); assert.equal(r.cost, null); assert.ok(r.unavailable.tokens);
  assert.equal(analytics([], []).qa.passRate, null);
});
