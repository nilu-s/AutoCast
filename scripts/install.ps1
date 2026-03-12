<# 
    AutoCast – Windows Install Script
    
    Installiert das AutoCast Plugin direkt in Premiere Pro.
    Führe dieses Script als Administrator aus (Rechtsklick → "Als Administrator ausführen")
    
    Usage: Right-Click → "Run with PowerShell" oder:
           powershell -ExecutionPolicy Bypass -File install.ps1
#>

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AutoCast Installer v1.0 (Beta)       " -ForegroundColor Cyan
Write-Host "  Premiere Pro Podcast Auto-Cutting     " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# --- 1. Determine source path ---
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Split-Path -Parent $scriptDir  # Parent of scripts/ = AutoCast root

# Verify it's the right folder
if (-not (Test-Path (Join-Path $sourceDir "CSXS\manifest.xml"))) {
    Write-Host "ERROR: Could not find CSXS/manifest.xml in $sourceDir" -ForegroundColor Red
    Write-Host "Make sure this script is in the AutoCast/scripts/ folder." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/3] Source: $sourceDir" -ForegroundColor Gray

# --- 2. Enable unsigned CEP extensions ---
Write-Host "[2/3] Enabling unsigned CEP extensions..." -ForegroundColor Yellow

# Try multiple CSXS versions (11 = CC2021+, 12 = CC2024+)
$csxsVersions = @("11", "12", "13")
foreach ($ver in $csxsVersions) {
    $regPath = "HKCU:\SOFTWARE\Adobe\CSXS.$ver"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -Type String -Force
    Write-Host "  Set PlayerDebugMode=1 for CSXS.$ver" -ForegroundColor DarkGray
}
Write-Host "  Done." -ForegroundColor Green

# --- 3. Copy to extensions directory ---
$extensionsDir = "$env:APPDATA\Adobe\CEP\extensions"
$targetDir = Join-Path $extensionsDir "AutoCast"

Write-Host "[3/3] Installing to: $targetDir" -ForegroundColor Yellow

# Create extensions directory if needed
if (-not (Test-Path $extensionsDir)) {
    New-Item -Path $extensionsDir -ItemType Directory -Force | Out-Null
}

# Remove old version if exists
if (Test-Path $targetDir) {
    Write-Host "  Removing previous version..." -ForegroundColor DarkGray
    Remove-Item -Path $targetDir -Recurse -Force
}

# Copy plugin files (exclude dev files)
$excludes = @(".git", "node_modules", "test", "scripts", ".debug", "*.md", ".gitignore")

# Use robocopy for reliable copying
$robocopyArgs = @(
    $sourceDir, 
    $targetDir, 
    "/E",           # Copy subdirectories including empty ones  
    "/XD", "test", "scripts", ".git", "node_modules", "test_data", "packages\\analyzer\\test",  # Exclude directories
    "/XF", "*.md", ".gitignore", ".debug",  # Exclude files
    "/NFL", "/NDL", "/NJH", "/NJS"  # Quiet output
)

& robocopy @robocopyArgs | Out-Null

# Also copy .debug for development
Copy-Item (Join-Path $sourceDir ".debug") $targetDir -Force -ErrorAction SilentlyContinue

Write-Host "  Copied plugin files." -ForegroundColor Green

# --- Done ---
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  Installation complete!                " -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. (Re)start Adobe Premiere Pro" -ForegroundColor White
Write-Host "  2. Go to: Window > Extensions > AutoCast" -ForegroundColor White
Write-Host ""
Write-Host "Installed to: $targetDir" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to exit"
