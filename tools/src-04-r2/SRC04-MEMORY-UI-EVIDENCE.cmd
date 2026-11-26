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
    if ($version -notmatch '(?:^|-)v1\.26\.2(?:-|$)') { throw 'Steam 1.26.2 required.' }
    & py -3 -c "import UnityPy,lz4.block; import ctypes; ctypes.WinDLL('d3dcompiler_47.dll')"
    if ($LASTEXITCODE -ne 0) { throw 'Existing SRC-04 UnityPy / lz4 Python environment and Windows D3DCompiler required.' }
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2\memory-sources'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $report=Join-Path $root ('memory-ui-evidence-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json')
    $work=Join-Path $env:TEMP ('wand-memory-ui-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $script=Join-Path $work 'inspect_memory_ui.py'
    $helper=Join-Path $work 'inspect_memory_rendering.py'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/aa5875be88bc6a867fc7e3cce2250a5611fdcefa/tools/src-04-r2/inspect_memory_rendering.py' -OutFile $helper -TimeoutSec 60
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/9fd5724b14ea7f33ae52074007236cdc00fe9f86/tools/src-04-r2/inspect_memory_ui.py' -OutFile $script -TimeoutSec 60
    Write-Host 'Inspect exact Memory UI component references and prioritized shader candidates. No game launch, save access, game changes or R2 operations.'
    & py -3 -u $script --game $game --out $report
    $result=$LASTEXITCODE
    if (Test-Path -LiteralPath $report) { Write-Host "Private report: $report" }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
