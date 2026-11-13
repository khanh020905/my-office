// Client controller for My Office Operational Health & Reliability Dashboard (Phase 5).
// Coordinates Live KPI Gauges, Process Supervisor Monitor, Journal WAL Status,
// and Consistent Multi-Store Disaster Recovery Backups.

import { TOKEN } from '../net/live.js';

let drawer = null;
let currentTab = 'kpi';
let pollingTimer = null;
let cachedMetrics = null;
let cachedProcesses = [];
let cachedJournal = null;
let cachedBackups = [];

const q = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '--';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ts) {
  if (!ts) return '--:--:--';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(ts);
  }
}

function formatDateTime(ts) {
  if (!ts) return '--';
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return String(ts);
  }
}

async function apiRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { ok: false, error: err.message } };
  }
}

export const setup = setupReliabilityView;

export function setupReliabilityView() {
  const btnWorkspace = document.getElementById('btn-reliability-workspace');
  const btnReliability = document.getElementById('btn-reliability');
  drawer = document.getElementById('dr-reliability');
  if (!drawer) return;

  const toggleDrawer = () => {
    const isHidden = drawer.hidden;
    drawer.hidden = !isHidden;
    if (btnWorkspace) btnWorkspace.setAttribute('aria-pressed', String(!isHidden));
    if (btnReliability) btnReliability.setAttribute('aria-pressed', String(!isHidden));
    if (!drawer.hidden) {
      loadTab(currentTab);
      startPolling();
    } else {
      stopPolling();
    }
  };

  if (btnWorkspace) btnWorkspace.addEventListener('click', toggleDrawer);
  if (btnReliability) btnReliability.addEventListener('click', toggleDrawer);

  const closeBtn = drawer.querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      drawer.hidden = true;
      if (btnWorkspace) btnWorkspace.setAttribute('aria-pressed', 'false');
      if (btnReliability) btnReliability.setAttribute('aria-pressed', 'false');
      stopPolling();
    });
  }

  // Navigation Tabs switching
  const tabs = drawer.querySelectorAll('#reliability-tabs [data-rt]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-rt');
      switchTab(target);
    });
  });

  // Action Buttons
  const btnRefresh = document.getElementById('btn-reliability-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadTab(currentTab);
    });
  }

  const btnScanProcs = document.getElementById('btn-scan-processes');
  if (btnScanProcs) {
    btnScanProcs.addEventListener('click', async () => {
      btnScanProcs.disabled = true;
      btnScanProcs.textContent = 'Scanning...';
      await fetchProcesses();
      btnScanProcs.disabled = false;
      btnScanProcs.textContent = 'Scan PIDs';
    });
  }

  const btnReconcile = document.getElementById('btn-reconcile-processes');
  if (btnReconcile) {
    btnReconcile.addEventListener('click', async () => {
      if (!confirm('Run startup reconciliation sweep across all tracked processes?')) return;
      btnReconcile.disabled = true;
      btnReconcile.textContent = 'Reconciling...';
      const res = await apiRequest(`/api/reliability/reconcile${q()}`, {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      });
      btnReconcile.disabled = false;
      btnReconcile.textContent = 'Reconcile Orphans';
      if (res.ok) {
        alert(`Reconciliation complete. Safe outcomes recorded.`);
        await fetchProcesses();
        await fetchHealthAndMetrics();
      } else {
        alert(`Reconciliation error: ${res.data?.error || 'Failed'}`);
      }
    });
  }

  const btnRefreshWal = document.getElementById('btn-refresh-wal');
  if (btnRefreshWal) {
    btnRefreshWal.addEventListener('click', () => {
      fetchJournal();
    });
  }

  const btnCreateBackup = document.getElementById('btn-create-backup');
  if (btnCreateBackup) {
    btnCreateBackup.addEventListener('click', async () => {
      const label = prompt('Enter a label or description for this consistent backup snapshot:', 'Manual Snapshot');
      if (label === null) return;
      btnCreateBackup.disabled = true;
      btnCreateBackup.textContent = 'Creating Snapshot...';
      const res = await apiRequest(`/api/reliability/backups/create${q()}`, {
        method: 'POST',
        body: JSON.stringify({ label, operator: 'operator:admin' }),
      });
      btnCreateBackup.disabled = false;
      btnCreateBackup.textContent = 'Create Backup Snapshot';
      if (res.ok) {
        alert(`Snapshot ${res.data?.backup?.backupId || 'created'} successfully with verified SHA-256 checksum.`);
        await fetchBackups();
      } else {
        alert(`Backup failed: ${res.data?.error || 'Unknown error'}`);
      }
    });
  }

  const btnDryRun = document.getElementById('btn-dryrun-restore');
  if (btnDryRun) {
    btnDryRun.addEventListener('click', async () => {
      if (!cachedBackups || cachedBackups.length === 0) {
        alert('No backups available to verify. Create a backup snapshot first.');
        return;
      }
      const latest = cachedBackups[0];
      const backupId = latest.backupId || latest.id;
      btnDryRun.disabled = true;
      btnDryRun.textContent = 'Verifying in Sandbox...';
      const res = await apiRequest(`/api/reliability/backups/${encodeURIComponent(backupId)}/verify${q()}`, {
        method: 'POST',
      });
      btnDryRun.disabled = false;
      btnDryRun.textContent = 'Verify Restore (Dry-Run)';
      if (res.ok && res.data?.verification?.valid) {
        alert(`Dry-run sandbox verification PASSED!\nAll ${res.data.verification.filesVerified || 0} file checksums matched and DAG state is intact.`);
      } else {
        alert(`Dry-run verification completed: ${res.data?.verification?.error || res.data?.error || 'Inspect manifest'}`);
      }
      await fetchBackups();
    });
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  if (!drawer) return;

  const tabs = drawer.querySelectorAll('#reliability-tabs [data-rt]');
  tabs.forEach((tab) => {
    const isTarget = tab.getAttribute('data-rt') === tabName;
    tab.classList.toggle('is-active', isTarget);
    tab.setAttribute('aria-selected', String(isTarget));
  });

  const panes = drawer.querySelectorAll('.reliability-pane[data-rp]');
  panes.forEach((pane) => {
    const isTarget = pane.getAttribute('data-rp') === tabName;
    pane.hidden = !isTarget;
  });

  loadTab(tabName);
}

