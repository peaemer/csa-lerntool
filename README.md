# CSA-Lerntool (ServiceNow Certified System Administrator)

Lokal lauffähige Web-App zur Vorbereitung auf die **CSA Mainline Exam**-Prüfung: Fragen-Trainer,
Prüfungssimulation nach Blueprint-Gewichtung, Praxisaufgaben-Generator (SNAF) für die eigene PDI,
Leitner-Wiederholung, Statistik und Import eigener Inhalte.

- Oberfläche komplett **Deutsch**, ServiceNow-Fachbegriffe bleiben **englisch**
  (Business Rule, Update Set, ACL, Catalog Item, Transform Map …).
- **Kein Login, kein Server, keine Cloud:** Inhalte liegen als JSON im Projekt, der Lernstand im Browser
  (IndexedDB, Fallback localStorage).
- Alle Fragen und Aufgaben sind **selbst formulierte Übungsinhalte, keine Prüfungsfragen/Dumps**.
  Inhaltliche Unsicherheiten (Releasestand, UI-Benennung) sind mit `needsReview: true` markiert und
  werden in der App als „Inhalt prüfen“ angezeigt.

## Start

Voraussetzung: Node.js 18+ (getestet mit Node 20/22) und npm.

```bash
npm install
npm run dev        # Entwicklung → http://localhost:5173
npm run test       # Vitest-Tests (Domain-Logik)
npm run validate   # prüft data/questions/*.json und data/tasks/*.json gegen das Schema
npm run build      # tsc --noEmit + Produktions-Build nach dist/
npm run preview    # gebauten Stand lokal ausliefern
```

## Funktionen

| Bereich | Was passiert dort |
|---|---|
| **Lernmodus** | Fragen beantworten, sofortige Auswertung inkl. Erklärung, Doku-Stichwort und Leitner-Box. Fällige Fragen (Box 1 täglich, Box 2 nach 2, Box 3 nach 4, Box 4 nach 8, Box 5 nach 14 Tagen) kommen zuerst. |
| **Prüfungssimulation** | 20/30/45/60 Fragen, frei wählbare Zeit (Standard 90 min), Fragenanzahl je Blueprint-Bereich einstellbar. Fragen navigierbar, markierbar (F), Timer, Auswertung pro Bereich, keine Teilpunkte. |
| **Schwächen-Training** | Nur Fragen mit Fehlversuchen bzw. niedriger Trefferquote, gewichtet nach Bereich + Leitner-Box. |
| **Praxisaufgaben (SNAF)** | Zufällige Praxisaufgabe zum Nachbauen in der PDI: Szenario, Checkliste zum Abhaken, 3 Hinweis-Stufen, Musterlösung (Klickpfad), Häufige Fehler, Prüfungsbezug, Verständnisfragen, Notiz und Status (offen / in Arbeit / erledigt). |
| **Statistik** | Gewichtete Trefferquote (Blueprint), Trefferquote je Bereich, Tagesverlauf, Problemfragen, Zahlen zu Versuchen und fälligen Fragen, bisherige Simulationen. |
| **Inhalte & Import** | JSON-/CSV-Import für Fragen und Aufgaben, eigenes Frageformular, Backup exportieren/importieren, Vorlage für KI-gestützte Fragen. |

**Tastatur:** `1`–`9` Antwort wählen · `Enter` prüfen bzw. weiter · `F` Frage markieren (nur in der
Prüfungssimulation) · `←` / `→` in der Simulation blättern.

## Projektstruktur

```
data/questions/<bereich>.json   Fragen, eine Datei pro Blueprint-Bereich
data/tasks/<bereich>.json       Praxisaufgaben, eine Datei pro Bereich
src/main.tsx           Einstiegspunkt, src/styles.css (hell/dunkel)
src/app/               store.ts (State + Persistenz), App.tsx (Shell/Navigation), useKeyboard.ts
src/domain/            types, blueprint, scoring, progress, stats, taskgen, storage, importer,
                       present (Text-Bausteine der UI), content, promptTemplate, rng
src/views/             LearnView, ExamView, WeaknessView, TasksView, StatsView, ContentView
src/components/        QuestionCard, FiltersBar, QuizRunner
scripts/validate-data.mjs       Schema-Check für die JSON-Inhalte
tests/               Vitest: selection, grading, leitner, progress, stats, storage, taskgen, importer
```

