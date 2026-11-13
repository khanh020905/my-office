/**
 * Autonomous Trial Telemetry Scheduler (Phase 5.1).
 * Manages periodic sampling loop (default 60s) collecting operational snapshots
 * and evaluating them with TrialAnomalyDetector.
 * 
 * Key Responsibilities:
 * 1. Periodic 60s sampling loop with explicit telemetry gap tracking (e.g. server downtime recorded as gaps).
 * 2. Persists state and historical snapshot buffers to disk (`data/trial-monitor/trial-state.json`).
 * 3. Strictly read-only: does NOT attempt automatic repairs, retries, or process terminations.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createTelemetryGap,
  validateTelemetryGap,
  validateTelemetrySnapshot,
  validateAlert,
} from './trial-contracts.mjs';

export class TrialScheduler {
  /**
   * @param {Object} options
   * @param {Object} options.collector - TrialCollector instance
   * @param {Object} options.anomalyDetector - TrialAnomalyDetector instance
   * @param {string} [options.storePath='data/trial-monitor/trial-state.json'] - File path to persist state
   * @param {string} [options.rootDir=process.cwd()] - Working directory root
   * @param {number} [options.intervalMs=60000] - Polling interval in ms (default 60s)
   * @param {number} [options.maxHistory=1440] - Max snapshots/alerts to retain in circular buffer
   * @param {Function} [options.now=Date.now] - Epoch ms provider
   * @param {boolean} [options.autoStart=false] - Whether to start immediately upon instantiation
   */
  constructor(options = {}) {
    if (!options.collector || typeof options.collector.collectSnapshot !== 'function') {
      throw new Error('TrialScheduler requires a valid collector instance with collectSnapshot().');
    }
    if (!options.anomalyDetector || typeof options.anomalyDetector.evaluate !== 'function') {
      throw new Error('TrialScheduler requires a valid anomalyDetector instance with evaluate().');
    }

    this.collector = options.collector;
    this.anomalyDetector = options.anomalyDetector;
    this.rootDir = options.rootDir || process.cwd();
    this.storePath = options.storePath || 'data/trial-monitor/trial-state.json';
    this.resolvedStorePath = path.isAbsolute(this.storePath)
      ? this.storePath
      : path.resolve(this.rootDir, this.storePath);

    this.outputDir = options.outputDir
      || (this.storePath.includes('trial-state.json') && !this.storePath.includes('data')
        ? path.dirname(this.resolvedStorePath)
        : path.resolve(this.rootDir, 'reports/operational-trial'));

    this.intervalMs = typeof options.intervalMs === 'number' && options.intervalMs > 0
      ? options.intervalMs
      : 60000;
    this.maxHistory = typeof options.maxHistory === 'number' && options.maxHistory > 0
      ? options.maxHistory
      : 1440;
    this.now = typeof options.now === 'function' ? options.now : Date.now;

    // Strict Read-Only Invariant
    this.isReadOnly = true;

    // Runtime state
    this.status = 'idle'; // 'idle' | 'running' | 'stopped'
    this.lastSampleTimestamp = null;
    this.trialStartAt = null;
    this.snapshots = [];
    this.alerts = [];
    this.gaps = [];
    this.stats = {
      totalSamples: 0,
      totalAlerts: 0,
      totalGaps: 0,
      startTime: null,
      lastSavedAt: null,
    };

    this._timer = null;
    this._sampling = false;
    this._stateLoaded = false;

    // Load any existing state from disk
    this.loadState();

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Prohibited mutating operations throw strictly to protect invariants.
   */
  _assertReadOnly(actionName) {
    throw new Error(`READ_ONLY_INVARIANT_VIOLATION: Trial Scheduler is strictly read-only. Action "${actionName}" is forbidden.`);
  }

  dispatchTask() { this._assertReadOnly('dispatchTask'); }
  cancelExecution() { this._assertReadOnly('cancelExecution'); }
  retryExecution() { this._assertReadOnly('retryExecution'); }
  terminateProcessSafely() { this._assertReadOnly('terminateProcessSafely'); }
  triggerEmergencyStop() { this._assertReadOnly('triggerEmergencyStop'); }
  resolveApproval() { this._assertReadOnly('resolveApproval'); }
  repairState() { this._assertReadOnly('repairState'); }

  /**
   * Loads persisted state from disk, detecting telemetry gaps caused by server downtime or restarts.
   */
  loadState() {
    try {
      if (!fs.existsSync(this.resolvedStorePath)) {
        this._stateLoaded = true;
        return false;
      }

      const raw = fs.readFileSync(this.resolvedStorePath, 'utf8');
      if (!raw || !raw.trim()) {
        this._stateLoaded = true;
        return false;
      }

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
        this.alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
        this.gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
        this.trialStartAt = parsed.trialStartAt && typeof parsed.trialStartAt === 'object'
          ? parsed.trialStartAt
          : null;
        this.stats = {
          ...this.stats,
          ...(parsed.stats || {}),
        };

        const recordedLastSample = typeof parsed.lastSampleTimestamp === 'number'
          ? parsed.lastSampleTimestamp
          : null;

        // Telemetry Gap Detection upon server restart / process reboot:
        // If there was a recorded sample before reboot and downtime exceeds 1.5x interval:
        if (recordedLastSample !== null) {
          const currentTime = this.now();
          const downtimeMs = currentTime - recordedLastSample;
          const gapThreshold = this.intervalMs * 1.5;

          if (downtimeMs > gapThreshold) {
            const missedCount = Math.max(1, Math.floor(downtimeMs / this.intervalMs));
            const restartGap = createTelemetryGap({
              startTime: recordedLastSample,
              endTime: currentTime,
              durationMs: downtimeMs,
              missedIntervals: missedCount,
              reason: 'Server restart downtime: telemetry sampling paused during server outage',
              timestamp: currentTime,
            });
            this.gaps.push(restartGap);
            this.stats.totalGaps = this.gaps.length;
            // Advance lastSampleTimestamp to currentTime so that the immediately following sampleNow()
            // does not register a second duplicate gap for the exact same downtime window
            this.lastSampleTimestamp = currentTime;
          } else {
            this.lastSampleTimestamp = recordedLastSample;
          }
        }
      }

      this._stateLoaded = true;
      return true;
    } catch (err) {
      // In case of corrupt file, fallback gracefully without throwing
      this._stateLoaded = true;
      return false;
    }
  }

  /**
   * Persists current state and buffers to disk atomically.
   */
  saveState() {
    try {
      const dir = path.dirname(this.resolvedStorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const postStartSnapshots = this.trialStartAt
        ? this.snapshots.filter((s) => s.timestamp >= this.trialStartAt.epoch)
        : [];
      const preTrialSnapshotsCount = this.trialStartAt
        ? this.trialStartAt.preTrialSnapshotsCount
        : this.snapshots.length;

      const dataToSave = {
        version: '1.0.0',
        savedAt: this.now(),
        lastSampleTimestamp: this.lastSampleTimestamp,
        trialStartAt: this.trialStartAt,
        stats: {
          ...this.stats,
          lastSavedAt: this.now(),
          totalSamples: this.stats.totalSamples,
          totalAlerts: this.alerts.length,
          totalGaps: this.gaps.length,
        },
        snapshots: this.snapshots.slice(-this.maxHistory),
        alerts: this.alerts.slice(-this.maxHistory),
        gaps: this.gaps,
      };

      const serialized = JSON.stringify(dataToSave, null, 2);
      const tempPath = `${this.resolvedStorePath}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}.tmp`;

      fs.writeFileSync(tempPath, serialized, 'utf8');

      // Atomic replace with fallback for Windows locking
      try {
        if (fs.existsSync(this.resolvedStorePath)) {
          fs.unlinkSync(this.resolvedStorePath);
        }
        fs.renameSync(tempPath, this.resolvedStorePath);
      } catch {
        fs.copyFileSync(tempPath, this.resolvedStorePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }

      this.stats.lastSavedAt = this.now();

      // Also persist live monitor-status.json in reports/operational-trial
      try {
        const statusFilePath = path.join(this.outputDir, 'monitor-status.json');
        fs.mkdirSync(path.dirname(statusFilePath), { recursive: true });
        const nextScheduledMs = this.lastSampleTimestamp ? this.lastSampleTimestamp + this.intervalMs : this.now() + this.intervalMs;

        // Calculate accurate telemetry coverage percentage (never masking downtime as uptime)
        let telemetryCoverage = '100.0%';
        if (this.trialStartAt && typeof this.trialStartAt.epoch === 'number') {
          const trialElapsedMs = Math.max(1, this.now() - this.trialStartAt.epoch);
          const trialGaps = this.gaps.filter(g => g.timestamp >= this.trialStartAt.epoch || g.endTime >= this.trialStartAt.epoch);
          const totalGapDurationMs = trialGaps.reduce((acc, g) => acc + (g.durationMs || 0), 0);
          const coverageRatio = Math.max(0, Math.min(100, ((trialElapsedMs - totalGapDurationMs) / trialElapsedMs) * 100));
          telemetryCoverage = `${coverageRatio.toFixed(1)}%`;
        }

        const statusPayload = {
          monitorStatus: this.status,
          heartbeat: this.now(),
          processId: process.pid,
          trialStartAt: this.trialStartAt,
          observationStatus: this.trialStartAt ? 'Day 1/7 (Active Observation)' : 'Pre-Trial Verification',
          lastSuccessfulCollectionAt: this.lastSampleTimestamp ? new Date(this.lastSampleTimestamp).toISOString() : null,
          lastSuccessfulCollectionTimestamp: this.lastSampleTimestamp,
          nextScheduledCollectionAt: new Date(nextScheduledMs).toISOString(),
          collectionCount: this.stats.totalSamples,
          preTrialSnapshotsCount,
          postStartSnapshotsCount: postStartSnapshots.length,
          preTrialSnapshotsExcluded: !!this.trialStartAt,
          totalAlerts: this.alerts.length,
          telemetryGapStatus: {
            hasGaps: this.gaps.length > 0,
            totalGaps: this.gaps.length,
            latestGap: this.gaps[this.gaps.length - 1] || null,
          },
          telemetryCoverage,
          reportOutputPath: path.resolve(this.rootDir, 'reports/operational-trial/day-01.md'),
          uptimeSeconds: Math.floor((this.stats.startTime ? Math.max(0, this.now() - this.stats.startTime) : 0) / 1000),
          isReadOnly: true,
        };
        fs.writeFileSync(statusFilePath, JSON.stringify(statusPayload, null, 2), 'utf8');
      } catch {
        // Non-fatal
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Executes a single sample cycle:
   * 1. Detects telemetry gap since last sample.
   * 2. Gathers snapshot from collector.
   * 3. Evaluates anomalies via detector.
   * 4. Updates historical buffers & persists state.
   * 
   * @returns {Promise<{ snapshot: Object, evaluation: Object, gap: Object|null }>}
   */
  async sampleNow() {
    if (this._sampling) {
      return null;
    }
    this._sampling = true;

    try {
      const sampleTime = this.now();
      let detectedGap = null;

      // Check for telemetry gap during continuous execution
      if (this.lastSampleTimestamp !== null) {
        const elapsedMs = sampleTime - this.lastSampleTimestamp;
        const gapThreshold = this.intervalMs * 1.5;

        if (elapsedMs > gapThreshold) {
          const missedIntervals = Math.max(1, Math.floor(elapsedMs / this.intervalMs) - 1);
          if (missedIntervals >= 1) {
            detectedGap = createTelemetryGap({
              startTime: this.lastSampleTimestamp,
              endTime: sampleTime,
              durationMs: elapsedMs,
              missedIntervals,
              reason: 'Missed polling interval: scheduler execution delayed or event loop blocked',
              timestamp: sampleTime,
            });
            this.gaps.push(detectedGap);
            this.stats.totalGaps = this.gaps.length;
          }
        }
      }

      // Collect telemetry snapshot
      const snapshot = await this.collector.collectSnapshot();

      // If gap was detected, inject it into snapshot issues so detector and reports see it
      if (detectedGap) {
        if (Array.isArray(snapshot.issues)) {
          snapshot.issues.push({
            code: 'TELEMETRY_GAP_DETECTED',
            target: 'TrialScheduler',
            evidence: detectedGap,
          });
        }
      }

      // Evaluate anomalies
      const evaluation = this.anomalyDetector.evaluate(snapshot);

      // Append new alerts to alert history
      if (Array.isArray(evaluation.alerts)) {
        for (const alert of evaluation.alerts) {
          this.alerts.push(alert);
          this.stats.totalAlerts++;
        }
      }

      // Store snapshot in history
      this.snapshots.push(snapshot);
      this.lastSampleTimestamp = sampleTime;
      this.stats.totalSamples++;

      // Trim circular buffers to maxHistory
      if (this.snapshots.length > this.maxHistory) {
        this.snapshots = this.snapshots.slice(-this.maxHistory);
      }
      if (this.alerts.length > this.maxHistory) {
        this.alerts = this.alerts.slice(-this.maxHistory);
      }

      // Persist state to disk
      this.saveState();

      return {
        snapshot,
        evaluation,
        gap: detectedGap,
      };
    } finally {
      this._sampling = false;
    }
  }

  /**
   * Officially launches the 7-day operational trial.
   * Records explicit operator authorization timestamp in Asia/Ho_Chi_Minh and UTC.
   * Pre-trial snapshots are preserved on disk but excluded from trial metrics.
   * @param {Object} [options={}]
   * @param {string} [options.authorizedBy='human-operator']
   * @param {number} [options.startTimestamp=null]
   * @returns {Object} trialStartAt record
   */
  startOfficialTrial({ authorizedBy = 'human-operator', startTimestamp = null } = {}) {
    const epoch = typeof startTimestamp === 'number' ? startTimestamp : this.now();
    const utc = new Date(epoch).toISOString();
    // Asia/Ho_Chi_Minh timezone is UTC+7
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnDate = new Date(epoch + vnOffsetMs);
    const vnIso = vnDate.toISOString().replace('Z', '+07:00');

    const preTrialCount = this.snapshots.filter((s) => s.timestamp < epoch).length;

    this.trialStartAt = {
      epoch,
      utc,
      asiaHoChiMinh: vnIso,
      authorizedBy,
      day: 1,
      totalDays: 7,
      preTrialSnapshotsCount: preTrialCount,
      status: 'Day 1/7 (Active Observation)',
    };

    this.saveState();
    return this.trialStartAt;
  }

  /**
   * Starts periodic polling loop.
   * @returns {TrialScheduler}
   */
  start() {
    if (this.status === 'running') {
      return this;
    }

    this.status = 'running';
    if (!this.stats.startTime) {
      this.stats.startTime = this.now();
    }

    // Run first sample immediately
    this.sampleNow().catch(() => {});

    // Schedule periodic loop
    this._timer = setInterval(() => {
      this.sampleNow().catch(() => {});
    }, this.intervalMs);

    if (this._timer && typeof this._timer.unref === 'function') {
      this._timer.unref();
    }

    return this;
  }

  /**
   * Stops periodic polling loop.
   * @returns {TrialScheduler}
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.status = 'stopped';
    this.saveState();
    return this;
  }

  /**
   * Returns latest collected snapshot.
   * @returns {Object|null}
   */
  getLatestSnapshot() {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Lists historical snapshots with optional limit and since filter.
   * @param {Object} [filter={}]
   * @param {number} [filter.limit=50]
   * @param {number} [filter.since=null]
   * @returns {Object[]}
   */
  listSnapshots({ limit = 50, since = null } = {}) {
    let list = this.snapshots;
    if (typeof since === 'number') {
      list = list.filter(s => s.timestamp >= since);
    }
    return list.slice(-limit);
  }

  /**
   * Lists historical alerts with optional filters.
   * @param {Object} [filter={}]
   * @param {string} [filter.severity]
   * @param {string} [filter.code]
   * @param {number} [filter.limit=50]
   * @param {number} [filter.since=null]
   * @returns {Object[]}
   */
  listAlerts({ severity = null, code = null, limit = 50, since = null } = {}) {
    let list = this.alerts;
    if (severity) {
      list = list.filter(a => a.severity === severity);
    }
    if (code) {
      list = list.filter(a => a.code === code);
    }
    if (typeof since === 'number') {
      list = list.filter(a => a.timestamp >= since);
    }
    return list.slice(-limit);
  }

  /**
   * Lists recorded telemetry gaps.
   * @param {Object} [filter={}]
   * @param {number} [filter.limit=50]
   * @param {number} [filter.since=null]
   * @returns {Object[]}
   */
  listGaps({ limit = 50, since = null } = {}) {
    let list = this.gaps;
    if (typeof since === 'number') {
      list = list.filter(g => g.timestamp >= since || g.endTime >= since);
    }
    return list.slice(-limit);
  }

  getSnapshots(filter = {}) { return this.listSnapshots(filter); }
  getAlerts(filter = {}) { return this.listAlerts(filter); }
  getGaps(filter = {}) { return this.listGaps(filter); }

  /**
   * Returns status summary for UI / API endpoints.
   * @returns {Object}
   */
  getStatus() {
    const currentTime = this.now();
    const uptimeMs = this.stats.startTime ? Math.max(0, currentTime - this.stats.startTime) : 0;

    const preTrialCount = this.trialStartAt ? this.trialStartAt.preTrialSnapshotsCount : this.snapshots.length;
    const postStartCount = this.trialStartAt
      ? this.snapshots.filter((s) => s.timestamp >= this.trialStartAt.epoch).length
      : 0;
    const nextScheduledMs = this.lastSampleTimestamp ? this.lastSampleTimestamp + this.intervalMs : currentTime + this.intervalMs;

    return {
      status: this.status,
      intervalMs: this.intervalMs,
      storePath: this.resolvedStorePath,
      heartbeat: currentTime,
      trialStartAt: this.trialStartAt,
      observationStatus: this.trialStartAt ? 'Day 1/7 (Active Observation)' : 'Pre-Trial Verification',
      lastSuccessfulCollectionAt: this.lastSampleTimestamp ? new Date(this.lastSampleTimestamp).toISOString() : null,
      lastSampleTimestamp: this.lastSampleTimestamp,
      nextScheduledCollectionAt: new Date(nextScheduledMs).toISOString(),
      totalSamples: this.stats.totalSamples,
      collectionCount: this.stats.totalSamples,
      preTrialSnapshotsCount: preTrialCount,
      postStartSnapshotsCount: postStartCount,
      preTrialSnapshotsExcluded: !!this.trialStartAt,
      totalAlerts: this.alerts.length,
      totalGaps: this.gaps.length,
      telemetryGapStatus: {
        hasGaps: this.gaps.length > 0,
        totalGaps: this.gaps.length,
        latestGap: this.gaps[this.gaps.length - 1] || null,
      },
      telemetryCoverage: '100.0%',
      reportOutputPath: path.resolve(this.rootDir, 'reports/operational-trial/day-01.md'),
      uptimeMs,
      latestSnapshot: this.getLatestSnapshot(),
      isReadOnly: true,
    };
  }
}

/**
 * Factory function creating a TrialScheduler instance.
 * @param {Object} options
 * @returns {TrialScheduler}
 */
export function createTrialScheduler(options = {}) {
  return new TrialScheduler(options);
}
