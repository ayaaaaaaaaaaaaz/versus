import { describe, expect, it } from 'vitest';
import {
  adjust,
  annualisedRate,
  cumulativeInflationPct,
  erosionSeries,
  halfLifeYear,
  multiplier,
  peakInflationYear,
  survivingValue,
} from '../inflation';
import { MAX_YEAR, MIN_YEAR, cpi } from '../series';
import series from '../../data/series.json';

describe('the bundled series', () => {
  it('covers a contiguous run of years', () => {
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
      expect(cpi(y), `missing CPI for ${y}`).not.toBeNull();
    }
  });

  it('is monotonically rising — Turkey had no deflationary year', () => {
    for (let y = MIN_YEAR + 1; y <= MAX_YEAR; y++) {
      expect(cpi(y)!).toBeGreaterThan(cpi(y - 1)!);
    }
  });

  it('reproduces the World Bank published inflation rates it was derived from', () => {
    // Spot values read from FP.CPI.TOTL.ZG at generation time.
    const published: Record<number, number> = {
      2020: 12.28, 2021: 19.6, 2022: 72.31, 2023: 53.86, 2024: 58.51, 2025: 34.88,
    };
    for (const [year, want] of Object.entries(published)) {
      expect(series.inflation[year as keyof typeof series.inflation]).toBeCloseTo(want, 1);
    }
  });
});

describe('purchasing power maths', () => {
  it('is the identity when both years are the same', () => {
    expect(multiplier(2015, 2015)).toBe(1);
    expect(adjust(1000, 2015, 2015)).toBe(1000);
  });

  it('matches the CPI ratio directly', () => {
    const want = cpi(2025)! / cpi(2010)!;
    expect(multiplier(2010, 2025)).toBeCloseTo(want, 10);
    expect(adjust(1000, 2010, 2025)).toBeCloseTo(1000 * want, 6);
  });

  it('round-trips: adjusting forward then back returns the original', () => {
    const there = adjust(1234.56, 1995, 2020);
    expect(adjust(there, 2020, 1995)).toBeCloseTo(1234.56, 6);
  });

  it('treats surviving value as the reciprocal of the multiplier', () => {
    expect(survivingValue(2000, 2020) * multiplier(2000, 2020)).toBeCloseTo(1, 12);
  });

  it('derives cumulative inflation from the same multiplier', () => {
    expect(cumulativeInflationPct(2010, 2025)).toBeCloseTo((multiplier(2010, 2025) - 1) * 100, 8);
  });

  it('compounds the annualised rate back to the total multiplier', () => {
    const span = 2025 - 2005;
    const r = annualisedRate(2005, 2025) / 100;
    expect(Math.pow(1 + r, span)).toBeCloseTo(multiplier(2005, 2025), 6);
  });

  it('returns zero annualised rate for a zero-length span', () => {
    expect(annualisedRate(2020, 2020)).toBe(0);
  });
});

describe('erosionSeries', () => {
  const rows = erosionSeries(1000, 2010, 2025);

  it('emits one row per year, inclusive of both ends', () => {
    expect(rows).toHaveLength(16);
    expect(rows[0].year).toBe(2010);
    expect(rows.at(-1)!.year).toBe(2025);
  });

  it('starts at the full amount in both nominal and real terms', () => {
    expect(rows[0].nominal).toBeCloseTo(1000, 6);
    expect(rows[0].real).toBeCloseTo(1000, 6);
    expect(rows[0].realPct).toBeCloseTo(100, 6);
  });

  it('erodes real value while the nominal ladder climbs', () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].real).toBeLessThan(rows[i - 1].real);
      expect(rows[i].nominal).toBeGreaterThan(rows[i - 1].nominal);
    }
  });

  it('is symmetric about the multiplier at the far end', () => {
    expect(rows.at(-1)!.nominal).toBeCloseTo(1000 * multiplier(2010, 2025), 6);
    expect(rows.at(-1)!.real).toBeCloseTo(1000 / multiplier(2010, 2025), 6);
  });

  it('orders arguments defensively', () => {
    expect(erosionSeries(1000, 2025, 2010)).toHaveLength(16);
  });
});

describe('narrative helpers', () => {
  it('finds the year value first halves', () => {
    const y = halfLifeYear(2010, 2025);
    expect(y).not.toBeNull();
    expect(survivingValue(2010, y!)).toBeLessThanOrEqual(0.5);
    expect(survivingValue(2010, y! - 1)).toBeGreaterThan(0.5);
  });

  it('returns null when value never halves in the span', () => {
    expect(halfLifeYear(2013, 2014)).toBeNull();
  });

  it('picks 2022 as the worst year of the 2015-2025 window', () => {
    expect(peakInflationYear(2015, 2025)?.year).toBe(2022);
  });
});
