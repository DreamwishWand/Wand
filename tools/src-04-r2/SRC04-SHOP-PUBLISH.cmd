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
    $mode=Read-Host 'PLAN = validate local files; PUBLISH = register and verify exact public Shop images'
    if ($mode -notin @('PLAN','PUBLISH')) { throw 'Select PLAN or PUBLISH.' }
    $mediaRoot=$env:WAND_MEDIA_ROOT
    if (-not $mediaRoot) { $mediaRoot=Join-Path ('D:\Users\'+$env:USERNAME+'\Documents') 'DreamwishWand\SRC-04 MEDIA' }
    if (-not (Test-Path -LiteralPath $mediaRoot -PathType Container)) { $mediaRoot=ReadPath 'Existing SRC-04 MEDIA workspace root (data drive)' }
    $homePath=Join-Path (Resolve-Path -LiteralPath $mediaRoot).Path 'Steam-v1.26.2'
    New-Item -ItemType Directory -Path $homePath -Force | Out-Null
    Write-Host "Workspace: $homePath"
    $candidates=@(Get-ChildItem -LiteralPath $homePath -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'typed-shop-source-report.json') -PathType Leaf })
    if ($candidates.Count -eq 1) {
        $source=$candidates[0].FullName
        $entered=(Read-Host "Completed SHOP extraction folder (Enter uses $source)").Trim().Trim('"')
        if ($entered) { $source=(Resolve-Path -LiteralPath $entered).Path }
    } else { $source=ReadPath 'Completed SHOP extraction folder (with typed-shop-source-report.json)' }
    $ledger=Join-Path $homePath 'source-image-ledger.json'
    if (-not (Test-Path -LiteralPath $ledger -PathType Leaf)) {
        throw "Move or copy the existing verified source-image-ledger.json to $ledger first. Never overwrite an existing ledger."
    }
    $out=Join-Path $homePath ((Split-Path -Leaf $source)+'-publication')
    $work=Join-Path (Join-Path $homePath '.work') ('shop-publish-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $env:TEMP=$work
    $env:TMP=$work
    $snapshot=Invoke-RestMethod -Uri 'https://api.github.com/repos/DreamwishWand/Wand/commits/main' -Headers @{'User-Agent'='DreamwishWand-SRC04'} -TimeoutSec 60
    if ($snapshot.sha -notmatch '^[a-f0-9]{40}$') { throw 'Unable to resolve merged main commit.' }
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/'+$snapshot.sha+'/'
    $names=@('project_typed_shop_source_release.py','project_shop_source_release.py','shared_source_delta.py','bundle_thumbnails.py','extract_memory_sources.py','extract_story_puzzle_sources.py','resolve_shop_catalog.py','publish_bundle_thumbnails.py','publish_memory_sources.py','publish_recovered_map_parts.py','source_image_ledger.py','item_cdn_ledger.py','resolve_shop_objects.py','migrate_item_thumbnails_256.py','verify_source_cdn.py','publish_world_map_parts.py','recover_world_map_parts.py','recover_public_map_parts.py','stage_media_v2.py','plan_media_update.py','native_cdn_curl.py','audit_native_map_cdn.py')
    $i=0
    foreach ($name in $names) {
        $i++
        Write-Host "Dependency $i/$($names.Count): $name"
        $url=$base+'tools/src-04-r2/'+$name
        try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile (Join-Path $work $name) -TimeoutSec 60 }
        catch { throw ('Dependency download failed: '+$url+' ; '+$_.Exception.Message) }
    }
    $catalog=Join-Path $work 'premium-bundles-public.json'
    Invoke-WebRequest -UseBasicParsing -Uri ($base+'data/ddv/item-master/premium-bundles-public.json') -OutFile $catalog -TimeoutSec 60
    $script=Join-Path $work 'project_typed_shop_source_release.py'
    $argsCommon=@('--catalog',$catalog,'--source',$source,'--ledger',$ledger,'--out',$out)
    if ($mode -eq 'PLAN') {
        Run (@($script,'plan')+$argsCommon)
    } else {
        $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
        $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
        $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
        Run (@($script,'publish')+$argsCommon)
    }
    Write-Host "Publication workspace: $out"
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
