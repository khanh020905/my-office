/**
 * REST API Endpoints for Autonomous Trial Monitor (Phase 5.1).
 * Mounted under /api/trial-monitor/*
 *
 * Provides endpoints for:
 * - /api/trial-monitor/status: Overall monitor status and health
 * - /api/trial-monitor/snapshots: Historical telemetry snapshots
 * - /api/trial-monitor/alerts: Active and historical anomaly alerts
 * - /api/trial-monitor/gaps: Telemetry gap log
 * - /api/trial-monitor/reports/daily: List or generate daily operational reports
 * - /api/trial-monitor/reports/final: List or generate final 7-day assessment
 * - /api/trial-monitor/reports/:name: Fetch a specific report by filename
 *
 * Guarded by loopback and authorization checks.
 * Strictly read-only observation semantics.
 */

export async function handleTrialMonitorRoutes(req, res, {
  url,
  trialMonitor = null,
  collector = null,
  scheduler = null,
  anomalyDetector = null,
  reportGenerator = null,
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

  if (!pathname.startsWith('/api/trial-monitor')) {
    return false;
  }

  // 1. Loopback and authorization guard
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }
  // A write must come from the office's own page: any site open in the browser can POST to localhost.
  if (method !== 'GET' && !sameOriginOf(req)) {
    json(res, 403, { ok: false, error: 'forbidden_origin' });
    return true;
  }

  // Resolve components from trialMonitor if provided
  const activeScheduler = scheduler || (trialMonitor ? trialMonitor.scheduler : null);
  const activeCollector = collector || (trialMonitor ? trialMonitor.collector : null);
  const activeDetector = anomalyDetector || (trialMonitor ? trialMonitor.anomalyDetector : null);
  const activeReporter = reportGenerator || (trialMonitor ? trialMonitor.reportGenerator : null);

  // 2. GET /api/trial-monitor/status
  if (method === 'GET' && pathname === '/api/trial-monitor/status') {
    const isRunning = trialMonitor?.isRunning
      ? trialMonitor.isRunning()
      : activeScheduler
        ? (typeof activeScheduler.isRunning === 'function' ? activeScheduler.isRunning() : activeScheduler.status === 'running')
        : false;

    const status = trialMonitor
      ? trialMonitor.getStatus()
      : {
          isRunning,
          status: activeScheduler?.status || 'idle',
          uptimeSeconds: process.uptime(),
          snapshotsCount: activeScheduler ? (activeScheduler.listSnapshots?.({ limit: 10000 })?.length ?? activeScheduler.snapshots?.length ?? 0) : 0,
          alertsCount: activeScheduler ? (activeScheduler.listAlerts?.({ limit: 10000 })?.length ?? activeScheduler.alerts?.length ?? 0) : 0,
          gapsCount: activeScheduler ? (activeScheduler.listGaps?.({ limit: 1000 })?.length ?? activeScheduler.gaps?.length ?? 0) : 0,
        };

    json(res, 200, {
      ok: true,
      timestamp: Date.now(),
      status,
    });
    return true;
  }

  // 3. GET /api/trial-monitor/snapshots
  if (method === 'GET' && pathname === '/api/trial-monitor/snapshots') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const since = parseInt(url.searchParams.get('since') || '0', 10);

    let snapshots = [];
    if (trialMonitor?.getSnapshots) {
      snapshots = trialMonitor.getSnapshots({ limit, since });
    } else if (activeScheduler?.listSnapshots) {
      snapshots = activeScheduler.listSnapshots({ limit, since });
    } else if (activeScheduler?.getSnapshots) {
      snapshots = activeScheduler.getSnapshots();
      if (since > 0) {
        snapshots = snapshots.filter((s) => (s.timestamp || 0) >= since);
      }
      if (limit > 0) {
        snapshots = snapshots.slice(-limit);
      }
    }

    json(res, 200, {
      ok: true,
      count: snapshots.length,
      snapshots,
    });
    return true;
  }

  // 4. POST /api/trial-monitor/snapshots/collect - On-demand snapshot trigger
  if (method === 'POST' && (pathname === '/api/trial-monitor/snapshots/collect' || pathname === '/api/trial-monitor/snapshots')) {
    let snapshot = null;
    if (trialMonitor?.collectNow) {
      snapshot = await trialMonitor.collectNow();
    } else if (activeScheduler?.sampleNow) {
      snapshot = await activeScheduler.sampleNow();
    } else if (activeCollector?.collectSnapshot) {
      snapshot = await activeCollector.collectSnapshot();
    }

    json(res, 200, {
      ok: true,
      timestamp: Date.now(),
      snapshot,
    });
    return true;
  }

  // 5. GET /api/trial-monitor/alerts
  if (method === 'GET' && pathname === '/api/trial-monitor/alerts') {
    const severity = url.searchParams.get('severity');
    const code = url.searchParams.get('code');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    let alerts = [];
    if (trialMonitor?.getAlerts) {
      alerts = trialMonitor.getAlerts({ severity, code, status, limit });
    } else if (activeScheduler?.listAlerts) {
      alerts = activeScheduler.listAlerts({ severity, code, limit });
      if (status === 'resolved') {
        alerts = alerts.filter((a) => a.resolved === true);
      } else if (status === 'unresolved') {
        alerts = alerts.filter((a) => a.resolved !== true);
      }
    } else if (activeScheduler?.getAlerts) {
      alerts = activeScheduler.getAlerts();
      if (severity) {
        alerts = alerts.filter((a) => a.severity === severity);
      }
      if (code) {
        alerts = alerts.filter((a) => a.code === code);
      }
      if (status === 'resolved') {
        alerts = alerts.filter((a) => a.resolved === true);
      } else if (status === 'unresolved') {
        alerts = alerts.filter((a) => a.resolved !== true);
      }
      if (limit > 0) {
        alerts = alerts.slice(-limit);
      }
    }

    json(res, 200, {
      ok: true,
      count: alerts.length,
      alerts,
    });
    return true;
  }

  // 6. GET /api/trial-monitor/gaps
  if (method === 'GET' && pathname === '/api/trial-monitor/gaps') {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    let gaps = [];
    if (trialMonitor?.getGaps) {
      gaps = trialMonitor.getGaps({ limit });
    } else if (activeScheduler?.listGaps) {
      gaps = activeScheduler.listGaps({ limit });
    } else if (activeScheduler?.getGaps) {
      gaps = activeScheduler.getGaps();
      if (limit > 0) {
        gaps = gaps.slice(-limit);
      }
    }

    const totalDurationMs = gaps.reduce((acc, g) => acc + (g.durationMs || 0), 0);

    json(res, 200, {
      ok: true,
      count: gaps.length,
      totalDurationMs,
      gaps,
    });
    return true;
  }

  // 7. GET or POST /api/trial-monitor/reports/daily
  if (pathname === '/api/trial-monitor/reports/daily') {
    if (method === 'GET') {
      const dayParam = url.searchParams.get('day');
      if (dayParam) {
        const dayNumber = parseInt(dayParam, 10) || 1;
        let report = null;
        if (activeReporter) {
          report = await activeReporter.generateDailyReport(dayNumber);
        } else if (trialMonitor?.generateDailyReport) {
          report = await trialMonitor.generateDailyReport(dayNumber);
        }
        json(res, 200, { ok: true, report });
        return true;
      }

      // Return list of all daily reports
      let reports = [];
      if (activeReporter?.listReports) {
        reports = await activeReporter.listReports();
        reports = reports.filter((r) => r.name.startsWith('day-'));
      }
      json(res, 200, { ok: true, count: reports.length, reports });
      return true;
    }

    if (method === 'POST') {
      const body = await readJson(req).catch(() => ({}));
      const dayNumber = parseInt(body.day || url.searchParams.get('day') || '1', 10);
      let report = null;
      if (activeReporter) {
        report = await activeReporter.generateDailyReport(dayNumber, body);
      } else if (trialMonitor?.generateDailyReport) {
        report = await trialMonitor.generateDailyReport(dayNumber, body);
      }
      json(res, 200, { ok: true, report });
      return true;
    }
  }

  // 8. GET or POST /api/trial-monitor/reports/final
  if (pathname === '/api/trial-monitor/reports/final') {
    if (method === 'GET' || method === 'POST') {
      const body = method === 'POST' ? await readJson(req).catch(() => ({})) : {};
      let report = null;
      if (activeReporter) {
        report = await activeReporter.generateFinalAssessment(body);
      } else if (trialMonitor?.generateFinalAssessment) {
        report = await trialMonitor.generateFinalAssessment(body);
      }
      json(res, 200, { ok: true, report });
      return true;
    }
  }

  // 9. GET /api/trial-monitor/reports/:name - Specific report file
  const reportPrefix = '/api/trial-monitor/reports/';
  if (method === 'GET' && pathname.startsWith(reportPrefix) && pathname !== '/api/trial-monitor/reports/') {
    const reportName = pathname.slice(reportPrefix.length);
    if (!reportName || reportName.includes('..') || reportName.includes('/')) {
      json(res, 400, { ok: false, error: 'Invalid report name' });
      return true;
    }

    if (activeReporter?.getReport) {
      const report = await activeReporter.getReport(reportName);
      if (!report.exists) {
        json(res, 404, { ok: false, error: 'Report not found', name: reportName });
        return true;
      }
      json(res, 200, {
        ok: true,
        name: report.fileName,
        path: report.filePath,
        content: report.content,
      });
      return true;
    }

    json(res, 500, { ok: false, error: 'Report generator not available' });
    return true;
  }

  // 10. POST /api/trial-monitor/trial/start - Officially authorizes 7-day trial start
  if (method === 'POST' && pathname === '/api/trial-monitor/trial/start') {
    const body = await readJson(req).catch(() => ({}));
    let trialInfo = null;
    if (trialMonitor?.startOfficialTrial) {
      trialInfo = trialMonitor.startOfficialTrial(body);
    } else if (activeScheduler?.startOfficialTrial) {
      trialInfo = activeScheduler.startOfficialTrial(body);
    }
    json(res, 200, {
      ok: true,
      trialStartAt: trialInfo,
      status: trialMonitor?.getStatus?.() || activeScheduler?.getStatus?.() || {},
    });
    return true;
  }

  // Endpoint not matched under /api/trial-monitor
  json(res, 404, { ok: false, error: 'Trial monitor endpoint not found' });
  return true;
}
