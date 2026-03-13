<#
    AutoCast - Windows Uninstall Script
    Removes AutoCast from Premiere Pro CEP extensions.
#>

Write-Host ""
Write-Host "AutoCast Uninstaller" -ForegroundColor Yellow
Write-Host ""

$targetDir = "$env:APPDATA\Adobe\CEP\extensions\AutoCast"

if (Test-Path $targetDir) {
    Remove-Item -Path $targetDir -Recurse -Force
    Write-Host "Removed: $targetDir" -ForegroundColor Green
} else {
    Write-Host "AutoCast is not installed." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Disable CEP debug mode as well? (only if no other CEP plugins need it)" -ForegroundColor White
$disableDebug = Read-Host "Disable debug mode for CSXS 11/12/13? (y/n)"
if ($disableDebug -eq "y" -or $disableDebug -eq "Y") {
    foreach ($ver in @("11", "12", "13")) {
        $regPath = "HKCU:\SOFTWARE\Adobe\CSXS.$ver"
        if (Test-Path $regPath) {
            Remove-ItemProperty -Path $regPath -Name "PlayerDebugMode" -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Debug mode keys removed." -ForegroundColor Green
} else {
    Write-Host "Debug mode unchanged." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Restart Premiere Pro to complete uninstallation." -ForegroundColor White
Read-Host "Press Enter to exit"
