# Versus

Tek sayfalık bir uygulama: bir tutar ve bir yıl girin, enflasyonun Türk Lirası'nın
alım gücünü ne kadar erittiğini görün.

**Her hesaplama iki kaynaktan biriyle yapılabilir** — TÜİK (resmî) ya da ENAG
(bağımsız) — veya ikisi aynı grafikte karşılaştırılabilir. Seçim uygulama
genelindedir: hesap makinesi, grafik, ürün sepeti, varlık karşılaştırması ve
kişisel sepet hepsi aynı seçimi okur.

Beş soruyu yanıtlar:

1. **Bugünkü karşılığı ne?** — TÜFE ile düzeltilmiş nominal tutar.
2. **Senin enflasyonun ne?** — kendi harcama dağılımınızı girin, resmî sepetle
   aynı yöntemden geçirilip karşılaştırılsın.
3. **Ne yapsaydınız?** — altın, dolar, euro, BİST 100 ve yastık altı; hepsi
   enflasyondan arındırılmış reel getiriyle.
4. **O gün ne alırdı, bugün ne alıyor?** — referans ürün sepetiyle karşılaştırma.
5. **Değer nasıl gitti ve neden?** — aylık çözünürlüklü erime eğrisi, üzerinde
   krizlerin ve politika dönüşlerinin işaretlendiği zaman çizelgesiyle.

---

## Hızlı başlangıç

```bash
npm install
npm run dev
```

