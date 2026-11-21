@echo off
setlocal
set "SRC04_RUNNER=%TEMP%\DreamwishWand_SRC04_start.ps1"
echo Downloading the current SRC-04 MEDIA launcher from the Wand development branch...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/DreamwishWand/Wand/src-04-media-windows-tool/tools/src-04-media/start.ps1' -OutFile '%SRC04_RUNNER%'; & '%SRC04_RUNNER%'"
if errorlevel 1 (
  echo SRC-04 stopped with an error. No game files were modified.
) else (
  echo SRC-04 local processing completed.
)
pause
