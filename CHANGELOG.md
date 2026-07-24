# Exam-Prep Değişiklik Günlüğü (CHANGELOG.md)

Tüm sürümler, eklenen özellikler, arayüz güncellemeleri ve düzeltmeler bu dokümanda kayıt altına alınır.

---

## [v5.2.0] - 2026-07-23

### 🚀 Deneme Ekleme Modülü — Tam Yeniden Yazım

- **Kaynak Seçimi Kaldırıldı**: Deneme ekleme ekranından "Kayıtlı Kaynak" seçim alanı tamamen kaldırıldı.
- **Modern Tarih Seçici**: Tarayıcı varsayılan date input'u yerine `Calendar` bileşeni + `Popover` ile Türkçe, modern bir tarih seçici eklendi.
- **Otomatik Süre Doldurma**: TYT seçilince süre otomatik 165 dk, AYT seçilince 180 dk olarak dolar; kullanıcı isterse değiştirebilir. Branş denemesinde süre kullanıcı tarafından girilir.
- **ÖSYM Ders Dağılımı — TYT**: Türkçe (40), Sosyal Bilimler (20), Temel Matematik (40), Fen Bilimleri (20) şeklinde güncel ÖSYM standartlarına uygun, her ders için D/Y/Net girişi yapılabilir tablo eklendi.
- **ÖSYM Ders Dağılımı — AYT**: Sözel grubu (Edebiyat 24, Tarih-1 10, Coğrafya-1 6, Tarih-2 11, Coğrafya-2 11, Felsefe 12, Din 6) ve Sayısal grubu (Matematik 40, Geometri 10, Fizik 14, Kimya 13, Biyoloji 13) şeklinde tüm dersler listelendi.
- **Branş Denemesi**: `lessonTopics.ts`'den gelen ders ve konular ComboBox/Select ile seçilir; soru sayısı, doğru, yanlış ve net girilir.
- **Otomatik Net Hesaplama**: Her ders satırında D-Y/4 formülüyle net anında hesaplanır; toplam net üstte ve formun altında gösterilir.
- **Hata Yönetimi**: API hatası olduğunda formda açıklayıcı hata mesajı gösterilir.
- **Kart Güncellemesi (`PracticeExams.tsx`)**: Deneme kartlarında artık her dersin neti mini tablo olarak görüntülenir.
- **Analiz Grafikleri Zenginleştirildi**: TYT/AYT ayrımı, TYT ders bazlı gelişim ve Branş ortalama net grafikleri eklendi.
- **Hızlı İstatistik Barı**: Sayfada toplam/TYT/AYT/Branş deneme sayıları tek bakışta görünür.

### ♻️ Kod Kalitesi Refaktörleri

