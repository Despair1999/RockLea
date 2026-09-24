# Windows-Installation

Normaler Einstieg ist **RockLea-Setup.exe** aus dem neuesten GitHub Release.
Kein Source-ZIP, Node.js, pnpm, Git oder eigenes Inno Setup nötig. Windows 10/11 x64 mit der Windows-Komponente .NET Framework 4.8 vorausgesetzt.

## Ersteinrichtung

Im Discord Developer Portal eine Anwendung mit Bot anlegen und in den gewünschten Server einladen. Die Berechtigungen aus der Discord-Bot-Dokumentation dieses Projekts beachten; es werden keine privilegierten Gateway-Intents benötigt. Bot Token, Client ID, Client Secret und Server ID im RockLea-Assistenten speichern. Token/Client-ID-Zuordnung und Zugriff auf den Server werden online geprüft. Der Client Secret wird bei der anschließenden OAuth-Anmeldung tatsächlich verwendet.

Redirect URI exakt wie im Assistenten: `http://localhost:3000/auth/callback`, bei geändertem Port entsprechend anpassen. Das automatisch erzeugte INTERNAL_TOKEN muss nicht kopiert werden.

Die Stats-API-INI wird bei Einrichtung soweit auffindbar angepasst und vorher gesichert. Epic-/Steam-Erkennung bleibt enthalten. Bei geänderter INI Rocket League neu starten. Der Status „Verbunden“ zeigt einen offenen lokalen Stats-WebSocket an; Training ohne MatchGuid erzeugt keine Matches.

## Migration von 0.1.x

1. Alte Backend-, Discord-Bot- und Collector-Prozesse vollständig beenden.
2. Neue App starten, **Bestehende Installation importieren** wählen.
3. Alten Projektordner mit `.env` und lokaler PGlite-Datenbank auswählen.
4. Originaldateien bleiben erhalten. Der Import lehnt ein bereits belegtes Ziel ab und sichert vorhandene lokale Daten vorher.
5. Bestehendes `%LOCALAPPDATA%\RockLea\credentials.dpapi` und `outbox.sqlite` bleiben erhalten. Sie müssen zur importierten Datenbank gehören. Kein Neu-Pairing nötig.

Ein belegter alter Standardport verhindert den Import. Bei einer abweichenden alten Portkonfiguration ebenfalls alle alten Prozesse vorher beenden. Datenbankkopien bei laufendem alten Backend sind nicht unterstützt. Bei unterbrochenem Import bleiben Original und Staging-Kopie erhalten; keine Dateien blind löschen oder überschreiben.

## Betrieb

Ein sichtbarer Einstieg: RockLea.exe. Tray-Menü für Status, Dashboard, Logs, Neustart, Autostart, Update und Beenden. Das X schließt das Fenster in den Tray. Nur „Beenden“ stoppt alles. Optionaler Benutzer-Autostart in HKCU, ohne Administratorrechte.

Programm: `%LOCALAPPDATA%\Programs\RockLea`. Daten: `%LOCALAPPDATA%\RockLea`.
Der Installer und seine Deinstallation löschen diesen Datenordner nicht. Die Portable-ZIP enthält EXE und Runtime-Ordner; beide zusammenhalten.

## Updates

Bei neuen Releases „Aktualisieren“ bestätigen. Download aus dem fest konfigurierten GitHub-Repository, genaue SHA256-Prüfung gegen `SHA256SUMS.txt`, dann sauberer Stopp und Installer-Neustart. Für private Releases ist ein Repository-Lese-Token in den Einstellungen erforderlich. Ohne Berechtigung bleibt manueller Download über den angemeldeten Browser möglich.

Installer/EXE sind derzeit unsigned; SHA256 ist eine Integritätsprüfung, keine unabhängige Codesignatur.
