@echo off
setlocal
set "SRC04_RUNNER=%TEMP%\DreamwishWand_SRC04_start.ps1"
echo Downloading the SRC-04 MEDIA single-source bundle...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $path='%SRC04_RUNNER%'; $uri='https://raw.githubusercontent.com/DreamwishWand/Wand/src-04-media-windows-tool/tools/src-04-media/start.ps1?rev=8108a832c81d26f32670797b324e1a4a2f111b48'; try { Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $path } catch { Write-Host 'Raw download failed; trying the public GitHub contents API...' }; $valid=(Test-Path $path) -and [bool](Select-String -LiteralPath $path -SimpleMatch 'SRC-04: installing pinned source bundle' -Quiet); if(-not $valid){ $api='https://api.github.com/repos/DreamwishWand/Wand/contents/tools/src-04-media/start.ps1?ref=src-04-media-windows-tool'; $json=Invoke-RestMethod -Uri $api -Headers @{'User-Agent'='DreamwishWand-SRC04'}; if($json.encoding -ne 'base64'){ throw 'Unexpected GitHub API response' }; $source=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(($json.content -replace '\s',''))); [System.IO.File]::WriteAllText($path,$source,(New-Object System.Text.UTF8Encoding($false))); $valid=[bool](Select-String -LiteralPath $path -SimpleMatch 'SRC-04: installing pinned source bundle' -Quiet) }; if(-not $valid){throw 'Verified SRC-04 launcher not found; refuse to run outdated code'}; & $path; if($LASTEXITCODE -and $LASTEXITCODE -ne 0){ exit $LASTEXITCODE }"
if errorlevel 1 (
  echo SRC-04 stopped with an error. No game files were modified.
) else (
  echo SRC-04 local processing completed.
)
pause
