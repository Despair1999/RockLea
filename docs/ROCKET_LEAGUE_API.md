# Offizielle Rocket League Stats API

Geprüft am 24.09.2026: https://www.rocketleague.com/developer/stats-api

Diese Dokumentation ist die Quelle für Envelope, Feldnamen, Sichtbarkeitsregeln und Eventsemantik. Implementiert wird `{ "Event": "UpdateState", "Data": { ... } }`, nicht ein älteres Community-Plugin-Protokoll.

Konfiguration erfolgt in der installierten Spielkonfiguration, nicht in einem aus dem Internet erreichbaren Dienst. Der Windows-Collector verbindet sich nur zu `ws://127.0.0.1:49124`. Keine automatische Ausführung der dokumentierten Replay-/Game-Control-Commands.

CONDITIONAL-Felder können fehlen. SPECTATOR-Felder sind für reguläre Matchstatistiken keine Voraussetzung. TEAM-Felder sind nicht immer für Gegner vorhanden. Replay-Felder werden nicht als Live-Match-Quelle behandelt. Fehlende Statistikwerte bleiben unbekannt, nicht null Tore.

Die 22 dokumentierten Nachrichtentypen werden vom Parser akzeptiert. Der Matchzustand verarbeitet insbesondere MatchCreated, MatchInitialized, RoundStarted, UpdateState, MatchEnded, PodiumStart und MatchDestroyed. GoalScored, BallHit, StatfeedEvent und CrossbarHit erhalten minimierte Eventextrakte. Andere bekannte Events werden validiert, können aber ohne dauerhaft benötigte Informationen verworfen werden. Unbekannte Eventnamen führen nicht zum Crash; unbekannte Typen werden ohne Payload-Logging ignoriert.

PrimaryId wird als Platform|Uid|Splitscreen validiert. Event-Referenzen ohne PrimaryId werden nur gegen genau einen aktuell beobachteten Spieler aufgelöst. Nach der Auflösung werden nur verknüpfte oder eindeutig passende Registrierungen gespeichert. Scoreboard-Zähler bleiben maßgeblich für Tore/Assists/etc.; Tick-Häufigkeit wird nicht als Anzahl von Ballkontakten interpretiert.

`GoalTime` ist laut Dokumentation **Dauer der vorangegangenen Runde**, nicht globaler Match-Zeitstempel. `GoalSpeed`, PreHitSpeed und PostHitSpeed werden als Unreal Units/second gespeichert. Keine nicht belegte km/h-/mph-Konvertierung. Spielstandteams werden über TeamNum zugeordnet; MatchEnded verwendet WinnerTeamNum.

MatchGuid ist laut Dokumentation nur für Online-/LAN-Matches gesetzt. Ohne MatchGuid verwirft diese Version die Beobachtung statt einen unzuverlässigen Multi-Collector-Schlüssel zu erfinden. Lokales Freeplay wird nicht getrackt. ReplayCreated-Dateinamen werden nicht gespeichert. Künftige Replay-Analyse sollte als separater Provider mit eigenem Importbereich ergänzt werden.

Nicht dokumentiert: echte MMR, Rank/Division, globale eindeutige IDs für jedes BallHit-/Statfeed-Ereignis. Daher keine entsprechenden Genauigkeitsversprechen.

Weitere geprüfte Primärquellen: https://discord.js.org/docs/packages/discord.js/main · https://docs.discord.com/developers/topics/oauth2 · https://fastify.dev/docs/latest/ · https://node-postgres.com/features/transactions · https://pglite.dev/docs/ · https://zod.dev/basics · https://nodejs.org/api/sqlite.html · https://nodejs.org/api/single-executable-applications.html

## Live-Parsing ab Collector 0.1.1

`UpdateState.Players` bleibt ein Array mit höchstens 64 Einträgen. Ein falscher Array-Typ oder ein überschrittenes Limit verwirft den Tick; innerhalb des Arrays wird jeder Spieler separat mit dem unveränderten Player-Schema validiert. Ungültige Spieler werden übersprungen. Gültige Spieler und Matchmetadaten bleiben nutzbar. Auch fehlerhafte Namensdoppelgänger dürfen keine vorher mehrdeutige Identitäts-/Eventreferenz scheinbar eindeutig machen.

Nur nicht leere MatchGuid-Strings bis 128 Zeichen durchlaufen die Matchpipeline. Fehlende, leere, nur aus Leerzeichen bestehende oder falsch typisierte GUIDs werden früh ignoriert. `ReplayCreated` wird vorher berücksichtigt, damit eine History-Wiedergabe auch ohne GUID nicht importiert wird. Es werden keine Match-IDs oder PrimaryIds erfunden.

Das Game-Objekt wird feldweise projiziert. Fehlende Werte bleiben fehlend; fehlerhafte optionale Felder und ungültige Teamobjekte werden übersprungen. Andere validierte Felder bleiben erhalten. Unbekannte Schlüssel werden entfernt. Bereits bekannte Teamstände und Overtime-Informationen werden durch einen unvollständigen Folgetick nicht gelöscht. `Winner` ist laut Quelle ein Teamname, kein auf zwei Zeichenfolgen beschränktes Enum; ohne eindeutige Blue-/Orange-Zuordnung bleibt `MatchEnded.WinnerTeamNum` maßgeblich.

**Torwiederholung versus History-Replay:** `Game.bReplay` gilt laut offizieller Dokumentation für beide. Eine normale Torwiederholung darf deshalb keine permanente History-Sperre setzen. Replay-Ticks/Eventkopien werden übersprungen; nach `GoalReplayEnd`, `RoundStarted` oder einem expliziten Live-Tick wird weiterverarbeitet. `ReplayCreated` markiert dagegen die History-Wiedergabe. Der letzte gepufferte Live-Snapshot bleibt vor `MatchEnded`/`MatchDestroyed` erhalten.

Die Whitelist greift weiterhin vor SQLite und vor Netzwerkübertragung sowie erneut im Backend. Logs enthalten ausschließlich bekannte Eventnamen, erlaubte Feldpfade, Fehlerkategorien und Zähler; keine Rohpayloads, Namen, Identitätswerte oder Tokens. Es gibt weiterhin keine automatische MMR-Quelle.
