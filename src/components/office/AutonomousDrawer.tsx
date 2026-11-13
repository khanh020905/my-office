// Static markup for My Office Autonomous Operations Workspace Drawer (Phase 4)
export default function AutonomousDrawer() {
  return (
    <aside className="drawer drawer--wide drawer--autonomous" id="dr-autonomous" hidden aria-label="Autonomous Operations Workspace">
      <header className="dr-head">
        <div className="dr-title">
          <h2>Autonomous Operations Workspace</h2>
          <p id="autonomous-status">Policy Governance · Multi-Agent Autonomy · Human-in-the-Loop Approvals · Self-Healing</p>
        </div>
        <button className="icon-btn" type="button" data-close aria-label="Close">
          <span data-icon="x"></span>
        </button>
      </header>

      {/* Persistent Emergency Stop Banner */}
      <div
        id="auto-emergency-banner"
        style={{
          background: 'rgba(229, 57, 53, 0.12)',
          borderBottom: '1px solid rgba(229, 57, 53, 0.35)',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <span
            id="auto-emergency-status-badge"
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
            System Normal
          </span>
          <span
            id="auto-emergency-detail"
            style={{ fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}
          >
            All autonomous dispatches operating within safety bounds.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            id="btn-emergency-stop"
            type="button"
            className="tb-btn"
            style={{
              background: '#E53935',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.82rem',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Instantaneously halt all agent dispatches and cancel active processes"
          >
            <span>🛑</span>
            <span>EMERGENCY STOP</span>
          </button>

          <button
            id="btn-emergency-resume"
            type="button"
            className="tb-btn"
            hidden
            style={{
              background: '#3DDC84',
              color: '#0D1117',
              fontWeight: 700,
              fontSize: '0.82rem',
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Resume System
          </button>
        </div>
      </div>

      {/* Navigation Tabs - 5 Core Panes */}
      <div className="tools-nav-bar" role="tablist" id="autonomous-tabs">
        <button className="tools-nav-btn tab is-active" type="button" role="tab" data-at="mode" aria-selected="true">
          Autonomy Mode
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-at="approvals" aria-selected="false" id="tab-auto-approvals">
          Approval Center <span className="tb-badge" id="auto-approval-badge" hidden style={{ marginLeft: '6px', background: '#FF9800', color: '#000', fontSize: '0.7rem' }}>0</span>
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-at="budget" aria-selected="false">
          Budget &amp; Resources
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-at="console" aria-selected="false">
          Operations Console
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-at="emergency" aria-selected="false" style={{ color: '#FF6B6B' }}>
          Emergency Stop
        </button>
      </div>

      <div className="dr-body" id="autonomous-body">
        {/* ================================================================= */}
        {/* PANE 1: AUTONOMY MODE CONTROLS */}
        {/* ================================================================= */}
        <div className="auto-pane" id="pane-auto-mode">
          <div className="tools-section" style={{ borderLeft: '4px solid var(--accent, #EF8A5F)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Autonomy Spectrum Controls</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Throttle agent execution scope between strict read-only auditing and self-driving execution.
                </p>
              </div>
              <button id="btn-refresh-mode" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Status
              </button>
            </div>
          </div>

          {/* Current Active Mode Banner */}
          <div
            id="auto-mode-current-banner"
            style={{
              marginTop: '14px',
              padding: '16px',
              borderRadius: '8px',
              background: 'var(--card, #18202B)',
              border: '1px solid var(--line-2, rgba(255,255,255,0.08))',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted, #8D97AA)', fontWeight: 600 }}>Active Autonomy Tier:</span>
                <span
                  id="auto-mode-level-badge"
                  className="tb-badge"
                  style={{ background: '#5C6BC0', color: '#fff', fontSize: '0.85rem', padding: '4px 12px', fontWeight: 700 }}
                >
                  SUPERVISED
                </span>
                <span
                  id="auto-mode-risk-badge"
                  className="tb-badge"
                  style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', fontSize: '0.78rem', padding: '3px 8px' }}
                >
                  Medium Risk
                </span>
              </div>
              <span id="auto-mode-state-tag" style={{ fontSize: '0.8rem', color: 'var(--muted, #8D97AA)' }}>
                Lifecycle: <b id="auto-execution-state-label" style={{ color: '#3DDC84' }}>idle</b>
              </span>
            </div>

            <p id="auto-mode-active-desc" style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink, #E8ECF4)', lineHeight: 1.4 }}>
              Agents execute safe operations, bounded workspace edits, and test suites autonomously. Destructive operations and security overrides require approval.
            </p>

            {/* Dynamic Warning Badges */}
            <div id="auto-mode-warning-box" style={{ marginTop: '4px' }}>
              <div
                id="warning-badge-autonomous"
                hidden
                style={{
                  background: 'rgba(239, 83, 80, 0.15)',
                  border: '1px solid rgba(239, 83, 80, 0.4)',
                  color: '#FF8A80',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <span><strong>High Autonomy Active:</strong> Autonomous self-healing, provider switching, and code edits enabled. Budget limits strictly enforced.</span>
              </div>

              <div
                id="warning-badge-supervised"
                style={{
                  background: 'rgba(92, 107, 192, 0.15)',
                  border: '1px solid rgba(92, 107, 192, 0.4)',
                  color: '#9FA8DA',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🛡️</span>
                <span><strong>Guarded Mode Active:</strong> Safe writes and unit tests auto-approved. Destructive commands, permission grants, and git push require human sign-off.</span>
              </div>

              <div
                id="warning-badge-assisted"
                hidden
                style={{
                  background: 'rgba(255, 179, 0, 0.15)',
                  border: '1px solid rgba(255, 179, 0, 0.4)',
                  color: '#FFE082',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>✍️</span>
                <span><strong>Assisted Step-by-Step Mode:</strong> Every action, command execution, and file edit requires explicit human approval in the Approval Center.</span>
              </div>

              <div
                id="warning-badge-readonly"
                hidden
                style={{
                  background: 'rgba(66, 165, 245, 0.15)',
                  border: '1px solid rgba(66, 165, 245, 0.4)',
                  color: '#90CAF9',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🔒</span>
                <span><strong>Read-Only Mode:</strong> All file writes and shell mutating commands are blocked. Agents may only inspect and explore.</span>
              </div>
            </div>
          </div>

          {/* Autonomy Level Toggle Cards */}
          <div style={{ marginTop: '16px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)', display: 'block', marginBottom: '10px' }}>
              Select Operational Autonomy Level:
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* 1. READONLY CARD */}
              <div
                className="mode-card"
                id="card-mode-readonly"
                data-mode="readonly"
                style={{
                  background: 'var(--card, #18202B)',
                  borderRadius: '8px',
                  padding: '14px',
                  border: '1px solid var(--line-2, rgba(255,255,255,0.08))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#42A5F5', fontSize: '0.95rem' }}>1. Read-Only</b>
                  <span className="tb-badge" style={{ background: 'rgba(66, 165, 245, 0.2)', color: '#42A5F5', fontSize: '0.72rem' }}>Tier 0: None</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted, #8D97AA)', minHeight: '38px' }}>
                  Inspection, exploration &amp; threat modeling only. No writes or mutating commands permitted.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                  <div>• Safe Writes: <b style={{ color: '#EF5350' }}>Blocked</b></div>
                  <div>• Commands: <b style={{ color: '#FFB300' }}>Read-only only</b></div>
                  <div>• Self-Healing: <b style={{ color: '#EF5350' }}>Manual only</b></div>
                </div>
                <button
                  id="btn-mode-readonly"
                  type="button"
                  className="tb-btn"
                  data-level="readonly"
                  style={{ marginTop: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Activate Read-Only
                </button>
              </div>

              {/* 2. ASSISTED CARD */}
              <div
                className="mode-card"
                id="card-mode-assisted"
                data-mode="assisted"
                style={{
                  background: 'var(--card, #18202B)',
                  borderRadius: '8px',
                  padding: '14px',
                  border: '1px solid var(--line-2, rgba(255,255,255,0.08))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#FFB300', fontSize: '0.95rem' }}>2. Assisted</b>
                  <span className="tb-badge" style={{ background: 'rgba(255, 179, 0, 0.2)', color: '#FFB300', fontSize: '0.72rem' }}>Tier 1: Low</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted, #8D97AA)', minHeight: '38px' }}>
                  Agents propose edits &amp; plans. Every command, tool execution, and code change requires approval.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                  <div>• Safe Writes: <b style={{ color: '#FFB300' }}>Approval Required</b></div>
                  <div>• Commands: <b style={{ color: '#FFB300' }}>Approval Required</b></div>
                  <div>• Self-Healing: <b style={{ color: '#FFB300' }}>Approval Required</b></div>
                </div>
                <button
                  id="btn-mode-assisted"
                  type="button"
                  className="tb-btn"
                  data-level="assisted"
                  style={{ marginTop: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Activate Assisted
                </button>
              </div>

              {/* 3. SUPERVISED CARD (DEFAULT) */}
              <div
                className="mode-card"
                id="card-mode-supervised"
                data-mode="supervised"
                style={{
                  background: 'var(--card, #18202B)',
                  borderRadius: '8px',
                  padding: '14px',
                  border: '2px solid #5C6BC0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#5C6BC0', fontSize: '0.95rem' }}>3. Supervised (Default)</b>
                  <span className="tb-badge" style={{ background: 'rgba(92, 107, 192, 0.2)', color: '#5C6BC0', fontSize: '0.72rem' }}>Tier 2: Medium</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted, #8D97AA)', minHeight: '38px' }}>
                  Safe workspace edits &amp; test suites execute automatically. Destructive actions &amp; escapes gated.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                  <div>• Safe Writes: <b style={{ color: '#3DDC84' }}>Auto-Approved</b></div>
                  <div>• Commands: <b style={{ color: '#3DDC84' }}>Whitelisted Auto</b></div>
                  <div>• Self-Healing: <b style={{ color: '#3DDC84' }}>Safe Retries Auto</b></div>
                </div>
                <button
                  id="btn-mode-supervised"
                  type="button"
                  className="tb-btn"
                  data-level="supervised"
                  style={{ marginTop: 'auto', padding: '6px 12px', fontSize: '0.8rem', background: '#5C6BC0', color: '#fff' }}
                >
                  Active Level
                </button>
              </div>

              {/* 4. AUTONOMOUS CARD */}
              <div
                className="mode-card"
                id="card-mode-autonomous"
                data-mode="autonomous"
                style={{
                  background: 'var(--card, #18202B)',
                  borderRadius: '8px',
                  padding: '14px',
                  border: '1px solid var(--line-2, rgba(255,255,255,0.08))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#3DDC84', fontSize: '0.95rem' }}>4. Autonomous</b>
                  <span className="tb-badge" style={{ background: 'rgba(61, 220, 132, 0.2)', color: '#3DDC84', fontSize: '0.72rem' }}>Tier 3: High</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted, #8D97AA)', minHeight: '38px' }}>
                  Self-driving execution, DAG decomposition &amp; self-healing loops bounded by budget &amp; security invariants.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8D97AA)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                  <div>• Safe Writes: <b style={{ color: '#3DDC84' }}>Autonomous</b></div>
                  <div>• Commands: <b style={{ color: '#3DDC84' }}>Autonomous</b></div>
                  <div>• Self-Healing: <b style={{ color: '#3DDC84' }}>Full Recovery Auto</b></div>
                </div>
                <button
                  id="btn-mode-autonomous"
                  type="button"
                  className="tb-btn"
                  data-level="autonomous"
                  style={{ marginTop: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Activate Autonomous
                </button>
              </div>
            </div>
          </div>

          <div id="auto-mode-feedback" hidden style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem' }}></div>
        </div>

        {/* ================================================================= */}
        {/* PANE 2: APPROVAL CENTER */}
        {/* ================================================================= */}
        <div className="auto-pane" id="pane-auto-approvals" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #FF9800' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Human-in-the-Loop Approval Center</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Inspect actions gated by policy, authorize bounded operations, reject risks, or intervene with operator instructions.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button id="btn-refresh-approvals" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '8px', margin: '14px 0', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>Filter Status:</span>
            <button className="act-filter-btn is-active" type="button" data-apf="pending">Pending</button>
            <button className="act-filter-btn" type="button" data-apf="all">All Records</button>
            <button className="act-filter-btn" type="button" data-apf="approved">Approved</button>
            <button className="act-filter-btn" type="button" data-apf="rejected">Rejected</button>
          </div>

          {/* Pending Approvals List */}
          <div id="auto-approvals-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Dynamically populated */}
          </div>

          {/* Empty State */}
          <div
            id="auto-approvals-empty"
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--card, #18202B)',
              borderRadius: '8px',
              border: '1px dashed var(--line-2, rgba(255,255,255,0.12))',
            }}
          >
            <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '8px' }}>✅</span>
            <b style={{ color: 'var(--ink, #E8ECF4)', fontSize: '0.95rem' }}>No Pending Approvals Required</b>
            <p style={{ margin: '6px auto 0', maxWidth: '420px', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              All autonomous agent actions are operating within the configured policy limits and safety envelope.
            </p>
          </div>

          {/* Inline Operator Intervention Modal / Box */}
          <div
            id="auto-intervention-box"
            hidden
            style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(255, 152, 0, 0.08)',
              border: '1px solid rgba(255, 152, 0, 0.35)',
            }}
          >
            <b style={{ color: '#FFB300', fontSize: '0.95rem' }}>Intervene &amp; Steer Action</b>
            <p style={{ margin: '4px 0 10px', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Provide steering instructions or alternative parameters to guide the agent without full rejection.
            </p>
            <input type="hidden" id="intervention-target-id" />
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="auto-intervention-guidance">
                Operator Guidance / Override Instructions:
              </label>
              <textarea
                id="auto-intervention-guidance"
                className="tools-input"
                rows={3}
                placeholder="e.g. Do not touch production migrations. Re-run tests with mock database instead..."
                style={{ width: '100%', padding: '8px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button id="btn-cancel-intervention" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                Cancel
              </button>
              <button
                id="btn-submit-intervention"
                type="button"
                className="tb-btn"
                style={{ background: '#FF9800', color: '#000', fontWeight: 700, fontSize: '0.8rem', padding: '6px 16px' }}
              >
                Submit Intervention
              </button>
            </div>
          </div>

          {/* Historical Approvals Log */}
          <div id="auto-approvals-history" style={{ marginTop: '20px' }}></div>
        </div>

        {/* ================================================================= */}
        {/* PANE 3: BUDGET & RESOURCE MONITOR */}
        {/* ================================================================= */}
        <div className="auto-pane" id="pane-auto-budget" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #4CAF50' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Budget &amp; Resource Monitor</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Enforce strict execution limits on concurrency, financial spend, token consumption, and execution duration.
                </p>
              </div>
              <button id="btn-refresh-budget" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Usage
              </button>
            </div>
          </div>

          {/* Visual Meters Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginTop: '14px' }}>
            {/* Meter 1: Financial Budget */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Financial Spend ($ USD)</span>
                <span id="meter-budget-cost-text" style={{ fontSize: '0.82rem', color: '#4CAF50', fontWeight: 700 }}>$0.00 / $10.00 (0%)</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-budget-cost-bar" style={{ background: '#4CAF50', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Hard cap: Execution pauses when limit is exhausted.
              </span>
            </div>

            {/* Meter 2: Active Concurrency */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Active Concurrency</span>
                <span id="meter-concurrency-text" style={{ fontSize: '0.82rem', color: '#29B6F6', fontWeight: 700 }}>0 / 3 subtasks</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-concurrency-bar" style={{ background: '#29B6F6', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Throttled across all active providers (Claude Code, Codex).
              </span>
            </div>

            {/* Meter 3: Token Spend */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Token Consumption</span>
                <span id="meter-tokens-text" style={{ fontSize: '0.82rem', color: '#AB47BC', fontWeight: 700 }}>0 / 500,000 (0%)</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-tokens-bar" style={{ background: '#AB47BC', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Aggregated token usage across model inferences.
              </span>
            </div>

            {/* Meter 4: Duration / Time Spend */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Execution Duration</span>
                <span id="meter-duration-text" style={{ fontSize: '0.82rem', color: '#FFA726', fontWeight: 700 }}>0 / 60 min (0%)</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-duration-bar" style={{ background: '#FFA726', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Automatic timeout guard prevents runaway execution.
              </span>
            </div>

            {/* Meter 5: Subtask Completion Quota */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Subtask Quota</span>
                <span id="meter-subtasks-text" style={{ fontSize: '0.82rem', color: '#26A69A', fontWeight: 700 }}>0 / 25 subtasks</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-subtasks-bar" style={{ background: '#26A69A', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Max subtask decompositions allowed per master objective.
              </span>
            </div>

            {/* Meter 6: Total Executions */}
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)' }}>Total Executions</span>
                <span id="meter-executions-text" style={{ fontSize: '0.82rem', color: '#8D97AA', fontWeight: 700 }}>0 / 50 runs</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                <div id="meter-executions-bar" style={{ background: '#8D97AA', height: '100%', width: '0%', transition: 'width 0.3s' }}></div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', display: 'block', marginTop: '6px' }}>
                Total subtask and self-healing dispatch executions.
              </span>
            </div>
          </div>

          {/* Budget Limit Configuration Form */}
          <div style={{ marginTop: '20px', background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Configure Quotas &amp; Limit Boundaries</b>
            <p style={{ margin: '4px 0 14px', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Tune resource boundaries. When reached, the Policy Engine safely pauses execution for operator review.
            </p>

            <form id="form-auto-budget" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="budget-max-cost">
                  Max Cost ($ USD):
                </label>
                <input type="number" step="0.5" min="1" id="budget-max-cost" className="tools-input" defaultValue="10.00" style={{ width: '100%', padding: '6px 8px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="budget-max-concurrency">
                  Max Concurrency:
                </label>
                <input type="number" min="1" max="10" id="budget-max-concurrency" className="tools-input" defaultValue="3" style={{ width: '100%', padding: '6px 8px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="budget-max-tokens">
                  Max Tokens:
                </label>
                <input type="number" step="50000" min="10000" id="budget-max-tokens" className="tools-input" defaultValue="500000" style={{ width: '100%', padding: '6px 8px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="budget-max-duration">
                  Max Duration (Minutes):
                </label>
                <input type="number" min="5" max="360" id="budget-max-duration" className="tools-input" defaultValue="60" style={{ width: '100%', padding: '6px 8px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="budget-max-subtasks">
                  Max Subtasks:
                </label>
                <input type="number" min="1" max="100" id="budget-max-subtasks" className="tools-input" defaultValue="25" style={{ width: '100%', padding: '6px 8px' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  id="btn-save-budget"
                  className="tb-btn"
                  style={{ background: '#4CAF50', color: '#fff', fontWeight: 600, padding: '8px 18px', width: '100%' }}
                >
                  Save Budget Limits
                </button>
              </div>
            </form>

            <div id="auto-budget-status" hidden style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem' }}></div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* PANE 4: EMERGENCY STOP PANEL */}
        {/* ================================================================= */}
        <div className="auto-pane" id="pane-auto-emergency" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #E53935' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: '#FF8A80' }}>System Emergency Stop Panel</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Deterministic instantaneous halt. Blocks future dispatches and sends cancellation signals across all active providers.
                </p>
              </div>
              <button id="btn-refresh-emergency" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh State
              </button>
            </div>
          </div>

          {/* Emergency State Machine Visualizer */}
          <div style={{ marginTop: '14px', background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #E8ECF4)', display: 'block', marginBottom: '8px' }}>
              Emergency Stop State Machine:
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span id="em-state-idle" className="tb-badge" style={{ background: '#3DDC84', color: '#000', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700 }}>
                1. IDLE (Normal)
              </span>
              <span style={{ color: 'var(--muted, #8D97AA)' }}>➔</span>
              <span id="em-state-tripping" className="tb-badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted, #8D97AA)', padding: '6px 12px', fontSize: '0.8rem' }}>
                2. TRIPPING
              </span>
              <span style={{ color: 'var(--muted, #8D97AA)' }}>➔</span>
              <span id="em-state-cancelling" className="tb-badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted, #8D97AA)', padding: '6px 12px', fontSize: '0.8rem' }}>
                3. CANCELLING
              </span>
              <span style={{ color: 'var(--muted, #8D97AA)' }}>➔</span>
              <span id="em-state-halted" className="tb-badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted, #8D97AA)', padding: '6px 12px', fontSize: '0.8rem' }}>
                4. HALTED
              </span>
              <span style={{ color: 'var(--muted, #8D97AA)' }}>➔</span>
              <span id="em-state-recovering" className="tb-badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted, #8D97AA)', padding: '6px 12px', fontSize: '0.8rem' }}>
                5. RECOVERING
              </span>
            </div>
          </div>

          {/* Cancellation Tracking Across Providers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '14px' }}>
            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '0.9rem', color: 'var(--ink, #E8ECF4)' }}>Claude Code Provider</b>
                <span id="em-status-claude" className="tb-badge" style={{ background: 'rgba(61, 220, 132, 0.2)', color: '#3DDC84', fontSize: '0.75rem' }}>
                  Operational / Idle
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--muted, #8D97AA)' }}>
                Signal: Process SIGINT / cancellation supported.
              </p>
            </div>

            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '0.9rem', color: 'var(--ink, #E8ECF4)' }}>Codex CLI Provider</b>
                <span id="em-status-codex" className="tb-badge" style={{ background: 'rgba(61, 220, 132, 0.2)', color: '#3DDC84', fontSize: '0.75rem' }}>
                  Operational / Idle
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--muted, #8D97AA)' }}>
                Signal: Sandboxed subshell abort &amp; worktree rollback supported.
              </p>
            </div>

            <div style={{ background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '0.9rem', color: 'var(--ink, #E8ECF4)' }}>Process Cancellations</b>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted, #8D97AA)' }}>
                  Pending: <b id="em-pending-count" style={{ color: '#FFB300' }}>0</b> · Confirmed: <b id="em-confirmed-count" style={{ color: '#3DDC84' }}>0</b>
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--muted, #8D97AA)' }}>
                Strict distinction between Cancellation Requested and Process Confirmed Termination.
              </p>
            </div>
          </div>

          {/* Action Trigger Box */}
          <div style={{ marginTop: '16px', background: 'rgba(229, 57, 53, 0.08)', border: '1px solid rgba(229, 57, 53, 0.35)', padding: '18px', borderRadius: '8px' }}>
            <b style={{ color: '#FF8A80', fontSize: '1rem', display: 'block', marginBottom: '4px' }}>
              Trip Emergency Stop
            </b>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Immediately blocks all subtask dispatches and signals termination to all active processes.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="em-reason-input">
                Halt Reason (Audited):
              </label>
              <input
                type="text"
                id="em-reason-input"
                className="tools-input"
                placeholder="e.g. Operator manual pause / Unexpected file modification"
                style={{ width: '100%', padding: '8px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                id="btn-emergency-stop-panel"
                type="button"
                className="tb-btn"
                style={{
                  background: '#E53935',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🛑</span>
                <span>HALT SYSTEM IMMEDIATELY</span>
              </button>
            </div>
          </div>

          {/* Resume System Section */}
          <div id="section-emergency-resume" hidden style={{ marginTop: '16px', background: 'var(--card, #18202B)', padding: '18px', borderRadius: '8px', border: '1px solid #3DDC84' }}>
            <b style={{ color: '#3DDC84', fontSize: '1rem', display: 'block', marginBottom: '6px' }}>
              Resume Autonomous System
            </b>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Confirm all safety invariants are satisfied and select the safe resume autonomy tier.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" id="em-resume-confirm" />
                <span>I have reviewed recent execution logs and confirm it is safe to resume execution.</span>
              </label>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }} htmlFor="em-resume-level-select">
                  Resume Autonomy Level:
                </label>
                <select id="em-resume-level-select" className="tools-input" style={{ width: '100%', maxWidth: '320px', padding: '6px 8px' }}>
                  <option value="supervised">Supervised (Safe Auto - Recommended)</option>
                  <option value="assisted">Assisted (Step-by-Step Approval)</option>
                  <option value="readonly">Read-Only (Exploration Only)</option>
                  <option value="autonomous">Autonomous (Full Self-Driving)</option>
                </select>
              </div>
            </div>

            <button
              id="btn-emergency-resume-panel"
              type="button"
              className="tb-btn"
              style={{ background: '#3DDC84', color: '#000', fontWeight: 700, padding: '10px 20px', fontSize: '0.9rem' }}
            >
              Confirm &amp; Reset Emergency Stop
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* PANE 5: OPERATIONS CONSOLE & SELF-HEALING */}
        {/* ================================================================= */}
        <div className="auto-pane" id="pane-auto-console" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #AB47BC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Autonomous Operations Console</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Active self-healing remediation loops, operator intervention history, and immutable audit trail.
                </p>
              </div>
              <button id="btn-refresh-console" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Console
              </button>
            </div>
          </div>

          {/* Sub-Section 1: Active Self-Healing Remediations */}
          <div style={{ marginTop: '14px', background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Active Self-Healing Remediations</b>
              <span id="auto-healing-count" className="tb-badge" style={{ background: 'rgba(171, 71, 188, 0.2)', color: '#AB47BC', fontSize: '0.75rem' }}>
                0 Active Loops
              </span>
            </div>
            <div id="auto-self-healing-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted, #8D97AA)', fontSize: '0.82rem' }}>
                No active remediation loops. Tasks are executing cleanly without failure loops.
              </div>
            </div>
          </div>

          {/* Sub-Section 2: Operator Intervention Logs */}
          <div style={{ marginTop: '14px', background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)', display: 'block', marginBottom: '10px' }}>
              Human Intervention &amp; Override Logs
            </b>
            <div id="auto-interventions-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted, #8D97AA)', fontSize: '0.82rem' }}>
                No operator interventions recorded yet.
              </div>
            </div>
          </div>

          {/* Sub-Section 3: Real-Time Audit Trail */}
          <div style={{ marginTop: '14px', background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Real-Time Policy &amp; Security Audit Trail</b>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="act-filter-btn is-active" type="button" data-atf="all">All</button>
                <button className="act-filter-btn" type="button" data-atf="policy">Policy</button>
                <button className="act-filter-btn" type="button" data-atf="security">Security</button>
                <button className="act-filter-btn" type="button" data-atf="remediation">Remediation</button>
              </div>
            </div>
            <div
              id="auto-audit-trail"
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                background: '#0D1117',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {/* Populated dynamically */}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
