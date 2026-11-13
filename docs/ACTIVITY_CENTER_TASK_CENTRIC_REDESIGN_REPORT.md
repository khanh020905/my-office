# Activity Center Redesign: Task-Centric Progress & Intelligent Event Aggregation Report

**Date:** 2026-11-12  
**Repository:** `my-office`  
**Scope:** Architectural and UX transformation of the Activity Center from an event-centric feed to a task-centric execution dashboard.

---

## A. Root Cause of Feed Growth

Prior to this architecture overhaul, the Activity Center exhibited unchecked growth for several concrete reasons:
1. **Event-Centric Ingestion and Display Model:** Every micro-action (`read`, `edit`, `write`, `bash`, `pre-tool`, `post-tool`, `codexturn`, `codexmessage`, `wait`, `fail`, `testok`) was emitted as a separate event and appended directly to the feed.
2. **Absence of a Persistent Task Entity:** Events were loosely grouped only if consecutive items arrived from the same session within a narrow 4-minute time window. Once that window elapsed, or if an alert/tool from another agent interleaved, a new group card was created.
3. **Linear Feed Mingling Active and Completed Tasks:** Active tasks, waiting tasks, and completed historical tasks were rendered indiscriminately into a single reverse-chronological list of 90 items.
4. **File Edit and Command Duplication:** Repetitive file modifications (e.g. editing `src/auth.js` 10 times during a turn) or repeated terminal commands created 10 to 30 separate cards or lines, bloating the feed into an unreadable firehose.
5. **No Structured Progress Tracking:** The feed could not convey whether a task was 50% finished, in the planning phase, testing, or awaiting approval, forcing users to manually read through dozens of individual log lines.

---

## B. Architectural Changes & File Manifest

### Newly Created Files:
1. `src/shared/task-aggregator.js`: Pure, shared engine for idempotent task-centric event aggregation, real progress tracking (quantitative, phase-based, activity-only), file/command correlation, and lifecycle state management.
2. `tests/unit/task-aggregator.test.mjs`: Complete unit test suite verifying all 20 lifecycle, concurrency, idempotence, and evidence-level requirements.
3. `docs/ACTIVITY_CENTER_TASK_CENTRIC_REDESIGN_REPORT.md`: Comprehensive engineering report and architectural contract.

### Modified Files:
1. `src/office/ui/activity.js`:
   - Redesigned into three sections: Section A (Overview), Section B (Active Tasks), Section C (Recent History).
   - Card-level incremental updates (one primary card per task/run).
   - In-place task timeline expansion with intelligent clustering of file operations and terminal executions.
   - Preserved all external API exports (`toast`, `cap`, `feedRow`, `doingOf`, `renderHud`, `renderFeed`, `queueFeed`, `addFeed`, `queueUi`, `setup`, `fmtTok`, `fmtUsd`).
2. `src/styles/activity.css`:
   - CSS grid/flex styles for `.act-overview-grid`, `.tc-card`, `.tc-card--active`, `.tc-card--waiting`, `.tc-card--failed`, `.tc-card--stale`.
   - Real progress bars (`.tc-progress-bar`, `.tc-progress-fill`), phase pills (`.tc-phase-indicator`), and activity pulses (`.tc-activity-only`).
   - Collapsible history date groups and nested timeline groups (`.tc-tl-group`).
3. `server/index.mjs`:
   - Embedded `taskAggregator` into the server event pipeline (`pushFeed`, `onHook`, `onCodexAppHook`, `codexRunUpdate`).
   - Injected live `tasks` snapshot into `/stream` and `/api/live`.
   - Added REST endpoint `GET /api/activity/tasks` supporting filtering (`provider`, `status`, `projectId`, `agentId`) and pagination (`limit`, `offset`, `search`).
4. `src/office/demo/demo.js`:
   - Integrated snapshot recovery for `taskAggregator`.
5. `src/i18n/locales/en/activity.js` & `src/i18n/locales/vi/activity.js`:
   - Added bilingual localization strings for task sections, progress phases, statuses, and date headers.
