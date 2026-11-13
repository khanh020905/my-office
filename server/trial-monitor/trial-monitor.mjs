/**
 * Autonomous Trial Monitor (Phase 5.1).
 * Core entrypoint coordinating:
 * - TrialCollector (strictly read-only telemetry sampling)
 * - TrialAnomalyDetector (SEV-1 to SEV-4 alert evaluation)
 * - TrialScheduler (periodic sampling loop, gap detection & state persistence)
 * - TrialReportGenerator (daily reports day-01..day-07 and FINAL-7-DAY-ASSESSMENT)
 *
 * Invariant Enforcement:
 * - Strictly read-only observation: NEVER mutates state, processes, policy, or budget.
 * - Missing metrics are never fabricated; explicitly recorded as 'unmeasured' or 'gap'.
 */

import path from 'node:path';
import { createTrialCollector } from './trial-collector.mjs';
import { createTrialAnomalyDetector } from './trial-anomaly-detector.mjs';
import { createTrialScheduler } from './trial-scheduler.mjs';
import { createTrialReportGenerator } from './trial-report-generator.mjs';
import { assertReadOnlyCollector } from './trial-contracts.mjs';

export class TrialMonitor {
  /**
   * @param {Object} options
   * @param {Object} [options.collector] - Existing TrialCollector or options to create one
   * @param {Object} [options.anomalyDetector] - Existing TrialAnomalyDetector or options to create one
   * @param {Object} [options.scheduler] - Existing TrialScheduler
   * @param {Object} [options.reportGenerator] - Existing TrialReportGenerator
   * @param {string} [options.storePath='data/trial-monitor/trial-state.json']
   * @param {string} [options.outputDir] - Report directory ('reports/operational-trial')
   * @param {number} [options.intervalMs=60000] - Scheduler sampling interval in ms
   * @param {boolean} [options.autoStart=false] - Auto-start scheduler loop
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.storePath = options.storePath || 'data/trial-monitor/trial-state.json';
    this.outputDir = options.outputDir || path.resolve(this.rootDir, 'reports/operational-trial');
    this.intervalMs = typeof options.intervalMs === 'number' ? options.intervalMs : 60000;

    // 1. Collector
    if (options.collector && typeof options.collector.collectSnapshot === 'function') {
      this.collector = options.collector;
    } else {
      this.collector = createTrialCollector({
        rootDir: this.rootDir,
        ...(options.collectorOptions || options),
      });
    }

    // 2. Anomaly Detector
    if (options.anomalyDetector && typeof options.anomalyDetector.evaluate === 'function') {
      this.anomalyDetector = options.anomalyDetector;
    } else {
      this.anomalyDetector = createTrialAnomalyDetector(options.detectorOptions || options);
    }

    // 3. Scheduler
    if (options.scheduler && typeof options.scheduler.sampleNow === 'function') {
      this.scheduler = options.scheduler;
    } else {
      this.scheduler = createTrialScheduler({
        collector: this.collector,
        anomalyDetector: this.anomalyDetector,
        storePath: this.storePath,
        rootDir: this.rootDir,
        intervalMs: this.intervalMs,
        maxHistory: options.maxHistory || 1440,
        outputDir: this.outputDir,
        autoStart: options.autoStart || false,
      });
    }

    // 4. Report Generator
    if (options.reportGenerator && typeof options.reportGenerator.generateDailyReport === 'function') {
      this.reportGenerator = options.reportGenerator;
    } else {
      this.reportGenerator = createTrialReportGenerator({
        outputDir: this.outputDir,
        scheduler: this.scheduler,
      });
    }

    // Strict Read-Only Invariant
    this.isReadOnly = true;
  }

  // ==========================================================================
  // Prohibited Mutating Invariants (Strictly Read-Only)
  // ==========================================================================
  _assertReadOnly(actionName) {
    throw new Error(`READ_ONLY_INVARIANT_VIOLATION: Trial Monitor is strictly read-only. Action "${actionName}" is forbidden.`);
  }

  dispatchTask() { this._assertReadOnly('dispatchTask'); }
  cancelExecution() { this._assertReadOnly('cancelExecution'); }
  retryExecution() { this._assertReadOnly('retryExecution'); }
  sendFollowUp() { this._assertReadOnly('sendFollowUp'); }
  createMasterTask() { this._assertReadOnly('createMasterTask'); }
  startMasterTask() { this._assertReadOnly('startMasterTask'); }
  cancelMasterTask() { this._assertReadOnly('cancelMasterTask'); }
  retrySubtask() { this._assertReadOnly('retrySubtask'); }
  triggerEmergencyStop() { this._assertReadOnly('triggerEmergencyStop'); }
  trip() { this._assertReadOnly('trip'); }
  resumeEmergencyStop() { this._assertReadOnly('resumeEmergencyStop'); }
  setAutonomyLevel() { this._assertReadOnly('setAutonomyLevel'); }
  updatePolicy() { this._assertReadOnly('updatePolicy'); }
  resolveApproval() { this._assertReadOnly('resolveApproval'); }
  createBackup() { this._assertReadOnly('createBackup'); }
  restoreFromBackup() { this._assertReadOnly('restoreFromBackup'); }
  appendEvent() { this._assertReadOnly('appendEvent'); }
  createCheckpoint() { this._assertReadOnly('createCheckpoint'); }
  registerProcess() { this._assertReadOnly('registerProcess'); }
  terminateProcessSafely() { this._assertReadOnly('terminateProcessSafely'); }
  repairState() { this._assertReadOnly('repairState'); }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Officially launches the 7-day operational trial.
   * Records operator authorization and marks observation as Day 1/7.
   * @param {Object} [options={}]
   * @returns {Object} trialStartAt record
   */
  startOfficialTrial(options = {}) {
    return this.scheduler.startOfficialTrial(options);
  }

