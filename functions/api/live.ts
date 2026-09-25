/**
 * Cloudflare Pages Function — the app's only server-side code.
 *
 * It exists for exactly two reasons:
 *   1. TCMB EVDS requires an API key, which must not ship to the browser.
 *   2. Neither EVDS nor tcmb.gov.tr sends CORS headers, so a browser cannot
 *      call them directly even with a key.
 *
 * Everything else in the app runs against bundled JSON plus the World Bank API,
 * which is key-free and sends `access-control-allow-origin: *`. So this endpoint
 * is an enhancement: it extends the bundled series past the last World Bank
 * year and adds a live daily FX rate. If it is absent or unconfigured, the app
 * still works — it just stops at the last annual observation.
 *
 * Deploy:  wrangler pages deploy dist
 * Secret:  wrangler pages secret put EVDS_API_KEY
 */

interface Env {
  EVDS_API_KEY?: string;
}

const EVDS_BASE = 'https://evds2.tcmb.gov.tr/service/evds';
const TCMB_XML = 'https://www.tcmb.gov.tr/kurlar/today.xml';

/**
 * Only these series are ever requested. The client cannot influence the
 * upstream URL, which keeps this from becoming an open proxy.
 */
const SERIES = {
  cpi: 'TP.FG.J0', // TÜFE genel endeks, 2003 = 100
  usd: 'TP.DK.USD.A.YTL', // USD alış
  eur: 'TP.DK.EUR.A.YTL', // EUR alış
} as const;

const json = (body: unknown, maxAge: number, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, stale-while-revalidate=86400`,
      'access-control-allow-origin': '*',
    },
  });

const pad = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

/** EVDS renames series in its response: TP.FG.J0 -> TP_FG_J0 */
function readSeriesValues(payload: unknown, seriesId: string): Record<string, number> {
  const field = seriesId.replace(/\./g, '_');
  const items = (payload as { items?: Record<string, unknown>[] })?.items;
  if (!Array.isArray(items)) return {};

  const out: Record<string, number> = {};
  for (const item of items) {
    const year = String(item.Tarih ?? '').slice(0, 4);
    const raw = item[field];
    const value = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
    if (/^\d{4}$/.test(year) && Number.isFinite(value) && value > 0) out[year] = value;
  }
  return out;
}

async function fetchEvdsAnnual(key: string, seriesId: string, startYear: number) {
  const url =
    `${EVDS_BASE}/series=${seriesId}` +
    `&startDate=01-01-${startYear}` +
    `&endDate=${ddmmyyyy(new Date())}` +
    `&type=json&frequency=8&aggregationTypes=avg&formulas=0`;

  const res = await fetch(url, {
    headers: { key, accept: 'application/json' },
    cf: { cacheTtl: 21_600, cacheEverything: true },
  } as RequestInit);

  if (!res.ok) throw new Error(`EVDS ${seriesId}: HTTP ${res.status}`);
  return readSeriesValues(await res.json(), seriesId);
}

/** Today's reference rates from TCMB's public bulletin. No key needed. */
async function fetchTodayFx(): Promise<{ usd: number | null; eur: number | null; asOf: string | null }> {
  const res = await fetch(TCMB_XML, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`TCMB XML: HTTP ${res.status}`);
  const xml = await res.text();

  const rateFor = (code: string): number | null => {
    const block = xml.match(new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`))?.[0];
    if (!block) return null;
    const selling = block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1];
    const buying = block.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/)?.[1];
    const mid = [selling, buying].map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!mid.length) return null;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
  };

  return {
    usd: rateFor('USD'),
    eur: rateFor('EUR'),
    asOf: xml.match(/Tarih="([\d.]+)"/)?.[1] ?? null,
  };
}

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const key = context.env.EVDS_API_KEY;
  const startYear = new Date().getFullYear() - 3;

  const notes: string[] = [];
  let cpi: Record<string, number> = {};
  let usd: Record<string, number> = {};
  let eur: Record<string, number> = {};

  if (key) {
    const [c, u, e] = await Promise.allSettled([
      fetchEvdsAnnual(key, SERIES.cpi, startYear),
      fetchEvdsAnnual(key, SERIES.usd, startYear),
      fetchEvdsAnnual(key, SERIES.eur, startYear),
    ]);
    if (c.status === 'fulfilled') cpi = c.value;
    else notes.push('EVDS TÜFE alınamadı.');
    if (u.status === 'fulfilled') usd = u.value;
    if (e.status === 'fulfilled') eur = e.value;
  } else {
    notes.push('EVDS_API_KEY tanımlı değil; yalnızca günlük TCMB kuru kullanılıyor.');
  }

  let today: Awaited<ReturnType<typeof fetchTodayFx>> = { usd: null, eur: null, asOf: null };
  try {
    today = await fetchTodayFx();
  } catch {
    notes.push('TCMB günlük kur bülteni alınamadı.');
  }

  return json(
    {
      ok: true,
      cpi, // TÜFE annual averages, 2003 = 100 — client chain-links onto the bundled index
      fx: { usd, eur },
      today,
      cpiBaseYear: 2003,
      source: 'TCMB EVDS (TP.FG.J0, TP.DK.USD.A.YTL, TP.DK.EUR.A.YTL) + TCMB günlük kur bülteni',
      fetchedAt: new Date().toISOString(),
      notes,
    },
    21_600,
  );
};

export const onRequestOptions = (): Response =>
  new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-max-age': '86400',
    },
  });
