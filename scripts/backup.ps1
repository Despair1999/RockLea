param([string]$Directory = './data/backups', [int]$RetentionDays = 30)
$ErrorActionPreference = 'Stop'
if ($RetentionDays -lt 1) { throw 'RetentionDays muss positiv sein.' }
New-Item -ItemType Directory -Path $Directory -Force | Out-Null
$backupRoot = (Resolve-Path -LiteralPath $Directory).Path
$name = 'rocklea-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
# Export inside the container first: PowerShell redirection can corrupt binary dumps.
docker compose exec -T db pg_dump -U rocklea -d rocklea -Fc -f /tmp/rocklea.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump fehlgeschlagen.' }
docker compose cp db:/tmp/rocklea.dump (Join-Path $backupRoot $name)
if ($LASTEXITCODE -ne 0) { throw 'Backup-Kopie fehlgeschlagen.' }
Get-ChildItem -LiteralPath $backupRoot -File -Filter 'rocklea-*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | ForEach-Object {
  $candidate = $_.FullName
  if ((Split-Path -Parent $candidate) -ne $backupRoot) { throw 'Unerwarteter Backup-Pfad.' }
  Remove-Item -LiteralPath $candidate
}
Write-Output "Backup gespeichert: $(Join-Path $backupRoot $name)"
