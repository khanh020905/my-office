// One test per orchestration bug found in the repo audit. Temp stores and a stub agent: nothing here starts Claude.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOrchestrator } from '../../server/orchestration/orchestrator.mjs';
import { computePlanHash } from '../../server/orchestration/plan-generator.mjs';
import { createToolRegistry } from '../../server/tools/registry.mjs';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { handleQaRoutes } from '../../server/orchestration/qa/qa-api.mjs';
import { handleTrialMonitorRoutes } from '../../server/trial-monitor/trial-monitor-api.mjs';

const READ_ONLY = 'Read package.json and report the project name. Do not modify any files.';
const MANUAL = { prompt: READ_ONLY, require_approval: true, target_agent: 'claude-code' };

function stubAgent(ms = 0) {
  return {
    inputs: [],
    async executeAgentStep(input) {
      this.inputs.push(input);
      if (ms) await new Promise((r) => setTimeout(r, ms));
      return { ok: true, exit_code: 0, pid: 1, duration_ms: ms, stdout: 'done', stderr: '' };
    },
  };
}

function env({ agent = stubAgent(), withPolicy = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-hardening-'));
  const storePath = path.join(dir, 'tasks.json');
  const permissionRegistry = withPolicy ? createPermissionRegistry({ storePath: path.join(dir, 'perm.json') }) : null;
  const policyEngine = withPolicy ? createSecurityPolicyEngine({ permissionRegistry, policiesPath: path.join(dir, 'pol.json') }) : null;
  const orchestrator = createOrchestrator({ registry: createToolRegistry(), policyEngine, permissionRegistry, nativeAgentExecutor: agent, storePath });
  const readStore = () => JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const onDisk = (id) => readStore().tasks.find((t) => t.task_id === id);
  // Stands in for another process editing the task file between approval and execution.
  const tamper = (id, change) => {
    const data = readStore(), task = data.tasks.find((t) => t.task_id === id), plan = task.execution_plan;
    task.status = 'READY';
    task.approval = { required: true, approved: true, bound_plan_version: plan.plan_version, bound_plan_hash: plan.plan_hash };
    change(plan);
    fs.writeFileSync(storePath, JSON.stringify(data));
  };
  return { dir, agent, orchestrator, onDisk, tamper, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('Orchestration hardening (repo audit findings)', () => {
  it('keeps a run\'s result when tasks are listed while a step runs', async () => {
    const { orchestrator, onDisk, done } = env({ agent: stubAgent(60) });
    const t = await orchestrator.submitTask(MANUAL, { autoStartIfApproved: false });
    const run = orchestrator.approveTask(t.task_id);
    await new Promise((r) => setTimeout(r, 15));
    orchestrator.listTasks();
    await assert.rejects(orchestrator.executePlan(t.task_id), /already executing/);
    assert.equal((await run).status, 'COMPLETED');
    assert.equal(onDisk(t.task_id).status, 'COMPLETED');
    assert.equal(onDisk(t.task_id).execution_results.step_results.step_1.output, 'done');
    done();
  });

  it('refuses a task_id that already exists', async () => {
    const { orchestrator, onDisk, done } = env();
    await orchestrator.submitTask({ ...MANUAL, task_id: 'same_id' }, { autoStartIfApproved: false });
    await assert.rejects(orchestrator.submitTask({ ...MANUAL, prompt: 'something else', task_id: 'same_id' }), /already exists/);
    assert.equal(onDisk('same_id').original_request, READ_ONLY);
    done();
  });

  it('still asks for approval, and keeps the chosen agent, after a clarification', async () => {
    const auto = env();
    const ran = await auto.orchestrator.submitTask({ prompt: READ_ONLY, target_agent: 'claude-code' });
    assert.equal(ran.status, 'COMPLETED', 'control: this prompt alone runs without approval');
    auto.done();

    const { orchestrator, agent, done } = env();
    const t = await orchestrator.submitTask({ ...MANUAL, needs_user_input: true });
    assert.equal(t.status, 'NEEDS_USER_INPUT');
    const resumed = await orchestrator.provideUserInput(t.task_id, { input: 'the one in the root folder' });
    assert.equal(resumed.status, 'AWAITING_APPROVAL');
    assert.equal(resumed.execution_plan.selected_agent, 'claude-code');
    assert.equal(agent.inputs.length, 0);
    done();
  });

  it('covers the prompt with the plan hash and blocks a run whose prompt changed after approval', async () => {
    const { orchestrator, agent, tamper, done } = env();
    const t = await orchestrator.submitTask(MANUAL, { autoStartIfApproved: false });
    const plan = t.execution_plan;
    assert.notEqual(computePlanHash({ ...plan, steps: [{ ...plan.steps[0], description: 'Delete the repository.' }] }), plan.plan_hash);

    tamper(t.task_id, (p) => { p.steps[0].description = 'Delete the repository.'; });
    await assert.rejects(orchestrator.executePlan(t.task_id), /hash mismatch/);
    assert.equal(agent.inputs.length, 0);
    done();
  });

  it('never takes the program to run from the stored plan', async () => {
    const { orchestrator, agent, tamper, done } = env();
    const t = await orchestrator.submitTask(MANUAL, { autoStartIfApproved: false });
    tamper(t.task_id, (p) => { p.steps[0].custom_binary = 'C:/somewhere/evil.exe'; });
    assert.equal((await orchestrator.executePlan(t.task_id)).status, 'COMPLETED');
    assert.equal(agent.inputs.length, 1);
    assert.equal(agent.inputs[0].customBinary ?? null, null);
    done();
  });

  it('accepts a prompt that ends in password=… and hides the value in the trace', async () => {
    const { orchestrator, done } = env({ withPolicy: true });
    const t = await orchestrator.submitTask({ ...MANUAL, prompt: 'Read config.js and explain why login fails with password=hunter2' }, { autoStartIfApproved: false });
    assert.equal(t.status, 'AWAITING_APPROVAL');
    assert.equal(JSON.stringify(orchestrator.getTaskTrace(t.task_id)).includes('hunter2'), false);
    done();
  });

  it('refuses a write from another site even when it arrives from this computer', async () => {
    const mustNotRun = () => { throw new Error('reached the handler'); };
    const guards = { isLoopback: () => true, authorized: () => true, sameOriginOf: () => false, readJson: async () => ({ reason: 'x' }) };
    const post = { method: 'POST', headers: { origin: 'https://evil.example' } };
    let code = null;
    const json = (_res, c) => { code = c; };

    await handleQaRoutes(post, {}, { ...guards, json, url: new URL('http://localhost:4310/api/qa/findings/f1/accept-risk'), qaReviewEngine: { acceptRisk: mustNotRun } });
    assert.equal(code, 403);

    code = null;
    await handleTrialMonitorRoutes(post, {}, { ...guards, json, url: new URL('http://localhost:4310/api/trial-monitor/snapshots'), trialMonitor: { collectNow: mustNotRun } });
    assert.equal(code, 403);
  });
});
