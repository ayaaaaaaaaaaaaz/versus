import { assetMeta } from '../lib/assets';
import { basketMeta } from '../lib/basket';
import { enagMeta, yearEndComparison } from '../lib/enag';
import { eventMeta } from '../lib/events';
import { categoryMeta, monthlyMeta } from '../lib/monthly';
import { meta } from '../lib/series';
import { formatPct } from '../lib/format';
import type { LiveState } from '../hooks/useLiveData';

interface Props {
  live: LiveState;
}

function Source({
  name,
  href,
  detail,
  badge,
}: {
  name: string;
  href: string;
  detail: string;
  badge: string;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-ink-800/80 py-3.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-medium text-ink-100 underline decoration-ink-600 underline-offset-4 transition-colors hover:decoration-gold-500"
        >
          {name}
        </a>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{detail}</p>
      </div>
      <span className="shrink-0 rounded-full bg-ink-800/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-400">
        {badge}
      </span>
    </li>
  );
}

export function Methodology({ live }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel rounded-2xl p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-ink-100">Veri kaynakları</h3>
        <ul className="mt-2">
          <Source
            name="World Bank Open Data — FP.CPI.TOTL"
            href="https://data.worldbank.org/indicator/FP.CPI.TOTL?locations=TR"
            detail={`Türkiye TÜFE endeksi, ${meta.minYear}–${meta.maxYear}. Kaynağında TÜİK verisi derlenir. Hesaplamaların tamamı bu endekse dayanır.`}
            badge={`güncellenme ${meta.cpiLastUpdated}`}
          />
          <Source
            name="World Bank Open Data — PA.NUS.FCRF"
            href="https://data.worldbank.org/indicator/PA.NUS.FCRF?locations=TR"
            detail="Resmî döviz kuru, yıllık ortalama. Seri tüm yıllar için yeni lira cinsindendir."
            badge={`güncellenme ${meta.fxLastUpdated}`}
          />
          <Source
            name="Eurostat — prc_hicp_midx, prc_hicp_inw"
            href="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_midx/default/table"
            detail={`Aylık uyumlaştırılmış endeks (${monthlyMeta.minMonth}–${monthlyMeta.maxMonth}) ve 12 COICOP harcama grubu. Kişisel sepet ile aylık çözünürlüklü grafik buradan gelir. Anahtar gerekmez, CORS açıktır.`}
            badge={`ağırlıklar ${categoryMeta.weightYear}`}
          />
          <Source
            name="Yahoo Finance — TRY=X, EURTRY=X, XU100.IS, GC=F"
            href="https://finance.yahoo.com/quote/XU100.IS/"
            detail={assetMeta.basis + ' ' + assetMeta.caveat}
            badge={`paket ${assetMeta.generatedAt}`}
          />
          <Source
            name="TCMB EVDS + günlük kur bülteni"
            href="https://evds2.tcmb.gov.tr/"
            detail="API anahtarı gerektirir ve CORS başlığı göndermez; bu yüzden tek bir Cloudflare Pages Function üzerinden çağrılır. Yalnızca en güncel yılı eklemek için kullanılır."
            badge={
              live.status === 'extended' ? 'bağlı' : live.status === 'loading' ? 'deneniyor' : 'devrede değil'
            }
          />
        </ul>
        <p className="mt-4 border-t border-ink-800 pt-3 font-mono text-[11px] text-ink-600">
          Paket verisi {meta.generatedAt} tarihinde alındı · npm run build:data ile yenilenir
        </p>
      </div>

      <div className="space-y-4">
        <div className="panel rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-100">Neden gördüğünüz oran manşetten farklı?</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Buradaki tüm oranlar <strong className="text-ink-200">yıllık ortalama</strong> TÜFE esasına
            göredir: bir yılın on iki ayının ortalaması, bir önceki yılın ortalamasıyla karşılaştırılır.
            TÜİK'in her ocak ayında açıkladığı manşet rakam ise{' '}
            <strong className="text-ink-200">yıl sonu</strong> esasıdır: aralık ayının bir önceki aralığa
            göre değişimi.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            İkisi de doğrudur, farklı soruları yanıtlarlar. 2022 için yıl sonu TÜFE %64,3; aynı yılın
            ortalama esaslı değişimi %72,3. Bir yıl boyunca elde tutulan paranın alım gücü için ortalama
            esas daha uygundur, bu yüzden tercih edildi. Aylık seri eklendiğinden beri yıl sonu
            oranları da doğrulanabiliyor: 2021 için %36,1, 2024 için %44,4 — TÜİK'in açıkladığı
            manşet rakamlarla örtüşüyor.
          </p>
        </div>

        <div className="panel rounded-2xl border-gold-500/20 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gold-300">
            <span aria-hidden="true">⚠</span> Ürün sepeti tahminîdir
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">{basketMeta.disclaimer}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Referans yıllar: {basketMeta.benchmarkYears.join(', ')}. Aradaki yıllar TÜFE ile türetilir ve
            kartlarda <em>tahmini</em> olarak işaretlenir. TÜFE ve kur serileri bundan etkilenmez.
          </p>
        </div>

        <div className="panel rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-100">Kişisel sepet nasıl hesaplanır</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Kişisel enflasyon, alt endekslerin <strong className="text-ink-200">yeniden
            ağırlıklandırılmasıyla</strong> bulunur: fiyat nispilerinin ağırlıklı ortalaması, yani
            istatistik kurumlarının kullandığı Laspeyres biçimi. Sizin dağılımınız ve karşılaştırma
            sepeti aynı fonksiyondan geçer; aradaki fark yalnızca ağırlıklardan gelir.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Bu <em>dağılım etkisi</em> tek başına ölçülüdür: gerçekçi bir dağılım resmî orandan
            genelde birkaç puan sapar. Asıl büyük fark, hangi <strong className="text-ink-200">genel
            seviyeyi</strong> doğru kabul ettiğinizden doğar — kaynak düğmesinin yaptığı da budur.
            Uç dağılımlarda etki belirginleşir: yalnızca yeme-içme + gıda %27 yüksek, yalnızca giyim
            + iletişim %68 düşük çıkar.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Sabit ağırlıklı yeniden toplama, zincirlenmiş manşet endeksi birebir veremez; 2015–2025
            için fark yaklaşık %5'tir.
          </p>
        </div>

        <div className="panel rounded-2xl border-ember-600/20 p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-100">ENAG verisi nereden geliyor</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            ENAGrup, kendi yöntemiyle bağımsız bir tüketici fiyat endeksi (E-TÜFE) hesaplayan bir
            akademisyen grubudur ve düzenli olarak resmî rakamın belirgin üzerinde sonuç açıklar.
            Grup bir API, CSV veya geçmiş veri tablosu yayımlamıyor; sitesi de 2025 sonundan beri
            yanıt vermiyor.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Bu yüzden seri, <strong className="text-ink-200">Internet Archive'da arşivlenmiş
            enagrup.org yakalamalarından</strong> tek tek okunarak yeniden derlendi
            ({enagMeta.count} ay, {enagMeta.minMonth}–{enagMeta.maxMonth}). Her gözlem, alındığı
            arşiv sayfasının adresiyle birlikte saklanır. Arşivde kullanılabilir yakalama bulunmayan
            aylar — özellikle 2023 — dönemin basın haberlerinden alınmış ve{' '}
            <em>basın kaynaklı</em> olarak ayrıca işaretlenmiştir. Hiçbir ay tahminle
            doldurulmamıştır; eksik aylar eksik bırakılmıştır.
          </p>

          <div className="mt-3 overflow-hidden rounded-xl border border-ink-700/60">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 border-b border-ink-800 bg-ink-950/50 px-3.5 py-2 text-[10px] uppercase tracking-wider text-ink-500">
              <span>Yıl sonu</span>
              <span className="text-right">TÜİK</span>
              <span className="text-right">ENAG</span>
            </div>
            {yearEndComparison().map((row) => (
              <div
                key={row.year}
                className="grid grid-cols-[auto_1fr_1fr] gap-x-3 border-t border-ink-800 px-3.5 py-1.5 font-mono text-[11px] tabular first:border-t-0"
              >
                <span className="text-ink-400">{row.year}</span>
                <span className="text-right text-ink-200">
                  {row.official == null ? '—' : formatPct(row.official)}
                </span>
                <span className="text-right text-ember-400">
                  {row.enag == null ? '—' : formatPct(row.enag)}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            {enagMeta.caveat} Aralık-aralık esasına göre zincirlendiğinden, eksik bir ay sessizce
            sıfır enflasyon sayılmaz: bir yıl ya tam kapsanır ya da hiç kapsanmaz.
          </p>
        </div>

        <div className="panel rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-100">Olay işaretleri</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">{eventMeta.note}</p>
        </div>

        <div className="panel rounded-2xl p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-100">Altı sıfır meselesi</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">{meta.redenomination.note}</p>
        </div>
      </div>
    </div>
  );
}
