import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createOrchestrator } from '../server/orchestration/orchestrator.mjs';
import { createToolRegistry } from '../server/tools/registry.mjs';
import { createSecurityPolicyEngine } from '../server/tools/security-policy-engine.mjs';
import { createPermissionRegistry } from '../server/tools/permission-registry.mjs';
import { createNativeAgentExecutor } from '../server/orchestration/native-agent-executor.mjs';

async function runPostQuotaRetest() {
  console.log('=====================================================');
  console.log('PHASE 8 — POST-QUOTA REAL HOST EXECUTION RETEST');
  console.log('=====================================================');

  // 1. Pre-execution workspace integrity check
  console.log('\n[1/7] Inspecting pre-execution Git working copy integrity...');
  const gitStatusBefore = execSync('git status -s', { encoding: 'utf8' });
  const initialModified = gitStatusBefore.trim().split('\n').filter(Boolean);
  console.log(`Pre-execution status: ${initialModified.length} modified/untracked files present.`);

  // 2. Initialize platform subsystems
  console.log('\n[2/7] Initializing My Office Orchestration subsystems...');
  const registry = createToolRegistry();
  const permissionRegistry = createPermissionRegistry();
  const policyEngine = createSecurityPolicyEngine({ permissionRegistry });
  const nativeAgentExecutor = createNativeAgentExecutor({ policyEngine });

  const orchestrator = createOrchestrator({
    registry,
    policyEngine,
    permissionRegistry,
    nativeAgentExecutor,
  });

  const testPrompt = `Read package.json and report:
1. Project name.
2. Available npm scripts.
3. Package manager if identifiable.

Return valid structured JSON.
Do not modify, create, delete, or overwrite any workspace files.`;

  const taskRequest = {
    prompt: testPrompt,
    require_approval: true,
    target_agent: 'claude-code',
  };

  // 3. Submit brand-new task
  console.log('\n[3/7] Submitting new task for analysis and plan generation...');
  const task = await orchestrator.submitTask(taskRequest, { autoStartIfApproved: false });
  const taskId = task.task_id;
  const plan = task.execution_plan;

  console.log(`New Task ID: ${taskId}`);
  console.log(`Task Type: ${task.task_spec?.task_type}`);
  console.log(`Selected Agent:`, task.selected_agent);
  console.log(`Plan ID: ${plan.plan_id}`);
  console.log(`Plan Version: v${plan.plan_version}`);
  console.log(`Plan SHA-256 Hash: ${plan.plan_hash}`);
  console.log(`Requires Human Approval: ${plan.requires_human_approval}`);
  console.log(`Initial Status: ${task.status}`);

  if (task.status !== 'AWAITING_APPROVAL') {
    throw new Error(`Expected status AWAITING_APPROVAL, got ${task.status}`);
  }

  // 4. Issue fresh task-specific permission grant
  console.log('\n[4/7] Issuing fresh permission grant in PermissionRegistry...');
  const grant = permissionRegistry.grantPermission({
    tool_id: 'claude-code',
    agent_id: 'claude-code',
    scopes: ['agent:invoke', 'fs:read'],
    approval_reference: `approval_${taskId}`,
  });
  console.log(`Issued Permission ID: ${grant.permission_id} for scopes: ${grant.granted_scopes.join(', ')}`);

  // 5. Approve task with strict cryptographic plan hash and version binding
  console.log('\n[5/7] Approving task with cryptographic plan hash and version binding...');
  const execStart = Date.now();
  const completedTask = await orchestrator.approveTask(taskId, {
    approvedBy: 'security_auditor',
    expectedPlanVersion: plan.plan_version,
    expectedPlanHash: plan.plan_hash,
  });
  const execDuration = Date.now() - execStart;

  console.log(`\n[6/7] Execution finished. Final Task Status: ${completedTask.status}`);
  console.log(`Total Wall Clock Time: ${execDuration} ms`);

  // Extract step execution results
  const stepResults = completedTask.execution_results?.step_results || {};
  const firstStepId = plan.steps[0]?.step_id;
  const stepResult = stepResults[firstStepId] || {};
  const metadata = stepResult.metadata || {};

  console.log('\n--- Step Execution Evidence ---');
  console.log('Step ID:', firstStepId);
  console.log('Real Child PID:', metadata.pid);
  console.log('Process Exit Code:', metadata.exit_code);
  console.log('Step Duration:', metadata.duration_ms, 'ms');
  console.log('Start Timestamp:', metadata.start_time);
  console.log('End Timestamp:', metadata.end_time);
  console.log('Output Length:', (stepResult.output || '').length, 'chars');
  console.log('Captured Output:');
  console.log('--------------------------------------------------');
  console.log(stepResult.output || completedTask.error || '(no output)');
  console.log('--------------------------------------------------');

  // 6. Post-execution workspace integrity check
  console.log('\n[7/7] Verifying workspace integrity after execution...');
  const gitStatusAfter = execSync('git status -s', { encoding: 'utf8' });
  const beforeSet = new Set(initialModified);
  const afterLines = gitStatusAfter.trim().split('\n').filter(Boolean);

  const newlyModified = [];
  for (const line of afterLines) {
    if (
      !beforeSet.has(line) &&
      !line.includes('run-phase8-retest.mjs') &&
      !line.includes('run-phase8-acceptance.mjs') &&
      !line.includes('orchestration-tasks.json') &&
      !line.includes('permissions.json') &&
      !line.includes('security-audit.json')
    ) {
      newlyModified.push(line);
    }
  }

  console.log(`Newly modified workspace source files: ${newlyModified.length}`);
  if (newlyModified.length > 0) {
    console.warn('WARNING: Files modified during execution:', newlyModified);
  } else {
    console.log('SUCCESS: Workspace integrity verified. Zero source files modified.');
  }

  // 7. Analysis of output
  console.log('\n=====================================================');
  console.log('FINAL EVALUATION RESULT');
  console.log('=====================================================');

  const outputText = stepResult.output || completedTask.error || '';
  const isRateLimit = outputText.includes('5-hour limit') || outputText.includes('limit resets');

  if (completedTask.status === 'COMPLETED' && metadata.exit_code === 0) {
    console.log('ACCEPTANCE STATUS: PASS (Real Claude execution successful)');
    try {
      // Find JSON block in output
      const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, outputText.trim()];
      const parsed = JSON.parse(jsonMatch[1]);
      console.log('Parsed JSON Response:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw model response was not cleanly JSON-parseable, but exit code was 0.');
    }
  } else if (isRateLimit) {
    console.log('ACCEPTANCE STATUS: BLOCKED_BY_UPSTREAM_QUOTA');
    console.log('Evidence: Real process spawned and authenticated, but Anthropic API returned active rate limit.');
  } else {
    console.log(`ACCEPTANCE STATUS: FAILED (${completedTask.error || 'Non-zero exit without rate limit message'})`);
  }

  return {
    taskId,
    status: completedTask.status,
    pid: metadata.pid,
    exitCode: metadata.exit_code,
    durationMs: metadata.duration_ms,
    output: outputText,
    planHash: plan.plan_hash,
    planVersion: plan.plan_version,
  };
}

runPostQuotaRetest().catch((err) => {
  console.error('Fatal error during post-quota retest:', err);
  process.exit(1);
});

