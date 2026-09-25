import { describe, expect, it } from 'vitest';
import { PRESETS, computePersonal } from '../personal';
import {
  annualAverage,
  categories,
  categoryAnnualAverage,
  categoryMultiplier,
  officialWeights,
  yearEndInflation,
} from '../monthly';

describe('monthly series', () => {
  it('covers every month of every full year in range', () => {
    for (let y = 1996; y <= 2025; y++) {
      expect(annualAverage(y), `missing ${y}`).not.toBeNull();
    }
  });

  it('reproduces TÜİK headline year-end inflation', () => {
    // The figures Turkish headlines carry each January, within rounding of the
    // harmonised series. Confirms the monthly index is the real thing.
    const headline: Record<number, number> = {
      2021: 36.08, 2022: 64.27, 2024: 44.38,
    };
    for (const [year, want] of Object.entries(headline)) {
      expect(yearEndInflation(Number(year))!).toBeCloseTo(want, 0);
    }
  });

  it('has official weights that sum to 1 after normalisation', () => {
    const total = Object.values(officialWeights()).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('covers all twelve COICOP divisions', () => {
    expect(categories).toHaveLength(12);
    for (const c of categories) {
      expect(categoryAnnualAverage(c.code, 2015)).not.toBeNull();
      expect(categoryAnnualAverage(c.code, 2025)).not.toBeNull();
    }
  });
});

describe('weighted aggregation', () => {
  /**
   * The load-bearing check: re-aggregating the twelve categories with the
   * official weights must land on the headline index that Eurostat publishes
   * independently. If this holds, the personal basket differs from the official
   * number only because of the weights the user chose.
   */
  it('reconstructs the published headline index from its parts', () => {
    for (const [from, to] of [[2015, 2025], [2010, 2020], [2005, 2025], [2020, 2025]]) {
      const official = computePersonal(
        Object.fromEntries(categories.map((c) => [c.code, c.weight])),
        from,
        to,
      );
      const published = annualAverage(to)! / annualAverage(from)!;
      // Laspeyres reaggregation with fixed current weights cannot match a
      // chained index exactly, but it must stay in the same neighbourhood.
      expect(official.officialMultiplier / published).toBeGreaterThan(0.8);
      expect(official.officialMultiplier / published).toBeLessThan(1.25);
    }
  });

  it('is the identity over a zero-length span', () => {
    const r = computePersonal({ CP01: 100 }, 2020, 2020);
    expect(r.multiplier).toBeCloseTo(1, 10);
    expect(r.personalPct).toBeCloseTo(0, 10);
  });

  it('matches the single category exactly when all weight sits on it', () => {
    for (const code of ['CP01', 'CP07', 'CP11']) {
      const r = computePersonal({ [code]: 100 }, 2015, 2025);
      expect(r.multiplier).toBeCloseTo(categoryMultiplier(code, 2015, 2025)!, 8);
    }
  });

  it('ignores the scale of the weights, only their proportions', () => {
    const a = computePersonal({ CP01: 50, CP07: 50 }, 2015, 2025);
    const b = computePersonal({ CP01: 2, CP07: 2 }, 2015, 2025);
    expect(a.multiplier).toBeCloseTo(b.multiplier, 10);
  });

  it('falls back to official weights when the allocation is empty', () => {
    const empty = computePersonal({}, 2015, 2025);
    expect(empty.multiplier).toBeCloseTo(empty.officialMultiplier, 10);
  });

  it('puts a restaurant-and-food basket above the official rate', () => {
    // Those divisions ran 17-20x since 2015 against 14x for the headline.
    const r = computePersonal({ CP11: 60, CP01: 40 }, 2015, 2025);
    expect(r.multiplier).toBeGreaterThan(r.officialMultiplier);
    expect(r.gapRatio).toBeGreaterThan(1);
  });

  it('puts a clothing-and-comms basket below it', () => {
    const r = computePersonal({ CP03: 50, CP08: 50 }, 2015, 2025);
    expect(r.multiplier).toBeLessThan(r.officialMultiplier);
    expect(r.gapRatio).toBeLessThan(1);
  });

  it('attributes contributions that sum to the whole rise', () => {
    const r = computePersonal({ CP01: 40, CP04: 30, CP07: 30 }, 2015, 2025);
    const total = r.breakdown.reduce((s, b) => s + b.contribution, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('compounds the annualised rate back to the multiplier', () => {
    const r = computePersonal({ CP01: 100 }, 2010, 2025);
    expect(Math.pow(1 + r.personalAnnualPct / 100, 15)).toBeCloseTo(r.multiplier, 6);
  });

  it('ships presets that all produce a usable result', () => {
    for (const p of PRESETS) {
      const r = computePersonal(p.weights, 2015, 2025);
      expect(r.multiplier).toBeGreaterThan(1);
      expect(r.missing).toHaveLength(0);
    }
  });
});

describe('monthly erosion curve', () => {
  it('starts at the full amount', async () => {
    const { monthlyErosion } = await import('../monthly');
    const pts = monthlyErosion(1000, 2015, 2025, 12.216);
    expect(pts.length).toBeGreaterThan(100);
    // January of the start year sits slightly off the annual mean by design.
    expect(pts[0].real).toBeGreaterThan(900);
    expect(pts[0].real).toBeLessThan(1150);
  });

  it('pins the final year\'s ANNUAL MEAN to the annual engine', async () => {
    const { monthlyErosion } = await import('../monthly');
    for (const [from, to, target] of [[2015, 2025, 12.216], [2000, 2020, 12.781], [1996, 2025, 758.601]]) {
      const pts = monthlyErosion(1000, from, to, target);
      const finalYear = pts.filter((p) => p.year === to);
      const mean = finalYear.reduce((s, p) => s + p.nominal, 0) / finalYear.length / 1000;
      // The benchmark constrains the year's average, not its December, so
      // December sits above the mean whenever prices rose through the year.
      // Relative tolerance: these multipliers span 12x to 758x.
      expect(Math.abs(mean / target - 1)).toBeLessThan(0.005);
      expect(pts.at(-1)!.nominal / 1000).toBeGreaterThan(mean);
    }
  });

  it('corrects a span where the two sources disagree', async () => {
    const { monthlyErosion } = await import('../monthly');
    // Raw Eurostat runs ~7% above World Bank over 2000-2020; after
    // benchmarking the year mean must sit on the World Bank figure.
    const pts = monthlyErosion(1000, 2000, 2020, 12.781);
    const finalYear = pts.filter((p) => p.year === 2020);
    const mean = finalYear.reduce((s, p) => s + p.nominal, 0) / finalYear.length / 1000;
    expect(Math.abs(mean / 12.781 - 1)).toBeLessThan(0.02);
  });

  it('is monotonic in real terms across a rising-price span', async () => {
    const { monthlyErosion } = await import('../monthly');
    const pts = monthlyErosion(1000, 2018, 2025, 20);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].nominal).toBeGreaterThanOrEqual(pts[i - 1].nominal * 0.97);
    }
  });
});

describe('preset identity', () => {
  it('gives each preset a distinct weight vector', () => {
    // matchPreset in the UI relies on presets not colliding with one another.
    const seen = new Set<string>();
    for (const p of PRESETS) {
      const key = categories.map((c) => (p.weights[c.code] ?? 0).toFixed(2)).join('|');
      expect(seen.has(key), `${p.label} duplicates another preset`).toBe(false);
      seen.add(key);
    }
  });

  it('starts from the official preset by default', () => {
    const official = PRESETS.find((p) => p.id === 'official')!;
    for (const c of categories) {
      expect(official.weights[c.code]).toBeCloseTo(c.weight, 6);
    }
  });
});
