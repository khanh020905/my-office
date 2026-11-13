// Static markup for My Office Agent Control Center Drawer
export default function ControlDrawer() {
  return (
    <aside className="drawer drawer--wide drawer--control" id="dr-control" hidden aria-label="Agent Control Center">
      <header className="dr-head">
        <div className="dr-title">
          <h2>Agent Control Center</h2>
          <p id="control-status">Multi-Agent Management, Session Control &amp; Execution Lifecycle</p>
        </div>
        <button className="icon-btn" type="button" data-close aria-label="Close">
          <span data-icon="x"></span>
        </button>
      </header>

      {/* Primary Navigation - 4 Semantic Tabs */}
      <div className="tools-nav-bar" role="tablist" id="control-tabs">
        <button className="tools-nav-btn tab is-active" type="button" role="tab" data-ct="agents" aria-selected="true">
          Agents Overview
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ct="sessions" aria-selected="false">
          Sessions
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ct="dispatch" aria-selected="false">
          Task Dispatch
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ct="executions" aria-selected="false">
          Executions History
        </button>
      </div>

      <div className="dr-body" id="control-body">
        {/* 1. AGENTS OVERVIEW TAB */}
        <div className="control-pane" id="pane-control-agents">
          <div className="tools-section" style={{ borderLeft: '4px solid var(--accent, #EF8A5F)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Connected Agent Providers</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Truthful Capabilities · Verified Binaries · Operational State
                </p>
              </div>
              <button id="btn-refresh-agents" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Agents
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', margin: '14px 0', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>Filter:</span>
            <button className="act-filter-btn is-active" type="button" data-af="all">All</button>
            <button className="act-filter-btn" type="button" data-af="verified">Verified</button>
            <button className="act-filter-btn" type="button" data-af="connected">Connected</button>
            <button className="act-filter-btn" type="button" data-af="available">Can Start Tasks</button>
          </div>

          <div id="control-agents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px', marginTop: '12px' }}>
            {/* Populated dynamically by control-view.js */}
          </div>

          {/* AGENT DETAIL MODAL */}
          <div id="agent-detail-container" hidden style={{ marginTop: '20px' }}></div>
        </div>

        {/* 2. SESSIONS TAB */}
        <div className="control-pane" id="pane-control-sessions" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #6AAEFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Active &amp; Resting Sessions</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Session Isolation · Mid-turn Steering · Working Directories
                </p>
              </div>
              <button id="btn-refresh-sessions" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Sessions
              </button>
            </div>
          </div>

          <div id="control-sessions-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Populated dynamically */}
          </div>
        </div>

        {/* 3. TASK DISPATCH TAB */}
        <div className="control-pane" id="pane-control-dispatch" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #3DDC84' }}>
            <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Task Dispatch Panel</b>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Assign tasks to verified providers with path boundary validation and live Activity Center tracking.
            </p>
          </div>

          <div style={{ background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))', marginTop: '14px' }}>
            <form id="form-control-dispatch" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="dispatch-agent-select">
                  Target Agent Provider:
                </label>
                <select id="dispatch-agent-select" className="tools-input" style={{ width: '100%', padding: '8px' }}>
                  <option value="claude-code">Claude Code (CLI Coding Agent · Full Controls &amp; Steering)</option>
                  <option value="codex-cli">Codex CLI (Sandboxed Worktree Runner · Artifact Verification)</option>
                  <option value="codex-app" disabled>Codex App (Desktop GUI · Automated Start Unsupported)</option>
                  <option value="antigravity" disabled>Antigravity (Observer Integration · Automated Start Unsupported)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="dispatch-dir-input">
                  Project / Working Directory:
                </label>
                <input
                  type="text"
                  id="dispatch-dir-input"
                  className="tools-input"
                  placeholder="Full path or relative to project root"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="dispatch-instruction-input">
                  Task Instruction:
                </label>
                <textarea
                  id="dispatch-instruction-input"
                  className="tools-input"
                  rows={4}
                  placeholder="Describe the specific goal or task to execute..."
                  style={{ width: '100%', padding: '8px', resize: 'vertical' }}
                  required
                />
              </div>

              <div id="dispatch-codex-options" hidden>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="dispatch-artifacts-input">
                  Expected Artifacts (Comma-separated paths, Codex CLI only):
                </label>
                <input
                  type="text"
                  id="dispatch-artifacts-input"
                  className="tools-input"
                  placeholder="e.g. dist/index.js, test-report.json"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div id="dispatch-status-msg" hidden style={{ padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}></div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="submit" id="btn-dispatch-submit" className="tb-btn" style={{ background: 'var(--accent, #EF8A5F)', color: '#fff', fontWeight: 600, padding: '8px 24px' }}>
                  Dispatch Task
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* 4. EXECUTIONS HISTORY TAB */}
        <div className="control-pane" id="pane-control-executions" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #E57373' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Execution History &amp; Controls</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Cancel · Retry · Follow-up · Activity Center Timeline Jump
                </p>
              </div>
              <button id="btn-refresh-executions" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh Executions
              </button>
            </div>
          </div>

          <div id="control-executions-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Populated dynamically */}
          </div>
        </div>
      </div>
    </aside>
  );
}

