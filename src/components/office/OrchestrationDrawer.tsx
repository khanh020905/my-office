// Static markup for My Office Multi-Agent Orchestration Workspace Drawer
export default function OrchestrationDrawer() {
  return (
    <aside className="drawer drawer--wide drawer--orchestration" id="dr-orchestration" hidden aria-label="Multi-Agent Task Orchestration">
      <header className="dr-head">
        <div className="dr-title">
          <h2>Task Orchestration Engine</h2>
          <p id="orchestration-status">Multi-Agent DAG Coordination, Dependency Graphs &amp; Result Handoffs</p>
        </div>
        <button className="icon-btn" type="button" data-close aria-label="Close">
          <span data-icon="x"></span>
        </button>
      </header>

      {/* Navigation Tabs - 4 Core Views */}
      <div className="tools-nav-bar" role="tablist" id="orchestration-tabs">
        <button className="tools-nav-btn tab is-active" type="button" role="tab" data-ot="masters" aria-selected="true">
          Master Tasks
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ot="create" aria-selected="false">
          New Master Task (DAG)
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ot="board" aria-selected="false">
          Execution Board
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ot="detail" aria-selected="false">
          Task Detail &amp; Graph
        </button>
        <button className="tools-nav-btn tab" type="button" role="tab" data-ot="qa" aria-selected="false" id="tab-orch-qa">
          QA &amp; Quality Gates
        </button>
      </div>

      <div className="dr-body" id="orchestration-body">
        {/* 1. MASTER TASKS OVERVIEW */}
        <div className="orch-pane" id="pane-orch-masters">
          <div className="tools-section" style={{ borderLeft: '4px solid var(--accent, #EF8A5F)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Orchestrated Master Objectives</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Coordinated Multi-Task DAGs · Truthful Progress · Independent Concurrency
                </p>
              </div>
              <button id="btn-refresh-masters" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh
              </button>
            </div>
          </div>

          <div id="orch-masters-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Populated dynamically */}
          </div>
        </div>

        {/* 2. CREATE NEW MASTER TASK (DAG COMPOSER) */}
        <div className="orch-pane" id="pane-orch-create" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #3DDC84' }}>
            <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Compose Master Objective &amp; Subtask DAG</b>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Define the objective, decompose into subtasks, assign providers, and declare dependencies.
            </p>
          </div>

          <form id="form-create-master" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="master-title-input">
                  Master Task Title:
                </label>
                <input
                  type="text"
                  id="master-title-input"
                  className="tools-input"
                  placeholder="e.g. Implement OAuth Security Overhaul & Integration Tests"
                  style={{ width: '100%', padding: '8px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="master-desc-input">
                  Objective Description:
                </label>
                <textarea
                  id="master-desc-input"
                  className="tools-input"
                  rows={2}
                  placeholder="High-level description of what the multi-agent team will achieve..."
                  style={{ width: '100%', padding: '8px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }} htmlFor="master-dir-input">
                  Project Working Directory:
                </label>
                <input
                  type="text"
                  id="master-dir-input"
                  className="tools-input"
                  placeholder="."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--card, #18202B)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Subtask DAG Builder</b>
                <button type="button" id="btn-add-subtask" className="tb-btn" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                  + Add Subtask
                </button>
              </div>

              <div id="subtasks-builder-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Dynamically appended subtask cards */}
              </div>
            </div>

            <div id="master-create-status" hidden style={{ padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}></div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="submit" id="btn-submit-master" className="tb-btn" style={{ background: 'var(--accent, #EF8A5F)', color: '#fff', fontWeight: 600, padding: '8px 24px' }}>
                Create &amp; Initialize Master Task
              </button>
            </div>
          </form>
        </div>

        {/* 3. EXECUTION BOARD (KANBAN) */}
        <div className="orch-pane" id="pane-orch-board" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #6AAEFF' }}>
            <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Live Multi-Agent Execution Board</b>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
              Real-time progression: Queued &rarr; Ready &rarr; Running &rarr; Completed / Blocked
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '14px' }}>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderTop: '3px solid #8D97AA' }}>
              <b style={{ fontSize: '0.85rem', color: '#8D97AA' }}>Ready / Waiting</b>
              <div id="board-col-ready" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}></div>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderTop: '3px solid #6AAEFF' }}>
              <b style={{ fontSize: '0.85rem', color: '#6AAEFF' }}>Running (Concurrent)</b>
              <div id="board-col-running" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}></div>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderTop: '3px solid #E57373' }}>
              <b style={{ fontSize: '0.85rem', color: '#E57373' }}>Blocked / Failed</b>
              <div id="board-col-blocked" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}></div>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderTop: '3px solid #3DDC84' }}>
              <b style={{ fontSize: '0.85rem', color: '#3DDC84' }}>Completed</b>
              <div id="board-col-succeeded" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}></div>
            </div>
          </div>
        </div>

        {/* 4. TASK DETAIL & GRAPH VIEW */}
        <div className="orch-pane" id="pane-orch-detail" hidden>
          <div id="orch-detail-content">
            <div style={{ color: 'var(--muted, #8D97AA)', padding: '24px', textAlign: 'center' }}>
              Select a Master Task from the list to inspect its dependency graph, execution trace, and consolidated handoffs.
            </div>
          </div>
        </div>

        {/* 5. QUALITY ASSURANCE & REVIEW ENGINE */}
        <div className="orch-pane" id="pane-orch-qa" hidden>
          <div className="tools-section" style={{ borderLeft: '4px solid #A78BFA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ fontSize: '1.05rem', color: 'var(--ink, #E8ECF4)' }}>Quality Assurance &amp; Review Engine</b>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted, #8D97AA)' }}>
                  Independent Verification · Acceptance Gates · Findings &amp; Remediation
                </p>
              </div>
              <button id="btn-refresh-qa" type="button" className="tb-btn" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                Refresh QA
              </button>
            </div>
          </div>

          {/* QA KPI Overview Grid */}
          <div id="qa-overview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '14px' }}>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderLeft: '3px solid #6AAEFF' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>Pending Reviews</div>
              <b id="qa-metric-pending" style={{ fontSize: '1.25rem', color: 'var(--ink, #E8ECF4)' }}>0</b>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderLeft: '3px solid #3DDC84' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>Passed Reviews</div>
              <b id="qa-metric-passed" style={{ fontSize: '1.25rem', color: '#3DDC84' }}>0</b>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderLeft: '3px solid #E57373' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>Failed Reviews</div>
              <b id="qa-metric-failed" style={{ fontSize: '1.25rem', color: '#E57373' }}>0</b>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderLeft: '3px solid #EF8A5F' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>Open Findings</div>
              <b id="qa-metric-open" style={{ fontSize: '1.25rem', color: '#EF8A5F' }}>0</b>
            </div>
            <div className="tools-card" style={{ padding: '10px', background: 'var(--card, #18202B)', borderLeft: '3px solid #FF5252' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8D97AA)', textTransform: 'uppercase' }}>Critical Blockers</div>
              <b id="qa-metric-critical" style={{ fontSize: '1.25rem', color: '#FF5252' }}>0</b>
            </div>
          </div>

          {/* Quality Gate Dashboard */}
          <div style={{ marginTop: '16px', background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Master Quality Gate Dashboard</b>
                <span id="qa-gate-status-pill" style={{ marginLeft: '10px', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#3DDC8422', color: '#3DDC84' }}>
                  Gates Status
                </span>
              </div>
              <button id="btn-trigger-review" type="button" className="tb-btn" style={{ fontSize: '0.78rem', padding: '4px 10px', background: '#A78BFA', color: '#fff' }}>
                Run Independent Review
              </button>
            </div>
            <div id="qa-gates-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {/* Dynamic Gate cards */}
            </div>
          </div>

          {/* Findings Board */}
          <div style={{ marginTop: '16px', background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)' }}>Findings &amp; Remediation Board</b>
              <button id="btn-create-remediation" type="button" className="tb-btn" style={{ fontSize: '0.78rem', padding: '4px 10px', background: 'var(--accent, #EF8A5F)', color: '#fff' }}>
                Create Remediation Task
              </button>
            </div>
            <div id="qa-findings-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Populated dynamically */}
            </div>
          </div>

          {/* Review Audit Timeline */}
          <div style={{ marginTop: '16px', background: 'var(--card, #18202B)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}>
            <b style={{ fontSize: '0.95rem', color: 'var(--ink, #E8ECF4)', display: 'block', marginBottom: '12px' }}>Review Audit Trail &amp; Verification History</b>
            <div id="qa-timeline-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Dynamic timeline entries */}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

