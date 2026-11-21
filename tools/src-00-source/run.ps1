param(
    [Parameter(Mandatory = $true)][string]$GameRoot,
    [Parameter(Mandatory = $true)][string]$Out,
    [ValidateSet('auto','steam','switch')][string]$Platform = 'auto',
    [string]$Version,
    [switch]$Rehash
)

$ErrorActionPreference = 'Stop'
$scan = Join-Path $PSScriptRoot 'source_scan.py'
$launcher = Get-Command py -ErrorAction SilentlyContinue
if ($launcher) {
    $command = 'py'
    $parameters = @('-3', $scan, '--root', $GameRoot, '--out', $Out, '--platform', $Platform)
} else {
    $launcher = Get-Command python -ErrorAction SilentlyContinue
    if (-not $launcher) {
        throw 'Python 3 is required. Install Python and retry.'
    }
    $command = 'python'
    $parameters = @($scan, '--root', $GameRoot, '--out', $Out, '--platform', $Platform)
}
if ($Version) {
    $parameters += @('--version', $Version)
}
if ($Rehash) {
    $parameters += '--rehash'
}
& $command @parameters
exit $LASTEXITCODE
