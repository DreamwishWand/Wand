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
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    $work=Join-Path $env:TEMP ('wand-cdn-readback-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $script=Join-Path $work 'verify_source_cdn.py'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/1a2e4f6be7b6b8f471c3a02777a86815c87e84b2/tools/src-04-r2/verify_source_cdn.py' -OutFile $script -TimeoutSec 60
    $result=0
    $found=$false
    foreach ($name in @('story-puzzle','memory')) {
        $receipt=Join-Path (Join-Path $root ($name+'-sources')) ($name+'-publication-receipt.json')
        if (Test-Path -LiteralPath $receipt) {
            $found=$true
            & py -3 -u $script --receipt $receipt
            if ($LASTEXITCODE -ne 0) { $result=1 }
        } else { Write-Host "Skip $name (no publication receipt)" }
    }
    if (-not $found) { throw 'No publication receipts found.' }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