  /**
   * Starts periodic polling loop.
   * @returns {TrialMonitor}
   */
  start() {
    this.scheduler.start();
    return this;
  }

  /**
   * Stops periodic polling loop.
   * @returns {TrialMonitor}
   */
  stop() {
    this.scheduler.stop();
    return this;
  }

  /**
   * Whether the scheduler loop is actively running.
   * @returns {boolean}
   */
  isRunning() {
    return this.scheduler.status === 'running';
  }

  /**
   * Performs an immediate on-demand telemetry sampling cycle.
   * @returns {Promise<Object>} Sample result { snapshot, evaluation, gap }
   */
  async collectNow() {
    return this.scheduler.sampleNow();
  }

  // ==========================================================================
  // Telemetry Queries
  // ==========================================================================

  /**
   * Overall operational status.
   * @returns {Object}
   */
  getStatus() {
    const schedulerStatus = this.scheduler.getStatus();
    const latestSnapshot = this.scheduler.getLatestSnapshot();
    const alerts = this.scheduler.listAlerts({ limit: 10000 });
    const gaps = this.scheduler.listGaps({ limit: 1000 });
    const unresolvedAlerts = alerts.filter(a => a.resolved !== true && a.status !== 'resolved');

    return {
      status: schedulerStatus.status,
      isRunning: this.isRunning(),
      isReadOnly: true,
      uptimeSeconds: process.uptime(),
      intervalMs: this.intervalMs,
      storePath: this.scheduler.resolvedStorePath,
      heartbeat: schedulerStatus.heartbeat,
      trialStartAt: schedulerStatus.trialStartAt,
      observationStatus: schedulerStatus.observationStatus,
      lastSuccessfulCollectionAt: schedulerStatus.lastSuccessfulCollectionAt,
      lastSampleTimestamp: schedulerStatus.lastSampleTimestamp,
      nextScheduledCollectionAt: schedulerStatus.nextScheduledCollectionAt,
      totalSamples: schedulerStatus.totalSamples,
      collectionCount: schedulerStatus.collectionCount,
      preTrialSnapshotsCount: schedulerStatus.preTrialSnapshotsCount,
      postStartSnapshotsCount: schedulerStatus.postStartSnapshotsCount,
      preTrialSnapshotsExcluded: schedulerStatus.preTrialSnapshotsExcluded,
      snapshotCount: this.scheduler.snapshots.length,
      alertsCount: alerts.length,
      unresolvedAlertsCount: unresolvedAlerts.length,
      gapsCount: gaps.length,
      telemetryGapStatus: schedulerStatus.telemetryGapStatus,
      telemetryCoverage: schedulerStatus.telemetryCoverage,
      reportOutputPath: schedulerStatus.reportOutputPath,
      latestSnapshot,
      overallHealth: latestSnapshot?.overallStatus || 'unknown',
    };
  }

