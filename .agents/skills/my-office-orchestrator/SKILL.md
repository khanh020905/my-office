---
name: my-office-orchestrator
description: Continue, verify, or report the approved My Office Codex and Ponytail integration workflow from its persistent checkpoint. Use when asked to continue My Office integration, check progress, complete a phase, run regression tests, investigate blockers, or prepare final verification.
---

# My Office Integration Orchestrator

Coordinate the My Office integration as a reusable workflow, not as a separate agent, service, daemon, or application.

## Start every run

1. Resolve the repository root as the directory containing this skill's `.agents` directory. Confirm it is the My Office repository; never assume the current directory.
2. Read `.codex-workflow/STATE.md` first when present. Read applicable `AGENTS.md`, relevant source, and referenced policies before acting.
3. Run `git status --short --branch`. Preserve all edits, including the untracked `Microsoft/` directory. Never reset, rebase, commit, push, deploy, or discard user changes.
4. Compare checkpoint claims with current files and tool versions. Repeat a check only when its evidence is missing, stale, or contradicted by new information.
5. Identify the requested phase and its prerequisites in `references/phase-checklist.md`. Continue only inside the user's approved scope. A prior approval does not cover new destructive, credential, global configuration, production, dependency, or security-policy changes.

## Working rules

- Inspect the installed tool and its supported interface before integrating it. Distinguish Codex CLI JSONL, Codex App GUI, and app-server. Do not infer one source's events from another.
- Keep Claude and Codex independent. Keep Ponytail a shared QA capability, not an agent or assumed daemon.
- Reuse the existing server, normalized event model, SSE, frontend, and Three.js worker architecture. Read `references/architecture-requirements.md` before changing application code.
- Make one small phase-sized change at a time. After each phase, run focused checks, report changed files and actual results, and update `.codex-workflow/STATE.md` with evidence and the next action.
- Never mark work complete from static inspection alone when the phase requires runtime evidence. Do not call `turn.completed` or exit code 0 proof that a requested operation succeeded.
- Never modify application code when the request is only to inspect, plan, report, or manage this skill/checkpoint.
- Ask before any boundary listed in `references/safety-policy.md`. If blocked, do safe independent investigation, record the exact blocker, and do not claim completion.
- Use `scripts/verify-git-state.ps1` for a read-only preflight. Use `scripts/run-baseline.ps1` only when the user requests baseline/regression checks or an approved phase requires them. `scripts/inspect-repository.ps1` is read-only.

## Phase state

Phases: 0 repository inspection; 1 architecture investigation; 2A Codex event source verification; 2B Codex agent integration; 2C Ponytail invocation feasibility; 2D shared QA pipeline; 2E 3D Office integration; 3 testing/regression; 4 final verification.

For each phase record objective, prerequisites, verification criteria, completed work, remaining work, evidence, blockers, and approval requirements. Phase order and evidence rules are in `references/phase-checklist.md`.

## Checkpoint updates

Update `.codex-workflow/STATE.md` after each verified phase and meaningful milestone. Preserve unrelated content if the file already exists: inspect and edit only the workflow section, or ask if ownership is unclear. Record actual commands, exit codes, skipped checks, changed files, unresolved issues, and temporary resources. Never put secrets, tokens, environment dumps, or authentication data in the checkpoint.

## Reporting

Give a concise progress report with current phase, verified evidence, changed files, checks/results, blockers/risks, and next safe action. If the user asks to continue, continue through approved phases whose prerequisites are satisfied; stop at explicit approval gates and report why.
