param(
  [Parameter(Mandatory = $true)]
  [string]$Repository
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $Repository).Path
Write-Output "Repository: $repo"
foreach ($name in @('README.md', 'package.json', 'server/index.mjs', 'hooks/hooks.json', 'src/shared/agent-events.js', 'src/office/net/live.js', 'src/office/people/workers.js')) {
  $path = Join-Path $repo $name
  if (Test-Path -LiteralPath $path -PathType Leaf) { Write-Output "FOUND $name" } else { Write-Output "MISSING $name" }
}
Write-Output 'This script inventories known architecture entry points only; inspect source before drawing conclusions.'
exit 0
