import {
  categories,
  categoryMultiplier,
  officialWeights,
  type Category,
} from './monthly';

export interface CategoryOutcome {
  category: Category;
  /** Share of this user's spending, 0–1. */
  weight: number;
  /** Official HICP share for the same category, 0–1. */
  officialWeight: number;
  /** Price relative for this category across the span. */
  multiplier: number;
  /** Annualised price growth for this category, percent. */
  annualPct: number;
  /** How much of the personal index's total rise this category accounts for, percent. */
  contribution: number;
}

export interface PersonalResult {
  /** Weighted price relative using the user's own allocation. */
  multiplier: number;
  /** Weighted price relative using the official HICP weights. */
  officialMultiplier: number;
  personalPct: number;
  officialPct: number;
  personalAnnualPct: number;
  officialAnnualPct: number;
  /** personal minus official, in percentage points of total inflation. */
  gapPoints: number;
  /** Ratio of the two multipliers: >1 means this basket beat the official one. */
  gapRatio: number;
  breakdown: CategoryOutcome[];
  /** Categories with no data across the requested span, if any. */
  missing: string[];
  /**
   * The pure weight effect: how much the user's mix tilts inflation relative to
   * the official basket, independent of the overall price level. 1.05 means
   * their spending ran 5% hotter than the average basket.
   */
  tilt: number;
}

/**
 * A weighted arithmetic mean of price relatives — the Laspeyres form the
 * statistical agencies use. Running the user's allocation and the official
 * allocation through the identical calculation is what makes the two numbers
 * comparable: any gap comes from the weights, never from the method.
 */
function weightedRelative(
  weights: Record<string, number>,
  fromYear: number,
  toYear: number,
): { value: number; relatives: Record<string, number>; missing: string[] } {
  let total = 0;
  let weightUsed = 0;
  const relatives: Record<string, number> = {};
  const missing: string[] = [];

  for (const category of categories) {
    const relative = categoryMultiplier(category.code, fromYear, toYear);
    if (relative == null) {
      missing.push(category.code);
      continue;
    }
    relatives[category.code] = relative;
    const w = weights[category.code] ?? 0;
    total += w * relative;
    weightUsed += w;
  }

  // Renormalise if some categories dropped out, so a data gap cannot silently
  // deflate the result toward zero.
  return { value: weightUsed > 0 ? total / weightUsed : 1, relatives, missing };
}

export interface PersonalOptions {
  /**
   * Replaces the official price level with another measure of it — ENAGrup's,
   * for instance. The user's category mix still comes from the official
   * sub-indices, because no independent source publishes a COICOP breakdown.
   * What carries over is the *tilt*: their mix is applied on top of the
   * alternative level. Stated plainly, this answers "if that measure of overall
   * inflation is the right one, what did my basket do?" — a conditional, and
   * the UI labels it as one.
   */
  levelMultiplier?: number;
}

export function computePersonal(
  rawWeights: Record<string, number>,
  fromYear: number,
  toYear: number,
  options: PersonalOptions = {},
): PersonalResult {
  const sum = Object.values(rawWeights).reduce((a, b) => a + b, 0);
  const normalised: Record<string, number> = sum > 0
    ? Object.fromEntries(Object.entries(rawWeights).map(([k, v]) => [k, v / sum]))
    : officialWeights();

  const official = officialWeights();
  const personal = weightedRelative(normalised, fromYear, toYear);
  const baseline = weightedRelative(official, fromYear, toYear);

  const span = Math.max(1, toYear - fromYear);
  const annualise = (m: number) => (Math.pow(m, 1 / span) - 1) * 100;

  const tilt = baseline.value === 0 ? 1 : personal.value / baseline.value;

  // With an alternative level supplied, the baseline becomes that level and the
  // personal figure is that level tilted by the user's mix.
  const level = options.levelMultiplier;
  const personalValue = level != null ? level * tilt : personal.value;
  const baselineValue = level != null ? level : baseline.value;

  const totalRise = personal.value - 1;
  const breakdown: CategoryOutcome[] = categories
    .map((category) => {
      const multiplier = personal.relatives[category.code];
      const weight = normalised[category.code] ?? 0;
      if (multiplier == null) return null;
      return {
        category,
        weight,
        officialWeight: official[category.code] ?? 0,
        multiplier,
        annualPct: annualise(multiplier),
        contribution: totalRise === 0 ? 0 : ((weight * (multiplier - 1)) / totalRise) * 100,
      };
    })
    .filter((x): x is CategoryOutcome => x !== null)
    .sort((a, b) => b.contribution - a.contribution);

  return {
    multiplier: personalValue,
    officialMultiplier: baselineValue,
    personalPct: (personalValue - 1) * 100,
    officialPct: (baselineValue - 1) * 100,
    personalAnnualPct: annualise(personalValue),
    officialAnnualPct: annualise(baselineValue),
    gapPoints: (personalValue - baselineValue) * 100,
    gapRatio: tilt,
    breakdown,
    missing: personal.missing,
    tilt,
  };
}

/** Spending profiles that show how much the weights alone move the answer. */
export interface Preset {
  id: string;
  label: string;
  hint: string;
  weights: Record<string, number>;
}

const w = (pairs: [string, number][]): Record<string, number> => Object.fromEntries(pairs);

export const PRESETS: Preset[] = [
  {
    id: 'official',
    label: 'Resmî sepet',
    hint: 'TÜİK/Eurostat ağırlıkları',
    weights: Object.fromEntries(categories.map((c) => [c.code, c.weight])),
  },
  {
    id: 'renter',
    label: 'Kirada, şehirli',
    hint: 'Kira ve ulaşım ağırlıklı',
    weights: w([
      ['CP01', 26], ['CP02', 2], ['CP03', 4], ['CP04', 30], ['CP05', 3], ['CP06', 3],
      ['CP07', 14], ['CP08', 4], ['CP09', 3], ['CP10', 1], ['CP11', 7], ['CP12', 3],
    ]),
  },
  {
    id: 'student',
    label: 'Öğrenci',
    hint: 'Ulaşım, yeme-içme, iletişim',
    weights: w([
      ['CP01', 22], ['CP02', 2], ['CP03', 6], ['CP04', 22], ['CP05', 2], ['CP06', 2],
      ['CP07', 14], ['CP08', 7], ['CP09', 7], ['CP10', 5], ['CP11', 9], ['CP12', 2],
    ]),
  },
  {
    id: 'family',
    label: 'Çocuklu aile',
    hint: 'Gıda, eğitim, sağlık',
    weights: w([
      ['CP01', 30], ['CP02', 2], ['CP03', 8], ['CP04', 16], ['CP05', 7], ['CP06', 6],
      ['CP07', 12], ['CP08', 3], ['CP09', 3], ['CP10', 6], ['CP11', 4], ['CP12', 3],
    ]),
  },
];
