/**
 * Structured Handoff and Result Consolidation Engine (Phase 5).
 * Compiles outputs, file changes, API contracts, and decisions from upstream tasks
 * and provides contextual inputs to downstream tasks with secret redaction.
 */

import { redact } from '../../redact.mjs';

export function createHandoffEngine() {
  /**
   * Structures the output produced by an upstream subtask.
   */
  function createHandoffRecord({
    subtaskId,
    masterTaskId,
    provider,
    agentId,
    executionId = null,
    summary = '',
    filesChanged = [],
    contracts = [],
    decisions = [],
    testResults = null,
    outstandingIssues = [],
    rawOutput = '',
  }) {
    return {
      subtaskId,
      masterTaskId,
      provider,
      agentId: agentId || provider,
      executionId,
      timestamp: Date.now(),
      summary: redact(String(summary || '')).slice(0, 4000),
      filesChanged: Array.isArray(filesChanged) ? filesChanged.map(String).slice(0, 100) : [],
      contracts: Array.isArray(contracts) ? contracts.slice(0, 50) : [],
      decisions: Array.isArray(decisions) ? decisions.map(String).slice(0, 50) : [],
      testResults: testResults ? structuredClone(testResults) : null,
      outstandingIssues: Array.isArray(outstandingIssues) ? outstandingIssues.map(String).slice(0, 50) : [],
      outputExcerpt: redact(String(rawOutput || '')).slice(0, 8000),
    };
  }

  /**
   * Builds the downstream prompt/context incorporating outputs from all dependency tasks.
   */
  function assembleDownstreamContext(subtask, upstreamHandoffsMap = new Map()) {
    const deps = Array.isArray(subtask.dependencies) ? subtask.dependencies : [];
    if (deps.length === 0) {
      return {
        instruction: subtask.instruction,
        upstreamContext: '',
      };
    }

    const contextBlocks = [];

    for (const depId of deps) {
      const handoff = upstreamHandoffsMap.get(depId);
      if (!handoff) continue;

      let block = `--- Upstream Task Result: [${handoff.subtaskId}] (${handoff.provider}) ---\n`;
      if (handoff.summary) {
        block += `Summary: ${handoff.summary}\n`;
      }
      if (handoff.filesChanged.length > 0) {
        block += `Files Modified: ${handoff.filesChanged.join(', ')}\n`;
      }
      if (handoff.decisions.length > 0) {
        block += `Decisions:\n${handoff.decisions.map((d) => `  - ${d}`).join('\n')}\n`;
      }
      if (handoff.testResults) {
        block += `Tests: Passed=${handoff.testResults.passed ?? 0}, Failed=${handoff.testResults.failed ?? 0}\n`;
      }
      if (handoff.outstandingIssues.length > 0) {
        block += `Outstanding Issues:\n${handoff.outstandingIssues.map((i) => `  - ${i}`).join('\n')}\n`;
      }
      if (handoff.outputExcerpt) {
        block += `Output Excerpt:\n${handoff.outputExcerpt.slice(0, 2000)}\n`;
      }
      contextBlocks.push(block.trim());
    }

    const upstreamContext = contextBlocks.join('\n\n');
    const enrichedInstruction = upstreamContext
      ? `${subtask.instruction}\n\n=== CONTEXT FROM UPSTREAM DEPENDENCIES ===\n${upstreamContext}`
      : subtask.instruction;

    return {
      instruction: enrichedInstruction,
      upstreamContext,
    };
  }

  /**
   * Consolidates all subtask handoffs into a comprehensive Master Task final result.
   */
  function consolidateMasterResult(masterTask, handoffs = []) {
    const total = masterTask.subtasks?.length || 0;
    const completed = handoffs.length;
    const allFiles = new Set();
    const allDecisions = [];
    const allIssues = [];

    for (const h of handoffs) {
      for (const f of h.filesChanged || []) allFiles.add(f);
      for (const d of h.decisions || []) allDecisions.push(`[${h.subtaskId}] ${d}`);
      for (const i of h.outstandingIssues || []) allIssues.push(`[${h.subtaskId}] ${i}`);
    }

    return {
      masterTaskId: masterTask.masterTaskId,
      title: masterTask.title,
      status: masterTask.status,
      completedSubtasks: completed,
      totalSubtasks: total,
      consolidatedFiles: Array.from(allFiles),
      consolidatedDecisions: allDecisions,
      outstandingIssues: allIssues,
      subtaskSummaries: handoffs.map((h) => ({
        subtaskId: h.subtaskId,
        provider: h.provider,
        summary: h.summary,
      })),
    };
  }

  return {
    createHandoffRecord,
    assembleDownstreamContext,
    consolidateMasterResult,
  };
}

