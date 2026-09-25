import raw from '../data/series.json';

export interface SeriesMeta {
  source: string;
  upstream: string;
  basis: string;
  cpiLastUpdated: string;
  fxLastUpdated: string;
  generatedAt: string;
  minYear: number;
  maxYear: number;
  redenomination: { year: number; factor: number; note: string };
}

type YearMap = Record<string, number>;

interface RawSeries {
  meta: SeriesMeta;
  cpi: YearMap;
  inflation: YearMap;
  tryPerUsd: YearMap;
  tryPerEur: YearMap;
}

const data = raw as RawSeries;

export const meta = data.meta;

/** Earliest year with a CPI observation. */
export const MIN_YEAR = meta.minYear;
/** Latest year with a CPI observation. This is the app's "now". */
export const MAX_YEAR = meta.maxYear;

/** The 2005 redenomination: 1,000,000 TL -> 1 YTL. */
export const REDENOM_YEAR = meta.redenomination.year;
export const REDENOM_FACTOR = meta.redenomination.factor;

const lookup = (map: YearMap, year: number): number | null => {
  const v = map[String(year)];
  return typeof v === 'number' ? v : null;
};

export const cpi = (year: number): number | null => lookup(data.cpi, year);
export const inflationRate = (year: number): number | null => lookup(data.inflation, year);
export const usdRate = (year: number): number | null => lookup(data.tryPerUsd, year);
export const eurRate = (year: number): number | null => lookup(data.tryPerEur, year);

export const years = Object.keys(data.cpi)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Years supplied by TCMB EVDS at runtime, chain-linked onto the bundled index.
 * Merged in place so the pure lookup helpers above keep working unchanged.
 */
export const applyLiveCpi = (extra: Record<string, number>) => {
  for (const [year, value] of Object.entries(extra)) {
    if (data.cpi[year] == null) data.cpi[year] = value;
  }
};
