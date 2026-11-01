import { describe, expect, it } from 'vitest';
import { accuracyByMode, dailySeries, problemQuestions, statusCounts, weakAreas } from '../src/domain/stats';
import { applyAnswer } from '../src/domain/scoring';
import { emptyState } from '../src/domain/storage';
import type { AppState, AttemptRecord, Question } from '../src/domain/types';

const DAY = 24 * 60 * 60 * 1000;

function question(id: string, topic: string): Question {
  return {
    id,
    type: 'single',
    topic,
    difficulty: 'medium',
    question: 'Frage ' + id,
    options: [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' },
    ],
    correct: ['a'],
    explanation: 'Erklärung',
    docsReference: 'Doku',
  };
}

function attempt(timestamp: number, correct: boolean, mode: AttemptRecord['mode'] = 'learn'): AttemptRecord {
  return {
    id: `a-${timestamp}`,
    mode,
    timestamp,
    questionId: 'q-1',
    topic: 'database_security',
    difficulty: 'medium',
    correct,
    durationMs: 1000,
    answer: ['a'],
  };
}

describe('Tagesverlauf', () => {
  it('erzeugt lückenlose Tage und zählt richtig/falsch', () => {
    const now = Date.UTC(2026, 0, 30, 12, 0, 0);
    const series = dailySeries([attempt(now, true), attempt(now, false), attempt(now - 2 * DAY, true)], 7, now);
    expect(series).toHaveLength(7);
    const today = series[series.length - 1];
    expect(today.asked).toBe(2);
    expect(today.correct).toBe(1);
    expect(series[series.length - 3].asked).toBe(1);
    expect(series[0].asked).toBe(0);
  });

  it('ignoriert Versuche außerhalb des Fensters', () => {
    const now = Date.UTC(2026, 0, 30, 12, 0, 0);
    const series = dailySeries([attempt(now - 100 * DAY, true)], 30, now);
    expect(series.reduce((sum, p) => sum + p.asked, 0)).toBe(0);
  });
});

describe('Problemfragen', () => {
  it('nur Fragen mit Fehlversuch, meistgefallene zuerst', () => {
    const state: AppState = emptyState();
    const qs = [question('q-1', 'database_security'), question('q-2', 'collaboration'), question('q-3', 'self_service')];
    applyAnswer(state, qs[0], false, 10);
    applyAnswer(state, qs[0], false, 20);
    applyAnswer(state, qs[1], false, 5);
    applyAnswer(state, qs[2], true, 30);

    const problems = problemQuestions(qs, state);
    expect(problems.map((p) => p.question.id)).toEqual(['q-1', 'q-2']);
    expect(problems[0].record.wrongCount).toBe(2);
  });
});

describe('Schwache Bereiche', () => {
  it('ungeübte Bereiche gelten als offen, schwache mit Prozentzahl', () => {
    const state = emptyState();
    const weak = weakAreas([question('q-1', 'database_security')], state);
    expect(weak.some((w) => w.key === 'database_security' && w.percent === null)).toBe(true);

    applyAnswer(state, question('q-1', 'database_security'), true, 1);
    applyAnswer(state, question('q-1', 'database_security'), false, 2);
    const withData = weakAreas([question('q-1', 'database_security')], state);
    const db = withData.find((w) => w.key === 'database_security');
    expect(db?.percent).toBe(50);
  });

  it('gute Bereiche fallen aus der Liste', () => {
    const state = emptyState();
    const q = question('q-1', 'database_security');
    applyAnswer(state, q, true, 1);
    applyAnswer(state, q, true, 2);
    applyAnswer(state, q, true, 3);
    applyAnswer(state, q, true, 4);
    const weak = weakAreas([q], state, 0.7);
    expect(weak.some((w) => w.key === 'database_security')).toBe(false);
  });
});

describe('Modus- und Status-Auswertung', () => {
  it('Trefferquote pro Modus', () => {
    const modes = accuracyByMode([
      attempt(1, true, 'learn'),
      attempt(2, false, 'learn'),
      attempt(3, true, 'exam'),
    ]);
    expect(modes.get('learn')).toEqual({ asked: 2, correct: 1 });
    expect(modes.get('exam')).toEqual({ asked: 1, correct: 1 });
  });

  it('Statuszahlen über den Fragenpool ohne Doppelzählung', () => {
    const state = emptyState();
    const qs = [
      question('q-1', 'database_security'),
      question('q-2', 'collaboration'),
      question('q-3', 'self_service'),
      question('q-4', 'migration_integration'),
    ];
    applyAnswer(state, qs[0], true, 1);
    applyAnswer(state, qs[0], true, 2); // Box 3, zwei richtige in Folge -> gemeistert
    applyAnswer(state, qs[1], false, 1); // falsch beantwortet
    applyAnswer(state, qs[2], true, 2); // einmal richtig -> in Arbeit
    const counts = statusCounts(qs, state);
    expect(counts).toEqual({ new: 1, learning: 1, wrong: 1, mastered: 1 });
    expect(counts.new + counts.learning + counts.wrong + counts.mastered).toBe(qs.length);
  });
});
