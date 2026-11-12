param(
  [Parameter(Mandatory = $true)]
  [string]$Repository
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $Repository).Path
Write-Output "Repository: $repo"
git -C $repo status --short --branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'Preserve all reported changes; this script is read-only.'
exit 0
