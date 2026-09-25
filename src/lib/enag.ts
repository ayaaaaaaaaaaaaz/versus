import enagData from '../data/enag.json';
import { yearEnd } from './monthly';

export interface EnagObservation {
  month: string;
  monthlyPct: number;
  annualPct: number | null;
  source: string;
  capturedAt: string;
  /** 'press' when the figure came from a news report rather than the archive. */
  via?: string;
}

export const enagMeta = enagData.meta as {
  source: string;
  collection: string;
  why: string;
  caveat: string;
  provenance?: string;
  harvestedAt: string;
  minMonth: string;
  maxMonth: string;
  count: number;
};

export const enagObservations = enagData.observations as EnagObservation[];

/**
 * ENAGrup's index, rebuilt on a December-to-December basis.
 *
 * Only the twelve-month rates announced each December are reliable enough to
 * chain: the harvested monthly series has gaps (all of 2023 is missing from the
 * archive), and chaining across a gap would silently treat a missing month as
 * zero inflation. Each December rate instead states the whole year at once, so
 * a year is either fully covered or absent.
 *
 * Indexed to December 2020 = 100, which is as far back as ENAGrup published.
 */
function buildYearEndIndex(): Record<number, number> {
  const index: Record<number, number> = { 2020: 100 };
  for (let year = 2021; year <= 2030; year++) {
    const december = enagObservations.find((o) => o.month === `${year}-12`);
    const previous = index[year - 1];
    if (december?.annualPct == null || previous == null) break;
    index[year] = previous * (1 + december.annualPct / 100);
  }
  return index;
}

const ENAG_INDEX = buildYearEndIndex();

const coveredYears = Object.keys(ENAG_INDEX).map(Number).sort((a, b) => a - b);
export const ENAG_MIN_YEAR = coveredYears[0];
export const ENAG_MAX_YEAR = coveredYears.at(-1)!;

export const enagIndex = (year: number): number | null => ENAG_INDEX[year] ?? null;

/** December-to-December price relative on ENAGrup's index. */
export function enagMultiplier(fromYear: number, toYear: number): number | null {
  const a = enagIndex(fromYear);
  const b = enagIndex(toYear);
  if (a == null || b == null || a === 0) return null;
  return b / a;
}

/** The same December-to-December basis, computed on the official index. */
export function officialYearEndMultiplier(fromYear: number, toYear: number): number | null {
  const a = yearEnd(fromYear);
  const b = yearEnd(toYear);
  if (a == null || b == null || a === 0) return null;
  return b / a;
}

/**
 * How much higher ENAGrup's measured price level runs than the official one
 * across a span. 2.0 means ENAGrup measured twice the cumulative rise.
 */
export function enagRatio(fromYear: number, toYear: number): number | null {
  const enag = enagMultiplier(fromYear, toYear);
  const official = officialYearEndMultiplier(fromYear, toYear);
  if (enag == null || official == null || official === 0) return null;
  return enag / official;
}

export const enagCovers = (fromYear: number, toYear: number) =>
  fromYear >= ENAG_MIN_YEAR && toYear <= ENAG_MAX_YEAR && toYear > fromYear;

/** Year-end rates for both measures, for the comparison table. */
export interface YearRow {
  year: number;
  official: number | null;
  enag: number | null;
}

export function yearEndComparison(): YearRow[] {
  const rows: YearRow[] = [];
  for (let year = ENAG_MIN_YEAR + 1; year <= ENAG_MAX_YEAR; year++) {
    const officialNow = yearEnd(year);
    const officialPrior = yearEnd(year - 1);
    const december = enagObservations.find((o) => o.month === `${year}-12`);
    rows.push({
      year,
      official: officialNow != null && officialPrior ? (officialNow / officialPrior - 1) * 100 : null,
      enag: december?.annualPct ?? null,
    });
  }
  return rows;
}

export type InflationSource = 'tuik' | 'enag';
