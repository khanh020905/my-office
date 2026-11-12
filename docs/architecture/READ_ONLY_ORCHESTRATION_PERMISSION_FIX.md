# MY OFFICE — READ-ONLY ORCHESTRATION PERMISSION MISMATCH INVESTIGATION & REPAIR REPORT

**Date:** 2026-11-12  
**Task ID Examined:** `orch_3f204729-5977-4b8a-8470-17647202681f`  
**Status of Examined Task:** `AWAITING_APPROVAL` (Preserved — Unexecuted)  
**Safety Status:** Strict adherence to safety boundaries. No external projects (`XUONGPHIM`, `AI Video Tool`) modified; no tools installed; zero commits pushed; no permissions granted automatically.

---

## 1. Executive Summary

A task request titled *"Perform a comprehensive READ-ONLY architecture analysis of the My Office project"* was submitted to the Dynamic Task Orchestrator. Despite the user's explicit instructions prohibiting filesystem modification, file deletion, and file overwrite, the generated execution plan requested:
* `fs:read`
* `fs:write`
* `fs:delete`
* `process:exec`

The task was erroneously classified as `coding` with risk level `critical` and scheduled as a single-step native execution via Claude Code.

### Root Cause Identified
The permission mismatch occurred due to a **naive keyword-matching flaw in `server/orchestration/task-analyzer.mjs` combined with coarse-grained fallback planning in `server/orchestration/plan-generator.mjs`**:
1. **False-Positive Keyword Matching on Negative Constraints:**  
   The analyzer inspected the prompt with naive regular expressions `/\b(?:delete|remove|erase|unlink)\b/i` and `/\b(?:write|create|modify|save|edit|update)\b/i`. The prompt's explicit safety block:
   ```text
   SAFETY:
   - Strict READ-ONLY operation.
   - Do not modify, create, delete, or overwrite project files.
   ```
   actually triggered the detection for `file_delete` (from "delete") and `file_write` (from "modify", "create"). The analyzer failed to distinguish positive operational intent from negative prohibitions.
2. **Escalation Cascades:**  
   - `needsFsDelete` forced `needsFsWrite = true` and escalated `risk_level = 'critical'`.
   - `process_exec` was inferred from phrases like `run` / `execute` (again from negative safety rules "Do not execute until I explicitly approve").
3. **Coarse-Grained Task Classification:**  
   Because capabilities `code_analysis` and `git_review` were detected, the analyzer defaulted to domain `'coding'`. It lacked an explicit domain classification for `architecture_analysis`.
4. **Single Monolithic Step Generation:**  
   When 0 registered external tools were matched, `plan-generator.mjs` collapsed the entire prompt into a single monolithic step: `Execute task with Claude Code`, aggregating all permissions (`fs:read`, `fs:write`, `fs:delete`, `process:exec`) into that single step instead of breaking the architecture analysis into logical inspection phases.

---

## 2. Complete Execution Plan Inspection (Task `orch_3f204729-5977-4b8a-8470-17647202681f`)

### 2.1 Original Task Specification
* **Request:** Perform a comprehensive READ-ONLY architecture analysis of the My Office project across 10 specific objectives (directory layout, frontend/backend architecture, tool registry, discovery/lifecycle, agent distribution, security management, orchestration, agent integrations, technical debt, and evidence assessment).
* **Execution Mode:** Direct native agent execution via `agent_native` protocol.

### 2.2 Analyzer Output Before Fix
* **Task Type:** `coding`
* **Risk Level:** `critical`
* **Required Capabilities:** `["code_analysis", "git_review"]`
* **Side-Effect Flags:**
  * `needs_filesystem_read`: `true`
  * `needs_filesystem_write`: `true` (escalated by negative safety clause)
  * `needs_filesystem_delete`: `true` (escalated by negative safety clause)
  * `needs_network_access`: `false`
  * `needs_process_execution`: `true` (escalated by negative safety clause)
* **Confidence:** `0.85`
* **Requires Approval:** `true`

### 2.3 Agent & Tool Selection
* **Matched Tools:** `[]` (0 tools in Universal Tool Registry; accurately reported).
* **Rejected Tools:** `[]`
* **Selected Agent:** Claude Code (`claude-code`, score 0.90) due to affinity with `coding` domain and local environment presence.

