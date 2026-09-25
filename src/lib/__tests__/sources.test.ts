import { describe, expect, it } from 'vitest';
import {
  SOURCES,
  SOURCE_LIST,
  clampToCoverage,
  commonSpan,
  compareSources,
  getSource,
  clampSpan,
  halfLifeYearFor,
  metricsFor,
  peakYearFor,
  rangePresets,
  selectableBounds,
} from '../sources';
import { buildChartSeries, buildComparison } from '../chart';
import { multiplier } from '../inflation';

describe('source registry', () => {
  it('describes every source completely', () => {
    for (const s of SOURCE_LIST) {
      expect(s.label).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      expect(s.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.maxYear).toBeGreaterThan(s.minYear);
      expect(['annual-average', 'year-end']).toContain(s.basis);
    }
  });

  it('keeps ids and accents distinct so the UI cannot conflate two sources', () => {
    expect(new Set(SOURCE_LIST.map((s) => s.id)).size).toBe(SOURCE_LIST.length);
    expect(new Set(SOURCE_LIST.map((s) => s.accent)).size).toBe(SOURCE_LIST.length);
  });

  it('resolves a source by id', () => {
    expect(getSource('enag').id).toBe('enag');
    expect(getSource('tuik').id).toBe('tuik');
  });

  it('exposes a year-end index on every source, whatever its native basis', () => {
    for (const s of SOURCE_LIST) {
      const probe = Math.max(s.minYear, 2021);
      expect(s.yearEndIndex(probe), `${s.id} has no year-end index`).not.toBeNull();
    }
  });
});

describe('coverage clamping', () => {
  it('narrows a span to what the source covers', () => {
    const span = clampToCoverage(SOURCES.enag, 2010, 2030);
    expect(span).toEqual({ from: SOURCES.enag.minYear, to: SOURCES.enag.maxYear, clipped: true });
  });

  it('reports no clipping when the span already fits', () => {
    expect(clampToCoverage(SOURCES.tuik, 2010, 2020)?.clipped).toBe(false);
  });

  it('returns null when the source misses the span entirely', () => {
    expect(clampToCoverage(SOURCES.enag, 1970, 1980)).toBeNull();
  });

  it('finds the span every source shares', () => {
    const span = commonSpan(1960, 2025);
    expect(span).not.toBeNull();
    expect(span!.from).toBeGreaterThanOrEqual(SOURCES.enag.minYear);
    expect(span!.to).toBeLessThanOrEqual(SOURCES.enag.maxYear);
  });
});

describe('metrics', () => {
  it('matches the existing official engine on the official source', () => {
    const m = metricsFor(SOURCES.tuik, 2010, 2025)!;
    expect(m.multiplier).toBeCloseTo(multiplier(2010, 2025), 10);
    expect(m.surviving).toBeCloseTo(1 / m.multiplier, 12);
    expect(m.cumulativePct).toBeCloseTo((m.multiplier - 1) * 100, 8);
  });

  it('compounds its annual rate back to its multiplier', () => {
    for (const s of SOURCE_LIST) {
      const m = metricsFor(s, s.minYear, s.maxYear)!;
      const years = m.to - m.from;
      expect(Math.pow(1 + m.annualPct / 100, years)).toBeCloseTo(m.multiplier, 6);
    }
  });

  it('reports the clamped span it actually used', () => {
    const m = metricsFor(SOURCES.enag, 1990, 2025)!;
    expect(m.clipped).toBe(true);
    expect(m.from).toBe(SOURCES.enag.minYear);
    expect(m.to).toBe(SOURCES.enag.maxYear);
  });

  it('returns null rather than guessing when uncovered', () => {
    expect(metricsFor(SOURCES.enag, 1970, 1980)).toBeNull();
  });

  it('puts ENAG above the official series on a shared basis', () => {
    const rows = compareSources(2020, 2024);
    expect(rows).toHaveLength(2);
    const tuik = rows.find((r) => r.source.id === 'tuik')!;
    const enag = rows.find((r) => r.source.id === 'enag')!;
    expect(enag.multiplier).toBeGreaterThan(tuik.multiplier);
  });

  it('forces a shared basis when asked, changing the official figure', () => {
    const native = metricsFor(SOURCES.tuik, 2020, 2024)!;
    const shared = metricsFor(SOURCES.tuik, 2020, 2024, 'year-end')!;
    // Annual-average and year-end genuinely differ; if they did not, the
    // comparison view would be forcing a basis for no reason.
    expect(shared.multiplier).not.toBeCloseTo(native.multiplier, 3);
  });
});

describe('narrative helpers per source', () => {
  it('finds a peak year inside each source coverage', () => {
    for (const s of SOURCE_LIST) {
      const peak = peakYearFor(s, s.minYear, s.maxYear)!;
      expect(peak.year).toBeGreaterThanOrEqual(s.minYear);
      expect(peak.year).toBeLessThanOrEqual(s.maxYear);
      expect(peak.rate).toBeGreaterThan(0);
    }
  });

  it('halves faster on ENAG than on the official series', () => {
    const official = halfLifeYearFor(SOURCES.tuik, 2020, 2024);
    const enag = halfLifeYearFor(SOURCES.enag, 2020, 2024);
    expect(enag).not.toBeNull();
    // ENAG measured more inflation, so value halves no later than officially.
    if (official != null) expect(enag!).toBeLessThanOrEqual(official);
  });
});

