import { useMemo } from 'react';
import type { Store } from '../app/store';
import { BLUEPRINT } from '../domain/blueprint';
import { accuracyByTopic, estimatedReadiness, statusOf } from '../domain/scoring';
import { accuracyByMode, dailySeries, problemQuestions, statusCounts, weakAreas } from '../domain/stats';
import { isDue } from '../domain/scoring';
import { DOMAIN_NAME } from '../domain/blueprint';

interface Props {
  store: Store;
}

const MODE_LABEL: Record<string, string> = { learn: 'Lernmodus', exam: 'Prüfungssimulation', weakness: 'Schwächen-Training' };
const STATUS_LABEL: Record<string, string> = {
  new: 'neu',
  learning: 'in Arbeit',
  wrong: 'falsch beantwortet',
  mastered: 'gemeistert',
};

/** Statistik-Dashboard: Reife, Trefferquote je Bereich, Zeitverlauf, Problemfragen. */
export function StatsView({ store }: Props) {
  const { state } = store;

  const accuracy = useMemo(() => accuracyByTopic(store.questions, state), [store.questions, state]);
  const readiness = useMemo(() => estimatedReadiness(store.questions, state), [store.questions, state]);
  const series = useMemo(() => dailySeries(state.attempts, 30), [state.attempts]);
  const problems = useMemo(() => problemQuestions(store.questions, state).slice(0, 15), [store.questions, state]);
  const modes = useMemo(() => accuracyByMode(state.attempts), [state.attempts]);
  const weak = useMemo(() => weakAreas(store.questions, state), [store.questions, state]);
  const counts = useMemo(() => statusCounts(store.questions, state), [store.questions, state]);
  const due = useMemo(() => {
    const now = Date.now();
    return Object.values(state.answers).filter((rec) => isDue(rec, now)).length;
  }, [state.answers]);

  const totalAsked = state.attempts.length;
  const totalCorrect = state.attempts.filter((a) => a.correct).length;
  const maxDay = Math.max(1, ...series.map((p) => p.asked));
  const perDomainCount = new Map<string, number>();
  for (const q of store.questions) perDomainCount.set(q.topic, (perDomainCount.get(q.topic) ?? 0) + 1);

  return (
    <div>
      <div className="card">
        <h2>Prüfungsreife</h2>
        <div className="grid">
          <div className="stat">
            <div className="num">{readiness.percent} %</div>
            <div className="muted">gewichtete Trefferquote (Blueprint)</div>
          </div>
          <div className="stat">
            <div className="num">{readiness.answered}</div>
            <div className="muted">Versuche insgesamt</div>
          </div>
          <div className="stat">
            <div className="num">{store.questions.length}</div>
            <div className="muted">Fragen im Pool</div>
          </div>
          <div className="stat">
            <div className="num">{due}</div>
            <div className="muted">heute fällig (Leitner)</div>
          </div>
        </div>
        <div className="bar-progress" style={{ marginTop: 10 }}>
          <div style={{ width: `${readiness.percent}%` }} />
        </div>
        <p className="muted">
          Der Reife-Wert berechnet sich aus den Blueprint-Gewichten und deinen bisherigen Antworten. Ab etwa 75 %
          gilt eine Simulation von 60 Fragen als solide Vorbereitung. Offizieller Cut Score: nicht publiziert.
        </p>
        <p className="muted">
          Status: {counts.new} neu · {counts.learning} in Arbeit · {counts.wrong} mit Fehlversuch ·{' '}
          {counts.mastered} gemeistert
          {totalAsked > 0 ? ` · Gesamttrefferquote ${Math.round((totalCorrect / totalAsked) * 100)} %` : ''}
        </p>
      </div>

      <div className="card">
        <h3>Bereiche im Vergleich</h3>
        <table>
          <thead>
            <tr>
              <th>Bereich</th>
              <th>Gewicht</th>
              <th>Fragen</th>
              <th>Versuche</th>
              <th>Trefferquote</th>
            </tr>
          </thead>
          <tbody>
            {BLUEPRINT.map((domain) => {
              const stats = accuracy.get(domain.key);
              const percent = stats && stats.asked ? Math.round((stats.correct / stats.asked) * 100) : null;
              return (
                <tr key={domain.key}>
                  <td>{domain.name}</td>
                  <td>{domain.weight} %</td>
                  <td>{perDomainCount.get(domain.key) ?? 0}</td>
                  <td>{stats?.asked ?? 0}</td>
                  <td>
                    {percent === null ? (
                      <span className="badge warn">nicht geübt</span>
                    ) : (
                      <span className={`badge ${percent >= 70 ? 'ok' : percent >= 50 ? 'warn' : 'bad'}`}>{percent} %</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {weak.length > 0 ? (
          <p className="muted">
            Offene oder schwache Bereiche: {weak.map((w) => `${DOMAIN_NAME(w.key)}${w.percent === null ? ' (ungeübt)' : ` (${w.percent} %)`}`).join(', ')}
          </p>
        ) : (
          <p className="muted">Alle Bereiche liegen über 70 %.</p>
        )}
      </div>

      <div className="card">
        <h3>Letzte 30 Tage</h3>
        <div className="row" style={{ alignItems: 'flex-end', gap: 4, minHeight: 90 }}>
          {series.map((point) => {
            const height = Math.round((point.asked / maxDay) * 80);
            const percent = point.asked ? Math.round((point.correct / point.asked) * 100) : 0;
            return (
              <div
                key={point.date}
                title={`${point.date}: ${point.asked} Versuche, ${point.correct} richtig (${percent} %)`}
                style={{
                  width: 18,
                  height: Math.max(2, height),
                  background: point.asked === 0 ? 'var(--border)' : percent >= 70 ? 'var(--ok)' : 'var(--accent)',
                  borderRadius: 4,
                }}
              />
            );
          })}
        </div>
        <p className="muted">
          Balkenhöhe = Versuche pro Tag, Farbe = Trefferquote ab 70 % grün. Achse: {series[0]?.date} bis{' '}
          {series[series.length - 1]?.date}
        </p>
        {modes.size > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Modus</th>
                <th>Versuche</th>
                <th>Trefferquote</th>
              </tr>
            </thead>
            <tbody>
              {[...modes.entries()].map(([mode, stats]) => (
                <tr key={mode}>
                  <td>{MODE_LABEL[mode] ?? mode}</td>
                  <td>{stats.asked}</td>
                  <td>{Math.round((stats.correct / stats.asked) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="card">
        <h3>Problemfragen (häufigste Fehler)</h3>
        {problems.length === 0 ? (
          <p className="muted">Noch keine falsch beantworteten Fragen.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Frage</th>
                <th>Bereich</th>
                <th>Fehler</th>
                <th>Box</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {problems.map(({ question, record }) => (
                <tr key={question.id}>
                  <td>{question.question}</td>
                  <td>{DOMAIN_NAME(question.topic)}</td>
                  <td>{record.wrongCount}</td>
                  <td>{record.box}</td>
                  <td>{STATUS_LABEL[statusOf(record)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">Diese Fragen tauchen im Schwächen-Training automatisch zuerst auf.</p>
      </div>

      {state.examResults.length > 0 ? (
        <div className="card">
          <h3>Prüfungssimulationen</h3>
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Fragen</th>
                <th>Ergebnis</th>
                <th>Dauer</th>
                <th>markiert</th>
              </tr>
            </thead>
            <tbody>
              {state.examResults
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.timestamp).toLocaleString('de-DE')}</td>
                    <td>{r.correctCount}/{r.totalQuestions}</td>
                    <td>{r.scorePercent} %</td>
                    <td>{Math.round(r.durationMs / 60000)} min</td>
                    <td>{r.flagged.length}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
