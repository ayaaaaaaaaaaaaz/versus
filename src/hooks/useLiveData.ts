import { useEffect, useState } from 'react';
import { MAX_YEAR, applyLiveCpi, cpi } from '../lib/series';

export type LiveStatus = 'loading' | 'bundled' | 'extended';

export interface LiveState {
  status: LiveStatus;
  /** Latest year the calculator can reach after any live extension. */
  maxYear: number;
  /** Rates from TCMB's daily bulletin, when the Function is reachable. */
  today: { usd: number | null; eur: number | null; asOf: string | null } | null;
  notes: string[];
  /** Bumped whenever the underlying series changes, to force recomputation. */
  version: number;
}

interface LivePayload {
  cpi?: Record<string, number>;
  today?: { usd: number | null; eur: number | null; asOf: string | null };
  notes?: string[];
}

/**
 * Splices a differently-based index onto the bundled one.
 *
 * EVDS publishes TÜFE on a 2003 = 100 base; the bundled series is 2010 = 100.
 * Rather than convert with a hard-coded constant, we find a year both series
 * cover and scale by the ratio observed there — standard chain-linking, and it
 * stays correct if either base is ever revised.
 */
function chainLink(incoming: Record<string, number>): Record<string, number> | null {
  const overlap = Object.keys(incoming)
    .map(Number)
    .filter((y) => cpi(y) != null)
    .sort((a, b) => b - a)[0];

  if (overlap == null) return null;

  const bundled = cpi(overlap);
  const theirs = incoming[String(overlap)];
  if (bundled == null || !theirs) return null;

  const scale = bundled / theirs;
  const out: Record<string, number> = {};
  for (const [year, value] of Object.entries(incoming)) {
    if (Number(year) > MAX_YEAR) out[year] = value * scale;
  }
  return Object.keys(out).length ? out : null;
}

export function useLiveData(): LiveState {
  const [state, setState] = useState<LiveState>({
    status: 'loading',
    maxYear: MAX_YEAR,
    today: null,
    notes: [],
    version: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    (async () => {
      try {
        const res = await fetch('/api/live', { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as LivePayload;
        if (cancelled) return;

        const linked = payload.cpi ? chainLink(payload.cpi) : null;
        if (linked) applyLiveCpi(linked);

        const years = linked ? Object.keys(linked).map(Number) : [];
        setState((s) => ({
          status: linked ? 'extended' : 'bundled',
          maxYear: years.length ? Math.max(MAX_YEAR, ...years) : MAX_YEAR,
          today: payload.today ?? null,
          notes: payload.notes ?? [],
          version: s.version + 1,
        }));
      } catch {
        // No Function deployed, no key, or offline. The bundled series is the
        // product; this path is expected on a plain static deploy.
        if (!cancelled) setState((s) => ({ ...s, status: 'bundled', version: s.version + 1 }));
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return state;
}
