# Kurumsal Mutabakat Protokolü (ISP)

## Giriş

Kurumsal Mutabakat Protokolü (ISP), bakiyeleri birbirleri arasında gerçek zamanlı olarak taşımak isteyen finansal kurumlar için bir mutabakat altyapısı olarak tasarlanmıştır. Amaç, kurumlar arası transferleri daha hızlı hale getirmek, 7/24 erişilebilir kılmak ve likidite ile operasyonel yönetimi kolaylaştırmaktır.

Günümüzde birçok bankalar arası transfer belirli zaman pencerelerinde çalışan sistemlere dayanmakta veya mutabakat tamamlanmadan önce birden fazla adıma ihtiyaç duymaktadır. ISP, onaylı kurumların bakiyelerini anlık olarak transfer edebildiği ortak bir altyapı oluşturarak bu süreci sadeleştirmeyi hedefler.

Sistem bireysel kullanıcılar için değil, finansal kurumlar için geliştirilmiştir. Bankalar ve regüle kuruluşlar ağa bağlanır ve bu ağı kendi aralarındaki transferler için bir mutabakat katmanı olarak kullanır.

Altyapı, işlemleri kaydetmek için Solana ağını kullansa da kurum deneyimi mevcut bankacılık sistemlerine benzer şekilde tasarlanmıştır. Kurumlar doğrudan blockchain cüzdanlarıyla etkileşmek yerine dashboard ve API’ler üzerinden işlem yapar.

## ISP Nedir?

ISP, yalnızca onaylı finansal kurumların katılabildiği izinli (permissioned) bir ağdır. Ağa katılan her kurum, erişim kazanmadan önce doğrulama ve onboarding sürecinden geçer.

Kurum onaylandıktan sonra sistem içinde beyaz listeye alınmış (whitelisted) bir cüzdan alır. Bu cüzdan, kurumun ağ içindeki bakiyesini ve pozisyonunu temsil eder.

Kurumların teknik cüzdan adresleriyle doğrudan etkileşmesi gerekmez. Transfer gönderirken alıcı kurum isim veya CVR numarasına göre aranır; sistem doğru hedefi otomatik belirler.

Bu yaklaşım operasyonel riski azaltır ve mevcut finansal iş akışlarına entegrasyonu kolaylaştırır.

## Sistem Nasıl Çalışır?

1. Kurum uyum ve onboarding sürecini tamamlar.
2. Onaylanan kurum, rezervleri tutan regüle iş ortağına fiat transfer ederek bakiye aktive eder.
3. Fonlar alındığında ISP içinde karşılık gelen dijital bakiye oluşturulur.
4. Kurumlar bu bakiyeyle diğer onaylı katılımcılara transfer gönderir.
5. Sistem transferi işler ve her iki bakiyeyi anında günceller.
6. Arka planda işlem mutabakat olayı olarak Solana katmanına kaydedilir.
7. Gerekirse kurum çekim talebiyle bakiyeyi yeniden fiat’a çevirebilir.

Kurum perspektifinde süreç, bankacılık platformundaki transfer deneyimine benzer olmalıdır.

## Kurumlar Arası Gizlilik

ISP ortak altyapı olsa da kurumların birbirlerinin tüm faaliyetlerini görmemesi esastır.

- Ağ genelinde takma adlı (pseudonymous) tanımlayıcılar görünür.
- İşleme taraf olmayan katılımcılar teknik adresleri görür, kurum kimliğini görmez.
- İşleme taraf kurumlar karşı taraf, tutar ve zaman bilgilerini tam görür.
- Yönetici, uyum ve gözetim ihtiyaçları için geniş görünürlüğe sahiptir.

Bu model ağ şeffaflığını korurken kurumsal gizliliği destekler.

## Yönetici ve Yönetişim

ISP ağı, sistemin sürdürülebilirliğinden sorumlu bir yönetici (administrator) rolü içerir.

Yönetici sorumlulukları:

- yeni kurum onboarding ve onay süreçleri
- katılımcı izin listesi yönetimi
- sistem istikrarı, uyumluluk ve operasyonel gözetim
- gerekli durumlarda dondurma, kısıtlama veya ağdan çıkarma

Yönetici görünürlüğü auditability, uyumluluk ve operasyonel kontrol için gereklidir.

## Neden Solana?

ISP mutabakat olaylarını kaydetmek için Solana ağını kullanır.

Gerekçeler:

- yüksek performans
- düşük gecikme ve maliyet
- doğrulanabilir, şeffaf kayıt defteri

Kurumlar Solana ile doğrudan etkileşime girmez; teknik entegrasyon protokol katmanında soyutlanır.

## Çözülmesi Hedeflenen Problemler

ISP’nin ele aldığı başlıca problemler:

- çalışma saatleri dışındaki bankalar arası transfer erişimi
- sürekli çalışmayan yapılarda likidite kilitlenmesi
- kurumlar arası fon taşıma süreçlerinde operasyonel karmaşıklık

7/24 çalışan ortak mutabakat altyapısı ile kurumlar likidite yönetiminde daha esnek hale gelir.

## Gelecek Yol Haritası

Uzun vadeli vizyon:

1. güvenilir kurumlar arasında istikrarlı mutabakat ağı kurmak
2. yeterli hacim ve güven seviyesinde regüle, çok para birimli stablecoin çerçevesini desteklemek
3. son kullanıcıda bankacılık deneyimine entegre, altyapısı görünmez dijital para katmanı oluşturmak

Bu yaklaşım kripto ürününden çok bankacılığa entegre dijital para altyapısı olarak konumlanır.

## Pilot Faz ve Geliştirme Yaklaşımı

İlk faz, az sayıda finansal kurumla pilot geliştirmeye odaklanır.

Amaç yalnızca teknolojiyi test etmek değil; kurumların gerçek operasyonel ihtiyaçlarına uyumu doğrulamaktır. Pilot geri bildirimleriyle platformun kullanılabilirliği, süreçleri ve yönetişim mekanizmaları geliştirilir.

Pilotte temel bileşenler:

- onboarding
- kurumsal kimlik/izin yönetimi
- işlem ve transfer yönetimi
- mutabakat katmanına entegrasyon
- yönetişim ve denetim araçları

Ağ istikrar kazandıkça daha fazla kurum dahil edilebilir.

## Bu Belgenin Durumu

Bu doküman living-doc olarak tutulur. Ürün, regülasyon ve pilot geri bildirimlerine göre sürümlenecektir.
