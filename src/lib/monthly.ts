import monthlyData from '../data/monthly.json';
import categoryData from '../data/categories.json';

type MonthMap = Record<string, number>;

interface MonthlyMeta {
  source: string;
  upstream: string;
  basis: string;
  licence: string;
  generatedAt: string;
  minMonth: string;
  maxMonth: string;
}

export const monthlyMeta = monthlyData.meta as MonthlyMeta;
const index = monthlyData.index as MonthMap;
const yoy = monthlyData.yoy as MonthMap;

export const MIN_MONTH = monthlyMeta.minMonth;
export const MAX_MONTH = monthlyMeta.maxMonth;
export const MIN_MONTHLY_YEAR = Number(MIN_MONTH.slice(0, 4));
export const MAX_MONTHLY_YEAR = Number(MAX_MONTH.slice(0, 4));

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const monthlyIndex = (month: string): number | null => index[month] ?? null;
export const monthlyYoY = (month: string): number | null => yoy[month] ?? null;

/** Every month present in the series, ascending. */
export const allMonths = Object.keys(index).sort();

export function monthsInRange(fromMonth: string, toMonth: string): string[] {
  return allMonths.filter((m) => m >= fromMonth && m <= toMonth);
}

const averageOf = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
};

/** Mean of a year's twelve monthly observations — the basis the annual engine uses. */
export function annualAverage(year: number): number | null {
  return averageOf(Array.from({ length: 12 }, (_, i) => monthlyIndex(monthKey(year, i + 1))));
}

/** December value — the basis TÜİK's headline January announcement uses. */
export function yearEnd(year: number): number | null {
  return monthlyIndex(monthKey(year, 12));
}

/**
 * Year-end inflation: December against the previous December. This is the
 * number Turkish headlines report each January, and it differs from the
 * annual-average basis the calculator runs on.
 */
export function yearEndInflation(year: number): number | null {
  const now = yearEnd(year);
  const prior = yearEnd(year - 1);
  if (now == null || prior == null) return null;
  return (now / prior - 1) * 100;
}

// ---------------------------------------------------------------------------
// COICOP categories
// ---------------------------------------------------------------------------

export interface Category {
  code: string;
  tr: string;
  short: string;
  emoji: string;
  /** Official HICP expenditure share, percent. */
  weight: number;
}

export const categoryMeta = categoryData.meta as MonthlyMeta & {
  weightYear: string;
  weightNote: string;
};

export const categories = categoryData.categories as Category[];
const categoryIndexes = categoryData.index as Record<string, MonthMap>;

export const categoryIndex = (code: string, month: string): number | null =>
  categoryIndexes[code]?.[month] ?? null;

export function categoryAnnualAverage(code: string, year: number): number | null {
  return averageOf(Array.from({ length: 12 }, (_, i) => categoryIndex(code, monthKey(year, i + 1))));
}

/** Price relative for one category across a span of years, on the annual-average basis. */
export function categoryMultiplier(code: string, fromYear: number, toYear: number): number | null {
  const a = categoryAnnualAverage(code, fromYear);
  const b = categoryAnnualAverage(code, toYear);
  if (a == null || b == null || a === 0) return null;
  return b / a;
}

/** Official weights normalised to sum to exactly 1. */
export function officialWeights(): Record<string, number> {
  const total = categories.reduce((s, c) => s + c.weight, 0);
  return Object.fromEntries(categories.map((c) => [c.code, c.weight / total]));
}

/** The span both the category indices and the headline index fully cover. */
export const CATEGORY_MIN_YEAR = MIN_MONTHLY_YEAR;
export const CATEGORY_MAX_YEAR = MAX_MONTHLY_YEAR;

// ---------------------------------------------------------------------------
// Monthly erosion curve
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  /** 'YYYY-MM' — also the chart's x key. */
  t: string;
  year: number;
  /** The starting amount restated in that month's lira. */
  nominal: number;
  /** What the starting amount still buys, in starting-year lira. */
  real: number;
  realPct: number;
  /** Year-over-year CPI change at that month, percent. */
  yoy: number | null;
}

/**
 * Month-resolution version of the erosion curve.
 *
 * The monthly index (Eurostat HICP) and the annual index the calculator runs on
 * (World Bank/TÜİK CPI) are different measurements of the same thing. Over
 * recent spans they agree to within 0.2%, but over 2000-2020 they diverge by
 * about 7%. Drawing the raw monthly series would therefore let the chart end
 * somewhere the headline figure does not.
 *
 * So the curve is benchmarked: it keeps the monthly series' *shape* while a
 * smooth log-linear correction spreads the discrepancy across the span, pinning
 * both endpoints to the annual series. The start is exact by construction and
 * the end matches `targetMultiplier` exactly. This is the usual way a
 * high-frequency indicator is fitted to an annual benchmark.
 *
 * @param targetMultiplier the annual engine's multiplier for the same span
 */
export function monthlyErosion(
  amount: number,
  fromYear: number,
  toYear: number,
  targetMultiplier?: number,
): MonthlyPoint[] {
  const base = annualAverage(fromYear);
  if (base == null || base === 0) return [];

  const first = monthKey(fromYear, 1);
  const last = monthKey(toYear, 12);
  const months = monthsInRange(first, last);
  if (!months.length) return [];

  const endIndex = annualAverage(toYear);
  const ownMultiplier = endIndex == null ? null : endIndex / base;

  // How far the monthly series lands from the annual benchmark, spread evenly
  // in log space so no single month absorbs the whole correction.
  const drift =
    targetMultiplier != null && ownMultiplier != null && ownMultiplier > 0
      ? targetMultiplier / ownMultiplier
      : 1;

  const points: MonthlyPoint[] = [];
  months.forEach((t, i) => {
    const value = monthlyIndex(t);
    if (value == null) return;
    const progress = months.length > 1 ? i / (months.length - 1) : 1;
    const m = (value / base) * Math.pow(drift, progress);
    const real = amount / m;
    points.push({
      t,
      year: Number(t.slice(0, 4)),
      nominal: amount * m,
      real,
      realPct: amount === 0 ? 0 : (real / amount) * 100,
      yoy: monthlyYoY(t),
    });
  });
  return points;
}

/** Whether a span can be drawn at month resolution at all. */
export const hasMonthly = (fromYear: number, toYear: number) =>
  fromYear >= MIN_MONTHLY_YEAR && toYear <= MAX_MONTHLY_YEAR && toYear > fromYear;
