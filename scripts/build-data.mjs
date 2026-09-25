/**
 * Regenerates every bundled dataset in src/data.
 *
 *   npm run build:data
 *
 * Four sources, none of which needs an API key or a paid plan:
 *
 *  World Bank   annual CPI and exchange rates, 1960-. The long spine of the
 *               app; the only source that reaches back before 1996.
 *  Eurostat     monthly HICP for Turkey with the full COICOP breakdown and the
 *               official basket weights. Turkey is an EU candidate country, so
 *               Eurostat publishes a harmonised series for it. Sends CORS
 *               headers, so the browser could refresh this directly too.
 *  Yahoo        monthly closes for USD/TRY, EUR/TRY, BIST 100 and gold, used
 *               for the asset comparison. Fetched here at build time only.
 *
 * Everything written here is machine-derived. The two hand-curated datasets -
 * basket.json and events.json - are edited by hand and never touched by this
 * script.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { COICOP, hicpMonthly, hicpWeights, worldBank, yahooMonthly } from './lib/sources.mjs';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const TODAY = new Date().toISOString().slice(0, 10);
const round = (n, p) => Number(n.toPrecision(p));

const write = (name, payload) => {
  writeFileSync(resolve(DATA, name), JSON.stringify(payload, null, 1) + '\n');
  const size = (JSON.stringify(payload).length / 1024).toFixed(0);
  console.log(`  wrote ${name.padEnd(18)} ${size} kB`);
};

/** Turkish labels for the COICOP divisions, plus a glyph for the basket UI. */
const CATEGORY_META = {
  CP01: { tr: 'Gıda ve alkolsüz içecekler', short: 'Gıda', emoji: '🍅' },
  CP02: { tr: 'Alkollü içecekler ve tütün', short: 'Tütün, alkol', emoji: '🚬' },
  CP03: { tr: 'Giyim ve ayakkabı', short: 'Giyim', emoji: '👕' },
  CP04: { tr: 'Konut, su, elektrik, gaz', short: 'Konut', emoji: '🏠' },
  CP05: { tr: 'Mobilya ve ev eşyası', short: 'Ev eşyası', emoji: '🛋️' },
  CP06: { tr: 'Sağlık', short: 'Sağlık', emoji: '💊' },
  CP07: { tr: 'Ulaştırma', short: 'Ulaşım', emoji: '🚌' },
  CP08: { tr: 'Haberleşme', short: 'İletişim', emoji: '📱' },
  CP09: { tr: 'Eğlence ve kültür', short: 'Eğlence', emoji: '🎭' },
  CP10: { tr: 'Eğitim', short: 'Eğitim', emoji: '🎓' },
  CP11: { tr: 'Lokanta ve oteller', short: 'Yeme-içme', emoji: '🍽️' },
  CP12: { tr: 'Çeşitli mal ve hizmetler', short: 'Diğer', emoji: '🧾' },
};

async function buildAnnual() {
  const [cpi, tryUsd, eurUsd] = await Promise.all([
    worldBank('TUR', 'FP.CPI.TOTL'),
    worldBank('TUR', 'PA.NUS.FCRF'),
    worldBank('EMU', 'PA.NUS.FCRF'),
  ]);

  const years = Object.keys(cpi.values).map(Number).sort((a, b) => a - b);
  const inflation = {};
  for (const y of years) {
    if (cpi.values[y - 1] == null) continue;
    inflation[y] = round((cpi.values[y] / cpi.values[y - 1] - 1) * 100, 6);
  }

  const tryPerUsd = {};
  const tryPerEur = {};
  for (const y of years) {
    const usd = tryUsd.values[y];
    if (usd != null) tryPerUsd[y] = round(usd, 8);
    if (usd != null && eurUsd.values[y]) tryPerEur[y] = round(usd / eurUsd.values[y], 8);
  }

  write('series.json', {
    meta: {
      source: 'World Bank Open Data (api.worldbank.org), indicators FP.CPI.TOTL and PA.NUS.FCRF',
      upstream: 'World Bank compiles the CPI series from TÜİK; the FX series from IMF IFS / TCMB.',
      basis: 'Annual averages. CPI rebased to 2010 = 100.',
      cpiLastUpdated: cpi.lastUpdated,
      fxLastUpdated: tryUsd.lastUpdated,
      generatedAt: TODAY,
      minYear: years[0],
      maxYear: years.at(-1),
      redenomination: {
        year: 2005,
        factor: 1e6,
        note: 'On 1 Jan 2005 the lira was redenominated: 1,000,000 TL became 1 YTL (later TRY). Both series below are stated in NEW lira for every year, so no adjustment is applied internally — only user-entered amounts from before 2005 need converting.',
      },
    },
    cpi: Object.fromEntries(years.map((y) => [y, round(cpi.values[y], 10)])),
    inflation,
    tryPerUsd,
    tryPerEur,
  });

  return { years };
}

