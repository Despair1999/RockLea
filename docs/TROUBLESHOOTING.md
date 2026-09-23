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
