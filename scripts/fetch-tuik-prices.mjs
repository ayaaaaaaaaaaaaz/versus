/**
 * Builds src/data/food-prices.json from TÜİK's commodity-level retail prices.
 *
 *   npm run fetch:prices
 *
 * The World Food Programme republishes TÜİK's retail price collection through
 * the Humanitarian Data Exchange as a plain CSV: 52 commodities, monthly, from
 * 2013, licensed CC BY-IGO. No key, no registration.
 *
 * This is the historical spine of the street-price feature. It is emphatically
 * NOT an independent measurement — it is TÜİK's own data, and the UI labels it
 * that way. Its job is to give the basket thirteen years of context and to
 * provide a commodity-level comparator, so our own collected prices can be set
 * against "what TÜİK says bread costs" rather than against an index aggregate.
 *
 * Two hazards in the source are handled here rather than downstream:
 *
 *  1. The market label changes from "National Average" to "Ankara (national
 *     average)" in May 2022. At that join fourteen commodities jump and fall
 *     straight back — an artefact of the change, not a price movement. Chaining
 *     through it unhandled invents a dramatic May-2022 shock.
 *  2. Units are mixed. Eggs are priced per Unit, milk and oils per Litre, the
 *     rest per Kilogram. Filtering to KG quietly drops four basket staples.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/food-prices.json');

const DATASET = 'https://data.humdata.org/dataset/7d7224ed-eff6-421f-9f96-9c8d43905f3c';
const CSV_URL = `${DATASET}/resource/1e2fc8c9-a192-4019-96fa-9280554d6488/download/wfp_food_prices_tur.csv`;

/** The two labels that together form one continuous national series. */
const NATIONAL_MARKETS = new Set(['National Average', 'Ankara (national average)']);

/**
 * The source bundles fuel, electricity, water, public transport and a labour
 * wage under a "non-food" category. They are genuinely useful series but they
 * do not belong in a file backing a grocery basket, and they are priced in
 * units (kWh, cubic metre, a day's wage) that no food normalisation handles.
 */
const EXCLUDED_CATEGORIES = new Set(['non-food']);

/**
 * Units a price can actually be normalised from. A few commodities are quoted
 * per "Package" or per "Course" with no stated size, so a price in those units
 * cannot be compared with anything — including its own past self, if the pack
 * changes. They are dropped rather than guessed at.
 */
const USABLE_UNITS = new Set(['KG', 'L', 'Unit']);

/** Month where the market label changes; prices either side are not comparable. */
const JOIN_MONTH = '2022-05';

const round = (n, p = 6) => Number(n.toPrecision(p));
const toMonth = (date) => date.slice(0, 7);

/**
 * A single-month jump that immediately reverses is a reporting artefact, not a
 * price. Thresholds are deliberately loose — Turkish food prices genuinely move
 * fast, and the aim is to catch impossible round trips, not sharp inflation.
 */
function findAnomalies(months, prices) {
  const flagged = [];
  for (let i = 1; i < months.length - 1; i++) {
    const before = prices[months[i - 1]];
    const at = prices[months[i]];
    const after = prices[months[i + 1]];
    if (!before || !at || !after) continue;
    if (at / before > 1.4 && after / at < 0.75) {
      flagged.push({
        month: months[i],
        price: at,
        neighbours: [before, after],
        ratio: round(at / before, 4),
      });
    }
  }
  return flagged;
}

