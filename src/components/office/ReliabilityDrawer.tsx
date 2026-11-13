// Static markup for My Office Operational Health & Reliability Drawer (Phase 5)
export default function ReliabilityDrawer() {
  return (
    <aside
      className="drawer drawer--wide drawer--reliability"
      id="dr-reliability"
      hidden
      aria-label="Operational Health & Reliability Dashboard"
    >
      <header className="dr-head">
        <div className="dr-title">
          <h2>Operational Health &amp; Reliability</h2>
          <p id="reliability-status">
            Live KPI Gauges · Process Supervisor · Journal WAL Status · Disaster Recovery &amp; Backups
          </p>
        </div>
        <button className="icon-btn" type="button" data-close aria-label="Close">
          <span data-icon="x"></span>
        </button>
      </header>

      {/* Persistent Operational Health Banner */}
      <div
        id="rel-health-banner"
        style={{
          background: 'rgba(61, 220, 132, 0.08)',
          borderBottom: '1px solid rgba(61, 220, 132, 0.25)',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <span
            id="rel-health-status-badge"
            className="tb-badge"
            style={{
              background: '#3DDC84',
              color: '#0D1117',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Healthy
          </span>
          <span
            id="rel-health-detail"
            style={{
              fontSize: '0.82rem',
              color: 'var(--muted, #8D97AA)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            All operational subsystems functioning within nominal reliability bounds.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span id="rel-last-updated" style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)' }}>
            Updated: --:--:--
          </span>
          <button
            id="btn-reliability-refresh"
            type="button"
            className="tb-btn"
            style={{
              fontSize: '0.8rem',
              padding: '4px 10px',
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              color: 'var(--ink, #E8ECF4)',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs - 4 Core Panes */}
      <div className="tools-nav-bar" role="tablist" id="reliability-tabs">
        <button
          className="tools-nav-btn tab is-active"
          type="button"
          role="tab"
          data-rt="kpi"
          aria-selected="true"
        >
          Live KPI Gauges
        </button>
        <button
          className="tools-nav-btn tab"
          type="button"
          role="tab"
          data-rt="processes"
          aria-selected="false"
        >
          Process Supervisor
        </button>
        <button
          className="tools-nav-btn tab"
          type="button"
          role="tab"
          data-rt="journal"
          aria-selected="false"
        >
          Journal &amp; WAL
        </button>
        <button
          className="tools-nav-btn tab"
          type="button"
          role="tab"
          data-rt="dr"
          aria-selected="false"
        >
          Disaster Recovery
        </button>
      </div>

      <div className="dr-body" id="reliability-body">
        {/* ================================================================= */}
        {/* 1. LIVE KPI GAUGES PANE */}
        {/* ================================================================= */}
        <div className="reliability-pane" id="pane-rel-kpi" data-rp="kpi">
          {/* Top KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {/* System Uptime */}
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                System Uptime
              </span>
              <div
                id="rel-kpi-uptime"
                style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3DDC84', marginTop: '4px' }}
              >
                --
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Started: <span id="rel-kpi-started-at">--</span>
              </div>
            </div>

            {/* Active vs Stalled */}
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Active vs Stalled
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span id="rel-kpi-active" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink, #E8ECF4)' }}>
                  0
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>active</span>
                <span style={{ color: 'var(--border, #2E3648)' }}>/</span>
                <span id="rel-kpi-stalled" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#FFB74D' }}>
                  0
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>stalled</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Total Executions: <span id="rel-kpi-total">0</span>
              </div>
            </div>

            {/* Latencies (p50 & p95) */}
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Execution Latency (p50 / p95)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                <span id="rel-kpi-p50" style={{ fontSize: '1.3rem', fontWeight: 700, color: '#64B5F6' }}>
                  --
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)' }}>p50</span>
                <span style={{ color: 'var(--border, #2E3648)' }}>/</span>
                <span id="rel-kpi-p95" style={{ fontSize: '1.3rem', fontWeight: 700, color: '#BA68C8' }}>
                  --
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)' }}>p95</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Samples: <span id="rel-kpi-samples">0</span>
              </div>
            </div>

            {/* Self-Healing Rates */}
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Self-Healing &amp; Retries
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                <span id="rel-kpi-retry-rate" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ink, #E8ECF4)' }}>
                  0.0%
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)' }}>retry</span>
                <span style={{ color: 'var(--border, #2E3648)' }}>/</span>
                <span id="rel-kpi-remediation-rate" style={{ fontSize: '1.3rem', fontWeight: 700, color: '#3DDC84' }}>
                  0.0%
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)' }}>remed</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Remediations: <span id="rel-kpi-remediations">0</span>
              </div>
            </div>

            {/* Budget Spend */}
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Budget Spend (USD)
              </span>
              <div id="rel-kpi-cost-spent" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3DDC84', marginTop: '4px' }}>
                $0.00
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Remaining: <span id="rel-kpi-cost-remaining">Unlimited</span>
              </div>
            </div>
          </div>

          {/* Provider Health Section */}
          <div
            className="tools-section"
            style={{
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <b style={{ fontSize: '1rem', color: 'var(--ink, #E8ECF4)' }}>Provider Uptime &amp; Availability</b>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>
                  Continuous ping latencies and operational availability across configured agent providers.
                </p>
              </div>
            </div>
            <div
              id="rel-provider-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
              }}
            >
              {/* Rendered dynamically by reliability-view.js */}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. PROCESS SUPERVISOR PANE */}
        {/* ================================================================= */}
        <div className="reliability-pane" id="pane-rel-processes" data-rp="processes" hidden>
          <div
            className="tools-section"
            style={{
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <b style={{ fontSize: '1rem', color: 'var(--ink, #E8ECF4)' }}>Process Supervisor Monitor</b>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>
                  Process Fingerprint verification strictly prevents killing re-assigned OS PIDs.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    color: 'var(--muted, #8D97AA)',
                  }}
                >
                  Tracked: <b id="rel-proc-tracked" style={{ color: 'var(--ink, #E8ECF4)' }}>0</b>
                </span>
                <span
                  style={{
                    background: 'rgba(229, 57, 53, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    color: '#E53935',
                  }}
                >
                  Orphans: <b id="rel-proc-orphans">0</b>
                </span>
                <span
                  style={{
                    background: 'rgba(255, 183, 77, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    color: '#FFB74D',
                  }}
                >
                  Reassigned: <b id="rel-proc-reassigned">0</b>
                </span>
                <button
                  id="btn-scan-processes"
                  type="button"
                  className="tb-btn"
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                >
                  Scan PIDs
                </button>
                <button
                  id="btn-reconcile-processes"
                  type="button"
                  className="tb-btn"
                  style={{
                    fontSize: '0.8rem',
                    padding: '4px 10px',
                    background: 'rgba(229, 57, 53, 0.2)',
                    color: '#FFCDD2',
                    border: '1px solid rgba(229, 57, 53, 0.4)',
                  }}
                >
                  Reconcile Orphans
                </button>
              </div>
            </div>
          </div>

          {/* Process Table */}
          <div
            style={{
              overflowX: 'auto',
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border, #2E3648)', color: 'var(--muted, #8D97AA)' }}>
                  <th style={{ padding: '10px 14px' }}>PID</th>
                  <th style={{ padding: '10px 14px' }}>Executable / Command</th>
                  <th style={{ padding: '10px 14px' }}>Parent PID</th>
                  <th style={{ padding: '10px 14px' }}>Start Time</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody id="rel-process-table-body">
                {/* Dynamically populated by reliability-view.js */}
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted, #8D97AA)' }}>
                    No active or orphaned child processes tracked.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. JOURNAL & WAL PANE */}
        {/* ================================================================= */}
        <div className="reliability-pane" id="pane-rel-journal" data-rp="journal" hidden>
          {/* WAL Status Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Latest WAL Sequence
              </span>
              <div id="rel-wal-seq" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3DDC84', marginTop: '4px' }}>
                #0
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Total Events: <span id="rel-wal-total-events">0</span>
              </div>
            </div>

            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                WAL File Size
              </span>
              <div id="rel-wal-size" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink, #E8ECF4)', marginTop: '4px' }}>
                0 B
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px', wordBreak: 'break-all' }}>
                Path: <span id="rel-wal-path">execution-journal.wal</span>
              </div>
            </div>

            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Corrupt Records
              </span>
              <div id="rel-wal-corrupt-count" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3DDC84', marginTop: '4px' }}>
                0
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Checksum validation: <span style={{ color: '#3DDC84' }}>SHA-256 Valid</span>
              </div>
            </div>

            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Last Sync (fsync)
              </span>
              <div id="rel-wal-last-sync" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink, #E8ECF4)', marginTop: '4px' }}>
                --:--:--
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Mode: <span style={{ color: '#64B5F6' }}>fdatasyncSync on Critical</span>
              </div>
            </div>
          </div>

          {/* WAL Event Stream */}
          <div
            className="tools-section"
            style={{
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <b style={{ fontSize: '1rem', color: 'var(--ink, #E8ECF4)' }}>Durable Event Stream</b>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>
                  Append-only execution events with recursive canonical SHA-256 integrity verification.
                </p>
              </div>
              <button
                id="btn-refresh-wal"
                type="button"
                className="tb-btn"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                Refresh Events
              </button>
            </div>
            <div
              id="rel-wal-events-list"
              style={{
                maxHeight: '360px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted, #8D97AA)', fontSize: '0.85rem' }}>
                No events recorded in Write-Ahead Log.
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 4. DISASTER RECOVERY & BACKUPS PANE */}
        {/* ================================================================= */}
        <div className="reliability-pane" id="pane-rel-dr" data-rp="dr" hidden>
          <div
            className="tools-section"
            style={{
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <b style={{ fontSize: '1rem', color: 'var(--ink, #E8ECF4)' }}>Multi-Store Backup &amp; Disaster Recovery</b>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>
                  Consistent snapshots across WAL, control-state, orchestration, and autonomous stores with dry-run restore validation.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  id="btn-create-backup"
                  type="button"
                  className="tb-btn"
                  style={{
                    fontSize: '0.82rem',
                    padding: '6px 12px',
                    background: '#3DDC84',
                    color: '#0D1117',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Create Backup Snapshot
                </button>
                <button
                  id="btn-dryrun-restore"
                  type="button"
                  className="tb-btn"
                  style={{
                    fontSize: '0.82rem',
                    padding: '6px 12px',
                    background: 'rgba(100, 181, 246, 0.15)',
                    color: '#64B5F6',
                    border: '1px solid #64B5F6',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Verify Restore (Dry-Run)
                </button>
              </div>
            </div>
          </div>

          {/* DR Summary Metrics Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Total Snapshots
              </span>
              <div id="rel-dr-count" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink, #E8ECF4)', marginTop: '4px' }}>
                0
              </div>
            </div>

            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Last Snapshot ID
              </span>
              <div
                id="rel-dr-last-id"
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#64B5F6',
                  marginTop: '8px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                None
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Time: <span id="rel-dr-last-time">--</span>
              </div>
            </div>

            <div
              className="tools-section"
              style={{
                background: 'var(--panel-bg, #1A1F2C)',
                border: '1px solid var(--border, #2E3648)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>
                Restore Verification
              </span>
              <div id="rel-dr-dryrun-status" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#3DDC84', marginTop: '6px' }}>
                Untested
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', marginTop: '2px' }}>
                Isolated sandbox dry-run
              </div>
            </div>
          </div>

          {/* Backup Snapshots List */}
          <div
            className="tools-section"
            style={{
              background: 'var(--panel-bg, #1A1F2C)',
              border: '1px solid var(--border, #2E3648)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <b style={{ fontSize: '1rem', color: 'var(--ink, #E8ECF4)', display: 'block', marginBottom: '12px' }}>
              Available Consistent Snapshots
            </b>
            <div
              id="rel-backups-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted, #8D97AA)', fontSize: '0.85rem' }}>
                No backups created yet. Click &quot;Create Backup Snapshot&quot; to capture an atomic point-in-time snapshot.
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
