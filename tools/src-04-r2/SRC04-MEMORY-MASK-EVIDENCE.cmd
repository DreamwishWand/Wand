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
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2\memory-sources'
    foreach ($name in @('memory-index-candidate.json','memory-publication-receipt.json','images')) {
        if (-not (Test-Path -LiteralPath (Join-Path $root $name))) { throw "Missing $name" }
    }
    Write-Host 'Inspect 40 existing native mask/outline textures. No R2 access, save access, image generation or source changes.'
    $work=Join-Path $env:TEMP ('wand-memory-mask-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $script=Join-Path $work 'inspect_memory_masks.py'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/a4ac40c3f3b8575d306ab6eb81c2a699cd9cfb94/tools/src-04-r2/inspect_memory_masks.py' -OutFile $script -TimeoutSec 60
    & py -3 -u $script --root $root
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
