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
    $defaultRoot='D:\Users\'+$env:USERNAME+'\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    if (!(Test-Path -LiteralPath $defaultRoot -PathType Container)) {
        $defaultRoot=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    }
    $root=Read-Host "SRC-04 Steam-v1.26.2 work directory [$defaultRoot]"
    if (!$root) { $root=$defaultRoot }
    $out=Join-Path $root 'native-map-publication-v2'
    $ledger=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DreamwishWand\SRC-04 MEDIA\verified-native-map-ledger.json'
    $priorArgs=@()
    if (Test-Path -LiteralPath $ledger -PathType Leaf) { $priorArgs=@('--ledger',$ledger); Write-Host "Using verified ledger: $ledger" }
    $mode=Read-Host 'Type PLAN (prepare), R2 (prepare and publish), PUBLISH (existing prepared package), or VERIFY (existing package CDN audit)'
    if ($mode -cnotin @('PLAN','R2','PUBLISH','VERIFY')) { exit 0 }
    $prepare=$mode -cin @('PLAN','R2')
    $publish=$mode -cin @('R2','PUBLISH')
    if ($prepare) {
        $defaultGame=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Steam\steamapps\common\Disney Dreamlight Valley'
        $game=Read-Host "Original Steam 1.26.2 game directory [$defaultGame]"
        if (!$game) { $game=$defaultGame }
        & py -3 -c "import PIL,lz4.block; from PIL import features; assert features.check('webp')"
        if ($LASTEXITCODE -ne 0) { throw 'Python 3 with Pillow WebP support and lz4 required: py -3 -m pip install Pillow lz4' }
        & node --version
        if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12 or newer required' }
    } else {
        $chosen=Read-Host "Extracted prepared package folder [$out]"
        if ($chosen) { $out=$chosen }
        foreach ($file in @('native-cdn-audit-input.json','native-map-lossless-plan.json')) {
            if (!(Test-Path -LiteralPath (Join-Path $out $file) -PathType Leaf)) { throw "Missing prepared package: $file" }
        }
        & py -3 -c "from PIL import features; assert features.check('webp')"
        if ($LASTEXITCODE -ne 0) { throw 'Python 3 with Pillow WebP support required: py -3 -m pip install Pillow' }
    }
    $work=Join-Path ([IO.Path]::GetTempPath()) ('wand-native-map-'+[Guid]::NewGuid().ToString('N'))
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/74029fd08ec4b3043c4abfd5cabf2cffcd002685/'
    $scripts=@('verified_image_ledger.py','prepare_native_map_originals.py','encode_native_map_originals.py','encode_native_map_from_bundles.py','audit_native_map_cdn.py','verify_native_map_egl.py','extract_native_lock_textures.py','inspect_native_map_layout.py','native_map_render_graph.py','inspect_native_map_texture_refs.py','build_native_map_geometry.py','build_native_map_lock_graph.py','inspect_native_map_alpha.py','inspect_native_map_registration.py','bind_native_map_images.py','build_native_map_private_preview.mjs','world-map-source-steam-1.26.2.json','world-map-ocean-source-steam-1.26.2.json','publish_native_map_originals.py','publish_recovered_map_parts.py','publish_world_map_parts.py','publish_bundle_thumbnails.py','bundle_thumbnails.py','recover_world_map_parts.py','recover_public_map_parts.py','resolve_shop_catalog.py','resolve_shop_objects.py','extract_memory_sources.py')
    $files=@($scripts | ForEach-Object { 'tools/src-04-r2/'+$_ })
    $files+=@('native-map-draw-plan.ts','native-map-mask-geometry.ts','native-map-canvas-alpha.ts','native-map-blocker-visibility.ts','native-map-renderer.ts') | ForEach-Object { 'src/lib/media/'+$_ }
    foreach ($file in $files) {
        $dest=Join-Path $work $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri ($base+$file) -OutFile $dest -TimeoutSec 60
    }
    if ($prepare) {
    $argsList=@('--game',$game,'--out',$out)
    foreach ($sub in @('shared-ui-media','native-map-publication')) {
        $reuse=Join-Path $root $sub
        if (Test-Path -LiteralPath $reuse -PathType Container) { $argsList+=@('--reuse-dir',$reuse) }
    }
    & py -3 -u (Join-Path $work 'tools/src-04-r2/prepare_native_map_originals.py') @argsList @priorArgs
    if ($LASTEXITCODE -ne 0) { throw 'Original preparation failed; existing completed images and receipts retained' }
    }
    if ($publish) {
        & py -3 -c "import boto3"
        if ($LASTEXITCODE -ne 0) { throw 'R2 mode requires boto3: py -3 -m pip install boto3' }
        $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
        $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
        $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
        & py -3 -u (Join-Path $work 'tools/src-04-r2/publish_native_map_originals.py') --root $out --r2 --max-new-objects 118 --max-new-bytes 536870912 @priorArgs
        if ($LASTEXITCODE -ne 0) { throw 'R2 publication failed; local results retained' }
        if (Test-Path -LiteralPath (Join-Path $out 'native-map-publication-receipt.json')) {
            Write-Host 'Canonical receipt available.'
        }
    }
    if ($mode -ceq 'VERIFY' -or ($publish -and (Test-Path -LiteralPath (Join-Path $out 'native-map-publication-receipt.json')))) {
        if ((Read-Host 'Type VERIFY to read and check the published CDN bytes (up to 118 GETs and 500 MB)') -ceq 'VERIFY') {
            $audit=Join-Path $out ('cdn-audit-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
            & py -3 -u (Join-Path $work 'tools/src-04-r2/audit_native_map_cdn.py') verify --input (Join-Path $out 'native-cdn-audit-input.json') --out $audit --confirm-read
            if ($LASTEXITCODE -ne 0) { throw 'CDN audit failed; local images and canonical receipt retained' }
            Write-Host "CDN report: $audit"
            $report=Get-Content -LiteralPath (Join-Path $audit 'audit.json') -Raw | ConvertFrom-Json
            if ($report.cdnVerified -eq $true -and (Test-Path -LiteralPath (Join-Path $out 'native-map-publication-receipt.json'))) {
                New-Item -ItemType Directory -Path (Split-Path -Parent $ledger) -Force | Out-Null
                $newLedger=Join-Path (Split-Path -Parent $ledger) ('verified-native-map-ledger-'+[Guid]::NewGuid().ToString('N')+'.json')
                $historyArgs=@()
                if (Test-Path -LiteralPath $ledger -PathType Leaf) { $historyArgs=@('--prior',$ledger) }
                & py -3 -u (Join-Path $work 'tools/src-04-r2/verified_image_ledger.py') --root $out --cdn-report (Join-Path $audit 'audit.json') --out $newLedger @historyArgs
                if ($LASTEXITCODE -ne 0) { throw 'Ledger generation failed; retain all local WebPs' }
                Move-Item -LiteralPath $newLedger -Destination $ledger -Force
                Write-Host "Verified image ledger: $ledger"
                Write-Host 'Return the ledger and audit.json. Retain source originals and the ledger before removing local image cache.'
            } else {
                Write-Host 'CDN verification or canonical receipt incomplete. Keep local images.'
            }
            Write-Host 'Return audit.json; per-map manifests remain private test previews.'
        }
    }
    Write-Host "Output directory: $out"
    Write-Host 'Return native-map-lossless-plan.json and, if published, native-map-publication-receipt.json.'
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
