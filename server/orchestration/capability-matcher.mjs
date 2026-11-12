/**
 * Capability Matcher & Tool Ranker (Phase 6 Master Architecture §5).
 * Discovers, filters, evaluates eligibility, and ranks candidate tools from the Universal Tool Registry.
 * Enforces hard security and lifecycle gates, transparent scoring, and explainable selections.
 */

export const DEFAULT_SCORING_WEIGHTS = {
  capability_coverage: 0.35,
  agent_compatibility: 0.15,
  health_availability: 0.15,
  distribution_readiness: 0.10,
  reliability_history: 0.10,
  performance_efficiency: 0.10,
  version_suitability: 0.05,
};

export function createCapabilityMatcher({
  registry,
  distributionEngine = null,
  policyEngine = null,
  permissionRegistry = null,
  weights = DEFAULT_SCORING_WEIGHTS,
} = {}) {
  // Retain for extensible permission-aware filtering hooks
  void permissionRegistry;
  return {
    /**
     * Matches and ranks tools for a given task specification and target agent.
     */
    matchTools(taskSpec, { targetAgent = null } = {}) {
      if (!registry) {
        throw new Error('Tool registry is required for capability matching');
      }

      const requiredCaps = Array.isArray(taskSpec?.required_capabilities)
        ? taskSpec.required_capabilities
        : [];

      const allTools = registry.listTools();
      const rankedCandidates = [];
      const rejectedCandidates = [];
      const coveredCapabilities = new Set();

      for (const tool of allTools) {
        const rejectionReasons = [];

        // 1. HARD ELIGIBILITY GATE: Installation & Lifecycle State
        const isInstalled = tool.installation_status === 'installed' || tool.installation_status === 'healthy';
        if (!isInstalled) {
          rejectionReasons.push(`Tool is not installed (installation_status: '${tool.installation_status}')`);
        }

        if (tool.enabled_status !== true) {
          rejectionReasons.push('Tool is currently disabled in registry');
        }

        if (tool.security_audit_status === 'quarantined') {
          rejectionReasons.push('Tool is quarantined due to security risks or policy violations');
        }

        if (tool.lifecycle_state === 'failed' || tool.lifecycle_state === 'uninstalling' || tool.lifecycle_state === 'uninstalled') {
          rejectionReasons.push(`Tool is in invalid lifecycle state: '${tool.lifecycle_state}'`);
        }

        if (tool.health_status === 'unhealthy') {
          rejectionReasons.push('Tool health check status is unhealthy');
        }

        // 2. HARD ELIGIBILITY GATE: Target Agent Compatibility
        let isAgentCompatible = true;
        if (targetAgent) {
          const compatibleAgents = tool.compatible_agents || [];
          const supportedAgents = tool.supported_agents || [];
          isAgentCompatible = compatibleAgents.includes(targetAgent) || supportedAgents.includes(targetAgent);
          if (!isAgentCompatible) {
            rejectionReasons.push(`Tool is incompatible with target agent '${targetAgent}'`);
          }
        }

        // 3. HARD ELIGIBILITY GATE: Security Policy Check
        let permissionStatus = 'AUTHORIZED';
        if (policyEngine) {
          // Check if any required permissions are globally denied or blocked
          for (const perm of tool.required_permissions || []) {
            const scope = typeof perm === 'string' ? perm : perm.scope;
            const evalResult = policyEngine.evaluateOperation({
              toolId: tool.tool_id,
              agentId: targetAgent || 'claude-code',
              operation: scope,
              requestedScopes: [scope],
            });

            if (evalResult.status === 'DENY') {
              rejectionReasons.push(`Tool operation scope '${scope}' is denied by security policy: ${evalResult.reason}`);
              permissionStatus = 'DENIED';
              break;
            } else if (evalResult.status === 'REQUIRES_APPROVAL') {
              permissionStatus = 'REQUIRES_APPROVAL';
            }
          }
        }

        // 4. Capability Coverage Evaluation
        const toolCapabilities = tool.capabilities || [];
        const matchedCapsForTool = [];

        for (const reqCap of requiredCaps) {
          const found = toolCapabilities.find(
            (c) =>
              c.capability_id === reqCap ||
              c.capability_id.toLowerCase().includes(reqCap.toLowerCase()) ||
              c.name.toLowerCase().includes(reqCap.toLowerCase()) ||
              reqCap.toLowerCase().includes(c.capability_id.toLowerCase())
          );
          if (found) {
            matchedCapsForTool.push(reqCap);
          }
        }

        if (matchedCapsForTool.length === 0 && requiredCaps.length > 0) {
          rejectionReasons.push(`Tool does not satisfy any required capabilities: ${requiredCaps.join(', ')}`);
        }

        // Check distribution readiness if targetAgent is specified
        let isDistributed = false;
        let distributionRecord = null;
        if (distributionEngine && targetAgent) {
          const distList = distributionEngine.listDistributions
            ? distributionEngine.listDistributions({ toolId: tool.tool_id, agentId: targetAgent })
            : [];
          if (distList.length > 0) {
            isDistributed = true;
            distributionRecord = distList[0];
          }
        }

        // IF REJECTED BY HARD GATES:
        if (rejectionReasons.length > 0) {
          rejectedCandidates.push({
            tool_id: tool.tool_id,
            name: tool.name,
            version: tool.version,
            rejection_reasons: rejectionReasons,
            matched_capabilities: matchedCapsForTool,
            installation_status: tool.installation_status,
            health_status: tool.health_status,
            enabled_status: tool.enabled_status,
          });
          continue;
        }

        // Record capabilities covered by eligible candidate
        for (const c of matchedCapsForTool) {
          coveredCapabilities.add(c);
        }

        // 5. SCORING CALCULATION (Weighted 0.0 - 1.0)
        // Capability Coverage score
        const coverageRatio = requiredCaps.length > 0
          ? matchedCapsForTool.length / requiredCaps.length
          : 1.0;

        // Health score
        const healthScore = tool.health_status === 'healthy' ? 1.0 : tool.health_status === 'degraded' ? 0.6 : 0.2;

        // Distribution score
        const distScore = isDistributed ? 1.0 : 0.5;

        // Reliability score (based on usage history success rate)
        let reliabilityScore = 0.8;
        if (tool.usage_metrics && tool.usage_metrics.invocations_count > 0) {
          const successRatio = tool.usage_metrics.successful_invocations / tool.usage_metrics.invocations_count;
          reliabilityScore = Math.max(0.2, Math.min(1.0, successRatio));
        }

        // Performance / efficiency score
        const perfScore = tool.performance_rating || 0.8;

        // Agent compatibility score
        const agentScore = isAgentCompatible ? 1.0 : 0.0;

        // Version suitability score
        const versionScore = 1.0;

        const totalScore = (
          coverageRatio * weights.capability_coverage +
          agentScore * weights.agent_compatibility +
          healthScore * weights.health_availability +
          distScore * weights.distribution_readiness +
          reliabilityScore * weights.reliability_history +
          perfScore * weights.performance_efficiency +
          versionScore * weights.version_suitability
        );

        rankedCandidates.push({
          tool_id: tool.tool_id,
          name: tool.name,
          version: tool.version,
          score: Number(totalScore.toFixed(3)),
          matched_capabilities: matchedCapsForTool,
          unmatched_capabilities: requiredCaps.filter((c) => !matchedCapsForTool.includes(c)),
          capabilities: toolCapabilities,
          integration_protocols: tool.integration_protocols || [],
          required_permissions: tool.required_permissions || [],
          permission_status: permissionStatus,
          is_distributed: isDistributed,
          distribution_record: distributionRecord,
          health_status: tool.health_status,
          installation_status: tool.installation_status,
          reasons: [
            `Covers ${matchedCapsForTool.length}/${requiredCaps.length} required capabilities`,
            `Health is ${tool.health_status}`,
            isDistributed ? `Already distributed to ${targetAgent}` : `Not yet distributed to ${targetAgent}`,
            permissionStatus === 'AUTHORIZED' ? 'Permissions currently active' : 'Permissions require explicit approval',
          ],
        });
      }

      // Sort ranked candidates by score descending
      rankedCandidates.sort((a, b) => b.score - a.score);

      const missingCaps = requiredCaps.filter((c) => !coveredCapabilities.has(c));

      // Explanation
      let explanation = '';
      if (rankedCandidates.length === 0) {
        explanation = `No eligible tools found for capabilities: ${requiredCaps.join(', ')}. All candidates were rejected by eligibility gates or missing capabilities.`;
      } else {
        const top = rankedCandidates[0];
        explanation = `Selected tool '${top.name}' (${top.tool_id}) with match score ${(top.score * 100).toFixed(1)}%. Matched: ${top.matched_capabilities.join(', ')}.`;
        if (missingCaps.length > 0) {
          explanation += ` Warning: Missing required capabilities: ${missingCaps.join(', ')}.`;
        }
      }

      return {
        ranked_candidates: rankedCandidates,
        rejected_candidates: rejectedCandidates,
        matched_capabilities: Array.from(coveredCapabilities),
        missing_capabilities: missingCaps,
        all_capabilities_satisfied: missingCaps.length === 0,
        explanation,
      };
    },
  };
}
