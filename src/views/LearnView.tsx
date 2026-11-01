import { useCallback, useMemo, useRef } from 'react';
import type { Store } from '../app/store';
import { learnQueue } from '../domain/scoring';
import { isDue } from '../domain/scoring';
import { makeRng, randomSeed } from '../domain/rng';
import type { Question } from '../domain/types';
import { QuizRunner } from '../components/QuizRunner';

interface Props {
  store: Store;
  pool: Question[];
}

/** Lernmodus: fällige Leitner-Fragen zuerst, dann neue Fragen, jeweils mit Sofort-Feedback. */
export function LearnView({ store, pool }: Props) {
  const rng = useRef(makeRng(randomSeed())).current;

  const buildQueue = useCallback(
    (exclude: string[]) => learnQueue(pool, store.state, rng, Date.now(), exclude),
    [pool, store.state, rng]
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const due = pool.filter((q) => store.state.answers[q.id] && isDue(store.state.answers[q.id]!, now)).length;
    const unseen = pool.filter((q) => !store.state.answers[q.id]).length;
    return { due, unseen };
  }, [pool, store.state]);

  return (
    <div>
      <div className="card">
        <div className="row between">
          <h2>Lernmodus</h2>
          <span className="muted">
            {stats.due} fällig · {stats.unseen} neu · {pool.length} im Pool
          </span>
        </div>
        <p className="muted">
          Nach jeder Antwort erscheint die Erklärung. Leitner-Boxen: Box 1 täglich, Box 2 nach 2 Tagen, Box 3 nach
          4 Tagen, Box 4 nach 8 Tagen, Box 5 nach 14 Tagen.
        </p>
      </div>
      <QuizRunner store={store} mode="learn" pool={pool} buildQueue={buildQueue} />
    </div>
  );
}