6. `server/orchestration/orchestrator.mjs`:
   - Fixed scope bug where `request` was referenced instead of `record.original_request` in `provideUserInput` and `regenerateTaskPlan`.

---

## C. Data Model & Aggregation Logic

### 1. Task-Centric Data Schema (`Task`)
```typescript
interface Task {
  taskId: string;               // Stable identifier (e.g. claude:s1:task-10, codex-cli:run-2)
  runId: string | null;         // Run or dispatch ID
  agentId: string;              // Agent session key
  provider: 'claude-code' | 'codex-app' | 'codex-cli' | 'antigravity' | 'generic';
  projectId: string;            // Directory or repo name
  conversationId: string;       // Session ID
  title: string;                // Initial prompt summary or task goal
  description: string;          // Full prompt or detailed spec
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'stale' | 'unknown';
  currentPhase: 'Analyzing' | 'Planning' | 'Editing' | 'Executing' | 'Testing' | 'Reviewing' | 'Completed' | null;
  currentStep: number | null;
  totalSteps: number | null;
  completedSteps: number | null;
  progress: {
    mode: 'quantitative' | 'phase' | 'activity_only';
    percent: number | null;     // 0 - 100%
    phase: string | null;
    label: string;
  };
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  lastEventAt: number;
  eventCount: number;
  filesChanged: string[];       // Real, deduplicated observed file paths
  fileHistory: Record<string, Array<{ op: string; ts: number }>>;
  commandsExecuted: string[];   // Deduplicated commands executed
  commandHistory: Array<{ cmd: string; ts: number; runner?: string; ok?: boolean }>;
  result: string | null;
  error: string | null;
  evidenceLevel: 'verified' | 'inferred' | 'coarse_observation' | 'unknown';
  events: RawOfficeEvent[];     // Chronological provenance records
}
```

### 2. Event Association & Boundary Preservation
- **Claude Code:** Prompts initiate `claude:<session>:task-<id>`. Subsequent tool operations (`read`, `edit`, `bash`, `wait`, `testok`) correlate to that active task until `Stop` transitions it to `succeeded`.
- **Codex App:** `UserPromptSubmit` (`codex_prompt`) keys by `codex-app:<session_id>:<turn_id>`. File events (`read`, `edit`, `create`, `delete`) and Bash executions attach to the active turn. `codex_execution_end` marks completion with `unknown` outcome unless verified.
- **Codex CLI:** Independent runner invocations key by `codex-cli:<run_id>`. JSONL events (`turn.started`, `item.completed`, `codexexit`) update the run card.
- **Antigravity:** Keys by `antigravity:<session_id>`. Tagged with `evidenceLevel: 'coarse_observation'`. Status remains `unknown`, never claiming unobserved file edits or tool successes.

### 3. Truthful Progress Tracking
- **Quantitative:** When step counts are provided (e.g. from workflow DAGs or step tasks), calculates `completedSteps / totalSteps` without rounding distortions.
- **Phase-Based:** Inferred directly from real execution actions:
  - `read`, `grep`, `glob` → **Analyzing**
  - `prompt`, `plan` → **Planning**
  - `edit`, `write`, `create`, `delete` → **Editing**
  - `bash`, `cmd` → **Executing**
  - `test`, `testok`, `testfail` → **Testing**
  - `wait`, `ask`, `reviewing` → **Reviewing**
  - `stop` → **Completed**
- **Activity-Only:** For Antigravity or coarse observation: explicitly displays *"Activity observed (detailed progress unavailable)"*. Zero fabricated percentages.

### 4. Idempotence & Deduplication
- Maintained a bounded LRU of 10,000 stable event keys.
- Duplicate event transmissions do not inflate `eventCount`, `filesChanged`, or `commandsExecuted`.

---

## D. UI Redesign Breakdown

### Section A — Overview (Compact Aggregate Metrics)
- Displays active, waiting, completed, and failed task counters in `#feed-stats`.
- Preserves existing system KPI metrics (Reads, Edits, Commands, API cost estimate).
- Responsive, compact header that avoids consuming vertical space.

