/**
 * Unit & Integration Tests for Trial Report Generator, Trial Monitor, and REST API (Phase 5.1).
 * Tests all reporter deliverables:
 * 1. trial-report-generator.mjs (Daily reports day-01..day-07 and FINAL-7-DAY-ASSESSMENT.md)
 * 2. trial-monitor.mjs (Core entrypoint coordinating collector, detector, scheduler, reporter)
 * 3. trial-monitor-api.mjs (REST API endpoints with loopback/auth guards)
 * 4. Strict Read-Only Invariant enforcement
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  generateDailyReport,
  generateFinalAssessment,
  createTrialReportGenerator,
} from '../../server/trial-monitor/trial-report-generator.mjs';
import {
  createTrialMonitor,
  TrialMonitor,
} from '../../server/trial-monitor/trial-monitor.mjs';
import {
  handleTrialMonitorRoutes,
} from '../../server/trial-monitor/trial-monitor-api.mjs';
import {
  ALERT_SEVERITIES,
  ALERT_CODES,
  HEALTH_STATUSES,
  createAlert,
  createTelemetryGap,
  createEmptyTelemetrySnapshot,
  assertReadOnlyCollector,
} from '../../server/trial-monitor/trial-contracts.mjs';
import { createTrialCollector } from '../../server/trial-monitor/trial-collector.mjs';
import { createTrialAnomalyDetector } from '../../server/trial-monitor/trial-anomaly-detector.mjs';
import { createTrialScheduler } from '../../server/trial-monitor/trial-scheduler.mjs';

describe('Trial Report Generator, Trial Monitor & REST API (Phase 5.1)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'trial-report-test-'));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Daily Operational Report Generation', () => {
    it('generates day-01.md with all required sections and strictly truthful metrics', async () => {
      const snapshots = [
        createEmptyTelemetrySnapshot({
          timestamp: Date.now() - 3600000,
          overallStatus: HEALTH_STATUSES.HEALTHY,
          systemHealth: {
            uptimeSeconds: 3600,
            nodeProcess: {
              pid: process.pid,
              uptimeSeconds: 3600,
              memoryUsage: { rss: 120 * 1024 * 1024 },
            },
          },
          reliability: {
            wal: { sequence: 42, corruptRecordsCount: 0 },
            processes: { orphans: 0 },
          },
          safety: {
            emergencyStop: { halted: false, state: 'idle' },
            autonomyLevel: 'supervised',
          },
        }),
      ];

      const alerts = [
        createAlert({
          severity: ALERT_SEVERITIES.SEV_4,
          code: ALERT_CODES.LATENCY_DEGRADATION,
          affectedTarget: 'MetricsCollector',
          evidence: { p95Ms: 16200 },
          recommendedAction: 'Monitor execution latency drift.',
          timestamp: Date.now() - 1800000,
        }),
      ];
      // Mark as resolved
      alerts[0].resolved = true;

      const gaps = [
        createTelemetryGap({
          startTime: Date.now() - 7200000,
          endTime: Date.now() - 7080000,
          durationMs: 120000,
          missedIntervals: 2,
          reason: 'Scheduled maintenance downtime',
        }),
      ];

      const res = await generateDailyReport({
        dayNumber: 1,
        date: '2026-11-12',
        snapshots,
        alerts,
        gaps,
        outputDir: tempDir,
        writeToFile: true,
      });

      assert.equal(res.fileName, 'day-01.md');
      assert.ok(fs.existsSync(res.filePath));

      const content = await fsp.readFile(res.filePath, 'utf8');

      // Verify required sections
      assert.ok(content.includes('# Operational Trial Daily Report: Day 01'));
      assert.ok(content.includes('## Executive Summary'));
      assert.ok(content.includes('## 1. Verified Stable'));
      assert.ok(content.includes('## 2. Verified Incidents'));
      assert.ok(content.includes('## 3. Unresolved Incidents'));
      assert.ok(content.includes('## 4. Monitoring Gaps'));
      assert.ok(content.includes('## 5. Not Tested'));
      assert.ok(content.includes('## 6. Recommendations'));

      // Truthfulness checks: missing metrics explicitly rendered as unmeasured
      assert.ok(content.includes('120.00 MB')); // Memory formatted
      assert.ok(content.includes('LATENCY_DEGRADATION'));
      assert.ok(content.includes('Scheduled maintenance downtime'));
      assert.ok(content.includes('Zero active or unresolved incidents'));
    });

    it('distinguishes unresolved incidents with explicit warning alert', async () => {
      const openAlert = createAlert({
        severity: ALERT_SEVERITIES.SEV_2,
        code: ALERT_CODES.ORPHAN_PROCESS_DETECTED,
        affectedTarget: 'ProcessSupervisor',
        evidence: { orphanPid: 9999 },
        recommendedAction: 'Operator must isolate and terminate rogue PID 9999.',
      });

      const res = await generateDailyReport({
        dayNumber: 2,
        alerts: [openAlert],
        outputDir: tempDir,
      });

      const content = res.content;
      assert.ok(content.includes('## 3. Unresolved Incidents'));
      assert.ok(content.includes('ORPHAN_PROCESS_DETECTED'));
      assert.ok(content.includes('9999'));
      assert.ok(content.includes('Operator must isolate and terminate rogue PID 9999.'));
      assert.equal(res.status, HEALTH_STATUSES.CRITICAL);
    });
  });

  describe('2. Final Comprehensive 7-Day Assessment', () => {
    it('generates FINAL-7-DAY-ASSESSMENT.md with longitudinal analysis and production verdict', async () => {
      const dailyReports = [
        { dayNumber: 1, dayStr: '01', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 2, dayStr: '02', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 1, totalGapDurationMs: 0 } },
        { dayNumber: 3, dayStr: '03', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 60000 } },
        { dayNumber: 4, dayStr: '04', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 5, dayStr: '05', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 6, dayStr: '06', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 7, dayStr: '07', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
      ];

      const res = await generateFinalAssessment({
        days: 7,
        dailyReports,
        outputDir: tempDir,
        writeToFile: true,
      });

      assert.equal(res.fileName, 'FINAL-7-DAY-ASSESSMENT.md');
      assert.ok(fs.existsSync(res.filePath));

      const content = await fsp.readFile(res.filePath, 'utf8');

      // Verify sections
      assert.ok(content.includes('# Autonomous Operations: Final 7-Day Operational Assessment'));
      assert.ok(content.includes('## Executive Summary'));
      assert.ok(content.includes('### Operational Scorecard'));
      assert.ok(content.includes('## 1. Verified Stable Subsystems'));
      assert.ok(content.includes('## 2. Verified Incidents'));
      assert.ok(content.includes('## 3. Unresolved Incidents'));
      assert.ok(content.includes('## 4. Monitoring Gaps'));
      assert.ok(content.includes('## 5. Not Tested'));
      assert.ok(content.includes('## 6. Recommendations'));
      assert.ok(content.includes('READY FOR PRODUCTION ROLLOUT'));
      assert.ok(parseFloat(res.availabilityPct) >= 99.0);
    });

    it('blocks production rollout verdict if critical incidents remain unresolved', async () => {
      const openSev1 = createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.EMERGENCY_STOP_TRIPPED,
        affectedTarget: 'EmergencyStopManager',
        evidence: { trippedBy: 'operator_manual_trip' },
        recommendedAction: 'Immediate root-cause inspection before releasing stop.',
      });

      const res = await generateFinalAssessment({
        days: 7,
        alerts: [openSev1],
        outputDir: tempDir,
      });

      assert.ok(res.verdict.startsWith('BLOCKED'));
      assert.ok(res.content.includes('BLOCKED: CRITICAL RELIABILITY / INTEGRITY ISSUES UNRESOLVED'));
    });
  });

  describe('3. TrialReportGenerator Factory Methods', () => {
    it('manages report generation, retrieval, and directory listing', async () => {
      const reporter = createTrialReportGenerator({ outputDir: tempDir });

      const d1 = await reporter.generateDailyReport(1, { writeToFile: true });
      const d2 = await reporter.generateDailyReport(2, { writeToFile: true });
      const finalRes = await reporter.generateFinalAssessment({ writeToFile: true });

      const list = await reporter.listReports();
      assert.equal(list.length, 3);
      assert.ok(list.some(r => r.name === 'day-01.md'));
      assert.ok(list.some(r => r.name === 'day-02.md'));
      assert.ok(list.some(r => r.name === 'FINAL-7-DAY-ASSESSMENT.md'));

      const fetched = await reporter.getReport('day-01.md');
      assert.equal(fetched.exists, true);
      assert.ok(fetched.content.includes('Day 01'));

      const notFound = await reporter.getReport('nonexistent.md');
      assert.equal(notFound.exists, false);
      assert.equal(notFound.content, null);
    });
  });

  describe('4. TrialMonitor Coordination & Read-Only Invariants', () => {
    it('initializes TrialMonitor and enforces strictly read-only invariant', () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
        intervalMs: 10000,
      });

      assert.equal(monitor.isReadOnly, true);
      assert.equal(typeof monitor.start, 'function');
      assert.equal(typeof monitor.stop, 'function');
      assert.equal(typeof monitor.collectNow, 'function');
      assert.equal(typeof monitor.getStatus, 'function');

      // Passes assertReadOnlyCollector check
      assert.doesNotThrow(() => assertReadOnlyCollector(monitor));

      // Attempting state mutation strictly throws READ_ONLY_INVARIANT_VIOLATION
      assert.throws(() => monitor.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.setAutonomyLevel(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.createBackup(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
    });

    it('coordinates sampling, alert collection, status reporting, and report generation', async () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
        intervalMs: 10000,
      });

      // Execute on-demand sample
      const sample = await monitor.collectNow();
      assert.ok(sample);
      assert.ok(sample.snapshot);
      assert.equal(sample.snapshot.readOnlyInvariant, true);

      // Verify status queries
      const status = monitor.getStatus();
      assert.equal(status.isReadOnly, true);
      assert.equal(status.snapshotCount, 1);
      assert.equal(typeof status.overallHealth, 'string');

      const snapshots = monitor.getSnapshots();
      assert.equal(snapshots.length, 1);

      // Generate daily report via monitor
      const report = await monitor.generateDailyReport(1);
      assert.equal(report.dayNumber, 1);
      assert.ok(fs.existsSync(report.filePath));

      const reportList = await monitor.listReports();
      assert.equal(reportList.length, 1);
    });
  });

  describe('5. REST API Endpoints (/api/trial-monitor/*)', () => {
    function createMockRes() {
      return {
        statusCode: null,
        headers: {},
        body: null,
        setHeader(name, val) {
          this.headers[name] = val;
        },
        end(data) {
          this.body = typeof data === 'string' ? JSON.parse(data) : data;
        },
      };
    }

    it('blocks unauthorized or non-loopback requests with 403 Forbidden', async () => {
      const req = { method: 'GET' };
      const res = createMockRes();
      const url = new URL('http://localhost:3000/api/trial-monitor/status');

      const handled = await handleTrialMonitorRoutes(req, res, {
        url,
        isLoopback: () => false, // Non-loopback request
        authorized: () => true,
      });

      assert.equal(handled, true);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.error, 'forbidden');
    });

    it('handles GET /api/trial-monitor/status', async () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
      });

      const req = { method: 'GET' };
      const res = createMockRes();
      const url = new URL('http://127.0.0.1:3000/api/trial-monitor/status');

      const handled = await handleTrialMonitorRoutes(req, res, {
        url,
        trialMonitor: monitor,
      });

      assert.equal(handled, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(typeof res.body.status, 'object');
      assert.equal(res.body.status.isReadOnly, true);
    });

    it('handles GET & POST /api/trial-monitor/snapshots', async () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
      });

      // 1. POST /api/trial-monitor/snapshots/collect
      const postReq = { method: 'POST' };
      const postRes = createMockRes();
      const postUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/snapshots/collect');

      await handleTrialMonitorRoutes(postReq, postRes, {
        url: postUrl,
        trialMonitor: monitor,
      });

      assert.equal(postRes.statusCode, 200);
      assert.equal(postRes.body.ok, true);
      assert.ok(postRes.body.snapshot);

      // 2. GET /api/trial-monitor/snapshots
      const getReq = { method: 'GET' };
      const getRes = createMockRes();
      const getUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/snapshots?limit=10');

      await handleTrialMonitorRoutes(getReq, getRes, {
        url: getUrl,
        trialMonitor: monitor,
      });

      assert.equal(getRes.statusCode, 200);
      assert.equal(getRes.body.ok, true);
      assert.equal(getRes.body.count, 1);
      assert.equal(getRes.body.snapshots.length, 1);
    });

    it('handles GET /api/trial-monitor/alerts and /api/trial-monitor/gaps', async () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
      });

      const alertReq = { method: 'GET' };
      const alertRes = createMockRes();
      const alertUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/alerts');

      await handleTrialMonitorRoutes(alertReq, alertRes, {
        url: alertUrl,
        trialMonitor: monitor,
      });

      assert.equal(alertRes.statusCode, 200);
      assert.equal(alertRes.body.ok, true);
      assert.ok(Array.isArray(alertRes.body.alerts));

      const gapReq = { method: 'GET' };
      const gapRes = createMockRes();
      const gapUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/gaps');

      await handleTrialMonitorRoutes(gapReq, gapRes, {
        url: gapUrl,
        trialMonitor: monitor,
      });

      assert.equal(gapRes.statusCode, 200);
      assert.equal(gapRes.body.ok, true);
      assert.ok(Array.isArray(gapRes.body.gaps));
    });

    it('handles GET /api/trial-monitor/reports/daily, /final, and /reports/:name', async () => {
      const monitor = createTrialMonitor({
        rootDir: tempDir,
        storePath: path.join(tempDir, 'state.json'),
        outputDir: tempDir,
      });

      // Generate day 1 report
      await monitor.generateDailyReport(1);

      // 1. GET /api/trial-monitor/reports/daily
      const listReq = { method: 'GET' };
      const listRes = createMockRes();
      const listUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/reports/daily');

      await handleTrialMonitorRoutes(listReq, listRes, {
        url: listUrl,
        trialMonitor: monitor,
      });

      assert.equal(listRes.statusCode, 200);
      assert.equal(listRes.body.ok, true);
      assert.equal(listRes.body.count, 1);

      // 2. GET /api/trial-monitor/reports/day-01.md
      const fileReq = { method: 'GET' };
      const fileRes = createMockRes();
      const fileUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/reports/day-01.md');

      await handleTrialMonitorRoutes(fileReq, fileRes, {
        url: fileUrl,
        trialMonitor: monitor,
      });

      assert.equal(fileRes.statusCode, 200);
      assert.equal(fileRes.body.ok, true);
      assert.equal(fileRes.body.name, 'day-01.md');
      assert.ok(fileRes.body.content.includes('# Operational Trial Daily Report: Day 01'));

      // 3. GET nonexistent report returns 404
      const notFoundReq = { method: 'GET' };
      const notFoundRes = createMockRes();
      const notFoundUrl = new URL('http://127.0.0.1:3000/api/trial-monitor/reports/nonexistent.md');

      await handleTrialMonitorRoutes(notFoundReq, notFoundRes, {
        url: notFoundUrl,
        trialMonitor: monitor,
      });

      assert.equal(notFoundRes.statusCode, 404);
      assert.equal(notFoundRes.body.ok, false);
    });
  });
});
