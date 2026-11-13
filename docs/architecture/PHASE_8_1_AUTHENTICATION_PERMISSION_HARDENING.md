# Phase 8.1 — Secure Claude Authentication & Execution Permission Hardening Report

**Date**: 2026-11-12  
**Project**: My Office (`D:\somehting code\my-office`)  
**Scope**: Root cause analysis of Claude authentication failure; secure OAuth credential resolution; strict read-only execution profile preserving `--tools Read,Glob,Grep` and `--disallowed-tools Bash,Edit,Write,NotebookEdit,mcp__*`; cryptographic plan hash and approval binding; cross-agent credential isolation regression verification; real host test evidence.

---

## 1. Investigation & Root Cause of Authentication Failure

### 1.1 Root Cause #1: CLI `--bare` Flag Incompatibility with OAuth Credentials
In Phase 8, the execution profile included the `--bare` option.
According to the official Claude Code documentation:
> `--bare: Minimal mode ... Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read). Sets CLAUDE_CODE_SIMPLE=1.`

The user authenticates Claude Code via official OAuth login (`claude /login`), whose session token is securely stored at `~/.claude/.credentials.json` with account metadata in `~/.claude.json`. Because `--bare` explicitly blocks reading OAuth credentials and keychain, Claude Code refused to read `~/.claude/.credentials.json` and demanded an `ANTHROPIC_API_KEY`. When no API key was found in the sanitized environment, Claude Code printed:
`"Not logged in · Please run /login"` and exited with code 1.

### 1.2 Root Cause #2: Commander.js Variadic Argument Parsing for `--disallowed-tools`
The Claude Code CLI defines:
```text
--disallowedTools, --disallowed-tools <tools...>
```
In Commander.js, `<tools...>` is a variadic argument that consumes all subsequent tokens until option flags or the standard `--` option terminator. When the prompt string (`"Report the version..."`) was passed immediately after `--disallowed-tools`, Commander treated the prompt text as part of the list of disallowed tools, producing:
`Permission deny rule "Report" matches no known tool` and `Error: Input must be provided either through stdin or as a prompt argument when using --print`.

---

## 2. Secure Authentication Architecture & Solution

### 2.1 Native Credential Resolution Without Secret Leakage
Rather than passing raw API keys or tokens in process environment variables, arguments, or logs, Phase 8.1 adopts the safest compatible approach:
1. **OAuth File Resolution**: Removed `--bare` from the execution profile. Claude Code natively and securely accesses the existing host credential store (`~/.claude/.credentials.json`) without any credential handling or caching by My Office.
2. **Environment Sanitization Retention**: `sanitizeEnvironment()` in `server/tools/execution-runner.mjs` continues to strictly strip all:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `CODEX_*` tokens
   - `CLAUDE_*` tokens
   - `OFFICE_SECRET_*`, `MY_OFFICE_KEY`, `ADMIN_TOKEN`, `JWT_SECRET`
   - Passwords and auth tokens
3. **System User Directory Forwarding**: Added standard Windows system user variables (`APPDATA`, `LOCALAPPDATA`, `HOME`, `USERNAME`) to `allowedSystemKeys`. These variables contain no secrets, but allow Windows Node runtime to resolve `os.homedir()` to `C:\Users\LENOVO` and find `~/.claude/.credentials.json`.
4. **POSIX Double Dash Option Delimiter**: Added `--` before the prompt string in command assembly:
   ```javascript
   args = [
     '/c',
     binaryPath,
     '--print',
     '--restricted',
     '--strict-mcp-config',
     '--permission-mode', 'dontAsk',
     '--permission-prompts', 'none',
     '--tools', 'Read,Glob,Grep',
     '--disallowed-tools', 'Bash,Edit,Write,NotebookEdit,mcp__*',
     '--',
     promptText,
   ];
   ```
   This prevents Commander.js from consuming the prompt into `--disallowed-tools`.

---

## 3. Permission Scope Hardening & Policy Binding

### 3.1 Separation of `agent:invoke` from `runtime:spawn`
- `agent:invoke` authorizes My Office to spawn the approved host agent executable (`claude.cmd`).
- It does **not** grant the agent permission to spawn arbitrary child processes.
- The execution profile explicitly restricts the agent tools:
  - Allowed: `Read, Glob, Grep`
  - Disallowed: `Bash, Edit, Write, NotebookEdit, mcp__*`
  Any attempt by the agent to run Bash or invoke subagents is blocked at the CLI runtime level.

### 3.2 Pre-flight Approval & Cryptographic Plan Hash Binding
In `server/orchestration/native-agent-executor.mjs`, the following checks are enforced before any process is spawned:
1. **Workspace Boundary**: Confirms `cwd` exists on disk and is confined to the authorized workspace.
2. **Human Approval Verification**:
   - If `approval.required === true` and `!approval.approved`, fails closed with status `UNAPPROVED`.
   - If `approval.revoked === true`, fails closed with status `APPROVAL_REVOKED`.
   - If `approval.expires_at < now`, fails closed with status `APPROVAL_EXPIRED`.
   - If `approval.bound_plan_hash !== plan_hash`, fails closed with status `PLAN_HASH_MISMATCH`.
3. **Security Policy Gate**: Evaluates `agent:invoke` and `fs:read` against `SecurityPolicyEngine`. If no active grant exists or policy denies, fails closed with `REQUIRES_APPROVAL` or `BLOCKED_BY_POLICY`.

### 3.3 Permission Policy Matrix

