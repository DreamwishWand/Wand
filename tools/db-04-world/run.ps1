<#
DB-04 WORLD: one-shot read-only Steam original-game extraction and private ZIP.
Run on Windows only when a complete native Steam game folder is available.
All output stays outside the Git repository. This never edits game files or saves.
#>
[CmdletBinding()]
param(
    [string]$GameRoot = "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley",
    [string]$OutputRoot = "$env:USERPROFILE\Documents\DreamwishWand\DB04",
    [string]$PreviousSnapshot = "",
    [string]$Il2CppDumpPath = "",
    [string]$Il2CppDumpGameVersion = ""
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

# Validate optional native evidence arguments before any extraction or
# snapshot move. A requested RVA capture must never silently fall back to
# metadata-only output, or leave a misleading completed snapshot on error.
if ($Il2CppDumpPath -and -not $Il2CppDumpGameVersion) {
    throw "A provided IL2CPP dump.cs requires -Il2CppDumpGameVersion"
}
if (-not $Il2CppDumpPath -and $Il2CppDumpGameVersion) {
    throw "-Il2CppDumpGameVersion requires -Il2CppDumpPath"
}
$dumpFile = ""
$gameAssembly = Join-Path $GameRoot "GameAssembly.dll"
if ($Il2CppDumpPath) {
    $dumpFile = [System.IO.Path]::GetFullPath($Il2CppDumpPath)
    if (-not (Test-Path -LiteralPath $dumpFile -PathType Leaf)) {
        throw "Original version-matched IL2CPP dump.cs does not exist"
    }
    # Validate the claimed dump version against the game's actual version
    # before extracting any DB-04 snapshot or creating its output directory.
    $gameVersionText = Get-Content -LiteralPath (Join-Path $GameRoot "FullVersion.txt") -Raw -Encoding UTF8
    $actualVersion = [regex]::Match(
        $gameVersionText, '(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+)(?![0-9.])'
    )
    if (-not $actualVersion.Success -or
        $actualVersion.Groups[1].Value -cne $Il2CppDumpGameVersion) {
        throw "IL2CPP dump version differs from original Steam game version"
    }
    if (-not (Test-Path -LiteralPath $gameAssembly -PathType Leaf)) {
        throw "Requested native RVA capture requires GameAssembly.dll"
    }
    # A matching version string alone cannot guarantee matching native RVAs.
    # Reject a dump that maps into the interiors of other PE unwind functions
    # before creating any private snapshot output or running game extraction.
    Write-Host "DB-04: checking original GameAssembly PE64 unwind function starts"
    & $python @pythonPrefix (Join-Path $PSScriptRoot "pe_unwind.py") @(
        "--game-root", $GameRoot,
        "--dump-cs", $dumpFile,
        "--dump-game-version", $Il2CppDumpGameVersion
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Original IL2CPP method RVAs cannot be corroborated against PE unwind starts"
    }
}
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

# Capture native PE64 metadata and, only with a caller-supplied version-matched
# IL2CPP dump.cs, bounded private GridData method byte windows. Never infer a
# 1.26.2 method RVA from 1.26.1. This does not disassemble native code.
if (Test-Path -LiteralPath $gameAssembly -PathType Leaf) {
    $nativeArgs = @(
        (Join-Path $tools "native_pe_evidence.py"),
        "--game-root", $GameRoot,
        "--out", (Join-Path $ready "native-pe-evidence.json")
    )
    if ($Il2CppDumpPath) {
        $nativeArgs += @("--dump-cs", $dumpFile,
                         "--dump-game-version", $Il2CppDumpGameVersion)
    }
    Write-Host "DB-04: privately pinning native PE64 GameAssembly evidence"
    Run-Python -Arguments $nativeArgs

    # When the matching IL2CPP dump is already supplied and the optional,
    # version-pinned disassembler is installed, decode the captured ORIGINAL
    # byte windows automatically. Missing Capstone does not block game-data
    # extraction or claim that disassembly was performed.
    if ($Il2CppDumpPath) {
        $capstoneCheck = & $python @pythonPrefix -c "import importlib.util, importlib.metadata; print(int(importlib.util.find_spec('capstone') is not None and importlib.metadata.version('capstone') == '5.0.9'))"
        if ($LASTEXITCODE -ne 0) {
            throw "Could not inspect optional Capstone disassembler availability"
        }
        if (($capstoneCheck | Out-String).Trim() -eq "1") {
            Write-Host "DB-04: privately decoding native x86-64 method windows (no semantic claims)"
            Run-Python -Arguments @((Join-Path $tools "disassemble_native_pe.py"),
                                     "--snapshot", $ready)
        }
        else {
            Write-Host "DB-04: optional Capstone 5.0.9 unavailable; native instruction decoding skipped"
        }
    }
}
else {
    Write-Host "DB-04: native PE metadata not collected (GameAssembly.dll absent)"
}
Write-Host "DB-04: packaging verified partial snapshot (no full binaries or player saves)"
Run-Python -Arguments @((Join-Path $tools "package_snapshot.py"),
                         "--snapshot", $ready,
                         "--zip", $zip)

Write-Host ""
Write-Host ("DB-04 snapshot: " + $ready)
Write-Host ("DB-04 private ZIP: " + $zip)
Write-Host "Keep private. Transfer the ZIP to SRC-05 WORLD DATA; do not commit it to Git."
