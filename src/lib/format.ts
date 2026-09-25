const tr = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('tr-TR', opts);

const plain = tr({ maximumFractionDigits: 0 });
const twoDp = tr({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Turkish inflation spans ten orders of magnitude, so the number of useful
 * decimals depends entirely on the size of the value.
 */
export function formatTRY(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 1_000_000_000) return compact(value);
  if (abs >= 1000) return plain.format(value);
  if (abs >= 1) return twoDp.format(value);
  if (abs >= 0.01) return tr({ maximumFractionDigits: 4 }).format(value);
  if (abs >= 0.000001) return tr({ maximumFractionDigits: 8 }).format(value);
  return value.toExponential(2).replace('.', ',');
}

const UNITS: [number, string][] = [
  [1e12, ' trilyon'],
  [1e9, ' milyar'],
  [1e6, ' milyon'],
  [1e3, ' bin'],
];

/** "1,03 milyon" style, for headline figures and multipliers. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  for (const [size, suffix] of UNITS) {
    if (abs >= size) {
      const scaled = value / size;
      return tr({ maximumFractionDigits: scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2 }).format(scaled) + suffix;
    }
  }
  return formatTRY(value);
}

/** Multipliers read better as "17,8x" up to a point, then as compact words. */
export function formatMultiplier(value: number): string {
  if (value >= 100_000) return compact(value) + 'x';
  if (value >= 1000) return plain.format(value) + 'x';
  if (value >= 100) return tr({ maximumFractionDigits: 0 }).format(value) + 'x';
  if (value >= 10) return tr({ maximumFractionDigits: 1 }).format(value) + 'x';
  return twoDp.format(value) + 'x';
}

export function formatPct(value: number, digits = 1): string {
  const abs = Math.abs(value);
  if (abs >= 100_000) return compact(value) + '%';
  return tr({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value) + '%';
}

/** Counts of physical things: "3,5 ekmek" but "1.240 ekmek". */
export function formatUnits(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return compact(value);
  if (abs >= 100) return plain.format(value);
  if (abs >= 10) return tr({ maximumFractionDigits: 1 }).format(value);
  if (abs >= 1) return tr({ maximumFractionDigits: 2 }).format(value);
  if (abs >= 0.01) return tr({ maximumFractionDigits: 3 }).format(value);
  return tr({ maximumFractionDigits: 6 }).format(value);
}

export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  const dots = (cleaned.match(/\./g) ?? []).length;
  const commas = (cleaned.match(/,/g) ?? []).length;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  // Which character, if any, is the decimal point?
  //
  // Turkish writes 1.234,56 — dot groups thousands, comma is the radix point.
  // English inverts that. When both appear, whichever comes last is the radix
  // point and the rule needs no locale guess. When only one appears we lean on
  // the Turkish reading, because that is what this app's own presets emit:
  //   - a lone dot followed by exactly three digits is a grouping ("1.000"),
  //     but only when the digits before it could really start a group, so
  //     "0.056" stays a decimal;
  //   - a lone comma is always the radix point, so "0,056" and "12,750" read
  //     as fractions rather than as thousands.
  let decimalAt = -1;
  if (dots > 0 && commas > 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (dots === 1) {
    const head = cleaned.slice(0, lastDot);
    const grouped = cleaned.length - lastDot - 1 === 3 && /^[1-9]\d{0,2}$/.test(head);
    if (!grouped) decimalAt = lastDot;
  } else if (commas === 1) {
    decimalAt = lastComma;
  }
  // Repeated separators of one kind are groupings: 1.234.567 / 1,234,567.

  const whole = (decimalAt === -1 ? cleaned : cleaned.slice(0, decimalAt)).replace(/[.,]/g, '');
  const fraction = decimalAt === -1 ? '' : cleaned.slice(decimalAt + 1).replace(/[.,]/g, '');

  const n = Number(fraction ? `${whole || '0'}.${fraction}` : whole);
  return Number.isFinite(n) ? n : 0;
}
