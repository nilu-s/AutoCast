@echo off
chcp 65001 >nul
title AutoCast Installer

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║   AutoCast Installer                  ║
echo  ║   Premiere Pro Podcast Auto-Ducking   ║
echo  ╚═══════════════════════════════════════╝
echo.
echo  Installiere AutoCast fuer Premiere Pro...
echo.

:: --- 1. Enable unsigned extensions ---
reg add "HKCU\SOFTWARE\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\SOFTWARE\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
echo  [OK] Premiere Erweiterungen aktiviert.

:: --- 2. Determine source (folder where this .bat lives) ---
set "SOURCE=%~dp0AutoCast"
if not exist "%SOURCE%\CSXS\manifest.xml" (
    set "SOURCE=%~dp0"
)
if not exist "%SOURCE%CSXS\manifest.xml" (
    echo.
    echo  FEHLER: Kann den AutoCast-Ordner nicht finden.
    echo  Stelle sicher dass diese Datei neben dem AutoCast-Ordner liegt.
    echo.
    pause
    exit /b 1
)

:: --- 3. Copy to extensions folder ---
set "TARGET=%APPDATA%\Adobe\CEP\extensions\AutoCast"

if exist "%TARGET%" (
    echo  Entferne alte Version...
    rmdir /s /q "%TARGET%" >nul 2>&1
)

mkdir "%TARGET%" >nul 2>&1
xcopy "%SOURCE%" "%TARGET%" /E /I /Q /Y >nul 2>&1

echo  [OK] Plugin installiert.

:: --- Done ---
echo.
echo  ═══════════════════════════════════════
echo.
echo    Installation erfolgreich!
echo.
echo    So gehts weiter:
echo      1. Premiere Pro starten (oder neustarten)
echo      2. Oben im Menue: Fenster ^> Erweiterungen ^> AutoCast
echo.
echo  ═══════════════════════════════════════
echo.
pause
