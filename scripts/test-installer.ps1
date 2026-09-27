param([string]$Installer = './release/RockLea-Setup.exe', [string]$PreviousInstaller = '')
$ErrorActionPreference = 'Stop'
$testInstallPath = Join-Path $env:RUNNER_TEMP 'RockLeaInstallTest'
$testDataPath = Join-Path $env:RUNNER_TEMP 'RockLeaUpgradeData'
New-Item -ItemType Directory -Force -Path $testDataPath | Out-Null
$env:ROCKLEA_DATA_DIR = $testDataPath
$sentinel = Join-Path $testDataPath 'upgrade-sentinel.txt'
Set-Content -LiteralPath $sentinel -Value 'Preserve user data across upgrades'
$legacy = Start-Process -FilePath './release/RLStatsCollector-Setup.exe' -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=autostart',('/DIR="' + $testInstallPath + '"')) -WindowStyle Hidden -Wait -PassThru
if ($legacy.ExitCode -ne 0) { throw 'Legacy layout installation failed.' }
if ($PreviousInstaller) {
  $previous = Start-Process -FilePath $PreviousInstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $testInstallPath + '"')) -WindowStyle Hidden -Wait -PassThru
  if ($previous.ExitCode -ne 0) { throw '0.3.0 installer failed.' }
  if ((Get-Item (Join-Path $testInstallPath 'RockLea.exe')).VersionInfo.FileVersion -ne '0.3.0.0') { throw 'Previous application must be 0.3.0.' }
  pnpm exec tsx scripts/upgrade-probe.ts seed (Join-Path $testInstallPath 'runtime/app') $testDataPath
  if ($LASTEXITCODE -ne 0) { throw 'Old schema seed failed.' }
}
for ($pass = 0; $pass -lt 2; $pass++) {
  $setupProcess = Start-Process -FilePath $Installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=autostart',('/DIR="' + $testInstallPath + '"')) -WindowStyle Hidden -Wait -PassThru
  if ($setupProcess.ExitCode -ne 0) { throw 'Installer or upgrade failed.' }
  if ($PreviousInstaller) {
    pnpm exec tsx scripts/upgrade-probe.ts verify (Join-Path $testInstallPath 'runtime/app') $testDataPath
    if ($LASTEXITCODE -ne 0) { throw '0.3.0 data upgrade failed.' }
  }
  $smoke = Start-Process -FilePath (Join-Path $testInstallPath 'RockLea.exe') -ArgumentList '--smoke' -WindowStyle Hidden -Wait -PassThru
  if ($smoke.ExitCode -ne 0) {
    Push-Location (Join-Path $testInstallPath 'runtime/app')
    try { & (Join-Path $testInstallPath 'runtime/node.exe') 'dist/apps/host/smoke.js' } finally { Pop-Location }
    throw 'Installed application smoke test failed.'
  }
  if ((Get-Content -LiteralPath $sentinel) -ne 'Preserve user data across upgrades') { throw 'User data changed during upgrade.' }
}
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (!(Get-ItemProperty -LiteralPath $runKey -Name RockLea -ErrorAction SilentlyContinue)) { throw 'Installer autostart task was not applied.' }
$disableAutostart = Start-Process -FilePath (Join-Path $testInstallPath 'RockLea.exe') -ArgumentList '--no-autostart' -WindowStyle Hidden -Wait -PassThru
if ($disableAutostart.ExitCode -ne 0 -or (Get-ItemProperty -LiteralPath $runKey -Name RockLea -ErrorAction SilentlyContinue)) { throw 'Autostart removal failed.' }
$uninstall = Start-Process -FilePath (Join-Path $testInstallPath 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait -PassThru
if ($uninstall.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sentinel)) { throw 'Uninstall did not preserve user data.' }
Write-Output 'Install, packaged startup, repeat upgrade and uninstall data preservation passed.'
