/**
 * Autonomous Recovery & Budget Manager (Phase 4).
 * Enforces resource quotas, concurrency caps, and persistent cost/execution tracking.
 * Prevents runaway loops, token depletion, and resource overconsumption.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  BUDGET_LIMIT_DEFAULTS,
  validateBudgetConfig,
} from './contracts.mjs';

export function createRecoveryBudgetManager({
  storePath = null,
  initialLimits = {},
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'autonomous', 'budget-state.json');

  let limits = {
    ...BUDGET_LIMIT_DEFAULTS,
    ...initialLimits,
  };

  let usage = {
    subtasksCompleted: 0,
    totalCostUsd: 0.0,
    executionCount: 0,
    durationMinutes: 0.0,
    activeConcurrent: 0,
    tokensUsed: 0,
  };

  let history = [];

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (data && typeof data === 'object') {
        if (data.limits && typeof data.limits === 'object') {
          limits = { ...limits, ...data.limits };
        }
        if (data.usage && typeof data.usage === 'object') {
          usage = {
            subtasksCompleted: Number(data.usage.subtasksCompleted) || 0,
            totalCostUsd: Number(data.usage.totalCostUsd) || 0.0,
            executionCount: Number(data.usage.executionCount) || 0,
            durationMinutes: Number(data.usage.durationMinutes) || 0.0,
            activeConcurrent: Number(data.usage.activeConcurrent) || 0,
            tokensUsed: Number(data.usage.tokensUsed) || 0,
          };
        }
        if (Array.isArray(data.history)) {
          history = data.history.slice(-100);
        }
      }
    } catch {
      // Retain in-memory on read error
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        limits,
        usage,
        history: history.slice(-100),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  /**
   * Retrieves current budget limits.
   */
  function getLimits() {
    return { ...limits };
  }

  /**
   * Updates budget limits after validating numeric fields.
   */
  function updateLimits(newLimits, updatedBy = 'operator') {
    validateBudgetConfig(newLimits);
    limits = {
      ...limits,
      ...newLimits,
    };
    history.push({
      timestamp: now(),
      type: 'limits_updated',
      updatedBy,
      limits: { ...limits },
    });
    persist();
    return { ...limits };
  }

  /**
   * Retrieves current resource usage.
   */
  function getUsage() {
    return { ...usage };
  }

  /**
   * Retrieves remaining allowances across all budget metrics.
   */
  function getRemaining() {
    return {
      remainingSubtasks: Math.max(0, limits.maxSubtasks - usage.subtasksCompleted),
      remainingCostUsd: Math.max(0, +(limits.maxCostUsd - usage.totalCostUsd).toFixed(4)),
      remainingExecutions: Math.max(0, limits.maxExecutions - usage.executionCount),
      remainingDurationMinutes: Math.max(0, +(limits.maxDurationMinutes - usage.durationMinutes).toFixed(2)),
      remainingTokens: Math.max(0, limits.maxTokens - usage.tokensUsed),
      availableConcurrency: Math.max(0, limits.maxConcurrentSubtasks - usage.activeConcurrent),
    };
  }

  /**
   * Checks whether the current usage or a projected addition breaches budget.
   */
  function checkBudget(projected = {}) {
    const reasons = [];
    const projSubtasks = usage.subtasksCompleted + (projected.subtasks || 0);
    const projCost = +(usage.totalCostUsd + (projected.costUsd || 0)).toFixed(4);
    const projExecutions = usage.executionCount + (projected.executions || 0);
    const projDuration = +(usage.durationMinutes + (projected.durationMinutes || 0)).toFixed(2);
    const projTokens = usage.tokensUsed + (projected.tokens || 0);
    const projConcurrency = usage.activeConcurrent + (projected.concurrency || 0);

    if (projSubtasks > limits.maxSubtasks) {
      reasons.push(`Subtask limit reached: projected ${projSubtasks} > max ${limits.maxSubtasks}`);
    }
    if (projCost > limits.maxCostUsd) {
      reasons.push(`Cost limit reached: projected $${projCost.toFixed(2)} > max $${limits.maxCostUsd.toFixed(2)}`);
    }
    if (projExecutions > limits.maxExecutions) {
      reasons.push(`Execution count limit reached: projected ${projExecutions} > max ${limits.maxExecutions}`);
    }
    if (projDuration > limits.maxDurationMinutes) {
      reasons.push(`Duration limit reached: projected ${projDuration} min > max ${limits.maxDurationMinutes} min`);
    }
    if (projTokens > limits.maxTokens) {
      reasons.push(`Token limit reached: projected ${projTokens} > max ${limits.maxTokens}`);
    }
    if (projConcurrency > limits.maxConcurrentSubtasks) {
      reasons.push(`Concurrency limit reached: active ${projConcurrency} > max ${limits.maxConcurrentSubtasks}`);
    }

    const exhausted = reasons.some((r) => !r.includes('Concurrency'));
    const allowed = reasons.length === 0;

    return {
      allowed,
      exhausted,
      reasons,
      remaining: getRemaining(),
    };
  }

  /**
   * Checks whether budget is currently exhausted.
   */
  function isExhausted() {
    return (
      usage.subtasksCompleted >= limits.maxSubtasks ||
      usage.totalCostUsd >= limits.maxCostUsd ||
      usage.executionCount >= limits.maxExecutions ||
      usage.durationMinutes >= limits.maxDurationMinutes ||
      usage.tokensUsed >= limits.maxTokens
    );
  }

  /**
   * Records completed subtask, cost, tokens, and execution usage.
   */
  function recordUsage({
    costUsd = 0,
    subtasks = 0,
    executions = 0,
    durationMinutes = 0,
    tokens = 0,
  } = {}) {
    usage.subtasksCompleted += Math.max(0, Number(subtasks) || 0);
    usage.totalCostUsd = +(usage.totalCostUsd + Math.max(0, Number(costUsd) || 0)).toFixed(4);
    usage.executionCount += Math.max(0, Number(executions) || 0);
    usage.durationMinutes = +(usage.durationMinutes + Math.max(0, Number(durationMinutes) || 0)).toFixed(2);
    usage.tokensUsed += Math.max(0, Number(tokens) || 0);

    history.push({
      timestamp: now(),
      type: 'usage_recorded',
      delta: { costUsd, subtasks, executions, durationMinutes, tokens },
      current: { ...usage },
    });

    persist();
    return { ...usage };
  }

  /**
   * Acquires a concurrency slot for subtask execution.
   */
  function acquireConcurrency(count = 1) {
    const requested = Math.max(1, Number(count) || 1);
    if (usage.activeConcurrent + requested > limits.maxConcurrentSubtasks) {
      return {
        acquired: false,
        allowed: false,
        activeConcurrent: usage.activeConcurrent,
        maxConcurrentSubtasks: limits.maxConcurrentSubtasks,
        reason: `Concurrency limit reached (${usage.activeConcurrent}/${limits.maxConcurrentSubtasks})`,
      };
    }

    usage.activeConcurrent += requested;
    persist();
    return {
      acquired: true,
      allowed: true,
      activeConcurrent: usage.activeConcurrent,
      maxConcurrentSubtasks: limits.maxConcurrentSubtasks,
    };
  }

  /**
   * Releases one or more concurrency slots.
   */
  function releaseConcurrency(count = 1) {
    const released = Math.max(1, Number(count) || 1);
    usage.activeConcurrent = Math.max(0, usage.activeConcurrent - released);
    persist();
    return {
      activeConcurrent: usage.activeConcurrent,
      maxConcurrentSubtasks: limits.maxConcurrentSubtasks,
    };
  }

  /**
   * Resets usage counters (e.g., when operator starts a fresh task).
   */
  function resetUsage(actor = 'operator') {
    usage = {
      subtasksCompleted: 0,
      totalCostUsd: 0.0,
      executionCount: 0,
      durationMinutes: 0.0,
      activeConcurrent: 0,
      tokensUsed: 0,
    };
    history.push({
      timestamp: now(),
      type: 'usage_reset',
      actor,
    });
    persist();
    return { ...usage };
  }

  /**
   * Generates a comprehensive summary with limits, usage, remaining, and percentages.
   */
  function getBudgetSummary() {
    const rem = getRemaining();
    return {
      limits: { ...limits },
      usage: { ...usage },
      remaining: rem,
      isExhausted: isExhausted(),
      utilizationPct: {
        subtasks: Math.min(100, Math.round((usage.subtasksCompleted / (limits.maxSubtasks || 1)) * 100)),
        cost: Math.min(100, Math.round((usage.totalCostUsd / (limits.maxCostUsd || 1)) * 100)),
        executions: Math.min(100, Math.round((usage.executionCount / (limits.maxExecutions || 1)) * 100)),
        tokens: Math.min(100, Math.round((usage.tokensUsed / (limits.maxTokens || 1)) * 100)),
        duration: Math.min(100, Math.round((usage.durationMinutes / (limits.maxDurationMinutes || 1)) * 100)),
      },
    };
  }

  return {
    getLimits,
    updateLimits,
    getUsage,
    getRemaining,
    checkBudget,
    isExhausted,
    recordUsage,
    acquireConcurrency,
    releaseConcurrency,
    resetUsage,
    getBudgetSummary,
  };
}

export { createRecoveryBudgetManager as createRecoveryBudgetTracker };
