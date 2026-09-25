import { describe, expect, it } from 'vitest';
import { basketItems, compareBasket, priceAt } from '../basket';
import { adjust } from '../inflation';

describe('basket pricing', () => {
  it('returns compiled figures untouched on benchmark years', () => {
    for (const item of basketItems) {
      for (const [year, price] of Object.entries(item.prices)) {
        const got = priceAt(item, Number(year));
        expect(got).not.toBeNull();
        expect(got!.price).toBeCloseTo(price, 10);
        expect(got!.estimated).toBe(false);
      }
    }
  });

  it('interpolates between benchmarks without overshooting either end', () => {
    const bread = basketItems.find((i) => i.id === 'bread')!;
    const lo = bread.prices['2015'];
    const hi = bread.prices['2020'];
    for (const year of [2016, 2017, 2018, 2019]) {
      const { price, estimated } = priceAt(bread, year)!;
      expect(estimated).toBe(true);
      expect(price).toBeGreaterThanOrEqual(Math.min(lo, hi));
      expect(price).toBeLessThanOrEqual(Math.max(lo, hi));
    }
  });

  it('rises monotonically through an interpolated stretch', () => {
    const bread = basketItems.find((i) => i.id === 'bread')!;
    let previous = 0;
    for (let y = 2010; y <= 2025; y++) {
      const { price } = priceAt(bread, y)!;
      expect(price).toBeGreaterThan(previous);
      previous = price;
    }
  });

  it('extrapolates by CPI beyond the benchmark range', () => {
    const bigmac = basketItems.find((i) => i.id === 'bigmac')!;
    const before = priceAt(bigmac, 1990);
    expect(before).not.toBeNull();
    expect(before!.estimated).toBe(true);
    expect(before!.price).toBeLessThan(bigmac.prices['2000']);
  });
});

describe('compareBasket', () => {
  const rows = compareBasket(1000, 2010, 2025);

  it('prices every item that has data at both ends', () => {
    expect(rows.length).toBe(basketItems.length);
  });

  it('counts units consistently with the adjusted amount', () => {
    const adjusted = adjust(1000, 2010, 2025);
    for (const r of rows) {
      expect(r.unitsThen).toBeCloseTo(1000 / r.priceThen, 6);
      expect(r.unitsNow).toBeCloseTo(adjusted / r.priceNow, 6);
    }
  });

  it('defines ratio < 1 as the good outrunning official inflation', () => {
    for (const r of rows) {
      const beatInflation = r.priceNow / r.priceThen > adjust(1, 2010, 2025);
      expect(r.ratio < 1).toBe(beatInflation);
    }
  });

  it('sorts prices worst-hit first and parks income lines at the end', () => {
    const prices = rows.filter((r) => !r.isIncome);
    const incomes = rows.filter((r) => r.isIncome);

    expect(rows.slice(0, prices.length).every((r) => !r.isIncome)).toBe(true);
    expect(incomes.length).toBeGreaterThan(0);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i].ratio).toBeGreaterThanOrEqual(prices[i - 1].ratio);
    }
  });

  it('reads an income line as real growth rather than as lost units', () => {
    const wage = rows.find((r) => r.isIncome)!;
    // The net minimum wage rose far faster than CPI over 2010-2025, so its
    // real change must be positive even though the amount buys fewer months.
    expect(wage.realChange).toBeGreaterThan(0);
    expect(wage.unitsNow).toBeLessThan(wage.unitsThen);
  });

  it('defines realChange as growth net of CPI for every line', () => {
    const cpiMult = adjust(1, 2010, 2025);
    for (const r of rows) {
      expect(r.realChange).toBeCloseTo((r.priceNow / r.priceThen / cpiMult - 1) * 100, 6);
    }
  });

  it('is a no-op ratio when both years are identical', () => {
    for (const r of compareBasket(1000, 2020, 2020)) {
      expect(r.ratio).toBeCloseTo(1, 10);
    }
  });
});
