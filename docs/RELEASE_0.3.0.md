# RockLea 0.3.0

- Neue Discord-Ansichten für Matchfeed, Mitgliederstatistik, Vergleiche, Mitglieder, Ranglisten und Rekorde.
- Finale Scoreboards beider Teams mit allen beobachteten Spielern, Punkten, Toren, Assists, Paraden, Schüssen und optional Demos. Fehlende Werte bleiben als Strich erkennbar.
- Permanente Allzeit-Rekordtafel im konfigurierten Records-Kanal. Gespeicherte Nachrichtenkennung, Bearbeitung statt Duplikaten, Wiederherstellung gelöschter Nachrichten. Öffentliche Rekorde zeigen Kategorie, Wert/Einheit, Mitglied und tatsächliches Rekorddatum; keine internen IDs oder vorherigen Werte.
- Wichscounter in Mitgliederstatistik, Vergleich und Rangliste: vollständig erfasste, beendete echte 3v3-Matches mit bekanntem Score unter 300. Zentrale, dokumentierte Playlist-Metadaten einschließlich Rumble, Dropshot und Snow Day.
- Original-RockLea-Logo als transparentes Windows-Icon in 16, 24, 32, 48, 64, 128 und 256 Pixeln für EXE, Fenster/Tray, Installer und Verknüpfungen.
- Migration ergänzt Rekorddaten. Gegnernamen liegen ausschließlich im zeitlich begrenzten Matchpost-Puffer, nicht in Gegnerprofilen oder Statistikhistorien. Details: `docs/PRIVACY.md`.

## Update von 0.2.0

In RockLea **Nach Updates suchen → Aktualisieren** verwenden. Alternativ RockLea über **Beenden** vollständig schließen und `RockLea-Setup.exe` installieren. Konfiguration, Collector-Pairing und Daten bleiben im bisherigen Benutzerverzeichnis. Keine erneute .env-Eingabe und kein neues Pairing erforderlich. Beim Versionswechsel wird vor der Datenbankmigration eine Sicherung erstellt.

Bei privatem Repository benötigt der Updater einen bereits eingerichteten GitHub-Lesezugang. `RockLea-Portable.zip` enthält den vollständigen Laufzeitordner; die GitHub-Quellcode-ZIP ist kein fertiges Windows-Programm. Installer/Portable anhand `SHA256SUMS.txt` prüfen.

Wenn Windows noch das alte Icon zeigt: RockLea komplett beenden, alte angeheftete Verknüpfung lösen und die aktualisierte EXE neu anheften. Windows kann alte Icons zwischenspeichern; Ab-/Anmelden lädt die Anzeige neu. Nutzdaten nicht löschen.

Fixture-Vorschau: `docs/examples/discord-preview.html`. Automatisierte Tests und Vorschauen ersetzen keinen tatsächlichen Online-Match-/Discord-Livetest. Die Builds sind weiterhin nicht codesigniert.
