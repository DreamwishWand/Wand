param(
    [string]$GameRoot,
    [string]$Save,
    [Parameter(Mandatory=$true)][string]$Out,
    [ValidateSet('switch','steam-windows')][string]$Platform,
    [string]$BuildId
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'scan.py'
$arguments = @($script, '--out', $Out)
if ($GameRoot) { $arguments += @('--game-root', $GameRoot) }
if ($Save) { $arguments += @('--save', $Save) }
if ($Platform) { $arguments += @('--platform', $Platform) }
if ($BuildId) { $arguments += @('--build-id', $BuildId) }
& py -3 @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }