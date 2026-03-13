<#
    AutoCast - Windows Install Script
    Installs AutoCast into Premiere Pro CEP extensions.

    Usage:
      powershell -ExecutionPolicy Bypass -File install.ps1
#>

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  AutoCast Installer v2.2.0" -ForegroundColor Cyan
Write-Host "  Premiere Pro Podcast Auto-Cutting" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# 1) Determine source path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Split-Path -Parent $scriptDir

if (-not (Test-Path (Join-Path $sourceDir "CSXS\manifest.xml"))) {
    Write-Host "ERROR: Could not find CSXS\manifest.xml in $sourceDir" -ForegroundColor Red
    Write-Host "Make sure this script is in AutoCast\scripts\." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/3] Source: $sourceDir" -ForegroundColor Gray

# 2) Enable unsigned CEP extensions
Write-Host "[2/3] Enabling unsigned CEP extensions..." -ForegroundColor Yellow

foreach ($ver in @("11", "12", "13")) {
    $regPath = "HKCU:\SOFTWARE\Adobe\CSXS.$ver"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -Type String -Force
    Write-Host "  Set PlayerDebugMode=1 for CSXS.$ver" -ForegroundColor DarkGray
}
Write-Host "  Done." -ForegroundColor Green

# 3) Copy plugin files
$extensionsDir = "$env:APPDATA\Adobe\CEP\extensions"
$targetDir = Join-Path $extensionsDir "AutoCast"

Write-Host "[3/3] Installing to: $targetDir" -ForegroundColor Yellow

if (-not (Test-Path $extensionsDir)) {
    New-Item -Path $extensionsDir -ItemType Directory -Force | Out-Null
}

if (Test-Path $targetDir) {
    Write-Host "  Removing previous version..." -ForegroundColor DarkGray
    Remove-Item -Path $targetDir -Recurse -Force
}

$robocopyArgs = @(
    $sourceDir,
    $targetDir,
    "/E",
    "/XD", "test", "scripts", ".git", "node_modules", "test_data", "packages\analyzer\test", "_tmp_case_*",
    "/XF", "*.md", ".gitignore", ".debug", "_tmp_*.json", "temp_analyzer_debug.js", "analysis_debug.json", "*.wav",
    "/NFL", "/NDL", "/NJH", "/NJS"
)

& robocopy @robocopyArgs | Out-Null
Copy-Item (Join-Path $sourceDir ".debug") $targetDir -Force -ErrorAction SilentlyContinue

Write-Host "  Copied plugin files." -ForegroundColor Green

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  Installation complete" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Restart Adobe Premiere Pro" -ForegroundColor White
Write-Host "  2. Open: Window > Extensions > AutoCast" -ForegroundColor White
Write-Host ""
Write-Host "Installed to: $targetDir" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to exit"
