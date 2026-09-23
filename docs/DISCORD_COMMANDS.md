# Discord-Befehle

Alle Antworten auf Slash Commands sind standardmäßig nur für den aufrufenden Nutzer sichtbar. Automatische Feed-Nachrichten sind im konfigurierten Kanal sichtbar. Keine Message-Content- oder Presence-Privileged-Intents erforderlich.

| Befehl                                        | Funktion                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| /setup                                        | Assistent für Owner, Kanäle, Einstellungen und Pairing                                                                 |
| /config get, set                              | Konfiguration lesen oder per JSON-Wert ändern                                                                          |
| /member add, me                               | Discord-User, Plattform und exakten Spielnamen registrieren                                                            |
| /member list, info, detect                    | Mitglieder bzw. ausstehende Erkennung anzeigen                                                                         |
| /member link, verify, unlink                  | PrimaryId manuell zuordnen/bestätigen/entfernen                                                                        |
| /member edit, enable, disable                 | Anzeigename und Trackingstatus ändern                                                                                  |
| /member remove                                | Mitglied und persönliche Daten entfernen                                                                               |
| /stats member, server, compare, team          | Persönliche/Server-/Vergleichsstatistik                                                                                |
| /match latest, history, info                  | Letzte Spiele und Details                                                                                              |
| /leaderboard                                  | Goals, Assists, Saves, Score, Demos, wins, winrate, matches, streak, GoalsPerMatch, FastestGoal, StrongestBallHit, MMR |
| /records                                      | Automatische und eingereichte manuelle Rekorde                                                                         |
| /record submit, approve, reject, edit, delete | Community-Rekorde mit Prüfschritt                                                                                      |
| /session current, latest, list                | Automatisch gruppierte Sessions                                                                                        |
| /mmr history, compare, set                    | Verfügbarkeit und manuell erfasste Messungen                                                                           |
| /rank                                         | Verfügbarkeit und gespeicherte Rating-Snapshots                                                                        |
| /collector pair, list, status, rename, revoke | Gaming-PCs verwalten                                                                                                   |
| /achievements                                 | Vergebene Achievements                                                                                                 |
| /status, /health                              | Datenbank, Collector und Rating-Capabilities                                                                           |
| /privacy export, delete                       | Eigene Daten exportieren oder mit Button bestätigen und löschen                                                        |

Mitglieds-ID-Optionen bieten Autocomplete. Große Ausgaben haben Zurück/Weiter-Buttons und laufen nach zehn Minuten ab. Bei beobachteter Mehrdeutigkeit kann `/member detect` ein Identitäts-Auswahlmenü anbieten; es rät nicht. Exakt gleiche Registrierungsnamen mehrerer Personen erfordern eine explizite `/member link`-Zuordnung. `/member info` zeigt das ausgewählte Mitglied mit Namenshistorie; `/mmr compare` zeigt Messungen und Veränderungen zwischen Messzeitpunkten. Solche Veränderungen werden nicht als exakte Match-Deltas ausgegeben.

Administrativ: setup, config set, Mitgliedsänderungen, Collector-Pairing/-Änderungen, Record-Freigaben und manuelle Rating-Einträge. Discord prüft ManageGuild oder konfigurierte Rollen. Das Identitäts-Auswahlmenü verlangt derzeit ManageGuild. Privacy arbeitet stets auf dem eigenen Discord-Nutzer, nie auf einer frei übergebenen User-ID.

Channel-Verwaltung muss nur für `create_channels:true` gewährt werden. Die API-Limits und Wiederholungen des Discord-Clients werden genutzt; der Notification-Worker verarbeitet jeweils einen Queue-Eintrag und speichert Message-IDs. Automatische Matchnachrichten erscheinen nach kurzer Sammelphase. Feste Serverstatistik und Wochen-Tore-Bestenliste werden jede Minute aktualisiert, auch bei deaktivierten Matchposts. Gelöschte Bot-Nachrichten werden neu erstellt.
