import { describe, expect, it } from 'vitest';
import {
  BASKET,
  COICOP_WEIGHTS,
  itemWeight,
  packToBase,
  type BasketItem,
} from '../../config/street-basket';
import foodPrices from '../../data/food-prices.json';

const commodities = foodPrices.commodities as Record<string, { unit: string; prices: Record<string, number> }>;

describe('basket configuration', () => {
  it('holds a basket of the intended size', () => {
    expect(BASKET.length).toBeGreaterThanOrEqual(25);
    expect(BASKET.length).toBeLessThanOrEqual(30);
  });

  it('gives every item a unique id', () => {
    const ids = BASKET.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every item to a commodity TÜİK actually publishes', () => {
    const missing = BASKET.filter(
      (b) => b.tuikCommodity !== null && !commodities[b.tuikCommodity],
    ).map((b) => `${b.id} -> ${b.tuikCommodity}`);
    expect(missing, `unmatched: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('assigns every item to a weighted COICOP group', () => {
    for (const item of BASKET) {
      expect(COICOP_WEIGHTS[item.coicop], `${item.id}`).toBeDefined();
      expect(COICOP_WEIGHTS[item.coicop].weight).toBeGreaterThan(0);
    }
  });

  it('pins at least one concrete product per item', () => {
    for (const item of BASKET) {
      const stores = Object.values(item.stores).filter(Boolean);
      expect(stores.length, `${item.id} has no store product`).toBeGreaterThan(0);
      for (const s of stores) {
        expect(s!.url).toMatch(/^https:\/\/www\.(migros|sokmarket)\.com\.tr\//);
        expect(s!.pack.size).toBeGreaterThan(0);
      }
    }
  });

  it('never points a product URL at a disallowed search path', () => {
    // robots.txt disallows /arama at all three chains; the basket must not rely on it.
    for (const item of BASKET) {
      for (const s of Object.values(item.stores)) {
        expect(s!.url).not.toMatch(/\/arama/);
      }
    }
  });

  it('never maps onto a commodity TÜİK has stopped publishing', () => {
    // Veal ends in 2022-04 and looks like perfectly good data until you compare
    // a 2026 shelf price against it and get a 7x ratio that means nothing.
    const stale = BASKET.filter((b) => {
      if (!b.tuikCommodity) return false;
      return (commodities[b.tuikCommodity] as unknown as { stale?: boolean }).stale === true;
    }).map((b) => `${b.id} -> ${b.tuikCommodity}`);
    expect(stale, `mapped to discontinued series: ${stale.join(', ')}`).toHaveLength(0);
  });

  it('explains every item that deliberately has no TÜİK counterpart', () => {
    for (const item of BASKET.filter((b) => b.tuikCommodity === null)) {
      expect(item.note, `${item.id} has no counterpart and no explanation`).toBeTruthy();
    }
  });

  it('declares a unit consistent with what TÜİK prices that commodity in', () => {
    const expected: Record<string, string> = { KG: 'kg', L: 'l', Unit: 'unit' };
    for (const item of BASKET) {
      if (!item.tuikCommodity) continue;
      const tuikUnit = commodities[item.tuikCommodity].unit;
      expect(item.unit, `${item.id}: ours=${item.unit} tüik=${tuikUnit}`).toBe(expected[tuikUnit]);
    }
  });
});

describe('weights', () => {
  it('splits each group total across only its own members', () => {
    const groups = new Set(BASKET.map((b) => b.coicop));
    for (const g of groups) {
      const members = BASKET.filter((b) => b.coicop === g);
      const total = members.reduce((s, m) => s + itemWeight(m), 0);
      expect(total).toBeCloseTo(COICOP_WEIGHTS[g].weight, 8);
    }
  });

  it('totals the covered share of the whole consumer basket', () => {
    const total = BASKET.reduce((s, b) => s + itemWeight(b), 0);
    const covered = [...new Set(BASKET.map((b) => b.coicop))]
      .reduce((s, g) => s + COICOP_WEIGHTS[g].weight, 0);
    expect(total).toBeCloseTo(covered, 8);
    // Food overall is ~25% of CPI; we cover most but not all of it.
    expect(total).toBeGreaterThan(15);
    expect(total).toBeLessThan(25);
  });

  it('gives no item a zero or negative weight', () => {
    for (const item of BASKET) expect(itemWeight(item)).toBeGreaterThan(0);
  });

  it('is unaffected by items in other groups', () => {
    const meat = BASKET.find((b) => b.coicop === 'CP0112')!;
    const before = itemWeight(meat);
    const trimmed = BASKET.filter((b) => b.coicop === 'CP0112' || b.coicop === 'CP0111');
    expect(itemWeight(meat, trimmed)).toBeCloseTo(before, 10);
  });
});

describe('packToBase', () => {
  it('converts mass and volume to the base unit', () => {
    expect(packToBase(500, 'g')).toBeCloseTo(0.5);
    expect(packToBase(1000, 'g')).toBeCloseTo(1);
    expect(packToBase(750, 'ml')).toBeCloseTo(0.75);
    expect(packToBase(2, 'kg')).toBe(2);
    expect(packToBase(1, 'l')).toBe(1);
  });

  it('leaves piece counts alone', () => {
    expect(packToBase(6, 'unit')).toBe(6);
  });

  it('lets a declared pack produce a sane unit price', () => {
    // A 500 g pack at 60 TL is 120 TL/kg, not 0.12.
    const perKg = 60 / packToBase(500, 'g');
    expect(perKg).toBeCloseTo(120);
  });
});

describe('TÜİK price data', () => {
  it('covers thirteen years of months', () => {
    expect(foodPrices.meta.monthsCovered).toBeGreaterThan(140);
    expect(foodPrices.meta.minMonth).toBe('2013-05');
  });

  it('flags the May-2022 market-label join rather than smoothing it', () => {
    const flagged = Object.values(commodities).filter((c) =>
      (c as unknown as { anomalies: string[] }).anomalies.includes('2022-05'),
    );
    // Many commodities jump and revert at that join; it must be visible, not hidden.
    expect(flagged.length).toBeGreaterThan(10);
    expect(foodPrices.meta.joinMonth).toBe('2022-05');
  });

  it('keeps flagged observations in the data', () => {
    // Flagging marks a point as suspect; it does not delete it.
    const rice = commodities['Rice'] as unknown as { anomalies: string[]; prices: Record<string, number> };
    expect(rice.anomalies).toContain('2022-05');
    expect(rice.prices['2022-05']).toBeGreaterThan(0);
  });

  it('never mixes units within one commodity', () => {
    expect(foodPrices.meta.unitConflicts).toHaveLength(0);
    for (const [name, c] of Object.entries(commodities)) {
      expect(['KG', 'L', 'Unit'], `${name}`).toContain(c.unit);
    }
  });

  it('rises over the full period for every basket staple', () => {
    for (const item of BASKET as BasketItem[]) {
      if (!item.tuikCommodity) continue;
      const c = commodities[item.tuikCommodity];
      const months = Object.keys(c.prices).sort();
      expect(c.prices[months.at(-1)!], `${item.id}`).toBeGreaterThan(c.prices[months[0]]);
    }
  });
});
