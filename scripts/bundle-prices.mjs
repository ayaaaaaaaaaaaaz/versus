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
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = resolve(ROOT, 'data/prices');
const OUT = resolve(ROOT, 'src/data/street-prices.json');

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
  console.log(`  ${days[0]?.date ?? '—'} → ${days.at(-1)?.date ?? '—'}`);
  console.log(`wrote ${OUT}`);
};

main();
