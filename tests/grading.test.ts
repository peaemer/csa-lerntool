import { describe, expect, it } from 'vitest';
import { gradeQuestion, statusOf } from '../src/domain/scoring';
import type { AppState, Question } from '../src/domain/types';
import { emptyState } from '../src/domain/storage';

const mcq: Question = {
  id: 'q-acl-014',
  type: 'multiple',
  topic: 'database_security',
  difficulty: 'medium',
  question: 'Welche Aussagen zu ACLs sind korrekt?',
  options: [
    { id: 'a', text: 'a' },
    { id: 'b', text: 'b' },
    { id: 'c', text: 'c' },
    { id: 'd', text: 'd' },
  ],
  correct: ['a', 'c'],
  explanation: 'Beispiel',
  docsReference: 'Access Control Rules',
};

const baseState = (): AppState => emptyState();

describe('Bewertung von Fragen', () => {
  it('Single Choice: exakte Antwort zählt', () => {
    const q = { ...mcq, type: 'single' as const, correct: ['b'] };
    expect(gradeQuestion(q, ['b'])).toBe(true);
    expect(gradeQuestion(q, ['a'])).toBe(false);
  });

  it('Multiple Choice ohne Teilpunkte: nur die vollständige Menge', () => {
    expect(gradeQuestion(mcq, ['a', 'c'])).toBe(true);
    expect(gradeQuestion(mcq, ['c', 'a'])).toBe(true); // Reihenfolge egal
    expect(gradeQuestion(mcq, ['a'])).toBe(false);
    expect(gradeQuestion(mcq, ['a', 'c', 'd'])).toBe(false);
    expect(gradeQuestion(mcq, [])).toBe(false);
  });

  it('Wahr/Falsch', () => {
    const tf: Question = {
      id: 'q-bool-1',
      type: 'boolean',
      topic: 'collaboration',
      difficulty: 'easy',
      question: 'Eine UI Policy wirkt auf dem Formular im Browser.',
      options: [
        { id: 'a', text: 'Wahr' },
        { id: 'b', text: 'Falsch' },
      ],
      correct: ['a'],
      explanation: 'UI Policies wirken auf dem Browser-Form.',
      docsReference: 'UI Policies',
    };
    expect(gradeQuestion(tf, ['a'])).toBe(true);
    expect(gradeQuestion(tf, ['b'])).toBe(false);
  });
});

describe('Statuslogik', () => {
  it('neu, in Arbeit, falsch beantwortet, gemeistert', () => {
    const state = baseState();
    expect(statusOf(state.answers['q-acl-014'])).toBe('new');
    state.answers['q-acl-014'] = {
      questionId: 'q-acl-014',
      topic: 'database_security',
      difficulty: 'medium',
      box: 1,
      correctCount: 0,
      wrongCount: 1,
      firstSeen: 1,
      lastSeen: 1,
      history: [0],
    };
    expect(statusOf(state.answers['q-acl-014'])).toBe('wrong');

    // eine richtige Antwort reicht noch nicht als "gemeistert"
    state.answers['q-acl-014'].correctCount = 1;
    state.answers['q-acl-014'].wrongCount = 0;
    state.answers['q-acl-014'].box = 2;
    state.answers['q-acl-014'].history = [1];
    expect(statusOf(state.answers['q-acl-014'])).toBe('learning');

    // zwei richtige in Folge und Leitner-Box 3 -> gemeistert
    state.answers['q-acl-014'].box = 3;
    state.answers['q-acl-014'].history = [1, 1];
    expect(statusOf(state.answers['q-acl-014'])).toBe('mastered');

    // ein aktueller Fehlversuch wirft zurück, auch nach zuvor gemeistert
    state.answers['q-acl-014'].history = [1, 1, 0];
    expect(statusOf(state.answers['q-acl-014'])).toBe('wrong');

    // Box 3, aber die letzte richtige Antwort liegt weiter zurück (dazwischen ein Fehler)
    state.answers['q-acl-014'].box = 4;
    state.answers['q-acl-014'].history = [0, 1];
    expect(statusOf(state.answers['q-acl-014'])).toBe('learning');
  });
});
