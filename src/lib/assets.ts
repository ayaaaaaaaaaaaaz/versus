import assetData from '../data/assets.json';
import { multiplier } from './inflation';
import { eurRate, usdRate } from './series';

type MonthMap = Record<string, number>;

interface Coverage { from: string; to: string; points: number }

export const assetMeta = assetData.meta as {
  source: string;
  basis: string;
  derived: string;
  caveat: string;
  generatedAt: string;
  coverage: Record<string, Coverage>;
};

const monthly = assetData.monthly as Record<string, MonthMap>;

/** Annual mean of a month-keyed series, to match the CPI's annual-average basis. */
function annualMean(series: MonthMap, year: number): number | null {
  let sum = 0;
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const v = series[`${year}-${String(m).padStart(2, '0')}`];
    if (v != null) { sum += v; n++; }
  }
  return n ? sum / n : null;
}

export interface AssetDef {
  id: string;
  label: string;
  unit: string;
  emoji: string;
  /** Price of one unit in lira for the given year, or null if uncovered. */
  price: (year: number) => number | null;
  note: string;
}

export const ASSETS: AssetDef[] = [
  {
    id: 'cash',
    label: 'Yastık altı',
    unit: 'nakit TL',
    emoji: '🛏️',
    // Cash never changes nominal value; one lira always costs one lira.
    price: () => 1,
    note: 'Hiç yatırılmadan saklanan nakit. Nominal değeri sabit kalır.',
  },
  {
    id: 'usd',
    label: 'Dolar',
    unit: '1 USD',
    emoji: '💵',
    price: (year) => annualMean(monthly.usdTry, year) ?? usdRate(year),
    note: 'Dolar alıp yastık altında tutmak. Faiz veya getiri yok.',
  },
  {
    id: 'eur',
    label: 'Euro',
    unit: '1 EUR',
    emoji: '💶',
    price: (year) => annualMean(monthly.eurTry, year) ?? eurRate(year),
    note: 'Euro alıp tutmak. Faiz veya getiri yok.',
  },
  {
    id: 'gold',
    label: 'Gram altın',
    unit: '1 gram',
    emoji: '🥇',
    price: (year) => annualMean(monthly.goldTryGram, year),
    note: 'Ons altının gram karşılığı, o yılın ortalama kuruyla TL’ye çevrilmiş.',
  },
  {
    id: 'bist',
    label: 'BİST 100',
    unit: 'endeks',
    emoji: '📈',
    price: (year) => annualMean(monthly.bist100, year),
    note: 'Endeksin kendisi: temettü, komisyon ve vergi hariç.',
  },
];

export interface AssetOutcome {
  asset: AssetDef;
  /** Units bought with the starting amount. */
  units: number;
  /** Nominal lira value at the end year. */
  nominal: number;
  /** Nominal value deflated by CPI into starting-year lira. */
  real: number;
  /** Real value as a multiple of the original amount: >1 beat inflation. */
  realRatio: number;
  /** Nominal growth, percent. */
  nominalPct: number;
  /** Real growth, percent. */
  realPct: number;
  /** Annualised real growth, percent. */
  realAnnualPct: number;
}

export function compareAssets(
  amount: number,
  fromYear: number,
  toYear: number,
  /** Overrides the official price relative, so real returns follow the selected source. */
  cpiOverride?: number,
): AssetOutcome[] {
  const cpi = cpiOverride ?? multiplier(fromYear, toYear);
  const span = Math.max(1, toYear - fromYear);
  const out: AssetOutcome[] = [];

  for (const asset of ASSETS) {
    const start = asset.price(fromYear);
    const end = asset.price(toYear);
    if (start == null || end == null || start <= 0) continue;

    const units = amount / start;
    const nominal = units * end;
    const real = nominal / cpi;
    const realRatio = amount === 0 ? 1 : real / amount;

    out.push({
      asset,
      units,
      nominal,
      real,
      realRatio,
      nominalPct: (nominal / amount - 1) * 100,
      realPct: (realRatio - 1) * 100,
      realAnnualPct: (Math.pow(Math.max(realRatio, 1e-12), 1 / span) - 1) * 100,
    });
  }

  return out.sort((a, b) => b.realRatio - a.realRatio);
}

/** Earliest year every asset has data for, so the UI can bound its own range. */
export function assetsMinYear(): number {
  let min = 0;
  for (const c of Object.values(assetMeta.coverage)) {
    min = Math.max(min, Number(c.from.slice(0, 4)) + 1);
  }
  return min;
}

export function assetsMaxYear(): number {
  let max = Infinity;
  for (const c of Object.values(assetMeta.coverage)) {
    max = Math.min(max, Number(c.to.slice(0, 4)));
  }
  return max;
}
