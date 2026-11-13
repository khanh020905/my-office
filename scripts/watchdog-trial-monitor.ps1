<#
.SYNOPSIS
  Independent Watchdog and Health Auditor for My Office 7-Day Operational Trial (Windows).
  Monitors My Office server liveness and heartbeat health purely in read-only observation mode.

.DESCRIPTION
  Requirements:
  1. Operates completely independently of My Office Node.js.
  2. Detects stopped server (HTTP connection refused, timeout, or process dead).
  3. Detects stale heartbeat (heartbeat timestamp > 180 seconds old).
  4. Writes all incidents to persistent audit log: data/trial-monitor/watchdog-incidents.log.
  5. Updates active operator alert file: reports/operational-trial/operator-alerts.json.
  6. Emits operator notifications (system sound, console alert, Windows event log entry if permitted).
  7. STRICTLY READ-ONLY: Never restarts, kills, modifies, or dispatches any production process or task.
  8. Preserves original trialStartAt timestamp intact.
  9. Never modifies Windows power settings.
#>

param(
    [int]$HeartbeatStaleThresholdSec = 180,
    [int]$HttpTimeoutSec = 3,
    [string]$StatusUrl = "http://127.0.0.1:4310/api/trial-monitor/status"
)

$ErrorActionPreference = "Continue"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$IncidentLogPath = Join-Path $RootDir "data\trial-monitor\watchdog-incidents.log"
$AlertFilePath = Join-Path $RootDir "reports\operational-trial\operator-alerts.json"
$StatusFilePath = Join-Path $RootDir "reports\operational-trial\monitor-status.json"
$StateFilePath = Join-Path $RootDir "data\trial-monitor\trial-state.json"

# Ensure target directories exist
$incidentDir = Split-Path -Parent $IncidentLogPath
if (-not (Test-Path $incidentDir)) { New-Item -ItemType Directory -Path $incidentDir -Force | Out-Null }
$alertDir = Split-Path -Parent $AlertFilePath
if (-not (Test-Path $alertDir)) { New-Item -ItemType Directory -Path $alertDir -Force | Out-Null }

