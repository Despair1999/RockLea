# Deployment und Backup

## Windows-App

RockLea-Setup.exe installiert das Programm getrennt von Benutzerdaten. Der Host startet drei unsichtbare Node-Hilfsprozesse, überwacht Zustände und versucht höchstens fünf Neustarts pro Komponente mit exponentiellen Abständen. Manuelles Neustarten setzt dieses Budget zurück. Ein nativer WinForms-Host bietet Tray und Status ohne Browser-Engine/Electron. Die mitgelieferte Node-Laufzeit und Produktion-Abhängigkeiten machen zusätzliche Entwicklertools überflüssig. .NET Framework 4.8 stammt aus Windows.

„Backup erstellen“ stoppt die Komponenten, kopiert lokale Daten nach `%LOCALAPPDATA%\RockLea\backups` und startet neu. Vor der ersten Datenbankmigration einer neuen Programmversion wird ebenfalls eine Kopie erstellt. Backups enthalten persönliche Daten und verschlüsselte Credentials; DPAPI ist an dasselbe Windows-Benutzerkonto gebunden. Wiederherstellen nur bei vollständig gestoppter App und nach Sicherung des aktuellen Standes.

## Separater Docker-Server (optional, für Administratoren)

Benötigt Docker Engine/Compose auf einem dauerhaft laufenden Host, PostgreSQL-Volume, DNS-Domain und ausgehende Discord-Verbindung. Ports 80 und 443 zeigen auf Caddy. Datenbank und interne Bot-Routen sind nicht öffentlich. Der Collector bleibt auf dem Gaming-PC.

1. Repository laden, `.env.example` nach `.env` kopieren.
2. Zufällige getrennte Werte für `INTERNAL_TOKEN` und `DB_PASSWORD` setzen (z. B. je 32 zufällige Bytes hex; Hex vermeidet URL-Escaping im Compose-DSN).
3. `PUBLIC_HOST=stats.example.com`, Discord Token/Client ID/Client Secret setzen.
4. Discord Redirect `https://stats.example.com/auth/callback` erlauben.
5. `docker compose up -d --build`.
6. `docker compose ps`, `docker compose logs --tail 100 backend bot` prüfen.
7. `/setup`, Mitglieder registrieren, Collector pairen, echtes Testmatch prüfen.

Backend und Dashboard werden zusammen gebaut und unter demselben Origin ausgeliefert; kein separater Node-Server für statische Frontend-Dateien. Compose führt Migrationen als separaten einmaligen Job aus. Datenbankmigrationen niemals parallel zu manuellen Schemaänderungen ausführen. Container laufen für App-Prozesse als unprivilegierter Node-Nutzer. Logrotation ist in Compose gesetzt.

Für Versionierung sind JS-Abhängigkeiten exakt im Lockfile fixiert. Docker-Basisimages sind auf unterstützte Major-Releases begrenzt, damit Sicherheits-Patches nachgezogen werden können; für eigene reproduzierbare Releases die geprüften Image-Digests im Deployment festschreiben.

## Backup

Unter Windows/PowerShell: `scripts/backup.ps1 -Directory ./data/backups -RetentionDays 30`. Es verwendet `pg_dump -Fc` im Container und `docker compose cp`, um binäre Dumps nicht durch ältere PowerShell-Redirection zu beschädigen. Backups enthalten personenbezogene Mitgliedsdaten; verschlüsselt und getrennt vom Host aufbewahren. Offsite-Kopie und Restore-Test sind Betreiberaufgaben.

Unter Linux:

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U rocklea -d rocklea -Fc > backups/rocklea.dump
```

Restore zuerst in **eine separate Testdatenbank**:

```sh
docker compose exec -T db createdb -U rocklea rocklea_restore_test
docker compose cp backups/rocklea.dump db:/tmp/restore.dump
docker compose exec -T db pg_restore -U rocklea -d rocklea_restore_test /tmp/restore.dump
```

Produktiven Restore nur bei gestoppten App-Prozessen und nach geprüftem Backup durchführen. Kein automatisches destruktives Restore-Skript enthalten.

PGlite-Entwicklungsbackup: Backend stoppen und das komplette `data/backend` kopieren. Das ist kein Ersatz für PostgreSQL-Produktivbackups. Collector-Offlinespeicher bei beendetem Collector sichern; Credentials sind an den Windows-Nutzer gebunden.

## Update

Backup erstellen, Release/Commit prüfen, `git pull --ff-only`, `docker compose up -d --build`, Health und erstes Match prüfen. Keine alten Migrationsdateien nachträglich ändern; neue durchnummerierte Dateien hinzufügen. Downgrades mit Schemaänderungen verlangen expliziten Restore-Plan.