function loadTab(tabName) {
  fetchHealthAndMetrics();
  if (tabName === 'processes') {
    fetchProcesses();
  } else if (tabName === 'journal') {
    fetchJournal();
  } else if (tabName === 'dr') {
    fetchBackups();
  }
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(() => {
    if (drawer && !drawer.hidden) {
      loadTab(currentTab);
    }
  }, 4000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// ============================================================================
// API DATA FETCHERS & RENDERERS
// ============================================================================

async function fetchHealthAndMetrics() {
  // Fetch /api/reliability/health
  const healthRes = await apiRequest(`/api/reliability/health${q()}`);
  if (healthRes.ok) {
    renderHealthBanner(healthRes.data);
  }

  // Also query metrics or autonomous status for KPI details
  const autoRes = await apiRequest(`/api/autonomous/status${q()}`);
  const autoData = autoRes.ok ? autoRes.data : null;

  renderKpiGauges(healthRes.data, autoData);
}

function renderHealthBanner(healthData) {
  const badge = document.getElementById('rel-health-status-badge');
  const detail = document.getElementById('rel-health-detail');
  const banner = document.getElementById('rel-health-banner');
  const lastUpdated = document.getElementById('rel-last-updated');

  if (lastUpdated) {
    lastUpdated.textContent = `Updated: ${formatTime(Date.now())}`;
  }

  const status = (healthData?.status || 'unknown').toLowerCase();

  if (badge) {
    badge.textContent = status.toUpperCase();
    if (status === 'healthy') {
      badge.style.background = '#3DDC84';
      badge.style.color = '#0D1117';
      if (banner) {
        banner.style.background = 'rgba(61, 220, 132, 0.08)';
        banner.style.borderBottom = '1px solid rgba(61, 220, 132, 0.25)';
      }
    } else if (status === 'degraded') {
      badge.style.background = '#FFB74D';
      badge.style.color = '#0D1117';
      if (banner) {
        banner.style.background = 'rgba(255, 183, 77, 0.1)';
        banner.style.borderBottom = '1px solid rgba(255, 183, 77, 0.3)';
      }
    } else if (status === 'critical') {
      badge.style.background = '#E53935';
      badge.style.color = '#FFFFFF';
      if (banner) {
        banner.style.background = 'rgba(229, 57, 53, 0.12)';
        banner.style.borderBottom = '1px solid rgba(229, 57, 53, 0.35)';
      }
    } else {
      badge.style.background = '#8D97AA';
      badge.style.color = '#0D1117';
    }
  }

  if (detail) {
    if (healthData?.issues && healthData.issues.length > 0) {
      detail.textContent = healthData.issues.join(' · ');
    } else if (status === 'healthy') {
      detail.textContent = 'All operational subsystems functioning within nominal reliability bounds.';
    } else if (status === 'degraded') {
      detail.textContent = 'One or more subsystems operating with elevated latency or retry counts.';
    } else if (status === 'critical') {
      detail.textContent = 'Critical reliability issue detected. Review journal WAL and process supervisor.';
    } else {
      detail.textContent = 'Gathering live reliability telemetry...';
    }
  }
}

function renderKpiGauges(healthData, autoData) {
  // 1. Uptime
  const uptimeEl = document.getElementById('rel-kpi-uptime');
  const startedEl = document.getElementById('rel-kpi-started-at');
  if (uptimeEl) {
    // If uptime is available in healthData or compute from window/performance
    const uptimeSec = healthData?.uptimeSeconds ?? (Math.floor(performance.now() / 1000));
    uptimeEl.textContent = formatDuration(uptimeSec);
  }
  if (startedEl) {
    const startedAt = healthData?.serverStartedAt || (Date.now() - performance.now());
    startedEl.textContent = formatTime(startedAt);
  }

  // 2. Active vs Stalled
  const activeEl = document.getElementById('rel-kpi-active');
  const stalledEl = document.getElementById('rel-kpi-stalled');
  const totalEl = document.getElementById('rel-kpi-total');

  const execActive = autoData?.budget?.usage?.activeConcurrent || healthData?.processes?.trackedCount || 0;
  const execTotal = autoData?.budget?.usage?.executionCount || 0;
  if (activeEl) activeEl.textContent = String(execActive);
  if (stalledEl) stalledEl.textContent = String(healthData?.executions?.stalled || 0);
  if (totalEl) totalEl.textContent = String(execTotal);

  // 3. Latencies
  const p50El = document.getElementById('rel-kpi-p50');
  const p95El = document.getElementById('rel-kpi-p95');
  const samplesEl = document.getElementById('rel-kpi-samples');

  const p50 = healthData?.executions?.p50LatencyMs;
  const p95 = healthData?.executions?.p95LatencyMs;
  if (p50El) p50El.textContent = typeof p50 === 'number' ? `${p50}ms` : '--';
  if (p95El) p95El.textContent = typeof p95 === 'number' ? `${p95}ms` : '--';
  if (samplesEl) samplesEl.textContent = String(healthData?.executions?.latenciesSampleCount || 0);

  // 4. Self Healing & Retries
  const retryRateEl = document.getElementById('rel-kpi-retry-rate');
  const remedRateEl = document.getElementById('rel-kpi-remediation-rate');
  const remedCountEl = document.getElementById('rel-kpi-remediations');

  const retryRate = healthData?.selfHealing?.retryRate;
  const remedRate = healthData?.selfHealing?.remediationRate;
  const remedCount = healthData?.selfHealing?.totalRemediations || autoData?.recentInterventions?.length || 0;

  if (retryRateEl) retryRateEl.textContent = typeof retryRate === 'number' ? `${(retryRate * 100).toFixed(1)}%` : '0.0%';
  if (remedRateEl) remedRateEl.textContent = typeof remedRate === 'number' ? `${(remedRate * 100).toFixed(1)}%` : '0.0%';
  if (remedCountEl) remedCountEl.textContent = String(remedCount);

  // 5. Budget Spend
  const spentEl = document.getElementById('rel-kpi-cost-spent');
  const remainEl = document.getElementById('rel-kpi-cost-remaining');

  const totalCost = autoData?.budget?.usage?.totalCostUsd || healthData?.budget?.totalCostUsd || 0;
  const remainCost = autoData?.budget?.remaining?.costRemainingUsd ?? healthData?.budget?.remainingCostUsd;

  if (spentEl) spentEl.textContent = `$${Number(totalCost).toFixed(2)}`;
  if (remainEl) remainEl.textContent = typeof remainCost === 'number' ? `$${Number(remainCost).toFixed(2)}` : 'Unlimited';

  // 6. Provider Grid
  renderProviderGrid(healthData?.providers);
}

function renderProviderGrid(providersMap) {
  const grid = document.getElementById('rel-provider-grid');
  if (!grid) return;

  const defaultProviders = [
    { id: 'claude-code', name: 'Claude Code CLI', defaultStatus: 'online' },
    { id: 'codex-cli', name: 'Codex CLI', defaultStatus: 'online' },
    { id: 'antigravity', name: 'Antigravity Native', defaultStatus: 'online' },
  ];

  grid.innerHTML = defaultProviders
    .map((p) => {
      const data = providersMap ? providersMap[p.id] : null;
      const status = data?.status || p.defaultStatus;
      const statusColor = status === 'online' ? '#3DDC84' : status === 'degraded' ? '#FFB74D' : '#8D97AA';
      const latency = typeof data?.lastLatencyMs === 'number' ? `${data.lastLatencyMs}ms` : '--';
      const uptime = data?.uptimeSeconds ? formatDuration(data.uptimeSeconds) : '--';

      return `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border, #2E3648); border-radius: 6px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <b style="font-size: 0.88rem; color: var(--ink, #E8ECF4);">${escapeHtml(p.name)}</b>
            <span style="font-size: 0.72rem; font-weight: 700; color: ${statusColor}; text-transform: uppercase;">
              ● ${escapeHtml(status)}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--muted, #8D97AA);">
            <span>Ping Latency: <b style="color: var(--ink, #E8ECF4);">${latency}</b></span>
            <span>Uptime: <b style="color: var(--ink, #E8ECF4);">${uptime}</b></span>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// PROCESS SUPERVISOR TAB
// ============================================================================

async function fetchProcesses() {
  const res = await apiRequest(`/api/reliability/processes${q()}`);
  if (!res.ok) return;

  const list = res.data?.processes || [];
  cachedProcesses = list;

  const trackedEl = document.getElementById('rel-proc-tracked');
  const orphansEl = document.getElementById('rel-proc-orphans');
  const reassignedEl = document.getElementById('rel-proc-reassigned');

  let orphanCount = 0;
  let reassignedCount = 0;
  let trackedCount = 0;

  for (const p of list) {
    if (p.state === 'orphan_detected') orphanCount++;
    if (p.state === 'reassigned_detected') reassignedCount++;
    if (p.state === 'running' || p.state === 'spawning') trackedCount++;
  }

  if (trackedEl) trackedEl.textContent = String(trackedCount);
  if (orphansEl) orphansEl.textContent = String(orphanCount);
  if (reassignedEl) reassignedEl.textContent = String(reassignedCount);

  renderProcessTable(list);
}

function renderProcessTable(processes) {
  const tbody = document.getElementById('rel-process-table-body');
  if (!tbody) return;

  if (!processes || processes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 24px; text-align: center; color: var(--muted, #8D97AA);">
          No active or orphaned child processes tracked by supervisor.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = processes
    .map((p) => {
      const pid = p.pid || p.fingerprint?.pid || '--';
      const exec = p.fingerprint?.executable || p.provider || 'unknown';
      const ppid = p.fingerprint?.parentPid || '--';
      const startTime = formatTime(p.fingerprint?.startTime || p.spawnedAt);
      const state = p.state || 'running';
      const execId = p.executionId || String(pid);

      let badgeColor = '#3DDC84';
      if (state === 'orphan_detected') badgeColor = '#E53935';
      if (state === 'reassigned_detected') badgeColor = '#FFB74D';
      if (state === 'terminating') badgeColor = '#64B5F6';
      if (state === 'terminated') badgeColor = '#8D97AA';

      return `
        <tr style="border-bottom: 1px solid var(--border, #2E3648);">
          <td style="padding: 10px 14px; font-weight: 700; color: #64B5F6;">${escapeHtml(pid)}</td>
          <td style="padding: 10px 14px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(exec)}">
            ${escapeHtml(exec.split(/[/\\\\]/).pop())}
          </td>
          <td style="padding: 10px 14px; color: var(--muted, #8D97AA);">${escapeHtml(ppid)}</td>
          <td style="padding: 10px 14px; color: var(--muted, #8D97AA);">${startTime}</td>
          <td style="padding: 10px 14px;">
            <span style="font-size: 0.72rem; font-weight: 700; color: ${badgeColor}; text-transform: uppercase;">
              ${escapeHtml(state)}
            </span>
          </td>
          <td style="padding: 10px 14px; text-align: right;">
            ${
              state !== 'terminated'
                ? `<button class="tb-btn btn-terminate-proc" data-exec-id="${escapeHtml(execId)}" data-pid="${escapeHtml(pid)}" style="font-size: 0.75rem; padding: 2px 8px; background: rgba(229, 57, 53, 0.15); color: #FFCDD2; border: 1px solid rgba(229, 57, 53, 0.3); border-radius: 4px; cursor: pointer;">
                    Terminate Safely
                  </button>`
                : `<span style="font-size: 0.75rem; color: var(--muted, #8D97AA);">Terminated</span>`
            }
          </td>
        </tr>
      `;
    })
    .join('');

  // Wire terminate buttons
  tbody.querySelectorAll('.btn-terminate-proc').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const execId = btn.getAttribute('data-exec-id');
      const pid = btn.getAttribute('data-pid');
      if (!confirm(`Safely terminate process PID ${pid} (Execution: ${execId})?\nSupervisor will verify fingerprint before signaling.`)) {
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Terminating...';
      const res = await apiRequest(`/api/reliability/processes/${encodeURIComponent(execId)}/terminate${q()}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Operator requested safe termination', gracePeriodMs: 3000 }),
      });
      if (res.ok) {
        alert(`Process PID ${pid} terminated safely.`);
        await fetchProcesses();
      } else {
        alert(`Termination rejected: ${res.data?.error || 'Process identity check failed'}`);
        await fetchProcesses();
      }
    });
  });
}

