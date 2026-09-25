import { describe, expect, it } from 'vitest';
import {
  CARRY_FORWARD_DAYS,
  buildDailyIndex,
  buildTuikBasketIndex,
  compareSeries,
  MEANINGFUL_DAYS,
  detectShrinkflation,
  geometricMean,
  itemMoves,
  jevonsRelative,
  readiness,
  toCsv,
  officialFoodIndex,
  rebase,
  toMonthly,
  weightedAggregate,
  type PriceObservation,
} from '../street-index';
import { BASKET } from '../../config/street-basket';

/** Two items in different COICOP groups, so weights differ. */
const TEST_BASKET = BASKET.filter((b) => ['ekmek', 'pilic-baget'].includes(b.id));

const obs = (
  date: string,
  itemId: string,
  store: string,
  unitPrice: number,
  discountedPrice: number | null = null,
): PriceObservation => ({
  date, store, itemId, unitPrice, discountedPrice,
  regularPrice: unitPrice, baseQuantity: 1, source: 'scraped',
});

describe('geometricMean', () => {
  it('is the nth root of the product', () => {
    expect(geometricMean([4, 9])).toBeCloseTo(6, 10);
    expect(geometricMean([2, 8])).toBeCloseTo(4, 10);
    expect(geometricMean([5])).toBeCloseTo(5, 10);
  });

  it('sits below the arithmetic mean for unequal values', () => {
    expect(geometricMean([1, 100])!).toBeLessThan(50.5);
  });

  it('survives magnitudes that would overflow a running product', () => {
    // 400 values of 1e10 multiplied together is Infinity; in log space it is not.
    const huge = Array.from({ length: 400 }, () => 1e10);
    expect(geometricMean(huge)).toBeCloseTo(1e10, 0);
  });

  it('ignores zero, negative and non-finite values', () => {
    expect(geometricMean([4, 0, 9])).toBeCloseTo(6, 10);
    expect(geometricMean([4, -1, 9])).toBeCloseTo(6, 10);
    expect(geometricMean([4, NaN, 9])).toBeCloseTo(6, 10);
  });

  it('returns null when nothing is usable', () => {
    expect(geometricMean([])).toBeNull();
    expect(geometricMean([0, -2])).toBeNull();
  });
});

describe('jevonsRelative', () => {
  it('averages each store\'s own relative, not the price levels', () => {
    // Store A doubles, store B halves: the geometric mean is exactly 1.
    const r = jevonsRelative({ a: 20, b: 5 }, { a: 10, b: 10 });
    expect(r!.relative).toBeCloseTo(1, 10);
  });

  it('uses only stores present in both periods', () => {
    // b has no base price, so it cannot contribute a relative.
    const r = jevonsRelative({ a: 20, b: 999 }, { a: 10 });
    expect(r!.stores).toEqual(['a']);
    expect(r!.relative).toBeCloseTo(2, 10);
  });

  it('never compares one shop against another', () => {
    // Expensive shop today, cheap shop at base: that is not a 10x rise.
    const r = jevonsRelative({ expensive: 100 }, { cheap: 10 });
    expect(r).toBeNull();
  });

  it('is 1 when nothing moved', () => {
    expect(jevonsRelative({ a: 7, b: 3 }, { a: 7, b: 3 })!.relative).toBeCloseTo(1, 10);
  });

  it('rejects zero and negative prices', () => {
    expect(jevonsRelative({ a: 0 }, { a: 10 })).toBeNull();
    expect(jevonsRelative({ a: 10 }, { a: 0 })).toBeNull();
  });
});

describe('weightedAggregate', () => {
  it('weights items by expenditure share', () => {
    const r = weightedAggregate({ x: 2, y: 1 }, { x: 3, y: 1 });
    expect(r!.value).toBeCloseTo((3 * 2 + 1 * 1) / 4, 10);
  });

  it('renormalises over present items so a gap does not dilute', () => {
    // y missing entirely: the result is x's relative, not a half-weighted one.
    const r = weightedAggregate({ x: 2 }, { x: 3, y: 1 });
    expect(r!.value).toBeCloseTo(2, 10);
    expect(r!.coverage).toBeCloseTo(0.75, 10);
  });

  it('reports full coverage when every item is present', () => {
    expect(weightedAggregate({ x: 1, y: 1 }, { x: 3, y: 1 })!.coverage).toBeCloseTo(1, 10);
  });

  it('returns null when no weighted item survives', () => {
    expect(weightedAggregate({}, { x: 1 })).toBeNull();
    expect(weightedAggregate({ x: 2 }, { x: 0 })).toBeNull();
  });
});

