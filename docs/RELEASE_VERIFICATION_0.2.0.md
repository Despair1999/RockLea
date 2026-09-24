# Abnahmeprotokoll RockLea 0.2.0

## Lokaler Ausgangsstand

Der Desktop-Ordner `RockLea-main-Folder/RockLea-main` wurde vor Änderungen mit allen versionierten Dateien von `d997af29100e16fafd7f06f39f196c0a5380f88f` verglichen: keine Unterschiede, keine zusätzlichen Quelldateien. `main` und `origin/main` waren identisch. Ein zusätzlicher Sicherungs-Commit wäre leer gewesen und wurde deshalb nicht erstellt. Der Ausgangsstand war bereits auf GitHub gesichert.

Bewusst ausgeschlossen und unverändert: `.env`, `data`, `node_modules`, `dist`, `release`; keine Tokens, DPAPI-Dateien, SQLite-Datenbanken oder Logs committed. Fremde Arcadoryx-Dateien im anderen Workspace wurden nicht übernommen oder gelöscht.

## Phase A – Live-Parser

| Punkt                  | Ergebnis                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ursache                | Der ursprüngliche Envelope-Vertrag verlangte direkt ein Objekt in Data.                                                   |
| Tatsächlich beobachtet | Lokaler Stats-WebSocket lieferte Data als String; einmaliges JSON.parse ergab ein Objekt (u. a. UpdateState und BallHit). |
| Reparatur              | Objekt oder genau einmal JSON-kodiertes Objekt normalisieren; interne Record-Validierung bleibt streng.                   |
| Ungültige Formen       | null, Arrays, primitive Werte, fehlerhaftes JSON und doppelte Stringkodierung verworfen.                                  |
| Training               | 120 echte Training-Events mit korrigiertem Parser: 120 ohne MatchGuid, 0 Fehler, 0 Match-/Outbox-Projektionen.            |
| Privacy                | Kein Raw-Payload gespeichert; Typdiagnose enthält keine Spielernamen/IDs/Tokens.                                          |
| Regressionen           | Bestehende Whitelist-, Replay-, Referenz-, Endsnapshot- und Heartbeat-Tests erhalten.                                     |
| Neue Tests             | 38 Envelope-Tests; Phase A insgesamt 114 Tests und 17 PostgreSQL-Integrationstests bestanden.                             |
| Commit                 | `ae40894` – auf main gepusht.                                                                                             |

Dies belegt Training und automatisierte Match-Verarbeitung, kein abgeschlossenes reales Online-Match mit Discord-Endpost.

## Phase B – Windows-App

