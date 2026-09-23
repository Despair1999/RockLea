# Architektur

```text
Rocket League (Windows)
  -> localhost WebSocket / offizielles Event-Envelope
  -> Collector: Parser -> Whitelist-Projektion -> SQLite WAL Outbox
  -> HTTPS / Collector-Bearer-Token
  -> Fastify: Auth -> Schema -> Guild-Transaktion -> Match Processor
  -> PostgreSQL: Match-Snapshot + registrierte Memberstats + Eventextrakte
  -> Abgleich: Rekorde / Achievements / Recaps
  -> persistente Notification Queue -> discord.js
  -> React Dashboard über denselben HTTP-Origin
```

`apps/` enthält die vier Anwendungen. `packages/` enthält gemeinsame Runtime-Schemas, SQL-Repository, Parser, Statistiklogik, Rating-Verträge und Embed-Rendering. Ein gemeinsamer pnpm-Lockfile hält die Versionen konsistent. Die Anwendungen sind getrennte Prozesse, Shared-Pakete sind interne TypeScript-Module ohne zusätzliche Veröffentlichungs- oder Build-Abhängigkeiten.

SQL wird mit gebundenen Parametern über node-postgres ausgeführt. PGlite führt dieselben Migrationen und PostgreSQL-Abfragen für lokale Entwicklung und Tests aus. Produktions-CI wiederholt die Integrationstests zusätzlich gegen PostgreSQL 17.

## Konsistenz

Eine PostgreSQL-Zeilensperre auf der Guild serialisiert Matchänderungen auch bei mehreren Backend-Instanzen. Jede Delivery besitzt eine UUID; `receipts(collector_id,event_id)` verhindert doppelte Zustellung. `(guild_id,guid)` verhindert doppelte Matches. Matchmember sind eindeutig je Match, Member und Plattformidentität. Einzelne ungültige Nutzlasten werden mit einem Savepoint verworfen; andere Events laufen weiter. Datenbankausfälle rollen die Transaktion zurück, der Collector behält die Queue.

Der Matchzustand ist dauerhaft. Ein Neustart braucht keinen RAM-Cache zum Wiederaufbau. Monotone Zähler werden aus mehreren Beobachtungen zusammengeführt, unvollständige Werte bleiben fehlend. Das berücksichtigt Counter-Snapshots, stellt aber keine Autorität über manipulierte Collector-PCs her: Betreiber müssen den gepairten PCs vertrauen.

Goal/Hit/Statfeed-Deduplizierung verwendet einen kanonischen bereinigten Eventhash und Vorkommenszähler je Quelle. Die API liefert dafür keinen globalen eindeutigen Zeitstempel: Bei versetzten Beobachtungsfenstern können identische wiederholte Ereignisse nicht zweifelsfrei unterschieden werden. Eventkennzahlen heißen deshalb **beobachtet**; Match-Tore werden aus Scoreboard-Zählern berechnet.

Discord-Queue verwendet Leases, Backoff, persistierte Message-IDs und stabile Nonces. Ein unklarer Send-Erfolg wird wiederholt. Discord garantiert keine zeitlich unbeschränkte Exactly-once-Zustellung; nach einem Crash zwischen erfolgreichem Send und ID-Speicherung kann außerhalb des Discord-Nonce-Fensters eine doppelte Nachricht entstehen. Matchstatistiken bleiben davon unberührt.

## Abgeleitete Daten

Zeitfilter, Sessions und Leaderboards werden aus dauerhaft gespeicherten Matchmember-Zeilen berechnet. Persönliche und Server-Rekorde werden zusätzlich materialisiert; Achievements haben Unique-Constraints. Alle Match-/Rekordberechnungen tragen Version 1. Server-Matchzahlen verwenden eindeutige Match-IDs; Sieg-/Tor-Summen sind ausdrücklich Mitgliedsergebnisse.

Alle Datumswerte sind UTC/timestamptz. Luxon berechnet Kalendergrenzen in der Guild-Zeitzone, einschließlich Sommerzeit. Der Collector-Zeitstempel beschreibt Beobachtungszeit, keine garantiert synchronisierte Spielserverzeit.

## Sicherheit

Interne Bot-API verlangt einen separaten langen Schlüssel und wird am Caddy-Proxy nicht veröffentlicht. Collector-Token werden gehasht gespeichert, Windows schützt den lokalen Token mit benutzergebundener DPAPI. Dashboard verwendet serverseitige, gehashte, kurzlebige Sitzungen, HttpOnly-/SameSite-Cookies, OAuth-State und Origin-Prüfung bei Änderungen. Keine private Epic-API und keine Spielsteuerung.
