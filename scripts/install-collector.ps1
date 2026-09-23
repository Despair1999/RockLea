param([string]$Source = (Join-Path $PSScriptRoot '..\release\RLStatsCollector.exe'))
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\RockLea'
New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
$targetExecutable = Join-Path $installDirectory 'RLStatsCollector.exe'
Copy-Item -LiteralPath $sourcePath -Destination $targetExecutable -Force
& $targetExecutable --setup
if ($LASTEXITCODE -ne 0) { throw 'Collector-Setup fehlgeschlagen.' }
