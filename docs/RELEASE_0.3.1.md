# RockLea 0.3.1

- Statistik, Durchschnitte, Winrate, Bestenlisten und automatische Rekorde verwenden nur beendete Matches mit bekanntem Gewinner. Unbekannte, abgebrochene oder laufende Spiele tragen keine Werte bei. Vorhandene Historie wird automatisch neu ausgewertet; kein Reset nötig.
- Permanente Allzeit-Statistik je aktivem Mitglied im Statistikkanal. Gespeicherte Nachrichtenkennungen überstehen Neustarts; gelöschte Nachrichten werden wiederhergestellt. Aktualisierung nach verarbeitetem Match und spätestens beim nächsten 30-Sekunden-Abgleich, sofern Discord erreichbar ist.
- Die bestehende Wochen-Bestenliste wird zur Allzeit-Bestenliste mit sechs Ranglisten: Tore, Paraden, Score-Summe, Schüsse, Abwichscounter und Spiele. Größere Mitgliederlisten werden auf mehrere permanente Nachrichten aufgeteilt.
- Die Serverübersicht unterscheidet verschiedene Matches und Mitglieder-Ergebnisse: Spielen zwei Mitglieder dasselbe Match, ist dies ein Match mit zwei persönlichen Ergebnissen.
- Neue Rekordmeldungen gehen nach `rl-records`. Liegt dort bisher auch die Rekordtabelle, wird automatisch `rl-rekordtabelle` in derselben Kategorie angelegt. Der Bot benötigt hierfür „Kanäle verwalten“ sowie Lese-/Schreib-/Embed-Rechte. Bereits getrennte konfigurierte Tabellen bleiben bestehen. Beide Ziele sind im Dashboard und `/setup` konfigurierbar (`records`, `recordAnnouncements`). Alte bereits veröffentlichte Meldungen werden nicht gelöscht.
- Migration 006 aktualisiert nur abgeleitete Rekordtabellen. Die Bestände werden ohne erneuten Meldungsschwall neu berechnet; Rohmatches, Mitglieder, Konfiguration, Pairing und manuelle Rekorde bleiben erhalten.

Update: In RockLea „Nach Updates suchen → Aktualisieren“. Alternativ RockLea vollständig beenden und das neue Setup installieren. Kein Ordner-Neuimport, kein Reset und kein neues Pairing erforderlich. Für private GitHub-Downloads wird weiterhin ein berechtigter Lesezugang benötigt.

Abwichscounter in der neuen Übersicht entspricht dem vorhandenen Wichscounter: vollständig erfasstes, abgeschlossenes 3v3 mit bekanntem Ergebnis und Score unter 300. Es wird kein zweiter Zähler angelegt.

Automatisierte Tests umfassen die 11/5/3-Konstellation, fehlende Ergebnisse, Gesamtwerte, mehrere Mitglieder im selben Match, sechs Ranglisten, Discord-Limits und Kanaltrennung. Echte Rocket-League-/Discord-Livetests bleiben davon getrennt.
