# TabBox Social Media Automation — Windows Startup & 4-Hour Scheduler Installer

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $scriptDir "tabbox-social.bat"
$nodePath = (Get-Command node).Source

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   INSTALLING TABBOX SOCIAL AUTOMATION (STARTUP + 4-HOUR CRON)  " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Place shortcut in Windows Startup folder (runs on login)
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "TabBoxSocial.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $batPath
$Shortcut.WorkingDirectory = $scriptDir
$Shortcut.Description = "TabBox Social Automation & Reddit Radar"
$Shortcut.Save()

Write-Host "✅ [1/2] Created Windows Startup Shortcut:" -ForegroundColor Green
Write-Host "    $shortcutPath" -ForegroundColor Gray
Write-Host "    (Will launch automatically whenever you log into your computer)" -ForegroundColor Gray
Write-Host ""

# 2. Register Windows Scheduled Task (repeats every 4 hours)
$taskName = "TabBoxSocialRadar"
try {
  # Unregister existing if present
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

  $action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $scriptDir
  $trigger = New-ScheduledTaskTrigger -AtLogon
  $repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 4)).Repetition
  $trigger.Repetition = $repetition

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "TabBox Social Media Daily Post & Reddit Radar (Repeats every 4 hours)" -ErrorAction SilentlyContinue

  Write-Host "✅ [2/2] Registered Windows Scheduled Task: '$taskName'" -ForegroundColor Green
  Write-Host "    Cadence: Runs at computer login and repeats every 4 hours." -ForegroundColor Gray
} catch {
  Write-Host "⚠️ Scheduled Task registration skipped (requires standard privileges). Startup shortcut will handle login execution!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "🎉 INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "You can test-run it immediately by typing:" -ForegroundColor Yellow
Write-Host "   npm run social" -ForegroundColor White
Write-Host "or double-clicking:" -ForegroundColor Yellow
Write-Host "   automations\tabbox-social.bat" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
