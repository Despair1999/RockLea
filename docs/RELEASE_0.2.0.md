# RockLea 0.2.0

- Live-Envelope-Parser akzeptiert Data als Objekt oder einmal JSON-kodiertes Objekt. Direkt beobachtete Trainingsdaten wurden ohne Parserfehler verarbeitet.
- Eine Windows-Anwendung mit Statusfenster, Tray, Setup, Autostart und integrierter Prozessüberwachung.
- Backend, Discord und Collector starten automatisch; Node-Laufzeit enthalten.
- DPAPI-Konfiguration und Import alter lokaler PGlite-Installationen. Pairing, Outbox und Originaldateien bleiben erhalten.
- Dashboard behandelt abgelaufene Sitzungen und zeigt Collector-Status sowie direkte Verwaltungsaktionen.
- Release-Updateprüfung, SHA256-Prüfung und bestätigter Installer-Neustart.

Download **RockLea-Setup.exe**. Alternativ komplette **RockLea-Portable.zip** entpacken; Runtime-Ordner mit der EXE zusammenhalten. Windows 10/11 x64 mit .NET Framework 4.8. Unsigned Builds.

Bei bestehender 0.1.x-Installation zuerst alte Prozesse beenden, dann im Assistenten den alten Projektordner importieren. Keine neue leere Datenbank anlegen. Nutzdaten werden unter `%LOCALAPPDATA%\RockLea` aufbewahrt und durch Updates/Deinstallation nicht gelöscht.

Echte Training-Events wurden geprüft. Ein vollständig abgeschlossenes reales Online-Match mit Discord-Endergebnis wurde für dieses Release nicht beobachtet; automatisierte Integrationstests ersetzen diese Abnahme nicht.
