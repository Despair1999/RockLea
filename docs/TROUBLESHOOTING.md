# Fehlerbehebung

## Rocket League nicht verbunden

Spiel nach INI-Änderung neu starten. Richtige Installation prüfen: `TAGame/Config/TAStatsAPI.ini`, alternativ `DefaultStatsAPI.ini`. Abschnitt und WebPort prüfen. Rocket League muss ein unterstütztes Match geöffnet haben. Der Collector versucht alle fünf Sekunden neu zu verbinden. Niemals Windows-/Router-Portfreigaben für den lokalen Game-WebSocket einrichten.

## Backend nicht erreichbar

HTTPS-URL, DNS, Zertifikat und `/health` prüfen. `localhost` bezeichnet auf dem Gaming-PC diesen PC, nicht den VPS. Puffer bleibt in `outbox.sqlite`; bei Wiederverbindung wird er geordnet gesendet. HTTP 401 bedeutet widerrufene/falsche Credentials: neu pairen. HTTP 400: Collector-Version und Backend-Logs prüfen. Keine Credentials in Tickets posten.

## Keine Mitgliedsstatistik

Vor dem Match registrieren. Plattform und Name müssen zunächst exakt passen. `/member list` und `/member detect` prüfen. PrimaryId manuell mit `/member link` setzen, falls Namen doppelt vorkommen. Spätere Namensänderungen sind unproblematisch. Mehrere Collector desselben Servers müssen tatsächlich auf dieselbe Guild gepairt sein.

## Keine Discord-Nachricht

`/setup`, `channels.matchfeed` und `matchPosts` prüfen. Bot benötigt View Channel, Send Messages, Embed Links, Read Message History. Queue versucht fehlgeschlagene Sends mit Backoff erneut. Der Collector muss MatchEnded oder MatchDestroyed beobachtet haben; reine laufende Snapshots erzeugen noch keinen Match-Ende-Post.

## Dashboard-Login scheitert

Client ID/Secret und Redirect URI müssen exakt passen. Produktions-URL ohne abschließenden Slash und mit HTTPS verwenden. Ein Login gilt 15 Minuten; danach erneut anmelden. Ein Server erscheint nur mit Manage Server/Administrator-Rechten. Zusätzliche Bot-Admin-Rollen allein berechtigen das Dashboard derzeit nicht.

## Datenbank gesperrt

PGlite: lokalen Backend-Prozess beenden, bevor Migrationen oder ein zweiter Prozess das Datenverzeichnis öffnen. Produktion: PostgreSQL verwenden. Fehlende Tabellen: `pnpm db:migrate`. Keine Dateien löschen, um einen Datenbankfehler zu kaschieren.

## Windows / EXE

Unsigned-Build kann von SmartScreen angezeigt werden; der Build besitzt keine Herausgebersignatur. Für Verteilung im größeren Kreis eigenes Codesigning verwenden. Credentials nur unter demselben Windows-Konto nutzbar. Geschützte Spielverzeichnisse können INI-Schreiben verweigern; INI dann mit passenden Rechten manuell bearbeiten. Ein fehlender Inno-Compiler verhindert nur den optionalen Setup-Wrapper, nicht die EXE.

## Unerwartete Statistik

`quality` prüfen: complete, partial, recovered, invalid. Match ohne MatchEnded wird nicht als sicher vollständig behauptet. Eventbasierte Geschwindigkeiten sind Rohwerte, keine km/h. Fehlende MMR ist erwartetes Verhalten. Eventcounts können bei Beobachtungslücken unvollständig sein. Server-Siege sind Mitgliedsergebnisse; gemeinsame Matches werden für die Server-Matchzahl nur einmal gezählt.

## „Ungültiges Event oder voller Puffer“ aus älteren Collectorn

Collector 0.1.1 trennt die Ursachen. Beispiele:

```text
Teilobjekt übersprungen (UpdateState, Schema/Spieler): Data.Players.2.PrimaryId: Ungültiges Format (1 Fehler)
Event verworfen (UpdateState): Schema: Data.Players: Ungültiger oder fehlender Datentyp (1 Fehler)
Outbox-Schreibfehler (UpdateState): Kapazitätsgrenze erreicht; Backend-Verbindung prüfen. Event nicht gespeichert.
```

„Teilobjekt übersprungen“ bedeutet, dass andere gültige Spieler/Felder weiterverarbeitet werden. „Event verworfen“ betrifft einen strukturell unbrauchbaren Tick, z. B. ein nicht vorhandenes Spielerarray. Outbox-Fehler betreffen den lokalen Speicher; bereits gepufferte Daten nicht löschen. Ein voller Puffer fasst höchstens 100.000 Deliveries. Erneut Backend-Verbindung herstellen und Speicherplatz/Berechtigungen prüfen.

Schema-Diagnosen enthalten maximal drei Feldpfade sowie die Gesamtfehlerzahl. Wiederholungen werden pro Meldung für eine Minute zusammengefasst; zusätzlich maximal 20 Detailmeldungen pro Minute. Die nächste Ausgabe nennt unterdrückte Meldungen. Unbekannte Eventnamen, unbekannte Schlüssel, Zod-Rohmeldungen und JSON-Fehlerausschnitte werden nicht ausgegeben, weil darin private Werte stehen könnten.

`/collector status`: `gameConnected` stammt direkt aus dem WebSocket-OPEN-Zustand. Heartbeats laufen unabhängig vom Upload und der Roster-Aktualisierung: bei Zustandswechseln, sonst alle 60 Sekunden; nach Fehlern wird im Fünfsekundentakt erneut geprüft. Backend-Zeit `last_seen_at`, aktuelle `queueDepth` und Version werden aktualisiert. Ein Online-Collector allein beweist kein erfolgreich verarbeitetes Match.

## Update auf 0.1.1 ohne erneutes Pairing

Im **Git-Checkout** auf `main`: `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm collector:build`. Bei einer heruntergeladenen ZIP-Kopie ohne `.git` funktioniert `git pull` nicht: den vorhandenen Git-Checkout verwenden oder die geprüften Quelldateien aus dem neuen Stand übernehmen. `.env`, `data` und bestehende Credentials dabei bewahren.

Backend und Bot mit dem neuen Build neu starten. Alte Collector-EXE beenden und die neue EXE am bisherigen Installationsort ersetzen. Alternativ den neuen Installer verwenden; dabei die optionale erneute Einrichtung am Ende abwählen. **Nicht `--setup` aufrufen**, wenn das vorhandene Pairing beibehalten werden soll. `%LOCALAPPDATA%\RockLea\credentials.dpapi` und `outbox.sqlite` unverändert lassen; Start unter demselben Windows-Nutzer. Keine Datenbankmigration ist für diese Reparatur nötig.

Rocket League vollständig neu starten, Collector starten und ein Online-Match spielen. Danach `/collector status` (Version 0.1.1), `/member detect`, `/member info`, `/match latest` und `/stats member` prüfen. Keine künstliche PrimaryId aus einem Anzeigenamen eintragen. Falls ein Feld weiter verworfen wird, nur die neue minimierte Diagnose teilen, niemals komplette Live-Payloads oder Tokens.
