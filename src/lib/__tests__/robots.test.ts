import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper shared with the build scripts
import { isAllowed, parseRobots } from '../../../scripts/lib/robots.mjs';

// The real files, as served at the time of writing.
const MIGROS = `User-agent: *
Disallow: /arama
Disallow: /*espv

User-agent: BLEXBot
Disallow: /

Sitemap: https://www.migros.com.tr/hermes/api/sitemaps/sitemap.xml`;

const SOK = `User-agent: *
Disallow: /arama
Sitemap: https://www.sokmarket.com.tr/sitemap/sitemap.xml`;

describe('robots.txt parsing', () => {
  it('groups rules under their user agents', () => {
    const groups = parseRobots(MIGROS);
    expect(groups.length).toBe(2);
    expect(groups[0].agents).toContain('*');
    expect(groups[1].agents).toContain('blexbot');
  });

  it('allows the product pages the basket points at', () => {
    expect(isAllowed(MIGROS, '/migros-baldo-pirinc-1-kg-p-f6a53')).toBe(true);
    expect(isAllowed(SOK, '/urun/bir-sey')).toBe(true);
  });

  it('refuses the search paths both chains disallow', () => {
    expect(isAllowed(MIGROS, '/arama?q=ekmek')).toBe(false);
    expect(isAllowed(SOK, '/arama')).toBe(false);
  });

  it('honours a wildcard anywhere in the pattern', () => {
    // `Disallow: /*espv` blocks any path containing espv, not just a prefix.
    expect(isAllowed(MIGROS, '/anything-espv-here')).toBe(false);
    expect(isAllowed(MIGROS, '/espv-prefixed')).toBe(false);
    expect(isAllowed(MIGROS, '/migros-baldo-pirinc-1-kg-p-f6a53')).toBe(true);
  });

  it('honours an end anchor', () => {
    const txt = 'User-agent: *\nDisallow: /x$';
    expect(isAllowed(txt, '/x')).toBe(false);
    expect(isAllowed(txt, '/x/y')).toBe(true);
  });

  it('does not treat regex characters in a path as syntax', () => {
    const txt = 'User-agent: *\nDisallow: /a+b(c)';
    expect(isAllowed(txt, '/a+b(c)')).toBe(false);
    expect(isAllowed(txt, '/aaab')).toBe(true);
  });

  it('applies a named agent block ahead of the wildcard', () => {
    expect(isAllowed(MIGROS, '/any-product', 'BLEXBot/1.0')).toBe(false);
    expect(isAllowed(MIGROS, '/any-product', 'versus-street-prices/1.0')).toBe(true);
  });

  it('lets a longer Allow override a shorter Disallow', () => {
    const txt = 'User-agent: *\nDisallow: /a\nAllow: /a/b';
    expect(isAllowed(txt, '/a/x')).toBe(false);
    expect(isAllowed(txt, '/a/b/c')).toBe(true);
  });

  it('permits everything when no rules apply', () => {
    expect(isAllowed('User-agent: Googlebot\nDisallow: /', '/x', 'versus')).toBe(true);
    expect(isAllowed('', '/x')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    expect(isAllowed('# hello\n\nUser-agent: *\nDisallow: /arama # search', '/arama')).toBe(false);
  });
});
