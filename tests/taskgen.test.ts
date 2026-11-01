import { describe, expect, it } from 'vitest';
import { buildTask, nextTask, renderTaskText } from '../src/domain/taskgen';
import { makeRng } from '../src/domain/rng';
import type { Task } from '../src/domain/types';

const task: Task = {
  id: 't-1',
  title: 'Feld auf {table} anlegen',
  area: 'database_security',
  difficulty: 'beginner',
  estimatedMinutes: 15,
  scenario: 'Auf {table} soll {field} angelegt werden.',
  requirements: ['{field} auf {table} anlegen'],
  hints: ['System Definition > Tables'],
  solution: 'System Definition > Application Dictionary',
  commonMistakes: ['Eigenes Feld ohne u-Präfix angelegt'],
  examRelevance: 'Wird gern als Business-Rule-Frage gefragt.',
  variables: { table: ['u_a', 'u_b', 'u_c'], field: ['u_x', 'u_y'] },
};

const plain: Task = { ...task, id: 't-2', area: 'self_service', variables: undefined };

describe('Aufgaben-Generator', () => {
  it('Platzhalter werden konsistent aufgelöst', () => {
    const rng = makeRng(101);
    const resolved = buildTask(task, rng);
    const text = renderTaskText(resolved.scenario, resolved.values);
    expect(text).toContain(resolved.values.table);
    expect(text).toContain(resolved.values.field);
    expect(resolved.values.table.startsWith('u_')).toBe(true);
  });

  it('gleiche Variante wird nicht erneut gezogen, bis alle durch sind', () => {
    const seen: string[] = [];
    const picked: string[] = [];
    for (let i = 0; i < 10; i++) {
      const t = nextTask([task], makeRng(500 + i), seen);
      if (!t) break;
      picked.push(t.variantKey);
      seen.push(t.variantKey);
    }
    expect(picked.length).toBe(6); // 3 Tabellen x 2 Felder
    expect(new Set(picked).size).toBe(6);
    expect(nextTask([task], makeRng(1), seen, [])).toBeNull();
  });

  it('schwache Bereiche werden bevorzugt gewichtet', () => {
    const rng = makeRng(9);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const t = nextTask([task, plain], rng, [], ['self_service']);
      if (!t) continue;
      counts[t.area] = (counts[t.area] ?? 0) + 1;
    }
    expect(counts['self_service'] ?? 0).toBeGreaterThan(counts['database_security'] ?? 0);
  });

  it('Statusfilter: erledigte Aufgaben fallen heraus', () => {
    const picked = nextTask([task, plain], makeRng(3), [], [], { [task.id]: 'done' });
    expect(picked?.id).toBe(plain.id);
    expect(nextTask([plain], makeRng(4), [], [], { [plain.id]: 'done' })).toBeNull();
  });
});