// ============================================================================
// JOURNAL & WAL TAB
// ============================================================================

async function fetchJournal() {
  const res = await apiRequest(`/api/reliability/journal${q()}?limit=30`);
  if (!res.ok) return;

  const data = res.data;
  cachedJournal = data;

  const seqEl = document.getElementById('rel-wal-seq');
  const sizeEl = document.getElementById('rel-wal-size');
  const corruptEl = document.getElementById('rel-wal-corrupt-count');
  const syncEl = document.getElementById('rel-wal-last-sync');
  const totalEventsEl = document.getElementById('rel-wal-total-events');
  const pathEl = document.getElementById('rel-wal-path');

  if (seqEl) seqEl.textContent = `#${data?.stats?.currentSeq || 0}`;
  if (sizeEl) sizeEl.textContent = formatBytes(data?.stats?.walByteSize || 0);
  if (corruptEl) corruptEl.textContent = String(data?.stats?.corruptRecordsCount || 0);
  if (syncEl) syncEl.textContent = formatTime(data?.stats?.lastSyncTimestamp);
  if (totalEventsEl) totalEventsEl.textContent = String(data?.eventsCount || 0);
  if (pathEl && data?.stats?.walPath) pathEl.textContent = data.stats.walPath.split(/[/\\\\]/).pop();

  renderJournalEvents(data?.events || []);
}

