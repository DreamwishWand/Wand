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
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2\item-thumbnails-256'
    foreach ($file in @('item-256-index-candidate.json','item-256-publication-receipt.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { throw "Missing $file" }
    }
    $work=Join-Path $env:TEMP ('wand-item-256-index-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $script=Join-Path $work 'publish_item_256_index.py'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/8f058f9ad71603c473d9d2bf6554a95d2c4099b4/tools/src-04-r2/publish_item_256_index.py' -OutFile $script -TimeoutSec 60
    Write-Host 'Publish only the verified Item ID lookup (257 JSON files). No image regeneration, image upload, LIST, overwrite, copy, delete or private bucket access.'
    $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
    $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
    $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
    & py -3 -u $script --root $root --r2
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
