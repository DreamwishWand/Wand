@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0stage_media_v2.py"
set "OUT=%USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2"
set "LOG=%OUT%\src04-r2-local-audit.log"
if not exist "%SCRIPT%" (
  echo Missing stage_media_v2.py in the same folder.
  pause
  exit /b 2
)
if not exist "%OUT%" (
  echo SRC-04 output folder is missing:
  echo %OUT%
  pause
  exit /b 2
)
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher "py" is unavailable.
  pause
  exit /b 2
)
echo SRC-04 v2 private media audit -- LOCAL ONLY; NO R2 UPLOAD
echo This checks all 19k lossless WebP files and their SHA-256 metadata.
py -3 "%SCRIPT%" --out "%OUT%" > "%LOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
type "%LOG%"
echo.
echo Result code: %EXIT_CODE%
echo Report: %OUT%\src04-r2-stage-report.json
echo Log:    %LOG%
echo.
pause
exit /b %EXIT_CODE%
