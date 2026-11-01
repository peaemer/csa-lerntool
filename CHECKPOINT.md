# Projektstand (Stand: 01.11.2026)

Die App ist funktional fertig (siehe README.md für Bedienung, Datenformate und Grenzen).
Diese Datei ist nur die Notiz, um die Arbeit wieder aufzunehmen – Inhaltliches steht im README.

## Geprüfter Stand

- `npm run test` → 8 Dateien / 52 Tests grün
- `npx tsc --noEmit` → keine Fehler
- `npm run validate` → OK
- `npm run build` → OK (`dist/`)
- Alle sechs Ansichten im Browser geprüft (Lernmodus, Prüfungssimulation, Schwächen-Training,
  Praxisaufgaben, Statistik, Inhalte & Import), ohne Konsolenfehler
- Lernstand im Browser absichtlich **leer** übergeben (IndexedDB `csa-lerntool` gelöscht,
  `localStorage.clear()`), Prüf- und Importtests sind nicht mehr vorhanden

## Datenbestand

| Bereich | Fragen | Aufgaben |
|---|---|---|
| collaboration | 28 | 4 |
| database_security | 24 | 8 |
| instance_configuration | 15 | 3 |
| migration_integration | 18 | 5 |
| platform_navigation | 12 | 2 |
| self_service | 30 | 4 |
| **Gesamt** | **127** | **26** |

`npm run validate` zählt Fragen und Aufgaben zusammen pro Bereich.

## Offener Punkt: collaboration.json

Zwei Fassungen derselben Domain, Entscheidung noch offen:

- `data/questions/collaboration.json` – aktuell in Benutzung, **28** neu formulierte Fragen
- `checkpoints/collab_original_recovered.json` – **31** wiederhergestellte Fragen aus dem früheren
  Stand (nach einem Überschreiben wiederhergestellt, siehe Protokoll-Dateien in `checkpoints/`)

Würde die recovered-Fassung übernommen: `q-collab-023b` in `q-collab-032` umbenennen und
`q-collab-025` neu schreiben (Original nicht wiederherstellbar). Mehrere Antworten der recovered-Fassung
sind grenzwertig und behalten ihr `needsReview: true`.

## Sonstige Notizen

- Kein Git-Repo in diesem Projekt – alles liegt nur als Dateien auf der Disk. Empfehlung:
  `git init` und ein erster Commit, damit solche Zwischenstände reproduzierbar werden.
- `checkpoints/*.before.json` sind Sicherungen früherer Datenstände (instance_configuration,
  platform_navigation) und können gelöscht werden, sobald der aktuelle Stand abgenommen ist.
- Der Dev-Server läuft auf Port 5177 (`npx vite --port 5177 --strictPort`), weil 5173 belegt war.
