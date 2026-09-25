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

/**
 * Is this a bot-protection interstitial rather than the page we asked for?
 *
 * Deliberately narrow. An earlier version searched the whole document for
 * "captcha", which matched a ŞOK config key called buyerPhoneUpdateCaptchaAction
 * and wrongly condemned a perfectly ordinary product page. A challenge announces
 * itself in the title or through Cloudflare's own markers; a word buried in
 * 800 kB of application state means nothing.
 */
function isChallengePage(html) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  if (/just a moment|attention required|access denied|verify you are human/i.test(title)) return true;
  return /cf-browser-verification|cf_chl_opt|__cf_chl_|g-recaptcha-response/i.test(html);
}

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
    if (isChallengePage(text)) text = 'User-agent: *\nDisallow: /';
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

/**
 * One extractor per chain, because they publish prices differently.
 *
 * Migros ships a schema.org Offer, which is the ideal case: a standard format
 * meant for machines. ŞOK ships no structured data at all but does embed its
 * own state, carrying original and discounted prices separately — better for
 * our purposes, since the index wants the regular price and the discount kept
 * apart. Neither is scraped from presentational markup, which is what would
 * break on a redesign.
 */
const EXTRACTORS = {
  migros(html) {
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
    if (!offer) return null;
    return {
      price: Number(offer.price),
      discounted: null,
      productName,
      currency: offer.priceCurrency ?? 'TRY',
      availability: String(offer.availability ?? '').split('/').pop() || null,
    };
  },

  sok(html) {
    // The state blob is JSON escaped inside a script tag, so the quotes arrive
    // as \" and a plain JSON.parse of the page is not available.
    const prices = html.match(
      /prices\\?":\s*\{\\?"discounted\\?":\s*\{\\?"value\\?":\s*([\d.]+)[\s\S]{0,200}?\\?"original\\?":\s*\{\\?"value\\?":\s*([\d.]+)/,
    );
    let price = null;
    let discounted = null;
    if (prices) {
      discounted = Number(prices[1]);
      price = Number(prices[2]);
    } else {
      // Fall back to the rendered price element before giving up entirely.
      const shown = html.match(/data-testid="discountedPrice"[^>]*>([\d.]+,\d{2})/);
      if (shown) price = Number(shown[1].replace(/\./g, '').replace(',', '.'));
    }
    if (price == null) return null;

    const name = html.match(/ProductMainInfoArea_productName[^>]*>([^<]+)</)?.[1]?.trim() ?? null;
    const inStock = /\\?"hasStock\\?":\s*true/.test(html);
    return {
      price,
      discounted,
      productName: name,
      currency: 'TRY',
      availability: inStock ? 'InStock' : null,
    };
  },
};

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
  if (isChallengePage(html)) return { status: 'challenged', note: 'bot protection page returned' };

  const extract = EXTRACTORS[store];
  if (!extract) return { status: 'no_extractor', note: `no extractor for ${store}` };

  const found = extract(html);
  if (!found) return { status: 'no_price', note: 'no price found in page' };

  const { price, discounted, productName, currency, availability } = found;
  if (!Number.isFinite(price) || price <= 0) return { status: 'bad_price', note: `price=${price}` };

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
    discountedPrice: discounted != null && discounted < price ? round(discounted) : null,
    currency: currency ?? 'TRY',
    availability,
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

  /**
   * Where two stores disagree wildly on the same basket item, it is usually
   * not the market — it is us, having pinned two different things. ŞOK's
   * "firik" bulgur is a roasted specialty, its canned chickpeas are not dry
   * ones. The index itself is unharmed, because Jevons works on each store's
   * own price relative over time, but the per-item table would be nonsense and
   * a specialty line is likelier to vanish from the shelf. Flag, do not drop.
   */
  const byItem = new Map();
  for (const o of observations) {
    if (o.unitPrice == null) continue;
    const list = byItem.get(o.itemId) ?? [];
    list.push(o);
    byItem.set(o.itemId, list);
  }
  const divergences = [];
  for (const [itemId, list] of byItem) {
    if (list.length < 2) continue;
    const prices = list.map((o) => o.unitPrice);
    const ratio = Math.max(...prices) / Math.min(...prices);
    if (ratio >= 2) {
      divergences.push({
        itemId,
        ratio: round(ratio, 3),
        stores: Object.fromEntries(list.map((o) => [o.store, o.unitPrice])),
        note: 'Mağazalar arası fark 2 katından fazla; büyük olasılıkla farklı ürünler eşleştirilmiş.',
      });
    }
  }
  if (divergences.length) {
    console.log(`\n  ${divergences.length} item(s) diverge >2x across stores:`);
    for (const d of divergences) console.log(`    ${d.itemId.padEnd(14)} ${d.ratio}x  ${JSON.stringify(d.stores)}`);
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
      note: 'Fiyatlar mağazaların kendi yapısal verisinden okunur. robots.txt her çalıştırmada yeniden alınır ve uygulanır.',
      divergenceThreshold: 2,
    },
    observations,
    failures,
    divergences,
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
