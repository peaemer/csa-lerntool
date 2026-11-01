import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboard } from '../app/useKeyboard';
import type { Store } from '../app/store';
import { BLUEPRINT, DOMAIN_NAME } from '../domain/blueprint';
import { commitExam, evaluateExam, type ExamOutcome, type ExamSession } from '../domain/progress';
import { displayOptions, selectHint } from '../domain/present';
import { makeRng, randomSeed, shuffle } from '../domain/rng';
import { planExam } from '../domain/blueprint';
import { selectExamQuestions } from '../domain/scoring';
import type { Question, QuestionOption } from '../domain/types';
import { QuestionCard } from '../components/QuestionCard';

interface Props {
  store: Store;
}

const QUESTION_COUNTS = [20, 30, 45, 60];

function mmss(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Prüfungssimulation: Blueprint-gewichtete Auswahl, Timer, Markieren, Auswertung pro Domain. */
export function ExamView({ store }: Props) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [orders, setOrders] = useState<Record<string, QuestionOption[]>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [outcome, setOutcome] = useState<ExamOutcome | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'flagged' | 'unanswered'>('all');
  const finishedRef = useRef(false);
  const rngRef = useRef(makeRng(randomSeed()));

  const settings = store.state.settings;

  const plan = useMemo(
    () => planExam(BLUEPRINT, settings.examQuestions, settings.weights),
    [settings.examQuestions, settings.weights]
  );

  const available = useMemo(() => {
    const byTopic = new Map<string, number>();
    for (const q of store.questions) byTopic.set(q.topic, (byTopic.get(q.topic) ?? 0) + 1);
    return byTopic;
  }, [store.questions]);

  const start = () => {
    const rng = makeRng(randomSeed());
    rngRef.current = rng;
    const picked = selectExamQuestions(store.questions, store.state, rng, Date.now(), settings.examQuestions);
    const orderMap: Record<string, QuestionOption[]> = {};
    for (const q of picked) {
      const options = displayOptions(q);
      orderMap[q.id] = settings.shuffleAnswers ? shuffle(options, rng) : options;
    }
    finishedRef.current = false;
    setOutcome(null);
    setReviewFilter('all');
    setQuestions(picked);
    setOrders(orderMap);
    setIndex(0);
    setRemaining(settings.examMinutes * 60);
    setSession({ ids: picked.map((q) => q.id), answers: {}, flags: [], startedAt: Date.now() });
  };

  const finish = useCallback(() => {
    if (!session || finishedRef.current) return;
    finishedRef.current = true;
    const now = Date.now();
    const result = evaluateExam(questions, session, now);
    store.mutate((draft) => {
      commitExam(draft, result, now);
    });
    setOutcome(result);
    setSession(null);
  }, [session, questions, store]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          finish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [session, finish]);

  const current = session ? questions[index] : undefined;
  const currentOptions = current ? orders[current.id] ?? displayOptions(current) : [];

  const toggleFlag = useCallback(
    (questionId: string) => {
      setSession((prev) => {
        if (!prev) return prev;
        const flags = prev.flags.includes(questionId)
          ? prev.flags.filter((id) => id !== questionId)
          : [...prev.flags, questionId];
        return { ...prev, flags };
      });
    },
    []
  );

  const answer = (optionId: string) => {
    if (!session || !current) return;
    setSession((prev) => {
      if (!prev) return prev;
      const existing = prev.answers[current.id] ?? [];
      const given =
        current.type === 'multiple'
          ? existing.includes(optionId)
            ? existing.filter((id) => id !== optionId)
            : [...existing, optionId]
          : [optionId];
      return { ...prev, answers: { ...prev.answers, [current.id]: given } };
    });
  };

  useKeyboard(
    (event) => {
      if (!session || !current) return;
      const number = Number(event.key);
      if (number >= 1 && number <= currentOptions.length) {
        answer(currentOptions[number - 1].id);
        event.preventDefault();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        toggleFlag(current.id);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight') {
        setIndex((i) => Math.min(questions.length - 1, i + 1));
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
        event.preventDefault();
      }
    },
    [session, current, currentOptions, questions.length, answer, toggleFlag]
  );

  if (outcome) {
    const result = outcome.result;
    return (
      <div>
        <div className="card">
          <h2>Auswertung der Prüfungssimulation</h2>
          <div className="grid">
            <div className="stat">
              <div className="num">{result.scorePercent} %</div>
              <div className="muted">
                {result.correctCount} von {result.totalQuestions} richtig
              </div>
            </div>
            <div className="stat">
              <div className="num">{mmss(Math.round(result.durationMs / 1000))}</div>
              <div className="muted">Bearbeitungszeit</div>
            </div>
            <div className="stat">
              <div className="num">{result.flagged.length}</div>
              <div className="muted">markierte Fragen</div>
            </div>
          </div>
          <p className="muted">
            Offizielle CSA-Prüfung: 60 Fragen in 90 Minuten, keine Teilpunkte. Der Cut Score wird von ServiceNow nicht
            veröffentlicht – die Prozentzahl hier ist nur dein Stand in dieser Simulation.
          </p>
        </div>

        <div className="card">
          <h3>Ergebnis pro Themenbereich</h3>
          <table>
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Gewicht</th>
                <th>Fragen</th>
                <th>Richtig</th>
                <th>Quote</th>
              </tr>
            </thead>
            <tbody>
              {BLUEPRINT.map((domain) => {
                const stats = result.perTopic[domain.key];
                if (!stats) return null;
                return (
                  <tr key={domain.key}>
                    <td>{domain.name}</td>
                    <td>{domain.weight} %</td>
                    <td>{stats.asked}</td>
                    <td>{stats.correct}</td>
                    <td>
                      <span className={`badge ${stats.percent >= 70 ? 'ok' : stats.percent >= 50 ? 'warn' : 'bad'}`}>
                        {stats.percent} %
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="row between">
            <h3>Alle Fragen</h3>
            <div className="row">
              <button className={`ghost ${reviewFilter === 'all' ? 'active' : ''}`} onClick={() => setReviewFilter('all')}>
                alle
              </button>
              <button className={`ghost ${reviewFilter === 'flagged' ? 'active' : ''}`} onClick={() => setReviewFilter('flagged')}>
                nur markierte ({result.flagged.length})
              </button>
              <button className={`ghost ${reviewFilter === 'unanswered' ? 'active' : ''}`} onClick={() => setReviewFilter('unanswered')}>
                nur unbeantwortete ({outcome.items.filter((item) => item.given.length === 0).length})
              </button>
            </div>
          </div>
          {outcome.items
            .map((item, i) => ({ item, i }))
            .filter(({ item }) =>
              reviewFilter === 'flagged'
                ? result.flagged.includes(item.question.id)
                : reviewFilter === 'unanswered'
                  ? item.given.length === 0
                  : true
            )
            .map(({ item, i }) => (
              <details key={item.question.id}>
                <summary>
                  <span className={`badge ${item.correct ? 'ok' : 'bad'}`}>{item.correct ? 'richtig' : 'falsch'}</span>{' '}
                  {item.given.length === 0 ? <span className="badge">keine Antwort</span> : null}{' '}
                  {result.flagged.includes(item.question.id) ? <span className="badge warn">markiert</span> : null}{' '}
                  {i + 1}. {item.question.question}
                </summary>
              <ul className="options">
                {(orders[item.question.id] ?? displayOptions(item.question)).map((option) => {
                  const isRight = item.question.correct.includes(option.id);
                  const wasGiven = item.given.includes(option.id);
                  return (
                    <li key={option.id} className={isRight ? 'right' : wasGiven ? 'fail' : ''}>
                      <span>{option.text}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="muted">Deine Antwort: {item.given.length ? item.given.join(', ') : 'keine Antwort'} · richtig: {item.question.correct.join(', ')}</p>
              <p>{item.question.explanation}</p>
              <p className="muted">{DOMAIN_NAME(item.question.topic)} · Doku: {item.question.docsReference}</p>
            </details>
          ))}
          {outcome.items.every((item) =>
            reviewFilter === 'flagged'
              ? !result.flagged.includes(item.question.id)
              : reviewFilter === 'unanswered'
                ? item.given.length > 0
                : false
          ) ? (
            <p className="muted">
              {reviewFilter === 'flagged' ? 'Keine Frage war markiert.' : 'Alle Fragen waren beantwortet.'}
            </p>
          ) : null}
          <div className="row">
            <button className="primary" onClick={() => setOutcome(null)}>
              Neue Simulation
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <div className="card">
          <h2>Prüfungssimulation starten</h2>
          <p className="muted">
            Auswahl nach Blueprint-Gewichtung, unbeantwortete Fragen gelten als falsch, keine Teilpunkte.
            Tastatur: <kbd>1</kbd>–<kbd>9</kbd> antworten, <kbd>F</kbd> markieren, <kbd>←</kbd>/<kbd>→</kbd> blättern.
          </p>
          <div className="grid">
            <div className="field">
              <label>Anzahl Fragen</label>
              <select
                value={String(settings.examQuestions)}
                onChange={(event) =>
                  store.mutate((draft) => {
                    draft.settings.examQuestions = Number(event.target.value);
                  })
                }
              >
                {QUESTION_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Dauer (Minuten)</label>
              <input
                type="number"
                min={5}
                max={240}
                value={settings.examMinutes}
                onChange={(event) =>
                  store.mutate((draft) => {
                    draft.settings.examMinutes = Math.max(5, Number(event.target.value) || 90);
                  })
                }
              />
            </div>
          </div>

          <h3>Gewichtung je Themenbereich</h3>
          <table>
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Gewicht (%)</th>
                <th>Fragen in dieser Simulation</th>
                <th>im Pool verfügbar</th>
              </tr>
            </thead>
            <tbody>
              {BLUEPRINT.map((domain) => {
                const weight = settings.weights[domain.key] ?? domain.weight;
                const count = plan.find((p) => p.key === domain.key)?.count ?? 0;
                const has = available.get(domain.key) ?? 0;
                return (
                  <tr key={domain.key}>
                    <td>{domain.name}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        style={{ width: 80 }}
                        value={weight}
                        onChange={(event) =>
                          store.mutate((draft) => {
                            draft.settings.weights[domain.key] = Math.max(0, Number(event.target.value) || 0);
                          })
                        }
                      />
                    </td>
                    <td>{count}</td>
                    <td className={has < count ? 'muted' : ''}>{has}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <button className="primary" onClick={start} disabled={store.questions.length === 0}>
              Simulation starten
            </button>
            <button
              className="ghost"
              onClick={() =>
                store.mutate((draft) => {
                  draft.settings.weights = Object.fromEntries(BLUEPRINT.map((d) => [d.key, d.weight]));
                  draft.settings.examQuestions = 60;
                  draft.settings.examMinutes = 90;
                })
              }
            >
              Blueprint-Standard herstellen
            </button>
          </div>
          {store.questions.length < settings.examQuestions ? (
            <p className="muted">
              Hinweis: Es gibt {store.questions.length} Fragen im Pool, ausgewählt werden
              {' '}
              {Math.min(store.questions.length, settings.examQuestions)}. Für die volle Prüfungssimulation später
              Fragen ergänzen oder Anzahl reduzieren.
            </p>
          ) : null}
        </div>

        {store.state.examResults.length > 0 ? (
          <div className="card">
            <h3>Bisherige Simulationen</h3>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Fragen</th>
                  <th>Ergebnis</th>
                  <th>Dauer</th>
                </tr>
              </thead>
              <tbody>
                {store.state.examResults
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.timestamp).toLocaleString('de-DE')}</td>
                      <td>{r.correctCount}/{r.totalQuestions}</td>
                      <td>{r.scorePercent} %</td>
                      <td>{mmss(Math.round(r.durationMs / 1000))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  const answered = session.ids.filter((id) => (session.answers[id] ?? []).length > 0).length;
  const hint = current ? selectHint(current) : null;

  return (
    <div>
      <div className="card">
        <div className="row between">
          <span className="muted">
            Frage {index + 1} von {questions.length} · {answered} beantwortet
          </span>
          <span className={`timer ${remaining < 300 ? 'badge bad' : ''}`}>
            {mmss(remaining)} verbleibend
          </span>
        </div>
        <div className="bar-progress">
          <div style={{ width: `${(answered / Math.max(1, questions.length)) * 100}%` }} />
        </div>
        <div className="qnav" style={{ marginTop: 10 }}>
          {questions.map((q, i) => {
            const isAnswered = (session.answers[q.id] ?? []).length > 0;
            const isFlagged = session.flags.includes(q.id);
            return (
              <button
                key={q.id}
                className={`${i === index ? 'current' : ''} ${isAnswered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''}`}
                onClick={() => setIndex(i)}
                title={DOMAIN_NAME(q.topic)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            zurück
          </button>
          <button className="ghost" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={index === questions.length - 1}>
            weiter
          </button>
          {current ? (
            <button className={`ghost ${session.flags.includes(current.id) ? 'active' : ''}`} onClick={() => toggleFlag(current.id)}>
              {session.flags.includes(current.id) ? 'Markierung entfernen' : 'Frage markieren'} (F)
            </button>
          ) : null}
          <button className="primary" onClick={finish}>
            Prüfung abgeben
          </button>
        </div>
      </div>

      {current ? (
        <QuestionCard
          question={current}
          options={currentOptions}
          selected={session.answers[current.id] ?? []}
          revealed={false}
          onPick={answer}
        />
      ) : null}

      {hint ? <p className="muted">{hint} – wie in der echten Prüfung wird die Anzahl genannt.</p> : null}
    </div>
  );
}
