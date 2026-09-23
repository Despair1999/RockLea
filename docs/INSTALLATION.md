# Installation

## Entwicklung

1. Node >=22.15 installieren, `npm install -g pnpm@11.25.0`.
2. `pnpm install --frozen-lockfile`.
3. `pnpm setup:local` erzeugt `.env` mit zufälligem internem Token, ohne bestehende Einstellungen zu überschreiben.
4. `pnpm db:migrate`, `pnpm build`, `pnpm dev`.
5. Discord-Zugangsdaten gemäß README eintragen und separat `pnpm bot`.

PGlite-Verzeichnis `data/backend` darf nur von **einem Backend-Prozess** geöffnet werden. Migrationen vor Start oder bei gestopptem Backend ausführen. Für mehrere Prozesse/Instanzen PostgreSQL verwenden. Keine echten Zugangsdaten in Logs oder Screenshots zeigen.

## Collector

`pnpm collector:build` erzeugt eine vollständige Windows-EXE inklusive Node-Runtime. `scripts/install-collector.ps1` kopiert sie nach `%LOCALAPPDATA%\Programs\RockLea`. Optional mit Inno Setup 6/7 `ISCC scripts/installer.iss` einen Setup-Assistenten bauen.

Einrichtung: `RLStatsCollector.exe --setup`, Backend-HTTPS-URL, `/collector pair`-Code. Lokale Entwicklung erlaubt HTTP ausschließlich für Loopback. Die Zugangsdaten sind an den aktuellen Windows-Nutzer gebunden; sie lassen sich nicht auf einen anderen PC kopieren. Neu pairen, wenn das Windows-Profil wechselt.

Der Collector entdeckt Epic-Launcher-Manifeste sowie Steam-Registry und `libraryfolders.vdf`. Er liest vorhandene `TAGame\Config\TAStatsAPI.ini`, alternativ `DefaultStatsAPI.ini`, erstellt ein datiertes Backup und ersetzt nur drei Schlüssel im richtigen Abschnitt:

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=10
Port=0
WebPort=49124
```

Für einen anderen Sendetakt `RLStatsCollector.exe --configure --packet-rate 20` verwenden (1–120). 10 genügt; der Collector persistiert UpdateState standardmäßig einmal je Sekunde, zusätzlich den letzten gepufferten Stand vor Match-Ende. Ereignisse werden nicht auf diesen Tick-Takt reduziert. Das Spiel muss danach neu gestartet werden. Geschützte Installationsordner können erhöhte Schreibrechte benötigen; das Tool verändert keine Zugriffsrechte.

## Betrieb

- SQLite-Puffer: `%LOCALAPPDATA%\RockLea\outbox.sqlite`.
- Credentials: `credentials.dpapi`, keine Klartext-Token.
- Rotierende Logs: `collector.log` und `collector.log.1`.
- Autostart: `--autostart` / `--no-autostart` für die verpackte EXE.
- Kein Tray-Icon: diese Version verwendet ein Konsolenfenster.
- Collector vor einem Update beenden. SQLite-Dateien bei laufendem Prozess nicht manuell bearbeiten.
- Deinstallation entfernt nicht automatisch Offlinedaten. Erst synchronisieren, dann bei Bedarf das lokale RockLea-Datenverzeichnis selbst löschen und Collector im Discord widerrufen.
