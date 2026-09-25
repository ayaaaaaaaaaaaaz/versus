/**
 * Reconstructs ENAGrup's E-TÜFE series from the Internet Archive.
 *
 *   node scripts/harvest-enag.mjs
 *
 * ENAGrup publishes an independent consumer price index for Türkiye that runs
 * well above the official TÜİK figure. They do not offer an API, a CSV or a
 * historical table, and as of late 2025 their site stopped responding
 * (Cloudflare 525). What does exist is the Internet Archive: their homepage was
 * captured regularly from 2020 onward, and each capture states that month's
 * E-TÜFE change and the running twelve-month rate.
 *
 * So each observation here is scraped from one dated archived page, and the
 * archive URL it came from is kept alongside it. Nothing is interpolated: a
 * month with no usable capture is simply absent, and the app must cope with
 * the gaps rather than paper over them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/enag.json');

/**
 * Months the archive has no usable capture for, taken instead from contemporary
 * press reports of ENAGrup's announcement. Each carries the outlet it came from
 * so its provenance stays distinguishable from the scraped observations: these
 * are second-hand, and the app labels them as such.
 *
 * 2023 is the notable hole — the archive captured nothing usable for that year,
 * and without a December anchor the year-end chain cannot bridge 2022 to 2024.
 */
const PRESS_ANCHORS = [
  {
    month: '2023-11', monthlyPct: 5.58, annualPct: 129.27, via: 'press',
    source: 'https://t24.com.tr/haber/enag-aralik-ayi-enflasyonunu-acikladi,1145817',
    capturedAt: '2023-12-04',
  },
  {
    month: '2023-12', monthlyPct: 4.12, annualPct: 127.21, via: 'press',
    source: 'https://www.evrensel.net/haber/507200/tuike-gore-yillik-enflasyon-64-77-oldu-enag-ise-127-21-olarak-acikladi',
    capturedAt: '2024-01-03',
  },
];

const MONTHS = ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];
const norm = (s) => s.toLocaleLowerCase('tr').replace('i̇', 'i').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Some networks sit behind a filtering proxy that answers with its own block
 * page and an HTTP 200. That is a transport failure wearing a success code, so
 * it has to be detected by content or the harvest silently drops those months.
 */
const BLOCKED = /e2guardian|Access Denied|Temporarily Offline|Too Many Requests/i;

class Blocked extends Error {}

async function withRetry(fn, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === tries - 1) throw err;
      // Longer backoff for a filter or rate limit than for a plain error.
      await sleep((err instanceof Blocked ? 2500 : 700) * (i + 1));
    }
  }
}

/** Closest capture to a given date, via the Wayback availability API. */
async function closestSnapshot(stamp) {
  return withRetry(async () => {
    const res = await fetch(`http://archive.org/wayback/available?url=enagrup.org&timestamp=${stamp}`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`availability HTTP ${res.status}`);
    const raw = await res.text();
    if (BLOCKED.test(raw)) throw new Blocked('availability blocked upstream');
    const body = JSON.parse(raw);
    return body?.archived_snapshots?.closest?.timestamp ?? null;
  });
}

/** Pulls the stated month, its change and the twelve-month rate out of one capture. */
async function readSnapshot(stamp) {
  const url = `http://web.archive.org/web/${stamp}id_/https://enagrup.org/`;
  const html = await withRetry(async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(40_000) });
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    const body = await res.text();
    if (BLOCKED.test(body) || body.length < 1500) throw new Blocked(`snapshot blocked: ${stamp}`);
    return body;
  });

  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const monthly = text.match(/Endeksi\s+(\S+)\s+ay[ıi]nda\s+%?\s*([\d.,]+)\s+artt/i);
  const annual = text.match(/12\s+ayl[ıi]k\s+art[ıi][şs]\s+oran[ıi]\s*%?\s*([\d.,]+)/i);
  if (!monthly) return null;

  const idx = MONTHS.indexOf(norm(monthly[1]));
  if (idx < 0) return null;

  const num = (s) => Number(String(s).replace(/\./g, '.').replace(',', '.'));

  // The capture's own date tells us the year. A page captured in January that
  // reports "Aralık" is reporting the previous December.
  const capYear = Number(stamp.slice(0, 4));
  const capMonth = Number(stamp.slice(4, 6));
  const year = idx + 1 > capMonth ? capYear - 1 : capYear;

  return {
    month: `${year}-${String(idx + 1).padStart(2, '0')}`,
    monthlyPct: num(monthly[2]),
    annualPct: annual ? num(annual[1]) : null,
    source: `https://web.archive.org/web/${stamp}/https://enagrup.org/`,
    capturedAt: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
  };
}

