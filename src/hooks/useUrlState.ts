import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps the calculator's inputs in the query string so a result can be linked
 * or refreshed without losing state. Writes are debounced and use replaceState
 * so dragging a slider does not fill the back-button history.
 */
export function useUrlState<T extends Record<string, string | number | boolean>>(initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    const params = new URLSearchParams(window.location.search);
    const next = { ...initial };
    for (const key of Object.keys(initial) as (keyof T)[]) {
      const raw = params.get(String(key));
      if (raw == null) continue;
      const fallback = initial[key];
      if (typeof fallback === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n)) next[key] = n as T[keyof T];
      } else if (typeof fallback === 'boolean') {
        next[key] = (raw === '1' || raw === 'true') as T[keyof T];
      } else {
        next[key] = raw as T[keyof T];
      }
    }
    return next;
  });

  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (frame.current) window.clearTimeout(frame.current);
    frame.current = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(state)) {
        if (typeof value === 'boolean') {
          if (value) params.set(key, '1');
        } else {
          params.set(key, String(value));
        }
      }
      window.history.replaceState(null, '', `?${params.toString()}`);
    }, 220);

    return () => {
      if (frame.current) window.clearTimeout(frame.current);
    };
  }, [state]);

  const patch = useCallback((updates: Partial<T>) => setState((s) => ({ ...s, ...updates })), []);

  return [state, patch] as const;
}
