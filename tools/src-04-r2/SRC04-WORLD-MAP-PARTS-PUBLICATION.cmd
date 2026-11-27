@echo off
setlocal EnableExtensions
set "SRC04_LAUNCHER=%~f0"
powershell.exe -NoProfile -STA -Command "$raw=Get-Content -LiteralPath $env:SRC04_LAUNCHER -Raw; $payload=($raw -split '(?m)^# __POWERSHELL_PAYLOAD__\r?$',2)[1]; & ([scriptblock]::Create($payload))"
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
    Add-Type -AssemblyName System.Windows.Forms
    $root=Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
    if (-not (Test-Path -LiteralPath $root)) { $root=[Environment]::GetFolderPath('MyDocuments') }
    Write-Host 'SRC-04 native map part publication - existing original WebP only.'
    Write-Host 'Select the repair@3 report for the 10 native maps (not the ocean candidate report).'
    $dialog=New-Object System.Windows.Forms.OpenFileDialog
    $dialog.InitialDirectory=$root
    $dialog.Filter='JSON report (*.json)|*.json'
    $dialog.Title='Select existing world map repair report'
    try {
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
        $report=$dialog.FileName
    } finally { $dialog.Dispose() }
    $doc=Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($doc.schema -cne 'wand.src04.world-map-repair@3' -or $doc.gameVersion -cne '1.26.2' -or $doc.publicationAuthorized -ne $false -or @($doc.worlds).Count -ne 10) { throw 'Unexpected report. Use the existing Steam 1.26.2 repair@3 report with 10 maps.' }
    $first=@($doc.worlds[0].parts)[0].imagePath
    if ($first -cnotmatch '^images/maps/original/[a-f0-9]{2}/[a-f0-9]{64}\.webp$') { throw 'Unexpected original path.' }
    $source=$null
    $parent=Split-Path -Parent $report
    foreach ($path in @($parent,(Split-Path -Parent $parent),$root,(Join-Path $root 'shared-ui-media'),(Join-Path $root 'map-media'))) {
        if ((Test-Path -LiteralPath (Join-Path $path $first) -PathType Leaf)) { $source=$path; break }
    }
    if (-not $source) {
        Write-Host 'Select the folder CONTAINING images\maps\original, not the original folder itself.'
        $folder=New-Object System.Windows.Forms.FolderBrowserDialog
        $folder.Description='Select source root containing images\maps\original'
        $folder.SelectedPath=$root
        try {
            if ($folder.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
            $source=$folder.SelectedPath
        } finally { $folder.Dispose() }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $source $first) -PathType Leaf)) { throw 'Original source not found at the selected root.' }
    $out=Join-Path $source 'world-map-parts-publication'
    $work=Join-Path $env:TEMP ('wand-world-map-parts-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/3d75d6fb36b3105c1b58326fb37415ce59a2e59c/tools/src-04-r2/'
    foreach ($name in @('publish_world_map_parts.py','publish_bundle_thumbnails.py','bundle_thumbnails.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $script=Join-Path $work 'publish_world_map_parts.py'
    $argsCommon=@('--report',$report,'--source-root',$source,'--out',$out)
    Write-Host 'No image generation, overwrite, remote copy, delete or private bucket operations.'
    Write-Host "Report: $report"
    Write-Host "Source: $source"
    Write-Host "Output: $out"
    & py -3 -u $script @argsCommon
    if ($LASTEXITCODE -ne 0) { throw 'Local original validation failed.' }
    if ((Read-Host 'Type R2 for public inventory and optional upload; anything else stops here') -cne 'R2') { exit 0 }
    $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
    $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
    $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
    Write-Host 'Hard limit: 109 new original objects and 512 MiB. The actual plan is shown before any upload.'
    & py -3 -u $script @argsCommon --r2 --max-new-objects 109 --max-new-bytes 536870912
    $result=$LASTEXITCODE
    Write-Host "Output directory: $out"
    if ($result -eq 0) { Write-Host 'If uploaded, return world-map-parts-release.json and world-map-parts-receipt.json.' }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
