@echo off
title AutoCast Deinstallieren

echo.
echo  ======================================
echo   AutoCast Deinstallieren
echo  ======================================
echo.

set "TARGET=%APPDATA%\Adobe\CEP\extensions\AutoCast"

if exist "%TARGET%" (
    rmdir /s /q "%TARGET%"
    echo  [OK] AutoCast wurde entfernt.
) else (
    echo  AutoCast ist nicht installiert.
)

echo.
echo  Debug-Modus deaktivieren?
echo  (Nur noetig wenn du keine anderen Premiere-Plugins im Debug-Modus nutzt)
echo.
set /p RESET_DEBUG="  Deaktivieren? (j/n): "

if /i "%RESET_DEBUG%"=="j" (
    reg delete "HKCU\SOFTWARE\Adobe\CSXS.11" /v PlayerDebugMode /f >nul 2>&1
    reg delete "HKCU\SOFTWARE\Adobe\CSXS.12" /v PlayerDebugMode /f >nul 2>&1
    reg delete "HKCU\SOFTWARE\Adobe\CSXS.13" /v PlayerDebugMode /f >nul 2>&1
    echo  [OK] Debug-Modus deaktiviert.
) else (
    echo  Debug-Modus bleibt aktiv.
)

echo.
echo  Bitte Premiere Pro neustarten.
echo.
pause
