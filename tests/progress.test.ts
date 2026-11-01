import { describe, expect, it } from 'vitest';
import { commitExam, evaluateExam, recordAttempt } from '../src/domain/progress';
import { emptyState } from '../src/domain/storage';
import type { Question } from '../src/domain/types';

const DAY = 24 * 60 * 60 * 1000;

function question(id: string, topic: string, correct: string[] = ['a']): Question {
  return {
    id,
    type: correct.length > 1 ? 'multiple' : 'single',
    topic,
    difficulty: 'medium',
    question: 'Frage ' + id,
    options: [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' },
      { id: 'c', text: 'c' },
    ],
    correct,
    explanation: 'Erklärung',
    docsReference: 'Doku',
  };
}

describe('Versuchsprotokoll', () => {
  it('aktualisiert Leitner-Box und Attempt-Liste', () => {
    const state = emptyState();
    const q = question('q-1', 'database_security');
    const now = Date.now();

    recordAttempt(state, q, ['a'], true, 'learn', now, 5000);
    expect(state.answers['q-1'].box).toBe(2);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ mode: 'learn', questionId: 'q-1', correct: true, durationMs: 5000 });

    recordAttempt(state, q, ['b'], false, 'weakness', now + DAY, 4000);
    expect(state.answers['q-1'].box).toBe(1);
    expect(state.answers['q-1'].wrongCount).toBe(1);
    expect(state.attempts[1].mode).toBe('weakness');
    expect(state.attempts[1].id).toBe('a-2');
  });

  it('merkt sich die gegebenen Antworten für die Auswertung', () => {
    const state = emptyState();
    const q = question('q-2', 'collaboration', ['a', 'c']);
    recordAttempt(state, q, ['a', 'c'], true, 'exam', Date.now(), 1000);
    expect(state.attempts[0].answer).toEqual(['a', 'c']);
  });
});

describe('Prüfungssimulation auswerten', () => {
  const questions = [
    question('q-a', 'database_security'),
    question('q-b', 'database_security'),
    question('q-c', 'self_service', ['b', 'c']),
    question('q-d', 'collaboration'),
  ];

  it('keine Teilpunkte: Teilmenge der richtigen Antworten ist falsch', () => {
    const now = Date.now();
    const session = {
      ids: ['q-c'],
      answers: { 'q-c': ['b'] },
      flags: [],
      startedAt: now - 60_000,
    };
    const { result, items } = evaluateExam(questions, session, now);
    expect(items[0].correct).toBe(false);
    expect(result.correctCount).toBe(0);
    expect(result.scorePercent).toBe(0);
  });

  it('unbeantwortete Fragen zählen als falsch, Markierungen werden übernommen', () => {
    const now = Date.now();
    const session = {
      ids: ['q-a', 'q-b', 'q-c', 'q-d'],
      answers: { 'q-a': ['a'], 'q-c': ['b', 'c'] },
      flags: ['q-b'],
      startedAt: now - 90 * 60_000,
    };
    const { result, items } = evaluateExam(questions, session, now);
    expect(items).toHaveLength(4);
    expect(result.correctCount).toBe(2);
    expect(result.scorePercent).toBe(50);
    expect(result.totalQuestions).toBe(4);
    expect(result.flagged).toEqual(['q-b']);
    expect(result.durationMs).toBe(90 * 60_000);
    expect(result.perTopic.database_security).toEqual({ asked: 2, correct: 1, percent: 50 });
    expect(result.perTopic.self_service).toEqual({ asked: 1, correct: 1, percent: 100 });
    expect(result.perTopic.collaboration).toEqual({ asked: 1, correct: 0, percent: 0 });
  });

  it('commitExam schreibt Versuche und das Ergebnis in den State', () => {
    const state = emptyState();
    const now = Date.now();
    const outcome = evaluateExam(
      questions,
      { ids: ['q-a', 'q-b'], answers: { 'q-a': ['a'] }, flags: [], startedAt: now - 30_000 },
      now
    );
    commitExam(state, outcome, now);
    expect(state.examResults).toHaveLength(1);
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts.every((a) => a.mode === 'exam')).toBe(true);
    expect(state.answers['q-a'].correctCount).toBe(1);
    expect(state.answers['q-b'].wrongCount).toBe(1);
  });
});
