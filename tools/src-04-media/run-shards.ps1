param(
    [Parameter(Mandatory=$true)][string]$SourceDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [Parameter(Mandatory=$true)][string]$Platform,
    [Parameter(Mandatory=$true)][string]$GameVersion,
    [string]$BuildId = "",
    [string]$R39Index = "",
    [string]$MappingCsv = "",
    [string]$Catalog = "",
    [switch]$IncludeUnmapped,
    [switch]$KeepOriginals,
    [switch]$VerifyExisting
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "media.py"
$shards = @("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f")

foreach ($shard in $shards) {
    Write-Host "Scanning shard $shard"
    $scan = @("-3", $script, "scan", "--input", $SourceDirectory, "--output", $OutputDirectory, "--platform", $Platform, "--game-version", $GameVersion, "--shard", $shard)
    if ($BuildId) { $scan += @("--build-id", $BuildId) }
    & py @scan
    if ($LASTEXITCODE -ne 0) { throw "scan failed for shard $shard" }

    Write-Host "Converting shard $shard"
    $build = @("-3", $script, "build", "--input", $SourceDirectory, "--output", $OutputDirectory, "--shard", $shard)
    if ($R39Index) { $build += @("--r39-index", $R39Index) }
    if ($MappingCsv) { $build += @("--mapping", $MappingCsv) }
    if ($IncludeUnmapped) { $build += "--include-unmapped" }
    if ($KeepOriginals) { $build += "--keep-originals" }
    if ($VerifyExisting) { $build += "--verify-existing" }
    & py @build
    if ($LASTEXITCODE -ne 0) { throw "build failed for shard $shard" }
}

$merge = @("-3", $script, "merge", "--output", $OutputDirectory)
if ($Catalog) { $merge += @("--catalog", $Catalog) }
& py @merge
if ($LASTEXITCODE -ne 0) { throw "merge failed" }
Write-Host "Local media report: $(Join-Path $OutputDirectory 'report.json')"
