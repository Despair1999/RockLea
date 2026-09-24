# Abnahmestatus

## Implementiert und lokal geprüft

- Backend, Discord-Bot mit Setup-Assistent, React-Dashboard, Windows-Collector und PostgreSQL-Migrationen.
- Mitglieder, Mehrfachidentitäten, Namenshistorie, automatische eindeutige Erkennung und explizite Bestätigung.
- Match-Zustandsmaschine, Snapshot-Deduplizierung, Offline-Nachlieferung, verspätete Korrekturen, Wiederherstellung und Replay-Filter.
- Statistiken, Duo-/Trio-Auswertung, Leaderboards, Rekorde inklusive beobachteter Geschwindigkeiten, Sessions, konfigurierbare Achievements und Tages-/Wochen-/Monatsrückblicke.
- Rating-Provider-Vertrag, manuelle Messungen und Verlauf; keine erfundene automatische MMR.
- Privacy-Export und Löschung einschließlich früher entfernter Identitäten, Whitelist vor lokaler Persistierung und erneute Backend-Prüfung.
- 76 automatisierte Tests, zusätzlich 17 Integrationstests gegen einen echten lokalen PostgreSQL-17-Server. Typecheck, ESLint, Builds und Simulator erfolgreich; Abhängigkeitsscan ohne bekannte Schwachstellen zum Prüfzeitpunkt.
- Browserprüfung mit isolierten Testdaten: Übersicht, Mitgliederregistrierung und Duo-Auswertung. Keine Testdaten im Produktivpfad.
- Windows-EXE gebaut und `--version` ausgeführt. Die verwendete Node-22-Runtime meldet SQLite noch als experimentell.

## Externe Voraussetzungen

- Discord-Token, Client-ID, OAuth-Secret und Servereinladung fehlen. Die tatsächliche Zustellung von Discord-Nachrichten und der echte OAuth-Login benötigen diese Konfiguration.
- Ein echter Rocket-League-Client muss nach der INI-Einrichtung neu gestartet und ein Live-Match beobachtet werden.
- Docker ist lokal nicht installiert; der Container-Build wurde erfolgreich durch GitHub Actions geprüft. Ein lokal erfolgreicher Docker-Test wird nicht behauptet.
- Die EXE ist unsigned. Die lokale Compiler-Installation war blockiert; GitHub Actions verwendet stattdessen den bereits vorinstallierten Inno-Setup-Compiler und prüft die Installation in einem Wegwerf-Runner. EXE und Setup werden als Build-Artefakte veröffentlicht.

## Bewusste Grenzen und optionale Erweiterungen

- Collector mit Konsole, Autostart, DPAPI und Logs; kein optionales Tray-UI.
- Kein automatischer MMR-/Rank-Provider ohne dokumentierte, zulässige Quelle. Manuelle Messungen sind klar gekennzeichnet; kein aus Siegen geschätztes MMR.
- Kein Community-Elo, Live-Demo-Feed, Saison-Abschluss-Recap oder dynamischer Presence-Text. Tages-/Wochen-/Monatsrückblicke und Live-Tormeldungen sind vorhanden.
- Deutsch ist die vollständige Bedienoberfläche; en-US-Vertrag ist vorbereitet, aber kein vollständig englisches UI.
- Mechaniken wie Musty/Flip Reset werden nicht aus ungeeigneten Events behauptet. Solche Community-Rekorde benötigen manuelle Einreichung und Freigabe.
- Ohne eindeutig beobachtete Besitzer-Identität gibt es im restriktiven Gegnerfilter-Modus keine geratenen Teamzuordnungen.
- Replay-Wiedergabe und Offline-Freeplay ohne MatchGuid werden nicht als Live-Matches importiert.
- Die offizielle API liefert nicht für jedes Event eine global eindeutige ID. Matches und Scoreboard-Snapshots sind dedupliziert; bei identischen, unterschiedlich vollständig beobachteten Ereignisfolgen können Eventstatistiken abweichen. Discord-Nonce und gespeicherte Message-IDs begrenzen doppelte Posts, garantieren bei unklaren Netzwerkfehlern aber kein universelles Exactly-once.

Nicht verfügbare Messwerte bleiben nicht verfügbar. Ein vollständig live-abgenommenes Produktionssystem wird erst nach den externen Prüfungen behauptet.

## Collector-Reparatur 0.1.1 (24.09.2026)

Ausgangsstand vor Änderungen geprüft: `9a33cd28230234ffddaee5b3ed8977725505f234`. Die Desktop-ZIP-Kopie enthielt dieselben 68 versionierten Dateien; keine zusätzlichen funktionalen Änderungen, Löschungen oder ungepushten RockLea-Commits. Daher kein leerer Sicherungs-Commit; `git push origin HEAD:main` bestätigte „Everything up-to-date“. `.env`, Datenbanken, Credentials, Logs, Abhängigkeiten und Build-Artefakte bleiben lokal. Im ursprünglichen Workspace vorhandene fremde Arcadoryx/Hundredfold-Dateien wurden weder übernommen noch gelöscht. Die Reparatur baut in einem Git-Worktree auf `main` exakt auf diesem Stand auf.

Nachweisbare Codeursachen: Ganzarray-Validierung verwirft gültige Mitspieler zusammen mit einem fehlerhaften Spieler; vollständiges Game-Parsing verwirft verwertbare Teilinformationen; das bisher dauerhaft gesetzte Replay-Flag konnte ein Live-Match nach einer Torwiederholung aussperren. Welches konkrete Live-Feld beim Betreiber die ursprüngliche Meldung auslöste, ist mangels datensparsamer Alt-Diagnose nicht nachgewiesen.

Behoben: Einzelspieler-Validierung, Game-Feldprojektion, frühe MatchGuid-Prüfung, getrennte Schema-/Outbox-Diagnosen, begrenztes Logvolumen, Torreplay-Fortsetzung und unabhängiger Heartbeat. Privacy-Filter, reale PrimaryIds, Tick-Drosselung, letzter Snapshot, Offline-Wiederholung und Match-Deduplizierung bleiben getestet. Dashboard und Datenbankschema bleiben unverändert.

Automatisierte Abnahme: 76 Tests einschließlich 30 neuer Regressions-/Integrationstests; 17 Datenbanktests zusätzlich gegen PostgreSQL 17. Keine bestehenden Tests entfernt oder abgeschwächt. Typecheck, ESLint, Backend-/Bot-/Dashboard-Build und Windows-Collector-Build geprüft. Ein echter Rocket-League-Livetest der Reparatur wird nicht behauptet.
