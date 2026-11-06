#Requires -Version 5.1
<#
.SYNOPSIS
  Capture genuine Android screenshots via ADB into play-store-assets/screenshots.

.DESCRIPTION
  Does not build APK/AAB or modify the app. Requires a connected emulator/device.
  Navigate the app to the correct screen, then press Enter for each shot.

.EXAMPLE
  .\capture-adb-screenshots.ps1
.EXAMPLE
  .\capture-adb-screenshots.ps1 -AdbPath "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
#>
param(
  [string]$AdbPath = "",
  [string]$OutDir = "",
  [switch]$SetWmSize
)

$ErrorActionPreference = "Stop"

if (-not $OutDir) {
  $OutDir = Join-Path $PSScriptRoot "screenshots"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$candidates = @(
  $AdbPath,
  "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  "$env:ANDROID_HOME\platform-tools\adb.exe",
  "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
  "$env:TEMP\platform-tools\adb.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$adb = $candidates | Select-Object -First 1
if (-not $adb) {
  Write-Error "adb not found. Install Android SDK platform-tools or pass -AdbPath."
}

Write-Host "Using ADB: $adb"
$devices = & $adb devices | Where-Object { $_ -match "`tdevice$" }
if (-not $devices) {
  Write-Host "No device/emulator in 'device' state."
  Write-Host "Start an AVD or connect a phone with USB debugging, then re-run."
  & $adb devices -l
  exit 2
}

Write-Host "Connected:"
$devices | ForEach-Object { Write-Host "  $_" }

if ($SetWmSize) {
  Write-Host "Setting wm size 1080x1920 (emulator/dev builds)..."
  & $adb shell wm size 1080x1920
}

$shots = @(
  @{ File = "01-student-home-1080x1920.png"; Title = "Student Home (/(tabs)/home)" },
  @{ File = "02-listen-learn-1080x1920.png"; Title = "Listen and Learn (Listen activity)" },
  @{ File = "03-spelling-practice-1080x1920.png"; Title = "Spelling Practice (Spell activity)" },
  @{ File = "04-rewards-progress-1080x1920.png"; Title = "Rewards and Progress (/(tabs)/rewards)" },
  @{ File = "05-parent-dashboard-1080x1920.png"; Title = "Parent Dashboard (/parent)" }
)

Write-Host ""
Write-Host "Login with local demo: parent@littlereaders.test / ParentDemo1"
Write-Host "Hide passwords, OTPs, and any real PII before each capture."
Write-Host ""

foreach ($shot in $shots) {
  Write-Host (">>> Navigate to: {0}" -f $shot.Title)
  Read-Host "Press Enter when the screen is ready (or Ctrl+C to abort)"
  $dest = Join-Path $OutDir $shot.File
  $raw = & $adb exec-out screencap -p
  [System.IO.File]::WriteAllBytes($dest, $raw)
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($dest)
  Write-Host ("Saved {0} ({1}x{2}, {3:N0} bytes)" -f $shot.File, $img.Width, $img.Height, (Get-Item -LiteralPath $dest).Length)
  if ($img.Width -ne 1080 -or $img.Height -ne 1920) {
    Write-Host "NOTE: Not exactly 1080x1920 - crop/resize before Play upload if needed."
  }
  $img.Dispose()
}

Write-Host ""
Write-Host ("Done. Files in: {0}" -f $OutDir)
