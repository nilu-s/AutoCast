@echo off
setlocal
set "ROOT=%~dp0"
set "SCRIPT=%ROOT%scripts\install.ps1"

if not exist "%SCRIPT%" (
    echo ERROR: %SCRIPT% not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
exit /b %ERRORLEVEL%
