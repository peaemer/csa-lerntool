import { useMemo, useRef, useState } from 'react';
import type { Store } from '../app/store';
import { BLUEPRINT, DOMAIN_NAME } from '../domain/blueprint';
import { weakAreas } from '../domain/stats';
import { makeRng, randomSeed } from '../domain/rng';
import { applyTaskFilters, nextTask, renderTaskText } from '../domain/taskgen';
import type { ResolvedTask, Task } from '../domain/types';

interface Props {
  store: Store;
}

const STATUS_LABEL: Record<Task['difficulty'], string> = {
  beginner: 'Einsteiger',
  advanced: 'Fortgeschritten',
  exam: 'Prüfungsnah',
};

/** Praxisaufgaben-Generator (SNAF): Aufgabe ziehen, Checkliste abhaken, Notizen, Hinweise in drei Stufen. */
export function TasksView({ store }: Props) {
  const rng = useRef(makeRng(randomSeed())).current;
  const [task, setTask] = useState<ResolvedTask | null>(null);
  const [noVariants, setNoVariants] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState<{ area: string | null; difficulty: string | null; status: string }>({
    area: null,
    difficulty: null,
    status: 'open',
  });

  const pool = useMemo(
    () => applyTaskFilters(store.tasks, { area: filters.area, difficulty: filters.difficulty }),
    [store.tasks, filters.area, filters.difficulty]
  );

  const weak = useMemo(
    () => weakAreas(store.questions, store.state).map((a) => a.key),
    [store.questions, store.state]
  );

  const statusById = useMemo(() => {
    const map: Record<string, 'open' | 'working' | 'done'> = {};
    for (const t of store.tasks) map[t.id] = store.state.taskStatus[t.id] ?? 'open';
    return map;
  }, [store.tasks, store.state.taskStatus]);

  const openCount = pool.filter((t) => (store.state.taskStatus[t.id] ?? 'open') !== 'done').length;

  const pull = () => {
    const filtered = pool.filter((t) => {
      const status = store.state.taskStatus[t.id] ?? 'open';
      if (filters.status === 'all') return true;
      if (filters.status === 'open') return status !== 'done';
      if (filters.status === 'working') return status === 'working';
      return status === 'done';
    });
    const picked = nextTask(filtered, rng, store.state.seenTaskVariants, weak, statusById);
    if (!picked) {
      setTask(null);
      setNoVariants(true);
      return;
    }
    setNoVariants(false);
    setTask(picked);
    setHintLevel(0);
    setShowSolution(false);
    setAnswers({});
    store.mutate((draft) => {
      if (!draft.seenTaskVariants.includes(picked.variantKey)) draft.seenTaskVariants.push(picked.variantKey);
      if (!draft.taskStatus[picked.id]) draft.taskStatus[picked.id] = 'working';
    });
  };

  /** Varianten-Historie leeren: alle Aufgaben können wieder gezogen werden, Notizen/Status bleiben. */
  const clearSeenVariants = () => {
    store.mutate((draft) => {
      draft.seenTaskVariants = [];
    });
    setNoVariants(false);
  };

  const setStatus = (id: string, status: 'open' | 'working' | 'done') =>
    store.mutate((draft) => {
      draft.taskStatus[id] = status;
    });

  const toggleCheck = (id: string, step: number) =>
    store.mutate((draft) => {
      const checks = draft.taskChecks[id] ?? {};
      checks[step] = !checks[step];
      draft.taskChecks[id] = checks;
    });

  const setNote = (id: string, note: string) =>
    store.mutate((draft) => {
      draft.taskNotes[id] = note;
    });

  const checks = task ? store.state.taskChecks[task.id] ?? {} : {};
  const doneSteps = task ? task.requirements.filter((_, i) => checks[i]).length : 0;

  return (
    <div>
      <div className="card">
        <div className="row between">
          <h2>Praxisaufgaben (SNAF)</h2>
          <span className="muted">{openCount} Aufgaben offen im Filter</span>
        </div>
        <div className="row">
          <div className="field">
            <label>Bereich</label>
            <select value={filters.area ?? ''} onChange={(event) => setFilters({ ...filters, area: event.target.value || null })}>
              <option value="">Alle Bereiche</option>
              {BLUEPRINT.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.weight} % · {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Niveau</label>
            <select value={filters.difficulty ?? ''} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value || null })}>
              <option value="">Alle</option>
              <option value="beginner">Einsteiger</option>
              <option value="advanced">Fortgeschritten</option>
              <option value="exam">Prüfungsnah</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="open">offen / in Arbeit</option>
              <option value="working">in Arbeit</option>
              <option value="done">erledigt</option>
              <option value="all">alle</option>
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="primary" onClick={pull}>
              Aufgabe ziehen
            </button>
          </div>
        </div>
        <p className="muted">
          Tabellen, Rollen, Gruppen und Felder werden pro Durchlauf neu gewürfelt ({store.state.seenTaskVariants.length}{' '}
          Varianten bisher gesehen). Bereits gespielte Varianten kommen erst wieder, wenn alle Varianten dieses
          Bereichs durch sind. Schwache Bereiche erscheinen häufiger.
        </p>
      </div>

      {!task ? (
        <div className="card">
          <p className="muted">
            {noVariants
              ? 'Alle Varianten der gefilterten Aufgaben waren schon dabei. Filter ändern, als „erledigt“ markierte Aufgaben zurücksetzen oder die Varianten-Historie löschen.'
              : `Noch keine Aufgabe gezogen${pool.length === 0 ? ' – der Filter liefert keine Aufgaben' : ''}. Am besten in einer Personal Developer Instance (PDI) arbeiten und die Checkliste abhaken.`}
          </p>
          {noVariants ? (
            <div className="row">
              <button className="ghost" onClick={clearSeenVariants}>
                Varianten-Historie löschen
              </button>
              <span className="muted">Notizen, Status und Checklisten bleiben erhalten.</span>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row between">
              <div className="row">
                <span className="badge">{DOMAIN_NAME(task.area)}</span>
                <span className="badge">{STATUS_LABEL[task.difficulty]}</span>
                <span className="badge">ca. {task.estimatedMinutes} Minuten</span>
              </div>
              <div className="row">
                <button
                  className={`ghost ${statusById[task.id] === 'working' ? 'active' : ''}`}
                  onClick={() => setStatus(task.id, 'working')}
                >
                  in Arbeit
                </button>
                <button
                  className={`ghost ${statusById[task.id] === 'done' ? 'active' : ''}`}
                  onClick={() => setStatus(task.id, 'done')}
                >
                  erledigt
                </button>
                <button className="ghost" onClick={() => setStatus(task.id, 'open')}>
                  zurücksetzen
                </button>
              </div>
            </div>
            <h2>{renderTaskText(task.title, task.values)}</h2>
            <p>{renderTaskText(task.scenario, task.values)}</p>

            <h3>Checkliste ({doneSteps} von {task.requirements.length} abgehakt)</h3>
            <ul className="checklist">
              {task.requirements.map((requirement, i) => (
                <li key={i} className={checks[i] ? 'done' : ''}>
                  <input type="checkbox" checked={Boolean(checks[i])} onChange={() => toggleCheck(task.id, i)} />
                  <span>{renderTaskText(requirement, task.values)}</span>
                </li>
              ))}
            </ul>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Notizen für diese Aufgabe</label>
              <textarea
                value={store.state.taskNotes[task.id] ?? ''}
                placeholder="Was hat funktioniert, wo hast du suchen müssen, welche Fehlermeldung kam?"
                onChange={(event) => setNote(task.id, event.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h3>Hinweise</h3>
            <div className="hint-steps">
              {task.hints.slice(0, Math.max(1, hintLevel)).map((hint, i) => (
                <p key={i}>{renderTaskText(hint, task.values)}</p>
              ))}
            </div>
            <div className="row">
              <button className="ghost" onClick={() => setHintLevel((n) => Math.min(task.hints.length, n + 1))} disabled={hintLevel >= task.hints.length}>
                Nächsten Hinweis zeigen
              </button>
              <button className={`ghost ${showSolution ? 'active' : ''}`} onClick={() => setShowSolution((v) => !v)}>
                {showSolution ? 'Musterlösung verbergen' : 'Musterlösung zeigen'}
              </button>
            </div>
            {showSolution ? (
              <div className="explain">
                <strong>Musterlösung</strong>
                <p style={{ whiteSpace: 'pre-line' }}>{renderTaskText(task.solution, task.values)}</p>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3>Häufige Fehler</h3>
            <ul>
              {task.commonMistakes.map((mistake, i) => (
                <li key={i}>{renderTaskText(mistake, task.values)}</li>
              ))}
            </ul>
            <h3>Prüfungsbezug</h3>
            <p className="muted">{renderTaskText(task.examRelevance, task.values)}</p>
          </div>

          {task.comprehensionQuestions && task.comprehensionQuestions.length > 0 ? (
            <div className="card">
              <h3>Verständnisfragen</h3>
              {task.comprehensionQuestions.map((cq, i) => (
                <details key={i}>
                  <summary>{cq.question}</summary>
                  <button
                    className="ghost"
                    onClick={() => setAnswers((prev) => ({ ...prev, [i]: !prev[i] }))}
                  >
                    Antwort zeigen
                  </button>
                  {answers[i] ? <p>{cq.answer}</p> : null}
                </details>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="card">
        <h3>Fortschritt der Aufgaben</h3>
        <table>
          <thead>
            <tr>
              <th>Aufgabe</th>
              <th>Bereich</th>
              <th>Niveau</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {store.tasks.slice(0, 40).map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{DOMAIN_NAME(t.area)}</td>
                <td>{STATUS_LABEL[t.difficulty]}</td>
                <td>
                  <select
                    value={statusById[t.id]}
                    onChange={(event) => setStatus(t.id, event.target.value as 'open' | 'working' | 'done')}
                  >
                    <option value="open">offen</option>
                    <option value="working">in Arbeit</option>
                    <option value="done">erledigt</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
