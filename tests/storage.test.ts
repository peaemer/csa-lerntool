import { describe, expect, it } from 'vitest';
import { emptyState, parseState, serializeState } from '../src/domain/storage';
import { estimatedReadiness, accuracyByTopic } from '../src/domain/scoring';
import type { AppState, Question } from '../src/domain/types';

const q: Question = {
  id: 'q-1',
  type: 'single',
  topic: 'database_security',
  difficulty: 'easy',
  question: 'Frage',
  correct: ['a'],
  explanation: 'Erklärung',
  docsReference: 'Data Schema',
};

describe('Export/Import des Lernfortschritts', () => {
  it('Roundtrip ohne Datenverlust', () => {
    const state = emptyState();
    state.answers['q-1'] = {
      questionId: 'q-1',
      topic: 'database_security',
      difficulty: 'easy',
      box: 3,
      correctCount: 2,
      wrongCount: 1,
      firstSeen: 1,
      lastSeen: 2,
      history: [1, 0, 1],
    };
    state.taskStatus['t-1'] = 'working';
    state.taskNotes['t-1'] = 'Notiz in der PDI';
    const restored = parseState(serializeState(state));
    expect(restored.answers['q-1'].box).toBe(3);
    expect(restored.taskNotes['t-1']).toBe('Notiz in der PDI');
  });
});

describe('Unvollständige und vertauschte gespeicherte Stände', () => {
  it('bekommen jede vorgesehene Struktur zurück', () => {
    const kaputt = JSON.stringify({
      answers: [], // Liste statt Objekt
      attempts: {}, // Objekt statt Liste
      seenTaskVariants: {}, // Objekt statt Liste
      taskNotes: null,
      settings: 'dunkel',
      userQuestions: 'keine Liste',
      userTasks: undefined,
    });
    const restored = parseState(kaputt);
    expect(restored.answers).toEqual({});
    expect(Array.isArray(restored.attempts)).toBe(true);
    expect(Array.isArray(restored.seenTaskVariants)).toBe(true);
    expect(restored.taskNotes).toEqual({});
    expect(Array.isArray(restored.userQuestions)).toBe(true);
    expect(Array.isArray(restored.userTasks)).toBe(true);
    // Standardeinstellungen bleiben erhalten
    expect(restored.settings.examMinutes).toBe(90);
    expect(restored.settings.theme === 'light' || restored.settings.theme === 'dark').toBe(true);
  });

  it('hält vollständige Stände unverändert', () => {
    const state = emptyState();
    state.seenTaskVariants.push('t-1:variant-2');
    const restored = parseState(serializeState(state));
    expect(restored.seenTaskVariants).toEqual(['t-1:variant-2']);
  });
});

describe('Statistik', () => {  it('Trefferquote pro Themenbereich und Prüfungsreife', () => {
    const state: AppState = emptyState();
    const now = Date.now();
    const rec = (topic: string, correct: number, wrong: number) => ({
      questionId: topic,
      topic,
      difficulty: 'medium' as const,
      box: 3,
      correctCount: correct,
      wrongCount: wrong,
      firstSeen: now,
      lastSeen: now,
      history: Array(correct).fill(1).concat(Array(wrong).fill(0)),
    });
    state.answers['q-1'] = rec('database_security', 8, 2);
    state.answers['q-2'] = rec('collaboration', 10, 0);
    const stats = accuracyByTopic([q], state);
    expect(stats.get('database_security')).toEqual({ asked: 10, correct: 8 });
    expect(estimatedReadiness([q, { ...q, id: 'q-2' }], state).percent).toBeGreaterThan(80);
  });
});