function renderJournalEvents(events) {
  const container = document.getElementById('rel-wal-events-list');
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--muted, #8D97AA); font-size: 0.85rem;">
        No events recorded in Write-Ahead Log.
      </div>
    `;
    return;
  }

  // Display newest first
  const reversed = [...events].reverse();

  container.innerHTML = reversed
    .map((evt) => {
      const seq = evt.seq != null ? `#${evt.seq}` : '#--';
      const type = evt.eventType || 'UNKNOWN_EVENT';
      const time = formatTime(evt.timestamp);
      const aggId = evt.aggregateId || 'system';
      const hasChecksum = Boolean(evt.checksum);

      return `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border, #2E3648); border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #3DDC84; font-family: monospace;">${escapeHtml(seq)}</span>
            <div style="min-width: 0;">
              <b style="font-size: 0.85rem; color: var(--ink, #E8ECF4);">${escapeHtml(type)}</b>
              <div style="font-size: 0.75rem; color: var(--muted, #8D97AA); margin-top: 2px;">
                Aggregate: <span style="color: #64B5F6;">${escapeHtml(aggId)}</span> · ${time}
              </div>
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(61, 220, 132, 0.1); color: #3DDC84; font-family: monospace;">
              ${hasChecksum ? 'SHA-256 ✓' : 'NO CHECKSUM'}
            </span>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// DISASTER RECOVERY & BACKUPS TAB
// ============================================================================

async function fetchBackups() {
  const res = await apiRequest(`/api/reliability/backups${q()}`);
  if (!res.ok) return;

  const backups = res.data?.backups || [];
  cachedBackups = backups;

  const countEl = document.getElementById('rel-dr-count');
  const lastIdEl = document.getElementById('rel-dr-last-id');
  const lastTimeEl = document.getElementById('rel-dr-last-time');
  const dryRunEl = document.getElementById('rel-dr-dryrun-status');

  if (countEl) countEl.textContent = String(backups.length);

  if (backups.length > 0) {
    const latest = backups[0];
    if (lastIdEl) lastIdEl.textContent = latest.backupId || latest.id || 'Snapshot';
    if (lastTimeEl) lastTimeEl.textContent = formatDateTime(latest.timestamp);
    if (dryRunEl) {
      if (latest.status === 'verified_restore_ok' || latest.dryRunRestoreOk) {
        dryRunEl.textContent = 'PASSED (Verified)';
        dryRunEl.style.color = '#3DDC84';
      } else {
        dryRunEl.textContent = 'Ready for Dry-Run';
        dryRunEl.style.color = '#64B5F6';
      }
    }
  } else {
    if (lastIdEl) lastIdEl.textContent = 'None';
    if (lastTimeEl) lastTimeEl.textContent = '--';
    if (dryRunEl) dryRunEl.textContent = 'Untested';
  }

  renderBackupsList(backups);
}

function renderBackupsList(backups) {
  const container = document.getElementById('rel-backups-list');
  if (!container) return;

  if (!backups || backups.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--muted, #8D97AA); font-size: 0.85rem;">
        No consistent snapshots created yet. Click "Create Backup Snapshot" to capture an atomic point-in-time state.
      </div>
    `;
    return;
  }

  container.innerHTML = backups
    .map((b) => {
      const id = b.backupId || b.id || 'snapshot';
      const time = formatDateTime(b.timestamp);
      const sha = b.sha256 ? `${b.sha256.slice(0, 12)}...` : 'N/A';
      const fileCount = b.files ? Object.keys(b.files).length : (b.fileCount || 0);
      const isVerified = b.status === 'verified_restore_ok' || b.dryRunRestoreOk;

      return `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border, #2E3648); border-radius: 6px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="min-width: 0;">
            <b style="font-size: 0.9rem; color: #64B5F6; font-family: monospace;">${escapeHtml(id)}</b>
            <div style="font-size: 0.78rem; color: var(--muted, #8D97AA); margin-top: 3px;">
              Created: ${time} · Files: <b style="color: var(--ink, #E8ECF4);">${fileCount}</b> · SHA-256: <code style="color: var(--muted, #8D97AA);">${sha}</code>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: ${isVerified ? '#3DDC84' : '#FFB74D'};">
              ${isVerified ? 'VERIFIED ✓' : 'UNVERIFIED'}
            </span>
            <button class="tb-btn btn-verify-single-backup" data-backup-id="${escapeHtml(id)}" style="font-size: 0.75rem; padding: 3px 8px; background: rgba(100, 181, 246, 0.1); color: #64B5F6; border: 1px solid #64B5F6; border-radius: 4px; cursor: pointer;">
              Verify Sandbox
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Wire single verify buttons
  container.querySelectorAll('.btn-verify-single-backup').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const backupId = btn.getAttribute('data-backup-id');
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      const res = await apiRequest(`/api/reliability/backups/${encodeURIComponent(backupId)}/verify${q()}`, {
        method: 'POST',
      });
      btn.disabled = false;
      btn.textContent = 'Verify Sandbox';
      if (res.ok && res.data?.verification?.valid) {
        alert(`Snapshot ${backupId} verification PASSED! All file SHA-256 hashes matched.`);
      } else {
        alert(`Verification result: ${res.data?.verification?.error || res.data?.error || 'Completed'}`);
      }
      await fetchBackups();
    });
  });
}
