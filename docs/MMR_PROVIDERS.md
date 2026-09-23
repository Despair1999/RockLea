# Rating-Provider

`packages/rating-providers` definiert Capabilities, alle Ratings einer Identität und Playlist-Abfrage. `NullRatingProvider` meldet nachvollziehbar unavailable. `ManualRatingProvider` akzeptiert eine Datenzugriffsfunktion und kennzeichnet Messungen als manuell. Das Backend kann manuelle Snapshots über `/mmr set` und das Dashboard speichern.

Es ist **keine automatische reale MMR-Quelle aktiv**. Weder eine öffentliche offizielle Rating-API noch ein BakkesMod-Adapter wird behauptet. Kein Extrahieren von Epic-Tokens, kein Reverse Engineering privater Authentifizierung, kein Tracker-Scraping.

Snapshots enthalten Mitglied, Playlist, MMR, optionale Rank/Division, UTC-Messzeitpunkt, Source und Confidence. `ratingChange` verweigert Vergleiche über unterschiedliche Personen/Playlists/Quellen oder rückläufige Zeitpunkte. Nur ein bestätigtes Pre-/Post-Paar mit genau einem dazwischen liegenden Match und verifizierter Quelle darf Match MMR Delta heißen. Manuelle Werte oder mehrere Matches bleiben Change since last measurement.

Neue Provider müssen eigene aktuelle Primärquellen, Berechtigung zur Datennutzung, Ausfallverhalten und Tests mitbringen. Für Teamkollegen ohne abrufbare Quelle bleibt MMR unbekannt. Provider-Ausfälle dürfen die Match-Ingestion niemals blockieren.
