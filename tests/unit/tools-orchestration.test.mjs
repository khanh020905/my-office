import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createToolRegistry } from '../../server/tools/registry.mjs';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { createSecurityAuditLogger } from '../../server/tools/security-audit.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { createDistributionEngine } from '../../server/tools/distribution-engine.mjs';
import { createTaskAnalyzer } from '../../server/orchestration/task-analyzer.mjs';
import { createCapabilityMatcher } from '../../server/orchestration/capability-matcher.mjs';
import { createAgentSelector } from '../../server/orchestration/agent-selector.mjs';
import { createPlanGenerator } from '../../server/orchestration/plan-generator.mjs';
import { createOrchestrator } from '../../server/orchestration/orchestrator.mjs';
import { handleOrchestrationRoutes } from '../../server/orchestration/orchestration-api.mjs';

describe('Dynamic Task Orchestration & Automated Tool Selection (Phase 6)', () => {
  function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-orch-test-'));
    const registryStore = path.join(tmpDir, 'tools-registry.json');
    const permStore = path.join(tmpDir, 'permission-registry.json');
    const auditStore = path.join(tmpDir, 'security-audit.json');
    const policyStore = path.join(tmpDir, 'security-policies.json');
    const distStore = path.join(tmpDir, 'distribution-registry.json');
    const orchStore = path.join(tmpDir, 'orchestration-tasks.json');

    const registry = createToolRegistry({ store: registryStore });
    const permissionRegistry = createPermissionRegistry({ storePath: permStore });
    const auditLogger = createSecurityAuditLogger({ storePath: auditStore });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry,
      auditLogger,
      policiesPath: policyStore,
    });
    const distributionEngine = createDistributionEngine({
      registry,
      permissionRegistry,
      policyEngine,
      storePath: distStore,
    });

    const analyzer = createTaskAnalyzer();
    const matcher = createCapabilityMatcher({
      registry,
      distributionEngine,
      policyEngine,
      permissionRegistry,
    });
    const selector = createAgentSelector({ distributionEngine, policyEngine });
    const planner = createPlanGenerator();

    // Controlled mock native agent executor for unit tests
    const mockAgentExecutor = {
      async executeAgentStep({ step }) {
        return {
          ok: true,
          exit_code: 0,
          pid: 99999,
          duration_ms: 10,
          stdout: `Executed native agent test for ${step.step_id}`,
          stderr: '',
          error: null,
          status: 'completed',
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
        };
      },
    };

    const orchestrator = createOrchestrator({
      registry,
      distributionEngine,
      policyEngine,
      permissionRegistry,
      auditLogger,
      nativeAgentExecutor: mockAgentExecutor,
      storePath: orchStore,
    });

    return {
      tmpDir,
      registry,
      permissionRegistry,
      policyEngine,
      distributionEngine,
      auditLogger,
      analyzer,
      matcher,
      selector,
      planner,
      orchestrator,
    };
  }

  // 1. Task Analyzer & Capability Extraction
  it('analyzes user requests into structured task specifications with capabilities and risk classification', () => {
    const { tmpDir, analyzer } = setupTestEnv();

    const spec = analyzer.analyzeTask(
      'Inspect the repository code, run unit tests, and review git diff. Save summary to report.md'
    );

    assert.equal(spec.task_type, 'coding');
    assert.ok(spec.required_capabilities.includes('code_analysis'));
    assert.ok(spec.required_capabilities.includes('testing'));
    assert.ok(spec.required_capabilities.includes('git_review'));
    assert.ok(spec.expected_output_artifacts.includes('report.md'));
    assert.equal(spec.needs_filesystem_read, true);
    assert.equal(spec.needs_process_execution, true);
    assert.equal(spec.risk_level, 'high');

    // Ambiguous prompt handling
    const ambiguous = analyzer.analyzeTask('Do something quick');
    assert.equal(ambiguous.confidence, 0.4);
    assert.ok(ambiguous.required_capabilities.includes('process_exec'));
    assert.ok(ambiguous.uncertainty_notes.length > 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 2. Capability Matching & Ranking Engine
  it('discovers and ranks candidate tools from registry with hard eligibility gates', () => {
    const { tmpDir, registry, matcher } = setupTestEnv();

    // Register active tool 1: Git review skill
    registry.registerTool({
      tool_id: 'git-review-tool',
      name: 'Git Review Pro',
      version: '1.0.0',
      description: 'Reviews git diffs and commits',
      source_repository: 'https://github.com/org/git-review',
      integration_protocols: ['skill'],
      capabilities: [{ capability_id: 'git_review', protocol: 'skill', name: 'Git Review', entry_point: 'SKILL.md' }],
      compatible_agents: ['claude-code', 'codex-cli'],
      installation_status: 'installed',
    });

    // Register active tool 2: Full Code Reviewer
    registry.registerTool({
      tool_id: 'code-suite-tool',
      name: 'Code Suite',
      version: '2.0.0',
      description: 'Comprehensive code analysis and testing suite',
      source_repository: 'https://github.com/org/code-suite',
      integration_protocols: ['cli', 'mcp'],
      capabilities: [
        { capability_id: 'code_analysis', protocol: 'cli', name: 'Code Analysis', entry_point: 'bin/analyze' },
        { capability_id: 'testing', protocol: 'cli', name: 'Test Runner', entry_point: 'bin/test' },
      ],
      compatible_agents: ['claude-code'],
      installation_status: 'installed',
    });

    // Register disabled tool 3 (Should be rejected)
    registry.registerTool({
      tool_id: 'disabled-tool',
      name: 'Disabled Tool',
      version: '1.0.0',
      description: 'Disabled in registry',
      source_repository: 'https://github.com/org/disabled',
      capabilities: [{ capability_id: 'git_review', protocol: 'cli', name: 'Disabled Git', entry_point: 'bin/run' }],
      enabled_status: false,
    });

    const taskSpec = {
      required_capabilities: ['code_analysis', 'testing'],
    };

    const matchResult = matcher.matchTools(taskSpec, { targetAgent: 'claude-code' });
    assert.equal(matchResult.ranked_candidates.length, 1);
    assert.equal(matchResult.ranked_candidates[0].tool_id, 'code-suite-tool');
    assert.equal(matchResult.all_capabilities_satisfied, true);

    // Verify disabled tool was rejected
    const rejectedDisabled = matchResult.rejected_candidates.find((r) => r.tool_id === 'disabled-tool');
    assert.ok(rejectedDisabled);
    assert.ok(rejectedDisabled.rejection_reasons.some((r) => r.includes('disabled')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 3. Agent Selector & Explanation
  it('selects suitable AI agents based on task type and tool compatibility', () => {
    const { tmpDir, selector } = setupTestEnv();

    const codingTask = { task_type: 'coding', required_capabilities: ['code_generation', 'testing'] };
    const resCoding = selector.selectAgent(codingTask, [{ compatible_agents: ['claude-code', 'codex-cli'] }]);
    assert.ok(resCoding.selected_agent);
    assert.ok(resCoding.selected_agent.agent_id === 'claude-code' || resCoding.selected_agent.agent_id === 'codex-cli');
    assert.ok(resCoding.explanation.includes('Selected'));

    // Desktop app agent selection
    const docTask = { task_type: 'document_processing', required_capabilities: ['markdown_rendering'] };
    const resDoc = selector.selectAgent(docTask);
    assert.ok(resDoc.selected_agent);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 4. Execution Plan Generator
  it('generates deterministic multi-step DAG execution plans with dependencies and permission disclosures', () => {
    const { tmpDir, planner } = setupTestEnv();

    const taskSpec = {
      task_id: 'test_task_1',
      task_type: 'coding',
      original_request: 'Analyze code and run tests',
      required_capabilities: ['code_analysis', 'testing'],
      expected_output_artifacts: ['test_report.json'],
      needs_filesystem_read: true,
      needs_process_execution: true,
      requires_human_approval: true,
      risk_level: 'medium',
    };

    const matchedTools = [
      {
        tool_id: 'tool-analyzer',
        name: 'Tool Analyzer',
        capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', entry_point: 'bin/analyze' }],
        required_permissions: ['fs:read'],
      },
      {
        tool_id: 'tool-tester',
        name: 'Tool Tester',
        capabilities: [{ capability_id: 'testing', protocol: 'cli', entry_point: 'bin/test' }],
        required_permissions: ['process:exec'],
      },
    ];

    const plan = planner.generatePlan({
      taskSpec,
      selectedAgent: { agent_id: 'claude-code', name: 'Claude Code' },
      matchedTools,
    });

    assert.ok(plan.plan_id.startsWith('plan_'));
    assert.equal(plan.selected_agent, 'claude-code');
    assert.equal(plan.steps.length, 2);
    // Step 2 depends on step 1
    assert.deepEqual(plan.steps[1].depends_on, ['step_1']);
    assert.ok(plan.required_permissions.includes('fs:read'));
    assert.ok(plan.required_permissions.includes('process:exec'));
    assert.equal(plan.requires_human_approval, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. Orchestrator Lifecycle & Human Approval Gate
  it('orchestrates task from RECEIVED to AWAITING_APPROVAL, and advances to COMPLETED upon user approval', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'cli-linter',
      name: 'CLI Linter',
      version: '1.0.0',
      description: 'Lints codebase',
      source_repository: 'https://github.com/org/cli-linter',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Linter', entry_point: 'bin/lint' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read'],
    });

    // Task requiring approval (has file modification or approval requested)
    const submitted = await orchestrator.submitTask({
      task_id: 'orch_test_approval',
      text: 'inspect code and modify files',
    });

    assert.equal(submitted.status, 'AWAITING_APPROVAL');
    assert.equal(submitted.approval.required, true);
    assert.equal(submitted.approval.approved, false);

    // User approves task
    const completed = await orchestrator.approveTask('orch_test_approval', { approvedBy: 'test_admin' });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.approval.approved, true);
    assert.equal(completed.execution_results.completed_steps > 0, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. Mandatory Phase 5 Security Gate Enforcement & Fallback
  it('evaluates security gate at execution time, blocks unauthorized tools, and uses fallback tool if available', async () => {
    const { tmpDir, registry, policyEngine, orchestrator } = setupTestEnv();

    // Explicitly deny 'untrusted-tool' via tool policy
    policyEngine.updatePolicy({
      tool_policies: {
        'untrusted-tool': {
          denied_scopes: ['process:exec'],
        },
      },
    });

    // Register untrusted tool
    registry.registerTool({
      tool_id: 'untrusted-tool',
      name: 'Untrusted Tool',
      version: '1.0.0',
      description: 'Blocked tool',
      source_repository: 'https://github.com/org/untrusted',
      capabilities: [{ capability_id: 'process_exec', name: 'Exec Command', protocol: 'cli', entry_point: 'bin/run' }],
      compatible_agents: ['claude-code'],
      required_permissions: [{ scope: 'process:exec', target: '*', justification: 'Exec' }],
      installation_status: 'installed',
    });

    // Submit task using untrusted tool
    await orchestrator.submitTask({
      task_id: 'security_blocked_task',
      text: 'run command test',
    });

    const task = orchestrator.getTask('security_blocked_task');
    // Security gate blocks execution or matching!
    assert.ok(task.status === 'BLOCKED' || task.status === 'FAILED');
    assert.ok(task.error.includes('Security policy') || task.error.includes('denied') || task.error.includes('security'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 7. Cancellation and Retry Workflows
  it('cancels an active task and allows safe retry from failed or blocked state', async () => {
    const { tmpDir, orchestrator } = setupTestEnv();

    await orchestrator.submitTask({
      task_id: 'task_to_cancel',
      text: 'inspect code and create file new.txt',
    });

    // Cancel task
    const cancelRes = orchestrator.cancelTask('task_to_cancel', { reason: 'User requested abort' });
    assert.equal(cancelRes.ok, true);
    assert.equal(cancelRes.task.status, 'CANCELLED');

    // Retry cancelled task
    const retryRes = await orchestrator.retryTask('task_to_cancel');
    assert.ok(['READY', 'AWAITING_APPROVAL', 'COMPLETED'].includes(retryRes.status));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 8. Execution Trace & Secret Redaction
  it('generates an auditable execution trace with sensitive tokens redacted', async () => {
    const { tmpDir, orchestrator } = setupTestEnv();

    await orchestrator.submitTask({
      task_id: 'trace_test_task',
      text: 'inspect code with api key sk-ant-secret12345678901234567890',
    });

    const trace = orchestrator.getTaskTrace('trace_test_task');
    assert.ok(trace);
    assert.ok(trace.events.length > 0);
    // Secret must NOT be visible in trace!
    const jsonTrace = JSON.stringify(trace);
    assert.equal(jsonTrace.includes('sk-ant-secret1234567890'), false);
    assert.ok(jsonTrace.includes('[REDACTED_SECRET]'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 9. REST Orchestration API Handlers
  it('handles all REST orchestration API routes (analyze, match, plan, submit, tasks, trace)', async () => {
    const { tmpDir, analyzer, matcher, selector, planner, orchestrator } = setupTestEnv();

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    // 1. POST /api/orchestration/analyze
    await handleOrchestrationRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/orchestration/analyze'),
        readJson: async () => ({ text: 'run unit tests and check git diff' }),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.equal(responseData.ok, true);
    assert.ok(responseData.task_spec.required_capabilities.includes('testing'));

    // 2. GET /api/orchestration/capabilities
    await handleOrchestrationRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/orchestration/capabilities'),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.ok(responseData.capabilities.includes('code_analysis'));

    // 3. GET /api/orchestration/agents
    await handleOrchestrationRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/orchestration/agents'),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.ok(responseData.agents.some((a) => a.agent_id === 'claude-code'));
    assert.ok(responseData.agents.some((a) => a.agent_id === 'codex-cli'));

    // 4. POST /api/orchestration/submit
    await handleOrchestrationRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/orchestration/submit'),
        readJson: async () => ({ prompt: 'test REST task submission' }),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 201);
    assert.equal(responseData.ok, true);
    const createdId = responseData.task.task_id;

    // 5. GET /api/orchestration/tasks
    await handleOrchestrationRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/orchestration/tasks'),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.equal(responseData.ok, true);
    assert.ok(responseData.tasks.length > 0);

    // 6. GET /api/orchestration/tasks/:id/trace
    await handleOrchestrationRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL(`http://127.0.0.1:4310/api/orchestration/tasks/${createdId}/trace`),
        analyzer,
        matcher,
        selector,
        planner,
        orchestrator,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.ok(responseData.trace.events);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
