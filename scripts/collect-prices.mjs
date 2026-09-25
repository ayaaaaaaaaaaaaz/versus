/**
 * Collects one day of shelf prices for the street basket.
 *
 *   npm run collect
 *
 * Ground rules, in order of importance:
 *
 *  - robots.txt is fetched per store at run time and obeyed. A path the store
 *    disallows is skipped, not fetched. Checking once by hand when the scraper
 *    was written would not be obeying anything.
 *  - One request at a time, several seconds apart, with a user agent that says
 *    what this is. No logins, no captchas, no bot-protection workarounds; a
 *    store that challenges automated clients is simply not collected from.
 *  - Prices come from each page's schema.org Offer — the structured data the
 *    site publishes deliberately for machines — rather than from scraped markup.
 *  - A failure never spreads. Each item is attempted independently and any
 *    error is recorded against that item alone; the run always completes and
 *    always writes a file, even if every request failed.
 *
 * Output is one JSON file per day under data/prices/, appended to by git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { isAllowed } from './lib/robots.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'data/prices');

const USER_AGENT =
  'versus-street-prices/1.0 (non-commercial inflation research; one pass per day; contact via repository)';

/** Seconds between requests to the same host. */
const DELAY_MS = 5000;
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, p = 6) => (Number.isFinite(n) ? Number(n.toPrecision(p)) : null);

/** Signatures of a challenge page. Seeing one means stop, not retry harder. */
const CHALLENGE = /Just a moment|Attention Required|cf-browser-verification|captcha/i;

const robotsCache = new Map();

async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let text = '';
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A store that will not even serve its own rules is one we leave alone.
    text = res.ok ? await res.text() : 'User-agent: *\nDisallow: /';
    if (CHALLENGE.test(text)) text = 'User-agent: *\nDisallow: /';
  } catch {
    text = 'User-agent: *\nDisallow: /';
  }
  robotsCache.set(origin, text);
  return text;
}

/** Walks nested JSON-LD for the first Offer carrying a price. */
function findOffer(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findOffer(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const type = node['@type'];
  if ((type === 'Offer' || type === 'AggregateOffer') && node.price != null) return node;
  for (const value of Object.values(node)) {
    const hit = findOffer(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function findNamed(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const c of node) { const h = findNamed(c, depth + 1); if (h) return h; }
    return null;
  }
  if (typeof node.name === 'string' && node.name.trim()) return node.name.trim();
  for (const v of Object.values(node)) { const h = findNamed(v, depth + 1); if (h) return h; }
  return null;
}

/** Net quantity as the page states it, so a silent pack change is detectable. */
function readNetQuantity(html) {
  const m = html.match(/Net Miktar[^<]*<\/strong>\s*<br\s*\/?>\s*([\d.,]+)/i);
  if (!m) return null;
  const value = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const PACK_TO_BASE = { g: 1 / 1000, ml: 1 / 1000, kg: 1, l: 1, unit: 1 };

async function fetchProduct(store, item, product) {
  const url = new URL(product.url);
  const robots = await robotsFor(url.origin);

  if (!isAllowed(robots, url.pathname, USER_AGENT)) {
    return { status: 'disallowed', note: 'robots.txt disallows this path' };
  }

  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { status: 'http_error', note: `HTTP ${res.status}` };

  const html = await res.text();
  if (CHALLENGE.test(html)) return { status: 'challenged', note: 'bot protection page returned' };

  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  let offer = null;
  let productName = null;
  for (const [, raw] of blocks) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    offer ??= findOffer(parsed);
    productName ??= findNamed(parsed);
    if (offer) break;
  }
  if (!offer) return { status: 'no_offer', note: 'no schema.org Offer in page' };

  const price = Number(offer.price);
  if (!Number.isFinite(price) || price <= 0) return { status: 'bad_price', note: `price=${offer.price}` };

  // Prefer the size the page states over the one we recorded; a mismatch is
  // exactly what shrinkflation looks like.
  const stated = readNetQuantity(html);
  const declaredBase = product.pack.size * (PACK_TO_BASE[product.pack.unit] ?? 1);
  const statedBase =
    stated != null && (product.pack.unit === 'g' || product.pack.unit === 'ml')
      ? stated / 1000
      : null;
  const base = statedBase ?? declaredBase;

  return {
    status: 'ok',
    productName,
    regularPrice: round(price),
    discountedPrice: null,
    currency: offer.priceCurrency ?? 'TRY',
    availability: String(offer.availability ?? '').split('/').pop() || null,
    packSize: product.pack.size,
    packUnit: product.pack.unit,
    statedNetQuantity: stated,
    baseQuantity: round(base),
    unitPrice: base > 0 ? round(price / base) : null,
    unit: item.unit,
    packMismatch: statedBase != null && Math.abs(statedBase - declaredBase) / declaredBase > 0.02,
  };
}

const main = async () => {
  const basket = JSON.parse(readFileSync(resolve(ROOT, 'src/data/street-basket.json'), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const observations = [];
  const failures = [];

  const jobs = [];
  for (const item of basket.items) {
    for (const [store, product] of Object.entries(item.stores)) {
      if (product) jobs.push({ store, item, product });
    }
  }

  console.log(`collecting ${jobs.length} prices for ${today}`);

  for (const [i, job] of jobs.entries()) {
    if (i > 0) await sleep(DELAY_MS);
    let result;
    try {
      result = await fetchProduct(job.store, job.item, job.product);
    } catch (err) {
      // Anything unexpected is that item's problem, never the run's.
      result = { status: 'error', note: err?.message ?? String(err) };
    }

    const base = {
      date: today,
      store: job.store,
      itemId: job.item.id,
      itemName: job.item.name,
      url: job.product.url,
      source: 'scraped',
    };

    if (result.status === 'ok') {
      observations.push({ ...base, ...result });
      const flag = result.packMismatch ? '  [pack size differs from config]' : '';
      console.log(`  ok   ${job.item.id.padEnd(14)} ${String(result.unitPrice).padStart(9)} TL/${job.item.unit}${flag}`);
    } else {
      failures.push({ ...base, ...result });
      console.log(`  ${result.status.padEnd(4)} ${job.item.id.padEnd(14)} ${result.note}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    meta: {
      date: today,
      collectedAt: new Date().toISOString(),
      userAgent: USER_AGENT,
      delayMs: DELAY_MS,
      attempted: jobs.length,
      collected: observations.length,
      failed: failures.length,
      note: 'Fiyatlar mağazaların kendi schema.org Offer verisinden okunur. robots.txt her çalıştırmada yeniden alınır ve uygulanır.',
    },
    observations,
    failures,
  };
  writeFileSync(resolve(OUT_DIR, `${today}.json`), JSON.stringify(payload, null, 1) + '\n');

  console.log(`\n${observations.length}/${jobs.length} collected, ${failures.length} failed`);
  console.log(`wrote data/prices/${today}.json`);
  // A failed run still exits clean: the scheduler should commit what it got.
};

main().catch((err) => {
  console.error('collector failed before writing:', err.message);
  process.exit(1);
});