### 2.4 Plan & Security Decision Before Fix
* **Plan ID:** `plan_05d1ee64-a8d3-4cef-96de-4325ac83d840`
* **Steps:** 1 single monolithic step (`step_1`: "Execute task with Claude Code")
* **Required Permissions:** `["fs:read", "fs:write", "fs:delete", "process:exec"]`
* **Security Decisions:** Never evaluated at runtime because the task paused at `AWAITING_APPROVAL`. However, if evaluated under Phase 5 Security Policy:
  * `fs:delete`: Missing grant -> `REQUIRES_APPROVAL`
  * `fs:write`: Missing grant -> `REQUIRES_APPROVAL`
  * `process:exec`: Missing grant -> `REQUIRES_APPROVAL`
  * `fs:read`: Missing grant -> `REQUIRES_APPROVAL`

---

## 3. Implementation of the Fix

Three files in `server/orchestration/` were modified to address the root causes:

### 3.1 `server/orchestration/task-analyzer.mjs`
1. **Added `architecture_analysis` Task Type:**
   - Expanded `TASK_TYPES` set to include `'architecture_analysis'`.
   - Added regex detection for architecture reviews, technical debt, and system assessments.
2. **Explicit Read-Only & Negative Constraint Awareness:**
   - Detects explicit read-only instructions (`read-only`, `readonly`, `no-write`, `dry-run`, `audit-only`) and negative assertions (`do not modify`, `never delete`, etc.).
   - Explicitly suppresses `needsFsWrite` and `needsFsDelete` when negative patterns or strict read-only modes are requested.
   - Suppresses `needsProcess` on read-only tasks unless explicit CLI or test execution is specifically requested.
3. **Risk Level Normalization:**
   - Strict read-only and architecture analysis tasks without write/delete permissions default to risk level `low`.

### 3.2 `server/orchestration/agent-selector.mjs`
1. Added `'architecture_analysis'` domain to `best_for` profiles of:
   * `claude-code`
   * `codex-cli`
   * `antigravity`
2. Preserved honest environment scoring without granting extra permissions.

### 3.3 `server/orchestration/plan-generator.mjs`
1. **Structured Multi-Step Architecture Assessment DAG:**
   When an `architecture_analysis` task has 0 external tools matched, instead of generating a single monolithic step, `plan-generator.mjs` generates a deterministic 6-step DAG matching the required analysis methodology:
   * **Step 1:** `Inspect project structure` (depends on `[]`)
   * **Step 2:** `Analyze frontend and backend` (depends on `['step_1']`)
   * **Step 3:** `Inspect registry and lifecycle` (depends on `['step_2']`)
   * **Step 4:** `Inspect agent integrations` (depends on `['step_3']`)
   * **Step 5:** `Inspect security and orchestration` (depends on `['step_4']`)
   * **Step 6:** `Produce architecture findings` (depends on `['step_5']`)
2. **Strict Permission Scoping:**
   Each step in the read-only plan requests **only** `['fs:read']`. Permissions `fs:write`, `fs:delete`, `process:exec`, and `net:outbound` are completely excluded.

---

## 4. Permission Evaluation: Before vs After

| Property | Before Repair | After Repair |
| :--- | :--- | :--- |
| **Task Domain** | `coding` | `architecture_analysis` |
| **Risk Classification** | `critical` | `low` |
| **Filesystem Read (`fs:read`)** | `true` | `true` |
| **Filesystem Write (`fs:write`)** | `true` (FALSE POSITIVE) | `false` (STRICTLY DENIED) |
| **Filesystem Delete (`fs:delete`)** | `true` (FALSE POSITIVE) | `false` (STRICTLY DENIED) |
| **Process Execution (`process:exec`)** | `true` (FALSE POSITIVE) | `false` (STRICTLY DENIED) |
| **Network Access (`net:outbound`)** | `false` | `false` (STRICTLY DENIED) |
| **Plan Structure** | 1 Monolithic Step | 6-Step Deterministic DAG |
| **Step Permissions** | `["fs:read", "fs:write", "fs:delete", "process:exec"]` | `["fs:read"]` only |
| **Native Executor Distinction** | Conflated with general tool | Clearly labeled as `agent_native` executor (`tool_id: null`) |

---

## 5. Phase 5 Security Evaluation of the Regenerated Plan

Every step of the regenerated plan was passed through the Phase 5 `SecurityPolicyEngine.evaluateOperation()`:

```json
{
  "agentId": "claude-code",
  "toolId": "claude-code",
  "requestedScopes": ["fs:read"],
  "target": "D:\\somehting code\\my-office"
}
```

