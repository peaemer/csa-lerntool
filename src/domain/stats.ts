import { BLUEPRINT } from './blueprint';
import { accuracyByTopic, statusOf } from './scoring';
import type { AnswerRecord, AppState, AttemptRecord, Question } from './types';

const DAY = 24 * 60 * 60 * 1000;

export interface DayPoint {
  date: string;
  asked: number;
  correct: number;
}

/** Verlauf über Zeit: Trefferquote je Kalendertag (inkl. leerer Tage, damit die Kurve lücklos ist). */
export function dailySeries(attempts: AttemptRecord[], days = 30, now = Date.now()): DayPoint[] {
  const map = new Map<string, DayPoint>();
  for (const a of attempts) {
    const key = dayKey(a.timestamp);
    const p = map.get(key) ?? { date: key, asked: 0, correct: 0 };
    p.asked += 1;
    p.correct += a.correct ? 1 : 0;
    map.set(key, p);
  }
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY);
    out.push(map.get(key) ?? { date: key, asked: 0, correct: 0 });
  }
  return out;
}

function dayKey(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const TODAY_KEY = dayKey;

/** Fragen, die mindestens einmal falsch waren – sortiert nach Förderbedarf. */
export function problemQuestions(questions: Question[], state: AppState) {
  return questions
    .filter((q) => state.answers[q.id] && state.answers[q.id]!.wrongCount > 0)
    .map((q) => ({ question: q, record: state.answers[q.id]! }))
    .sort(
      (a, b) =>
        b.record.wrongCount - a.record.wrongCount ||
        a.record.box - b.record.box ||
        a.record.lastSeen - b.record.lastSeen
    );
}

/** Themenbereich mit Trefferquote unter threshold; ungeprüfte Bereiche gelten als offen (nicht als schwach). */
export function weakAreas(questions: Question[], state: AppState, threshold = 0.7) {
  const stats = accuracyByTopic(questions, state);
  const weak: { key: string; name: string; percent: number | null }[] = [];
  for (const d of BLUEPRINT) {
    const s = stats.get(d.key);
    if (!s || s.asked === 0) {
      weak.push({ key: d.key, name: d.name, percent: null });
      continue;
    }
    if (s.correct / s.asked < threshold) weak.push({ key: d.key, name: d.name, percent: Math.round((s.correct / s.asked) * 100) });
  }
  return weak;
}

/** Trefferquote pro Modus (Lernen / Prüfung / Schwächen-Training). */
export function accuracyByMode(attempts: AttemptRecord[]) {
  const modes = new Map<string, { asked: number; correct: number }>();
  for (const a of attempts) {
    const s = modes.get(a.mode) ?? { asked: 0, correct: 0 };
    s.asked += 1;
    s.correct += a.correct ? 1 : 0;
    modes.set(a.mode, s);
  }
  return modes;
}

/** Wie viele Fragen des Pools sind neu / in Arbeit / falsch beantwortet / gemeistert. */
export function statusCounts(questions: Question[], state: AppState) {
  const counts = { new: 0, learning: 0, wrong: 0, mastered: 0 };
  for (const q of questions) counts[statusOf(state.answers[q.id]) as keyof typeof counts] += 1;
  return counts;
}

export function recordFor(state: AppState, questionId: string): AnswerRecord | undefined {
  return state.answers[questionId];
}
