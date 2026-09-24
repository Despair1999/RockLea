param([string]$Installer = './release/RockLea-Setup.exe')
$ErrorActionPreference = 'Stop'
$testInstallPath = Join-Path $env:RUNNER_TEMP 'RockLeaInstallTest'
$testDataPath = Join-Path $env:RUNNER_TEMP 'RockLeaUpgradeData'
New-Item -ItemType Directory -Force -Path $testDataPath | Out-Null
$env:ROCKLEA_DATA_DIR = $testDataPath
$sentinel = Join-Path $testDataPath 'upgrade-sentinel.txt'
Set-Content -LiteralPath $sentinel -Value 'Preserve user data across upgrades'
$legacy = Start-Process -FilePath './release/RLStatsCollector-Setup.exe' -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $testInstallPath + '"')) -WindowStyle Hidden -Wait -PassThru
if ($legacy.ExitCode -ne 0) { throw 'Legacy layout installation failed.' }
for ($pass = 0; $pass -lt 2; $pass++) {
  $setupProcess = Start-Process -FilePath $Installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="' + $testInstallPath + '"')) -WindowStyle Hidden -Wait -PassThru
  if ($setupProcess.ExitCode -ne 0) { throw 'Installer or upgrade failed.' }
  $smoke = Start-Process -FilePath (Join-Path $testInstallPath 'RockLea.exe') -ArgumentList '--smoke' -WindowStyle Hidden -Wait -PassThru
  if ($smoke.ExitCode -ne 0) { throw 'Installed application smoke test failed.' }
  if ((Get-Content -LiteralPath $sentinel) -ne 'Preserve user data across upgrades') { throw 'User data changed during upgrade.' }
}
$uninstall = Start-Process -FilePath (Join-Path $testInstallPath 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait -PassThru
if ($uninstall.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sentinel)) { throw 'Uninstall did not preserve user data.' }
Write-Output 'Install, packaged startup, repeat upgrade and uninstall data preservation passed.'