### Security Decisions per Step:
* **Step 1 (`step_1` - Inspect project structure):**
  * Requested: `["fs:read"]`
  * Global Policy: Allowed (not in globally denied scopes)
  * Explicit Deny: Allowed (not matching protected targets)
  * Agent Policy (`claude-code`): Allowed (`fs:read` is in `allowed_scopes`)
  * Permission Registry Grant: Not yet granted for this task -> Status: `REQUIRES_APPROVAL`
* **Step 2 (`step_2` - Analyze frontend and backend):**
  * Requested: `["fs:read"]` -> Status: `REQUIRES_APPROVAL`
* **Step 3 (`step_3` - Inspect registry and lifecycle):**
  * Requested: `["fs:read"]` -> Status: `REQUIRES_APPROVAL`
* **Step 4 (`step_4` - Inspect agent integrations):**
  * Requested: `["fs:read"]` -> Status: `REQUIRES_APPROVAL`
* **Step 5 (`step_5` - Inspect security and orchestration):**
  * Requested: `["fs:read"]` -> Status: `REQUIRES_APPROVAL`
* **Step 6 (`step_6` - Produce architecture findings):**
  * Requested: `["fs:read"]` -> Status: `REQUIRES_APPROVAL`

### Prohibited Scope Enforcement Evidence:
* If any step attempts `fs:write`: Blocked at Step 11 (`REQUIRES_APPROVAL`), prohibited by task constraint.
* If any step attempts `fs:delete`: Blocked at Step 11 (`REQUIRES_APPROVAL`), prohibited by task constraint.
* If any step attempts `net:inbound`: Status `DENY` at Step 7 (`Explicitly denied for agent 'claude-code' by agent policy`).
* If any step attempts `secrets:write`: Status `DENY` at Step 6 (`Scope 'secrets:write' is globally denied by platform security policy`).

---

## 6. Verification & Test Results

1. **Unit Tests (`node --test tests/unit/tools-orchestration.test.mjs`):**
   * **9/9 test suites passed** (100%).
   * Task analysis, capability matching, agent selection, plan generation, state progression, and REST APIs all verified.
2. **Full Tool Ecosystem Suites (`node --test tests/unit/tools-*.test.mjs`):**
   * **97/97 tests passed** across all 11 test suites.
3. **Typecheck & Linting:**
   * `npm run typecheck`: 0 errors.
   * `npm run lint`: 0 errors, 0 warnings.
4. **Pending Task Safety Check:**
   * Task `orch_3f204729-5977-4b8a-8470-17647202681f` remains in `AWAITING_APPROVAL` and was **never executed**.

---

## 7. Regenerated Plan Preview

```json
{
  "plan_id": "plan_regenerated_read_only",
  "plan_version": 1,
  "task_type": "architecture_analysis",
  "selected_agent": "claude-code",
  "total_steps": 6,
  "required_permissions": [
    "fs:read"
  ],
  "requires_human_approval": false,
  "fallback_strategy": "fail_safe_abort",
  "steps": [
    {
      "step_id": "step_1",
      "title": "Inspect project structure",
      "description": "Inspect complete project directory layout, manifest files, and dependencies",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": []
    },
    {
      "step_id": "step_2",
      "title": "Analyze frontend and backend",
      "description": "Analyze frontend components and backend service boundaries",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": ["step_1"]
    },
    {
      "step_id": "step_3",
      "title": "Inspect registry and lifecycle",
      "description": "Inspect Universal Tool Registry, discovery metadata, and tool lifecycle state machine",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": ["step_2"]
    },
    {
      "step_id": "step_4",
      "title": "Inspect agent integrations",
      "description": "Inspect multi-agent distribution, adapters, and agent detection status",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": ["step_3"]
    },
    {
      "step_id": "step_5",
      "title": "Inspect security and orchestration",
      "description": "Inspect security policies, permission registry, and dynamic task orchestration engine",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": ["step_4"]
    },
    {
      "step_id": "step_6",
      "title": "Produce architecture findings",
      "description": "Synthesize evidence-based architecture assessment, technical debt, and integration gaps",
      "agent_id": "claude-code",
      "tool_id": null,
      "capability_id": "code_analysis",
      "protocol": "agent_native",
      "required_permissions": ["fs:read"],
      "depends_on": ["step_5"]
    }
  ]
}
```

---

## 8. Conclusion & Status

The permission mismatch has been resolved at the architectural root. Task analysis now respects negative safety constraints and distinguishes read-only architecture analysis from active coding modification.

Task `orch_3f204729-5977-4b8a-8470-17647202681f` has **not** been executed. In accordance with user instructions, execution is stopped pending user approval.