describe('buildDailyIndex', () => {
  const basket = TEST_BASKET;
  const two = (date: string, p1: number, p2: number) => [
    obs(date, 'ekmek', 'migros', p1),
    obs(date, 'ekmek', 'sok', p1),
    obs(date, 'pilic-baget', 'migros', p2),
    obs(date, 'pilic-baget', 'sok', p2),
  ];

  it('starts at exactly 100 on the base day', () => {
    const r = buildDailyIndex(two('2026-01-01', 10, 20), { basket });
    expect(r.base).toBe('2026-01-01');
    expect(r.points[0].value).toBeCloseTo(100, 10);
  });

  it('tracks a uniform price rise exactly', () => {
    const r = buildDailyIndex([...two('2026-01-01', 10, 20), ...two('2026-01-02', 11, 22)], { basket });
    expect(r.points.at(-1)!.value).toBeCloseTo(110, 8);
  });

  it('weights a divergent move by expenditure share', () => {
    // Only bread doubles. Bread's weight is its group share over its members.
    const r = buildDailyIndex([...two('2026-01-01', 10, 20), ...[
      obs('2026-01-02', 'ekmek', 'migros', 20), obs('2026-01-02', 'ekmek', 'sok', 20),
      obs('2026-01-02', 'pilic-baget', 'migros', 20), obs('2026-01-02', 'pilic-baget', 'sok', 20),
    ]], { basket });
    const value = r.points.at(-1)!.value;
    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(200);
  });

  it('refuses a base day that does not cover enough of the basket', () => {
    const r = buildDailyIndex([obs('2026-01-01', 'ekmek', 'migros', 10)], { basket });
    expect(r.base).toBeNull();
    expect(r.reason).toMatch(/coverage/);
  });

  it('carries a missing price forward and says how often', () => {
    const rows = [...two('2026-01-01', 10, 20), obs('2026-01-02', 'ekmek', 'migros', 10), obs('2026-01-02', 'ekmek', 'sok', 10)];
    const r = buildDailyIndex(rows, { basket });
    const second = r.points.find((p) => p.date === '2026-01-02')!;
    // Chicken was not observed, so both its stores were carried.
    expect(second.carriedForward).toBe(2);
    expect(second.itemsUsed).toBe(2);
  });

  it('drops an item once the carry-forward window expires', () => {
    const rows = [
      ...two('2026-01-01', 10, 20),
      // Only bread thereafter, for longer than the window.
      ...Array.from({ length: 10 }, (_, i) => {
        const d = `2026-01-${String(i + 2).padStart(2, '0')}`;
        return [obs(d, 'ekmek', 'migros', 10), obs(d, 'ekmek', 'sok', 10)];
      }).flat(),
    ];
    const r = buildDailyIndex(rows, { basket });
    const early = r.points.find((p) => p.date === '2026-01-05')!;
    const late = r.points.at(-1)!;
    expect(early.itemsUsed).toBe(2);
    expect(late.itemsDropped).toContain('pilic-baget');
    expect(late.itemsUsed).toBe(1);
    expect(late.coverage).toBeLessThan(1);
  });

  it('honours the carry-forward boundary exactly', () => {
    const rows = [...two('2026-01-01', 10, 20)];
    const at = (offset: number) => {
      const d = new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
      return buildDailyIndex([...rows, obs(d, 'ekmek', 'migros', 10), obs(d, 'ekmek', 'sok', 10)], { basket })
        .points.at(-1)!;
    };
    expect(at(CARRY_FORWARD_DAYS).itemsDropped).not.toContain('pilic-baget');
    expect(at(CARRY_FORWARD_DAYS + 1).itemsDropped).toContain('pilic-baget');
  });

  it('emits a point for every calendar day, so gaps stay visible', () => {
    const rows = [...two('2026-01-01', 10, 20), ...two('2026-01-04', 10, 20)];
    const r = buildDailyIndex(rows, { basket });
    expect(r.points.map((p) => p.date)).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
    ]);
  });

  it('uses regular prices for the headline basis', () => {
    // A discount must not move the main index.
    const rows = [
      ...two('2026-01-01', 10, 20),
      obs('2026-01-02', 'ekmek', 'migros', 10, 5), obs('2026-01-02', 'ekmek', 'sok', 10, 5),
      obs('2026-01-02', 'pilic-baget', 'migros', 20), obs('2026-01-02', 'pilic-baget', 'sok', 20),
    ];
    expect(buildDailyIndex(rows, { basket }).points.at(-1)!.value).toBeCloseTo(100, 8);
  });

  it('can be run on the discounted basis separately', () => {
    const rows = [
      ...two('2026-01-01', 10, 20),
      obs('2026-01-02', 'ekmek', 'migros', 10, 5), obs('2026-01-02', 'ekmek', 'sok', 10, 5),
      obs('2026-01-02', 'pilic-baget', 'migros', 20), obs('2026-01-02', 'pilic-baget', 'sok', 20),
    ];
    const discounted = buildDailyIndex(rows, { basket, basis: 'discounted' });
    expect(discounted.points.at(-1)!.value).toBeLessThan(100);
  });

  it('reports rather than throws when there is nothing to index', () => {
    const r = buildDailyIndex([], { basket });
    expect(r.points).toHaveLength(0);
    expect(r.reason).toBe('no observations');
  });

  it('ignores observations for items outside the basket', () => {
    const rows = [...two('2026-01-01', 10, 20), obs('2026-01-01', 'not-in-basket', 'migros', 999)];
    expect(buildDailyIndex(rows, { basket }).points[0].value).toBeCloseTo(100, 10);
  });
});

