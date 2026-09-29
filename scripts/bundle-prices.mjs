/**
 * Flattens the daily collection files into one bundle the app can import.
 *
 *   npm run bundle:prices
 *
 * data/prices/YYYY-MM-DD.json is the raw record, one file per run, appended to
 * by the scheduled job. The app wants a single sorted list, so this squashes
 * them without interpreting anything: no gap filling, no averaging, no dropping
 * of flagged rows. Every judgement about the data belongs in the index code,
 * where it can be tested, not in a build step.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = resolve(ROOT, 'data/prices');
const MANUAL_DIR = resolve(ROOT, 'data/manual');
const OUT = resolve(ROOT, 'src/data/street-prices.json');

const PACK_TO_BASE = { g: 1 / 1000, ml: 1 / 1000, kg: 1, l: 1, unit: 1 };

/**
 * Hand-entered prices, for shops the collector cannot reach.
 *
 * Rows are validated rather than trusted: an unknown item id, a bad date or a
 * price that will not parse is reported and skipped. A typo in a spreadsheet
 * should cost one row, not corrupt the index — and never silently invent a
 * basket item that does not exist.
 */
function loadManual(knownItems) {
  if (!existsSync(MANUAL_DIR)) return { rows: [], problems: [] };

  const rows = [];
  const problems = [];

  for (const file of readdirSync(MANUAL_DIR).filter((f) => f.endsWith('.csv'))) {
    let records;
    try {
      records = parseCsvObjects(readFileSync(resolve(MANUAL_DIR, file), 'utf8'));
    } catch (err) {
      problems.push(`${file}: ${err.message}`);
      continue;
    }

    records.forEach((r, i) => {
      const where = `${file}:${i + 2}`;
      const date = (r.date ?? '').trim();
      const store = (r.store ?? '').trim();
      const itemId = (r.item_id ?? '').trim();
      const shelfPrice = Number(String(r.shelf_price ?? '').replace(',', '.'));
      const packSize = Number(String(r.pack_size ?? '').replace(',', '.'));
      const packUnit = (r.pack_unit ?? '').trim().toLowerCase();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problems.push(`${where}: bad date "${date}"`);
      if (!store) return problems.push(`${where}: missing store`);
      if (!knownItems.has(itemId)) return problems.push(`${where}: unknown item "${itemId}"`);
      if (!(shelfPrice > 0)) return problems.push(`${where}: bad price "${r.shelf_price}"`);
      if (!(packSize > 0)) return problems.push(`${where}: bad pack size "${r.pack_size}"`);
      if (!(packUnit in PACK_TO_BASE)) return problems.push(`${where}: bad unit "${packUnit}"`);

      const baseQuantity = packSize * PACK_TO_BASE[packUnit];
      rows.push({
        date, store, itemId,
        unitPrice: Number((shelfPrice / baseQuantity).toPrecision(8)),
        regularPrice: shelfPrice,
        discountedPrice: null,
        baseQuantity: Number(baseQuantity.toPrecision(8)),
        productName: (r.note ?? '').trim() || null,
        packMismatch: false,
        source: 'manual',
      });
    });
  }

  return { rows, problems };
}

const main = () => {
  const files = readdirSync(IN_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  const observations = [];
  const days = [];
  let failures = 0;

  for (const file of files) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(resolve(IN_DIR, file), 'utf8'));
    } catch (err) {
      // A corrupt day is skipped, not fatal: the index tolerates gaps.
      console.warn(`  skipping ${file}: ${err.message}`);
      continue;
    }
    const date = payload.meta?.date ?? file.slice(0, 10);
    days.push({
      date,
      attempted: payload.meta?.attempted ?? 0,
      collected: payload.meta?.collected ?? 0,
      failed: payload.meta?.failed ?? 0,
      divergences: (payload.divergences ?? []).map((d) => d.itemId),
    });
    failures += payload.meta?.failed ?? 0;

    for (const o of payload.observations ?? []) {
      observations.push({
        date,
        store: o.store,
        itemId: o.itemId,
        unitPrice: o.unitPrice,
        regularPrice: o.regularPrice,
        discountedPrice: o.discountedPrice ?? null,
        baseQuantity: o.baseQuantity,
        productName: o.productName ?? null,
        packMismatch: o.packMismatch === true,
        source: o.source ?? 'scraped',
      });
    }
  }

  const knownItems = new Set(
    JSON.parse(readFileSync(resolve(ROOT, 'src/data/street-basket.json'), 'utf8')).items.map((i) => i.id),
  );
  const manual = loadManual(knownItems);
  observations.push(...manual.rows);
  for (const p of manual.problems) console.warn(`  manual: ${p}`);

  observations.sort((a, b) =>
    a.date.localeCompare(b.date) || a.itemId.localeCompare(b.itemId) || a.store.localeCompare(b.store),
  );

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        meta: {
          note: 'data/prices/*.json dosyalarının düz birleşimi. Hiçbir boşluk doldurulmaz, hiçbir satır elenmez.',
          bundledAt: new Date().toISOString().slice(0, 10),
          days: days.length,
          firstDay: days[0]?.date ?? null,
          lastDay: days.at(-1)?.date ?? null,
          observations: observations.length,
          scraped: observations.filter((o) => o.source !== 'manual').length,
          manual: manual.rows.length,
          manualProblems: manual.problems,
          totalFailures: failures,
        },
        days,
        observations,
      },
      null,
      1,
    ) + '\n',
  );

  console.log(`bundled ${observations.length} observations across ${days.length} day(s)`);
  if (manual.rows.length) console.log(`  including ${manual.rows.length} manual`);
  if (manual.problems.length) console.log(`  ${manual.problems.length} manual row(s) skipped`);
  console.log(`  ${days[0]?.date ?? '—'} → ${days.at(-1)?.date ?? '—'}`);
  console.log(`wrote ${OUT}`);
};

main();
