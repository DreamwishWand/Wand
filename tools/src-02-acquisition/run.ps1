param(
    [Parameter(Mandatory=$true)][ValidateSet('inspect','extract')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$InputRoot,
    [Parameter(Mandatory=$true)][string]$OutputRoot,
    [string]$Rules = '',
    [string]$Catalog = '',
    [int]$Limit = 0,
    [switch]$Fresh
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'acquisition.py'
$arguments = @($script, $Mode, '--input', $InputRoot, '--out', $OutputRoot, '--limit', "$Limit")
if ($Mode -eq 'extract') {
    if (-not $Rules) { $Rules = Join-Path $PSScriptRoot 'rules.example.json' }
    $arguments += @('--rules', $Rules)
    if ($Catalog) { $arguments += @('--catalog', $Catalog) }
    if ($Fresh) { $arguments += '--fresh' }
}
& py -3 @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }