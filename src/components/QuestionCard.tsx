import { difficultyLabel } from '../domain/blueprint';
import { statusOf } from '../domain/scoring';
import { isCorrect, selectHint } from '../domain/present';
import type { AnswerRecord, Question, QuestionOption } from '../domain/types';
import { DOMAIN_NAME } from '../domain/blueprint';

const STATUS_LABEL: Record<string, string> = {
  new: 'neu',
  learning: 'in Arbeit',
  wrong: 'falsch beantwortet',
  mastered: 'gemeistert',
};

interface Props {
  question: Question;
  options: QuestionOption[];
  selected: string[];
  revealed: boolean;
  correct?: boolean;
  record?: AnswerRecord;
  onPick?: (optionId: string) => void;
}

export function QuestionCard({ question, options, selected, revealed, correct, record, onPick }: Props) {
  const hint = selectHint(question);
  const status = record ? statusOf(record) : 'new';

  return (
    <div className="card">
      <div className="row between">
        <div className="row">
          <span className="badge">{DOMAIN_NAME(question.topic)}</span>
          <span className="badge">{difficultyLabel(question.difficulty)}</span>
          {hint ? <span className="badge warn">{hint}</span> : null}
          {question.needsReview ? <span className="badge warn">Inhalt prüfen</span> : null}
        </div>
        {record ? (
          <span className={`badge ${status === 'mastered' ? 'ok' : status === 'wrong' ? 'bad' : ''}`}>
            {STATUS_LABEL[status]} · Leitner-Box {record.box}
          </span>
        ) : null}
      </div>

      <p className="qtext">{question.question}</p>

      <ul className="options">
        {options.map((option, index) => {
          const isSelected = selected.includes(option.id);
          const classes = revealed
            ? isCorrect(question, option.id)
              ? 'right'
              : isSelected
                ? 'fail'
                : ''
            : isSelected
              ? 'selected'
              : '';
          return (
            <li key={option.id} className={classes} onClick={() => onPick?.(option.id)}>
              <span className="key">{index + 1}</span>
              <span>{option.text}</span>
            </li>
          );
        })}
      </ul>

      {revealed ? (
        <div className="explain">
          <strong>{correct ? 'Richtig beantwortet' : 'Falsch beantwortet'}</strong>
          <p>{question.explanation}</p>
          <p className="sub">
            Doku-Stichwort: {question.docsReference}
            {question.subtopic ? ` · ${question.subtopic}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