Inhalte werden über `src/domain/content.ts` eingebunden: alle `data/questions/*.json` und
`data/tasks/*.json` werden eingelesen. **Neue Datei anlegen = neuer Inhalt**, ohne Code-Änderung.

## Fragen-Schema (`data/questions/*.json`)

Datei enthält ein JSON-Array mit Fragen:

```json
{
  "id": "q-db-001",
  "type": "single",
  "topic": "database_security",
  "difficulty": "medium",
  "subtopic": "Data Schema",
  "question": "Fragestellung auf Deutsch?",
  "options": [
    { "id": "a", "text": "Antwortmöglichkeit" },
    { "id": "b", "text": "Antwortmöglichkeit" }
  ],
  "correct": ["a"],
  "correctCount": 1,
  "explanation": "Warum die Antwort stimmt – und warum die anderen falsch sind.",
  "docsReference": "Data Schema",
  "needsReview": false
}
```

| Feld | Regeln |
|---|---|
| `id` | eindeutig, Konvention `q-<bereichskürzel>-<nr>` (Duplikate werden vom Import übersprungen) |
| `type` | `single` (1 richtig), `multiple` (2–3 richtige), `boolean` (Wahr/Falsch) |
| `topic` | einer der Blueprint-Keys: `platform_navigation`, `instance_configuration`, `collaboration`, `self_service`, `database_security`, `migration_integration` |
| `difficulty` | `easy`, `medium`, `hard` |
| `options` | bei `single`/`multiple` in `data/` mindestens 4 (Import genügt 2); bei `boolean` weglassen (die App erzeugt „Wahr“/„Falsch“) |
| `correct` | IDs der richtigen Optionen; bei `multiple` muss `correctCount` passen |
| `correctCount` | bei `multiple` gesetzt (die Prüfung zeigt an, wie viele Antworten zu wählen sind) |
| `docsReference` | englisches Stichwort für die ServiceNow-Dokumentation |
| `needsReview` | `true`, wenn Inhalt/Version geprüft werden sollte |

Bewertung wie im echten Exam: **exakte Antwortmenge, kein Partial Credit**, leere Antwort = falsch.

## Aufgaben-Schema (`data/tasks/*.json`)

```json
{
  "id": "t-db-001",
  "title": "Feld {field} auf {table} anlegen",
  "area": "database_security",
  "difficulty": "beginner",
  "estimatedMinutes": 20,
  "scenario": "Szenario in einer fiktiven Instance …",
  "requirements": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "hints": ["Hinweis Stufe 1", "Hinweis Stufe 2", "Hinweis Stufe 3"],
  "solution": "Application Composer > … (Klickpfad)",
  "commonMistakes": ["Feld ohne u-Präfix angelegt"],
  "examRelevance": "Warum das prüfungsrelevant ist",
  "comprehensionQuestions": [{ "question": "Verständnisfrage?", "answer": "Musterantwort" }],
  "variables": { "table": ["u_laptop", "u_hardware"], "field": ["u_purchase_date"] }
}
```

- `area`: Blueprint-Key, `difficulty`: `beginner` | `advanced` | `exam`.
- `requirements` (Checkliste) und `hints` (drei Stufen) brauchen mindestens 3 Einträge.
- **Platzhalter** `{table}`, `{role}`, `{group}`, `{field}`, `{condition}`, `{app}`, `{user}` werden pro
  Durchlauf neu gewürfelt. Globale Pools sind in `src/domain/taskgen.ts` definiert (`GLOBAL_POOLS`); eine Aufgabe kann
  einzelne Pools mit `variables` überschreiben. Eine gespielte Variante (Task-ID + gewürfelte Werte) kommt
  erst wieder, wenn alle Varianten dieser Aufgabe durch sind – Notizen, Status und Checkliste bleiben dabei
  an der Aufgabe hängen. Sind alle Varianten eines Filters durch, zeigt die App einen Hinweis und kann die
  Varianten-Historie löschen.

