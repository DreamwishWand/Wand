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
            foreach ($name in @('SteamPath','InstallPath')) {
                if ($v.$name) { $steamRoots+=$v.$name.Replace('/','\') }
            }
        }
    }
    if ($env:ProgramFiles) { $steamRoots+=(Join-Path $env:ProgramFiles 'Steam') }
    if ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) { $steamRoots+=(Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Steam') }
    $libraries=@($steamRoots)
    foreach ($steam in @($steamRoots | Select-Object -Unique)) {
        $vdf=Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf) {
            $raw=Get-Content -LiteralPath $vdf -Raw
            foreach ($m in [regex]::Matches($raw,'(?m)^\s*"path"\s*"([^"]+)"')) {
                $libraries+=$m.Groups[1].Value.Replace('\\','\')
            }
        }
    }
    foreach ($lib in @($libraries | Select-Object -Unique)) {
        $game=Join-Path $lib 'steamapps\common\Disney Dreamlight Valley'
        $marker=Join-Path $game 'FullVersion.txt'
        $aa=Join-Path $game 'ddv_Data\StreamingAssets\aa'
        if ((Test-Path -LiteralPath $marker) -and (Test-Path -LiteralPath (Join-Path $aa 'catalog.entryData.bin'))) {
            $version=(Get-Content -LiteralPath $marker -Raw).Trim()
            if ($version -match '(?:^|-)v1\.26\.2(?:-|$)') { return $aa }
            Write-Host "Found a different Steam version: $version"
        }
    }
    return $null
}
try {
    $out=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DreamwishWand\WorldMapParts'
    $work=Join-Path $env:TEMP ('wand-world-map-parts-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work,$out -Force | Out-Null
    $base='https://raw.githubusercontent.com/DreamwishWand/Wand/e15c318b1eed90e179a40a5afa9993d44a2c5822/tools/src-04-r2/'
    foreach ($name in @('world-map-source-steam-1.26.2.json','recover_world_map_parts.py','publish_world_map_parts.py','publish_bundle_thumbnails.py','bundle_thumbnails.py','resolve_shop_catalog.py','resolve_shop_objects.py','extract_memory_sources.py')) {
        Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile (Join-Path $work $name) -TimeoutSec 60
    }
    $report=Join-Path $work 'world-map-source-steam-1.26.2.json'
    $recover=Join-Path $work 'recover_world_map_parts.py'
    $publish=Join-Path $work 'publish_world_map_parts.py'
    $search=@('--report',$report,'--out',$out)
    $roots=@([Environment]::GetFolderPath('MyDocuments'),[Environment]::GetFolderPath('DesktopDirectory'),(Join-Path $env:USERPROFILE 'Downloads'),$env:OneDrive,$env:OneDriveConsumer,$env:OneDriveCommercial)
    foreach ($root in @($roots | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique)) {
        $search+=@('--search',$root)
    }
    Write-Host 'Automatic recovery of 109 native map parts. No report or folder selection.'
    & py -3 -u $recover @search
    $result=$LASTEXITCODE
    if ($result -eq 3) {
        $aa=FindGame
        if (-not $aa) { throw 'Missing originals and matching Steam 1.26.2 installation not detected. Existing recovered files remain saved. No R2 changes.' }
        & py -3 -c "import UnityPy; from PIL import features; assert features.check('webp')"
        if ($LASTEXITCODE -ne 0) { throw 'Existing Python environment needs UnityPy and Pillow WebP support.' }
        & py -3 -u $recover --report $report --out $out --aa $aa
        $result=$LASTEXITCODE
    }
    if ($result -ne 0) { throw 'Original verification failed. No R2 changes.' }
    $pubOut=Join-Path $out 'publication'
    $common=@('--report',$report,'--source-root',$out,'--out',$pubOut)
    & py -3 -u $publish @common
    if ($LASTEXITCODE -ne 0) { throw 'Local publication plan failed.' }
    if ((Read-Host 'Type R2 for public inventory and optional upload; anything else stops here') -cne 'R2') { exit 0 }
    $env:R2_ACCOUNT_ID=Read-Host 'R2 account ID'
    $env:AWS_ACCESS_KEY_ID=ReadSecret 'Public bucket access key ID'
    $env:AWS_SECRET_ACCESS_KEY=ReadSecret 'Public bucket secret access key'
    & py -3 -u $publish @common --r2 --max-new-objects 109 --max-new-bytes 536870912
    $result=$LASTEXITCODE
    Write-Host "Output directory: $pubOut"
    if ($result -eq 0) { Write-Host 'If uploaded, return world-map-parts-release.json and world-map-parts-receipt.json.' }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:R2_ACCOUNT_ID,Env:AWS_ACCESS_KEY_ID,Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