  /**
   * Retrieves snapshots with optional pagination / filter.
   * @param {Object} [options={}]
   * @returns {Object[]}
   */
  getSnapshots(options = {}) {
    return this.scheduler.listSnapshots(options);
  }

  listSnapshots(options = {}) {
    return this.getSnapshots(options);
  }

  /**
   * Retrieves alerts with optional filters.
   * @param {Object} [options={}]
   * @returns {Object[]}
   */
  getAlerts(options = {}) {
    let list = this.scheduler.listAlerts(options);
    if (options.status === 'resolved') {
      list = list.filter(a => a.resolved === true || a.status === 'resolved');
    } else if (options.status === 'unresolved') {
      list = list.filter(a => a.resolved !== true && a.status !== 'resolved');
    }
    return list;
  }

  listAlerts(options = {}) {
    return this.getAlerts(options);
  }

  /**
   * Retrieves telemetry gaps.
   * @param {Object} [options={}]
   * @returns {Object[]}
   */
  getGaps(options = {}) {
    return this.scheduler.listGaps(options);
  }

  listGaps(options = {}) {
    return this.getGaps(options);
  }

  // ==========================================================================
  // Report Generation
  // ==========================================================================

  /**
   * Generates a daily operational report (e.g. reports/operational-trial/day-01.md).
   * @param {number|string} dayNumber
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async generateDailyReport(dayNumber, options = {}) {
    const snapshots = options.snapshots || this.scheduler.listSnapshots({ limit: 10000 });
    const alerts = options.alerts || this.scheduler.listAlerts({ limit: 10000 });
    const gaps = options.gaps || this.scheduler.listGaps({ limit: 1000 });

    return this.reportGenerator.generateDailyReport(dayNumber, {
      snapshots,
      alerts,
      gaps,
      ...options,
    });
  }

  /**
   * Generates final comprehensive assessment (reports/operational-trial/FINAL-7-DAY-ASSESSMENT.md).
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async generateFinalAssessment(options = {}) {
    const snapshots = options.snapshots || this.scheduler.listSnapshots({ limit: 10000 });
    const alerts = options.alerts || this.scheduler.listAlerts({ limit: 10000 });
    const gaps = options.gaps || this.scheduler.listGaps({ limit: 1000 });

    return this.reportGenerator.generateFinalAssessment({
      snapshots,
      alerts,
      gaps,
      ...options,
    });
  }

  /**
   * Fetches an existing report by filename.
   * @param {string} fileName
   * @returns {Promise<Object>}
   */
  async getReport(fileName) {
    return this.reportGenerator.getReport(fileName);
  }

  /**
   * Lists generated operational trial reports.
   * @returns {Promise<Object[]>}
   */
  async listReports() {
    return this.reportGenerator.listReports();
  }
}

/**
 * Factory creating a coordinated TrialMonitor instance.
 * @param {Object} [options={}]
 * @returns {TrialMonitor}
 */
export function createTrialMonitor(options = {}) {
  const monitor = new TrialMonitor(options);
  assertReadOnlyCollector(monitor);
  return monitor;
}
