import { useState } from 'react';
import type { Store } from '../app/store';
import { BLUEPRINT, DOMAIN_NAME } from '../domain/blueprint';
import { importQuestions, importTasks, mergeById } from '../domain/importer';
import { parseState, serializeState } from '../domain/storage';
import { LLM_PROMPT } from '../domain/promptTemplate';
import type { Question } from '../domain/types';

interface Props {
  store: Store;
}

type ImportKind = 'questions' | 'tasks';

/** Inhalte: Import aus JSON/CSV, eigene Fragen anlegen, Backup exportieren/importieren. */
export function ContentView({ store }: Props) {
  const [kind, setKind] = useState<ImportKind>('questions');
  const [text, setText] = useState('');
  const [report, setReport] = useState<{ added: number; skipped: number; problems: string[] } | null>(null);
  const [draft, setDraft] = useState({
    topic: 'database_security',
    difficulty: 'medium' as Question['difficulty'],
    type: 'single' as Question['type'],
    question: '',
    options: ['', '', '', ''],
    correct: ['a'],
    explanation: '',
    docsReference: '',
    subtopic: '',
  });
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const runImport = () => {
    if (!text.trim()) {
      setReport({ added: 0, skipped: 0, problems: ['Kein Inhalt eingefügt.'] });
      return;
    }
    try {
      let added = 0;
      const problems: string[] = [];
      if (kind === 'questions') {
        const result = importQuestions(text);
        // store.questions enthält auch die eigenen Fragen: IDs aus data/questions/ werden so nicht dupliziert
        const merged = mergeById(store.questions, result.items);
        store.mutate((draftState) => {
          draftState.userQuestions.push(...merged.items);
        });
        added = merged.items.length;
        problems.push(...result.issues.map((i) => `${i.id}: ${i.reason}`), ...merged.issues.map((i) => `${i.id}: ${i.reason}`));
      } else {
        const result = importTasks(text);
        const merged = mergeById(store.state.userTasks, result.items);
        store.mutate((draftState) => {
          draftState.userTasks.push(...merged.items);
        });
        added = merged.items.length;
        problems.push(...result.issues.map((i) => `${i.id}: ${i.reason}`), ...merged.issues.map((i) => `${i.id}: ${i.reason}`));
      }
      setReport({ added, skipped: problems.length, problems: problems.slice(0, 20) });
      setText('');
    } catch (error) {
      setReport({ added: 0, skipped: 0, problems: [(error as Error).message] });
    }
  };

  const pickOption = (id: string) =>
    setDraft((prev) => {
      const has = prev.correct.includes(id);
      if (prev.type === 'multiple') {
        return { ...prev, correct: has ? prev.correct.filter((c) => c !== id) : [...prev.correct, id] };
      }
      return { ...prev, correct: [id] };
    });

  const addQuestion = () => {
    const options = draft.options
      .map((value, i) => ({ id: String.fromCharCode(97 + i), text: value.trim() }))
      .filter((o) => o.text.length > 0);
    if (!draft.question.trim()) {
      setFormMessage('Bitte die Frage ausfüllen.');
      return;
    }
    if (draft.type !== 'boolean' && options.length < 2) {
      setFormMessage('Mindestens zwei Antwortmöglichkeiten nötig.');
      return;
    }
    if (!draft.explanation.trim()) {
      setFormMessage('Eine Erklärung gehört zu jeder Frage (Lernmodus zeigt sie direkt).');
      return;
    }
    const usedIds = new Set([...store.questions, ...store.state.userQuestions].map((q) => q.id));
    let seq = store.state.userQuestions.length + 1;
    while (usedIds.has(`q-custom-${seq}`)) seq += 1;
    const question: Question = {
      id: `q-custom-${seq}`,
      type: draft.type,
      topic: draft.topic,
      difficulty: draft.difficulty,
      subtopic: draft.subtopic.trim() || undefined,
      question: draft.question.trim(),
      options: draft.type === 'boolean' ? undefined : options,
      correct: draft.correct.filter((id) => (draft.type === 'boolean' ? true : options.some((o) => o.id === id))),
      correctCount: draft.type === 'multiple' ? draft.correct.length : undefined,
      explanation: draft.explanation.trim(),
      docsReference: draft.docsReference.trim() || 'eigene Notiz',
      needsReview: true,
    };
    store.mutate((state) => {
      state.userQuestions.push(question);
    });
    setFormMessage(`Frage ${question.id} gespeichert und im Lernmodus dabei.`);
    setDraft({ ...draft, question: '', options: ['', '', '', ''], correct: ['a'], explanation: '', docsReference: '', subtopic: '' });
  };

  const removeQuestion = (id: string) =>
    store.mutate((state) => {
      state.userQuestions = state.userQuestions.filter((q) => q.id !== id);
    });

  const removeTask = (id: string) =>
    store.mutate((state) => {
      state.userTasks = state.userTasks.filter((t) => t.id !== id);
    });

  const exportBackup = () => {
    const blob = new Blob([serializeState(store.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `csa-lerntool-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    const content = await file.text();
    try {
      const restored = parseState(content);
      store.mutate((state) => {
        Object.assign(state, restored);
      });
      setReport({ added: 0, skipped: 0, problems: ['Backup eingespielt – Lernstand und eigene Inhalte wurden ersetzt.'] });
    } catch (error) {
      setReport({ added: 0, skipped: 0, problems: [`Backup konnte nicht gelesen werden: ${(error as Error).message}`] });
    }
  };

  return (
    <div>
      <div className="card">
        <h2>Inhalte ergänzen</h2>
        <p className="muted">
          Der Vorrat in <code>data/questions/</code> und <code>data/tasks/</code> ist die Basis. Eigene Fragen und
          Aufgaben kommen hinzu und bleiben lokal erhalten – sie überschreiben nichts.
        </p>
        <div className="row">
          <div className="field">
            <label>Import-Art</label>
            <select value={kind} onChange={(event) => setKind(event.target.value as ImportKind)}>
              <option value="questions">Fragen (JSON oder CSV)</option>
              <option value="tasks">Praxisaufgaben (JSON oder CSV)</option>
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="primary" onClick={runImport}>
              Importieren
            </button>
          </div>
          <div className="field">
            <label>Datei importieren</label>
            <input
              type="file"
              accept=".json,.csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((content) => setText(content));
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>JSON-Array oder CSV einfügen</label>
          <textarea
            value={text}
            placeholder={
              kind === 'questions'
                ? '[{ "id": "q-mine-001", "type": "single", "topic": "collaboration", "difficulty": "medium", "question": "…", "options": "Antwort A;Antwort B;Antwort C;Antwort D", "correct": "a", "explanation": "…", "docsReference": "Lists v3" }]'
                : '[{ "id": "t-mine-001", "title": "…", "area": "self_service", "difficulty": "beginner", "estimatedMinutes": 20, "scenario": "…", "requirements": "Punkt 1;Punkt 2;Punkt 3", "hints": "Hinweis 1;Hinweis 2;Hinweis 3", "solution": "…", "commonMistakes": "…", "examRelevance": "…" }]'
            }
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <p className="muted">
          CSV-Spalten Fragen: id,type,topic,difficulty,subtopic,question,options,correct,explanation,docsReference,needsReview.{' '}
          CSV-Spalten Aufgaben: id,title,area,difficulty,estimatedMinutes,scenario,requirements,hints,solution,commonMistakes,examRelevance.{' '}
          Spaltengetrennt mit <kbd>,</kbd> oder <kbd>;</kbd> (an der Kopfzeile erkannt) – mehrere Werte in einer Zelle mit{' '}
          <kbd>|</kbd> trennen, bei Komma-Spalten auch <kbd>;</kbd>. Zeilen mit falscher Spaltenzahl werden mit Hinweis
          abgelehnt. Verständnisfragen und eigene Variablen-Pools gehen nur per JSON.
        </p>
        {report ? (
          <div className="explain">
            <strong>
              {report.added} importiert, {report.skipped} übersprungen
            </strong>
            {report.problems.length > 0 ? (
              <ul>
                {report.problems.map((problem, i) => (
                  <li key={i}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Eigene Frage anlegen</h2>
        <div className="grid">
          <div className="field">
            <label>Bereich</label>
            <select value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })}>
              {BLUEPRINT.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.weight} % · {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Typ</label>
            <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Question['type'], correct: ['a'] })}>
              <option value="single">Einzelantwort</option>
              <option value="multiple">Mehrfachantwort</option>
              <option value="boolean">Wahr / Falsch</option>
            </select>
          </div>
          <div className="field">
            <label>Schwierigkeit</label>
            <select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as Question['difficulty'] })}>
              <option value="easy">leicht</option>
              <option value="medium">mittel</option>
              <option value="hard">schwer</option>
            </select>
          </div>
          <div className="field">
            <label>Unterthema (optional)</label>
            <input value={draft.subtopic} placeholder="z. B. Notifications" onChange={(event) => setDraft({ ...draft, subtopic: event.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Frage</label>
          <textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} />
        </div>
        {draft.type !== 'boolean' ? (
          <div className="field">
            <label>Antworten (richtige anklicken)</label>
            {draft.options.map((option, i) => {
              const id = String.fromCharCode(97 + i);
              return (
                <div className="row" key={id}>
                  <button
                    className={`ghost ${draft.correct.includes(id) ? 'active' : ''}`}
                    onClick={() => pickOption(id)}
                    title="richtig bzw. falsch markieren"
                  >
                    {id}
                  </button>
                  <input
                    style={{ flex: 1 }}
                    value={option}
                    onChange={(event) => {
                      const next = [...draft.options];
                      next[i] = event.target.value;
                      setDraft({ ...draft, options: next });
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">Antwortmöglichkeiten: Richtig / Falsch – richtige Variante anklicken.</p>
        )}
        {draft.type === 'boolean' ? (
          <div className="field">
            <label>richtige Antwort</label>
            <select value={draft.correct[0] ?? 'a'} onChange={(event) => setDraft({ ...draft, correct: [event.target.value] })}>
              <option value="a">Richtig</option>
              <option value="b">Falsch</option>
            </select>
          </div>
        ) : null}
        <div className="field">
          <label>Erklärung</label>
          <textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} />
        </div>
        <div className="field">
          <label>Doku-Stichwort</label>
          <input value={draft.docsReference} placeholder="z. B. ACLs" onChange={(event) => setDraft({ ...draft, docsReference: event.target.value })} />
        </div>
        <div className="row">
          <button className="primary" onClick={addQuestion}>
            Frage speichern
          </button>
        </div>
        {formMessage ? <p className="muted">{formMessage}</p> : null}
      </div>

      <div className="card">
        <h2>Eigene Inhalte ({store.state.userQuestions.length} Fragen, {store.state.userTasks.length} Aufgaben)</h2>
        {store.state.userQuestions.length === 0 && store.state.userTasks.length === 0 ? (
          <p className="muted">Noch nichts eigene ergänzt.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Art</th>
                <th>Bereich</th>
                <th>Inhalt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {store.state.userQuestions.map((q) => (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>Frage</td>
                  <td>{DOMAIN_NAME(q.topic)}</td>
                  <td>{q.question}</td>
                  <td>
                    <button className="ghost" onClick={() => removeQuestion(q.id)}>
                      löschen
                    </button>
                  </td>
                </tr>
              ))}
              {store.state.userTasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>Aufgabe</td>
                  <td>{DOMAIN_NAME(t.area)}</td>
                  <td>{t.title}</td>
                  <td>
                    <button className="ghost" onClick={() => removeTask(t.id)}>
                      löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Backup</h2>
        <p className="muted">
          Lernstand, Notizen und eigene Inhalte liegen lokal im Browser (IndexedDB <code>csa-lerntool</code>). Ein
          Export erzeugt eine JSON-Datei, ein Import ersetzt den aktuellen Stand.
        </p>
        <div className="row">
          <button className="primary" onClick={exportBackup}>
            Fortschritt exportieren
          </button>
          <input type="file" accept=".json" onChange={(event) => void importBackup(event.target.files?.[0])} />
        </div>
      </div>

      <div className="card">
        <h2>Fragen mit einer KI ergänzen</h2>
        <p className="muted">
          Vorlage kopieren, in ein beliebiges Sprachmodell einfügen und das Ergebnis oben importieren. Die Vorlage
          erzwingt eigenes Formulieren und die Felder, die der Validator erwartet.
        </p>
        <div className="field">
          <textarea style={{ minHeight: 260 }} readOnly value={LLM_PROMPT} onFocus={(event) => event.currentTarget.select()} />
        </div>
        <p className="muted">
          Nach dem Import gilt wie bisher: unklare Inhalte bekommen <code>needsReview</code> und erscheinen in der
          Oberfläche mit dem Hinweis „Inhalt prüfen“.
        </p>
      </div>
    </div>
  );
}
