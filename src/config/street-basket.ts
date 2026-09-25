/**
 * The street-price basket.
 *
 * Each entry ties together three things:
 *
 *   tuikCommodity  the matching series in food-prices.json, so our collected
 *                  price can be set against what TÜİK says the same thing costs
 *   coicop         the COICOP sub-group it belongs to, which carries a real
 *                  published weight rather than a guess
 *   stores         one specific product per store — same brand, same pack size,
 *                  every day, so we are tracking a thing and not a search result
 *
 * Product URLs were taken from each store's own sitemap. Search paths are
 * disallowed by robots.txt at all three chains, which is also why the basket is
 * pinned to fixed products: there is no crawling to discover them.
 */

export type BaseUnit = 'kg' | 'l' | 'unit';
export type PackUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit';

/**
 * COICOP sub-group weights, percent of the whole consumer basket.
 * Source: Eurostat prc_hicp_inw for Türkiye, 2025 — the same official weights
 * the headline index uses. They sum to 24.96%, which is CP01's share.
 */
import basketData from '../data/street-basket.json';

/**
 * The item list and the weights live in JSON so the nightly collector — plain
 * Node, no TypeScript loader — can read exactly the same file the app does.
 * This module supplies the types and the arithmetic over it.
 */
export const basketMeta = basketData.meta;

export const COICOP_WEIGHTS: Record<string, { label: string; weight: number }> =
  basketData.coicopWeights;

export interface StoreProduct {
  /** Full product URL, pinned. */
  url: string;
  /** Declared pack size, used when the page's own quantity cannot be read. */
  pack: { size: number; unit: PackUnit };
}

export interface BasketItem {
  id: string;
  /** Turkish label shown in the UI. */
  name: string;
  /** Commodity key in food-prices.json, or null where TÜİK tracks no equivalent. */
  tuikCommodity: string | null;
  coicop: string;
  /** What the normalised price is expressed in. */
  unit: BaseUnit;
  /** Why an item has no TÜİK counterpart, when tuikCommodity is null. */
  note?: string;
  stores: { migros?: StoreProduct; sok?: StoreProduct };
}

export const BASKET = basketData.items as BasketItem[];

/**
 * Weight of one item, percent of the whole consumer basket.
 *
 * The sub-group total is official; the split *within* a sub-group is equal
 * across however many items we track there, because no published weight exists
 * at individual-product level. That split is the one arbitrary step and the
 * methodology page says so.
 */
export function itemWeight(item: BasketItem, basket: BasketItem[] = BASKET): number {
  const group = COICOP_WEIGHTS[item.coicop];
  const siblings = basket.filter((b) => b.coicop === item.coicop).length;
  return siblings === 0 ? 0 : group.weight / siblings;
}

/** Converts a pack measurement to the item's base unit (kg, litre or piece). */
export function packToBase(size: number, unit: PackUnit): number {
  switch (unit) {
    case 'g': return size / 1000;
    case 'ml': return size / 1000;
    case 'kg':
    case 'l':
    case 'unit': return size;
  }
}
