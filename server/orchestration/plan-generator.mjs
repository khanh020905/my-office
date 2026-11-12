/**
 * Execution Plan Generator (Phase 6 Master Architecture §7).
 * Transforms task specifications, selected agents, and matched tools into deterministic,
 * DAG-compatible execution plans with step dependencies, fallback candidates, retry policies,
 * permission disclosures, and validation criteria.
 */

import crypto from 'node:crypto';

export function computePlanHash(plan) {
  if (!plan) return null;
  const canonical = {
    plan_version: plan.plan_version,
    task_id: plan.task_id,
    task_type: plan.task_type,
    selected_agent: plan.selected_agent,
    total_steps: plan.total_steps || plan.steps?.length || 0,
    required_permissions: Array.isArray(plan.required_permissions) ? [...plan.required_permissions].sort() : [],
    steps: (plan.steps || []).map((s) => ({
      step_id: s.step_id,
      title: s.title,
      agent_id: s.agent_id,
      tool_id: s.tool_id,
      capability_id: s.capability_id,
      protocol: s.protocol,
      required_permissions: Array.isArray(s.required_permissions) ? [...s.required_permissions].sort() : [],
      depends_on: Array.isArray(s.depends_on) ? [...s.depends_on].sort() : [],
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function createPlanGenerator() {
  return {
    /**
     * Generates an execution plan.
     */
    generatePlan({
      taskSpec,
      selectedAgent,
      matchedTools = [],
      fallbackTools = [],
      planVersion = 1,
    }) {
      if (!taskSpec) {
        throw new Error('taskSpec is required for plan generation');
      }

      const planId = `plan_${crypto.randomUUID()}`;
      const agentId = selectedAgent?.agent_id || 'claude-code';
      const steps = [];

      // Determine required permission scopes across all matched tools
      const aggregatedPermissions = new Set();
      if (taskSpec.needs_filesystem_read) aggregatedPermissions.add('fs:read');
      if (taskSpec.needs_filesystem_write) aggregatedPermissions.add('fs:write');
      if (taskSpec.needs_filesystem_delete) aggregatedPermissions.add('fs:delete');
      if (taskSpec.needs_network_access) aggregatedPermissions.add('net:outbound');
      if (taskSpec.needs_process_execution) aggregatedPermissions.add('process:exec');

      for (const t of matchedTools) {
        for (const p of t.required_permissions || []) {
          const s = typeof p === 'string' ? p : p.scope;
          if (s) aggregatedPermissions.add(s);
        }
      }

      // Single-tool vs Multi-tool steps
      if (taskSpec.task_type === 'architecture_analysis' && matchedTools.length === 0) {
        // Structured multi-step architecture assessment plan
        const archSteps = [
          {
            step_id: 'step_1',
            title: 'Inspect project structure',
            description: 'Inspect complete project directory layout, manifest files, and dependencies',
            capability_id: 'code_analysis',
            depends_on: [],
          },
          {
            step_id: 'step_2',
            title: 'Analyze frontend and backend',
            description: 'Analyze frontend components and backend service boundaries',
            capability_id: 'code_analysis',
            depends_on: ['step_1'],
          },
          {
            step_id: 'step_3',
            title: 'Inspect registry and lifecycle',
            description: 'Inspect Universal Tool Registry, discovery metadata, and tool lifecycle state machine',
            capability_id: 'code_analysis',
            depends_on: ['step_2'],
          },
          {
            step_id: 'step_4',
            title: 'Inspect agent integrations',
            description: 'Inspect multi-agent distribution, adapters, and agent detection status',
            capability_id: 'code_analysis',
            depends_on: ['step_3'],
          },
          {
            step_id: 'step_5',
            title: 'Inspect security and orchestration',
            description: 'Inspect security policies, permission registry, and dynamic task orchestration engine',
            capability_id: 'code_analysis',
            depends_on: ['step_4'],
          },
          {
            step_id: 'step_6',
            title: 'Produce architecture findings',
            description: 'Synthesize evidence-based architecture assessment, technical debt, and integration gaps',
            capability_id: 'code_analysis',
            depends_on: ['step_5'],
          },
        ];

        for (const s of archSteps) {
          steps.push({
            step_id: s.step_id,
            title: s.title,
            description: s.description,
            agent_id: agentId,
            tool_id: null,
            capability_id: s.capability_id,
            protocol: 'agent_native',
            entry_point: null,
            required_permissions: Array.from(aggregatedPermissions),
            depends_on: s.depends_on,
            timeout_ms: 60_000,
            retry_policy: { max_attempts: 1, backoff_ms: 0 },
            fallback_tools: [],
            expected_artifacts: s.step_id === 'step_6' ? (taskSpec.expected_output_artifacts || []) : [],
            status: 'pending',
          });
        }
      } else if (matchedTools.length === 0) {
        // Direct agent task without external tool
        steps.push({
          step_id: 'step_1',
          title: `Execute task with ${selectedAgent?.name || agentId}`,
          description: taskSpec.original_request,
          agent_id: agentId,
          tool_id: null,
          capability_id: null,
          protocol: 'agent_native',
          entry_point: null,
          required_permissions: Array.from(aggregatedPermissions),
          depends_on: [],
          timeout_ms: 120_000,
          retry_policy: { max_attempts: 2, backoff_ms: 1000 },
          fallback_tools: [],
          expected_artifacts: taskSpec.expected_output_artifacts || [],
          status: 'pending',
        });
      } else if (matchedTools.length === 1) {
        // Single tool step + optional validation step
        const tool = matchedTools[0];
        const primaryCap = tool.capabilities?.[0] || {};
        const fallbackIds = fallbackTools.map((f) => f.tool_id).filter((id) => id !== tool.tool_id);

        steps.push({
          step_id: 'step_1',
          title: `Run ${tool.name} (${primaryCap.name || 'primary'})`,
          description: `Execute capability ${primaryCap.capability_id || 'tool'} via ${agentId}`,
          agent_id: agentId,
          tool_id: tool.tool_id,
          capability_id: primaryCap.capability_id || null,
          protocol: primaryCap.protocol || tool.integration_protocols?.[0] || 'cli',
          entry_point: primaryCap.entry_point || null,
          required_permissions: tool.required_permissions?.map((p) => (typeof p === 'string' ? p : p.scope)) || ['process:exec'],
          depends_on: [],
          timeout_ms: 60_000,
          retry_policy: { max_attempts: 2, backoff_ms: 1500 },
          fallback_tools: fallbackIds,
          expected_artifacts: taskSpec.expected_output_artifacts || [],
          status: 'pending',
        });

        // Validation step if artifacts are expected
        if (taskSpec.expected_output_artifacts?.length > 0) {
          steps.push({
            step_id: 'step_2',
            title: 'Validate Output Artifacts',
            description: `Verify that expected artifacts were produced: ${taskSpec.expected_output_artifacts.join(', ')}`,
            agent_id: agentId,
            tool_id: null,
            capability_id: 'artifact_validation',
            protocol: 'system_verify',
            entry_point: null,
            required_permissions: ['fs:read'],
            depends_on: ['step_1'],
            timeout_ms: 15_000,
            retry_policy: { max_attempts: 1, backoff_ms: 0 },
            fallback_tools: [],
            expected_artifacts: taskSpec.expected_output_artifacts,
            status: 'pending',
          });
        }
      } else {
        // Multi-tool pipeline (sequential DAG with dependencies)
        matchedTools.forEach((tool, idx) => {
          const stepNum = idx + 1;
          const prevStepId = idx > 0 ? `step_${idx}` : null;
          const primaryCap = tool.capabilities?.[0] || {};
          const fallbackIds = fallbackTools.map((f) => f.tool_id).filter((id) => id !== tool.tool_id);

          steps.push({
            step_id: `step_${stepNum}`,
            title: `Step ${stepNum}: ${tool.name}`,
            description: `Execute ${tool.name} capability ${primaryCap.capability_id || 'run'}`,
            agent_id: agentId,
            tool_id: tool.tool_id,
            capability_id: primaryCap.capability_id || null,
            protocol: primaryCap.protocol || tool.integration_protocols?.[0] || 'cli',
            entry_point: primaryCap.entry_point || null,
            required_permissions: tool.required_permissions?.map((p) => (typeof p === 'string' ? p : p.scope)) || ['process:exec'],
            depends_on: prevStepId ? [prevStepId] : [],
            timeout_ms: 60_000,
            retry_policy: { max_attempts: 2, backoff_ms: 1500 },
            fallback_tools: fallbackIds,
            expected_artifacts: idx === matchedTools.length - 1 ? (taskSpec.expected_output_artifacts || []) : [],
            status: 'pending',
          });
        });
      }

      // Determine if human approval is required
      const requiresApproval =
        taskSpec.requires_human_approval ||
        taskSpec.risk_level === 'high' ||
        taskSpec.risk_level === 'critical' ||
        aggregatedPermissions.has('fs:write') ||
        aggregatedPermissions.has('fs:delete') ||
        aggregatedPermissions.has('secrets:read');

      const generatedPlan = {
        plan_id: planId,
        plan_version: planVersion,
        task_id: taskSpec.task_id,
        task_type: taskSpec.task_type,
        selected_agent: agentId,
        steps,
        total_steps: steps.length,
        required_permissions: Array.from(aggregatedPermissions),
        requires_human_approval: requiresApproval,
        approval_status: requiresApproval ? 'pending' : 'auto_approved',
        fallback_strategy: fallbackTools.length > 0 ? 'capability_equivalent_fallback' : 'fail_safe_abort',
        completion_criteria: taskSpec.completion_criteria || ['All steps complete with exit code 0'],
        created_at: new Date().toISOString(),
      };

      generatedPlan.plan_hash = computePlanHash(generatedPlan);
      return generatedPlan;
    },
  };
}