async function buildMonthly() {
  const [headline, categories, weights] = await Promise.all([
    hicpMonthly(['CP00']),
    hicpMonthly(COICOP),
    hicpWeights(COICOP),
  ]);

  const index = headline.CP00;
  const months = Object.keys(index).sort();

  // Year-over-year change per month, from the same index the app calculates on.
  const yoy = {};
  for (const m of months) {
    const [y, mm] = m.split('-');
    const prior = index[`${Number(y) - 1}-${mm}`];
    if (prior) yoy[m] = round((index[m] / prior - 1) * 100, 6);
  }

  const meta = {
    source: 'Eurostat, Harmonised Index of Consumer Prices (prc_hicp_midx, prc_hicp_inw)',
    upstream: 'Eurostat, AB aday ülkesi olarak Türkiye için uyumlaştırılmış aylık endeks yayımlar; veriler TÜİK fiyat derlemesine dayanır.',
    basis: 'Aylık endeks, 2015 = 100. Uyumlaştırılmış (HICP) yöntem; TÜİK’in ulusal TÜFE’sinden az da olsa farklıdır.',
    licence: 'Eurostat verisi kaynak gösterilerek kullanılabilir.',
    generatedAt: TODAY,
    minMonth: months[0],
    maxMonth: months.at(-1),
  };

  write('monthly.json', { meta, index, yoy });

  write('categories.json', {
    meta: {
      ...meta,
      weightYear: weights.year,
      weightNote: `${weights.year} yılı resmî HICP harcama ağırlıkları, yüzde olarak. Manşet endeksin fiilen kullandığı paylar bunlardır.`,
    },
    categories: COICOP.map((code) => ({
      code,
      ...CATEGORY_META[code],
      weight: weights.weights[code] ?? 0,
    })),
    index: categories,
  });

  return { months };
}

async function buildAssets() {
  const [usd, eur, bist, gold] = await Promise.all([
    yahooMonthly('TRY=X'),
    yahooMonthly('EURTRY=X'),
    yahooMonthly('XU100.IS'),
    yahooMonthly('GC=F'),
  ]);

  const OZ_IN_GRAMS = 31.1034768;
  const goldTryGram = {};
  for (const [month, usdPerOz] of Object.entries(gold.values)) {
    const rate = usd.values[month];
    if (rate) goldTryGram[month] = round((usdPerOz / OZ_IN_GRAMS) * rate, 8);
  }

  const span = (o) => {
    const k = Object.keys(o).sort();
    return { from: k[0], to: k.at(-1), points: k.length };
  };

  write('assets.json', {
    meta: {
      source: 'Yahoo Finance aylık kapanışları (TRY=X, EURTRY=X, XU100.IS, GC=F)',
      basis: 'Ay sonu kapanış değerleri. Altın, ons başına dolar cinsinden en yakın vadeli kontrattır.',
      derived: 'Gram altın = (ons fiyatı ÷ 31,1034768) × USD/TRY; yalnızca iki serinin de verisi olan aylarda hesaplanır.',
      caveat: 'Endeks ve spot fiyatlardır: temettü, kupon, komisyon ve vergi içermez. Gerçek bir portföyün getirisi farklı olurdu.',
      generatedAt: TODAY,
      coverage: {
        usdTry: span(usd.values),
        eurTry: span(eur.values),
        bist100: span(bist.values),
        goldTryGram: span(goldTryGram),
      },
    },
    monthly: {
      usdTry: usd.values,
      eurTry: eur.values,
      bist100: bist.values,
      goldUsdOz: gold.values,
      goldTryGram,
    },
  });
}

const main = async () => {
  console.log('World Bank — annual CPI and FX');
  const { years } = await buildAnnual();
  console.log(`  ${years[0]}–${years.at(-1)}\n`);

  console.log('Eurostat — monthly HICP and COICOP categories');
  const { months } = await buildMonthly();
  console.log(`  ${months[0]}–${months.at(-1)} (${months.length} months, ${COICOP.length} categories)\n`);

  console.log('Yahoo Finance — asset series');
  await buildAssets();
  console.log('\ndone.');
};

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
