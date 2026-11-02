import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/shared/burn.js';
import { modelFamily, modelLong } from '../../src/shared/model-name.js';

// a day's ledger: keys are model, source, agent, skill, plugin, mcp joined by tabs; sums [usd, in, out, cache read, cache write, requests]
const key = (model, source, agent = '') => [model, source, agent, '', '', ''].join('\t');
test('the coordinator and its subagents, each by model: Opus for the session, Sonnet and Haiku for the subagents', () => {
  const day = { s: { s1: { m: {
    [key('claude-opus-5-5', 'main')]: [6, 0, 0, 0, 0, 3],
    [key('claude-sonnet-5-5', 'subagent', 'Explore')]: [3, 0, 0, 0, 0, 5],
    [key('claude-haiku-5-5', 'subagent', 'Explore')]: [0.5, 0, 0, 0, 0, 2],
    [key('claude-haiku-5-5', 'auxiliary')]: [0.5, 0, 0, 0, 0, 1],
  } } } };
  const r = summarize([['2026-11-02', day]], { s1: { m: true } });
  assert.deepEqual(r.roles.map((x) => [x.role, x.model, x.usd]), [['main', 'claude-opus-5-5', 6], ['subagent', 'claude-sonnet-5-5', 3], ['subagent', 'claude-haiku-5-5', 0.5]]);
  assert.equal(r.roles[0].share, 0.6);   // (of everything, the background work included)
  assert.equal(r.total.usd, 10);
});

test('a model id as a tag and as a list says it', () => {
  assert.equal(modelFamily('claude-sonnet-5-5'), 'Sonnet');
  assert.equal(modelLong('claude-opus-5-5[1m]'), 'Opus 5.5');
  assert.equal(modelLong('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.equal(modelFamily('<synthetic>'), '');
});
