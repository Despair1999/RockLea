# Konfiguration

## Windows-Anwendung

Einstellungen im nativen Assistenten; `%LOCALAPPDATA%\RockLea\config.dpapi` wird per Windows-DPAPI/CurrentUser verschlüsselt. Enthält Discord-Zugang, automatisch erzeugtes internes Token, Port, optionalen GitHub-Lesezugang und Autostartpräferenz. Secrets werden beim erneuten Öffnen nicht an das UI zurückgesendet; leere Felder behalten bestehende Werte. Im Desktop-Betrieb gewinnt diese geprüfte Konfiguration gegenüber geerbten Entwickler-Umgebungswerten. HOST bleibt 127.0.0.1, Datenbank immer im Datenordner. `ROCKLEA_DATA_DIR` ist ein expliziter Test-/Admin-Override; normale Benutzer benötigen ihn nicht.

Bot Token, Client ID und Serverzugriff werden vor dem Speichern geprüft. Redirect URI exakt an den Port anpassen. Den Client Secret bestätigt die OAuth-Anmeldung. Autostartstatus wird aus HKCU gelesen, damit Installer-Optionen korrekt angezeigt werden.

## Entwickler-/Serverbetrieb

Umgebungswerte stehen in `.env.example`. Bot und Backend teilen `INTERNAL_TOKEN`; Collector erhält einen anderen Token je PC. `DISCORD_CLIENT_SECRET` wird ausschließlich für den OAuth-Codeaustausch benötigt. `SESSION_SECRET` und `ENCRYPTION_KEY` sind reserviert und werden in dieser Architektur nicht benötigt: Sitzungen sind zufällige Server-Tokens, Windows-Credentials verwenden DPAPI.

Guild-Einstellungen: `/config get`, `/config set key:<name> value:<JSON>`. Dashboard bietet Formulare für häufige Optionen. Beispiel: `key:sessionTimeout value:60`; `key:channels value:{"matchfeed":"123456789","leaderboard":"123456789"}`. Das Channel-Objekt wird vollständig ersetzt. Eine Channel-ID kann für mehrere Zwecke wiederverwendet werden.

| Schlüssel      | Standard      | Bedeutung                                                                            |
| -------------- | ------------- | ------------------------------------------------------------------------------------ |
| locale         | de-DE         | Deutsche Oberfläche; en-US-Struktur vorbereitet, noch keine vollständige Übersetzung |
| timezone       | Europe/Berlin | Kalendergrenzen und Darstellung                                                      |
| matchPosts     | true          | Match-Ende-Nachrichten                                                               |
| recordPosts    | true          | Serverrekord-Meldungen                                                               |
| achievements   | true          | Achievement-Abgleich und Meldungen                                                   |
| sessionPosts   | false         | Abgeschlossene Sessions posten                                                       |
| weeklyRecap    | true          | Vorwochen-Zusammenfassung, nur mit Daten                                             |
| sessionTimeout | 45            | Minuten ohne weiteres Match                                                          |
| minimumMatches | 5             | Mindestanzahl für Winrate-Leaderboard                                                |
| playlistIds    | []            | Leer = alle beobachteten Playlists; sonst Allowlist                                  |
| playlistNames  | {}            | Verifizierte ID-zu-Name-Zuordnung durch Administrator                                |
| channels       | {}            | matchfeed, stats, records, leaderboard, sessions, system                             |
| adminRoleIds   | []            | Zusätzliche Discord-Admin-Rollen                                                     |
| seasonStart    | nicht gesetzt | UTC ISO-Datum, für Saisonfilter erforderlich                                         |
| retentionDays  | 90            | Aufbewahrung detaillierter Events und Audit-Log                                      |

`goalPosts` aktiviert optionale Meldungen für beobachtete Tore registrierter Spieler (Standard false). `trackRegisteredMembersAsOpponents` ist standardmäßig true. Bei false werden nur Mitglieder im Team des zugeordneten Collector-Besitzers erfasst. Dafür vor dem Pairing den Besitzer registrieren und `/collector pair discord:@Besitzer` verwenden; ohne eindeutig beobachteten Besitzer wird keine Teamzugehörigkeit geraten. Fremde Spielerprofile werden nie dauerhaft angelegt. Keine stillschweigende MMR- oder Playlist-Schätzung.

Zeitraumfilter: all, today, yesterday, week, month, 7days, 30days, season; interne Action-API zusätzlich custom mit from/to. Teamfilter unterstützt `teamMembers` mit Member-UUIDs. Discord-Kurzbefehle bieten die häufigsten Filter; vollständige Filter können über die API genutzt werden.

## Erweiterte Auswertung

Alle Schlüssel sind auch über das JSON-Einstellungsformular im Dashboard zugänglich. Unbekannte Schlüssel werden abgelehnt.

- `dailyRecap` / `monthlyRecap`: Tages- bzw. Monatsrückblick, beide standardmäßig false. `weeklyRecap` ist standardmäßig true. Nur abgeschlossene Zeiträume mit Daten erzeugen einen Post.
- `recordMetrics`: aktivierte automatische Rekorde. Standard: alle acht Scoreboard-Metriken, BestWinStreak, DailyWins, DailyWinrate, SessionMatches, FastestGoal, StrongestBallHit. Tages-Winrate verwendet `minimumMatches`. Geschwindigkeiten bleiben in Unreal Units/second.
- `disabledAchievements`: Liste deaktivierter Regel-Schlüssel.
- `achievementRules`: Regeln mit `key`, `label`, `kind`, `threshold` und optional `metric`. Unterstützte Arten: wins, total, match, streak, together, overtime_wins. Beispiel: `[{"key":"hundred_goals","label":"100 Tore","kind":"total","metric":"Goals","threshold":100}]` ersetzt die Standardliste.

Rekorde sind materialisierte Bestwerte; die Ereignis-Retention entfernt ihre zusammengefassten Werte nicht. Vollständige Rohereignis-Auswertungen sind nur innerhalb der Aufbewahrungszeit möglich. Session-Auswertungen gruppieren serverweit anhand der Beobachtungszeiten. Team-Auswertungen zählen jedes gemeinsame Match genau einmal und zeigen zusätzlich persönliche Werte sowie beobachtete gegenseitige Assists.
