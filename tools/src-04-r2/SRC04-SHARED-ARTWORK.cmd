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
function ReadPath($prompt) {
    $p=(Read-Host $prompt).Trim().Trim('"')
    if (-not $p) { throw 'A path is required.' }
    (Resolve-Path -LiteralPath $p -ErrorAction Stop).Path
}
function Run([string[]]$argv) {
    & py -3 -u @argv
    if ($LASTEXITCODE -ne 0) { throw ('Python failed: '+$argv[0]) }
}
try {
    $mode=Read-Host 'UI = register prepared original UI images; SHOP = extract current and historical catalog references privately; RECOVER = recover an existing SHOP extraction; STAGE = reuse resolved images for an explicitly selected private target set'
    if ($mode -notin @('UI','SHOP','RECOVER','STAGE')) { throw 'Select UI, SHOP, RECOVER or STAGE.' }
    $homePath=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    New-Item -ItemType Directory -Path $homePath -Force | Out-Null
    $ledger=Join-Path $homePath 'source-image-ledger.json'
    $alternate=(Read-Host "Existing verified source-image ledger path (Enter uses $ledger)").Trim().Trim('"')
    if ($alternate) {
        if (-not (Test-Path -LiteralPath $alternate -PathType Leaf)) { throw 'Specify an existing source-image-ledger.json FILE, not a directory. Or press Enter.' }
        $ledger=(Resolve-Path -LiteralPath $alternate).Path
    }
    $work=Join-Path $env:TEMP ('wand-shared-artwork-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/303ac03df6159b3396b526d013a6a3498c58a96b/tools/src-04-r2/'
    foreach ($name in @('shared_source_delta.py','project_shared_ui_release.py','integrated_shop_artwork_targets.py','bundle_thumbnails.py','extract_memory_sources.py','extract_story_puzzle_sources.py','resolve_shop_catalog.py','publish_bundle_thumbnails.py','publish_memory_sources.py','publish_recovered_map_parts.py','source_image_ledger.py','item_cdn_ledger.py','resolve_shop_objects.py','migrate_item_thumbnails_256.py','verify_source_cdn.py','publish_world_map_parts.py','recover_world_map_parts.py','recover_public_map_parts.py','stage_media_v2.py','plan_media_update.py','native_cdn_curl.py','audit_native_map_cdn.py')) {
        try { Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60 }
        catch { throw ('Dependency download failed: '+$base+$name+' ; '+$_.Exception.Message) }
    }
    $delta=Join-Path $work 'shared_source_delta.py'
    if ($mode -eq 'UI') {
        $root=Join-Path $homePath 'shared-ui-272'
        if (-not (Test-Path -LiteralPath $root)) {
            $zip=ReadPath 'Path to src04-ui-expanded-1.26.2.private.zip'
            if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'cf89a28e3eb40dcd23c085d8a2eb617fb2fd49fc36ab718186e1333ebe0a0d3f') { throw 'Prepared UI archive SHA-256 mismatch.' }
            Expand-Archive -LiteralPath $zip -DestinationPath $root
        }
        Run @($delta,'plan','--root',$root,'--ledger',$ledger)
        if (-not (Test-Path -LiteralPath (Join-Path $root 'shared-publication-receipt.json'))) {
            $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
            $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
            $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
            Run @($delta,'publish','--root',$root,'--ledger',$ledger,'--max-objects','1000','--max-bytes','100000000')
        }
        Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
        if (-not (Test-Path -LiteralPath (Join-Path $root 'shared-publication-receipt.json'))) { throw 'No publication receipt. Registration not complete.' }
        Run @($delta,'verify','--root',$root,'--ledger',$ledger,'--transport','curl','--max-objects','1000','--max-bytes','100000000')
        $cdn=Get-Content -LiteralPath (Join-Path $root 'shared-cdn-readback.json') -Raw | ConvertFrom-Json
        if (-not $cdn.cdnVerified -or -not (Test-Path -LiteralPath $ledger -PathType Leaf)) { throw 'CDN verification incomplete. Successful results saved; rerun UI to resume. No further upload needed.' }
        $release=Join-Path $root 'shared-ui-release.json'
        if (-not (Test-Path -LiteralPath $release)) {
            Run @((Join-Path $work 'project_shared_ui_release.py'),'--root',$root,'--ledger',$ledger,'--out',$release)
        }
        Write-Host "Return this verified index to SRC-04: $release"
        Write-Host "Keep the receipt, CDN readback and ledger privately: $root ; $ledger"
    } elseif ($mode -eq 'RECOVER') {
        $root=ReadPath 'Existing SHOP extraction folder (with shared-source-report.json)'
        $aa=ReadPath 'Steam game root or ddv_Data\StreamingAssets\aa folder'
        $child=Join-Path $aa 'ddv_Data\StreamingAssets\aa'
        if (Test-Path -LiteralPath (Join-Path $child 'catalog.json')) { $aa=$child }
        $folderName=Split-Path -Leaf $root
        if ($folderName -notmatch '^shop-artwork-(.+)$') { throw 'Expected SHOP extraction folder name.' }
        $projection=Join-Path (Split-Path -Parent $root) ('shop-targets-'+$Matches[1]+'\integrated-shop-artwork-refs.json')
        if (-not (Test-Path -LiteralPath $projection -PathType Leaf)) { $projection=ReadPath 'Private integrated-shop-artwork-refs.json' }
        $arguments=@($delta,'recover','--root',$root,'--aa',$aa,'--ledger',$ledger,'--shop-projection',$projection)
        $existing=(Read-Host 'Existing extracted image root with manifests (Enter skips)').Trim().Trim('"')
        if ($existing) { $arguments+=@('--existing-root',(Resolve-Path -LiteralPath $existing).Path) }
        Write-Host 'Original Texture2D files will be reused; distinct Sprite objects extracted. No R2 operations.'
        Run $arguments
        Write-Host "Return private typed report to SRC-04: $(Join-Path $root 'typed-shop-source-report.json')"
    } elseif ($mode -eq 'STAGE') {
        $sourceRoot=ReadPath 'Existing shared extraction directory (including incomplete extraction)'
        $selection=ReadPath 'Reviewed target JSON (explicit GUID scope)'
        $root=Join-Path $homePath ('shop-stage-'+[guid]::NewGuid().ToString('N').Substring(0,12))
        Run @($delta,'stage','--root',$root,'--existing-root',$sourceRoot,'--targets',$selection,'--ledger',$ledger)
        Run @($delta,'plan','--root',$root,'--ledger',$ledger)
        Write-Host "Private staged output: $root"
        Write-Host 'No network or publication was performed.'
    } else {
        $aa=ReadPath 'Steam game root or ddv_Data\StreamingAssets\aa folder'
        $child=Join-Path $aa 'ddv_Data\StreamingAssets\aa'
        if (Test-Path -LiteralPath (Join-Path $child 'catalog.json')) { $aa=$child }
        $source=ReadPath 'Path to the private DB-01 integrated premium bundle source JSON'
        $stamp=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
        $targets=Join-Path $homePath ('shop-targets-'+$stamp)
        $root=Join-Path $homePath ('shop-artwork-'+$stamp)
        Run @((Join-Path $work 'integrated_shop_artwork_targets.py'),'--source',$source,'--aa',$aa,'--out',$targets)
        $arguments=@($delta,'extract','--root',$root,'--aa',$aa,'--targets',(Join-Path $targets 'shop-image-targets.json'),'--ledger',$ledger)
        $existing=(Read-Host 'Existing extracted image root with manifests (Enter skips)').Trim().Trim('"')
        if ($existing) { $arguments+=@('--existing-root',(Resolve-Path -LiteralPath $existing).Path) }
        Write-Host "Private extraction output: $root"
        Run $arguments
        Run @($delta,'plan','--root',$root,'--ledger',$ledger)
        Write-Host "Private reference projection: $targets"
        Write-Host "Private images and source report: $root"
        Write-Host 'Shop extraction is not a publication or rendering proof. Do not upload Shop assets until source and visibility review.'
    }
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
