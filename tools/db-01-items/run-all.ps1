# One-shot private Steam v1.26.2 extraction -> eight locales -> DB-01 catalog.
# No upload, repository mutation, or game-file writes. Requires Python 3.10+.
[CmdletBinding()]
param(
    [string]$Game = 'C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley',
    [Parameter(Mandatory = $true)][string]$Probe,
    [string]$Out = (Join-Path $env:LOCALAPPDATA 'DreamwishWand\DB-01\steam-1.26.2'),
    [switch]$ForceCatalog
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
$gameRoot = Existing-Path $Game
$probePath = Existing-Path $Probe
$referenceRoot = Existing-Path (Join-Path $repo 'static\ddv\collection\v1.25')
$outRoot = [System.IO.Path]::GetFullPath($Out)

if (-not (Test-Path -LiteralPath $gameRoot -PathType Container)) { throw 'GAME_ROOT_NOT_DIRECTORY' }
if (-not (Test-Path -LiteralPath $probePath -PathType Leaf)) { throw 'PROBE_NOT_FILE' }
if ((Inside-Or-Same $outRoot $repo) -or (Inside-Or-Same $repo $outRoot) -or
    (Inside-Or-Same $outRoot $gameRoot) -or (Inside-Or-Same $gameRoot $outRoot) -or
    (Inside-Or-Same $probePath $outRoot) -or
    (Inside-Or-Same $outRoot (Split-Path -Parent $probePath))) {
    throw 'PRIVATE_OUTPUT_OVERLAPS_REPOSITORY_GAME_OR_PROBE'
}
$script:PythonLauncher = Get-Command py -ErrorAction Stop

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

# Final runtime artifacts: SQLite is the operational owner-private query store.
# Both filenames incorporate source JSONL SHA to support versioned immutable outputs.
$fingerprint = $manifest.outputSha256.'items.jsonl'.Substring(0, 12)
$sqliteTarget = Join-Path $outRoot ("db01-$fingerprint.sqlite")
$shardsTarget = Join-Path $outRoot ("db01-$fingerprint-shards")
$sqliteScript = Join-Path $repo 'tools\db-01-items\sqlite_store.py'
$shardsScript = Join-Path $repo 'tools\db-01-items\export_shards.py'
if (-not (Test-Path -LiteralPath $sqliteTarget)) {
    Invoke-PythonChecked $sqliteScript @('--catalog', $catalog, '--out', $sqliteTarget)
}
if (-not (Test-Path -LiteralPath $shardsTarget)) {
    Invoke-PythonChecked $shardsScript @('--sqlite', $sqliteTarget, '--out', $shardsTarget)
}
Write-Host ('Private SQLite: ' + $sqliteTarget)
Write-Host ('Private TypeScript read shards: ' + $shardsTarget)
Write-Host 'Only trusted local clients may access these files. They are not public site assets.'