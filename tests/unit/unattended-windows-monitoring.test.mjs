import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TrialScheduler } from '../../server/trial-monitor/trial-scheduler.mjs';
import { generateDailyReport, generateFinalAssessment } from '../../server/trial-monitor/trial-report-generator.mjs';

function createMockCollector() {
  return {
    collectSnapshot: async () => ({
      id: `snap-${Date.now()}`,
      timestamp: Date.now(),
      readOnlyInvariant: true,
      overallStatus: 'healthy',
      issues: [],
      systemHealth: { nodeProcess: { pid: process.pid, memoryUsage: { rss: 100000000 } } },
      agentHealth: { latency: { p95Ms: 120 } },
      safety: { autonomyLevel: 'supervised' },
    }),
  };
}

function createMockDetector() {
  return {
    evaluate: () => ({ status: 'healthy', alerts: [], hasAlerts: false }),
  };
}

describe('Unattended Windows 7-Day Monitoring Verification', () => {
  let tmpDir;
  let storePath;
  let reportsDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unattended-trial-test-'));
    storePath = path.join(tmpDir, 'trial-state.json');
    reportsDir = path.join(tmpDir, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. automatically starts and loads state on instantiation when autoStart is enabled', async () => {
    const scheduler = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 1000,
      autoStart: true,
    });

    assert.equal(scheduler.status, 'running');
    scheduler.stop();
  });

  it('2. preserves historical snapshots and original trialStartAt across restarts', async () => {
    let nowTime = 1794508200000;
    const scheduler1 = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 1000,
      now: () => nowTime,
    });

    // Take 2 pre-trial samples
    await scheduler1.sampleNow();
    nowTime += 1000;
    await scheduler1.sampleNow();

    // Start trial
    nowTime += 1000;
    const startRecord = scheduler1.startOfficialTrial({ authorizedBy: 'test-operator', startTimestamp: nowTime });
    assert.ok(startRecord);
    assert.equal(startRecord.epoch, nowTime);

    // Take 1 post-start sample
    nowTime += 1000;
    await scheduler1.sampleNow();

    assert.equal(scheduler1.snapshots.length, 3);
    scheduler1.stop();

    // Simulate server reboot by creating a fresh scheduler instance loading the same file
    nowTime += 500; // within 1.5x interval -> no downtime gap
    const scheduler2 = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 1000,
      now: () => nowTime,
    });

    assert.equal(scheduler2.snapshots.length, 3);
    assert.ok(scheduler2.trialStartAt);
    assert.equal(scheduler2.trialStartAt.epoch, startRecord.epoch);
    assert.equal(scheduler2.trialStartAt.authorizedBy, 'test-operator');
    scheduler2.stop();
  });

  it('3. prevents duplicate timers and overlapping collection loops', async () => {
    const scheduler = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 5000,
    });

    scheduler.start();
    const timer1 = scheduler._timer;
    // Calling start() again must be an idempotent no-op
    scheduler.start();
    const timer2 = scheduler._timer;
    assert.equal(timer1, timer2);

    // Concurrently triggering sampleNow() when already sampling returns null immediately
    scheduler._sampling = true;
    const concurrentResult = await scheduler.sampleNow();
    assert.equal(concurrentResult, null);
    scheduler._sampling = false;

    scheduler.stop();
  });

  it('4. records downtime gap on restart and avoids double-counting on immediate first sample', async () => {
    let nowTime = 1000000;
    const scheduler1 = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 60000,
      now: () => nowTime,
    });

    await scheduler1.sampleNow();
    scheduler1.stop();

    // Simulate 300 seconds (5 missed intervals) of offline downtime
    nowTime += 300000;
    const scheduler2 = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
      intervalMs: 60000,
      now: () => nowTime,
      autoStart: true,
    });

    // Check gaps immediately after loadState + autoStart first sample
    assert.equal(scheduler2.gaps.length, 1, 'Should record exactly one gap for restart downtime');
    assert.equal(scheduler2.gaps[0].durationMs, 300000);
    assert.equal(scheduler2.gaps[0].missedIntervals, 5);

    scheduler2.stop();
  });

  it('5. reports continue using original trialStartAt and exclude pre-trial items', async () => {
    const trialStart = 1794508204209;
    const mockSnapshots = [
      { id: 'pre-1', timestamp: trialStart - 10000, overallStatus: 'healthy', issues: [] },
      { id: 'pre-2', timestamp: trialStart - 5000, overallStatus: 'healthy', issues: [] },
      { id: 'post-1', timestamp: trialStart + 1000, overallStatus: 'healthy', issues: [] },
      { id: 'post-2', timestamp: trialStart + 2000, overallStatus: 'healthy', issues: [] },
    ];
    const mockGaps = [
      { id: 'gap-pre', timestamp: trialStart - 20000, endTime: trialStart - 15000, durationMs: 5000, missedIntervals: 1 },
    ];

    const report = await generateDailyReport({
      dayNumber: 1,
      snapshots: mockSnapshots,
      alerts: [],
      gaps: mockGaps,
      trialStartAt: { epoch: trialStart },
      outputDir: reportsDir,
      writeToFile: false,
    });

    assert.equal(report.summary.snapshotCount, 2, 'Only 2 post-start snapshots should be counted');
    assert.equal(report.summary.gapsCount, 0, 'Pre-trial gap should be excluded from day report');
    assert.ok(report.content.includes('Snapshots Sampled:** 2'));
    assert.ok(report.content.includes('Monitoring Gaps Recorded:** 0'));
  });

  it('6. final assessment uses trialStartAt and calculates accurate availability', async () => {
    const trialStart = 1794508204209;
    const mockSnapshots = [
      { id: 'post-1', timestamp: trialStart + 1000, overallStatus: 'healthy', issues: [] },
    ];

    const final = await generateFinalAssessment({
      days: 7,
      snapshots: mockSnapshots,
      alerts: [],
      gaps: [],
      trialStartAt: { epoch: trialStart },
      outputDir: reportsDir,
      writeToFile: false,
    });

    assert.equal(final.verdict, 'READY FOR PRODUCTION ROLLOUT');
    assert.equal(final.summary.snapshotsCount, 1);
    assert.equal(final.availabilityPct, '100.00');
  });

  it('7. strictly enforces read-only invariants and rejects mutating calls', () => {
    const scheduler = new TrialScheduler({
      collector: createMockCollector(),
      anomalyDetector: createMockDetector(),
      storePath,
      rootDir: tmpDir,
    });

    assert.throws(() => scheduler.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
    assert.throws(() => scheduler.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
    assert.throws(() => scheduler.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
    assert.throws(() => scheduler.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
  });
});