| Policy Dimension | Before Phase 8.1 | After Phase 8.1 |
| :--- | :--- | :--- |
| **Agent Invocation (`agent:invoke`)** | Evaluated on `status === 'DENY'` only | Fails closed on any `!decision.allowed` (including `REQUIRES_APPROVAL`) |
| **Subprocess Execution (`runtime:spawn`)** | Implicitly bundled | Strictly separated; `Bash` blocked via `--disallowed-tools` |
| **Human Approval Expiration** | Evaluated only at plan level | Re-verified inside executor before process launch |
| **Plan Hash Integrity** | Evaluated at orchestrator start | Re-verified cryptographically at step execution |
| **OAuth Credential Access** | Blocked by `--bare` | Allowed via official `~/.claude/.credentials.json` |
| **Prompt Delivery** | Broken by variadic argument parser | Isolated via `--` delimiter |

---

## 4. Real Host Integration Test Evidence

### 4.1 Unauthorized Invocation Gate Check (Fail-Closed)
When executed without an explicit permission grant:
```json
{
  "ok": false,
  "pid": null,
  "exit_code": -1,
  "duration_ms": 0,
  "status": "REQUIRES_APPROVAL",
  "stdout": "",
  "stderr": "Security policy engine denied agent invocation: Missing required permission grant for scope(s): agent:invoke, fs:read on agent 'claude-code'"
}
```
*Verification*: Zero processes were spawned; security gate cleanly held.

### 4.2 Authorized Host Execution with Real Claude Code Binary
Executed with explicit task approval and active `PermissionRegistry` grant for `claude-code`:
- **Executable**: `C:\Users\LENOVO\AppData\Roaming\npm\claude.cmd`
- **CLI Arguments**:
  ```powershell
  cmd.exe /c C:\Users\LENOVO\AppData\Roaming\npm\claude.cmd --print --restricted --strict-mcp-config --permission-mode dontAsk --permission-prompts none --tools Read,Glob,Grep --disallowed-tools Bash,Edit,Write,NotebookEdit,mcp__* -- "Read package.json and report the project name and available npm scripts as JSON. Do not modify any files."
  ```
- **Real Process PID**: `36176`
- **Exit Code**: `1`
- **Duration**: `2352 ms`
- **Status**: `failed` (accurately captured failure; zero simulation)
- **STDOUT Output Received from Anthropic API**:
  ```text
  You've hit your 5-hour limit · resets 7:30pm (Asia/Ho_Chi_Minh)
  ```
- **STDERR**: Empty (`""`)

**Key Findings from Evidence**:
1. **OAuth Authentication Succeeded**: Claude Code successfully resolved the user's OAuth account credentials and connected to Anthropic's authentication server.
2. **Anthropic Quota Recognition**: Anthropic's API verified the account and returned the current user rate limit (`5-hour limit resets 7:30pm`).
3. **Fail-Closed Integrity**: The executor recorded `ok: false`, exit code `1`, and status `'failed'`. It did **not** fake a successful result or mask the exit code.
4. **Workspace Unmodified**: `git status` confirmed zero modified, added, or deleted files in `D:\somehting code\my-office`.
5. **No Secret Leaks**: Audit logs and stdout contained zero tokens, passwords, or internal keys.

---

## 5. Regression & Unit Test Verification

The unit test suite was expanded to 14 comprehensive tests in `tests/unit/native-agent-executor.test.mjs`:
1. `executes a real child process using a controlled mock script` -> **PASS**
2. `captures non-zero exit code and reports failure correctly without false COMPLETED status` -> **PASS**
3. `handles process execution timeout and terminates safely` -> **PASS**
4. `blocks agent invocation when SecurityPolicyEngine explicitly denies agent:invoke` -> **PASS**
5. `reports EXECUTABLE_NOT_FOUND when binary does not exist on PATH` -> **PASS**
6. `denies unauthorized agent:invoke when no grant exists` -> **PASS**
7. `denies unauthorized runtime:spawn when requested by an agent or tool` -> **PASS**
8. `rejects execution when task approval is expired` -> **PASS**
9. `rejects execution when plan hash is modified (cryptographic binding mismatch)` -> **PASS**
10. `rejects execution when task approval was revoked` -> **PASS**
11. `enforces strict cross-agent isolation: Claude cannot inherit Codex credentials and vice versa` -> **PASS**
12. `filters internal My Office secrets from child process environment` -> **PASS**
13. `ensures read-only native execution profile disallows file write and execution tools` -> **PASS**
14. `ensures authentication failure or non-zero exit code cannot become COMPLETED` -> **PASS**

### Full Workspace Test Summary
- **Native Executor Tests**: 14/14 PASS
- **Ecosystem Test Suites (`tests/unit/tools-*.test.mjs`)**: 111/111 PASS (12 suites)
- **TypeScript Typecheck (`npm run typecheck`)**: 0 errors
- **Git Status**: 18 commits ahead of origin/main preserved; zero external modifications.

---

## 6. Technical Boundaries & Security Limitations

1. **Anthropic API Quota Boundary**:
   - Claude Code model execution relies on the user's host OAuth session quota. When the user account hits its rate limit, execution fails closed with exit code 1.
2. **Application Authorization vs Host Kernel Sandboxing**:
   - Process sandboxing is enforced at the application and parameter level (`--restricted`, `--tools Read,Glob,Grep`, `--disallowed-tools Bash,Edit,Write,NotebookEdit,mcp__*`, and environment sanitization).
   - Host child processes execute under the host user account; Windows kernel-level containerization (e.g. Windows AppContainer) is not active.
3. **Project Boundaries Preserved**:
   - `D:\somehting code\xuongphim` and `D:\videoaitool` were untouched.
   - Zero external npm packages or external tools were installed.
   - Zero git commits or pushes were made.

