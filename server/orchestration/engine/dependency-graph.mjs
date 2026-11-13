/**
 * Dependency Graph Validator and Topological Sorter (Phase 2).
 * Validates subtasks, dependencies, detects cycles, and evaluates readiness.
 */

export function buildDependencyGraph(subtasks = []) {
  const taskMap = new Map();
  const incoming = new Map(); // taskId -> Set of dependency taskIds
  const outgoing = new Map(); // dependency taskId -> Set of dependent taskIds

  for (const t of subtasks) {
    const id = t.subtaskId || t.id;
    taskMap.set(id, t);
    const deps = new Set(Array.isArray(t.dependencies) ? t.dependencies.map(String) : []);
    incoming.set(id, deps);
    if (!outgoing.has(id)) outgoing.set(id, new Set());
  }

  // Populate outgoing edges
  for (const [id, deps] of incoming.entries()) {
    for (const depId of deps) {
      if (!taskMap.has(depId)) {
        throw new Error(`Subtask '${id}' references non-existent dependency '${depId}'.`);
      }
      if (depId === id) {
        throw new Error(`Subtask '${id}' cannot depend on itself (self-cycle).`);
      }
      outgoing.get(depId).add(id);
    }
  }

  /**
   * Detects circular dependencies via Depth-First Search.
   */
  function detectCycles() {
    const visited = new Set();
    const inStack = new Set();
    const cyclePath = [];

    function dfs(nodeId, path = []) {
      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      const dependents = outgoing.get(nodeId) || new Set();
      for (const next of dependents) {
        if (!visited.has(next)) {
          if (dfs(next, [...path])) return true;
        } else if (inStack.has(next)) {
          cyclePath.push(...path.slice(path.indexOf(next)), next);
          return true;
        }
      }

      inStack.delete(nodeId);
      return false;
    }

    for (const id of taskMap.keys()) {
      if (!visited.has(id)) {
        if (dfs(id)) {
          return { hasCycle: true, cycle: cyclePath };
        }
      }
    }

    return { hasCycle: false, cycle: null };
  }

  const cycleCheck = detectCycles();
  if (cycleCheck.hasCycle) {
    throw new Error(`Circular dependency detected: ${cycleCheck.cycle.join(' -> ')}`);
  }

  /**
   * Returns topological execution layers (sets of tasks that can run concurrently).
   */
  function getExecutionLayers() {
    const layers = [];
    const remainingDeps = new Map();
    for (const [id, deps] of incoming.entries()) {
      remainingDeps.set(id, new Set(deps));
    }

    while (remainingDeps.size > 0) {
      const ready = [];
      for (const [id, deps] of remainingDeps.entries()) {
        if (deps.size === 0) ready.push(id);
      }

      if (ready.length === 0) {
        throw new Error('Deadlock detected in dependency graph resolution.');
      }

      layers.push(ready);
      for (const id of ready) {
        remainingDeps.delete(id);
        for (const deps of remainingDeps.values()) {
          deps.delete(id);
        }
      }
    }

    return layers;
  }

  /**
   * Evaluates readiness of a specific subtask given current task states.
   */
  function evaluateSubtaskReadiness(subtaskId, currentTasksMap) {
    const t = currentTasksMap.get(subtaskId);
    if (!t) return { status: 'unknown', reason: 'Subtask not found' };
    if (['succeeded', 'failed', 'cancelled', 'running', 'dispatching'].includes(t.status)) {
      return { status: t.status, ready: false };
    }

    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const failedDeps = [];
    const pendingDeps = [];

    for (const depId of deps) {
      const dep = currentTasksMap.get(depId);
      if (!dep) {
        failedDeps.push(depId);
        continue;
      }
      if (['failed', 'cancelled', 'blocked'].includes(dep.status)) {
        failedDeps.push(depId);
      } else if (dep.status !== 'succeeded') {
        pendingDeps.push(depId);
      }
    }

    if (failedDeps.length > 0) {
      return {
        status: 'blocked',
        ready: false,
        blockedBy: failedDeps,
        reason: `Dependencies failed or cancelled: ${failedDeps.join(', ')}`,
      };
    }

    if (pendingDeps.length > 0) {
      return {
        status: 'waiting',
        ready: false,
        waitingFor: pendingDeps,
        reason: `Waiting for dependencies: ${pendingDeps.join(', ')}`,
      };
    }

    return { status: 'ready', ready: true, reason: 'All dependencies completed successfully' };
  }

  return {
    subtasks: Array.from(taskMap.values()),
    incoming,
    outgoing,
    getExecutionLayers,
    evaluateSubtaskReadiness,
  };
}

