import { useCallback, useEffect, useState } from 'react';
import { STATIC_QUESTIONS, STATIC_TASKS } from '../domain/content';
import { emptyState, loadState, saveState } from '../domain/storage';
import type { AppState, Question, Task } from '../domain/types';

export type Mutator = (draft: AppState) => void;

export interface Store {
  state: AppState;
  ready: boolean;
  mutate: (fn: Mutator) => void;
  questions: Question[];
  tasks: Task[];
}

/** Zentraler App-State: einmal aus IndexedDB laden, jede Änderung wird persistiert. */
export function useStore(): Store {
  const [state, setState] = useState<AppState>(() => emptyState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadState()
      .then((loaded) => {
        if (!alive) return;
        setState(loaded);
        setReady(true);
      })
      .catch((err) => {
        console.warn('Fortschritt konnte nicht geladen werden', err);
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const mutate = useCallback((fn: Mutator) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      void saveState(draft).catch((err) => console.warn('Speichern fehlgeschlagen', err));
      return draft;
    });
  }, []);

  return {
    state,
    ready,
    mutate,
    questions: [...STATIC_QUESTIONS, ...state.userQuestions],
    tasks: [...STATIC_TASKS, ...state.userTasks],
  };
}
