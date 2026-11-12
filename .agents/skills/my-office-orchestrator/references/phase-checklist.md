# Phase checklist

For every phase record: objective; prerequisites; verification criteria; completed tasks; remaining tasks; evidence (commands, outputs, event samples, paths); blockers; approval requirements. A phase is complete only when its criteria have evidence.

| Phase | Objective and exit evidence | Approval boundary |
|---|---|---|
| 0 | Repository, Git state, architecture, assets and event path inspected; report uses actual paths. | No edits. |
| 1 | Architecture and minimal plan grounded in source; risks and test plan reported. | No edits. |
| 2A | Installed Codex interfaces investigated; actual JSONL and tool/file behavior captured; CLI vs GUI vs app-server distinguished. | Stop before 2B until user approves. Experimental interfaces stay labelled. |
| 2B | Independent Codex session identity/lifecycle uses verified event source and existing session/SSE/worker path; coexistence with Claude has focused tests. | User approval required after 2A. |
| 2C | Installed Ponytail invocation modes verified; supported programmatic or assistant-mediated option identified; no invented API. | Stop before automatic QA if execution mechanism is not approved. |
| 2D | Batching, stable identity, dedupe, bounded review/fix loop, finding resolution and re-verification tested; no source auto-edit. | Confirm runtime/dependency/security boundaries first. |
| 2E | Codex and shared QA information shown via existing UI/character architecture; regression evidence. | No scene replacement or new backend/event bus. |
| 3 | Unit, lint, typecheck, build and relevant e2e results compared with baseline; failures classified. | Do not modify tests to conceal failures. |
| 4 | Evidence-backed final status, usage steps, unresolved issues and cleanup complete. | Never say COMPLETE with critical checks unrun. |

Do not repeat valid prior checks unless code/tool/version changes or evidence is insufficient. Never silently skip a phase. When a phase is blocked, record why and do safe independent work only.
