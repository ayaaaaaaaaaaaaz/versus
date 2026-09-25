import { readJsonStat } from './jsonstat.mjs';

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const WORLDBANK = 'https://api.worldbank.org/v2';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

export const COICOP = ['CP01','CP02','CP03','CP04','CP05','CP06','CP07','CP08','CP09','CP10','CP11','CP12'];

const round = (n, p = 8) => (n == null ? null : Number(n.toPrecision(p)));

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 110)}`);
  return res.json();
}

/** World Bank annual indicator -> { year: value }. */
export async function worldBank(country, indicator) {
  const body = await getJson(`${WORLDBANK}/country/${country}/indicator/${indicator}?format=json&per_page=400`);
  if (!Array.isArray(body) || !body[1]) throw new Error(`${indicator}: unexpected payload`);
  const values = {};
  for (const row of body[1]) if (row.value != null) values[Number(row.date)] = row.value;
  return { values, lastUpdated: body[0].lastupdated };
}

/**
 * Eurostat HICP. Turkey is a candidate country, so Eurostat publishes a
 * harmonised monthly index for it with the full COICOP breakdown — free, no
 * key, and it sends `access-control-allow-origin: *`.
 */
export async function eurostat(dataset, params) {
  const qs = new URLSearchParams({ geo: 'TR', format: 'JSON', lang: 'EN' });
  for (const [k, v] of Object.entries(params)) {
    for (const item of [].concat(v)) qs.append(k, item);
  }
  return readJsonStat(await getJson(`${EUROSTAT}/${dataset}?${qs}`));
}

/** Monthly HICP index for one or more COICOP codes -> { code: { 'YYYY-MM': value } }. */
export async function hicpMonthly(codes) {
  const stat = await eurostat('prc_hicp_midx', { unit: 'I15', coicop: codes });
  const months = stat.axes.find((a) => a.id === 'time').codes;
  const out = {};
  for (const code of codes) {
    const series = {};
    for (const time of months) {
      const v = stat.get({ freq: 'M', unit: 'I15', coicop: code, geo: 'TR', time });
      if (v != null) series[time] = round(v);
    }
    out[code] = series;
  }
  return out;
}

/** Official HICP basket weights, per mille, latest available year. */
export async function hicpWeights(codes) {
  const stat = await eurostat('prc_hicp_inw', { coicop: codes, sinceTimePeriod: '2023' });
  const years = stat.axes.find((a) => a.id === 'time').codes;
  const year = years.at(-1);
  const weights = {};
  for (const code of codes) {
    const v = stat.get({ freq: 'A', coicop: code, geo: 'TR', time: year });
    if (v != null) weights[code] = round(v / 10, 6); // per mille -> percent
  }
  return { year, weights };
}

/**
 * Yahoo Finance monthly closes -> { 'YYYY-MM': close }.
 * Called only at build time from Node, so CORS is not a concern here; the
 * runtime never touches Yahoo.
 */
export async function yahooMonthly(symbol) {
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?range=max&interval=1mo`;
  const body = await getJson(url, { headers: { 'User-Agent': 'Mozilla/5.0 (versus build script)' } });
  const result = body.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: ${body.chart?.error?.description ?? 'no result'}`);
  const stamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out = {};
  for (let i = 0; i < stamps.length; i++) {
    if (closes[i] == null) continue;
    out[new Date(stamps[i] * 1000).toISOString().slice(0, 7)] = round(closes[i]);
  }
  return { values: out, currency: result.meta?.currency ?? null };
}
