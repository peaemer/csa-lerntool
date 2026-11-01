import { BLUEPRINT, difficultyLabel } from '../domain/blueprint';
import type { Settings } from '../domain/types';

const STATUS_LABEL: Record<string, string> = {
  all: 'alle Status',
  new: 'nur neue Fragen',
  learning: 'nur Fragen in Arbeit',
  wrong: 'nur falsch beantwortete',
  mastered: 'nur gemeisterte',
};

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  showStatus?: boolean;
  keyboardHint?: boolean;
}

export function FiltersBar({ settings, onChange, showStatus = true, keyboardHint = true }: Props) {
  return (
    <div className="card">
      <div className="row">
        <div className="field">
          <label>Themenbereich</label>
          <select value={settings.filterTopic ?? ''} onChange={(event) => onChange({ filterTopic: event.target.value || null })}>
            <option value="">Alle Bereiche</option>
            {BLUEPRINT.map((domain) => (
              <option key={domain.key} value={domain.key}>
                {domain.weight} % · {domain.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Schwierigkeit</label>
          <select value={settings.filterDifficulty ?? ''} onChange={(event) => onChange({ filterDifficulty: (event.target.value || null) as Settings['filterDifficulty'] })}>
            <option value="">Alle</option>
            <option value="easy">leicht</option>
            <option value="medium">mittel</option>
            <option value="hard">schwer</option>
          </select>
        </div>

        {showStatus ? (
          <div className="field">
            <label>Status</label>
            <select value={settings.filterStatus} onChange={(event) => onChange({ filterStatus: event.target.value as Settings['filterStatus'] })}>
              <option value="all">alle</option>
              <option value="new">neu</option>
              <option value="learning">in Arbeit</option>
              <option value="wrong">falsch beantwortet</option>
              <option value="mastered">gemeistert</option>
            </select>
          </div>
        ) : null}

        <div className="field">
          <label>Antworten mischen</label>
          <select value={settings.shuffleAnswers ? 'on' : 'off'} onChange={(event) => onChange({ shuffleAnswers: event.target.value === 'on' })}>
            <option value="on">ja</option>
            <option value="off">nein</option>
          </select>
        </div>
      </div>

      {showStatus ? (
        <p className="muted">
          Aktiver Filter: {settings.filterTopic ? BLUEPRINT.find((d) => d.key === settings.filterTopic)?.name ?? settings.filterTopic : 'alle Bereiche'} ·{' '}
          {settings.filterDifficulty ? difficultyLabel(settings.filterDifficulty) : 'alle Schwierigkeiten'} · {STATUS_LABEL[settings.filterStatus] ?? settings.filterStatus}
        </p>
      ) : null}
      {keyboardHint ? (
        <p className="muted">
          Tastatur: <kbd>1</kbd>–<kbd>9</kbd> Antwort wählen, <kbd>Enter</kbd> prüfen bzw. weiter. Fragen markieren geht in der
          Prüfungssimulation mit <kbd>F</kbd>.
        </p>
      ) : null}
    </div>
  );
}
