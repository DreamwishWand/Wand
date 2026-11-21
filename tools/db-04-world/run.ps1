<#
DB-04 WORLD: one-shot read-only Steam original-game extraction and private ZIP.
Run on Windows only when a complete native Steam game folder is available.
All output stays outside the Git repository. This never edits game files or saves.
#>
[CmdletBinding()]
param(
    [string]$GameRoot = "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley",
    [string]$OutputRoot = "$env:USERPROFILE\Documents\DreamwishWand\DB04",
    [string]$PreviousSnapshot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GameRoot = [System.IO.Path]::GetFullPath($GameRoot)
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if (-not (Test-Path -LiteralPath $GameRoot -PathType Container)) {
    throw "Original Steam game folder not found: $GameRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $GameRoot "FullVersion.txt") -PathType Leaf)) {
    throw "FullVersion.txt missing from original Steam game folder"
}

$launcher = Get-Command py -ErrorAction SilentlyContinue
$pythonPrefix = @()
if ($null -ne $launcher) {
    $pythonPrefix = @("-3")
}
else {
    $launcher = Get-Command python -ErrorAction Stop
}
$python = $launcher.Source
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$partial = Join-Path $OutputRoot (".partial-Steam-" + $stamp)
$ready = Join-Path $OutputRoot ("Steam-" + $stamp)
$zip = "$ready.zip"
if ((Test-Path -LiteralPath $partial) -or
    (Test-Path -LiteralPath $ready) -or
    (Test-Path -LiteralPath $zip)) {
    throw "DB-04 output target already exists; never overwrite a native snapshot"
}
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null

function Run-Python {
    param([string[]]$Arguments)
    & $python @pythonPrefix @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ("DB-04 Python command failed: exit code " + $LASTEXITCODE)
    }
}

$tools = $PSScriptRoot
$extractArgs = @(
    (Join-Path $tools "world.py"),
    "--game", $GameRoot,
    "--out", $partial
)
if ($PreviousSnapshot) {
    $resolvedPrevious = [System.IO.Path]::GetFullPath($PreviousSnapshot)
    if (-not (Test-Path -LiteralPath $resolvedPrevious -PathType Container)) {
        throw "Previous private snapshot not found: $resolvedPrevious"
    }
    $extractArgs += @("--previous", $resolvedPrevious)
}

Write-Host "DB-04: extracting original-game source into private staging path"
Run-Python -Arguments $extractArgs
Write-Host "DB-04: verifying staging snapshot hashes and native references"
Run-Python -Arguments @((Join-Path $tools "verify_bundle.py"),
                         "--snapshot", $partial)

# Only completed and verified results receive a stable private snapshot path.
Move-Item -LiteralPath $partial -Destination $ready -ErrorAction Stop
Write-Host "DB-04: packaging verified partial snapshot (no binaries or player saves)"
Run-Python -Arguments @((Join-Path $tools "package_snapshot.py"),
                         "--snapshot", $ready,
                         "--zip", $zip)

Write-Host ""
Write-Host ("DB-04 snapshot: " + $ready)
Write-Host ("DB-04 private ZIP: " + $zip)
Write-Host "Keep private. Transfer the ZIP to SRC-05 WORLD DATA; do not commit it to Git."
