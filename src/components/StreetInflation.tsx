import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import releases from '../data/official-releases.json';
import {
  FRESH_ITEMS,
  SALE_MAX_DAYS,
  annualise,
  buildDailyIndex,
  contributions,
  headlineIndex,
  isSettled,
  monthlyRates,
  readiness,
  type MonthlyRate,
} from '../lib/street-index';
import { formatPct } from '../lib/format';
import { Stat } from './Stat';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayName = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${SHORT[m - 1]}`;
};
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${formatPct(v, digits)}`;
const points2 = (v: number) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Official {
  food: number;
  headline: number;
  source: string;
}
const official = releases.months as Record<string, Official | undefined>;

interface Row {
  date: string;
  headline: number | null;
  core: number | null;
  posted: number | null;
}

/**
 * Every input is bundled JSON, so the whole model is a module constant, the
 * same way StreetChart builds its own.
 */
const MODEL = (() => {
  const state = readiness();
  const headline = headlineIndex();
  if (!headline.points.length || !headline.base) return null;
  // Both variants are anchored on the headline's base day so all three lines
  // are 100 on the same date, as the chart's label says.
  const core = buildDailyIndex(undefined, { exclude: FRESH_ITEMS, base: headline.base });
  // The discounted basis is what the page showed: ŞOK's promotional price
  // where it has one, and Migros's price as listed, sale or not.
  const posted = buildDailyIndex(undefined, { basis: 'discounted', base: headline.base });

  const coreBy = new Map(core.points.map((p) => [p.date, p.value]));
  const postedBy = new Map(posted.points.map((p) => [p.date, p.value]));
  const rows: Row[] = headline.points.map((p) => ({
    date: p.date,
    headline: p.value,
    core: coreBy.get(p.date) ?? null,
    posted: postedBy.get(p.date) ?? null,
  }));

  const rates = monthlyRates(headline.points);
  const coreRates = new Map(monthlyRates(core.points).map((r) => [r.month, r]));
  // The headline month is the latest one collection has finished; a month in
  // progress is shown in the table but never put up in large type.
  const focus = [...rates].reverse().find((r) => r.complete) ?? null;

  const last = headline.points.at(-1)!;
  const parts = contributions(last).filter((c) => Math.abs(c.points) >= 0.005);

  const settled = focus ? isSettled(focus, last.date) : false;
  const settlesOn = focus ? addDays(focus.to, SALE_MAX_DAYS) : null;

  return { state, rows, rates, coreRates, focus, settled, settlesOn, last, base: headline.base, parts };
})();

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const lines: [string, number | null, string][] = [
    ['Sokak endeksi', p.headline, 'text-mint-400'],
    ['Taze ürün hariç', p.core, 'text-gold-400'],
    ['Kampanyalar dahil', p.posted, 'text-ink-300'],
  ];
  return (
    <div className="rounded-xl border border-ink-600/70 bg-ink-900/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      <div className="font-mono text-xs font-medium text-ink-200">{p.date}</div>
      <div className="mt-1.5 space-y-1">
        {lines.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-5 text-xs">
            <span className="text-ink-400">{k}</span>
            <span className={`font-mono tabular ${tone}`}>{v == null ? '—' : points2(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RateTable({
  rates,
  coreRates,
  lastDate,
}: {
  rates: MonthlyRate[];
  coreRates: Map<string, MonthlyRate>;
  lastDate: string;
}) {
  return (
    <div className="panel overflow-hidden rounded-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-800 bg-ink-950/50 text-[10px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-2.5 text-left font-medium">Ay</th>
            <th className="px-4 py-2.5 text-right font-medium">Sokak</th>
            <th className="px-4 py-2.5 text-right font-medium">Taze hariç</th>
            <th className="px-4 py-2.5 text-right font-medium">TÜİK gıda</th>
          </tr>
        </thead>
        <tbody>
          {[...rates].reverse().map((r) => {
            const off = official[r.month];
            const c = coreRates.get(r.month);
            return (
              <tr key={r.month} className="border-t border-ink-800/70">
                <td className="px-4 py-2 text-ink-200">
                  {monthName(r.month)}
                  <span className="ml-2 font-mono text-[10px] text-ink-600">
                    {!r.complete
                      ? `${r.days} gün · sürüyor`
                      : `${r.method === 'average' ? 'ay ortalaması' : 'uçtan uca'}${isSettled(r, lastDate) ? '' : ' · geçici'}`}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs tabular text-mint-400">
                  {signed(r.changePct, 2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs tabular text-gold-400">
                  {c ? signed(c.changePct, 2) : '—'}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs tabular text-ink-300">
                  {off ? signed(off.food, 2) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-ink-800 px-4 py-2.5 text-[11px] leading-relaxed text-ink-500">
        Uçtan uca: ayın son günü, önceki ayın son gününe karşı. İki ay da en az 20 gün ölçüldüğünde
        TÜİK gibi ay ortalamaları karşılaştırılır. “Geçici” rakamlar, kampanya filtresinin ayın son
        günlerini kesinleştirmesi için gereken {SALE_MAX_DAYS} gün dolana kadar değişebilir. TÜİK sütunu, aylık bültenden elle girilir ve girildiği ay dolar.
      </p>
    </div>
  );
}

function Contributions({ parts, total }: { parts: ReturnType<typeof contributions>; total: number }) {
  const max = Math.max(...parts.map((p) => Math.abs(p.points)), 0.01);
  return (
    <div className="panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-ink-100">
        {total >= 100 ? 'Artışı kim getirdi' : 'Düşüşü kim getirdi'}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-ink-400">
        Endeksin 100’den {points2(total)} seviyesine {total >= 100 ? 'çıkışı' : 'inişi'}, her kalemin
        ağırlığı çarpı kendi değişimi olarak tam olarak paylaşılır. Çubuklar endeks puanıdır, toplamları başlıktaki rakamı verir.
      </p>
      <ul className="mt-4 space-y-1.5">
        {parts.map((p) => (
          <li key={p.itemId} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 text-xs">
            <span className="truncate text-ink-300" title={p.name}>{p.name}</span>
            <span className="relative h-2 rounded-full bg-ink-800/80">
              <motion.span
                className={`absolute inset-y-0 left-0 rounded-full ${p.points >= 0 ? 'bg-ember-400' : 'bg-mint-400'}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${(Math.abs(p.points) / max) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
            <span className={`text-right font-mono tabular ${p.points >= 0 ? 'text-ember-400' : 'text-mint-400'}`}>
              {p.points >= 0 ? '+' : ''}
              {points2(p.points)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Our own food inflation, from the prices we collected. */
export function StreetInflation() {
  if (!MODEL || !MODEL.state.meaningful) return null;
  const { state, rows, rates, coreRates, focus, settled, settlesOn, last, base, parts } = MODEL;

  const sinceStart = last.value - 100;
  const focusCore = focus ? coreRates.get(focus.month) : undefined;
  const focusOfficial = focus ? official[focus.month] : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={focus ? `${monthName(focus.month)} · aylık` : 'Aylık'}
          value={focus ? signed(focus.changePct) : '—'}
          hint={
            !focus
              ? 'İlk tam ay bekleniyor'
              : settled
                ? `${dayName(focus.from)} → ${dayName(focus.to)}`
                : `Geçici · kesinleşme ${dayName(settlesOn!)}`
          }
          tone="mint"
        />
        <Stat
          label="Taze ürün hariç"
          value={focusCore ? signed(focusCore.changePct) : '—'}
          hint="Sebze-meyve çıkarıldığında, aynı ay"
          tone="gold"
          delay={0.05}
        />
        <Stat
          label={focus ? `TÜİK gıda · ${MONTHS[Number(focus.month.slice(5)) - 1]}` : 'TÜİK gıda'}
          value={focusOfficial ? signed(focusOfficial.food) : '—'}
          hint={focusOfficial ? 'Aylık TÜFE bülteni' : 'Bülten eklenince görünür'}
          delay={0.1}
        />
        <Stat
          label="Başlangıçtan bu yana"
          value={signed(sinceStart)}
          hint={`${dayName(base)} → ${dayName(last.date)} · ${state.days} gün`}
          tone="ember"
          delay={0.15}
        />
      </div>

      {focus && (
        <div className="rounded-2xl border border-ink-700/60 bg-ink-950/40 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink-200">
            {monthName(focus.month)} ayında market rafındaki 25 kalemlik sepetimiz{' '}
            <strong className="text-mint-400">{signed(focus.changePct)}</strong>{' '}
            {focus.changePct >= 0 ? 'pahalandı' : 'ucuzladı'}
            {!settled && ' (geçici rakam: ayın son günlerindeki bir kampanya henüz ayıklanmamış olabilir)'}. Bu hız
            bir yıl sürseydi yıllık{' '}
            <span className="font-mono tabular text-ink-300">{signed(annualise(focus.changePct), 0)}</span>{' '}
            ederdi — ama tek bir ayı yıla çevirmek yanıltır, çünkü sebze-meyve fiyatları mevsimle
            sert oynar.
            {['10', '11'].includes(focus.month.slice(5)) &&
              ' Ekim-Kasım, tarla sezonunun bitip seradan gelen sebzeye geçildiği dönem; domates her yıl bu aylarda sıçrar.'}{' '}
            Bu yüzden taze ürün hariç rakam da yanında duruyor.
          </p>
        </div>
      )}

      <div className="panel rounded-3xl p-4 pt-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4 px-1 text-[11px]">
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-0.5 w-4 rounded bg-mint-400" /> Sokak endeksi
          </span>
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-0.5 w-4 rounded bg-gold-400" /> Taze ürün hariç
          </span>
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-0.5 w-4 rounded border-t border-dashed border-ink-400" /> Kampanyalar dahil
          </span>
          <span className="ml-auto font-mono text-ink-600">{dayName(base)} = 100</span>
        </div>
        <div className="mt-5 h-[260px] w-full sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-ink-800)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="var(--color-ink-600)"
                fontSize={11}
                fontFamily="var(--font-mono)"
                tickLine={false}
                minTickGap={28}
                tickFormatter={dayName}
              />
              <YAxis
                stroke="var(--color-ink-600)"
                fontSize={11}
                fontFamily="var(--font-mono)"
                tickLine={false}
                width={44}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip
                cursor={{ stroke: 'var(--color-ink-400)', strokeWidth: 1, strokeDasharray: '4 4' }}
                content={<Tip />}
              />
              <ReferenceLine y={100} stroke="var(--color-ink-600)" strokeDasharray="2 4" />
              <Line type="stepAfter" dataKey="posted" stroke="var(--color-ink-500)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} animationDuration={700} />
              <Line type="stepAfter" dataKey="core" stroke="var(--color-gold-400)" strokeWidth={2} dot={false} animationDuration={700} />
              <Line type="stepAfter" dataKey="headline" stroke="var(--color-mint-400)" strokeWidth={2.5} dot={false} animationDuration={700} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-500">
          Kesikli çizgi, sayfada o gün görünen fiyattır — ŞOK’un indirimli fiyatı dahil. Migros indirimli fiyatı ayrıca göstermediği
          için iki günlük bir tavuk kampanyası sepeti dört puan aşağı çeker, sonra geri iter. Ana
          çizgi bu geçici indirimleri ayıklar; yöntem aşağıda.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RateTable rates={rates} coreRates={coreRates} lastDate={last.date} />
        <Contributions parts={parts} total={last.value} />
      </div>
    </div>
  );
}
