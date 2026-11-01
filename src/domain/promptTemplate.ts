/**
 * Vorlage, um mit einem Sprachmodell neue Übungsfragen zu erzeugen.
 * Kopieren, in ein Modell deiner Wahl einfügen, Ergebnis oben in „Inhalte ergänzen“ importieren.
 * Bewusst so gebaut, dass keine Original-Prüfungsfragen (Dumps) produziert werden sollen.
 */
export const LLM_PROMPT = `Du erstellst neue Übungsfragen für die ServiceNow Certified System Administrator (CSA) Mainline Exam-Prüfungsvorbereitung.

HARTE REGELN
1. Formuliere jede Frage selbst, frei aus dem Verständnis des Stoffs. Keine Prüfungsfragen, keine kopierten Originalfragen oder Dumps. Wenn dir eine echte Prüfungsfrage bekannt zu sein scheint: nicht verwenden.
2. Sprache: Fragen, Antworten und Erklärungen auf Deutsch; ServiceNow-Fachbegriffe bleiben englisch (Business Rule, ACL, Update Set, Transform Map, Catalog Item, Import Set, Form Layout ...).
3. Inhaltlich nur Themen des offiziellen Blueprints (siehe Bereichsliste unten). Bleib auf CSA-Niveau, kein Custom-App-Entwickler-Tiefgang.
4. Wenn du bei einer Tatsache unsicher bist (Produktversion, UI-Benennung, Releasestand): setze "needsReview": true und schreibe in die Erklärung, was zu prüfen ist.
5. Erkläre in 2-4 Sätzen, warum die richtige Antwort stimmt UND warum die wichtigsten Alternativen falsch sind.
6. Antworte ausschließlich mit einem JSON-Array, ohne Markdown, ohne Kommentar.

SCHEMA PRO FRAGE (Reihenfolge der Felder beibehalten)
{
  "id": "q-<bereich>-<dreistellige laufende nummer>",
  "type": "single" | "multiple" | "boolean",
  "topic": "<einer der Bereichs-Keys>",
  "difficulty": "easy" | "medium" | "hard",
  "subtopic": "<Unterthema aus dem Blueprint>",
  "question": "<Fragestellung>",
  "options": [{ "id": "a", "text": "..." }, { "id": "b", "text": "..." }],
  "correct": ["a"],
  "correctCount": 1,
  "explanation": "<Warum richtig, warum die anderen falsch>",
  "docsReference": "<Stichwort aus der ServiceNow-Dokumentation, englisch>",
  "needsReview": false
}

BEREICHE (Key, Name, Gewicht der Prüfung)
- platform_navigation – Platform Overview and Navigation – 7 %
- instance_configuration – Instance Configuration – 10 %
- collaboration – Configuring Applications for Collaboration – 20 %
- self_service – Self Service & Automation – 20 %
- database_security – Database Management and Platform Security – 30 %
- migration_integration – Data Migration and Integration – 13 %

REGELN FÜR DIE AUSWAHL
- single: genau 4 Optionen, genau 1 richtig.
- multiple: 4-5 Optionen, genau 2 oder 3 richtig; "correctCount" = Anzahl von "correct"; in der Frage steht ausdrücklich "Wählen Sie genau N Antworten.".
- boolean: 2 Optionen mit ids "a" ("Wahr") und "b" ("Falsch").
- Distraktoren müssen plausibel sein (häufige Denkfehler: UI Policy vs. Data Policy, ACL vs. Field Permission, Form Template vs. Form Layout, Update Set vs. Application File, Business Rule-Typen before/after/async).
- Nicht alle richtigen Antworten an dieselbe Position setzen.
- Mische den Schwierigkeitsgrad: etwa 30 % easy, 50 % medium, 20 % hard.

AUFGABE
Erzeuge <ANZAHL> Fragen zum Bereich <BEREICH-KEY>, Unterthema: <UNTERTHEMA>.
Nutze IDs, die im folgenden Bestand noch nicht vorkommen: <BESTEHENDE IDS>.
Prüfe vor der Ausgabe: jedes "correct" ist eine existierende Options-ID; "correctCount" passt; das JSON ist gültig (Anführungszeichen im Text mit Backslash escapen).`;