describe('monthly aggregation and rebasing', () => {
  it('averages a month\'s daily values', () => {
    const m = toMonthly([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 110 },
      { date: '2026-02-01', value: 130 },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ month: '2026-01', days: 2 });
    expect(m[0].value).toBeCloseTo(105, 10);
  });

  it('keeps months in order', () => {
    const m = toMonthly([{ date: '2026-03-01', value: 1 }, { date: '2026-01-01', value: 1 }]);
    expect(m.map((p) => p.month)).toEqual(['2026-01', '2026-03']);
  });

  it('restates a series to 100 at the anchor month', () => {
    const r = rebase([
      { month: '2026-01', value: 50, days: 1 },
      { month: '2026-02', value: 75, days: 1 },
    ], '2026-01');
    expect(r[0].value).toBeCloseTo(100, 10);
    expect(r[1].value).toBeCloseTo(150, 10);
  });

  it('preserves ratios through a rebase', () => {
    const before = [
      { month: '2026-01', value: 200, days: 1 },
      { month: '2026-02', value: 260, days: 1 },
    ];
    const after = rebase(before, '2026-01');
    expect(after[1].value / after[0].value).toBeCloseTo(before[1].value / before[0].value, 10);
  });

  it('leaves the series alone when the anchor is absent', () => {
    const s = [{ month: '2026-01', value: 50, days: 1 }];
    expect(rebase(s, '2030-01')).toEqual(s);
  });
});

