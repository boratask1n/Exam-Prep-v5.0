# Exam-Prep

Exam-Prep; soru havuzu, test oluşturma, test çözme, çizim araçları ve test oturumu takibi içeren yerel bir çalışma uygulamasıdır.

## Yerel Kurulum

Bu proje bilgisayarınızda ve aynı ağdaki cihazlarda çalışabilir.

### Gereksinimler

- Node.js
- `pnpm`
- Docker Desktop

### Docker Desktop (Windows)

`BASLAT.bat` veritabanı için Docker kullanır. Docker kurulu değilse:

1. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) indirip kurun.
2. Kurulum WSL 2 isterse etkinleştirin.
3. Docker Desktop uygulamasını açın ve tamamen hazır olmasını bekleyin.
4. Doğrulamak için PowerShell veya `cmd` içinde şu komutları çalıştırın:

```powershell
docker version
docker compose version
```

Sadece veritabanını elle başlatmak isterseniz:

```powershell
docker compose up -d
```

## Hızlı Başlat

1. `BASLAT.bat` dosyasını çalıştırın.
2. Açılan API ve Web pencerelerini kapatmayın.
3. Tarayıcıdan uygulamayı açın:
   - Bu bilgisayardan: `http://localhost:24486`
   - Aynı ağdan: `http://<LAN_IP>:24486`

## Durdurma

Uygulamayı kapatmak için:

```powershell
DURDUR.bat
```

## Veri Kalıcılığı

- Veriler PostgreSQL Docker volume içinde saklanır.
- Normal kapatıp açmada veriler silinmez.
- `docker compose down -v` komutunu çalıştırmayın; volume silinir.

## Yedek Alma ve Geri Yükleme

### Node.js Scriptleri

- Veritabanı yedeği almak:

```powershell
node artifacts/yks-tracker/scripts/backup-db.cjs [isim]
```

- Yedekten geri yüklemek:

```powershell
node artifacts/yks-tracker/scripts/restore-db.cjs <yedek-adi>
```

- Veritabanını sıfırlamak:

```powershell
node artifacts/yks-tracker/scripts/reset-db.cjs [--force]
```

- Soru import etmek:

```powershell
node artifacts/yks-tracker/scripts/import-sorular.cjs [--dry-run] [--limit N]
```

### BAT Scriptleri

- `YEDEK_AL.bat`
- `YEDEKTEN_GERI_YUKLE.bat`
- `VERITABANI_TEMIZLE.bat`

Yedekler `backups/` klasörüne yazılır.

## Özellikler

### Soru Havuzu

- Sayfalama ile performanslı yükleme
- Lazy loading ile resimlerin görünür oldukça yüklenmesi
- Gelişmiş filtreleme:
  - Kategori
  - Ders
  - Konu
  - Durum
  - Kaynak
- Filtrelenmiş sorularla test oluşturma

### Test Oluşturma

- Akıllı test kurucu
- Çoklu ders ve çoklu konu seçimi
- İstenilen soru sayısıyla test üretme
- Opsiyonel süre limiti
- Test oturumu ve ilerleme takibi

### Çizim Araçları

- Soru resmi üstüne çizim
- Kalem ve silgi
- Renk seçimi
- Çözüm tahtası
- Test bitene kadar çizimleri koruma
- Kontrol modunda çizimlere devam etme

### Test Akışı

1. Test başlatılır.
2. Sorular çözülür.
3. İlerleme ve cevaplar kaydedilir.
4. Test bitirilir.
5. Sonuçlar görüntülenir.
6. Kontrol modunda sorular tekrar incelenir.

## Kontrol Modu

- Test sonrası açılır.
- Çizimler korunur.
- Çözüm videoları erişilebilir.
- Cevaplar görüntülenir, sonuçlar incelenir.

## Güvenli GitHub Kullanımı

Bu projede aşağıdaki dosya ve klasörler GitHub'a gönderilmez:

- `.env`
- `.pnpm-store/`
- `backups/`
- `artifacts/api-server/uploads/`
- `dist/`
- `*.tsbuildinfo`

Örnek ortam değişkenleri için sadece `.env.example` dosyası repoda tutulur.

## Branch ile Çalışma Yöntemi

Ana branch üzerinde doğrudan çalışmak yerine yeni özellik veya düzeltme için branch açmak daha güvenlidir.

### Yeni branch açma

```powershell
git checkout -b codex/ozellik-adi
```

Örnek:

```powershell
git checkout -b codex/test-akisi-duzeltme
```

### Değişiklikleri kaydetme

```powershell
git status
git add .
git commit -m "feat: test akisi duzeltmeleri"
```

### Branch'i GitHub'a gönderme

```powershell
git push -u origin codex/ozellik-adi
```

### Çalışma önerisi

1. `main` branch'i temiz bırakın.
2. Her iş için yeni branch açın.
3. İş bitince branch'i GitHub'a gönderin.
4. Gerekirse GitHub üzerinden Pull Request açın.
5. Onaydan sonra `main` ile birleştirin.

## Hızlı Git Akışı

Kısa kullanım:

```powershell
git checkout -b codex/yeni-is
git add .
git commit -m "feat: degisiklik aciklamasi"
git push -u origin codex/yeni-is
```

## Not

Yerel çalışma sırasında oluşan runtime dosyaları, yedekler ve yüklenen görseller repo dışında tutulacak şekilde ayarlanmıştır. Böylece GitHub tarafı daha temiz, güvenli ve paylaşılabilir kalır.
