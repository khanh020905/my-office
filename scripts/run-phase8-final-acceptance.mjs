// Phase 8 final acceptance harness. Two separate stages so a human approves in between.
//   node scripts/run-phase8-final-acceptance.mjs submit
//   node scripts/run-phase8-final-acceptance.mjs approve <taskId> <planVersion> <planHash> <approvedBy> [--quota-guard] [--revoke-old-grants]
// Run from the repo root: the orchestrator and executor use process.cwd() as workspace and data root.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createOrchestrator } from '../server/orchestration/orchestrator.mjs';
import { computePlanHash } from '../server/orchestration/plan-generator.mjs';
import { createNativeAgentExecutor } from '../server/orchestration/native-agent-executor.mjs';
import { createToolRegistry } from '../server/tools/registry.mjs';
import { createSecurityPolicyEngine } from '../server/tools/security-policy-engine.mjs';
import { createPermissionRegistry } from '../server/tools/permission-registry.mjs';
import { findHostBinary } from '../server/tools/adapters/base-adapter.mjs';

const PROMPT = 'Read the root package.json in the My Office workspace. Return a JSON object containing exactly: projectName, packageManager, and scripts. Do not modify, create, delete, or execute any project files.';
const AGENT = 'claude-code';
const SCOPES = ['agent:invoke', 'fs:read'];
const GRANT_TTL_MS = 15 * 60_000;
const EVIDENCE_DIR = path.resolve('data', 'phase8-final-acceptance');
const QUOTA_RE = /hit your .*limit|usage limit|rate limit/i;

const [mode, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a) => !a.startsWith('--'));

const permissionRegistry = createPermissionRegistry();
const policyEngine = createSecurityPolicyEngine({ permissionRegistry });

// Records every policy decision so the report can show which grant authorized the run.
const decisions = [];
const evaluate = policyEngine.evaluateOperation.bind(policyEngine);
policyEngine.evaluateOperation = (input) => {
  const decision = evaluate(input);
  Promise.resolve(decision).then((d) => decisions.push({ operation: input.operation, requestedScopes: input.requestedScopes, ...d }));
  return decision;
};

// Pass-through wrapper around the real executor: captures the full result (stderr is not
// persisted by the orchestrator on success). With --quota-guard it also refuses a second
// spawn once the first attempt returned the upstream quota message; it never fakes success.
const realExecutor = createNativeAgentExecutor({ policyEngine });
const attempts = [];
const nativeAgentExecutor = {
  async executeAgentStep(input) {
    const quotaHit = attempts.find((a) => !a.ok && QUOTA_RE.test(`${a.stdout}\n${a.stderr}`));
    if (flags.has('--quota-guard') && quotaHit) {
      attempts.push({ suppressed: true, attempt: input.taskContext?.attempt });
      return { ...quotaHit, error: `Retry suppressed by acceptance harness (no second spawn). First attempt: ${quotaHit.stdout || quotaHit.stderr}` };
    }
    const result = await realExecutor.executeAgentStep(input);
    attempts.push({ attempt: input.taskContext?.attempt, ...result });
    return result;
  },
};

const orchestrator = createOrchestrator({ registry: createToolRegistry(), policyEngine, permissionRegistry, nativeAgentExecutor });

// The only plan shape this harness will run: one native read-only step, no tool, no entry point.
function assertSafePlan(plan) {
  assert.equal(plan.steps.length, 1, 'plan must have exactly one step');
  const [step] = plan.steps;
  assert.equal(step.protocol, 'agent_native');
  assert.equal(step.tool_id, null);
  assert.equal(step.entry_point, null);
  assert.equal(step.description, PROMPT);
  assert.deepEqual(plan.required_permissions, ['fs:read']);
  assert.deepEqual(step.required_permissions, ['fs:read']);
  assert.equal(plan.selected_agent, AGENT);
  assert.equal(computePlanHash(plan), plan.plan_hash, 'stored plan hash must match recomputed hash');
}

