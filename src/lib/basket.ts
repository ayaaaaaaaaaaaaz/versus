import basketData from '../data/basket.json';
import { cpi } from './series';
import { adjust } from './inflation';

export interface BasketItem {
  id: string;
  emoji: string;
  name: string;
  nameEn: string;
  unit: string;
  prices: Record<string, number>;
  note: string;
  isIncome?: boolean;
}

export const basketMeta = basketData.meta;
export const basketItems = basketData.items as BasketItem[];

const benchmarksFor = (item: BasketItem) =>
  Object.keys(item.prices)
    .map(Number)
    .sort((a, b) => a - b);

/**
 * Price of `item` in `year`.
 *
 * Exact benchmark years return the compiled figure. Between two benchmarks the
 * price follows the shape of the CPI path while still landing on both compiled
 * endpoints, so an interpolated year never contradicts the curated data. Beyond
 * the ends of the benchmark range the nearest price is simply carried and
 * reflated by CPI.
 */
export function priceAt(item: BasketItem, year: number): { price: number; estimated: boolean } | null {
  const marks = benchmarksFor(item);
  if (!marks.length) return null;

  const exact = item.prices[String(year)];
  if (typeof exact === 'number') return { price: exact, estimated: false };

  const first = marks[0];
  const last = marks[marks.length - 1];

  if (year < first) {
    const p = item.prices[String(first)];
    const c0 = cpi(first);
    const c1 = cpi(year);
    if (c0 == null || c1 == null) return null;
    return { price: p * (c1 / c0), estimated: true };
  }

  if (year > last) {
    const p = item.prices[String(last)];
    const c0 = cpi(last);
    const c1 = cpi(year);
    if (c0 == null || c1 == null) return null;
    return { price: p * (c1 / c0), estimated: true };
  }

  let lo = first;
  let hi = last;
  for (const m of marks) {
    if (m <= year) lo = m;
    if (m >= year) {
      hi = m;
      break;
    }
  }

  const pLo = item.prices[String(lo)];
  const pHi = item.prices[String(hi)];
  const cLo = cpi(lo);
  const cHi = cpi(hi);
  const cY = cpi(year);
  if (cLo == null || cHi == null || cY == null) return null;

  const denom = Math.log(cHi / cLo);
  const frac = denom === 0 ? (year - lo) / (hi - lo) : Math.log(cY / cLo) / denom;
  return { price: pLo * Math.pow(pHi / pLo, frac), estimated: true };
}

export interface BasketComparison {
  item: BasketItem;
  priceThen: number;
  priceNow: number;
  unitsThen: number;
  unitsNow: number;
  /** >1 means the good got cheaper relative to CPI; <1 means it outran CPI. */
  ratio: number;
  /** Annualised price growth of this good, percent. */
  itemAnnualPct: number;
  /**
   * Growth of this line relative to CPI, percent. For a price, a positive
   * number means it outran official inflation. For an income line it means the
   * opposite in human terms: the wage gained real purchasing power.
   */
  realChange: number;
  /** Income lines are read inverted; they are not things the amount buys. */
  isIncome: boolean;
  estimated: boolean;
}

export function compareBasket(
  amount: number,
  from: number,
  to: number,
  /** Overrides the official price relative, so the basket follows the selected source. */
  cpiOverride?: number,
): BasketComparison[] {
  const cpiMultiplier = cpiOverride ?? adjust(1, from, to);
  const adjusted = amount * cpiMultiplier;
  const out: BasketComparison[] = [];

  for (const item of basketItems) {
    const then = priceAt(item, from);
    const now = priceAt(item, to);
    if (!then || !now || then.price <= 0 || now.price <= 0) continue;

    const unitsThen = amount / then.price;
    const unitsNow = adjusted / now.price;
    const span = Math.max(1, to - from);

    out.push({
      item,
      priceThen: then.price,
      priceNow: now.price,
      unitsThen,
      unitsNow,
      ratio: unitsThen === 0 ? 1 : unitsNow / unitsThen,
      itemAnnualPct: (Math.pow(now.price / then.price, 1 / span) - 1) * 100,
      realChange: (now.price / then.price / cpiMultiplier - 1) * 100,
      isIncome: item.isIncome === true,
      estimated: then.estimated || now.estimated,
    });
  }

  // Prices first, worst-hit at the top; income lines are a different kind of
  // statement, so they are parked at the end rather than ranked among them.
  return out.sort((a, b) => {
    if (a.isIncome !== b.isIncome) return a.isIncome ? 1 : -1;
    return a.ratio - b.ratio;
  });
}