async function mapLimit(items, limit, fn, gapMs = 0) {
  const out = [];
  const failures = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const mine = i++;
        try {
          out.push(await fn(items[mine]));
        } catch (err) {
          failures.push({ item: items[mine], reason: err.message });
          out.push(null);
        }
        if (gapMs) await sleep(gapMs);
      }
    }),
  );
  out.failures = failures;
  return Object.assign(out.filter(Boolean), { failures });
}

/** Previously harvested months, so repeated runs accumulate rather than restart. */
function loadExisting() {
  try {
    return JSON.parse(readFileSync(OUT, 'utf8')).observations ?? [];
  } catch {
    return [];
  }
}

const main = async () => {
  // Probe one date per month across ENAG's publishing life.
  const probes = [];
  for (let y = 2020; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2020 && m < 9) continue;
      if (y === 2026 && m > 9) continue;
      probes.push(`${y}${String(m).padStart(2, '0')}12`);
    }
  }
  console.log(`probing ${probes.length} months for captures...`);

  const stamps = await mapLimit(probes, 3, closestSnapshot, 120);
  const unique = [...new Set(stamps)].sort();
  console.log(`  ${unique.length} distinct captures (${stamps.failures.length} probe failures)`);

  console.log('reading captures...');
  const rows = await mapLimit(unique, 2, readSnapshot, 350);
  console.log(`  ${rows.length} parsed, ${rows.failures.length} failed`);

  // One month can appear in several captures; keep the earliest capture of each,
  // which is the one closest to the original announcement.
  const byMonth = new Map();
  // Archive observations win over press anchors for any month both cover.
  const scraped = [...loadExisting().filter((o) => o.via !== 'press'), ...rows];
  const merged = [...scraped, ...PRESS_ANCHORS.filter((a) => !scraped.some((o) => o.month === a.month))];
  for (const r of merged.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, r);
  }

  const observations = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  console.log(`  ${observations.length} distinct months parsed`);

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        meta: {
          source: 'ENAGrup (Enflasyon Araştırma Grubu), E-TÜFE',
          provenance: 'via alanı "press" olan gözlemler, arşivde kullanılabilir yakalama bulunmadığı için dönemin basın haberlerinden alınmıştır; diğerleri doğrudan arşivlenmiş enagrup.org sayfasından okunmuştur.',
          collection: 'Internet Archive üzerinden arşivlenmiş enagrup.org ana sayfası yakalamalarından derlendi.',
          why: 'ENAGrup bir API, CSV veya geçmiş veri tablosu yayımlamıyor ve sitesi 2025 sonundan beri erişilemiyor. Her gözlem tarihli tek bir arşiv sayfasından okunmuştur ve kaynağı yanında saklanır.',
          caveat: 'Bağımsız bir grubun kendi yöntemiyle hesapladığı endekstir; resmî istatistik değildir. Kapsam ENAGrup’un yayına başladığı 2020’den itibarendir ve arşivde yakalama bulunmayan aylar eksiktir — eksik aylar doldurulmaz.',
          harvestedAt: new Date().toISOString().slice(0, 10),
          minMonth: observations[0]?.month ?? null,
          maxMonth: observations.at(-1)?.month ?? null,
          count: observations.length,
        },
        observations,
      },
      null,
      1,
    ) + '\n',
  );

  console.log(`\nwrote ${OUT}`);
  const withAnnual = observations.filter((o) => o.annualPct != null);
  const press = observations.filter((o) => o.via === 'press');
  console.log(`  ${observations.length} months, ${withAnnual.length} with a 12-month rate, ${press.length} from press`);
  console.log(`  ${observations[0]?.month} -> ${observations.at(-1)?.month}`);
};

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
