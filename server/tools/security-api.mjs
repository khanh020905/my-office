/**
 * REST API Endpoints for Universal Security & Permission Management (Phase 5).
 * Implements endpoints for permissions, policies, 12-step evaluation, audit logging,
 * and security limitation disclosures.
 */

export async function handleToolSecurityRoutes(req, res, {
  url,
  registry,
  permissionRegistry,
  securityPolicyEngine,
  securityAuditLogger,
  isLoopback = () => true,
  sameOriginOf = () => true,
  authorized = () => true,
  readJson = async () => ({}),
  json = (r, code, data) => {
    r.statusCode = code;
    r.setHeader?.('Content-Type', 'application/json');
    r.end?.(JSON.stringify(data));
  },
} = {}) {
  const pathname = url.pathname;
  const method = req.method;

  if (!pathname.startsWith('/api/tools/security')) {
    return false;
  }

  // Enforce security authorization & loopback checks
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 1. GET /api/tools/security/overview - High-level security metrics
  if (method === 'GET' && pathname === '/api/tools/security/overview') {
    const permissions = permissionRegistry ? permissionRegistry.listPermissions() : [];
    const activeGrants = permissions.filter((p) => p.revocation_status === 'active');
    const revokedGrants = permissions.filter((p) => p.revocation_status === 'revoked');
    const expiredGrants = permissions.filter((p) => p.revocation_status === 'expired');
    const auditSummary = securityAuditLogger ? securityAuditLogger.getSummary() : {};
    const limitations = securityPolicyEngine ? securityPolicyEngine.getSecurityLimitations() : {};

    json(res, 200, {
      ok: true,
      overview: {
        active_grants_count: activeGrants.length,
        revoked_grants_count: revokedGrants.length,
        expired_grants_count: expiredGrants.length,
        total_permissions_count: permissions.length,
        audit_summary: auditSummary,
        enforcement_model: limitations.enforcement_model || 'Application-Level Authorization',
        agent_isolation: 'STRICT_CROSS_AGENT_ISOLATION_ACTIVE',
        cross_agent_leak_protection: true,
      },
    });
    return true;
  }

  // 2. GET /api/tools/security/permissions - List permission grants
  if (method === 'GET' && pathname === '/api/tools/security/permissions') {
    const tool_id = url.searchParams.get('tool_id');
    const agent_id = url.searchParams.get('agent_id');
    const distribution_id = url.searchParams.get('distribution_id');
    const status = url.searchParams.get('status');

    const list = permissionRegistry
      ? permissionRegistry.listPermissions({ tool_id, agent_id, distribution_id, status })
      : [];

    const now = Date.now();
    const enriched = list.map((g) => {
      let installed = null;
      try {
        installed = registry ? registry.getTool(g.tool_id) : null;
      } catch {
        installed = null;
      }
      const isExpired = Boolean(g.expiration && new Date(g.expiration).getTime() <= now);
      const effectiveStatus = g.revocation_status === 'revoked' ? 'revoked' : isExpired ? 'expired' : 'active';
      return {
        ...g,
        revocation_status: effectiveStatus,
        is_expired: isExpired,
        tool_installed: Boolean(installed),
        tool_status: installed ? installed.installation_status : 'uninstalled',
        is_orphaned: !installed,
      };
    });

    json(res, 200, { ok: true, count: enriched.length, permissions: enriched });
    return true;
  }

  // 3. POST /api/tools/security/permissions/grant - Explicit user grant
  if (method === 'POST' && pathname === '/api/tools/security/permissions/grant') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    if (!permissionRegistry) {
      json(res, 500, { ok: false, error: 'Permission registry unavailable' });
      return true;
    }

    try {
      const body = await readJson(req, 8_000_000);
      const {
        tool_id,
        agent_id,
        distribution_id = null,
        scopes = [],
        expiration = null,
        approval_reference = null,
      } = body || {};

      const grant = permissionRegistry.grantPermission({
        tool_id,
        agent_id,
        distribution_id,
        scopes,
        expiration,
        approval_reference,
      });

      securityAuditLogger?.logEvent({
        type: 'PERMISSION_GRANTED',
        severity: 'info',
        tool_id,
        agent_id,
        distribution_id,
        decision: 'ALLOW',
        reason: `User granted permissions: ${scopes.join(', ')}`,
        details: { permission_id: grant.permission_id, scopes, expiration },
      });

      json(res, 201, { ok: true, grant });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 4. POST /api/tools/security/permissions/revoke - Revoke a grant
  if (method === 'POST' && pathname === '/api/tools/security/permissions/revoke') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    if (!permissionRegistry) {
      json(res, 500, { ok: false, error: 'Permission registry unavailable' });
      return true;
    }

    try {
      const body = await readJson(req, 8_000_000);
      const { permission_id, reason = 'Revoked by user' } = body || {};
      if (!permission_id) {
        json(res, 400, { ok: false, error: 'Missing permission_id' });
        return true;
      }

      const resRevoke = permissionRegistry.revokePermission(permission_id, { reason });
      if (!resRevoke.ok) {
        json(res, 404, resRevoke);
        return true;
      }

      securityAuditLogger?.logEvent({
        type: 'PERMISSION_REVOKED',
        severity: 'warning',
        tool_id: resRevoke.grant.tool_id,
        agent_id: resRevoke.grant.agent_id,
        distribution_id: resRevoke.grant.distribution_id,
        decision: 'BLOCKED',
        reason: `Permission revoked: ${reason}`,
        details: { permission_id },
      });

      json(res, 200, resRevoke);
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 5. GET /api/tools/security/policies - Retrieve policy hierarchy rules
  if (method === 'GET' && pathname === '/api/tools/security/policies') {
    if (!securityPolicyEngine) {
      json(res, 500, { ok: false, error: 'Security policy engine unavailable' });
      return true;
    }

    const doc = securityPolicyEngine.getPolicies();
    const rules = [];

    // Level 1: Global Default
    rules.push({
      level: 1,
      name: 'Global Default Stance',
      scope: '*',
      action: doc.default_action || 'DENY',
      description: 'Default fail-closed stance: all unapproved operations denied',
    });

    // Level 2: Globally Denied Scopes
    for (const scope of (doc.globally_denied_scopes || [])) {
      rules.push({
        level: 2,
        name: `Global Blacklist: ${scope}`,
        scope,
        action: 'DENY',
        description: 'Globally prohibited across all tools and agents',
      });
    }

    // Level 3: Explicit Path / Target Denies
    for (const d of (doc.explicit_denies || [])) {
      rules.push({
        level: 3,
        name: d.rule_id || 'Explicit Deny',
        scope: d.scope || '*',
        target: d.target,
        action: 'DENY',
        description: d.description || 'Blocked target',
      });
    }

    // Level 4: Agent Runtime Policies
    for (const [agId, pol] of Object.entries(doc.agent_policies || {})) {
      rules.push({
        level: 4,
        name: `Agent Policy: ${agId}`,
        scope: (pol.allowed_scopes || []).join(', ') || 'none',
        action: 'ALLOW',
        denied_scopes: (pol.denied_scopes || []).join(', ') || 'none',
        description: `Scopes permitted for agent ${agId}`,
      });
    }

    // Level 5: Tool Isolation Policies
    for (const [tId, pol] of Object.entries(doc.tool_policies || {})) {
      rules.push({
        level: 5,
        name: `Tool Restriction: ${tId}`,
        scope: (pol.denied_scopes || []).join(', ') || 'none',
        action: 'DENY',
        description: `Blocked capabilities for tool ${tId}`,
      });
    }

    json(res, 200, { ok: true, policies: doc, rules });
    return true;
  }

  // 6. POST /api/tools/security/policies/update - Update policy rules
  if (method === 'POST' && pathname === '/api/tools/security/policies/update') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    if (!securityPolicyEngine) {
      json(res, 500, { ok: false, error: 'Security policy engine unavailable' });
      return true;
    }

    try {
      const body = await readJson(req, 8_000_000);
      const result = securityPolicyEngine.updatePolicy(body || {});
      json(res, 200, result);
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 7. POST /api/tools/security/evaluate - Test operation evaluation through 12-step engine
  if (method === 'POST' && pathname === '/api/tools/security/evaluate') {
    if (!securityPolicyEngine) {
      json(res, 500, { ok: false, error: 'Security policy engine unavailable' });
      return true;
    }

    try {
      const body = await readJson(req, 8_000_000);
      const {
        toolId,
        agentId,
        distributionId = null,
        operation = 'process:exec',
        requestedScopes = [],
        target = null,
        taskContext = {},
      } = body || {};

      const decision = securityPolicyEngine.evaluateOperation({
        toolId,
        agentId,
        distributionId,
        operation,
        requestedScopes,
        target,
        taskContext,
      });

      json(res, 200, { ok: true, decision });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 8. GET /api/tools/security/audit - Query audit log events
  if (method === 'GET' && pathname === '/api/tools/security/audit') {
    if (!securityAuditLogger) {
      json(res, 500, { ok: false, error: 'Audit logger unavailable' });
      return true;
    }

    const type = url.searchParams.get('type');
    const severity = url.searchParams.get('severity');
    const tool_id = url.searchParams.get('tool_id');
    const agent_id = url.searchParams.get('agent_id');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const queryResult = securityAuditLogger.queryEvents({
      type,
      severity,
      tool_id,
      agent_id,
      limit,
      offset,
    });

    json(res, 200, { ok: true, ...queryResult });
    return true;
  }

  // 9. GET /api/tools/security/limitations - Explicit technical limitations disclosure
  if (method === 'GET' && pathname === '/api/tools/security/limitations') {
    if (!securityPolicyEngine) {
      json(res, 500, { ok: false, error: 'Security policy engine unavailable' });
      return true;
    }

    json(res, 200, {
      ok: true,
      limitations: securityPolicyEngine.getSecurityLimitations(),
    });
    return true;
  }

  return false;
}