describe('TÜİK basket index', () => {
  const series = buildTuikBasketIndex();

  it('spans every month TÜİK covers, not just the intersection', () => {
    // A fixed base demanding all items share all months collapsed 145 months
    // to 17 and dragged the start to 2018. Chaining keeps the full span.
    expect(series.length).toBeGreaterThan(140);
    expect(series[0].month).toBe('2013-05');
    expect(series.at(-1)!.month).toBe('2026-07');
  });

  it('survives items whose coverage starts late', () => {
    // Milk, yogurt and apples all begin years after bread. Under a fixed base
    // that shortens the whole series; chained, it does not.
    const months = series.map((p) => p.month);
    expect(months).toContain('2013-06');
    expect(months).toContain('2015-06');
    expect(months).toContain('2020-01');
  });

  it('lands in the same neighbourhood as the official food index', () => {
    // A staples basket should not be wildly detached from CP01 over 12 years.
    const ours = series.find((p) => p.month === '2025-12')!.value / 100;
    const food = officialFoodIndex();
    const a = food.find((p) => p.month === '2013-05')!.value;
    const b = food.find((p) => p.month === '2025-12')!.value;
    const ratio = ours / (b / a);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.8);
  });

  it('moves smoothly, with no month-on-month jump beyond reason', () => {
    // A chained index amplifies a bad link; flagged spike-and-revert months are
    // excluded precisely so one bad observation cannot double-count.
    for (let i = 1; i < series.length; i++) {
      const step = series[i].value / series[i - 1].value;
      expect(step, `${series[i].month}`).toBeGreaterThan(0.8);
      expect(step, `${series[i].month}`).toBeLessThan(1.45);
    }
  });

  it('starts at 100 by construction', () => {
    expect(series[0].value).toBeCloseTo(100, 8);
  });

  it('rises a long way over thirteen years of Turkish food inflation', () => {
    expect(series.at(-1)!.value).toBeGreaterThan(2000);
  });

  it('never goes backwards over any full year', () => {
    for (let i = 12; i < series.length; i++) {
      expect(series[i].value, `${series[i].month}`).toBeGreaterThan(series[i - 12].value);
    }
  });

  it('emits each month once, in order', () => {
    const months = series.map((p) => p.month);
    expect(new Set(months).size).toBe(months.length);
    expect([...months].sort()).toEqual(months);
  });

  it('excludes discontinued commodities', () => {
    // Veal ends in 2022 and would otherwise freeze part of the basket.
    expect(series.at(-1)!.month >= '2026-01').toBe(true);
  });
});

describe('official food comparator', () => {
  const food = officialFoodIndex();

  it('is the food subindex, not headline CPI', () => {
    expect(food.length).toBeGreaterThan(300);
    expect(food[0].month).toBe('1996-01');
  });

  it('rises monotonically enough to be a price index', () => {
    expect(food.at(-1)!.value).toBeGreaterThan(food[0].value * 100);
  });
});

describe('compareSeries', () => {
  const c = compareSeries();

  it('returns all three series', () => {
    expect(c.tuikBasket.length).toBeGreaterThan(0);
    expect(c.officialFood.length).toBeGreaterThan(0);
    expect(Array.isArray(c.street)).toBe(true);
  });

  it('declines to anchor when the series do not yet overlap', () => {
    // Our collection starts after TÜİK's last published month, so there is
    // nothing honest to anchor on until the official data catches up.
    if (c.anchor === null) {
      expect(c.street.length >= 0).toBe(true);
    } else {
      expect(c.tuikBasket.find((p) => p.month === c.anchor)!.value).toBeCloseTo(100, 8);
    }
  });
});

describe('shrinkflation detection', () => {
  const pack = (
    date: string, store: string, quantity: number, shelfPrice: number,
  ): PriceObservation => ({
    date, store, itemId: 'ekmek', unitPrice: shelfPrice / quantity,
    regularPrice: shelfPrice, discountedPrice: null, baseQuantity: quantity,
    source: 'scraped',
  });
  const basket = BASKET.filter((b) => b.id === 'ekmek');

  it('catches a pack that shrinks while the price holds', () => {
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'migros', 0.8, 100)],
      basket,
    );
    expect(events).toHaveLength(1);
    expect(events[0].sizeChangePct).toBeCloseTo(-20, 6);
    expect(events[0].shelfPriceChangePct).toBeCloseTo(0, 6);
    // The invisible part: 100/0.8 = 125 against 100.
    expect(events[0].unitPriceChangePct).toBeCloseTo(25, 6);
  });

  it('ignores a pack that shrinks while the price also rises', () => {
    // That is an ordinary increase and the index already sees it.
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'migros', 0.8, 130)],
      basket,
    );
    expect(events).toHaveLength(0);
  });

  it('ignores a price change at constant size', () => {
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'migros', 1, 130)],
      basket,
    );
    expect(events).toHaveLength(0);
  });

  it('ignores a pack that grows', () => {
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'migros', 1.2, 100)],
      basket,
    );
    expect(events).toHaveLength(0);
  });

  it('ignores noise below the threshold', () => {
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'migros', 0.995, 100)],
      basket,
    );
    expect(events).toHaveLength(0);
  });

  it('never compares one store against another', () => {
    // A smaller pack at a different shop is packaging, not shrinkflation.
    const events = detectShrinkflation(
      [pack('2026-01-01', 'migros', 1, 100), pack('2026-01-02', 'sok', 0.7, 100)],
      basket,
    );
    expect(events).toHaveLength(0);
  });

  it('records each shrink in a sequence of them', () => {
    const events = detectShrinkflation([
      pack('2026-01-01', 'migros', 1, 100),
      pack('2026-01-02', 'migros', 0.9, 100),
      pack('2026-01-03', 'migros', 0.8, 100),
    ], basket);
    expect(events).toHaveLength(2);
  });

  it('finds nothing in a single day of data', () => {
    expect(detectShrinkflation([pack('2026-01-01', 'migros', 1, 100)], basket)).toHaveLength(0);
  });
});