function planSummary(task) {
  const plan = task.execution_plan;
  return {
    task_id: task.task_id,
    status: task.status,
    created_at: task.created_at,
    task_type: task.task_spec?.task_type,
    risk_level: task.task_spec?.risk_level,
    matched_tools: task.matched_tools ?? task.capability_matches ?? null,
    selected_agent: plan.selected_agent,
    plan_id: plan.plan_id,
    plan_version: plan.plan_version,
    plan_hash: plan.plan_hash,
    recomputed_hash: computePlanHash(plan),
    requires_human_approval: plan.requires_human_approval,
    required_permissions: plan.required_permissions,
    approval: task.approval,
    steps: plan.steps.map((s) => ({
      step_id: s.step_id, title: s.title, protocol: s.protocol, tool_id: s.tool_id, entry_point: s.entry_point,
      capability_id: s.capability_id, required_permissions: s.required_permissions,
      timeout_ms: s.timeout_ms, retry_policy: s.retry_policy, description: s.description,
    })),
  };
}

if (mode === 'submit') {
  const task = await orchestrator.submitTask({ prompt: PROMPT, require_approval: true, target_agent: AGENT }, { autoStartIfApproved: false });
  console.log(JSON.stringify(planSummary(task), null, 2));
  assert.equal(task.status, 'AWAITING_APPROVAL');
  assert.notEqual(task.approval?.approved, true);
  assertSafePlan(task.execution_plan);
  console.log('STAGE 1 OK: task persisted, awaiting human approval. Nothing executed.');
} else if (mode === 'approve') {
  const [taskId, planVersion, planHash, approvedBy] = args;
  assert.ok(taskId && planVersion && planHash && approvedBy, 'usage: approve <taskId> <planVersion> <planHash> <approvedBy>');
  const before = orchestrator.getTask(taskId);
  assert.ok(before, `task ${taskId} not found`);
  assert.equal(before.status, 'AWAITING_APPROVAL');
  assert.equal(before.execution_plan.plan_hash, planHash);
  assert.equal(before.execution_plan.plan_version, Number(planVersion));
  assertSafePlan(before.execution_plan);

  const revoked = [];
  if (flags.has('--revoke-old-grants')) {
    for (const g of permissionRegistry.getActiveGrants(AGENT, AGENT)) {
      permissionRegistry.revokePermission(g.permission_id, { reason: `Superseded before Phase 8 final acceptance of ${taskId}`, revoked_by: approvedBy });
      revoked.push(g.permission_id);
    }
  }
  const grant = permissionRegistry.grantPermission({
    tool_id: AGENT, agent_id: AGENT, scopes: SCOPES,
    expiration: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
    approval_reference: `approval_${taskId}_plan_${planHash}`,
  });
  const executable = findHostBinary('claude');
  const wallStart = new Date().toISOString();
  const done = await orchestrator.approveTask(taskId, { approvedBy, expectedPlanVersion: Number(planVersion), expectedPlanHash: planHash });
  const wallEnd = new Date().toISOString();

  const evidence = {
    task_id: taskId, final_status: done.status, error: done.error ?? null,
    plan_id: done.execution_plan.plan_id, plan_version: done.execution_plan.plan_version, plan_hash: done.execution_plan.plan_hash,
    approval: done.approval,
    grant: permissionRegistry.getPermission(grant.permission_id),
    revoked_old_grants: revoked,
    active_grants_at_end: permissionRegistry.getActiveGrants(AGENT, AGENT).map((g) => g.permission_id),
    executable, harness_pid: process.pid, wall_start: wallStart, wall_end: wallEnd,
    policy_decisions: decisions,
    native_attempts: attempts,
    persisted_step_results: done.execution_results?.step_results ?? null,
    flags: [...flags],
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `evidence-${taskId}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence written: ${file}`);
} else {
  console.error('usage: submit | approve <taskId> <planVersion> <planHash> <approvedBy> [--quota-guard] [--revoke-old-grants]');
  process.exit(2);
}
