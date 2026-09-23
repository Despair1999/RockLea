# Offizielle Rocket League Stats API

Geprüft am 23.09.2026: https://www.rocketleague.com/developer/stats-api

Diese Dokumentation ist die Quelle für Envelope, Feldnamen, Sichtbarkeitsregeln und Eventsemantik. Implementiert wird `{ "Event": "UpdateState", "Data": { ... } }`, nicht ein älteres Community-Plugin-Protokoll.

Konfiguration erfolgt in der installierten Spielkonfiguration, nicht in einem aus dem Internet erreichbaren Dienst. Der Windows-Collector verbindet sich nur zu `ws://127.0.0.1:49124`. Keine automatische Ausführung der dokumentierten Replay-/Game-Control-Commands.

CONDITIONAL-Felder können fehlen. SPECTATOR-Felder sind für reguläre Matchstatistiken keine Voraussetzung. TEAM-Felder sind nicht immer für Gegner vorhanden. Replay-Felder werden nicht als Live-Match-Quelle behandelt. Fehlende Statistikwerte bleiben unbekannt, nicht null Tore.

Die 22 dokumentierten Nachrichtentypen werden vom Parser akzeptiert. Der Matchzustand verarbeitet insbesondere MatchCreated, MatchInitialized, RoundStarted, UpdateState, MatchEnded, PodiumStart und MatchDestroyed. GoalScored, BallHit, StatfeedEvent und CrossbarHit erhalten minimierte Eventextrakte. Andere bekannte Events werden validiert, können aber ohne dauerhaft benötigte Informationen verworfen werden. Unbekannte Eventnamen führen nicht zum Crash; der Collector kann deren Auftreten ohne Payload protokollieren (`LOG_UNKNOWN_EVENTS=true`).

PrimaryId wird als Platform|Uid|Splitscreen validiert. Event-Referenzen ohne PrimaryId werden nur gegen genau einen aktuell beobachteten Spieler aufgelöst. Nach der Auflösung werden nur verknüpfte oder eindeutig passende Registrierungen gespeichert. Scoreboard-Zähler bleiben maßgeblich für Tore/Assists/etc.; Tick-Häufigkeit wird nicht als Anzahl von Ballkontakten interpretiert.

`GoalTime` ist laut Dokumentation **Dauer der vorangegangenen Runde**, nicht globaler Match-Zeitstempel. `GoalSpeed`, PreHitSpeed und PostHitSpeed werden als Unreal Units/second gespeichert. Keine nicht belegte km/h-/mph-Konvertierung. Spielstandteams werden über TeamNum zugeordnet; MatchEnded verwendet WinnerTeamNum.

MatchGuid ist laut Dokumentation nur für Online-/LAN-Matches gesetzt. Ohne MatchGuid verwirft diese Version die Beobachtung statt einen unzuverlässigen Multi-Collector-Schlüssel zu erfinden. Lokales Freeplay wird nicht getrackt. ReplayCreated-Dateinamen werden nicht gespeichert. Künftige Replay-Analyse sollte als separater Provider mit eigenem Importbereich ergänzt werden.

Nicht dokumentiert: echte MMR, Rank/Division, globale eindeutige IDs für jedes BallHit-/Statfeed-Ereignis. Daher keine entsprechenden Genauigkeitsversprechen.

Weitere geprüfte Primärquellen: https://discord.js.org/docs/packages/discord.js/main · https://docs.discord.com/developers/topics/oauth2 · https://fastify.dev/docs/latest/ · https://node-postgres.com/features/transactions · https://pglite.dev/docs/ · https://zod.dev/basics · https://nodejs.org/api/sqlite.html · https://nodejs.org/api/single-executable-applications.html
