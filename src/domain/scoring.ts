import type { AnswerRecord, AppState, Difficulty, Question } from './types';
import { BLUEPRINT, planExam } from './blueprint';
import { pick, shuffle, type Rng } from './rng';

/** Bewertung: keine Teilpunkte, exakte Mengen – wie im echten CSA-Exam. */
export function gradeQuestion(question: Question, given: string[]): boolean {
  const correct = new Set(question.correct);
  if (given.length === 0 || given.length !== correct.size) return false;
  return given.every((id) => correct.has(id));
}

/** Status einer Frage: gemeistert erst nach zwei richtigen Antworten in Folge (Leitner-Box 3+). */
export function statusOf(record?: AnswerRecord): 'new' | 'learning' | 'wrong' | 'mastered' {
  if (!record || record.history.length === 0) return 'new';
  const last = record.history[record.history.length - 1];
  if (last === 0) return 'wrong';
  let streak = 0;
  for (let i = record.history.length - 1; i >= 0 && record.history[i] === 1; i -= 1) streak += 1;
  return record.box >= 3 && streak >= 2 ? 'mastered' : 'learning';
}

export function applyAnswer(state: AppState, question: Question, correct: boolean, now: number): AnswerRecord {
  const existing = state.answers[question.id];
  const rec: AnswerRecord = existing ?? {
    questionId: question.id,
    topic: question.topic,
    difficulty: question.difficulty,
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    firstSeen: now,
    lastSeen: now,
    history: [],
  };
  if (!existing) state.answers[question.id] = rec;
  rec.box = correct ? Math.min(5, rec.box + 1) : Math.max(1, rec.box - 1);
  rec.correctCount += correct ? 1 : 0;
  rec.wrongCount += correct ? 0 : 1;
  rec.history.push(correct ? 1 : 0);
  rec.lastSeen = now;
  return rec;
}

/** Leitner-Wiederholungsintervalle in Tagen (Box 1..5). */
export const LEITNER_INTERVALS = [1, 2, 4, 8, 14];

export function isDue(record: AnswerRecord, now: number) {
  const day = 24 * 60 * 60 * 1000;
  const interval = LEITNER_INTERVALS[Math.min(record.box, 5) - 1] * day;
  return now - record.lastSeen >= interval;
}

/** Leitner-Priorität: höhere Zahl = dringender (niedrige Box + viele Fehler + fällig). */
export function leitnerPriority(record: AnswerRecord, now: number): number {
  const base = 10 - record.box; // Box 1 -> 9, Box 5 -> 2
  const wrong = record.wrongCount * 3;
  const due = isDue(record, now) ? 2 : 0;
  return base + wrong + due;
}

export function filterQuestions(
  questions: Question[],
  state: AppState,
  filters: { topic?: string | null; difficulty?: Difficulty | null; status?: string }
) {
  return questions.filter((q) => {
    if (filters.topic && q.topic !== filters.topic) return false;
    if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
    const status = filters.status ?? 'all';
    if (status !== 'all' && statusOf(state.answers[q.id]) !== status) return false;
    return true;
  });
}

/** Prüfungsauswahl: Fragenanzahl je Domain nach Blueprint-Gewichtung, bevorzugt fällige/schwache Fragen. */
export function selectExamQuestions(questions: Question[], state: AppState, rng: Rng, now: number, total: number) {
  const plan = planExam(BLUEPRINT, total, state.settings.weights);
  const byTopic = new Map<string, Question[]>();
  for (const q of questions) byTopic.set(q.topic, (byTopic.get(q.topic) ?? []).concat(q));

  const chosen: Question[] = [];
  for (const p of plan) {
    const pool = (byTopic.get(p.key) ?? []).slice();
    if (pool.length === 0) continue;
    // Schwache oder fällige Fragen zuerst, damit die Simulation genau das erwischt, was geübt werden muss.
    pool.sort((a, b) => priorityQuestion(state.answers[b.id], now) - priorityQuestion(state.answers[a.id], now));
    chosen.push(...pool.slice(0, p.count));
  }
  return shuffle(chosen, rng);
}

function priorityQuestion(record: AnswerRecord | undefined, now: number) {
  if (!record) return 1;
  return leitnerPriority(record, now);
}

/** Schwächen-Training: nur Fragen mit niedriger Trefferquote, gewichtet nach Bereich + Leitner-Box. */
export function selectWeaknessQuestions(questions: Question[], state: AppState, rng: Rng, now: number, limit = 20) {
  const scored = questions.map((q) => {
    const rec = state.answers[q.id];
    const wrongRate = rec && rec.history.length ? rec.wrongCount / rec.history.length : 1;
    const status = statusOf(rec);
    const statusBoost = status === 'new' ? 1.2 : status === 'wrong' ? 3 : status === 'learning' ? 1 : 0.2;
    const boxBoost = rec ? 5 - rec.box : 3;
    const domainWeight = BLUEPRINT.find((d) => d.key === q.topic)?.weight ?? 10;
    const score = wrongRate * 2 + statusBoost + boxBoost / 5 + domainWeight / 30 + (rec && isDue(rec, now) ? 1 : 0);
    return { q, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return shuffle(scored.slice(0, limit).map((s) => s.q), rng);
}

/** Lernmodus-Queue: fällige Leitner-Fragen zuerst, dann ungesehene, dann bereits gesehene. */
export function learnQueue(
  questions: Question[],
  state: AppState,
  rng: Rng,
  now: number,
  excludeIds: string[] = []
): Question[] {
  const pool = excludeIds.length > 0 ? questions.filter((q) => !excludeIds.includes(q.id)) : questions;
  if (pool.length === 0) return [];
  const due = pool
    .filter((q) => state.answers[q.id] && isDue(state.answers[q.id]!, now))
    .sort((a, b) => leitnerPriority(state.answers[a.id]!, now) - leitnerPriority(state.answers[b.id]!, now));
  const unseen = shuffle(pool.filter((q) => !state.answers[q.id]), rng);
  const seen = shuffle(pool.filter((q) => state.answers[q.id] && !isDue(state.answers[q.id]!, now)), rng);
  return [...due, ...unseen, ...seen];
}

/** Nächste Frage im Lernmodus: fällige Leitner-Fragen zuerst, dann ungesehene Fragen. */
export function nextLearnQuestion(questions: Question[], state: AppState, rng: Rng, now: number) {
  const queue = learnQueue(questions, state, rng, now);
  if (queue.length > 0) return queue[0];
  return pick(questions, rng);
}

export function accuracyByTopic(questions: Question[], state: AppState) {
  const stats = new Map<string, { asked: number; correct: number }>();
  for (const q of questions) {
    const rec = state.answers[q.id];
    if (!rec) continue;
    const s = stats.get(q.topic) ?? { asked: 0, correct: 0 };
    s.asked += rec.history.length;
    s.correct += rec.correctCount;
    stats.set(q.topic, s);
  }
  return stats;
}

/** Geschätzte Prüfungsreife: gewichteter Durchschnitt der Trefferquote je Domain. */
export function estimatedReadiness(questions: Question[], state: AppState) {
  const stats = accuracyByTopic(questions, state);
  let weighted = 0;
  let weightSum = 0;
  for (const d of BLUEPRINT) {
    const s = stats.get(d.key);
    if (!s || s.asked === 0) continue;
    weighted += (s.correct / s.asked) * d.weight;
    weightSum += d.weight;
  }
  if (weightSum === 0) return { percent: 0, answered: 0 };
  const answered = [...stats.values()].reduce((s, x) => s + x.asked, 0);
  return { percent: Math.round((weighted / weightSum) * 100), answered };
}