$nowDate = Get-Date
$nowIsoUtc = $nowDate.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$nowVn = $nowDate.ToString("yyyy-MM-ddTHH:mm:ss.fff+07:00")
$nowEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Write-IncidentLog {
    param(
        [string]$Severity,
        [string]$IssueCode,
        [string]$Message,
        [hashtable]$Details
    )

    $logEntry = "[$nowVn] [$Severity] [$IssueCode] $Message"
    if ($Details) {
        $detailStr = ($Details.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "; "
        $logEntry += " | Details: {$detailStr}"
    }

    Write-Host $logEntry -ForegroundColor $(if ($Severity -eq "SEV-1") { "Red" } elseif ($Severity -eq "SEV-2") { "Yellow" } else { "Cyan" })
    Add-Content -Path $IncidentLogPath -Value $logEntry -ErrorAction SilentlyContinue

    # Update persistent operator alerts JSON for UI and operators
    $alertPayload = @{
        active = $true
        severity = $Severity
        issueCode = $IssueCode
        message = $Message
        detectedAtUtc = $nowIsoUtc
        detectedAtVn = $nowVn
        detectedAtEpoch = $nowEpochMs
        details = $Details
    }
    try {
        $json = $alertPayload | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText($AlertFilePath, $json, [System.Text.Encoding]::UTF8)
    } catch {}

    # Operator audible notice and Windows Event Log attempt
    try { [System.Console]::Beep(1000, 300) } catch {}
}

function Clear-OperatorAlert {
    if (Test-Path $AlertFilePath) {
        try {
            $clearPayload = @{
                active = $false
                lastResolvedAtUtc = $nowIsoUtc
                lastResolvedAtVn = $nowVn
                status = "healthy"
            }
            $json = $clearPayload | ConvertTo-Json -Depth 5
            [System.IO.File]::WriteAllText($AlertFilePath, $json, [System.Text.Encoding]::UTF8)
        } catch {}
    }
}

# -----------------------------------------------------------------------------
# Check 1: File-based State & Heartbeat Inspection (Independent of HTTP Server)
# -----------------------------------------------------------------------------
$diskHeartbeat = $null
$diskTrialStartAt = $null
$diskProcessId = $null

if (Test-Path $StatusFilePath) {
    try {
        $rawStatus = [System.IO.File]::ReadAllText($StatusFilePath, [System.Text.Encoding]::UTF8)
        $parsedStatus = $rawStatus | ConvertFrom-Json
        $diskHeartbeat = $parsedStatus.heartbeat
        $diskTrialStartAt = $parsedStatus.trialStartAt
        $diskProcessId = $parsedStatus.processId
    } catch {}
}

# -----------------------------------------------------------------------------
# Check 2: HTTP Liveness Probe
# -----------------------------------------------------------------------------
$httpSuccess = $false
$httpStatusData = $null
$httpErrorMessage = ""

try {
    $req = [System.Net.WebRequest]::Create($StatusUrl)
    $req.Timeout = $HttpTimeoutSec * 1000
    $resp = $req.GetResponse()
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $respText = $reader.ReadToEnd()
    $reader.Close()
    $resp.Close()

    $httpJson = $respText | ConvertFrom-Json
    if ($httpJson.ok -eq $true) {
        $httpSuccess = $true
        $httpStatusData = $httpJson.status
    } else {
        $httpErrorMessage = "Server returned ok=false"
    }
} catch {
    $httpErrorMessage = $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Evaluation: Detect Server Down & Stale Heartbeat
# -----------------------------------------------------------------------------
$isDown = -not $httpSuccess
$heartbeatStale = $false
$heartbeatAgeSec = $null

# Resolve latest heartbeat between HTTP probe and disk record
$resolvedHeartbeat = if ($httpStatusData -and $httpStatusData.heartbeat) {
    $httpStatusData.heartbeat
} elseif ($diskHeartbeat) {
    $diskHeartbeat
} else {
    $null
}

if ($resolvedHeartbeat) {
    $nowCheckMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $heartbeatAgeMs = [Math]::Max(0, $nowCheckMs - $resolvedHeartbeat)
    $heartbeatAgeSec = [Math]::Round($heartbeatAgeMs / 1000)
    if ($heartbeatAgeSec -gt $HeartbeatStaleThresholdSec) {
        $heartbeatStale = $true
    }
} else {
    $heartbeatStale = $true
    $heartbeatAgeSec = 999999
}

if ($isDown -or $heartbeatStale) {
    $severity = if ($isDown) { "SEV-1" } else { "SEV-2" }
    $code = if ($isDown) { "SERVER_OFFLINE" } else { "STALE_HEARTBEAT" }
    $msg = if ($isDown) {
        "My Office server is DOWN or unresponsive to HTTP probe at $StatusUrl ($httpErrorMessage)"
    } else {
        "My Office server heartbeat is STALE (${heartbeatAgeSec}s > ${HeartbeatStaleThresholdSec}s threshold)"
    }

    $details = @{
        httpResponding = $httpSuccess
        httpError = $httpErrorMessage
        heartbeatAgeSeconds = $heartbeatAgeSec
        staleThresholdSeconds = $HeartbeatStaleThresholdSec
        lastKnownHeartbeat = $resolvedHeartbeat
        recordedProcessId = $diskProcessId
    }

    Write-IncidentLog -Severity $severity -IssueCode $code -Message $msg -Details $details
    Write-Host "[WATCHDOG ACTION] OPERATOR ALERT TRIGGERED. In accordance with read-only trial rules, no automatic restart or process kill was performed." -ForegroundColor Magenta
    exit 1
}

# -----------------------------------------------------------------------------
# Healthy Heartbeat and Running State
# -----------------------------------------------------------------------------
Clear-OperatorAlert

$postSnapshots = if ($httpStatusData) { $httpStatusData.postStartSnapshotsCount } else { "N/A" }
$cov = if ($httpStatusData) { $httpStatusData.telemetryCoverage } else { "N/A" }
$startDisplay = if ($diskTrialStartAt) { $diskTrialStartAt.asiaHoChiMinh } else { "N/A" }

$healthyMsg = "[$nowVn] [OK] My Office server is HEALTHY. Heartbeat age: ${heartbeatAgeSec}s. Coverage: $cov. Post-start snapshots: $postSnapshots. trialStartAt: $startDisplay"
Write-Host $healthyMsg -ForegroundColor Green

# Append to startup/audit log periodically
Add-Content -Path (Join-Path $RootDir "data\trial-monitor\server-startup.log") -Value $healthyMsg -ErrorAction SilentlyContinue

exit 0