`http://localhost:5173` açılır. Uygulama, paketlenmiş veriyle tek başına çalışır —
API anahtarı ya da sunucu gerekmez.

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm test` | Vitest (hesaplama ve biçimlendirme testleri) |
| `npm run typecheck` | Hem uygulama hem Function tarafı |
| `npm run build` | Üretim derlemesi (`dist/`) |
| `npm run build:data` | World Bank, Eurostat ve Yahoo serilerini yeniler |
| `npm run harvest:enag` | ENAG serisini Internet Archive'dan yeniden derler |
| `npm run api` | Pages Functions'ı yerelde 8787'de çalıştırır |
| `npm run deploy` | Cloudflare Pages'e yayımlar |

---

## Veri

### Hesaplamaların dayandığı seriler — gerçek ve doğrulanmış

`src/data/series.json`, World Bank Open Data API'sinden üretilir ve
`npm run build:data` ile yenilenir. İçeriği:

| Seri | Kaynak | Kapsam |
| --- | --- | --- |
| TÜFE endeksi (yıllık) | World Bank `FP.CPI.TOTL` | 1960–2025, yıllık ortalama |
| USD/TRY, EUR/TRY (yıllık) | World Bank `PA.NUS.FCRF` | 1960–2025 / 1999–2025 |
| HICP endeksi (aylık) | Eurostat `prc_hicp_midx` | 1996-01–2025-12, 360 ay |
| 12 COICOP harcama grubu | Eurostat `prc_hicp_midx` | 1996-01–2025-12, her biri aylık |
| Resmî sepet ağırlıkları | Eurostat `prc_hicp_inw` | 2025, toplamı %100 |
| USD/TRY, EUR/TRY (aylık) | Yahoo `TRY=X`, `EURTRY=X` | 2005-02–2026-09 |
| BİST 100 (aylık) | Yahoo `XU100.IS` | 1997-06–2026-09 |
| Altın (aylık) | Yahoo `GC=F` → gram/TL | 2000-09–2026-09 |

Hiçbiri API anahtarı, kayıt veya ödeme gerektirmez. World Bank ve Eurostat
`access-control-allow-origin: *` gönderir; Yahoo göndermez, bu yüzden yalnızca
derleme zamanında Node içinden çağrılır ve çalışma anında tarayıcı Yahoo'ya hiç
dokunmaz.

**Çapraz doğrulama.** Eurostat'ın yıllık ortalama oranları, World Bank serisiyle
neredeyse birebir örtüşür (2022: %72,3'e karşı %72,31; 2025: %34,9'a karşı
%34,88). Aylık seriden türetilen yıl sonu oranları da TÜİK'in manşet
rakamlarını verir: 2021 için %36,08, 2024 için %44,41. Bu kontroller testlerde
otomatik olarak çalışır.

**Kıyaslama (benchmarking).** Aylık endeks ile yıllık endeks aynı şeyin iki ayrı
ölçümüdür; yakın dönemlerde %0,2'den az, 2000–2020 gibi uzun aralıklarda ise
yaklaşık %7 ayrışırlar. Bu yüzden aylık eğri ham haliyle çizilmez: şekli
korunur, ancak logaritmik olarak dağıtılan düzgün bir düzeltmeyle iki uç da
yıllık seriye sabitlenir. Böylece grafik, manşet rakamın gösterdiği yerden başka
bir yerde bitemez.

Paketteki yıllık enflasyon oranları, uygulamanın kullandığı endeksten türetilir;
World Bank'in ayrıca yayımladığı `FP.CPI.TOTL.ZG` serisiyle iki ondalık basamağa
kadar örtüştüğü testlerle doğrulanır.

> **Yıllık ortalama vs. yıl sonu.** Buradaki oranlar yıllık **ortalama** esaslıdır:
> bir yılın on iki ayının ortalaması, önceki yılın ortalamasıyla karşılaştırılır.
> TÜİK'in her ocak açıkladığı manşet rakam ise **yıl sonu** esaslıdır. İkisi de
> doğrudur, farklı soruları yanıtlarlar — örneğin 2022 için yıl sonu %64,3,
> ortalama esaslı değişim %72,3. Bir yıl boyunca elde tutulan paranın alım gücü
> için ortalama esas daha uygun olduğundan o tercih edildi.

### ENAG — bağımsız endeks

`src/data/enag.json`, ENAGrup'un E-TÜFE serisidir ve diğerlerinden farklı bir
yolla elde edilmiştir. ENAGrup bir API, CSV veya geçmiş veri tablosu
yayımlamıyor; sitesi de 2025 sonundan beri yanıt vermiyor (Cloudflare 525).

`npm run harvest:enag`, Internet Archive'da arşivlenmiş enagrup.org
yakalamalarını tek tek okuyup her ayın açıklanan oranını çıkarır. **Her gözlem,
alındığı arşiv sayfasının adresiyle ve yakalama tarihiyle birlikte saklanır.**
Arşivde kullanılabilir yakalama bulunmayan aylar — özellikle 2023'ün tamamı —
dönemin basın haberlerinden alınmış ve `via: "press"` olarak ayrıca
işaretlenmiştir.

Hiçbir ay tahminle doldurulmaz. Eksik aylar eksik kalır; bu yüzden endeks aylık
zincirleme yerine **aralık-aralık** kurulur: her aralık ayının açıkladığı
12 aylık oran bütün yılı tek seferde ifade ettiğinden, bir yıl ya tam kapsanır
ya da hiç kapsanmaz — eksik bir ay sessizce sıfır enflasyon sayılamaz.

| Yıl sonu | TÜİK | ENAG |
| --- | --- | --- |
| 2021 | %36,1 | %82,8 |
| 2022 | %64,3 | %137,6 |
| 2023 | %64,9 | %127,2 |
| 2024 | %44,4 | %83,4 |
| **Kümülatif 2020→2024** | **5,32x** | **18,10x** |

Harvester, ağdaki içerik filtrelerinin HTTP 200 ile döndürdüğü engelleme
sayfalarını içeriğinden tanır ve geri çekilerek yeniden dener; çalıştırmalar
birikimlidir, yani kısmi bir tur bir sonrakinde tamamlanır.

### Kişisel sepet

Kişisel enflasyon, resmî alt endekslerin yeniden ağırlıklandırılmasıyla
hesaplanır: fiyat nispilerinin ağırlıklı aritmetik ortalaması — istatistik
kurumlarının kullandığı Laspeyres biçimi. Kullanıcının dağılımı ve resmî
dağılım **aynı fonksiyondan** geçer, dolayısıyla aradaki fark yalnızca
ağırlıklardan gelir.

Bu *dağılım etkisi* tek başına ölçülüdür: gerçekçi bir dağılım resmî orandan
genelde birkaç puan sapar (kirada bir şehirli için ~%1,5). Uç dağılımlarda
belirginleşir — yalnızca yeme-içme + gıda %27 yüksek, yalnızca giyim + iletişim
%68 düşük.

Asıl büyük fark ağırlıklardan değil, **hangi genel seviyeyi doğru kabul
ettiğinizden** doğar. Sonuç kartındaki TÜİK/ENAG düğmesi bunu değiştirir.
ENAGrup alt harcama gruplarını yayımlamadığı için dağılımınızın etkisi yine
resmî alt endekslerden hesaplanır; yalnızca genel seviye ENAG ölçümüyle
değiştirilir. Bu bir koşullu senaryodur ve arayüzde böyle etiketlenir:
“genel enflasyon ENAG'ın ölçtüğü kadarsa, benim sepetim bu kadar arttı.”

### Olay zaman çizelgesi — elle derlenmiş

`src/data/events.json` elle yazılmıştır. Tarihler kamuya açık ve iyi belgelenmiş
olaylara aittir, açıklamalar olgusaldır. İşaretler **nedensellik iddiası
taşımaz**; hangi olayın enflasyona ne kadar yol açtığı tartışmalıdır.

### Ürün sepeti — tahminî

`src/data/basket.json` **elle derlenmiştir ve temsilîdir.** Resmî bir fiyat
serisinden çekilmez. Büyüklük hissi vermek içindir, kaynak gösterilecek bir fiyat
tarihi değildir. Arayüzde de bu şekilde etiketlenir.

Referans yıllar 1990, 2000, 2005, 2010, 2015, 2020, 2025'tir; aradaki yıllar iki
referansa da sadık kalacak biçimde TÜFE eğrisi izlenerek türetilir ve kartlarda
*tahmini* olarak işaretlenir.

Kalemler kur serisine karşı çapraz kontrol edilmiştir: her fiyat, o yılın gerçek
kuruyla dolara çevrildiğinde makul ve istikrarlı bir aralıkta kalır (ekmek
$0,18–0,47; Big Mac $2,07–4,82 — gerçek Big Mac endeksiyle uyumlu).

### Kapsam sınırı

Paketlenmiş seri **2025 yılına kadardır**, çünkü World Bank'in yayımladığı son
tam yıl budur. Uygulamadaki "bugün", EVDS bağlı değilken 2025 yıllık ortalamasıdır
ve arayüzde bu şekilde etiketlenir. EVDS bağlandığında seri içinde bulunulan yıla
kadar uzar.

---

## Mimari

Her şey tarayıcıda çalışır. Sunucu, veritabanı, hesap ve takip yok.

### Veri kaynağı soyutlaması

Kaynaklar `src/lib/sources.ts` içinde ortak bir arayüzün arkasında tanımlanır:

```ts
interface SourceDefinition {
  id, label, description, basis, minYear, maxYear,
  sourceName, sourceUrl, lastUpdated, accent,
  index(year): number | null,       // kendi esasında
  yearEndIndex(year): number | null // kaynaklar arası karşılaştırma için
}
```

Üçüncü bir kaynak eklemek, `SOURCES` kaydına bir nesne eklemekten ibarettir;
hiçbir bileşen değişmez. Toggle, altbilgi atıfları, karşılaştırma grafiği ve
kapsam uyarıları listeden otomatik türer.

Seçim `SourceContext` ile uygulama genelindedir ve adres çubuğunda `view`
parametresinde tutulur, yani bir karşılaştırma bağlantısı paylaşılabilir.
Bileşenler kendi kaynak durumlarını tutmaz: `useSource()` okur.

Türetilmiş rakamların tamamı tek bir `metricsFor(source, from, to)` çağrısından
gelir; böylece bir bileşenin seçilenden başka bir kaynağı anlatması mümkün
değildir.

**Yıl seçiciler seçili kaynağın kapsamını izler.** `selectableBounds()` aktif
kaynağın (karşılaştırmada ise tüm kaynakların kesişiminin) sınırlarını verir;
`clampSpan()` kaynak değiştiğinde saklı yılları bu aralığa çeker ve adres
çubuğunu günceller; `rangePresets()` kısayolları aralıktan türetir, böylece dar
bir kaynak fiyatlayamayacağı bir yıl önermez. Kapsanmayan bir dönem artık
seçilemez — daha önce bu durum sessizce "değişim yok" olarak görünüyordu;
savunma amacıyla kalan durumda da arayüz açıkça kapsam dışı olduğunu söyler.

### Esas (basis) meselesi

Resmî seri doğal olarak **yıllık ortalama**, ENAG serisi ise
**aralık-aralık** esasındadır. Karşılaştırma görünümü ikisini de
aralık-aralık esasına getirir — aksi hâlde görünen farkın bir kısmı ölçümden
değil yöntemden gelirdi. Bu, arayüzde de belirtilir.

Tek istisna `functions/api/live.ts` — bir Cloudflare **Pages Function**. Yalnızca
iki sebeple var:

1. TCMB EVDS bir API anahtarı ister; anahtar tarayıcıya gönderilemez.
2. Ne EVDS ne de `tcmb.gov.tr` CORS başlığı gönderir; tarayıcı anahtarla bile
   doğrudan çağıramaz.

Ayrı bir Worker yerine Pages Function tercih edildi: aynı Workers çalışma zamanı,
ama statik siteyle birlikte tek komutla yayımlanır ve aynı origin'den servis
edildiği için ek bir CORS adımı gerekmez.

**Bu Function isteğe bağlıdır.** Yoksa, anahtar tanımlı değilse ya da EVDS
yanıt vermezse uygulama paketlenmiş veriyle sorunsuz çalışmaya devam eder;
yalnızca en güncel yılı eklemez. `useLiveData` bu durumları sessizce yutar ve
başlıktaki rozet durumu gösterir.

EVDS'nin TÜFE serisi 2003 = 100 tabanlıdır, paketteki seri ise 2010 = 100. İkisi
sabit bir katsayıyla değil, her iki serinin de kapsadığı bir yıldaki orana göre
**zincirleme** birleştirilir; böylece taban değişse de doğru kalır.

```
src/
  data/       series.json (üretilmiş) · basket.json (elle derlenmiş)
  lib/        inflation.ts · basket.ts · format.ts · series.ts
  components/ Controls · Headline · ErosionChart · Basket · Methodology · ...
  hooks/      useLiveData (EVDS) · useUrlState (paylaşılabilir bağlantı)
