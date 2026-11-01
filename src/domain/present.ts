import type { Question, QuestionOption } from './types';

/** Anzeigeoptionen: bei boolean werden Richtig/Falsch ergänzt, falls die Frage keine Optionen enthält. */
export function displayOptions(question: Question): QuestionOption[] {
  if (question.options && question.options.length > 0) return question.options;
  if (question.type === 'boolean') {
    return [
      { id: 'a', text: 'Richtig' },
      { id: 'b', text: 'Falsch' },
    ];
  }
  return [];
}

export function isCorrect(question: Question, optionId: string) {
  return question.correct.includes(optionId);
}

/** "Wähle genau 2 Antworten" für Multiple-Choice-Fragen. */
export function selectHint(question: Question) {
  if (question.type !== 'multiple') return null;
  const count = question.correctCount ?? question.correct.length;
  return `Wähle genau ${count} Antwort${count === 1 ? '' : 'en'}`;
}
