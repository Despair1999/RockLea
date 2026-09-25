# RockLea 0.3.0

Rocket-League-Statistiken für deinen Discord-Server als Windows-Anwendung.
Ein Programm startet Backend, Discord-Bot, Collector und Dashboard automatisch.

## Installation für Windows

1. [Neueste Version öffnen](https://github.com/Despair1999/RockLea/releases/latest) und **RockLea-Setup.exe** herunterladen.
2. Setup installieren und **RockLea** starten. Node.js, pnpm und Git werden nicht benötigt.
3. Einmal Bot Token, Client ID, Client Secret und Server ID im Assistenten eintragen. Der Bot muss zuvor in deinen Server eingeladen sein.
4. Die angezeigte Redirect-Adresse im Discord Developer Portal erlauben: standardmäßig `http://localhost:3000/auth/callback`.
5. Dashboard öffnen, mit Discord anmelden und Server/Kanäle sowie Mitglieder einrichten. Alternativ `/setup` im Discord-Server verwenden.
6. Rocket League starten. Falls die Stats API erstmals eingerichtet wurde, das Spiel einmal neu starten.

Windows 10/11 x64 mit .NET Framework 4.8 (Windows-Komponente). Die Node-Laufzeit wird mitgeliefert. Builds sind **nicht codesigniert**. Bei einem privaten Repository ist zum Herunterladen ein berechtigtes GitHub-Konto nötig.

## Bestehende Installation übernehmen

Alle bisherigen Backend-, Bot- und Collector-Prozesse beenden. Im ersten Assistenten **Bestehende Installation importieren** wählen und den alten Projektordner mit `.env` und `data` auswählen. Die lokale PGlite-Datenbank wird kopiert; Originaldateien bleiben erhalten. Vorhandene `credentials.dpapi` und `outbox.sqlite` unter `%LOCALAPPDATA%\RockLea` werden weiterverwendet. Keine erneute Kopplung bei gültigem importiertem Pairing.

Nicht erneut eine leere Installation konfigurieren, wenn bereits Collector-Credentials vorhanden sind: zuerst die zugehörige Datenbank importieren. Externe PostgreSQL-Deployments bleiben ein gesonderter Serverbetrieb; der automatische Desktop-Import unterstützt PGlite.

## Täglicher Betrieb und Updates

**RockLea.exe** starten oder „Mit Windows starten“ aktivieren. Das Fenster zeigt Backend, Discord, Collector, Spielverbindung und Offline-Puffer. Schließen minimiert in den Tray; **Beenden** stoppt alle Komponenten. Bei einem zweiten Start wird das vorhandene Fenster aktiviert.

Das Dashboard läuft lokal auf `http://localhost:3000` (Port in Einstellungen änderbar). Ein anderer belegter Port wird gemeldet. Es sind keine Router- oder Firewallfreigaben erforderlich.

Updates werden höchstens einmal pro Tag sowie auf Knopfdruck geprüft. **Aktualisieren** lädt das Release, prüft SHA256, beendet die Komponenten, startet Setup und anschließend RockLea neu. Es wird nichts ohne diesen Klick installiert. Bei privatem GitHub-Repository einen auf dieses Repository begrenzten Lese-Token für Inhalte in den Einstellungen hinterlegen; er wird ebenfalls DPAPI-verschlüsselt.

Alternativ die gesamte **RockLea-Portable.zip** entpacken und die enthaltene RockLea.exe starten. EXE und `runtime` müssen zusammenbleiben. Nutzdaten liegen auch dabei unter `%LOCALAPPDATA%\RockLea`.

## Funktionen

- Match-Ergebnisse, Scoreboard-Werte, Sessions, Bestenlisten, Rekorde und Achievements.
- Discord-Befehle und Dashboard für Mitglieder, Konfiguration, Datenschutz und Collector-Verwaltung.
- Persönliche Langzeitstatistiken nur für registrierte Mitglieder; vollständige finale Scoreboards im Matchfeed, keine dauerhaften fremden Spielerprofile.
- Permanente Rekordtafel mit Rekorddatum, moderne Statistikansichten und Wichscounter für vollständig erfasste 3v3-Matches unter 300 Punkten.
- Verschlüsseltes Pairing und Offline-Outbox; automatische Wiederverbindung.
- Keine erfundenen MMR-Werte: manuelle Messwerte sind als solche gekennzeichnet.
- Training ohne MatchGuid wird ignoriert, Wiederholungen werden nicht als neue Live-Matches importiert.

## Entwicklung

Nur für Arbeit am Quellcode: Node 24 und pnpm 11.25 verwenden.

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate
pnpm dev
# separate Entwicklerterminals:
pnpm bot
pnpm collector
```

Prüfungen: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:postgres`.
Windows-App bauen: `pnpm host:build`; Installer: Inno Setup mit `scripts/host-installer.iss`.
`pnpm collector:build` erzeugt weiterhin den separaten Collector für Server-Deployments.

Ein Tag `v0.3.0` startet die CI, baut und prüft Windows-Artefakte und veröffentlicht bei erfolgreichen Linux- und Windows-Jobs das GitHub Release. Versionsnummern vor künftigen Releases gemeinsam aktualisieren.

[Installation](docs/INSTALLATION.md) · [Konfiguration](docs/CONFIGURATION.md) · [Fehlerhilfe](docs/TROUBLESHOOTING.md) · [Deployment und Backup](docs/DEPLOYMENT.md) · [Status und Grenzen](docs/STATUS.md) · [API](docs/ROCKET_LEAGUE_API.md)