functions/
  api/live.ts EVDS + TCMB proxy'si
scripts/
  build-data.mjs World Bank'ten veri üretir
```

---

## Yayımlama

Cloudflare Pages'e, ücretsiz katmanda, kart bilgisi olmadan:

```bash
npm run deploy
```

EVDS bağlamak isterseniz (isteğe bağlı) — `evds2.tcmb.gov.tr` üzerinden ücretsiz
kayıt olup anahtar alın, sonra:

```bash
npx wrangler pages secret put EVDS_API_KEY
```

Yerelde Functions'ı denemek için iki terminal:

```bash
npm run build && npm run api
```

```bash
npm run dev
```

Vite, `/api` isteklerini `127.0.0.1:8787`'e yönlendirir.

---

## Notlar

- Tutar alanı hem Türkçe (`1.000` = bin, `1,5` = birbuçuk) hem İngilizce
  (`1,234.56`) yazımı kabul eder.
- 2005 öncesi bir yıl seçildiğinde, altı sıfır atılmasını yöneten bir anahtar
  belirir: `1.000.000 TL` → `1 ₺`.
- Girdiler adres çubuğunda tutulur, yani bir sonuç paylaşılabilir.
- `prefers-reduced-motion` desteklenir.

Versus bir bilgilendirme aracıdır, yatırım tavsiyesi değildir. TÜFE bir
ortalamadır ve hiçbir hanenin harcama sepetiyle birebir örtüşmez.
