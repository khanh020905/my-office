/**
 * REST API Endpoints for Production Reliability, Observability & Disaster Recovery (Phase 5).
 * Mounted under /api/reliability/*
 * Handles process supervision, WAL journal inspection, startup reconciliation,
 * idempotency locks, and backup verification.
 */

export async function handleReliabilityRoutes(req, res, {
  url,
  journal = null,
  processSupervisor = null,
  reconciliationEngine = null,
  idempotencyEngine = null,
  backupManager = null,
  metricsCollector = null,
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

  if (!pathname.startsWith('/api/reliability')) {
    return false;
  }

  // 1. Loopback and authorization guard
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 2. GET /api/reliability/health - High level operational health
  if (method === 'GET' && pathname === '/api/reliability/health') {
    const journalStats = journal ? journal.getJournalStats() : null;
    const trackedProcesses = processSupervisor ? processSupervisor.listTrackedProcesses() : [];
    const report = reconciliationEngine ? reconciliationEngine.getReconciliationReport() : null;

    let status = 'healthy';
    if (journalStats?.corruptRecordsCount > 0 || (report && report.requiresInterventionTotal > 0)) {
      status = 'degraded';
    }

    json(res, 200, {
      ok: true,
      timestamp: Date.now(),
      status,
      journal: journalStats,
      processes: {
        trackedCount: trackedProcesses.length,
        orphans: trackedProcesses.filter((p) => p.state === 'orphan_detected').length,
        reassigned: trackedProcesses.filter((p) => p.state === 'reassigned_detected').length,
      },
      reconciliation: report
        ? {
            lastReconciledAt: report.timestamp,
            requiresInterventionTotal: report.requiresInterventionTotal,
          }
        : null,
    });
    return true;
  }

  // 3. GET /api/reliability/journal - Journal stats and recent WAL records
  if (method === 'GET' && pathname === '/api/reliability/journal') {
    if (!journal) {
      json(res, 500, { ok: false, error: 'Execution journal not initialized' });
      return true;
    }
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const stats = journal.getJournalStats();
    const fromSeq = Math.max(0, stats.currentSeq - limit);
    const events = journal.readEvents({ fromSeq, limit });

    json(res, 200, {
      ok: true,
      stats,
      eventsCount: events.length,
      events,
    });
    return true;
  }

  // 4. GET /api/reliability/processes - List tracked processes
  if (method === 'GET' && pathname === '/api/reliability/processes') {
    if (!processSupervisor) {
      json(res, 500, { ok: false, error: 'Process supervisor not initialized' });
      return true;
    }
    const state = url.searchParams.get('state');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const list = processSupervisor.listTrackedProcesses({ state, limit });

    json(res, 200, {
      ok: true,
      count: list.length,
      processes: list,
    });
    return true;
  }

  // 5. POST /api/reliability/processes/:id/terminate - Safe process termination
  const termMatch = pathname.match(/^\/api\/reliability\/processes\/([a-zA-Z0-9_-]+)\/terminate$/);
  if (method === 'POST' && termMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const executionId = termMatch[1];
      const body = await readJson(req, 1_000_000);
      const gracePeriodMs = body?.gracePeriodMs || 5000;
      const reason = body?.reason || 'Operator requested termination';

      const result = await processSupervisor.terminateProcessSafely(executionId, { gracePeriodMs, reason });
      json(res, 200, { ok: true, result });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 6. POST /api/reliability/reconcile - Run reconciliation sweep
  if (method === 'POST' && pathname === '/api/reliability/reconcile') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const dryRun = body?.dryRun === true;
      const report = reconciliationEngine.runReconciliation({ dryRun });
      json(res, 200, { ok: true, report });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 7. GET /api/reliability/reconcile/report - Latest reconciliation report
  if (method === 'GET' && pathname === '/api/reliability/reconcile/report') {
    const report = reconciliationEngine ? reconciliationEngine.getReconciliationReport() : null;
    json(res, 200, { ok: true, report });
    return true;
  }

  // 8. POST /api/reliability/reconcile/:id/resolve - Resolve operator intervention
  const resMatch = pathname.match(/^\/api\/reliability\/reconcile\/([a-zA-Z0-9_-]+)\/resolve$/);
  if (method === 'POST' && resMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const executionId = resMatch[1];
      const body = await readJson(req, 1_000_000);
      const decision = body?.decision;
      const notes = body?.notes || '';
      const operatorId = body?.operatorId || 'operator';

      if (!decision) {
        json(res, 400, { ok: false, error: 'decision is required (retry, mark_failed, mark_completed, cancel)' });
        return true;
      }

      const resolved = reconciliationEngine.resolveIntervention(executionId, { decision, operatorId, notes });
      json(res, 200, { ok: true, resolved });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 9. POST /api/reliability/idempotency/lock - Test/acquire idempotency lock
  if (method === 'POST' && pathname === '/api/reliability/idempotency/lock') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const key = body?.key;
      if (!key) {
        json(res, 400, { ok: false, error: 'key is required' });
        return true;
      }

      const lockRes = idempotencyEngine.acquireLock(key);
      if (lockRes.inProgress) {
        json(res, 409, {
          ok: false,
          error: 'CONCURRENT_REQUEST_IN_FLIGHT',
          retryAfterMs: lockRes.retryAfterMs,
        });
        return true;
      }

      json(res, 200, { ok: true, lock: lockRes });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 10. POST /api/reliability/idempotency/release - Release idempotency lock
  if (method === 'POST' && pathname === '/api/reliability/idempotency/release') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const key = body?.key;
      const reason = body?.reason || 'Operator release';
      const rel = idempotencyEngine.releaseLock(key, reason);
      json(res, 200, { ok: true, released: rel });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 11. GET /api/reliability/backups - List backups
  if (method === 'GET' && pathname === '/api/reliability/backups') {
    const list = backupManager && typeof backupManager.listBackups === 'function'
      ? backupManager.listBackups()
      : [];
    json(res, 200, { ok: true, count: list.length, backups: list });
    return true;
  }

  // 12. POST /api/reliability/backups/create - Create consistent backup
  if (method === 'POST' && pathname === '/api/reliability/backups/create') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      if (!backupManager || typeof backupManager.createConsistentBackup !== 'function') {
        json(res, 501, { ok: false, error: 'Backup manager not configured' });
        return true;
      }
      const body = await readJson(req, 1_000_000);
      const backup = await backupManager.createConsistentBackup(body || {});
      json(res, 201, { ok: true, backup });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 13. POST /api/reliability/backups/:id/verify - Dry-run sandbox restore
  const verifyMatch = pathname.match(/^\/api\/reliability\/backups\/([a-zA-Z0-9_-]+)\/verify$/);
  if (method === 'POST' && verifyMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const backupId = verifyMatch[1];
      if (!backupManager || typeof backupManager.verifyRestoreInSandbox !== 'function') {
        json(res, 501, { ok: false, error: 'Backup manager not configured' });
        return true;
      }
      const verifyRes = await backupManager.verifyRestoreInSandbox(backupId);
      json(res, 200, { ok: true, verification: verifyRes });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  return false;
}
