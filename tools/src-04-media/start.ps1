param(
    [switch]$SampleOnly,
    [switch]$KeepOriginals,
    [switch]$VerifyExisting
)

$ErrorActionPreference = "Stop"

# No local Git clone needed. This launcher downloads only executable source from
# the SRC-04 development branch; it never uploads, commits, or publishes assets.
$ref = "src-04-media-windows-tool"
$baseUrl = "https://raw.githubusercontent.com/DreamwishWand/Wand/$ref"
$install = Join-Path $env:LOCALAPPDATA "DreamwishWand\SRC-04\code"
$out = Join-Path $env:USERPROFILE "Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2"
$game = "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley"
New-Item -ItemType Directory -Path $install,$out -Force | Out-Null

function Download-Source([string]$repoPath, [string]$fileName) {
    $target = Join-Path $install $fileName
    $temp = "$target.partial"
    Invoke-WebRequest -Uri "$baseUrl/$repoPath" -OutFile $temp -UseBasicParsing
    if ((Get-Item $temp).Length -lt 10) { throw "Downloaded file unexpectedly small: $repoPath" }
    Move-Item -LiteralPath $temp -Destination $target -Force
    return $target
}

$main = Download-Source "tools/src-04-media/native1262.py" "native1262.py"
$null = Download-Source "tools/src-04-media/media.py" "media.py"
# SRC-01 was committed to main after the SRC-04 branch was created.
# Fetch this cross-stream dependency from the branch where it exists.
$src01Url = "https://raw.githubusercontent.com/DreamwishWand/Wand/main/tools/src-01-items/steam1262.py"
$src01Target = Join-Path $install "steam1262.py"
$src01Temp = "$src01Target.partial"
try {
    Invoke-WebRequest -Uri $src01Url -OutFile $src01Temp -UseBasicParsing
    if ((Get-Item $src01Temp).Length -lt 1000) { throw "SRC-01 decoder download is unexpectedly short" }
    Move-Item -LiteralPath $src01Temp -Destination $src01Target -Force
} catch {
    Remove-Item -LiteralPath $src01Temp -Force -ErrorAction SilentlyContinue
    throw "Failed to fetch the SRC-01 decoder from GitHub main: $($_.Exception.Message)"
}
$null = Download-Source "tools/src-04-media/source-index-1262.csv" "source-index-1262.csv"
$requirements = Download-Source "tools/src-04-media/requirements-unity.txt" "requirements-unity.txt"

if (-not (Test-Path -LiteralPath $game -PathType Container)) {
    throw "Steam game folder not found: $game"
}

$modulesReady = $false
try {
    & py -3 -c "import PIL, UnityPy" *> $null
    $modulesReady = ($LASTEXITCODE -eq 0)
} catch { $modulesReady = $false }
if (-not $modulesReady) {
    Write-Host "Installing image extraction dependencies (Pillow and UnityPy)..."
    & py -3 -m pip install --user -r $requirements
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed" }
}

Write-Host "SRC-04 MEDIA Steam v1.26.2 -- validating source and running sample..."
& py -3 $main --game $game --out $out --limit-bundles 2
if ($LASTEXITCODE -ne 0) {
    throw "Initial sample failed. Inspect $out\report-native.json before rerunning."
}

if (-not $SampleOnly) {
    $args = @("-3", $main, "--game", $game, "--out", $out, "--limit-bundles", "0")
    if ($KeepOriginals) { $args += "--keep-originals" }
    if ($VerifyExisting) { $args += "--verify-existing" }
    Write-Host "Sample complete. Running all source-matched generated icon bundles locally."
    & py @args
    if ($LASTEXITCODE -ne 0) { throw "One or more bundle extractions failed; inspect $out\report-native.json" }
}

# Optional Google Drive for Desktop sync: only persist report and manifest
# when the existing exact folder path can be found. Never copy game images.
$driveRoots = @(
    "G:\My Drive",
    "G:\マイドライブ",
    (Join-Path $env:USERPROFILE "My Drive"),
    (Join-Path $env:USERPROFILE "Google Drive\My Drive")
)
$syncFolder = $null
foreach ($root in $driveRoots) {
    $candidate = Join-Path $root "Dreamwish Wand\Development\Sources\SRC-04 MEDIA"
    if (Test-Path -LiteralPath $candidate -PathType Container) {
        $syncFolder = $candidate
        break
    }
}
if ($syncFolder) {
    foreach ($file in @("manifest-native.json", "report-native.json")) {
        $sourceFile = Join-Path $out $file
        if (Test-Path $sourceFile) {
            Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $syncFolder $file) -Force
        }
    }
    $probe = Join-Path $out "evidence\catalog-probe.json"
    if (Test-Path $probe) {
        Copy-Item -LiteralPath $probe -Destination (Join-Path $syncFolder "catalog-probe.json") -Force
    }
    Write-Host "Report and manifest copied into Google Drive for Desktop sync folder."
} else {
    Write-Host "Google Drive Desktop folder not detected; results retained locally only."
}

Write-Host "SRC-04 output: $out"
Write-Host "Report: $(Join-Path $out 'report-native.json')"
Write-Host "Manifest: $(Join-Path $out 'manifest-native.json')"
