import { BASKET, COICOP_WEIGHTS, basketMeta } from '../config/street-basket';
import foodPrices from '../data/food-prices.json';
import { CARRY_FORWARD_DAYS, MEANINGFUL_DAYS, streetMeta } from '../lib/street-index';
import { PriceDownload } from './StreetPanels';

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="panel rounded-2xl p-5 sm:p-6">
    <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
    <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-400">{children}</div>
  </div>
);

export function StreetMethodology() {
  const groups = [...new Set(BASKET.map((b) => b.coicop))];
  const covered = groups.reduce((s, g) => s + COICOP_WEIGHTS[g].weight, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Sepette ne var">
          <p>
            {BASKET.length} temel gıda kalemi. Her kalem, mağaza başına{' '}
            <strong className="text-ink-200">tek bir sabit ürüne</strong> bağlıdır — aynı marka, aynı
            ambalaj, her gün aynı şey ölçülür. Ürünler mağazaların kendi sitemap dosyalarından
            seçilmiştir; üç zincirde de robots.txt arama yollarını yasakladığı için ürün keşfi
            yapılmaz.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-ink-700/60">
            {groups.map((g) => {
              const members = BASKET.filter((b) => b.coicop === g);
              return (
                <div key={g} className="border-t border-ink-800 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3 bg-ink-950/40 px-3.5 py-1.5">
                    <span className="text-[11px] text-ink-300">{COICOP_WEIGHTS[g].label}</span>
                    <span className="font-mono text-[10px] tabular text-ink-500">
                      %{COICOP_WEIGHTS[g].weight.toFixed(2)} · {members.length} kalem
                    </span>
                  </div>
                  <div className="px-3.5 py-1.5 text-[11px] text-ink-500">
                    {members.map((m) => m.name).join(' · ')}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            Toplam ağırlık: tüketici sepetinin %{covered.toFixed(2)}’i. Gıda harcamasının tamamı
            değil; izlenen kalemlerin payı.
          </p>
        </Panel>

        <Panel title="Endeks nasıl hesaplanıyor">
          <p>
            Her kalem için <strong className="text-ink-200">Jevons</strong>: mağazaların kendi fiyat
            oranlarının geometrik ortalaması. Bir mağaza yalnızca <em>iki dönemde de</em> fiyatı
            varsa hesaba girer — bugünkü bir mağazayı başlangıçtaki başka bir mağazayla
            karşılaştırmak, zaman içindeki değişimi değil iki dükkân arasındaki farkı ölçerdi.
          </p>
          <p>
            Kalemler sonra harcama ağırlıklarıyla birleştirilir ve ağırlıklar mevcut kalemler
            üzerinden yeniden normalize edilir, böylece eksik bir kalem diğerlerini sulandırmaz.
          </p>
          <p>
            Eksik fiyatlar <strong className="text-ink-200">{CARRY_FORWARD_DAYS} gün</strong> ileri
            taşınır — bir dükkânın birkaç gün stok yenilememesi fiyat değişimi değildir — sonra kalem
            o günün hesabından tamamen çıkar; bayat bir fiyata donup kalmaz.
          </p>
          <p>
            Ana endeks <strong className="text-ink-200">normal raf fiyatlarını</strong> kullanır.
            İndirimli fiyatlar ayrıca saklanır ve ayrı bir seri olarak hesaplanabilir.
          </p>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Tarihsel seri neden resmî">
          <p>
            2013’ten bu yana uzanan çizgi <strong className="text-ink-200">TÜİK’in kendi madde
            fiyatlarıdır</strong>; bağımsız bir ölçüm değildir. Aynı sepet ve aynı ağırlıklarla, aynı
            yöntemden geçirilerek hesaplanır — tek fark, fiyatların kimden geldiğidir.
          </p>
          <p>
            Bu seri <strong className="text-ink-200">zincirleme</strong> kurulur: her ay yalnızca bir
            önceki ayla, ikisinin de kapsadığı kalemler üzerinden karşılaştırılır ve halkalar
            çarpılır. Sabit bir tabana bağlamak, TÜİK’in madde kapsamı düzensiz olduğu için 145 ayı
            17’ye düşürüyordu. Zincirleme, bileşim değişse de seriyi kırmaz — istatistik kurumlarının
            sabit taban yerine zincirleme kullanmasının sebebi de budur.
          </p>
          <p className="text-ink-500">
            Kaynakta ani sıçrayıp hemen geri dönen gözlemler işaretlenir ve dokundukları halkalardan
            çıkarılır; zincirleme bir endekste kötü bir ay hem bir halkayı şişirir hem sonrakini
            söndürür.
          </p>
        </Panel>

        <Panel title="Karşılaştırma neyle yapılıyor">
          <p>
            Manşet TÜFE ile değil, Eurostat’ın <strong className="text-ink-200">gıda ve alkolsüz
            içecekler</strong> alt endeksiyle (COICOP CP01). Bir market sepetini tüm kalemleri içeren
            bir endeksle karşılaştırmak, kiradaki ve yakıttaki hareketi ekmeğin fiyatına yazmak
            olurdu.
          </p>
        </Panel>

        <Panel title="Dürüst sınırlar">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-ink-200">Sepet dar.</strong> {BASKET.length} kalem, gıda
              harcamasının bir bölümü. Resmî sepet yüzlerce madde içerir.
            </li>
            <li>
              <strong className="text-ink-200">Yalnızca iki zincir, yalnızca online.</strong> Migros
              ve ŞOK’un internet fiyatları; pazar, bakkal ve indirim marketleri yok. A101 ve
              CarrefourSA bot koruması arkasında olduğu için toplanmıyor.
            </li>
            <li>
              <strong className="text-ink-200">Geçmiş çok kısa.</strong> Kendi ölçümümüz{' '}
              {streetMeta.firstDay ?? '—'} tarihinde başladı; {MEANINGFUL_DAYS} güne ulaşmadan
              grafiğe çizilmiyor.
            </li>
            <li>
              <strong className="text-ink-200">Grup içi ağırlıklar eşit.</strong> Alt grup toplamları
              resmîdir; grup içindeki dağılım, ürün düzeyinde yayımlanmış ağırlık olmadığı için
              izlenen kalemlere eşit bölünür. Tek keyfî adım budur.
            </li>
            <li>
              <strong className="text-ink-200">Ürün eşleşmeleri kusurlu.</strong> İki mağazanın aynı
              kalem için fiyatı ikiden fazla kat ayrışırsa bu genelde piyasa değil, bizim farklı
              ürünleri eşleştirmiş olmamızdır; bu durumlar işaretlenir.
            </li>
          </ul>
        </Panel>

        <Panel title="Kaynaklar">
          <ul className="space-y-1.5 font-mono text-[11px] text-ink-500">
            <li>
              TÜİK madde fiyatları · WFP/HDX üzerinden · {foodPrices.meta.licence} ·{' '}
              {foodPrices.meta.minMonth}–{foodPrices.meta.maxMonth}
            </li>
            <li>Eurostat prc_hicp_midx (CP01) · resmî gıda alt endeksi</li>
            <li>Ağırlıklar: {basketMeta.weightSource}</li>
            <li>Mağaza fiyatları: Migros, ŞOK · günlük · {streetMeta.observations} gözlem</li>
          </ul>
          <div className="mt-3 border-t border-ink-800 pt-3">
            <PriceDownload />
          </div>
        </Panel>
      </div>
    </div>
  );
}
