# Playlist-Metadaten

Die gemeinsame Quelle ist `packages/shared/playlists.ts`: ID, Anzeigename, Teamgröße und Kategorie. Matchfeed und Wichscounter verwenden dieselbe Tabelle. Individuelle `playlistNames` ändern nur die Anzeige, niemals die Teamgröße.

Quellen, geprüft am 25.09.2026:

- [BakkesMod SDK – Known Playlist IDs](https://bakkesplugins.com/wiki/bakkesmod-sdk/code-snippets/playlist-id), Stand Oktober 2025: IDs und Bezeichnungen, teilweise interne Codenamen.
- [CodeRed PlaylistDump vom 30.10.2024](https://gist.github.com/Jackenmen/dffa9712c77662c15a8da9104d019f6a): direkt aus dem Spiel exportierte `Playlist Id`, `Playlist Player Count` und `Playlist Variable Player Count`. Bei dokumentierten, festen Mannschaftsmodi ist Teamgröße die Hälfte der Spielerzahl. Offline-/Privat-/Turnierkapazitäten sind ausdrücklich keine verlässlichen Teamgrößen.

3v3 für den Wichscounter: IDs 3, 13, 15, 16, 18, 23, 28, 29, 30, 31, 33, 35, 37, 38, 41, 44, 47, 48, 49, 50, 52, 65, 66, 67, 68. Dazu gehören Casual/Ranked Standard, Rumble, Dropshot und Snow Day sowie die in der Tabelle aufgeführten festen 3v3-Sondermodi. Hoops ist 2v2. Gridiron/Chaos sind 4v4. Für neuere Modi ohne belegte Spielerzahl bleibt `teamSize` null; sie zählen nicht automatisch als 3v3. Die ältere Dump-Tabelle beschreibt keine aktuelle Playlist-Verfügbarkeit.

Private Matches, LAN, Offline-Saison, Exhibition, Turniere und Knockout haben keine feste Teamgröße in RockLea. Training, Workshop, Trainingseditor und Online Freeplay sind als Training gekennzeichnet. Unbekannte IDs erscheinen als `Playlist <ID>`; Teamgröße wird niemals aus Namen, beobachteter Spielerzahl oder einem Fallback geraten.

Wichscounter: pro registriertem Mitglied und Match genau einmal; Status und Qualität vollständig, MatchEnded beobachtet, Endzeit vorhanden, kein Replay, verifizierte Teamgröße 3, bekannter finaler Score strikt kleiner als 300. Bei mehreren Identitäten/Snapshots desselben Mitglieds gilt der höchste finale Score. Gleich 300 zählt nicht. Der Wert wird bei jeder Statistikabfrage aus der Historie berechnet, kann nach Playlist und Zeitraum gefiltert werden und besitzt keinen manuellen Änderungsbefehl.
