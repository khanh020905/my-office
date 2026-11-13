/**
 * QA Independent Review & Quality Gate API Routes (Phase 3).
 * Mounted under /api/qa/*
 */

export async function handleQaRoutes(req, res, {
  url,
  qaReviewEngine,
  masterOrchestrator,
  isLoopback,
  sameOriginOf,
  authorized,
  readJson,
  json,
}) {
  const pathname = url.pathname;

  // 1. Loopback & authorization checks
  // A write must come from the office's own page, even from this computer: any site open in the browser can POST to localhost.
  if (!sameOriginOf(req) && (req.method !== 'GET' || !isLoopback(req))) {
    json(res, 403, { ok: false, error: 'forbidden_origin' });
    return true;
  }
  if (!authorized(req, url)) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return true;
  }

  // GET /api/qa/overview
  if (req.method === 'GET' && pathname === '/api/qa/overview') {
    const stats = qaReviewEngine.getSummaryStats();
    json(res, 200, { ok: true, stats });
    return true;
  }

  // GET /api/qa/reviews
  if (req.method === 'GET' && pathname === '/api/qa/reviews') {
    const masterTaskId = url.searchParams.get('masterTaskId') || null;
    const status = url.searchParams.get('status') || null;
    const limit = Number(url.searchParams.get('limit') || 50);
    const reviews = qaReviewEngine.listReviews({ masterTaskId, status, limit });
    json(res, 200, { ok: true, reviews });
    return true;
  }

  // GET /api/qa/reviews/:id
  const reviewMatch = pathname.match(/^\/api\/qa\/reviews\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && reviewMatch) {
    const reviewId = reviewMatch[1];
    const review = qaReviewEngine.getReview(reviewId);
    if (!review) {
      json(res, 404, { ok: false, error: 'review_not_found' });
      return true;
    }
    json(res, 200, { ok: true, review });
    return true;
  }

  // POST /api/qa/reviews/evaluate
  if (req.method === 'POST' && pathname === '/api/qa/reviews/evaluate') {
    const body = await readJson(req).catch(() => ({}));
    const {
      masterTaskId,
      subtaskId = null,
      implementationAgent = 'claude-code',
      reviewerId = null,
      instruction = '',
      workingDirectory = process.cwd(),
      testResults = null,
      staticResults = null,
    } = body;

    if (!masterTaskId) {
      json(res, 400, { ok: false, error: 'missing_masterTaskId' });
      return true;
    }

    const masterTask = masterOrchestrator?.getMasterTask ? masterOrchestrator.getMasterTask(masterTaskId) : null;
    const subtasks = masterTask?.subtasks || [];

    const result = await qaReviewEngine.conductReview({
      masterTaskId,
      subtaskId,
      implementationAgent,
      reviewerId,
      instruction: instruction || masterTask?.description || masterTask?.title || '',
      workingDirectory: workingDirectory || masterTask?.workingDirectory || process.cwd(),
      testResults,
      staticResults,
      subtasks,
    });

    // Re-evaluate master task status if orchestrator is available
    if (masterOrchestrator?.refreshMasterTaskState) {
      masterOrchestrator.refreshMasterTaskState(masterTaskId);
    }

    json(res, 200, { ok: true, ...result });
    return true;
  }

  // GET /api/qa/findings
  if (req.method === 'GET' && pathname === '/api/qa/findings') {
    const masterTaskId = url.searchParams.get('masterTaskId') || null;
    const severity = url.searchParams.get('severity') || null;
    const status = url.searchParams.get('status') || null;
    const category = url.searchParams.get('category') || null;
    const limit = Number(url.searchParams.get('limit') || 100);

    const findings = qaReviewEngine.listFindings({ masterTaskId, severity, status, category, limit });
    json(res, 200, { ok: true, findings });
    return true;
  }

  // GET /api/qa/findings/:id
  const findingMatch = pathname.match(/^\/api\/qa\/findings\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && findingMatch) {
    const findingId = findingMatch[1];
    const finding = qaReviewEngine.getFinding(findingId);
    if (!finding) {
      json(res, 404, { ok: false, error: 'finding_not_found' });
      return true;
    }
    json(res, 200, { ok: true, finding });
    return true;
  }

  // POST /api/qa/findings/:id/accept-risk
  const acceptRiskMatch = pathname.match(/^\/api\/qa\/findings\/([a-zA-Z0-9_-]+)\/accept-risk$/);
  if (req.method === 'POST' && acceptRiskMatch) {
    const findingId = acceptRiskMatch[1];
    const body = await readJson(req).catch(() => ({}));
    const { reason, authorizedBy = 'authorized_user' } = body;

    if (!reason) {
      json(res, 400, { ok: false, error: 'missing_reason_for_risk_acceptance' });
      return true;
    }

    try {
      const updatedFinding = qaReviewEngine.acceptRisk({ findingId, reason, authorizedBy });
      if (masterOrchestrator?.refreshMasterTaskState && updatedFinding.masterTaskId) {
        masterOrchestrator.refreshMasterTaskState(updatedFinding.masterTaskId);
      }
      json(res, 200, { ok: true, finding: updatedFinding });
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
    }
    return true;
  }

  // GET /api/qa/gates/:masterTaskId
  const gateMatch = pathname.match(/^\/api\/qa\/gates\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && gateMatch) {
    const masterTaskId = gateMatch[1];
    const masterTask = masterOrchestrator?.getMasterTask ? masterOrchestrator.getMasterTask(masterTaskId) : null;
    if (!masterTask) {
      json(res, 404, { ok: false, error: 'master_task_not_found' });
      return true;
    }

    const reviews = qaReviewEngine.listReviews({ masterTaskId });
    const findings = qaReviewEngine.listFindings({ masterTaskId });
    const evidenceList = reviews.map((r) => qaReviewEngine.getEvidence(r.evidenceId)).filter(Boolean);

    const gateEval = qaReviewEngine.qualityGateEngine.evaluateGates({
      masterTask,
      evidenceList,
      findings,
    });

    json(res, 200, { ok: true, masterTaskId, evaluation: gateEval });
    return true;
  }

  // POST /api/qa/remediate
  if (req.method === 'POST' && pathname === '/api/qa/remediate') {
    const body = await readJson(req).catch(() => ({}));
    const { masterTaskId, findingIds = [] } = body;

    if (!masterTaskId || !Array.isArray(findingIds) || findingIds.length === 0) {
      json(res, 400, { ok: false, error: 'missing_masterTaskId_or_findingIds' });
      return true;
    }

    try {
      const plan = qaReviewEngine.createRemediationPlan({ masterTaskId, findingIds });
      json(res, 200, { ok: true, plan });
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
    }
    return true;
  }

  return false;
}
