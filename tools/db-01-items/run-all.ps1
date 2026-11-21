# Private DB-01 runner. Default Catalog mode is version-independent.
# LegacySteam1262 mode preserves the pinned historical raw Steam 1.26.2 extractor.
# No upload, repository mutation, or game-file writes. Requires Python 3.10+.
[CmdletBinding(DefaultParameterSetName='Catalog')]
param(
    [Parameter(ParameterSetName='LegacySteam1262')]
    [string]$Game = 'C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley',
    [Parameter(ParameterSetName='LegacySteam1262', Mandatory=$true)][string]$Probe,
    [Parameter(ParameterSetName='LegacySteam1262')][switch]$ForceCatalog,
    [Parameter(ParameterSetName='Catalog', Mandatory=$true)][string]$Catalog,
    [Parameter(ParameterSetName='Catalog')][string]$History,
    [Parameter(ParameterSetName='Catalog')][string]$ExpectedVersion,
    [string]$Out = (Join-Path $env:LOCALAPPDATA 'DreamwishWand\DB-01')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:PYTHONDONTWRITEBYTECODE = '1'

function Existing-Path([string]$Path) {
    return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
}
function Inside-Or-Same([string]$Child, [string]$Parent) {
    $root = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\','/')
    $path = [System.IO.Path]::GetFullPath($Child).TrimEnd('\','/')
    $comparison = [System.StringComparison]::OrdinalIgnoreCase
    return ($path.Equals($root, $comparison) -or
        $path.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, $comparison))
}
function Invoke-PythonChecked([string]$Script, [string[]]$Arguments) {
    Write-Host ("DB-01 running: " + [System.IO.Path]::GetFileName($Script))
    & $script:PythonLauncher.Source -3 $Script @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "DB01_PIPELINE_STEP_FAILED:$([System.IO.Path]::GetFileName($Script)):$LASTEXITCODE"
    }
}

$repo = Existing-Path (Join-Path $PSScriptRoot '..\..')
$outRoot = [System.IO.Path]::GetFullPath($Out)
$script:PythonLauncher = Get-Command py -ErrorAction Stop
$releaseScript = Join-Path $repo 'tools\db-01-items\release_pipeline.py'
if ((Inside-Or-Same $outRoot $repo) -or (Inside-Or-Same $repo $outRoot)) {
    throw 'PRIVATE_OUTPUT_OVERLAPS_REPOSITORY'
}

if ($PSCmdlet.ParameterSetName -eq 'Catalog') {
    $catalogRoot = Existing-Path $Catalog
    if (-not (Test-Path -LiteralPath $catalogRoot -PathType Container)) {
        throw 'CATALOG_NOT_DIRECTORY'
    }
    if ((Inside-Or-Same $outRoot $catalogRoot) -or
        (Inside-Or-Same $catalogRoot $outRoot)) {
        throw 'PRIVATE_OUTPUT_OVERLAPS_CATALOG'
    }
    $arguments = @('--catalog', $catalogRoot, '--out', $outRoot)
    if ($History) {
        $historyRoot = Existing-Path $History
        if ((Inside-Or-Same $outRoot $historyRoot) -or
            (Inside-Or-Same $historyRoot $outRoot)) {
            throw 'PRIVATE_OUTPUT_OVERLAPS_HISTORY'
        }
        $arguments += @('--history', $historyRoot)
    }
    if ($ExpectedVersion) { $arguments += @('--expected-version', $ExpectedVersion) }
    Invoke-PythonChecked $releaseScript $arguments
    return
}

# Historical source-specific decoding: never silently retarget these SHA-pinned
# 1.26.2 scripts to an unverified game version. The generic release below is
# shared with Catalog mode, and future extractors supply verified catalogs.
$gameRoot = Existing-Path $Game
$probePath = Existing-Path $Probe
$referenceRoot = Existing-Path (Join-Path $repo 'static\ddv\collection\v1.25')

if (-not (Test-Path -LiteralPath $gameRoot -PathType Container)) { throw 'GAME_ROOT_NOT_DIRECTORY' }
if (-not (Test-Path -LiteralPath $probePath -PathType Leaf)) { throw 'PROBE_NOT_FILE' }
if ((Inside-Or-Same $outRoot $repo) -or (Inside-Or-Same $repo $outRoot) -or
    (Inside-Or-Same $outRoot $gameRoot) -or (Inside-Or-Same $gameRoot $outRoot) -or
    (Inside-Or-Same $probePath $outRoot) -or
    (Inside-Or-Same $outRoot (Split-Path -Parent $probePath))) {
    throw 'PRIVATE_OUTPUT_OVERLAPS_REPOSITORY_GAME_OR_PROBE'
}
$native = Join-Path $outRoot 'native'
$extended = Join-Path $outRoot 'extended'
$catalog = Join-Path $outRoot 'catalog'
New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
$steamScript = Join-Path $repo 'tools\src-01-items\steam1262.py'
$localeScript = Join-Path $repo 'tools\src-01-items\localize1262.py'
$extendedScript = Join-Path $repo 'tools\src-01-items\extend1262.py'
$catalogScript = Join-Path $repo 'tools\db-01-items\build.py'

# All three native decoders independently verify Steam v1.26.2 file hashes.
# A failed gate stops the pipeline before any later stage runs.
Invoke-PythonChecked $steamScript @('--game', $gameRoot, '--out', $native)
Invoke-PythonChecked $localeScript @('--game', $gameRoot, '--source', $native, '--out', $native)
Invoke-PythonChecked $extendedScript @('--game', $gameRoot, '--probe', $probePath, '--out', $extended)
$arguments = @('--source', $native, '--reference', $referenceRoot, '--extended', $extended, '--out', $catalog)
if ($ForceCatalog) { $arguments += '--force' }
Invoke-PythonChecked $catalogScript $arguments

$manifestPath = Join-Path $catalog 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'MISSING_FINAL_DB01_MANIFEST' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schema -ne 'wand.db01.items@1' -or $manifest.gameVersion -ne '1.26.2' -or
    $manifest.publicationStatus -ne 'private_not_approved_for_public_catalog') {
    throw 'FINAL_DB01_MANIFEST_NOT_PRIVATE_OR_VERSION_MISMATCH'
}
Write-Host ('DB-01 complete: ' + $manifest.counts.currentDefinitions + ' verified native definitions')
Write-Host ('Private output: ' + $catalog)
Write-Host 'Publication: NOT AUTHORIZED. No files were uploaded or committed.'

# Release stage is shared with arbitrary future versioned verified catalogs.
# Neither this mode nor the generic mode treats missing Drive uploads as missing
# from the installed game. The current historical extractor remains 1.26.2-pinned.
Invoke-PythonChecked $releaseScript @('--catalog', $catalog, '--out', $outRoot, '--expected-version', '1.26.2')
Write-Host 'Only trusted local clients may access private generated files.'