### Section B — Active Tasks (Primary Dashboard)
- **One Card Per Task/Run:** Even a 20-step execution produces exactly ONE primary card.
- **In-Place Updates:** As events arrive via SSE, the card updates in-place without appending new cards.
- **Live Visuals:** Status pill, phase badge, progress bar/pulsing phase indicator, file chips, command chips.
- **Attention Callouts:** Tasks in `waiting` (approval required) or `stale` render amber warning banners.
- **Expandable Timeline:** Clicking *"Execution Timeline"* toggles the chronological event view.

### Section C — Recent History
- Tasks transition from Active to Recent History upon reaching terminal states (`succeeded`, `failed`, `cancelled`, `unknown`).
- **Date Grouping:** Tasks are grouped by date (*"Today"*, *"Yesterday"*, or `YYYY-MM-DD`).
- **Collapsible Groups:** Completed history groups are collapsed by default to conserve space, while failed tasks and warnings remain immediately accessible.
- **Pagination:** Initial limit of 15 tasks with a *"Load older history"* button.
- **Filters:** Fast tab filters for *All*, *Succeeded*, *Failed*, and type chips (`cmd`, `edit`, `read`, `web`, `agent`).

### Detailed Chronological Timeline
When expanded, underlying events are rendered with intelligent grouping:
- **Grouped File Operations:** Shows *"File operations (3)"*, expandable to reveal real paths (`src/server/a.mjs (2 edits)`, etc.).
- **Grouped Terminal Operations:** Shows *"Terminal operations (4)"* with individual commands and status.
- **Milestone Events:** Clear display of Task Start, Approvals, Tests, and Final Outcomes.
- **Image Support:** Thumbnail previews for generated/inspected images.

---

## E. Integration Status by Provider

| Provider | Integration Type | Progress Mode | Evidence Level | Verification Status |
|---|---|---|---|---|
| **Claude Code** | Hook pipeline (`/event` → `onHook`) | Phase-based or Quantitative | Verified execution & inferred edits | Functionally verified; unit & full-suite passing |
| **Codex App** | Hook plugin (`/codex-app-event`) | Phase-based | Verified tool names & sanitized paths | Verified isolation; hook contracts verified |
| **Codex CLI** | Process runner (`/api/codex/runs`) | Phase-based | Verified lifecycle; unknown tool outcomes | Verified separation from Codex App; suite passing |
| **Antigravity** | Filesystem observer (`watchAntigravity`) | Activity-only | Coarse observation | Verified status unknown; no fake percentages |

---

## F. Test & Build Verification Results

- **Unit Tests:**
  - `tests/unit/task-aggregator.test.mjs`: **20 passed, 0 failed** (100% pass covering all 20 lifecycle scenarios).
  - `tests/unit/i18n.test.mjs`: **3 passed, 0 failed** (Bilingual parity verified).
  - `tests/unit/codex-app-events.test.mjs`: **10 passed, 0 failed**.
  - `tests/unit/activity-stats.test.mjs`: **2 passed, 0 failed**.
  - Full suite (`npm test -- --test-concurrency=1`): **377 tests, 369 passed, 0 failed, 8 skipped** (sqlite3-dependent).
- **TypeScript Check (`npm run typecheck`):** **Passed** (0 errors).
- **Linter (`npm run lint`):** **Passed** (0 errors).
- **Production Build (`npm run build`):** **Compiled successfully in 5.3s**, static pages generated in 1.2s.

---

## G. Remaining Limitations

1. **Antigravity Internal State:** Antigravity `.db` format is private and undocumented. Only conversation file mtimes can be observed; detailed prompts, sub-steps, and tool arguments remain unsupported and truthfully reported as *Activity observed (detailed progress unavailable)*.
2. **Codex App Inputs/Outputs:** The Codex App hook plugin intentionally strips raw tool input/output payloads to prevent leaking sensitive secrets or large payloads. As a result, exact Bash arguments from Codex App are not displayed, though real file paths are normalized and preserved.
3. **Codex CLI Tool Mapping:** Tool-level read/edit counters in Codex CLI remain unsupported pending a stabilized JSONL mapping from upstream Codex CLI versions.