| Anforderung                 | Umsetzung                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architektur                 | Kleiner nativer WinForms-Host (.NET Framework aus Windows), mitgelieferte Node-Laufzeit und weiterverwendeter TypeScript-Code. Keine zusätzliche Browser-Engine. |
| Ein sichtbarer Einstieg     | RockLea.exe; Backend, Discord-Bot und Collector laufen als unsichtbare, überwachte Hilfsprozesse.                                                                |
| Komponenten-Lifecycle       | startBackend/startDiscordBot/startCollector liefern eigene stop-Funktionen. Entwicklerbefehle bleiben erhalten.                                                  |
| Hauptfenster und Tray       | Status, Dashboard, Logs, Neustart, Einstellungen, Backup, Autostart, Updates und Beenden. X minimiert in den Tray.                                               |
| Setup                       | Discord-Daten per Formular; Token/Client-ID-Zuordnung und Serverzugriff werden online geprüft. OAuth prüft anschließend den Client Secret.                       |
| Secrets                     | DPAPI/CurrentUser; INTERNAL_TOKEN kryptographisch generiert. Keine Klartext-Secrets in Logs oder zurückgesendeten Einstellungsdaten.                             |
| Alter .env-/Datenimport     | Ordnerauswahl; lokale PGlite-Datenbank wird kopiert, Config verschlüsselt, Originaldateien bleiben erhalten. Nur bei gestoppten Altprozessen.                    |
| Pairing und Outbox          | Existierende credentials.dpapi und outbox.sqlite bleiben erhalten; mit echter Datenbank und Windows-DPAPI getestet.                                              |
| Dashboard                   | Automatisch durch Backend ausgeliefert. 401 setzt die Sitzung zurück und fordert erneute Discord-Anmeldung.                                                      |
| Collector-Verwaltung        | Name, Online-/Widerrufstatus, Version, letzter Kontakt, Spielverbindung, Queue und zugeordneter Name; Aktionen direkt am Eintrag.                                |
| Supervisor                  | Höchstens fünf automatische Wiederanläufe je Komponente, exponentielles Backoff; danach manuelles Neustarten.                                                    |
| Single Instance/Port        | Nativer Mutex/Fokusereignis plus OS-Instanzsperre; belegter Backend-Port wird verständlich gemeldet.                                                             |
| Shutdown/Crash Recovery     | Collector und Discord vor Backend stoppen, WebSocket/Outbox/HTTP/DB/Timer schließen. OS-Sperre hinterlässt keine dauerhafte Lockdatei.                           |
| Backups                     | Vor Migration auf neue Programmversion und manuell bei gestoppten Komponenten.                                                                                   |
| Autostart                   | HKCU, optional; später schaltbar und bei Deinstallation entfernbar.                                                                                              |
| Updateprüfung               | GitHub Releases, Cache maximal einmal pro Tag plus manueller Knopf.                                                                                              |
| Bestätigtes Update          | Download, SHA256-Prüfung, sauberer Shutdown, Installer, Neustart. Keine stille Hintergrundinstallation.                                                          |
| Installer                   | RockLea-Setup.exe, benutzerlokal, Verknüpfungen, optionale Autostart-Aufgabe, Nutzdaten getrennt.                                                                |
| Portable                    | RockLea-Portable.zip mit EXE und Runtime-Ordner. Kein einzelnes selbstentpackendes EXE-Paket.                                                                    |
| Daten bei Upgrade/Uninstall | Installationsverzeichnis getrennt; lokale Match-/Konfigurationsdaten werden nicht entfernt.                                                                      |
| Hauptcommit                 | `624bc66` – feat: add unified RockLea Windows application. Nachfolgende Härtungen separat in der Git-Historie.                                                   |

## Prüfungen und Release-Gate

Lokal bestanden: 138 Tests, 17 zusätzliche PostgreSQL-Integrationstests, Typecheck, Lint, Build, Windows-App-Build und Start der verpackten App. Die Paketprüfung startet echte Backend-/Collector-Prozesse über den Supervisor und kontrolliert die Dashboard-Antwort sowie das Herunterfahren. Der Bot wird mit kontrollierten Supervisor-Tests geprüft; es werden dafür keine echten Discord-Zugangsdaten benutzt.

GitHub Actions prüft denselben Stand zusätzlich auf Linux/Windows, mit PostgreSQL und Docker. Windows baut den Installer, installiert zunächst das alte Collector-Layout, aktualisiert zur neuen App, testet eine erneute Installation, Autostart, Deinstallation mit Datenerhalt und die entpackte Portable-ZIP. Ein Tag-Release wird nur veröffentlicht, wenn beide Jobs erfolgreich sind. Maßgeblich ist der abgeschlossene [CI-Lauf des jeweiligen Commits](https://github.com/Despair1999/RockLea/actions).

Release-Ziel: `v0.2.0` mit `RockLea-Setup.exe`, `RockLea-Portable.zip`, `SHA256SUMS.txt`. Veröffentlichte Artefakte stehen unter [GitHub Releases](https://github.com/Despair1999/RockLea/releases).

## Verbleibende Grenzen

- Windows 10/11 x64 und .NET Framework 4.8 als Windows-Komponente; Node/Entwicklertools werden nicht separat benötigt.
- Unsigned Builds; SHA256 ist keine unabhängige Codesignatur.
- Privates Repository: Update-Download benötigt einen berechtigten GitHub-Lesezugang oder manuellen Browser-Download.
- Automatischer Import nur lokaler PGlite-Daten, nicht externer PostgreSQL-Server. DPAPI ist an das Windows-Benutzerkonto gebunden.
- Echte Online-Match-/Discord-Endpost-Abnahme und manuelle Sichtprüfung des nativen Fensters sind nicht als durchgeführt behauptet. Eine automatisierte Fenstervorschau wurde durch die Werkzeug-Freigabeprüfung blockiert; ausführbare Pakettests wurden stattdessen durchgeführt.
