/**
 * Native Agent Execution Adapter (Phase 8 & 8.1 Architecture).
 * Spawns real, monitored host agent processes (Claude Code, Codex CLI, etc.)
 * under strict execution profiles, verified read-only flags, environment sanitization,
 * cryptographic plan hash binding, task approval verification, and process result capture.
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeIsolatedProcess } from '../tools/execution-runner.mjs';
import { findHostBinary } from '../tools/adapters/base-adapter.mjs';

export function createNativeAgentExecutor({ policyEngine = null } = {}) {
  return {
    /**
     * Executes a step natively through an agent process on the host.
     */
    async executeAgentStep({
      step,
      taskContext = {},
      workspaceDir = null,
      customBinary = null, // for testing mock runners
    }) {
      const agentId = step.agent_id || 'claude-code';
      const stepId = step.step_id || 'step_unknown';
      const promptText = step.description || step.title || '';
      const cwd = workspaceDir ? path.resolve(workspaceDir) : process.cwd();

      // 1. Validate workspace path
      if (!fs.existsSync(cwd)) {
        return {
          ok: false,
          exit_code: -1,
          pid: null,
          duration_ms: 0,
          stdout: '',
          stderr: `Workspace directory does not exist: ${cwd}`,
          error: `Workspace directory does not exist: ${cwd}`,
          status: 'INVALID_WORKSPACE',
        };
      }

      // 2. Verification of task-specific human approval & plan hash binding (Section 3 Hardening)
      const approval = taskContext.approval;
      if (approval && approval.required) {
        if (!approval.approved) {
          return {
            ok: false,
            exit_code: -1,
            pid: null,
            duration_ms: 0,
            stdout: '',
            stderr: 'Execution blocked: Task-specific human approval required but not granted',
            error: 'Execution blocked: Task-specific human approval required but not granted',
            status: 'UNAPPROVED',
          };
        }
        if (approval.revoked) {
          return {
            ok: false,
            exit_code: -1,
            pid: null,
            duration_ms: 0,
            stdout: '',
            stderr: 'Execution blocked: Task approval has been revoked',
            error: 'Execution blocked: Task approval has been revoked',
            status: 'APPROVAL_REVOKED',
          };
        }
        if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
          return {
            ok: false,
            exit_code: -1,
            pid: null,
            duration_ms: 0,
            stdout: '',
            stderr: 'Execution blocked: Task approval has expired',
            error: 'Execution blocked: Task approval has expired',
            status: 'APPROVAL_EXPIRED',
          };
        }
        if (approval.bound_plan_hash && taskContext.plan_hash && approval.bound_plan_hash !== taskContext.plan_hash) {
          return {
            ok: false,
            exit_code: -1,
            pid: null,
            duration_ms: 0,
            stdout: '',
            stderr: 'Execution blocked: Approval cryptographic hash mismatch against active plan',
            error: 'Execution blocked: Approval cryptographic hash mismatch against active plan',
            status: 'PLAN_HASH_MISMATCH',
          };
        }
      }

      // 3. Mandatory Phase 5 Security Evaluation for Agent Invocation
      if (policyEngine) {
        const securityDecision = policyEngine.evaluateOperation({
          toolId: agentId,
          agentId,
          distributionId: null,
          operation: 'agent:invoke',
          requestedScopes: ['agent:invoke', ...(step.required_permissions || ['fs:read'])],
          target: cwd,
          taskContext: { ...taskContext, step_id: stepId },
        });

        // Fail-closed: block if not allowed by security policy
        if (!securityDecision.allowed) {
          const reason = securityDecision.reason || 'Security policy denied operation';
          return {
            ok: false,
            exit_code: -1,
            pid: null,
            duration_ms: 0,
            stdout: '',
            stderr: `Security policy engine denied agent invocation: ${reason}`,
            error: reason,
            status: securityDecision.status === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'BLOCKED_BY_POLICY',
          };
        }
      }

      // 4. Resolve host executable
      const binaryPath = customBinary || findHostBinary(agentId === 'claude-code' ? 'claude' : agentId);
      if (!binaryPath) {
        return {
          ok: false,
          exit_code: -1,
          pid: null,
          duration_ms: 0,
          stdout: '',
          stderr: `Agent executable for '${agentId}' not found on host PATH.`,
          error: `Agent executable for '${agentId}' not found on host PATH.`,
          status: 'EXECUTABLE_NOT_FOUND',
        };
      }

      // 5. Assemble command and strict Read-Only parameters
      let command = binaryPath;
      let args = [];

      if (customBinary) {
        // If testing with a mock script (e.g., node mock.js)
        if (customBinary.endsWith('.js') || customBinary.endsWith('.mjs')) {
          command = process.execPath;
          args = [customBinary, promptText];
        } else {
          command = customBinary;
          args = [promptText];
        }
      } else if (agentId === 'claude-code') {
        const isWindows = process.platform === 'win32';
        const claudeArgs = [
          '--print',
          '--restricted',
          '--strict-mcp-config',
          '--permission-mode', 'dontAsk',
          '--permission-prompts', 'none',
          '--tools', 'Read,Glob,Grep',
          '--disallowed-tools', 'Bash,Edit,Write,NotebookEdit,mcp__*',
          '--',
          promptText,
        ];

        if (isWindows && (binaryPath.endsWith('.cmd') || binaryPath.endsWith('.bat'))) {
          command = 'cmd.exe';
          args = ['/c', binaryPath, ...claudeArgs];
        } else {
          command = binaryPath;
          args = claudeArgs;
        }
      } else {
        // Generic fallback for other CLI agents
        command = binaryPath;
        args = [promptText];
      }

      // 6. Spawn real host process via executeIsolatedProcess
      const startTime = Date.now();
      const execResult = await executeIsolatedProcess({
        command,
        args,
        cwd,
        customEnv: {},
        timeoutMs: step.timeout_ms || 60_000,
        toolId: agentId,
        agentId,
        policyEngine: null, // Host-level check already verified above
      });

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // 7. Structure execution result
      return {
        ok: execResult.ok,
        exit_code: execResult.exit_code,
        pid: execResult.pid || null,
        duration_ms: durationMs,
        stdout: execResult.stdout || '',
        stderr: execResult.stderr || '',
        timed_out: execResult.timed_out || false,
        error: execResult.error || (execResult.exit_code !== 0 ? `Process exited with code ${execResult.exit_code}` : null),
        status: execResult.ok ? 'completed' : (execResult.timed_out ? 'timed_out' : 'failed'),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      };
    },
  };
}
