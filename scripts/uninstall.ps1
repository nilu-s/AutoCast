<#
    AutoCast – Uninstall Script (Windows)
    Removes AutoCast from Premiere Pro extensions.
#>

Write-Host ""
Write-Host "AutoCast – Uninstaller" -ForegroundColor Yellow
Write-Host ""

$targetDir = "$env:APPDATA\Adobe\CEP\extensions\AutoCast"

if (Test-Path $targetDir) {
    Remove-Item -Path $targetDir -Recurse -Force
    Write-Host "Removed: $targetDir" -ForegroundColor Green
} else {
    Write-Host "AutoCast is not installed." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Restart Premiere Pro to complete uninstallation." -ForegroundColor White
Read-Host "Press Enter to exit"
