param(
  [Parameter(Mandatory = $true)]
  [string]$Repository,
  [ValidateSet('test', 'lint', 'typecheck', 'build', 'test:e2e', 'test:e2e:smoke')]
  [string[]]$Checks = @('test', 'lint', 'typecheck', 'build')
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $Repository).Path
$pkgPath = Join-Path $repo 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath -PathType Leaf)) { throw "package.json not found: $pkgPath" }
$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$failed = 0
foreach ($check in $Checks) {
  if (-not $pkg.scripts.PSObject.Properties.Name.Contains($check)) {
    Write-Output "SKIP npm run $check (script not defined)"
    continue
  }
  $command = "npm run $check"
  Write-Output "RUN $command"
  & npm run $check
  $code = $LASTEXITCODE
  Write-Output "EXIT $code :: $command"
  if ($code -ne 0) { $failed++ }
}
if ($failed) { exit 1 }
exit 0
