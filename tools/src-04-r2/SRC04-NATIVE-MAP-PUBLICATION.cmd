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
    $defaultGame=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Steam\steamapps\common\Disney Dreamlight Valley'
    $game=Read-Host "Original Steam 1.26.2 game directory [$defaultGame]"
    if (!$game) { $game=$defaultGame }
    $out=Join-Path $root 'native-map-publication-v2'
    $mode=Read-Host 'Type PLAN for local preparation, or R2 for preparation and optional publication'
    if ($mode -cne 'PLAN' -and $mode -cne 'R2') { exit 0 }
    & py -3 -c "import PIL,lz4.block; from PIL import features; assert features.check('webp')"
    if ($LASTEXITCODE -ne 0) { throw 'Python 3 with Pillow WebP support and lz4 required: py -3 -m pip install Pillow lz4' }
    & node --version
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12 or newer required' }
    $work=Join-Path ([IO.Path]::GetTempPath()) ('wand-native-map-'+[Guid]::NewGuid().ToString('N'))
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/aec4af6bf383d5d7543ab8e82c6ed6753a33ce34/'
    $scripts=@('prepare_native_map_originals.py','encode_native_map_originals.py','encode_native_map_from_bundles.py','audit_native_map_cdn.py','verify_native_map_egl.py','extract_native_lock_textures.py','inspect_native_map_layout.py','native_map_render_graph.py','inspect_native_map_texture_refs.py','build_native_map_geometry.py','build_native_map_lock_graph.py','inspect_native_map_alpha.py','inspect_native_map_registration.py','bind_native_map_images.py','build_native_map_private_preview.mjs','world-map-source-steam-1.26.2.json','world-map-ocean-source-steam-1.26.2.json','publish_native_map_originals.py','publish_recovered_map_parts.py','publish_world_map_parts.py','publish_bundle_thumbnails.py','bundle_thumbnails.py','recover_world_map_parts.py','recover_public_map_parts.py','resolve_shop_catalog.py','resolve_shop_objects.py','extract_memory_sources.py')
    $files=@($scripts | ForEach-Object { 'tools/src-04-r2/'+$_ })
    $files+=@('native-map-draw-plan.ts','native-map-mask-geometry.ts','native-map-canvas-alpha.ts','native-map-blocker-visibility.ts','native-map-renderer.ts') | ForEach-Object { 'src/lib/media/'+$_ }
    foreach ($file in $files) {
        $dest=Join-Path $work $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri ($base+$file) -OutFile $dest -TimeoutSec 60
    }
    $argsList=@('--game',$game,'--out',$out)
    foreach ($sub in @('shared-ui-media','native-map-publication')) {
        $reuse=Join-Path $root $sub
        if (Test-Path -LiteralPath $reuse -PathType Container) { $argsList+=@('--reuse-dir',$reuse) }
    }
    & py -3 -u (Join-Path $work 'tools/src-04-r2/prepare_native_map_originals.py') @argsList
    if ($LASTEXITCODE -ne 0) { throw 'Original preparation failed; existing completed images and receipts retained' }
    if ($mode -ceq 'R2') {
        & py -3 -c "import boto3"
        if ($LASTEXITCODE -ne 0) { throw 'R2 mode requires boto3: py -3 -m pip install boto3' }
        $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
        $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
        $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
        & py -3 -u (Join-Path $work 'tools/src-04-r2/publish_native_map_originals.py') --root $out --r2 --max-new-objects 118 --max-new-bytes 536870912
        if ($LASTEXITCODE -ne 0) { throw 'R2 publication failed; local results retained' }
        if (Test-Path -LiteralPath (Join-Path $out 'native-map-publication-receipt.json')) {
            Write-Host 'Canonical receipt available. CDN verification remains separate.'
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
