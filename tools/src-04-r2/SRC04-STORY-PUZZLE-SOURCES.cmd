@echo off
setlocal EnableExtensions
set "SRC04_LAUNCHER=%~f0"
powershell.exe -NoProfile -Command "$raw=Get-Content -LiteralPath $env:SRC04_LAUNCHER -Raw; $payload=($raw -split '(?m)^# __POWERSHELL_PAYLOAD__\r?$',2)[1]; & ([scriptblock]::Create($payload))"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
# __POWERSHELL_PAYLOAD__
$ErrorActionPreference='Stop'
$work=$null
try {
    $game=Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Steam\steamapps\common\Disney Dreamlight Valley'
    if (-not (Test-Path -LiteralPath (Join-Path $game 'FullVersion.txt'))) {
        $game=(Read-Host 'Steam game installation folder').Trim().Trim('"')
    }
    $version=(Get-Content -LiteralPath (Join-Path $game 'FullVersion.txt') -Raw).Trim()
    if ($version -notmatch '(?:^|-)v1\.26\.2(?:-|$)') { throw 'Steam 1.26.2 is required.' }
    $aa=Join-Path $game 'ddv_Data\StreamingAssets\aa'
    if (-not (Test-Path -LiteralPath (Join-Path $aa 'catalog.entryData.bin'))) { throw 'Split Addressables catalog not found.' }
    & py -3 -c "import UnityPy; from PIL import features; assert features.check('webp')"
    if ($LASTEXITCODE -ne 0) { throw 'Use the existing SRC-04 Python environment with UnityPy and Pillow.' }
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    $out=Join-Path $root 'story-puzzle-sources'
    $work=Join-Path $env:TEMP ('wand-story-puzzle-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work,$out -Force | Out-Null
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/9a133199c48b21f06314202413a8b23a020e0bb1/'
    foreach ($name in @('extract_story_puzzle_sources.py','extract_memory_sources.py','resolve_shop_catalog.py','resolve_shop_objects.py','bundle_thumbnails.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base+'tools/src-04-r2/'+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $part='reviewed-root-scalars-steam-1.26.2.part7.json'
    Invoke-WebRequest -UseBasicParsing -Uri ($base+'data/ddv/item-master/'+$part) -OutFile (Join-Path $work $part) -TimeoutSec 60
    Write-Host 'Extract Quest Puzzle / Lorekeeper image sources and 512px thumbnails. Local only. No R2 writes.'
    & py -3 -u (Join-Path $work 'extract_story_puzzle_sources.py') --db01 (Join-Path $work $part) --aa $aa --existing-root (Join-Path $root 'shared-ui-media') --out $out
    $result=$LASTEXITCODE
    Write-Host "Output: $out"
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
