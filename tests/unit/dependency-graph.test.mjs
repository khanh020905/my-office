import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDependencyGraph } from '../../server/orchestration/engine/dependency-graph.mjs';

test('Dependency Graph Engine: Cycle detection, topological layers & readiness evaluation', async (t) => {
  await t.test('Detects valid DAG and derives topological parallel execution layers', () => {
    // A -> [B, C] -> D
    const subtasks = [
      { subtaskId: 'task-A', dependencies: [] },
      { subtaskId: 'task-B', dependencies: ['task-A'] },
      { subtaskId: 'task-C', dependencies: ['task-A'] },
      { subtaskId: 'task-D', dependencies: ['task-B', 'task-C'] },
    ];

    const graph = buildDependencyGraph(subtasks);
    const layers = graph.getExecutionLayers();

    assert.equal(layers.length, 3);
    assert.deepEqual(layers[0], ['task-A']);
    assert.deepEqual(layers[1].sort(), ['task-B', 'task-C'].sort());
    assert.deepEqual(layers[2], ['task-D']);
  });

  await t.test('Rejects circular dependency fail-closed', () => {
    // A -> B -> C -> A
    const cyclicSubtasks = [
      { subtaskId: 'task-A', dependencies: ['task-C'] },
      { subtaskId: 'task-B', dependencies: ['task-A'] },
      { subtaskId: 'task-C', dependencies: ['task-B'] },
    ];

    assert.throws(
      () => buildDependencyGraph(cyclicSubtasks),
      /Circular dependency detected/
    );
  });

  await t.test('Rejects self-dependency fail-closed', () => {
    const selfCycle = [
      { subtaskId: 'task-A', dependencies: ['task-A'] },
    ];

    assert.throws(
      () => buildDependencyGraph(selfCycle),
      /cannot depend on itself/
    );
  });

  await t.test('Rejects reference to non-existent dependency', () => {
    const missingDep = [
      { subtaskId: 'task-A', dependencies: ['task-UNKNOWN'] },
    ];

    assert.throws(
      () => buildDependencyGraph(missingDep),
      /references non-existent dependency/
    );
  });

  await t.test('Evaluates task readiness: ready, waiting, and blocked states', () => {
    const subtasks = [
      { subtaskId: 'task-A', status: 'succeeded', dependencies: [] },
      { subtaskId: 'task-B', status: 'failed', dependencies: ['task-A'] },
      { subtaskId: 'task-C', status: 'queued', dependencies: ['task-A'] },
      { subtaskId: 'task-D', status: 'queued', dependencies: ['task-B'] },
      { subtaskId: 'task-E', status: 'queued', dependencies: ['task-C'] },
    ];

    const currentMap = new Map(subtasks.map((s) => [s.subtaskId, s]));
    const graph = buildDependencyGraph(subtasks);

    // Task C: dependency A succeeded -> ready
    const resC = graph.evaluateSubtaskReadiness('task-C', currentMap);
    assert.equal(resC.status, 'ready');
    assert.equal(resC.ready, true);

    // Task D: dependency B failed -> blocked
    const resD = graph.evaluateSubtaskReadiness('task-D', currentMap);
    assert.equal(resD.status, 'blocked');
    assert.equal(resD.ready, false);
    assert.deepEqual(resD.blockedBy, ['task-B']);

    // Task E: dependency C is queued -> waiting
    const resE = graph.evaluateSubtaskReadiness('task-E', currentMap);
    assert.equal(resE.status, 'waiting');
    assert.equal(resE.ready, false);
  });
});

