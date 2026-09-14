$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupRoot = Join-Path $projectRoot 'backups\pre-expert-update-20260806-170203'
$desktopRoot = [Environment]::GetFolderPath('Desktop')

$restoreMap = @(
    @{ Source = Join-Path $backupRoot 'src\dashboard.js'; Destination = Join-Path $projectRoot 'src\dashboard.js' },
    @{ Source = Join-Path $backupRoot 'src\dashboard.css'; Destination = Join-Path $projectRoot 'src\dashboard.css' },
    @{ Source = Join-Path $backupRoot 'src\dashboard.html'; Destination = Join-Path $projectRoot 'src\dashboard.html' },
    @{ Source = Join-Path $backupRoot 'build-html-report.mjs'; Destination = Join-Path $projectRoot 'build-html-report.mjs' },
    @{ Source = Join-Path $backupRoot 'Daily Report Dashboard - Enhanced.html'; Destination = Join-Path $projectRoot 'dist\Daily Report Dashboard - Enhanced.html' },
    @{ Source = Join-Path $backupRoot 'Daily Report Dashboard - Enhanced.html'; Destination = Join-Path $desktopRoot 'Daily Report Dashboard - Enhanced.html' },
    @{ Source = Join-Path $backupRoot 'Daily Report Dashboard - Daily Report Data Synced.html'; Destination = Join-Path $desktopRoot 'Daily Report Dashboard - Daily Report Data Synced.html' }
)

foreach ($entry in $restoreMap) {
    if (-not (Test-Path -LiteralPath $entry.Source)) {
        throw "Rollback backup is incomplete. Missing: $($entry.Source)"
    }
}

foreach ($entry in $restoreMap) {
    Copy-Item -LiteralPath $entry.Source -Destination $entry.Destination -Force
}

Write-Host 'Dashboard restored to the pre-expert-update version.'
Write-Host "Backup retained at: $backupRoot"
