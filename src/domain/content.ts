import type { Question, Task } from './types';

/** Statische Inhalte: /data/questions/*.json und /data/tasks/*.json (JSON-Dateien im Repo). */
const questionModules = import.meta.glob('../../data/questions/*.json', { eager: true });
const taskModules = import.meta.glob('../../data/tasks/*.json', { eager: true });

function flatten(mods: Record<string, unknown>) {
  const out: unknown[] = [];
  for (const mod of Object.values(mods)) {
    const value = (mod as { default?: unknown }).default ?? mod;
    if (Array.isArray(value)) out.push(...value);
    else if (value) out.push(value);
  }
  return out;
}

export const STATIC_QUESTIONS: Question[] = flatten(questionModules) as Question[];
export const STATIC_TASKS: Task[] = flatten(taskModules) as Task[];

