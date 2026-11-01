import { useEffect } from 'react';

/** Globale Tastatursteuerung; Eingabefelder bleiben unberührt. */
export function useKeyboard(handler: (event: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      handler(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
    // deps-Array wird bewusst durchgereicht; der Handler ist immer aktuell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
