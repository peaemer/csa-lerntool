import { describe, expect, it } from 'vitest';
import { BLUEPRINT, planExam } from '../src/domain/blueprint';
import { filterQuestions, nextLearnQuestion, selectExamQuestions, selectWeaknessQuestions } from '../src/domain/scoring';
import { emptyState } from '../src/domain/storage';
import { makeRng } from '../src/domain/rng';
import type { Question } from '../src/domain/types';

const DAY = 24 * 60 * 60 * 1000;

function question(id: string, topic: string): Question {
  return {
    id,
    type: 'single',
    topic,
    difficulty: 'medium',
    question: 'Beispielfrage ' + id,
    options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }],
    correct: ['a'],
    explanation: 'Erklärung',
    docsReference: 'Doku',
  };
}

const pool: Question[] = BLUEPRINT.flatMap((d) => Array.from({ length: 30 }, (_, n) => question(`q-${d.key}-${n}`, d.key)));
const rng = makeRng(42);

describe('Prüfungssimulation nach Blueprint', () => {
  it('Verteilung der Fragen entspricht den Gewichten', () => {
    const plan = planExam(BLUEPRINT, 60);
    expect(plan.reduce((s, p) => s + p.count, 0)).toBe(60);
    const byKey = Object.fromEntries(plan.map((p) => [p.key, p.count]));
    expect(byKey['database_security']).toBe(18); // 30%
    expect(byKey['collaboration']).toBe(12);
    expect(byKey['self_service']).toBe(12);
    expect(byKey['migration_integration']).toBe(8); // 13% -> 7.8 aufgerundet
    expect(byKey['platform_navigation']).toBe(4);
    expect(byKey['instance_configuration']).toBe(6);
  });

  it('Anzahl passt auch bei kleinerer Prüfung; Gewichte werden normalisiert', () => {
    const weights = Object.fromEntries(BLUEPRINT.map((d) => [d.key, d.weight]));
    const plan = planExam(BLUEPRINT, 20, { ...weights, collaboration: 30 });
    expect(plan.reduce((s, p) => s + p.count, 0)).toBe(20);

    // Normalisierung: doppelte Gewichte ergeben dieselbe Verteilung wie die Standard-Gewichte.
    const doubled = Object.fromEntries(BLUEPRINT.map((d) => [d.key, d.weight * 2]));
    const planDoubled = planExam(BLUEPRINT, 60, doubled);
    const planDefault = planExam(BLUEPRINT, 60);
    expect(planDoubled.map((p) => p.count)).toEqual(planDefault.map((p) => p.count));

    const custom = planExam(BLUEPRINT, 10, { ...weights, collaboration: 40, instance_configuration: 40 });
    expect(custom.reduce((s, p) => s + p.count, 0)).toBe(10);
    expect(custom.find((p) => p.key === 'collaboration')!.count).toBe(3); // 40/150 * 10 = 2.67 -> 3
  });

  it('Auswahl folgt der Gewichtung und ist eindeutig', () => {
    const state = emptyState();
    const picked = selectExamQuestions(pool, state, rng, Date.now(), 60);
    expect(picked).toHaveLength(60);
    expect(new Set(picked.map((q) => q.id)).size).toBe(60);
    const counts = picked.reduce<Record<string, number>>((acc, q) => {
      acc[q.topic] = (acc[q.topic] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts['database_security']).toBe(18);
  });

  it('Filter wird bei der Prüfungsauswahl berücksichtigt', () => {
    const state = emptyState();
    const limited = pool.filter((q) => q.topic === 'collaboration');
    const picked = selectExamQuestions(limited, state, rng, Date.now(), 60);
    // Nur Fragen aus dem Filter-Thema, Rest fällt unter (hier: nur 12 möglich, weil nur collaboration existiert)
    expect(picked.every((q) => q.topic === 'collaboration')).toBe(true);
    expect(picked.length).toBe(12);
  });
});

describe('Schwächen-Training', () => {
  it('nimmt Fragen aus schwachen Bereichen', () => {
    const state = emptyState();
    const now = Date.now();
    // In collaboration alles falsch, in self_service alles richtig.
    for (const q of pool.filter((x) => x.topic === 'collaboration')) {
      state.answers[q.id] = {
        questionId: q.id,
        topic: q.topic,
        difficulty: q.difficulty,
        box: 1,
        correctCount: 0,
        wrongCount: 4,
        firstSeen: now,
        lastSeen: now,
        history: [0, 0, 0, 0],
      };
    }
    for (const q of pool.filter((x) => x.topic === 'self_service')) {
      state.answers[q.id] = {
        questionId: q.id,
        topic: q.topic,
        difficulty: q.difficulty,
        box: 5,
        correctCount: 4,
        wrongCount: 0,
        firstSeen: now,
        lastSeen: now - 30 * DAY,
        history: [1, 1, 1, 1],
      };
    }
    const picked = selectWeaknessQuestions(pool, state, rng, now, 15);
    expect(picked.length).toBe(15);
    expect(picked.every((q) => q.topic === 'collaboration')).toBe(true);
  });

  it('Filter nach Status: nur falsch beantwortete Fragen', () => {
    const state = emptyState();
    const now = Date.now();
    state.answers[pool[0].id] = {
      questionId: pool[0].id,
      topic: pool[0].topic,
      difficulty: pool[0].difficulty,
      box: 1,
      correctCount: 0,
      wrongCount: 1,
      firstSeen: now,
      lastSeen: now,
      history: [0],
    };
    const filtered = filterQuestions(pool, state, { status: 'wrong' });
    expect(filtered.map((q) => q.id)).toEqual([pool[0].id]);
  });
});

describe(' Lernmodus-Reihenfolge', () => {
  it('fällige Leitner-Fragen vor ungesehenen', () => {
    const state = emptyState();
    const now = Date.now();
    const seen = pool[5];
    state.answers[seen.id] = {
      questionId: seen.id,
      topic: seen.topic,
      difficulty: seen.difficulty,
      box: 1,
      correctCount: 0,
      wrongCount: 1,
      firstSeen: now - 3 * DAY,
      lastSeen: now - 3 * DAY,
      history: [0],
    };
    expect(nextLearnQuestion(pool, state, rng, now)?.id).toBe(seen.id);
  });
});

describe('Zufall mit Seed', () => {
  it('ist reproduzierbar', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