- **`src/lib/practiceExamConfig.ts`** [YENİ]: ÖSYM ders/soru konfigürasyonları, net hesaplama yardımcıları ve veri dönüşüm fonksiyonları burada toplandı.
- **`src/hooks/usePracticeExamForm.ts`** [YENİ]: Tüm form mantığı (state, effect'ler, API mutation, payload oluşturma) ayrı bir hook'a taşındı — UI tamamen iş mantığından ayrıldı (MVVM prensibine uygun).
- **`PracticeExamFormDialog.tsx`**: Alt bileşenlere ayrıldı: `DatePickerField`, `SubjectResultRow`, `SubjectResultsTable`. SOLID prensiplerine göre her bileşen tek bir sorumluluğa sahip.

---

## [v5.1.0] - 2026-07-23

### 🚀 Yeni Özellikler
- **Denemelerim Sayfası (`PracticeExams.tsx`)**:
  - TYT/AYT Genel Denemeleri ve Konu Denemelerini kayıt altına almak için yepyeni bir "Denemelerim" modülü geliştirildi.
  - Denemeler Liste (Genel Denemeler) ve Detaylı Analiz Grafikleri (Net Gelişimi, Ders Dağılımı) olmak üzere 2 sekmede (Tab) düzenlendi.
  - Recharts kütüphanesi entegre edilerek Doğrusal Net Gelişim Grafiği (Line Chart) ve Derslere Göre Dağılım Grafiği (Bar Chart) kurgulandı.
  - Doğru ve Yanlış sayısından Net oranının otomatik hesaplanması (D-Y/4) sağlandı.
  - Sınav tipi (Genel/Konu), tarih, süre ve notlar gibi veriler veritabanı şemasına (`practice_exams.ts`) ve API sunucusuna eklendi.
- **Detaylı Kaynak Görünümü Sayfası (`ResourceDetail.tsx`)**:
  - Kaynaklar sayfasında herhangi bir kitaba/kaynağa tıklandığında açılan özel detay sayfası eklendi.
  - Seçilen kaynağın kategorisi, dersi, yayın evi, konu bilgisi, soru istatistikleri (Doğru, Yanlış, Başarı % Oranı, Notlar) gösteriliyor.
  - Kaynağa eklenmiş olan konular filtrelenebilir butonlar (pills) halinde sunuldu.
  - Sadece o kaynağa ait sorular, görselleri, seçenekleri, doğru şıkları ve YouTube çözüm videoları ile listeleniyor.
  - Doğrudan bu görünüm üzerinden kaynağa yeni soru ekleme ve kaynak düzenleme imkanı sağlandı.
- **Detaylı Geliştirici Rehberi (`FOR_DEVELOPERS.md`)**:
  - Proje mimarisini, klasör yapısını, veritabanı ilişkilerini ve build komutlarını açıklayan geliştirici rehberi eklendi.

### 🎨 Arayüz ve Kullanılabilirlik İyileştirmeleri
- **Açılır Liste (Select) Kaydırma Çubuğu (`select.tsx`)**:
  - Çok sayıda ders ve konu barındıran dropdown menülerin ekran dışına/altına taşmasını önlemek amacıyla `max-h-60` (240px) yükseklik sınırı ve dikey kaydırma çubuğu (`overflow-y-auto`) eklendi.
- **Not Ekleme Ekranı Temizliği (`Notes.tsx`)**:
  - Notların kaynaklarla doğrudan ilişkisi bulunmadığı için Not Ekleme formundan "Kaynak (Opsiyonel)" seçim alanı çıkarıldı.
- **Kaynak Türleri Kısıtlaması (`ResourceDialog.tsx` & `Resources.tsx`)**:
  - Kaynak türü seçenekleri sadece **Soru Bankası, Deneme, Fasikül, Ders Kitabı** olarak kısıtlandı. *"Çıkmış Sorular"* ve *"Ders Notu"* seçenekleri kaldırıldı.
- **Hedef Soru Sayısı Barı Kaldırıldı (`Resources.tsx`)**:
  - Kaynak kartlarındaki Hedef Soru Sayısı Progress Bar'ı kaldırıldı, kartlar daha sade ve odaklı hale getirildi.
- **Soru Ekleme Ekranında Kaynak Bilgileri Kilitlendi (`QuestionFormDialog.tsx`)**:
  - Soru eklenirken kayıtlı bir kaynak seçildiğinde Kategori, Ders ve (varsa) Konu alanları seçilen kaynaktan otomatik alınarak kilitlendi.
- **Ders ve Konu Listeleri Genişletildi (`lessonTopics.ts`)**:
  - TYT derslerine Fen, Sosyal, Tarih, Coğrafya, Felsefe, Din Kültürü ve Geometri eklendi.
  - AYT derslerine Türk Dili ve Edebiyatı, Tarih-1, Tarih-2, Coğrafya-1, Coğrafya-2, Felsefe Grubu, Din Kültürü, Yabancı Dil eklendi.
  - Türkçe dersi konularına genel dil bilgisini kapsayacak **"Dil Bilgisi"** konusu eklendi.

### ⚙️ Altyapı, Veritabanı ve Build İyileştirmeleri
- **Veritabanı Şeması (`resourcesTable`)**:
  - Kaynaklar tablosuna opsiyonel `topic` (konu) sütunu eklendi (`lib/db/src/schema/resources.ts`).
  - OpenAPI şeması ve API Server router (`/api/resources`) `topic` desteği ile güncellendi.
  - `drizzle-kit push` ile PostgreSQL veritabanına şema değişikliği uygulandı.
- **Başlatma Betiği Otomasyonu (`BASLAT.bat`)**:
  - Başlatma betiği güncellenerek veritabanı şema güncellemeleri, API sunucusu build adımı (`api-server/dist`) ve Web uygulaması build adımı (`yks-tracker/dist/public`) her başlatmada otomatik olarak en güncel kodlar derlenecek şekilde ayarlandı.
