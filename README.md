# RockLea

Privates Rocket-League-Statistiksystem für Discord. Ein Windows-Collector liest die **offizielle lokale Stats API**, filtert auf registrierte Mitglieder und überträgt Beobachtungen an ein PostgreSQL-Backend. Discord-Bot und Admin-Dashboard greifen auf dieselben Daten zu.

## Was funktioniert

- PrimaryId-basierte Mitglieder, mehrere Identitäten, Namenshistorie, automatische eindeutige Erkennung und manuelle Bestätigung.
- Lokaler WebSocket-Collector, verschlüsselte Windows-Credentials, SQLite-Offlinespeicher, geordnete Wiederholung, widerrufbare Einmal-Pairings.
- Match-Zustandsmaschine, Multi-Collector-Match-Deduplizierung, spätere Korrektur von Endständen, Wiederherstellung unvollständiger Matches.
- Score, Tore, Assists, Saves, Shots, Touches, CarTouches, Demos, Overtime und Sieg/Niederlage, soweit tatsächlich geliefert.
- Whitelist-gefilterte GoalScored-, BallHit- und Statfeed-Ereignisse; Geschwindigkeiten ausschließlich in dokumentierten Roh-Einheiten.
- Zeit-/Playlistfilter, Duo-/Trio-Auswertungen, Sessions, Leaderboards, automatische persönliche/Server-Rekorde, manuell geprüfte Community-Rekorde und konfigurierbare Achievements.
- Slash Commands, paginierte Ausgaben, Matchfeed, persistente Wochen-Bestenliste, Rekord-/Achievement-Nachrichten, optionaler Session-Post und Tages-/Wochen-/Monatsrückblick.
- React-Admin-Dashboard mit Discord OAuth, PostgreSQL-Migrationen, Simulator, Tests, Docker Compose, Windows-EXE-Build und Inno-Setup-Rezept.

**MMR:** Die aktuelle offizielle API dokumentiert keine MMR. Automatische MMR wird als nicht verfügbar angezeigt. Manuelle Messungen sind ausdrücklich `manual`; ein Provider-Interface ermöglicht spätere verifizierte Quellen.

**Prüfstatus:** 46 automatisierte Tests erfolgreich; die 16 Datenbank-/API-Integrationstests zusätzlich gegen einen echten PostgreSQL-17-Server. Backend, Bot, Dashboard und Windows-EXE gebaut. Browser-Workflows und Simulator geprüft. Externe Live-Abnahme und optionale Erweiterungen stehen in [docs/STATUS.md](docs/STATUS.md). Insbesondere haben seltene identische Events keine verlässliche globale Event-ID in der offiziellen Quelle.

## Lokal starten

Voraussetzungen: Node.js **22.15 oder neuer** (für Deployment Node 24 LTS), pnpm 11.25, Windows für den Collector. PostgreSQL wird produktiv verwendet; lokal funktioniert eingebettetes PostgreSQL/PGlite ohne Docker.

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate
pnpm build
pnpm dev
```

Dashboard: `http://localhost:3000`. Ohne OAuth-Konfiguration erscheint die Anmeldeseite, keine erfundenen Statistiken.

## Discord verbinden

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Anwendung mit Bot anlegen.
2. `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` und für Dashboard-Login `DISCORD_CLIENT_SECRET` in `.env` setzen. Tokens niemals committen.
3. OAuth Redirect: `http://localhost:3000/auth/callback` (Produktion: eigene HTTPS-Domain).
4. Bot mit Scopes `bot` und `applications.commands` auf den Server einladen. Rechte: View Channels, Send Messages, Embed Links, Attach Files, Read Message History. Manage Channels nur zum automatischen Erstellen der Kanäle.
5. In einem zweiten Terminal `pnpm bot` starten. Optional `DISCORD_GUILD_ID` für sofortige Registrierung im Testserver setzen.
6. `/setup` öffnet den Assistenten für Owner, Kanäle, Einstellungen und Collector. Optional `create_channels:true` erstellt eigene Kanäle.
7. `/member add discord:@Niklas name:NiklasRL platform:Epic` und entsprechend Max registrieren.
8. `/collector pair` erzeugt einen vertraulichen, zehn Minuten gültigen Einmalcode.

