# Exam-Prep (Yerel Kurulum)

Bu proje bilgisayarınızda ve aynı ağdaki cihazlarda çalışır.

## Docker Desktop (Windows)

`BASLAT.bat` veritabanı için **Docker** kullanır; Docker yoksa önce aşağıdakileri yapın:

1. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) indir ve kur.
2. Kurulum **WSL 2** önerirse etkinleştir (Docker Desktop genelde yönlendirir).
3. Kurulumdan sonra **Docker Desktop** uygulamasını açın; sistem tepsisinde balina ikonu **hazır** olana kadar bekleyin.
4. Doğrulama (PowerShell veya `cmd`): `docker version` ve `docker compose version` hata vermemeli.

> Sadece veritabanını elle başlatmak için proje klasöründe: `docker compose up -d`

## Hızlı Başlat

1. `BASLAT.bat` dosyasına çift tıklayın.
2. Açılan pencereleri kapatmayın (API + Web çalışır).
3. Tarayıcı:
   - Bu bilgisayar: `http://localhost:24486`
   - Aynı ağ: `http://<LAN_IP>:24486` (BASLAT sonunda ekranda yazar)

## Durdurma

- `DURDUR.bat` dosyasına çift tıklayın.

## Veri Kalıcılığı

- Veriler PostgreSQL Docker volume içinde saklanır.
- Normal kapat/aç yapınca veriler silinmez.
- `docker compose down -v` komutunu çalıştırmayın (volume siler).

## Yedek Alma ve Geri Yükleme

### Yeni Scriptler (Node.js)

Daha gelişmiş yedekleme seçenekleri:

- **Yedek al**: `node artifacts/yks-tracker/scripts/backup-db.cjs [isim]`
  - Veritabanı + uploads klasörü birlikte yedekler
  - Metadata dosyası oluşturur
  - `backups/` klasörüne kaydeder
  
- **Yedekten yükle**: `node artifacts/yks-tracker/scripts/restore-db.cjs <yedek-adi>`
  - Tüm verileri ve resimleri geri yükler
  - Onay isteyerek çalışır
  
- **Veritabanını sıfırla**: `node artifacts/yks-tracker/scripts/reset-db.cjs [--force]`
  - Tüm tabloları siler ve uploads klasörünü temizler
  - `--force` ile onay sormadan çalışır

- **Soru import et**: `node artifacts/yks-tracker/scripts/import-sorular.cjs [--dry-run] [--limit N]`
  - `Soru Arşivi` klasöründen otomatik soru yükleme
  - `--dry-run`: Sadece simülasyon, veritabanına yazmaz
  - `--limit N`: İlk N soruyu import eder

### Eski BAT Scriptleri (Hâlâ çalışır)

- **Yedek al**: `YEDEK_AL.bat`
- **Yedekten yükle**: `YEDEKTEN_GERI_YUKLE.bat`
- **Veritabanını temizle**: `VERITABANI_TEMIZLE.bat`

Yedekler `backups` klasörüne kaydedilir.

## Test Modu Özellikleri

### Soru Havuzu Özellikleri

- **Pagination (Sayfalama)**: 20 soru/sayfa ile performanslı yükleme
- **Lazy Loading**: Resimler görünür oldukça yüklenir
- **Gelişmiş Filtreleme**:
  - Kategori (TYT, AYT, Geometri)
  - Ders seçimi
  - Konu seçimi (ders bazlı dinamik konular)
  - Durum (Çözülmedi, Doğru, Yanlış)
  - Kaynak (Deneme, Banka)
- **Toplu İşlemler**: Filtrelenmiş soruları test oluşturmada kullanma

### Test Oluşturma

- **Akıllı Test Kurucu**: Filtrelere göre otomatik soru seçimi
- **Konu Bazlı Seçim**: Birden fazla konu seçimi desteği
- **Ders Bazlı Filtreleme**: Tek veya çoklu ders seçimi
- **Soru Sayısı**: İstenilen sayıda soru ile test oluşturma
- **Süre Limiti**: Opsiyonel test süresi belirleme

### Çizim Araçları
- **Resim Üstü Kalem**: Soru resminin üzerine doğrudan çizim yapma
  - Kalem ve silgi araçları
  - Renk seçimi (Siyah, Kırmızı, Mavi, Yeşil)
  - Çizimler test bitene kadar kalıcı
  
- **Çözüm Tahtası**: Ayrı pencerede geniş çizim alanı
  - Daha gelişmiş çizim araçları
  - Zoom ve kaydırma desteği
  - Çizimler test bitene kadar saklanır

### Test Akışı
1. **Test Çözme**: Soruları yanıtlama, çizim yapma
2. **Test Bitir**: Cevaplar gönderilir, sonuçlar hesaplanır
3. **Sonuçlar**: Özet ekranı - başarı oranı, doğru/yanlış sayısı
4. **Kontrol Modu**: Soru soru inceleme, çizimlere devam etme, çözüm videosu izleme

### Kontrol Modu
- Test bitince **"Soruları kontrol et"** butonu ile açılır
- Tüm çizimler korunur ve editlebilir
- Çözüm videoları erişilebilir
- Cevaplar değiştirilemez (sadece görüntüleme)

## Çizim Kısa Notlar

- **Soru Havuzu / Resim Üzeri Çizim**: Kalıcı kayıt (Kaydet butonuyla).
- **Test İçi Resim Üstü Kalem**: Test bitene kadar kalıcı, kontrol modunda editlebilir.
- **Çözüm Tahtası**: Test bitene kadar kalıcı, kontrol modunda erişilebilir.
- Resim üstü modda:
  - Fare tekerleği (Mouse wheel) ile dikey kaydırma
  - `Shift + tekerlek` ile yatay kaydırma
  - Kaydırma çubuğu (Scrollbar) ile manuel kaydırma
  - `Ctrl + tekerlek` ile zoom