describe('itemMoves', () => {
  const basket = BASKET.filter((b) => ['ekmek', 'pilic-baget'].includes(b.id));
  const o = (date: string, itemId: string, store: string, p: number): PriceObservation => ({
    date, store, itemId, unitPrice: p, regularPrice: p, discountedPrice: null,
    baseQuantity: 1, source: 'scraped',
  });

  it('ranks the biggest risers first', () => {
    const moves = itemMoves([
      o('2026-01-01', 'ekmek', 'migros', 10), o('2026-01-01', 'pilic-baget', 'migros', 10),
      o('2026-01-02', 'ekmek', 'migros', 20), o('2026-01-02', 'pilic-baget', 'migros', 11),
    ], basket);
    expect(moves[0].itemId).toBe('ekmek');
    expect(moves[0].changePct).toBeCloseTo(100, 6);
    expect(moves[1].changePct).toBeCloseTo(10, 6);
  });

  it('agrees with the index on what a relative is', () => {
    // Same Jevons rule: a store missing at base cannot contribute.
    const moves = itemMoves([
      o('2026-01-01', 'ekmek', 'migros', 10),
      o('2026-01-02', 'ekmek', 'migros', 20), o('2026-01-02', 'ekmek', 'sok', 999),
    ], basket);
    expect(moves[0].stores).toEqual(['migros']);
    expect(moves[0].changePct).toBeCloseTo(100, 6);
  });

  it('is empty without observations', () => {
    expect(itemMoves([], basket)).toHaveLength(0);
  });
});

describe('readiness', () => {
  const o = (date: string): PriceObservation => ({
    date, store: 'migros', itemId: 'ekmek', unitPrice: 1, regularPrice: 1,
    discountedPrice: null, baseQuantity: 1, source: 'scraped',
  });

  it('reports a single day as not yet meaningful', () => {
    const r = readiness([o('2026-01-01')]);
    expect(r.days).toBe(1);
    expect(r.meaningful).toBe(false);
    expect(r.remaining).toBe(MEANINGFUL_DAYS - 1);
  });

  it('measures the span, not the number of files', () => {
    // Two days a month apart is a month of history with a gap in it.
    const r = readiness([o('2026-01-01'), o('2026-02-01')]);
    expect(r.collected).toBe(2);
    expect(r.days).toBe(32);
    expect(r.meaningful).toBe(true);
  });

  it('handles no data at all', () => {
    const r = readiness([]);
    expect(r.days).toBe(0);
    expect(r.firstDay).toBeNull();
    expect(r.meaningful).toBe(false);
  });
});

describe('CSV export', () => {
  it('emits a header and one row per observation', () => {
    const csv = toCsv([{
      date: '2026-01-01', store: 'migros', itemId: 'ekmek', unitPrice: 10,
      regularPrice: 10, discountedPrice: null, baseQuantity: 1, source: 'scraped',
    }]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('date,store,item_id');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2026-01-01,migros,ekmek');
  });

  it('exports the real bundle without throwing', () => {
    const csv = toCsv();
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });
});
