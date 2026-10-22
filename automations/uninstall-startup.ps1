# TabBox Social Media Automation — Uninstaller

$ErrorActionPreference = "SilentlyContinue"

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "TabBoxSocial.lnk"

if (Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
  Write-Host "Removed Startup shortcut: $shortcutPath" -ForegroundColor Green
}

Unregister-ScheduledTask -TaskName "TabBoxSocialRadar" -Confirm:$false
Write-Host "Unregistered Scheduled Task: TabBoxSocialRadar" -ForegroundColor Green

Write-Host "TabBox Social Automation has been removed from startup." -ForegroundColor Cyan