Nach Änderungen an den JSON-Dateien: `npm run validate` (prüft u. a. unbekannte Themen/areas, zu wenige
Optionen, `correctCount`-Abweichungen, doppelte IDs, Platzhalter ohne Pool).

## Import (JSON und CSV)

Unter **Inhalte & Import** eigener Inhalt nachträglich ergänzbar – importiert wird in den lokalen
Speicher, die Dateien in `data/` bleiben unverändert. Duplikate werden anhand der `id` erkannt
(auch gegen den Standpool), kaputte Einträge werden mit Grund aufgelistet und übersprungen.

**JSON:** Format wie in `data/questions/*.json` (Array oder einzelnes Objekt).

**CSV für Fragen** – Spalten:
`id,type,topic,difficulty,subtopic,question,options,correct,explanation,docsReference,needsReview`

**CSV für Aufgaben** – Spalten:
`id,title,area,difficulty,estimatedMinutes,scenario,requirements,hints,solution,commonMistakes,examRelevance`

- Das Trennzeichen der Kopfzeile wird erkannt: `,`, `;` oder Tabulator. Datenzeilen mit abweichendem
  Trennzeichen werden zugeordnet, wenn die Spaltenanzahl passt.
- **Mehrfachwerte in einer Zelle** (Optionen, `correct`, `requirements`, `hints`, `commonMistakes`) mit `|`
  oder `;` trennen. Beispiel: `"Trigger|Conditions|Actions"` bzw. `"Trigger;Conditions;Actions"`. Achtung: Der
  Zelleninhalt wird nach dem CSV-Parsing zusätzlich an `;` und `|` getrennt – Antworttexte dürfen deshalb
  selbst kein Semikolon und keinen Senkrechten Strich enthalten.
- `correct` als Options-ID (`a`, `b`, …) oder Nummer (`1`, `2`, …).
- Zellen mit Sonderzeichen in `"..."` setzen (verdoppelte `""` innerhalb einer Zelle zählen als ein
  Anführungszeichen).
- Zeilen mit mehr/weniger Spalten als die Kopfzeile werden nicht geraten, sondern mit Hinweis abgelehnt.
- CSV-Zeilen durchlaufen **dieselbe Prüfung wie JSON** (bekannter `topic`/`area`, `type`, `question`,
  `explanation`, `docsReference`, mindestens zwei Optionen, mindestens drei Checklisten-Punkte und drei
  Hinweis-Stufen bei Aufgaben).
- CSV kann nur die flachen Felder abbilden. `comprehensionQuestions` und eigene `variables` (Platzhalter-Pools)
  gehen ausschließlich per JSON-Import.

## Lernstand, Backup und Löschen

Der gesamte Lernstand (Antwort-Historie, Leitner-Boxen, Prüfungsergebnisse, Aufgaben-Notizen/Status,
eigene Fragen/Aufgaben, Einstellungen) liegt in **IndexedDB** `csa-lerntool` (Store `state`, Key `app`);
falls der Browser IndexedDB ablehnt, in localStorage.

- **Backup:** Inhalte & Import → „Backup exportieren“ erzeugt eine JSON-Datei mit allem außer statischen
  Inhalten. „Backup importieren“ ersetzt den aktuellen Stand (mit Rückfrage).
- **Löschen:** im Browser die IndexedDB-Datenbank `csa-lerntool` löschen (Entwicklerwerkzeuge → Anwendung →
  IndexedDB) oder `localStorage.clear()` im Fallback-Fall. Dev-Daten können auch über die App selbst
  zurückgebaut werden: Aufgaben-Status zurücksetzen, Varianten-Historie löschen.

## Eigene Fragen mit einer KI ergänzen

