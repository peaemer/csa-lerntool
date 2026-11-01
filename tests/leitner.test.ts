import { describe, expect, it } from 'vitest';
import { applyAnswer, isDue, leitnerPriority } from '../src/domain/scoring';
import { emptyState } from '../src/domain/storage';
import type { Question } from '../src/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const q: Question = {
  id: 'q-acl-001',
  type: 'single',
  topic: 'database_security',
  difficulty: 'medium',
  question: 'Frage',
  correct: ['a'],
  explanation: 'Erklärung',
  docsReference: 'ACL',
};
const q2: Question = { ...q, id: 'q-acl-002' };

describe('Leitner-System', () => {
  it('Start in Box 1, richtige Antwortpromotion, Fehler bleibt/demoliert', () => {
    const state = emptyState();
    const wrong = applyAnswer(state, q, false, 0);
    expect(wrong.box).toBe(1); // Start Box 1, Fehler bleibt dort
    expect(wrong.wrongCount).toBe(1);

    const right = applyAnswer(state, q2, true, 0);
    expect(right.box).toBe(2);

    // Demotion von Box 3 auf Box 2
    const rec = { ...right, box: 3 };
    state.answers[q2.id] = rec;
    const again = applyAnswer(state, q2, false, 0);
    expect(again.box).toBe(2);
  });

  it('die erste Antwort bleibt im State erhalten (Leitner-Persistenz)', () => {
    const state = emptyState();
    applyAnswer(state, q, true, 0);
    expect(state.answers[q.id]).toBeDefined();
    expect(state.answers[q.id].box).toBe(2);

    applyAnswer(state, q, false, DAY);
    expect(state.answers[q.id].box).toBe(1);
    expect(state.answers[q.id].history).toEqual([1, 0]);
    expect(state.answers[q.id].lastSeen).toBe(DAY);
  });

  it('falsch beantwortete Fragen werden schneller wiederholt als korrekt beantwortete', () => {
    const state = emptyState();
    const wrong = applyAnswer(state, q, false, 0);
    const right = applyAnswer(state, q2, true, 0);
    expect(leitnerPriority(wrong, 0)).toBeGreaterThan(leitnerPriority(right, 0));
  });

  it('Intervalle wachsen mit der Box', () => {
    const rec = { questionId: 'x', topic: 'a', difficulty: 'medium' as const, box: 3, correctCount: 1, wrongCount: 0, firstSeen: 0, lastSeen: 0, history: [1] };
    expect(isDue(rec, DAY * 3)).toBe(false); // Box 3 -> 4 Tage
    expect(isDue(rec, DAY * 4)).toBe(true);
    const rec5 = { ...rec, box: 5 };
    expect(isDue(rec5, DAY * 13)).toBe(false);
    expect(isDue(rec5, DAY * 14)).toBe(true);
  });

  it('Priorität steigt mit Fehlern und Fälligkeit', () => {
    const state = emptyState();
    const a = applyAnswer(state, q, false, 0);
    const b = { ...a, wrongCount: 3 };
    expect(leitnerPriority(b, 0)).toBeGreaterThan(leitnerPriority(a, 0));
  });
});
