import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeyboard } from '../app/useKeyboard';
import type { Store } from '../app/store';
import { recordAttempt } from '../domain/progress';
import { displayOptions } from '../domain/present';
import { gradeQuestion, LEITNER_INTERVALS } from '../domain/scoring';
import { makeRng, randomSeed, shuffle } from '../domain/rng';
import type { AnswerRecord, Question, QuestionOption } from '../domain/types';
import { QuestionCard } from './QuestionCard';

/** Tage bis zur nächsten Leitner-Wiederholung dieser Frage. */
function daysUntilRepeat(record: AnswerRecord) {
  const day = 24 * 60 * 60 * 1000;
  const interval = LEITNER_INTERVALS[Math.min(record.box, LEITNER_INTERVALS.length) - 1] * day;
  return Math.max(1, Math.ceil((record.lastSeen + interval - Date.now()) / day));
}

interface Props {
  store: Store;
  mode: 'learn' | 'weakness';
  pool: Question[];
  /** Optional: Nennzahl für die Fortschrittsanzeige (z. B. Fragen pro Runde im Schwächen-Training). */
  roundSize?: number;
  /** Wird für jede Runde neu aufgerufen; exclude = in dieser Runde bereits gesehene Fragen. */
  buildQueue: (exclude: string[]) => Question[];
}

/** Quiz mit sofortigem Feedback (Lernmodus und Schwächen-Training). */
export function QuizRunner({ store, mode, pool, roundSize, buildQueue }: Props) {
  const rng = useRef(makeRng(randomSeed())).current;
  const [seen, setSeen] = useState<string[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  const [order, setOrder] = useState<QuestionOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  const startedAt = useRef(Date.now());

  const advance = useCallback(
    (exclude: string[]) => {
      const queue = buildQueue(exclude);
      const question = queue[0];
      if (!question) {
        setCurrent(null);
        return null;
      }
      setCurrent(question);
      const options = displayOptions(question);
      setOrder(store.state.settings.shuffleAnswers ? shuffle(options, rng) : options);
      setSelected([]);
      setResult(null);
      startedAt.current = Date.now();
      setSeen((prev) => (prev.includes(question.id) ? prev : [...prev, question.id]));
      return question;
    },
    [buildQueue, rng, store.state.settings.shuffleAnswers]
  );

  useEffect(() => {
    if (!current && pool.length > 0) advance(seen);
  }, [pool, current, seen, advance]);

  const pick = (optionId: string) => {
    if (result !== null) return;
    setSelected((prev) => {
      if (current?.type === 'multiple') {
        return prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId];
      }
      return [optionId];
    });
  };

  const grade = () => {
    if (!current || result !== null || selected.length === 0) return;
    const correct = gradeQuestion(current, selected);
    const duration = Date.now() - startedAt.current;
    store.mutate((draft) => {
      recordAttempt(draft, current, selected, correct, mode, Date.now(), duration);
    });
    setResult(correct);
    setSession((prev) => ({ answered: prev.answered + 1, correct: prev.correct + (correct ? 1 : 0) }));
  };

  useKeyboard(
    (event) => {
      if (!current) return;
      const number = Number(event.key);
      if (number >= 1 && number <= order.length) {
        pick(order[number - 1].id);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        if (result === null) grade();
        else advance(seen);
        event.preventDefault();
      }
    },
    [current, order, selected, result, seen, advance]
  );

  if (pool.length === 0) {
    return (
      <div className="card">
        <p>Keine Fragen entsprechen dem aktuellen Filter. Filter anpassen oder eigene Fragen über „Inhalte &amp; Import“ ergänzen.</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card">
        <h2>Runde abgeschlossen</h2>
        <p className="muted">
          {session.answered} Fragen beantwortet, {session.correct} richtig ({Math.round((session.correct / Math.max(1, session.answered)) * 100)} %).
        </p>
        <div className="row">
          <button className="primary" onClick={() => { setSeen([]); advance([]); }}>
            Neue Runde starten
          </button>
          <button className="ghost" onClick={() => setSeen([])}>
            Runde zurücksetzen
          </button>
        </div>
      </div>
    );
  }

  const total = roundSize ?? pool.length;
  const progress = Math.round((seen.length / Math.max(1, total)) * 100);
  const record = current ? store.state.answers[current.id] : undefined;
  const repeatDays = result !== null && record ? daysUntilRepeat(record) : null;

  return (
    <div>
      <div className="card">
        <div className="row between">
          <span className="muted">
            Frage {seen.length} von {total} ({progress} % Runde)
          </span>
          <span className="muted">
            Diese Runde: {session.answered} beantwortet · {session.correct} richtig
          </span>
        </div>
        <div className="bar-progress">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      <QuestionCard
        question={current}
        options={order}
        selected={selected}
        revealed={result !== null}
        correct={result ?? undefined}
        record={record}
        onPick={pick}
      />

      <div className="row">
        {result === null ? (
          <button className="primary" onClick={grade} disabled={selected.length === 0}>
            Antworten prüfen
          </button>
        ) : (
          <button className="primary" onClick={() => advance(seen)}>
            Nächste Frage
          </button>
        )}
        {result !== null && record ? (
          <span className="muted">
            Leitner-Box {record.box} · nächste Wiederholung in {repeatDays} {repeatDays === 1 ? 'Tag' : 'Tagen'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
