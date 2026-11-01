import { useCallback, useMemo, useRef, useState } from 'react';
import type { Store } from '../app/store';
import { BLUEPRINT, DOMAIN_NAME } from '../domain/blueprint';
import { filterQuestions, selectWeaknessQuestions } from '../domain/scoring';
import { weakAreas } from '../domain/stats';
import { makeRng, randomSeed } from '../domain/rng';
import { QuizRunner } from '../components/QuizRunner';

interface Props {
  store: Store;
}

const LIMITS = [10, 20, 30, 50];

/** Schwächen-Training: Fragen mit geringer Trefferquote und hohem Blueprint-Gewicht zuerst. */
export function WeaknessView({ store }: Props) {
  const rng = useRef(makeRng(randomSeed())).current;
  const [limit, setLimit] = useState(20);

  const pool = useMemo(
    () =>
      filterQuestions(store.questions, store.state, {
        topic: store.state.settings.filterTopic,
        difficulty: store.state.settings.filterDifficulty,
        status: 'all',
      }),
    [store.questions, store.state]
  );

  const buildQueue = useCallback(
    (exclude: string[]) => {
      const remaining = exclude.length > 0 ? pool.filter((q) => !exclude.includes(q.id)) : pool;
      return selectWeaknessQuestions(remaining, store.state, rng, Date.now(), limit);
    },
    [pool, store.state, rng, limit]
  );

  const weak = useMemo(() => weakAreas(store.questions, store.state), [store.questions, store.state]);
  const weakPool = useMemo(() => selectWeaknessQuestions(pool, store.state, rng, Date.now(), limit), [pool, store.state, rng, limit]);

  return (
    <div>
      <div className="card">
        <div className="row between">
          <h2>Schwächen-Training</h2>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Fragen pro Runde</label>
            <select value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted">
          Auswahl gewichtet nach Fehlerquote, Leitner-Box und Blueprint-Gewichtung. Bereits gesehene Fragen dieser
          Runde werden ausgeschlossen.
        </p>
        <div className="grid">
          <div className="stat">
            <div className="num">{weakPool.length}</div>
            <div className="muted">Fragen in dieser Runde</div>
          </div>
          <div className="stat">
            <div className="num">{store.questions.length}</div>
            <div className="muted">Fragen insgesamt</div>
          </div>
          <div className="stat">
            <div className="num">{weak.length}</div>
            <div className="muted">offene oder schwache Bereiche</div>
          </div>
        </div>
        <h3>Schwächste Bereiche (Trefferquote unter 70 %)</h3>
        {weak.length === 0 ? (
          <p className="muted">Kein Bereich liegt aktuell unter 70 % – gut.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Gewicht</th>
                <th>Trefferquote</th>
              </tr>
            </thead>
            <tbody>
              {weak.map((area) => (
                <tr key={area.key}>
                  <td>{DOMAIN_NAME(area.key) ?? area.name}</td>
                  <td>{BLUEPRINT.find((d) => d.key === area.key)?.weight ?? 0} %</td>
                  <td>{area.percent === null ? 'nicht geübt' : `${area.percent} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <QuizRunner
        store={store}
        mode="weakness"
        pool={pool}
        roundSize={Math.min(limit, pool.length)}
        buildQueue={buildQueue}
      />
    </div>
  );
}
