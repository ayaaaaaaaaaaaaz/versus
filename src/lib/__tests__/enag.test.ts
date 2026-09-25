import { describe, expect, it } from 'vitest';
import {
  ENAG_MAX_YEAR,
  ENAG_MIN_YEAR,
  enagCovers,
  enagIndex,
  enagMultiplier,
  enagObservations,
  enagRatio,
  officialYearEndMultiplier,
  yearEndComparison,
} from '../enag';
import { computePersonal } from '../personal';
import { categories } from '../monthly';

describe('harvested ENAG dataset', () => {
  it('carries a traceable source for every observation', () => {
    expect(enagObservations.length).toBeGreaterThan(30);
    for (const o of enagObservations) {
      expect(o.source, `${o.month} has no source`).toMatch(/^https?:\/\//);
      expect(o.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(o.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is chronological and free of duplicate months', () => {
    const months = enagObservations.map((o) => o.month);
    expect([...new Set(months)]).toHaveLength(months.length);
    expect([...months].sort()).toEqual(months);
  });

  it('reproduces the figures the press reported at the time', () => {
    // Independently corroborated year-end announcements.
    const known: Record<string, number> = {
      '2021-12': 82.81, '2022-12': 137.55, '2023-12': 127.21, '2024-12': 83.4,
    };
    for (const [month, want] of Object.entries(known)) {
      const row = enagObservations.find((o) => o.month === month);
      expect(row?.annualPct, `${month} missing`).toBeCloseTo(want, 2);
    }
  });

  it('never interpolates a missing month', () => {
    // Gaps must stay gaps; 2023 had no usable archive capture except the
    // press-sourced anchors.
    const has = (m: string) => enagObservations.some((o) => o.month === m);
    expect(has('2023-06')).toBe(false);
    expect(has('2023-12')).toBe(true);
  });

  it('marks press-sourced rows distinctly from archived ones', () => {
    const press = enagObservations.filter((o) => o.via === 'press');
    expect(press.length).toBeGreaterThan(0);
    for (const p of press) expect(p.source).not.toMatch(/web\.archive\.org/);
  });
});

describe('ENAG year-end index', () => {
  it('chains December to December from a base of 100', () => {
    expect(enagIndex(ENAG_MIN_YEAR)).toBe(100);
    for (let y = ENAG_MIN_YEAR + 1; y <= ENAG_MAX_YEAR; y++) {
      const rate = enagObservations.find((o) => o.month === `${y}-12`)!.annualPct!;
      expect(enagIndex(y)!).toBeCloseTo(enagIndex(y - 1)! * (1 + rate / 100), 6);
    }
  });

  it('rises every year across its coverage', () => {
    for (let y = ENAG_MIN_YEAR + 1; y <= ENAG_MAX_YEAR; y++) {
      expect(enagIndex(y)!).toBeGreaterThan(enagIndex(y - 1)!);
    }
  });

  it('stops at the last year with a December anchor', () => {
    expect(enagIndex(ENAG_MAX_YEAR + 1)).toBeNull();
    expect(enagCovers(ENAG_MIN_YEAR, ENAG_MAX_YEAR + 1)).toBe(false);
    expect(enagCovers(ENAG_MIN_YEAR, ENAG_MAX_YEAR)).toBe(true);
  });

  it('is the identity over a zero-length span', () => {
    expect(enagMultiplier(2022, 2022)).toBe(1);
  });

  it('measures more cumulative inflation than the official index', () => {
    const ratio = enagRatio(ENAG_MIN_YEAR, ENAG_MAX_YEAR)!;
    expect(ratio).toBeGreaterThan(2);
    // Sanity bound: a ratio above 10x would mean a parsing error, not a finding.
    expect(ratio).toBeLessThan(10);
  });

  it('exceeds the official rate in every single year', () => {
    for (const row of yearEndComparison()) {
      expect(row.official).not.toBeNull();
      expect(row.enag).not.toBeNull();
      expect(row.enag!, `${row.year}`).toBeGreaterThan(row.official!);
    }
  });

  it('agrees with the official series on the official basis', () => {
    // Guards the year-end comparison used opposite ENAG: 2022 was 64.3%.
    expect(officialYearEndMultiplier(2021, 2022)!).toBeCloseTo(1.6425, 2);
  });
});

describe('personal basket on an alternative level', () => {
  const official = Object.fromEntries(categories.map((c) => [c.code, c.weight]));

  it('leaves the result untouched when no level is supplied', () => {
    const plain = computePersonal(official, 2020, 2024);
    const explicit = computePersonal(official, 2020, 2024, {});
    expect(explicit.multiplier).toBeCloseTo(plain.multiplier, 10);
  });

  it('adopts the supplied level as the baseline', () => {
    const level = enagMultiplier(2020, 2024)!;
    const r = computePersonal(official, 2020, 2024, { levelMultiplier: level });
    expect(r.officialMultiplier).toBeCloseTo(level, 10);
  });

  it('applies the mix as a tilt on top of that level', () => {
    const level = enagMultiplier(2020, 2024)!;
    const weights = { CP11: 60, CP01: 40 };
    const base = computePersonal(weights, 2020, 2024);
    const lifted = computePersonal(weights, 2020, 2024, { levelMultiplier: level });
    expect(lifted.multiplier).toBeCloseTo(level * base.tilt, 8);
    // The tilt itself must not change with the level — it is a weight effect.
    expect(lifted.tilt).toBeCloseTo(base.tilt, 10);
  });

  it('produces a far larger figure on ENAG than on the official level', () => {
    const level = enagMultiplier(2020, 2024)!;
    const plain = computePersonal(official, 2020, 2024);
    const lifted = computePersonal(official, 2020, 2024, { levelMultiplier: level });
    expect(lifted.personalPct).toBeGreaterThan(plain.personalPct * 2);
  });
});
