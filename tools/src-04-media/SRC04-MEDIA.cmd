@echo off
setlocal
set "SRC04_SCRIPT=%TEMP%\DreamwishWand_SRC04_ASCII_20261121.ps1"
echo Downloading the verified ASCII-only SRC-04 MEDIA launcher...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $path='%SRC04_SCRIPT%'; $ref='df4af61288a059bf411652a8e0693db17f53dc83'; $api='https://api.github.com/repos/DreamwishWand/Wand/contents/tools/src-04-media/start.ps1?ref='+$ref; try { $doc=Invoke-RestMethod -Uri $api -Headers @{'User-Agent'='DreamwishWand-SRC04'}; if($doc.encoding -ne 'base64'){throw 'Unexpected GitHub response'}; [IO.File]::WriteAllBytes($path,[Convert]::FromBase64String(($doc.content -replace '\s',''))) } catch { Write-Host 'GitHub API unavailable; using commit-pinned Raw endpoint...'; Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/DreamwishWand/Wand/'+$ref+'/tools/src-04-media/start.ps1') -OutFile $path }; $script=[IO.File]::ReadAllText($path,[Text.Encoding]::ASCII); if(-not $script.Contains('ASCII-only PowerShell 5.1-compatible launcher')){throw 'Launcher version check failed; refusing to execute stale source'}; if($script.ToCharArray() | Where-Object { [int]$_ -gt 127 } | Select-Object -First 1){throw 'Non-ASCII launcher content was received'}; & $path; if(-not $?){exit 1}"
if errorlevel 1 (
  echo SRC-04 stopped. No game files were modified.
) else (
  echo SRC-04 local processing completed.
)
pause
