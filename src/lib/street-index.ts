import { BASKET, itemWeight, type BasketItem } from '../config/street-basket';
import categoryData from '../data/categories.json';
import foodPrices from '../data/food-prices.json';
import streetPrices from '../data/street-prices.json';

/** How many days a price may be carried before the item is dropped. */
export const CARRY_FORWARD_DAYS = 7;

/** Share of basket weight a day must cover to serve as the base. */
export const BASE_COVERAGE = 0.9;

export interface PriceObservation {
  date: string;
  store: string;
  itemId: string;
  /** Shelf price divided by pack quantity — the comparable figure. */
  unitPrice: number;
  /** The shelf price itself, needed to tell shrinkflation from a plain rise. */
  regularPrice: number;
  discountedPrice: number | null;
  /** Pack size in the item's base unit (kg, litre or piece). */
  baseQuantity: number;
  packMismatch?: boolean;
  source: string;
}

export const observations = streetPrices.observations as PriceObservation[];
export const collectionDays = streetPrices.days as {
  date: string;
  attempted: number;
  collected: number;
  failed: number;
  divergences: string[];
}[];
export const streetMeta = streetPrices.meta;

type CommodityTable = Record<
  string,
  { unit: string; stale?: boolean; anomalies?: string[]; prices: Record<string, number> }
>;
const commodities = foodPrices.commodities as CommodityTable;

// ---------------------------------------------------------------------------
// Elementary maths
// ---------------------------------------------------------------------------

/**
 * Geometric mean, computed in log space.
 *
 * Multiplying a long run of prices together overflows well before the mean
 * becomes meaningless, so the sum of logarithms is the only safe form.
 */
export function geometricMean(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!usable.length) return null;
  const sum = usable.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sum / usable.length);
}

/**
 * The Jevons elementary index for one item: the geometric mean of each store's
 * own price relative.
 *
 * A store only contributes when it has a price in *both* periods. Comparing
 * store A today against store B at the base would measure the difference
 * between two shops rather than a change over time — the classic way an
 * elementary index goes wrong when coverage is patchy.
 */
export function jevonsRelative(
  current: Record<string, number>,
  base: Record<string, number>,
): { relative: number; stores: string[] } | null {
  const shared = Object.keys(current).filter(
    (s) => base[s] > 0 && current[s] > 0 && Number.isFinite(base[s]) && Number.isFinite(current[s]),
  );
  if (!shared.length) return null;
  const relative = geometricMean(shared.map((s) => current[s] / base[s]));
  return relative == null ? null : { relative, stores: shared.sort() };
}

/**
 * Combines elementary indices into one number using expenditure weights.
 *
 * A weighted arithmetic mean of price relatives — the Laspeyres form, and the
 * same upper-level method the personal basket already uses, so the two features
 * cannot disagree about what "weighted" means. Weights are renormalised over
 * whatever items are present, so a dropped item dilutes nobody.
 */
export function weightedAggregate(
  relatives: Record<string, number>,
  weights: Record<string, number>,
): { value: number; coverage: number } | null {
  let weighted = 0;
  let used = 0;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [id, relative] of Object.entries(relatives)) {
    const w = weights[id] ?? 0;
    if (w <= 0) continue;
    weighted += w * relative;
    used += w;
  }
  if (used <= 0) return null;
  return { value: weighted / used, coverage: total > 0 ? used / total : 0 };
}

// ---------------------------------------------------------------------------
// Temporary promotions
// ---------------------------------------------------------------------------

/** A drop that returns to the old price within this many days is a sale. */
export const SALE_MAX_DAYS = 14;
/** How close to the old price the return must land to count as "the same". */
export const SALE_RETURN_TOLERANCE = 0.01;

