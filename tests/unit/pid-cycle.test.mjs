import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _walks } from '../../server/system.mjs';

// Windows reuses pids, so a stale ppid can point back down the tree: A -> B -> A. Every walk must still end.
test('process-tree walks end on a parent-pid cycle', () => {
  const me = process.pid, a = 900001, b = 900002;
  const procs = new Map([
    [me, { pid: me, ppid: a, comm: 'node', mem: 1 }],
    [a, { pid: a, ppid: b, comm: 'x', mem: 1 }],
    [b, { pid: b, ppid: a, comm: 'x', mem: 1 }],
  ]);
  const kids = new Map([[a, [me, b]], [b, [a]]]);
  const guard = _walks.protectedPids({ procs, kids });
  assert.ok(guard.has(me) && guard.has(a) && guard.has(b));
  assert.deepEqual(_walks.descendants(kids, a).sort(), [b, me].sort());
  assert.equal(typeof _walks.rootOf({ procs, kids }, a), 'number');
});
