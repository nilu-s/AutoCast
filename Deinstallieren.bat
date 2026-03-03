@echo off
title AutoCast Deinstallieren

echo.
echo  AutoCast wird deinstalliert...
echo.

set "TARGET=%APPDATA%\Adobe\CEP\extensions\AutoCast"

if exist "%TARGET%" (
    rmdir /s /q "%TARGET%"
    echo  [OK] AutoCast wurde entfernt.
) else (
    echo  AutoCast ist nicht installiert.
)

echo.
echo  Bitte Premiere Pro neustarten.
echo.
pause
