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

- **Yedek al**: `YEDEK_AL.bat`
  - `.env` dosyasından otomatik bağlantı bilgisi okur
  - Hem **Docker** hem **doğrudan psql** desteği
  - Yedek boyutu kontrolü
  
- **Yedekten yükle**: `YEDEKTEN_GERI_YUKLE.bat`
  - Mevcut verileri silip seçilen yedeği yükler
  - Docker/psql otomatik algılama
  
- **Veritabanını temizle** (sıfırla): `VERITABANI_TEMIZLE.bat`
  - Tüm tablolardaki verileri siler
  - ID'leri 1'den başlatır
  - Tablo yapılarını korur

Yedekler `backups` klasörüne `.sql` olarak kaydedilir.

## Test Modu Özellikleri

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