const main = async () => {
  console.log('fetching TÜİK retail prices via HDX...');
  const res = await fetch(CSV_URL, {
    headers: { 'user-agent': 'versus-data-build/1.0 (inflation research project)' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HDX: HTTP ${res.status}`);

  const rows = parseCsvObjects(await res.text());
  console.log(`  ${rows.length} rows`);

  const national = rows.filter(
    (r) =>
      NATIONAL_MARKETS.has(r.market) &&
      r.pricetype === 'Retail' &&
      Number(r.price) > 0 &&
      !EXCLUDED_CATEGORIES.has(r.category) &&
      USABLE_UNITS.has(r.unit),
  );

  const unusableUnits = [...new Set(
    rows
      .filter((r) => !EXCLUDED_CATEGORIES.has(r.category) && !USABLE_UNITS.has(r.unit))
      .map((r) => `${r.commodity} (${r.unit})`),
  )].sort();

  const excluded = [...new Set(
    rows.filter((r) => EXCLUDED_CATEGORIES.has(r.category)).map((r) => r.commodity),
  )].sort();

  /** commodity -> { unit, prices: { 'YYYY-MM': price } } */
  const byCommodity = new Map();
  const unitConflicts = [];

  for (const row of national) {
    const name = row.commodity;
    const unit = row.unit;
    const month = toMonth(row.date);
    const price = Number(row.price);

    let entry = byCommodity.get(name);
    if (!entry) {
      entry = { unit, prices: {}, markets: new Set() };
      byCommodity.set(name, entry);
    }
    // A commodity that switches unit mid-series cannot be chained; record it
    // and keep only the dominant unit rather than mixing L with KG.
    if (entry.unit !== unit) {
      unitConflicts.push({ commodity: name, month, had: entry.unit, saw: unit });
      continue;
    }
    entry.prices[month] = round(price);
    entry.markets.add(row.market);
  }

  const commodities = {};
  let anomalyCount = 0;
  const allMonths = new Set();

  for (const [name, entry] of [...byCommodity.entries()].sort()) {
    const months = Object.keys(entry.prices).sort();
    if (months.length < 12) continue; // too short to be useful in an index
    months.forEach((m) => allMonths.add(m));

    const anomalies = findAnomalies(months, entry.prices);
    anomalyCount += anomalies.length;

    commodities[name] = {
      unit: entry.unit,
      months: months.length,
      from: months[0],
      to: months.at(-1),
      anomalies: anomalies.map((a) => a.month),
      prices: entry.prices,
    };
  }

  const months = [...allMonths].sort();
  const latest = months.at(-1);

  /**
   * TÜİK quietly stops publishing some commodities — veal ends in 2022, three
   * others in 2017. A discontinued series still looks like data, so comparing a
   * current shelf price against one produces a nonsense ratio. Mark them here
   * so the basket can refuse to map onto a dead series.
   */
  for (const [name, c] of Object.entries(commodities)) {
    c.stale = c.to < latest;
    if (c.stale) console.log(`  stale: ${name} ends ${c.to}`);
  }

  // Which months the calendar expects but the source never reported.
  const gaps = [];
  const cursor = new Date(`${months[0]}-01T00:00:00Z`);
  const end = new Date(`${months.at(-1)}-01T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    if (!allMonths.has(key)) gaps.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const payload = {
    meta: {
      title: 'TÜİK commodity retail prices',
      upstream: 'Türkiye İstatistik Kurumu (TÜİK)',
      provider: 'World Food Programme, via the Humanitarian Data Exchange',
      datasetUrl: DATASET,
      licence: 'CC BY-IGO',
      independence:
        'Bu seri TÜİK’in kendi verisidir; bağımsız bir ölçüm değildir. Sokak endeksinin tarihsel omurgasını ve madde bazında resmî karşılaştırmasını sağlar.',
      basis: 'Aylık, perakende, ulusal ortalama. Fiyatlar kaynağında kg / litre / adet olarak normalize edilmiştir.',
      marketNote: `Pazar etiketi ${JOIN_MONTH} ayında "National Average" değerinden "Ankara (national average)" değerine geçer; iki etiket tek bir ulusal seri olarak birleştirilmiştir.`,
      joinMonth: JOIN_MONTH,
      anomalyRule:
        'Bir ay içinde %40’tan fazla artıp ardından %25’ten fazla geri düşen gözlemler işaretlenir. Bunlar silinmez; endeks hesabında kullanılmadan önce arayüzde ve yöntem sayfasında listelenir.',
      fetchedAt: new Date().toISOString().slice(0, 10),
      minMonth: months[0],
      maxMonth: months.at(-1),
      monthsCovered: months.length,
      missingMonths: gaps,
      commodityCount: Object.keys(commodities).length,
      staleCommodities: Object.entries(commodities).filter(([, c]) => c.stale).map(([n, c]) => ({ name: n, endsAt: c.to })),
      excludedCategories: [...EXCLUDED_CATEGORIES],
      excludedCommodities: excluded,
      unnormalisableUnits: unusableUnits,
      usableUnits: [...USABLE_UNITS],
      anomalyCount,
      unitConflicts,
    },
    commodities,
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 1) + '\n');

  console.log(`\nwrote ${OUT}`);
  console.log(`  ${payload.meta.commodityCount} commodities, ${months[0]} → ${months.at(-1)}`);
  console.log(`  ${months.length} months present, ${gaps.length} calendar gaps`);
  console.log(`  ${anomalyCount} flagged spike-and-revert observations`);
  if (unitConflicts.length) console.log(`  ${unitConflicts.length} unit conflicts skipped`);
  console.log(`  ${excluded.length} non-food commodities excluded`);
  if (unusableUnits.length) console.log(`  ${unusableUnits.length} dropped for unnormalisable units: ${unusableUnits.join(', ')}`);
};

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