/**
 * Replaces temporary promotions with the regular price they interrupted.
 *
 * Migros's product data carries the price on sale today, not the price it was
 * marked down from, so a two-day chicken promotion — 139,95 → 79,90 → 139,95 —
 * arrives looking like a 43% collapse followed by a 75% rise. In a daily index
 * that swings the whole basket by four points and back, and any month that
 * happens to end on a promotion day reports a fall that never happened.
 *
 * The rule is the V-shaped sale filter from Nakamura & Steinsson (2008): a drop
 * is a sale when the price comes back to where it was (within 1%) inside
 * SALE_MAX_DAYS. Requiring the *same* price is what separates a promotion from
 * produce, whose price genuinely moves and rarely lands back on the exact
 * figure it left. A drop with no return yet is treated as real; if the price
 * later returns, those days are reclassified — so the last fortnight of the
 * index can be revised, and the methodology says so.
 *
 * Works per product per store, on the unit price. Rows come back in the same
 * shape with unitPrice replaced where a sale was found, plus a `sale` flag.
 */
export function filterSales<T extends PriceObservation>(rows: T[]): (T & { sale?: boolean })[] {
  const series = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.itemId}|${row.store}`;
    const list = series.get(key);
    if (list) list.push(row);
    else series.set(key, [row]);
  }

  const replaced = new Map<T, number>();
  for (const list of series.values()) {
    const sorted = list.filter((r) => r.unitPrice > 0).sort((a, b) => a.date.localeCompare(b.date));
    let regular = sorted[0]?.unitPrice;
    let i = 1;
    while (i < sorted.length) {
      const price = sorted[i].unitPrice;
      if (price >= regular * (1 - SALE_RETURN_TOLERANCE)) {
        regular = price;
        i++;
        continue;
      }
      // A drop. Look for a return to the old price inside the window.
      let back = -1;
      for (let j = i + 1; j < sorted.length; j++) {
        if (dayDiff(sorted[i].date, sorted[j].date) > SALE_MAX_DAYS) break;
        if (Math.abs(sorted[j].unitPrice / regular - 1) <= SALE_RETURN_TOLERANCE) {
          back = j;
          break;
        }
      }
      if (back < 0) {
        regular = price;
        i++;
        continue;
      }
      for (let k = i; k < back; k++) replaced.set(sorted[k], regular);
      i = back;
    }
  }

  return rows.map((row) =>
    replaced.has(row) ? { ...row, unitPrice: replaced.get(row)!, sale: true } : row,
  );
}

// ---------------------------------------------------------------------------
// Daily index
// ---------------------------------------------------------------------------

export interface IndexPoint {
  date: string;
  /** Index value, base day = 100. */
  value: number;
  /** Items that contributed. */
  itemsUsed: number;
  /** Items with no usable price on this day. */
  itemsDropped: string[];
  /** Store-level prices supplied by carry-forward rather than observed. */
  carriedForward: number;
  /** Share of total basket weight represented, 0–1. */
  coverage: number;
  /** Each contributing item's price relative to the base day. */
  relatives: Record<string, number>;
}

export interface DailyIndex {
  base: string | null;
  points: IndexPoint[];
  /** Why no index could be built, when points is empty. */
  reason?: string;
}

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Every calendar date from first to last, so gaps in collection stay visible. */
function calendarRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

interface BuildOptions {
  /** 'regular' is the headline basis; 'discounted' is kept for comparison only. */
  basis?: 'regular' | 'discounted';
  /**
   * 'filter' (the default) prices promotions at the regular price they
   * interrupted; 'keep' uses the recorded regular price unfiltered. That is not
   * the same as the price on the page: ŞOK reports its promotions separately,
   * so for "what the page showed" use basis 'discounted' instead.
   */
  sales?: 'filter' | 'keep';
  carryForwardDays?: number;
  baseCoverage?: number;
  basket?: BasketItem[];
  /**
   * Items left out of the calculation. Weights are still worked out against
   * the whole basket and then renormalised, so leaving out tomatoes does not
   * hand their weight to lentils just because both are CP0117.
   */
  exclude?: string[];
  /**
   * Forces the base day. Variants of the headline (excluding items, keeping
   * promotions) pass the headline's own base so every line on a chart is 100
   * on the same day — otherwise a smaller item set can clear the coverage bar
   * earlier and anchor somewhere else under the same label.
   */
  base?: string;
}

/**
 * Builds the daily street index from raw observations.
 *
 * Missing prices are carried forward for up to a week — a shop not restocking
 * for a few days is not a price change — after which the item leaves that day's
 * calculation entirely rather than freezing at a stale number.
 */
export function buildDailyIndex(
  rows: PriceObservation[] = observations,
  options: BuildOptions = {},
): DailyIndex {
  const {
    basis = 'regular',
    carryForwardDays = CARRY_FORWARD_DAYS,
    baseCoverage = BASE_COVERAGE,
    basket: fullBasket = BASKET,
    exclude = [],
    sales = 'filter',
    base: forcedBase,
  } = options;

  const basket = fullBasket.filter((b) => !exclude.includes(b.id));
  // The discounted basis exists to show promotions, so filtering them out of
  // it would defeat the comparison.
  const input = sales === 'filter' && basis === 'regular' ? filterSales(rows) : rows;

  const priceOf = (o: PriceObservation): number | null => {
    if (basis === 'regular') return o.unitPrice > 0 ? o.unitPrice : null;
    const discounted = o.discountedPrice;
    if (discounted == null || !(o.baseQuantity > 0)) return o.unitPrice > 0 ? o.unitPrice : null;
    return discounted / o.baseQuantity;
  };

  const tracked = new Set(basket.map((b) => b.id));
  const weights = Object.fromEntries(basket.map((b) => [b.id, itemWeight(b, fullBasket)]));

  // date -> itemId -> store -> price
  const observed = new Map<string, Map<string, Record<string, number>>>();
  for (const row of input) {
    if (!tracked.has(row.itemId)) continue;
    const price = priceOf(row);
    if (price == null) continue;
    const byItem = observed.get(row.date) ?? new Map();
    const byStore = byItem.get(row.itemId) ?? {};
    byStore[row.store] = price;
    byItem.set(row.itemId, byStore);
    observed.set(row.date, byItem);
  }

  const dates = [...observed.keys()].sort();
  if (!dates.length) return { base: null, points: [], reason: 'no observations' };

  /** Coverage of a day, as a share of total basket weight. */
  const coverageOf = (date: string) => {
    const byItem = observed.get(date);
    if (!byItem) return 0;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let have = 0;
    for (const [id, stores] of byItem) {
      if (Object.keys(stores).length) have += weights[id] ?? 0;
    }
    return total > 0 ? have / total : 0;
  };

  const base =
    forcedBase != null
      ? observed.has(forcedBase) ? forcedBase : null
      : dates.find((d) => coverageOf(d) >= baseCoverage) ?? null;
  if (!base) {
    return {
      base: null,
      points: [],
      reason: `no day reaches ${Math.round(baseCoverage * 100)}% basket coverage`,
    };
  }

  const baseByItem = observed.get(base)!;
  const points: IndexPoint[] = [];

  // Last seen price per item/store, for carry-forward.
  const lastSeen = new Map<string, { date: string; price: number }>();

  for (const date of calendarRange(base, dates.at(-1)!)) {
    const todays = observed.get(date);
    if (todays) {
      for (const [id, stores] of todays) {
        for (const [store, price] of Object.entries(stores)) {
          lastSeen.set(`${id}|${store}`, { date, price });
        }
      }
    }

    const relatives: Record<string, number> = {};
    const dropped: string[] = [];
    let carried = 0;

    for (const item of basket) {
      const basePrices = baseByItem.get(item.id);
      if (!basePrices || !Object.keys(basePrices).length) {
        dropped.push(item.id);
        continue;
      }

      const current: Record<string, number> = {};
      for (const store of Object.keys(basePrices)) {
        const seen = lastSeen.get(`${item.id}|${store}`);
        if (!seen) continue;
        const age = dayDiff(seen.date, date);
        if (age < 0 || age > carryForwardDays) continue;
        current[store] = seen.price;
        if (age > 0) carried++;
      }

      const jevons = jevonsRelative(current, basePrices);
      if (!jevons) {
        dropped.push(item.id);
        continue;
      }
      relatives[item.id] = jevons.relative;
    }

    const aggregate = weightedAggregate(relatives, weights);
    if (!aggregate) continue;

    points.push({
      date,
      value: aggregate.value * 100,
      itemsUsed: Object.keys(relatives).length,
      itemsDropped: dropped,
      carriedForward: carried,
      coverage: aggregate.coverage,
      relatives,
    });
  }

  return { base, points };
}

// ---------------------------------------------------------------------------
// Monthly aggregation and comparison
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: string;
  value: number;
  days: number;
}

/** Mean of a month's daily values. Partial months are included and marked. */
export function toMonthly(points: { date: string; value: number }[]): MonthlyPoint[] {
  const buckets = new Map<string, number[]>();
  for (const p of points) {
    const month = p.date.slice(0, 7);
    const list = buckets.get(month);
    if (list) list.push(p.value);
    else buckets.set(month, [p.value]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      value: values.reduce((a, b) => a + b, 0) / values.length,
      days: values.length,
    }));
}

/** Restates a series so the given month reads 100. */
export function rebase(series: MonthlyPoint[], month: string): MonthlyPoint[] {
  const anchor = series.find((p) => p.month === month);
  if (!anchor || anchor.value === 0) return series;
  return series.map((p) => ({ ...p, value: (p.value / anchor.value) * 100 }));
}

/** Days a month needs before its average is trusted as that month's level. */
export const MIN_MONTH_DAYS = 20;

export interface MonthlyRate {
  month: string;
  /** Percent change on the previous month. */
  changePct: number;
  /**
   * 'average': mean of this month against mean of the last, which is how TÜİK
   * reports monthly CPI. 'end-to-end': last day against the previous month's
   * last day, used when either month is too thin for an average to mean much.
   */
  method: 'average' | 'end-to-end';
  from: string;
  to: string;
  /** Days of index in this month. */
  days: number;
  /** Whether collection reached the month's final calendar day. */
  complete: boolean;
}

const lastDayOfMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

/**
 * Month-on-month inflation from the daily index.
 *
 * The first month has nothing before it and gets no rate. A month only has an
 * average-based rate when it and the month before both have at least
 * MIN_MONTH_DAYS of index: averaging two days of September against thirty-one
 * of October would compare a snapshot with a month. Otherwise the rate falls
 * back to end-to-end, and says so.
 *
 * A rate is only ever against the calendar month immediately before. If a
 * collection outage empties a whole month, the month after it gets no rate
 * rather than a two-month change labelled as one — which the UI would then
 * annualise as if it were monthly. A month counts as complete when collection
 * reached its last day or carried on into a later month.
 */
export function monthlyRates(points: { date: string; value: number }[]): MonthlyRate[] {
  const byMonth = new Map<string, { date: string; value: number }[]>();
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = p.date.slice(0, 7);
    const list = byMonth.get(month);
    if (list) list.push(p);
    else byMonth.set(month, [p]);
  }
  const months = [...byMonth.keys()].sort();
  const mean = (xs: { value: number }[]) => xs.reduce((a, p) => a + p.value, 0) / xs.length;

  const out: MonthlyRate[] = [];
  for (let i = 1; i < months.length; i++) {
    if (months[i - 1] !== previousMonth(months[i])) continue;
    const prev = byMonth.get(months[i - 1])!;
    const cur = byMonth.get(months[i])!;
    const average = prev.length >= MIN_MONTH_DAYS && cur.length >= MIN_MONTH_DAYS;
    const before = average ? mean(prev) : prev.at(-1)!.value;
    const after = average ? mean(cur) : cur.at(-1)!.value;
    out.push({
      month: months[i],
      changePct: (after / before - 1) * 100,
      method: average ? 'average' : 'end-to-end',
      from: average ? prev[0].date : prev.at(-1)!.date,
      to: cur.at(-1)!.date,
      days: cur.length,
      complete: cur.at(-1)!.date === lastDayOfMonth(months[i]) || i < months.length - 1,
    });
  }
  return out;
}

/** A monthly rate compounded over twelve months. */
export const annualise = (monthlyPct: number) => ((1 + monthlyPct / 100) ** 12 - 1) * 100;

/**
 * Whether a rate can still move. The sale filter only recognises a promotion
 * once the price comes back, up to SALE_MAX_DAYS later, so a month whose last
 * days might be on promotion is provisional until that window has passed.
 */
export const isSettled = (rate: MonthlyRate, lastDate: string) =>
  rate.complete && dayDiff(rate.to, lastDate) >= SALE_MAX_DAYS;

let headlineCache: DailyIndex | null = null;
/**
 * The headline index over the bundled data, built once. Several panels read
 * it, and the build walks every day of every series, so they share one copy.
 */
export function headlineIndex(): DailyIndex {
  return (headlineCache ??= buildDailyIndex());
}

export interface Contribution {
  itemId: string;
  name: string;
  /** Price relative to the base day. */
  relative: number;
  /** Share of the weight in use on this day, 0–1. */
  weightShare: number;
  /** Index points this item adds to the move away from 100. */
  points: number;
}

/**
 * How much of the index's move each item is responsible for.
 *
 * Because the index is a weighted arithmetic mean of relatives, the move from
 * 100 splits exactly into one term per item: its weight share times its own
 * change. The terms add up to the headline, so "tomatoes drove it" is a sum,
 * not an impression.
 */
export function contributions(
  point: IndexPoint,
  basket: BasketItem[] = BASKET,
): Contribution[] {
  const used = basket.filter((b) => point.relatives[b.id] != null);
  const weights = Object.fromEntries(used.map((b) => [b.id, itemWeight(b, basket)]));
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return used
    .map((b) => {
      const relative = point.relatives[b.id];
      const weightShare = weights[b.id] / total;
      return {
        itemId: b.id,
        name: b.name,
        relative,
        weightShare,
        points: weightShare * (relative - 1) * 100,
      };
    })
    .sort((a, b) => b.points - a.points);
}

/** Items flagged as fresh produce, for the excluding-fresh index. */
export const FRESH_ITEMS = BASKET.filter((b) => b.fresh).map((b) => b.id);

/**
 * The same basket and weights, priced with TÜİK's own commodity series.
 *
 * This is what gives the feature a history: thirteen years of the identical
 * basket, computed the identical way, so the only difference from our collected
 * index is whose prices went in. It is official data and is labelled as such —
 * it is not an independent measurement.
 *
 * The index is **chained** month to month rather than measured against a fixed
 * base. TÜİK's commodity coverage is ragged — milk has 96 months, yogurt 100,
 * apples 101, bread 130 — so demanding that every item span the whole period
 * intersects 145 months down to 17 and drags the base forward to 2018. Chaining
 * compares each month only with the one before it, using whatever items both
 * months share, and multiplies the links together. Composition can change
 * underneath without breaking the series, which is the same reason national
 * statistical offices chain rather than hold a fixed base for ever.
 *
 * Observations flagged as spike-and-revert are excluded from the links they
 * touch. In a chained index a bad month otherwise does double damage: it
 * inflates one link and deflates the next.
 */
export function buildTuikBasketIndex(basket: BasketItem[] = BASKET): MonthlyPoint[] {
  const usable = basket.filter(
    (b) => b.tuikCommodity && commodities[b.tuikCommodity] && !commodities[b.tuikCommodity].stale,
  );
  if (!usable.length) return [];

  const weights = Object.fromEntries(usable.map((b) => [b.id, itemWeight(b, basket)]));

  // Union of every month any usable commodity reports, not the intersection.
  const monthSet = new Set<string>();
  for (const item of usable) {
    for (const m of Object.keys(commodities[item.tuikCommodity!].prices)) monthSet.add(m);
  }
  const months = [...monthSet].sort();
  if (months.length < 2) return [];

  const flagged = (commodity: string, month: string) =>
    (commodities[commodity].anomalies ?? []).includes(month);

  const out: MonthlyPoint[] = [{ month: months[0], value: 100, days: 1 }];
  let level = 100;

  for (let i = 1; i < months.length; i++) {
    const previous = months[i - 1];
    const current = months[i];

    const relatives: Record<string, number> = {};
    for (const item of usable) {
      const commodity = item.tuikCommodity!;
      const prices = commodities[commodity].prices;
      const before = prices[previous];
      const after = prices[current];
      if (!(before > 0) || !(after > 0)) continue;
      if (flagged(commodity, previous) || flagged(commodity, current)) continue;
      // One source, so the Jevons mean over a single element is the relative.
      relatives[item.id] = after / before;
    }

    const link = weightedAggregate(relatives, weights);
    // A month nothing can be compared against carries the level forward
    // unchanged rather than inventing a movement.
    if (link) level *= link.value;
    out.push({ month: current, value: level, days: 1 });
  }

  return out;
}

/**
 * Eurostat's official food subindex (COICOP CP01, "food and non-alcoholic
 * beverages"), monthly.
 *
 * This is the right comparator rather than headline CPI: setting a grocery
 * basket against an all-items index would attribute rent and fuel to the price
 * of bread. Already bundled for the main app, so no extra fetch.
 */
export function officialFoodIndex(): MonthlyPoint[] {
  const series = (categoryData.index as Record<string, Record<string, number>>).CP01 ?? {};
  return Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value, days: 1 }));
}

/**
 * The three series side by side, each restated to 100 at the first month they
 * all share, so the comparison is like for like.
 */
export interface Comparison {
  anchor: string | null;
  street: MonthlyPoint[];
  tuikBasket: MonthlyPoint[];
  officialFood: MonthlyPoint[];
}

export function compareSeries(rows: PriceObservation[] = observations): Comparison {
  const street = toMonthly(buildDailyIndex(rows).points);
  const tuikBasket = buildTuikBasketIndex();
  const officialFood = officialFoodIndex();

  // Anchor on the first month our own collection covers, if the official
  // series reach it; otherwise the comparison has nothing to stand on.
  const anchor =
    street.length && tuikBasket.some((p) => p.month === street[0].month)
      ? street[0].month
      : null;

  return anchor
    ? {
        anchor,
        street: rebase(street, anchor),
        tuikBasket: rebase(tuikBasket, anchor),
        officialFood: rebase(officialFood, anchor),
      }
    : { anchor: null, street, tuikBasket, officialFood };
}

// ---------------------------------------------------------------------------
// Shelf prices
// ---------------------------------------------------------------------------

export interface ShelfPrice {
  date: string;
  /** Price on the label, in lira. */
  shelfPrice: number;
  /** Promotional price, when the store shows one. */
  discountedPrice: number | null;
  unitPrice: number;
  baseQuantity: number;
  source: string;
}

/**
 * The most recent recorded price for every item at every store.
 *
 * A price older than CARRY_FORWARD_DAYS before the latest collection is left
 * out, the same rule the index applies, so the table never shows a number the
 * index has already stopped using.
 */
export function latestShelfPrices(
  rows: PriceObservation[] = observations,
): Record<string, Record<string, ShelfPrice>> {
  const last = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
  const out: Record<string, Record<string, ShelfPrice>> = {};
  for (const r of rows) {
    if (!(r.unitPrice > 0) || dayDiff(r.date, last) > CARRY_FORWARD_DAYS) continue;
    const stores = (out[r.itemId] ??= {});
    const seen = stores[r.store];
    if (seen && seen.date >= r.date) continue;
    stores[r.store] = {
      date: r.date,
      shelfPrice: r.regularPrice,
      discountedPrice: r.discountedPrice,
      unitPrice: r.unitPrice,
      baseQuantity: r.baseQuantity,
      source: r.source,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shrinkflation
// ---------------------------------------------------------------------------

/** Pack must shrink by at least this share to count. */
const SHRINK_THRESHOLD = 0.02;
/** Shelf price must move by less than this to count as "held". */
const PRICE_HELD_THRESHOLD = 0.02;

export interface ShrinkEvent {
  itemId: string;
  name: string;
  store: string;
  from: { date: string; quantity: number; shelfPrice: number; unitPrice: number };
  to: { date: string; quantity: number; shelfPrice: number; unitPrice: number };
  /** Negative: the pack got smaller. */
  sizeChangePct: number;
  shelfPriceChangePct: number;
  /** The part a shopper does not see on the label. */
  unitPriceChangePct: number;
}

/**
 * Finds packs that shrank while the shelf price stayed put.
 *
 * This is the one price movement a shopper cannot see: the number on the label
 * is unchanged, so nothing registers as a rise, but the price per kilo went up.
 * It is detected by watching a single product at a single store over time —
 * comparing two different products, or the same product across two shops, would
 * find nothing but packaging differences.
 *
 * Only a *held* shelf price counts. A pack that shrinks while the price also
 * rises is an ordinary increase and the index already captures it.
 */
export function detectShrinkflation(
  rows: PriceObservation[] = observations,
  basket: BasketItem[] = BASKET,
): ShrinkEvent[] {
  const names = new Map(basket.map((b) => [b.id, b.name]));

  const byProduct = new Map<string, PriceObservation[]>();
  for (const row of rows) {
    if (!(row.baseQuantity > 0) || !(row.regularPrice > 0)) continue;
    const key = `${row.itemId}|${row.store}`;
    const list = byProduct.get(key);
    if (list) list.push(row);
    else byProduct.set(key, [row]);
  }

  const events: ShrinkEvent[] = [];
  for (const [key, series] of byProduct) {
    const [itemId, store] = key.split('|');
    const sorted = series.slice().sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 1; i < sorted.length; i++) {
      const before = sorted[i - 1];
      const after = sorted[i];
      const sizeChange = after.baseQuantity / before.baseQuantity - 1;
      const priceChange = after.regularPrice / before.regularPrice - 1;

      if (sizeChange > -SHRINK_THRESHOLD) continue;
      if (Math.abs(priceChange) >= PRICE_HELD_THRESHOLD) continue;

      const beforeUnit = before.regularPrice / before.baseQuantity;
      const afterUnit = after.regularPrice / after.baseQuantity;

      events.push({
        itemId,
        name: names.get(itemId) ?? itemId,
        store,
        from: { date: before.date, quantity: before.baseQuantity, shelfPrice: before.regularPrice, unitPrice: beforeUnit },
        to: { date: after.date, quantity: after.baseQuantity, shelfPrice: after.regularPrice, unitPrice: afterUnit },
        sizeChangePct: sizeChange * 100,
        shelfPriceChangePct: priceChange * 100,
        unitPriceChangePct: (afterUnit / beforeUnit - 1) * 100,
      });
    }
  }

  return events.sort((a, b) => b.to.date.localeCompare(a.to.date));
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/** Days of collection before the index says anything worth reading. */
export const MEANINGFUL_DAYS = 28;

export interface Readiness {
  days: number;
  /** Distinct calendar days actually collected, not the span. */
  collected: number;
  meaningful: boolean;
  remaining: number;
  firstDay: string | null;
  lastDay: string | null;
}

/**
 * How much collected history exists.
 *
 * A freshly started index is a single point at 100, which is true but says
 * nothing. The UI needs to distinguish "no movement measured" from "no movement
 * happened" rather than drawing a flat line and letting it be read as the
 * latter.
 */
export function readiness(rows: PriceObservation[] = observations): Readiness {
  const days = [...new Set(rows.map((r) => r.date))].sort();
  const span =
    days.length > 1 ? dayDiff(days[0], days.at(-1)!) + 1 : days.length;
  return {
    days: span,
    collected: days.length,
    meaningful: span >= MEANINGFUL_DAYS,
    remaining: Math.max(0, MEANINGFUL_DAYS - span),
    firstDay: days[0] ?? null,
    lastDay: days.at(-1) ?? null,
  };
}

/** Raw observations as CSV, for the download link. */
export function toCsv(rows: PriceObservation[] = observations): string {
  const header = [
    'date', 'store', 'item_id', 'unit_price', 'regular_price',
    'discounted_price', 'base_quantity', 'source',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.date, r.store, r.itemId, r.unitPrice, r.regularPrice,
      r.discountedPrice ?? '', r.baseQuantity, r.source,
    ].join(','));
  }
  return lines.join('\n') + '\n';
}
