import type { AppState, ExamResult, Question } from './types';
import { applyAnswer, gradeQuestion } from './scoring';

export type Mode = 'learn' | 'exam' | 'weakness';

/** Ein Versuch: Leitner-Box aktualisieren und den Attempt für die Statistik protokollieren. */
export function recordAttempt(
  state: AppState,
  question: Question,
  given: string[],
  correct: boolean,
  mode: Mode,
  now: number,
  durationMs: number
): boolean {
  state.answers[question.id] = applyAnswer(state, question, correct, now);
  state.attempts.push({
    id: `a-${state.attempts.length + 1}`,
    mode,
    timestamp: now,
    questionId: question.id,
    topic: question.topic,
    difficulty: question.difficulty,
    correct,
    durationMs,
    answer: [...given],
  });
  return correct;
}

export interface ExamSession {
  ids: string[];
  /** questionId -> gewählte Options-ids */
  answers: Record<string, string[]>;
  flags: string[];
  startedAt: number;
}

export interface ExamItem {
  question: Question;
  given: string[];
  correct: boolean;
}

export interface ExamOutcome {
  result: ExamResult;
  items: ExamItem[];
}

/** Reine Auswertung (ohne State): keine Teilpunkte, exakte Mengen, Auswertung pro Blueprint-Domain. */
export function evaluateExam(questions: Question[], session: ExamSession, now: number): ExamOutcome {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const items: ExamItem[] = [];
  const perTopic: ExamResult['perTopic'] = {};

  for (const id of session.ids) {
    const question = byId.get(id);
    if (!question) continue;
    const given = session.answers[id] ?? [];
    const correct = gradeQuestion(question, given);
    items.push({ question, given, correct });
    const stats = perTopic[question.topic] ?? { asked: 0, correct: 0, percent: 0 };
    stats.asked += 1;
    if (correct) stats.correct += 1;
    stats.percent = Math.round((stats.correct / stats.asked) * 100);
    perTopic[question.topic] = stats;
  }

  const correctCount = items.filter((i) => i.correct).length;
  const result: ExamResult = {
    id: `exam-${session.startedAt}`,
    timestamp: now,
    mode: 'exam',
    durationMs: now - session.startedAt,
    totalQuestions: items.length,
    correctCount,
    scorePercent: items.length ? Math.round((correctCount / items.length) * 100) : 0,
    perTopic,
    flagged: [...session.flags],
  };
  return { result, items };
}

/** Ergebnis festschreiben: Attempts (Modus exam) + Prüfungsliste. */
export function commitExam(state: AppState, outcome: ExamOutcome, now: number) {
  const perQuestion = outcome.result.durationMs / Math.max(1, outcome.items.length);
  for (const item of outcome.items) {
    recordAttempt(state, item.question, item.given, item.correct, 'exam', now, perQuestion);
  }
  state.examResults.push(outcome.result);
}
