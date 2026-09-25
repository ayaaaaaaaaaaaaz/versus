import { MAX_YEAR, MIN_YEAR, cpi, inflationRate, usdRate, eurRate } from './series';

export const clampYear = (y: number) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(y)));

/**
 * How many lira in `to` buy what 1 lira bought in `from`.
 * Uses the annual-average CPI, so `multiplier(2010, 2025)` reads as
 * "2025 lira needed per 2010 lira, on average over each year".
 */
export function multiplier(from: number, to: number): number {
  const a = cpi(clampYear(from));
  const b = cpi(clampYear(to));
  if (a == null || b == null || a === 0) return 1;
  return b / a;
}

/** The nominal amount in `to` with the same purchasing power as `amount` in `from`. */
export function adjust(amount: number, from: number, to: number): number {
  return amount * multiplier(from, to);
}

/** Total price-level increase across the span, in percent. */
export function cumulativeInflationPct(from: number, to: number): number {
  return (multiplier(from, to) - 1) * 100;
}

/**
 * Share of the original purchasing power that survives.
 * 1 TRY from `from` is worth this many `from`-lira once it reaches `to`.
 */
export function survivingValue(from: number, to: number): number {
  return 1 / multiplier(from, to);
}

/** Percentage of purchasing power lost across the span. */
export function erosionPct(from: number, to: number): number {
  return (1 - survivingValue(from, to)) * 100;
}

/** Geometric mean annual inflation across the span, in percent. */
export function annualisedRate(from: number, to: number): number {
  const span = clampYear(to) - clampYear(from);
  if (span <= 0) return 0;
  return (Math.pow(multiplier(from, to), 1 / span) - 1) * 100;
}

export interface ErosionPoint {
  year: number;
  /** `amount` restated in that year's lira - the nominal ladder. */
  nominal: number;
  /** What the original `amount` still buys, in `from`-year lira - the decay curve. */
  real: number;
  /** Real value as a percentage of the starting amount. */
  realPct: number;
  /** Year-over-year CPI change, percent. */
  inflation: number | null;
  /** The original amount converted at that year's average USD rate. */
  usd: number | null;
  eur: number | null;
}

export function erosionSeries(amount: number, from: number, to: number): ErosionPoint[] {
  const lo = clampYear(Math.min(from, to));
  const hi = clampYear(Math.max(from, to));
  const points: ErosionPoint[] = [];
  for (let y = lo; y <= hi; y++) {
    const m = multiplier(lo, y);
    const real = amount / m;
    const usd = usdRate(y);
    const eur = eurRate(y);
    points.push({
      year: y,
      nominal: amount * m,
      real,
      realPct: (real / amount) * 100,
      inflation: inflationRate(y),
      usd: usd ? amount / usd : null,
      eur: eur ? amount / eur : null,
    });
  }
  return points;
}

/** The year in the span where the original amount first drops below `pct` of its value. */
export function halfLifeYear(from: number, to: number, pct = 50): number | null {
  const lo = clampYear(from);
  const hi = clampYear(to);
  for (let y = lo; y <= hi; y++) {
    if ((1 / multiplier(lo, y)) * 100 <= pct) return y;
  }
  return null;
}

/** Worst single year for prices inside the span. */
export function peakInflationYear(from: number, to: number): { year: number; rate: number } | null {
  const lo = clampYear(from);
  const hi = clampYear(to);
  let best: { year: number; rate: number } | null = null;
  for (let y = lo; y <= hi; y++) {
    const r = inflationRate(y);
    if (r == null) continue;
    if (!best || r > best.rate) best = { year: y, rate: r };
  }
  return best;
}