describe('chart series per source', () => {
  it('draws the official series at month resolution', () => {
    const s = buildChartSeries(1000, 2015, 2025, SOURCES.tuik);
    expect(s.isMonthly).toBe(true);
    expect(s.points.length).toBeGreaterThan(100);
  });

  it('draws ENAG annually within its own coverage', () => {
    const s = buildChartSeries(1000, 2010, 2030, SOURCES.enag);
    expect(s.isMonthly).toBe(false);
    expect(s.clipped).toBe(true);
    expect(s.from).toBe(SOURCES.enag.minYear);
    expect(s.points.every((p) => p.x >= s.from && p.x <= s.to)).toBe(true);
  });

  it('starts every source curve at the full amount', () => {
    for (const s of SOURCE_LIST) {
      const series = buildChartSeries(1000, s.minYear, s.maxYear, s);
      expect(series.points[0].real).toBeCloseTo(1000, 6);
    }
  });
});

describe('comparison series', () => {
  const cmp = buildComparison(1000, 2010, 2025);

  it('covers only the shared span and says so', () => {
    expect(cmp.clipped).toBe(true);
    expect(cmp.keys).toHaveLength(2);
    expect(cmp.points.length).toBeGreaterThan(1);
  });

  it('starts both series at the same amount', () => {
    const first = cmp.points[0];
    for (const k of cmp.keys) expect(first[k.id]).toBeCloseTo(1000, 6);
  });

  it('leaves less under ENAG than under the official series by the end', () => {
    const last = cmp.points.at(-1)!;
    expect(last.enag as number).toBeLessThan(last.tuik as number);
  });

  it('keeps nominal and real consistent for each source', () => {
    for (const p of cmp.points) {
      for (const k of cmp.keys) {
        const real = p[k.id] as number;
        const nominal = p[`${k.id}_nominal`] as number;
        // real x nominal = amount^2 when both derive from the same multiplier.
        expect(real * nominal).toBeCloseTo(1000 * 1000, 2);
      }
    }
  });

  it('returns an empty, flagged result when no shared span exists', () => {
    const none = buildComparison(1000, 1970, 1980);
    expect(none.points).toHaveLength(0);
    expect(none.clipped).toBe(true);
  });
});

describe('selectable bounds', () => {
  it('tracks the active source rather than the widest one', () => {
    const official = selectableBounds(SOURCES.tuik, false, SOURCES.tuik.maxYear);
    const enag = selectableBounds(SOURCES.enag, false, SOURCES.tuik.maxYear);
    expect(official.min).toBe(SOURCES.tuik.minYear);
    expect(enag.min).toBe(SOURCES.enag.minYear);
    expect(enag.max).toBe(SOURCES.enag.maxYear);
    expect(enag.min).toBeGreaterThan(official.min);
  });

  it('never exceeds what the live data reaches', () => {
    const b = selectableBounds(SOURCES.tuik, false, 2022);
    expect(b.max).toBe(2022);
  });

  it('narrows to the shared span while comparing', () => {
    const b = selectableBounds(SOURCES.tuik, true, SOURCES.tuik.maxYear);
    expect(b.min).toBe(SOURCES.enag.minYear);
    expect(b.max).toBe(SOURCES.enag.maxYear);
  });

  /**
   * The reported bug: with ENAG selected and a span outside its coverage, the
   * app showed no change at all instead of an error. Bounds now make that span
   * unreachable, and a clamped span always prices.
   */
  it('makes every in-bounds span priceable by the selected source', () => {
    for (const source of SOURCE_LIST) {
      const bounds = selectableBounds(source, false, source.maxYear);
      for (const [from, to] of [
        [bounds.min, bounds.max],
        [bounds.min, bounds.min + 1],
        [bounds.max - 1, bounds.max],
      ]) {
        const m = metricsFor(source, from, to);
        expect(m, `${source.id} ${from}-${to}`).not.toBeNull();
        expect(m!.multiplier).toBeGreaterThan(1);
      }
    }
  });
});

describe('clampSpan', () => {
  const bounds = { min: 2020, max: 2024 };

  it('pulls an out-of-range span back inside', () => {
    expect(clampSpan(1990, 2000, bounds)).toEqual({ from: 2020, to: 2021 });
    expect(clampSpan(2030, 2040, bounds)).toEqual({ from: 2023, to: 2024 });
  });

  it('leaves an in-range span alone', () => {
    expect(clampSpan(2021, 2023, bounds)).toEqual({ from: 2021, to: 2023 });
  });

  it('always keeps at least one year of span', () => {
    for (const [from, to] of [[2022, 2022], [2024, 2024], [2024, 2020]]) {
      const r = clampSpan(from, to, bounds);
      expect(r.to).toBeGreaterThan(r.from);
      expect(r.from).toBeGreaterThanOrEqual(bounds.min);
      expect(r.to).toBeLessThanOrEqual(bounds.max);
    }
  });

  it('is idempotent', () => {
    const once = clampSpan(1990, 2050, bounds);
    expect(clampSpan(once.from, once.to, bounds)).toEqual(once);
  });
});

describe('range presets', () => {
  it('offers nothing outside the bounds', () => {
    for (const source of SOURCE_LIST) {
      const b = selectableBounds(source, false, source.maxYear);
      for (const p of rangePresets(b.min, b.max)) {
        expect(p.from).toBeGreaterThanOrEqual(b.min);
        expect(p.from).toBeLessThan(b.max);
      }
    }
  });

  it('never repeats the same span twice', () => {
    const froms = rangePresets(2020, 2024).map((p) => p.from);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('still gives a narrow source something to click', () => {
    expect(rangePresets(2020, 2024).length).toBeGreaterThan(1);
  });

  it('offers the long anchors only when they fit', () => {
    expect(rangePresets(2020, 2024).some((p) => p.from === 1980)).toBe(false);
    expect(rangePresets(1960, 2025).some((p) => p.from === 1980)).toBe(true);
  });
});