In **Inhalte & Import** liegt eine Prompt-Vorlage (`src/domain/promptTemplate.ts`) zum Kopieren. Sie
erzwingt: eigene Formulierung statt Dumps, deutsche Fragen mit englischen Fachbegriffen, Blueprint-Treue,
das JSON-Schema oben und `needsReview: true` bei Unsicherheit. Ablauf:

1. Vorlage kopieren, `<ANZAHL>`, `<BEREICH-KEY>`, `<UNTERTHEMA>` und bestehende IDs einsetzen.
2. Antwort (JSON-Array) oben in „Inhalte ergänzen“ einfügen → Importieren.
3. `npm run validate` läuft nur über die Dateien in `data/`; importierten Inhalt danach bei Bedarf in eine
   `data/questions/*.json` übertragen, damit er versioniert ist.

**Bitte prüfen:** KI-Ergebnisse sind ungeprüft. Vor dem Lernen die `needsReview`-Fragen gegen die
ServiceNow-Dokumentation abgleichen.

## Blueprint und Prüfungsrahmen

Quelle des Blueprint (Domains, Gewichte, Unterthemen): ServiceNow Knowledge Base **KB0011554**, CSA
Mainline Exam, Stand Januar 2026 – gepflegt in `src/domain/blueprint.ts`.

| Bereich | Gewicht |
|---|---|
| Platform Overview and Navigation | 7 % |
| Instance Configuration | 10 % |
| Configuring Applications for Collaboration | 20 % |
| Self Service & Automation | 20 % |
| Database Management and Platform Security | 30 % |
| Data Migration and Integration | 13 % |

Prüfungsrahmen: 60 Fragen, 90 Minuten, Cut Score nicht publiziert. Die Simulation bildet das nach
(anpassbare Gewichte je Bereich, wählbare Fragenanzahl), ersetzt aber keine offizielle Angabe.

## Tests

`npm run test` (Vitest, aktuell 8 Dateien / 52 Tests) deckt die Domain-Logik ab:

- `selection.test.ts` – Blueprint-Verteilung und -Auswahl, Schwächen-Training, Reihenfolge im Lernmodus,
  reproduzierbarer Zufall
- `grading.test.ts` – Bewertung (exakte Antwortmengen, keine Teilpunkte) und Statuslogik
  (neu / in Arbeit / falsch / gemeistert)
- `leitner.test.ts` – Box-Wechsel, wachsende Intervalle, Fälligkeit, Priorität nach Fehlversuchen
- `progress.test.ts` – Versuchsprotokoll, Auswertung einer Simulation, `commitExam`
- `stats.test.ts` – lückenloser Tagesverlauf, Problemfragen, schwache Bereiche, Trefferquote je Modus,
  Statuszahlen
- `storage.test.ts` – Export/Import-Roundtrip des Lernstands, Trefferquote je Bereich und Prüfungsreife
- `taskgen.test.ts` – Platzhalterauflösung, keine Doppelvarianten, Gewichtung schwacher Bereiche, Statusfilter
- `importer.test.ts` – JSON- und CSV-Import (Trenner, Zelllisten, gemischte Trenner, Fehlerberichte)

Zufallslogik ist mit dem deterministischen PRNG `makeRng(seed)` (`src/domain/rng.ts`) testbar.

## Bekannte Grenzen

- Der Stand von ServiceNow-Oberflächen ändert sich mit jedem Release. Bei versionssensiblen Aussagen steht
  `needsReview: true` in den Daten bzw. „Inhalt prüfen“ in der App.
- Die Auswertung einer Simulation ist kein offizielles Ergebnis – der Cut Score ist nicht publiziert.
- Inhaltliche Korrektheit: Dieses Tool prüft nicht, ob eine Frage fachlich richtig ist – die `explanation`
  ist die einzige Quelle. Importierte oder per KI erzeugte Inhalte vor dem Lernen gegen die
  ServiceNow-Dokumentation abgleichen.
- Der Import prüft nur das Schema (und dass `correct` auf existierende Optionen zeigt), nicht die Fachlogik.
