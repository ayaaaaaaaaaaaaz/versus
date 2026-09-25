import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  MEANINGFUL_DAYS,
  collectionDays,
  detectShrinkflation,
  itemMoves,
  readiness,
  streetMeta,
  toCsv,
} from '../lib/street-index';
import { formatPct, formatTRY } from '../lib/format';

/**
 * States what our own collection can and cannot yet say.
 *
 * A one-day index is a single point at 100. Drawn as a line it reads as "food
 * prices did not move", which is the opposite of the truth — nothing has been
 * measured yet. So the panel reports the state in words instead of letting a
 * flat line imply a finding.
 */
export function StreetReadiness() {
  const state = readiness();
  const pct = Math.min(100, (state.days / MEANINGFUL_DAYS) * 100);

  return (
    <div className="panel rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-100">Kendi ölçümümüz</h3>
        <span className="font-mono text-[11px] text-ink-500">
          {state.firstDay ?? '—'} → {state.lastDay ?? '—'}
        </span>
      </div>

      {state.meaningful ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          {state.days} günlük toplama yapıldı; endeks okunabilir durumda.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Şu ana kadar <strong className="text-ink-200">{state.days} gün</strong> veri toplandı.
            Bir fiyat endeksi ancak değişimi ölçebildiğinde bir şey söyler; tek günlük seri, fiyatlar
            sabit kaldığı için değil, <em>henüz hiçbir değişim ölçülmediği</em> için düz görünür. Bu
            yüzden kendi serimiz grafiğe {MEANINGFUL_DAYS} güne ulaşana kadar çizilmiyor — yalnızca
            başlangıç noktası işaretleniyor.
          </p>
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800/80">
              <motion.div
                className="h-full rounded-full bg-mint-400"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, pct)}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-600">
              <span>{state.days} gün</span>
              <span>{state.remaining} gün kaldı</span>
            </div>
          </div>
        </>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-700/40 pt-3 text-center">
        {[
          ['toplama günü', String(state.collected)],
          ['gözlem', String(streetMeta.observations)],
          ['başarısız', String(streetMeta.totalFailures)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt>
            <dd className="mt-0.5 font-mono text-sm tabular text-ink-200">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Ranked per-item movement since the base day. */
export function ItemMovesTable() {
  const moves = useMemo(() => itemMoves(), []);
  const state = readiness();

  if (!moves.length) {
    return (
      <div className="panel rounded-2xl px-5 py-10 text-center text-sm text-ink-400">
        Henüz karşılaştırılacak ikinci bir gün yok.
      </div>
    );
  }

  const flat = moves.every((m) => Math.abs(m.changePct) < 0.005);

  return (
    <div className="panel overflow-hidden rounded-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-800 bg-ink-950/50 text-[10px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-2.5 text-left font-medium">Kalem</th>
            <th className="px-4 py-2.5 text-right font-medium">İlk gün</th>
            <th className="px-4 py-2.5 text-right font-medium">Son gün</th>
            <th className="px-4 py-2.5 text-right font-medium">Değişim</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => (
            <motion.tr
              key={m.itemId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className="border-t border-ink-800/70"
            >
              <td className="px-4 py-2 text-ink-200">
                {m.name}
                <span className="ml-2 font-mono text-[10px] text-ink-600">
                  {m.stores.join('+')}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-mono text-xs tabular text-ink-500">
                {formatTRY(m.basePrice)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-xs tabular text-ink-300">
                {formatTRY(m.latestPrice)}
              </td>
              <td
                className={`px-4 py-2 text-right font-mono text-xs tabular ${
                  m.changePct > 0.005 ? 'text-ember-400' : m.changePct < -0.005 ? 'text-mint-400' : 'text-ink-500'
                }`}
              >
                {m.changePct >= 0 ? '+' : ''}
                {formatPct(m.changePct, 1)}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {flat && (
        <p className="border-t border-ink-800 px-4 py-2.5 text-[11px] leading-relaxed text-ink-500">
          Tüm değişimler sıfır: yalnızca {state.days} günlük veri var, yani ilk gün aynı zamanda son
          gün. Bu tablo ikinci toplama gününden itibaren anlam kazanır.
        </p>
      )}
    </div>
  );
}

/** Packs that shrank while the shelf price held. */
export function ShrinkflationList() {
  const events = useMemo(() => detectShrinkflation(), []);

  return (
    <div className="panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-ink-100">Küçülen paketler</h3>
      <p className="mt-2 text-xs leading-relaxed text-ink-400">
        Raf fiyatı sabit kalırken paket küçülürse, etikette hiçbir şey değişmiş görünmez ama kilo
        başına fiyat artar. Bu liste, aynı mağazadaki aynı ürünü gün gün izleyerek bu durumu yakalar.
      </p>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-ink-700/60 bg-ink-950/40 px-4 py-3 text-xs text-ink-500">
          Henüz küçülme tespit edilmedi. Bunun için aynı ürünün en az iki farklı günde ölçülmüş
          olması gerekir.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((e) => (
            <li
              key={`${e.itemId}-${e.store}-${e.to.date}`}
              className="rounded-xl border border-ember-600/25 bg-ember-600/[0.07] px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-100">
                  {e.name} <span className="font-mono text-[10px] text-ink-500">{e.store}</span>
                </span>
                <span className="font-mono text-xs tabular text-ember-400">
                  kilo başına {e.unitPriceChangePct >= 0 ? '+' : ''}
                  {formatPct(e.unitPriceChangePct, 1)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] tabular text-ink-500">
                {e.from.quantity} → {e.to.quantity} · raf fiyatı {formatTRY(e.from.shelfPrice)} →{' '}
                {formatTRY(e.to.shelfPrice)} ₺ · {e.from.date} → {e.to.date}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Download the raw observations. Built in the browser, no endpoint needed. */
export function PriceDownload() {
  const onDownload = () => {
    const blob = new Blob([toCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `versus-sokak-fiyatlari-${streetMeta.lastDay ?? 'veri'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={onDownload}
      className="rounded-full border border-ink-700/70 px-3.5 py-1.5 text-xs text-ink-300 transition-colors hover:border-gold-500/50 hover:text-gold-300"
    >
      Ham veriyi indir (CSV · {streetMeta.observations} satır)
    </button>
  );
}

/** Per-day collection health, so a quiet failure is visible rather than implied. */
export function CollectionLog() {
  if (!collectionDays.length) return null;
  return (
    <div className="panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-ink-100">Toplama günlüğü</h3>
      <ul className="mt-3 space-y-1.5">
        {collectionDays.slice(-10).reverse().map((d) => (
          <li key={d.date} className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] tabular">
            <span className="text-ink-400">{d.date}</span>
            <span className="flex items-center gap-3">
              <span className={d.failed > 0 ? 'text-ember-400' : 'text-mint-400'}>
                {d.collected}/{d.attempted}
              </span>
              {d.divergences.length > 0 && (
                <span className="text-ink-600" title={d.divergences.join(', ')}>
                  {d.divergences.length} sapma
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
