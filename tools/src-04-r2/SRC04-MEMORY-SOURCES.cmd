@echo off
setlocal EnableExtensions
set "SRC04_LAUNCHER=%~f0"
powershell.exe -NoProfile -Command "$raw=Get-Content -LiteralPath $env:SRC04_LAUNCHER -Raw; $payload=($raw -split '(?m)^# __POWERSHELL_PAYLOAD__\r?$',2)[1]; & ([scriptblock]::Create($payload))"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Extraction incomplete. See the local report or error above.
pause
exit /b %RESULT%
# __POWERSHELL_PAYLOAD__
$ErrorActionPreference = 'Stop'
$work = $null
try {
    Write-Host 'Dreamwish Wand - memory image extraction (local only)' -ForegroundColor Cyan
    Write-Host 'No R2 operations, save modifications or game-file changes.'
    $game = Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Steam\steamapps\common\Disney Dreamlight Valley'
    if (-not (Test-Path -LiteralPath (Join-Path $game 'FullVersion.txt'))) {
        $game = (Read-Host 'Steam game installation folder').Trim().Trim('"')
    }
    if (-not (Test-Path -LiteralPath (Join-Path $game 'FullVersion.txt'))) { throw 'FullVersion.txt not found.' }
    $version = (Get-Content -LiteralPath (Join-Path $game 'FullVersion.txt') -Raw).Trim()
    if ($version -notmatch '(?:^|-)v1\.26\.2(?:-|$)') { throw 'This launcher requires Steam 1.26.2. Do not use mismatched game data.' }
    $aa = Join-Path $game 'ddv_Data\StreamingAssets\aa'
    if (-not (Test-Path -LiteralPath (Join-Path $aa 'catalog.entryData.bin'))) { throw 'Split Addressables catalog not found.' }
    & py -3 -c "import UnityPy; from PIL import Image,features; assert features.check('webp')"
    if ($LASTEXITCODE -ne 0) { throw 'Use the existing SRC-04 Python environment with UnityPy and Pillow (WebP support).' }
    $root = Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    $out = Join-Path $root 'memory-sources'
    $existing = Join-Path $root 'shared-ui-media'
    $work = Join-Path $env:TEMP ('wand-memory-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work,$out -Force | Out-Null
    $ref = '5e6643f1e27b682581c303a6adca071d90d5e67a'
    $base = 'https://raw.githubusercontent.com/DreamwishWand/Wand/' + $ref + '/'
    foreach ($name in @('extract_memory_sources.py','resolve_shop_catalog.py','resolve_shop_objects.py','bundle_thumbnails.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base + 'tools/src-04-r2/' + $name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $part = 'reviewed-root-scalars-steam-1.26.2.part7.json'
    Invoke-WebRequest -UseBasicParsing -Uri ($base + 'data/ddv/item-master/' + $part) -OutFile (Join-Path $work $part) -TimeoutSec 60
    Write-Host "Extracting verified source images into $out"
    & py -3 -u (Join-Path $work 'extract_memory_sources.py') --db01 (Join-Path $work $part) --aa $aa --existing-root $existing --out $out
    $result = $LASTEXITCODE
    Write-Host "Report: $out\memory-source-report.json"
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
