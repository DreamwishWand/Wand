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
function FindGame {
    $steamRoots=@()
    foreach ($key in @('HKCU:\Software\Valve\Steam','HKLM:\SOFTWARE\WOW6432Node\Valve\Steam','HKLM:\SOFTWARE\Valve\Steam')) {
        $v=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($v) {
            foreach ($name in @('world-map-source-steam-1.26.2.json','world-map-ocean-source-steam-1.26.2.json','recover_world_map_parts.py','recover_public_map_parts.py','publish_recovered_map_parts.py','publish_world_map_parts.py','publish_bundle_thumbnails.py','bundle_thumbnails.py','resolve_shop_catalog.py','resolve_shop_objects.py','extract_memory_sources.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $pubOut=Join-Path $out 'publication'
    $argsList=@('--report',(Join-Path $work 'world-map-source-steam-1.26.2.json'),'--ocean',(Join-Path $work 'world-map-ocean-source-steam-1.26.2.json'),'--root',$out,'--out',$pubOut)
    $roots=@([Environment]::GetFolderPath('MyDocuments'),[Environment]::GetFolderPath('DesktopDirectory'),(Join-Path $env:USERPROFILE 'Downloads'),$env:OneDrive,$env:OneDriveConsumer,$env:OneDriveCommercial)
    foreach ($root in @($roots | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique)) {
        $argsList+=@('--search',$root)
    }
    $aa=FindGame
    if ($aa) { $argsList+=@('--aa',$aa) }
    Write-Host 'Recover 109 map originals and seven ocean SDF originals. No folder selection or composite generation.'
    Write-Host 'R2 mode: reuse public originals first, then recover missing assets; one public inventory and a bounded upload plan.'
    $mode=Read-Host 'Type R2 for public inventory and optional upload, or PLAN for local-only recovery'
    if ($mode -ceq 'R2') {
        $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
        $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
        $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
        $argsList+=@('--r2','--max-new-objects','116','--max-new-bytes','536870912')
    } elseif ($mode -cne 'PLAN') { exit 0 }
    & py -3 -u (Join-Path $work 'publish_recovered_map_parts.py') @argsList
    $result=$LASTEXITCODE
    Write-Host "Output directory: $pubOut"
    if ($result -eq 0) { Write-Host 'If uploaded, return world-map-parts-release.json, world-map-parts-receipt.json and, if present, world-map-ocean-originals-receipt.json.' }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
