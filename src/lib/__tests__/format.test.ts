import { describe, expect, it } from 'vitest';
import { compact, formatMultiplier, formatTRY, parseAmount } from '../format';

describe('parseAmount', () => {
  it('reads Turkish grouping, where a dot separates thousands', () => {
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('1.000.000')).toBe(1_000_000);
    expect(parseAmount('2.500')).toBe(2500);
  });

  it('reads Turkish decimals, where a comma is the radix point', () => {
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('0,056')).toBeCloseTo(0.056);
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
  });

  it('reads a lone comma as a decimal even before three digits', () => {
    // The Turkish reading: 12,750 is twelve and three quarters, not twelve
    // thousand. A user wanting thousands would type 12.750 here.
    expect(parseAmount('12,750')).toBeCloseTo(12.75);
    expect(parseAmount('0,056')).toBeCloseTo(0.056);
  });

  it('keeps a leading-zero head as a decimal in either notation', () => {
    expect(parseAmount('0.056')).toBeCloseTo(0.056);
  });

  it('still accepts English formatting', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
    expect(parseAmount('1,234,567')).toBe(1234567);
    expect(parseAmount('1000')).toBe(1000);
  });

  it('treats a lone separator with a non-triple tail as a decimal', () => {
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('1.23')).toBeCloseTo(1.23);
  });

  it('ignores currency symbols and junk', () => {
    expect(parseAmount('₺ 2.500')).toBe(2500);
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
  });
});

describe('formatting', () => {
  it('keeps sub-lira amounts legible across many orders of magnitude', () => {
    expect(formatTRY(0)).toBe('0');
    expect(formatTRY(1234)).toBe('1.234');
    expect(formatTRY(12.5)).toBe('12,50');
  });

  it('uses Turkish scale words for very large figures', () => {
    expect(compact(1_500_000)).toContain('milyon');
    expect(compact(2_300_000_000)).toContain('milyar');
  });

  it('formats multipliers at a sensible precision for their size', () => {
    expect(formatMultiplier(17.84)).toBe('17,8x');
    expect(formatMultiplier(2.5)).toBe('2,50x');
  });
});
