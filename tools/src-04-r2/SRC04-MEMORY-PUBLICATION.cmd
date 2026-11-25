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
function ReadSecret($prompt) {
    $secret=Read-Host $prompt -AsSecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secret.Dispose() }
}
try {
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2\memory-sources'
    if (-not (Test-Path -LiteralPath (Join-Path $root 'memory-source-report.json'))) { throw 'Existing memory-source-report.json not found.' }
    $work=Join-Path $env:TEMP ('wand-memory-publish-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/6e3d2357d60320f98ecc4e420f1d1f63f6b5d7ca/'
    foreach ($name in @('publish_memory_sources.py','publish_bundle_thumbnails.py','extract_memory_sources.py','resolve_shop_catalog.py','resolve_shop_objects.py','bundle_thumbnails.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base+'tools/src-04-r2/'+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $part='reviewed-root-scalars-steam-1.26.2.part7.json'
    Invoke-WebRequest -UseBasicParsing -Uri ($base+'data/ddv/item-master/'+$part) -OutFile (Join-Path $work $part) -TimeoutSec 60
    Write-Host 'Generate only missing 512px memory thumbnails. Existing originals and masks remain unchanged. No overwrite, delete, copy or private bucket operations.'
    $mode=Read-Host 'Type PLAN for local thumbnail generation/index, or R2 for generation, inventory and optional upload'
    if ($mode -eq 'PLAN') {
        & py -3 -u (Join-Path $work 'publish_memory_sources.py') --root $root --db01 (Join-Path $work $part)
    } elseif ($mode -eq 'R2') {
        $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
        $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
        $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
        & py -3 -u (Join-Path $work 'publish_memory_sources.py') --root $root --db01 (Join-Path $work $part) --r2
    } else { throw 'No operation selected.' }
    $result=$LASTEXITCODE
    Write-Host "Output directory: $root"
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