Normale Mitglieder können Statistiken lesen. Administration verlangt **Manage Server** oder eine über `/config set` konfigurierte Admin-Rolle. Dashboard-Zugriff verlangt Manage Server/Administrator; Rechte werden beim OAuth-Login geprüft, Sitzungen laufen nach 15 Minuten ab.

## Windows-Collector

```powershell
pnpm collector:build
.\release\RLStatsCollector.exe --setup
```

Alternativ dauerhaft in das Benutzerprofil installieren:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-collector.ps1
```

Backend-URL und Pairing-Code eingeben. Steam-/Epic-Installationen werden gesucht, passende INI-Dateien mit Backup angepasst. Änderungen am Spiel erfordern dessen Neustart. Windows-Autostart wird für die installierte EXE eingerichtet. Die EXE ist **nicht codesigniert**. Der optionale grafische Installer wird mit Inno Setup aus `scripts/installer.iss` gebaut.

Weitere Optionen: `--version`, `--configure --packet-rate 10`, `--autostart`, `--no-autostart`. Die API bleibt lokal auf `ws://127.0.0.1:49124`; niemals diesen Port am Router freigeben.

## Erstes Match und Tests

```powershell
pnpm test
pnpm test:postgres
pnpm simulate:match
```

Der Simulator verwendet eine isolierte PostgreSQL-Instanz im Speicher und prüft zwei Mitglieder, zwei Collector, Offline-Nachlieferung und ein einziges Match. Er schreibt nicht in deinen Discord-Server.

Für einen expliziten Test des echten Discord-Flows können die dokumentierten Testidentitäten `Epic|niklas-test|0` und `Epic|max-test|0` in einem **Testserver** registriert werden. Dann `COLLECTOR_TOKEN` für einen dort gepairten Testcollector als Umgebungsvariable setzen und `pnpm simulate:match --send` starten. Das erzeugt echte Testserver-Nachrichten. Für echte Spiele keine Testidentitäten verwenden.

Im echten Match: Rocket League nach der INI-Konfiguration neu starten, Collector geöffnet lassen, ein Online-Match spielen. Danach `/match latest`, `/stats member`, `/leaderboard metric:Goals` prüfen. Max benötigt keinen eigenen Collector, solange er im beobachteten Match ist. Spielt er ohne einen anwesenden Collector, kann nichts aufgezeichnet werden.

## Produktion, Backup und Updates

Siehe [Installation](docs/INSTALLATION.md), [Deployment](docs/DEPLOYMENT.md) und [Troubleshooting](docs/TROUBLESHOOTING.md).

```sh
docker compose up -d --build
```

Erfordert eine ausgefüllte `.env`, `DB_PASSWORD`, `PUBLIC_HOST`, gültige Discord-Konfiguration und DNS/Ports 80/443. Compose startet PostgreSQL, einen versionierten Migrationsjob, Backend samt statischem Dashboard, Bot und Caddy für HTTPS. Das Dashboard teilt bewusst den Backend-Origin, damit kein unnötiges CORS-/Cookie-Setup entsteht.

```powershell
powershell -File scripts/backup.ps1 -RetentionDays 30
```

Vor Updates Backup prüfen, dann Code aktualisieren und Compose neu bauen. Migrationsdateien sind additiv versioniert; kein `schema push`, kein automatisches Löschen von Daten beim Start.

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md) · [Konfiguration](docs/CONFIGURATION.md)
- [Offizielle API und Grenzen](docs/ROCKET_LEAGUE_API.md) · [MMR](docs/MMR_PROVIDERS.md)
- [Discord-Befehle](docs/DISCORD_COMMANDS.md) · [Datenschutz](docs/PRIVACY.md)
- [Abnahmestatus und verbleibende Grenzen](docs/STATUS.md)
