# Exam-Prep

Exam-Prep, YKS çalışma sürecini tek yerde toplamak için geliştirilmiş yerel bir çalışma uygulamasıdır. Soru havuzu, test oluşturma ve çözme, analiz ekranları, AI destekli öneriler, notlar, not akışı, soru tekrar akışı ve çizim araçlarını aynı proje içinde birleştirir.

## Neler Var

- Soru havuzu, arama, badge filtreleri ve filtreli test oluşturma
- Test modu, sonuç ekranı ve çözüm / kontrol akışı
- Analiz merkezi ve grafikler
- Tüm zamanları değerlendiren Gemini destekli analiz önerileri ve kural tabanlı fallback
- TYT / AYT bazlı not sistemi
- Aktif geri çağırma mantığıyla çalışan `Not Akışı`
- Yanlış ve zamanı gelen soruları öne alan `Soru Tekrarı`
- Not ve soru üzerinde çizim
- YouTube çözüm videosu ve videonun başlayacağı saniye bilgisi
- Modern giriş ekranı, hesap oluşturma, `Beni hatırla` seçeneği ve cihaz bazlı oturum saklama
- Kullanıcıya özel soru / not / test / analiz verisi ve hesap silme seçeneği
- Windows / macOS için yerel sunucuya bağlanan masaüstü uygulama kabuğu
- PostgreSQL tabanlı kalıcı veri saklama
- Görsel yüklemelerde istemci tarafı küçültme ve API tarafı dosya doğrulama

## Klasör Yapısı

- `artifacts/yks-tracker`: React + Vite web uygulaması
  - `src/pages/Login.tsx`: giriş ekranı
  - `src/lib/auth-session.ts`: oturum yardımcıları
- `artifacts/api-server`: Express API
- `artifacts/desktop-shell`: Electron tabanlı masaüstü uygulama kabuğu
- `lib/db`: Drizzle schema ve veritabanı komutları
- `lib/api-zod`, `lib/api-client-react`: ortak API tipleri
- `scripts`: yerel smoke test ve bakım yardımcıları
- `backups`: veritabanı yedekleri, git'e gönderilmez

## Gereksinimler

- Node.js
- `pnpm`
- Docker Desktop

## Ortam Dosyaları

İlk açılışta `KURULUM.bat` veya `BASLAT.bat` eksik dosyaları örneklerden oluşturur.

- `.env.example` -> `.env`
- `.env_postgres.example` -> `.env_postgres`

Temel değişkenler:

```env
DATABASE_URL=postgresql://<db_user>:<db_password>@<db_host>:5432/<db_name>
API_PORT=8080
WEB_PORT=24486
HOST=0.0.0.0
API_PAYLOAD_LIMIT=12mb
MAX_UPLOAD_BYTES=8388608
API_URL=http://localhost:8080
ADMIN_TOKEN=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

`GEMINI_API_KEY` boş kalabilir. Bu durumda AI tarafında yerel / kural tabanlı fallback davranışı çalışır.

## Oturum ve Veri İzolasyonu

- Her kullanıcı kendi hesabıyla giriş yapar.
- Soru havuzu, notlar, testler, çizimler, tekrar akışı ve analiz sonuçları oturumdaki kullanıcıya göre filtrelenir.
- İlk kullanıcı girişinde eski sahipsiz yerel veriler otomatik olarak o hesaba bağlanır; yeni kullanıcılar bu verileri göremez.
- Sol menüdeki `Hesabı Sil` seçeneği, ilgili kullanıcıya ait tüm soru, not, test, analiz ve oturum verilerini kalıcı olarak siler.

## Hızlı Başlat

Windows üzerinde en kolay yol:

```powershell
.\KURULUM.bat
.\BASLAT.bat
```

İlk kez clone alan bir kullanıcı için önerilen akış:

```powershell
git clone <repo-url>
cd Exam-Prep
.\KURULUM.bat
.\BASLAT.bat
```

`KURULUM.bat` şunları yapar:

- gerekli `.env` dosyalarını örneklerden oluşturur
- bağımlılıkları kurar
- PostgreSQL konteynerini başlatır
- Drizzle schema push uygular
- API ve web için typecheck çalıştırır
- production build alır
- API smoke testini çalıştırır

`BASLAT.bat` şunları yapar:

- eski API / web süreçlerini temizler
- bağımlılıkları kontrol eder
- PostgreSQL konteynerini başlatır
- schema push uygular
- API ve web uygulamasını ayrı pencerelerde açar
- API sağlık kontrolünü bekler

Açılan adresler:

- Web: `http://localhost:24486`
- Web (aynı modem / LAN): `http://SUNUCU_IP:24486`
- API sağlık kontrolü: `http://localhost:8080/api/health`

## Masaüstü Uygulama ve Senkronizasyon

Bu proje masaüstünde iki parçalı çalışır:

- `BASLAT.bat`, bu bilgisayarda PostgreSQL + API + web sunucusunu açar.
- Electron masaüstü uygulaması, açılan web sunucusuna bağlanan yerel bir kabuktur.

Windows için kurulum dosyası (`Setup.exe`) ve portable `.exe` üretmek için:

```powershell
.\MASAUSTU_BUILD.bat
```

Çıktılar `artifacts/desktop-shell/release` klasörüne yazılır.

Başlıca dosyalar:

- `Exam Prep Setup 0.0.0.exe` (kurulumlu sürüm)
- `Exam Prep 0.0.0.exe` (portable sürüm)

Geliştirme sırasında masaüstü kabuğunu hızlı açmak için:

```powershell
.\MASAUSTU_AC.bat
```

Senkron kullanım mantığı:

1. Ana bilgisayarda `BASLAT.bat` çalışır.
2. Aynı modemdeki Mac veya PC, masaüstü uygulamasında `Exam Prep > Sunucu Adresini Değiştir` menüsünden `http://SUNUCU_IP:24486` adresini girer.
3. Tüm cihazlar aynı API ve PostgreSQL veritabanını kullandığı için sorular, notlar, çizimler, tekrar istatistikleri ve analiz verileri aynı merkezde kalır.

Güncelleme davranışı:

- Masaüstü uygulaması ayrı bir veri tutmaz; sunucudaki web uygulamasını açar.
- Sunucu tarafında site güncellendiğinde uygulamayı yeniden açan herkes yeni sürümü görür.
- Ek bir “otomatik veri senkron” işi gerekmez; çünkü tüm cihazlar aynı sunucu veritabanına bağlıdır.
- Sadece uygulama kabuğunun (Electron) kendisini güncellersen yeni `Setup.exe` / `portable` dosyasını dağıtmak gerekir.

Not: Windows `.exe` Windows üzerinde üretilir. macOS `.dmg` veya `.zip` paketi için aynı repoyu macOS üzerinde kurup `pnpm run desktop:dist:mac` çalıştırmak gerekir.

## Yeni Tekrar Mantığı

Notlarda olduğu gibi sorularda da aralıklı tekrar istatistiği tutulur.

- `question_review_stats` tablosu, her sorunun tekrar aşamasını ve sıradaki gösterim zamanını saklar.
- Test finalize edildiğinde doğru / yanlış çözülen sorular tekrar istatistiğine otomatik işlenir.
- `Soru Tekrarı` sayfası yanlış, çözülmemiş ve zamanı gelen soruları öne alır.
- Kullanıcı “Tekrar getir”, “Çözdüm”, “Daha seyrek göster” veya “Daha sık göster” diyerek algoritmayı yönlendirebilir.
- Soruya YouTube çözüm linki ve başlangıç saniyesi eklenirse, akıştan veya test modundan video doğrudan o saniyeden açılır.

Mevcut veritabanı olan bir kurulumda yeni tablo için şu komut yeterlidir:

```powershell
pnpm --filter @workspace/db run push
```

`BASLAT.bat` ve `KURULUM.bat` bu schema push adımını zaten otomatik çalıştırır.

## Veritabanı ve Bakım Scriptleri

### Yedek alma

```powershell
.\YEDEK_AL.bat
```

- PostgreSQL dump alır
- `artifacts/api-server/uploads` klasörünü de yedekler
- yedekleri `backups/backup-YYYYMMDD-HHMMSS` altına yazar

### Yedekten geri yükleme

```powershell
.\YEDEKTEN_GERI_YUKLE.bat
```

- seçilen dump dosyasını geri yükler
- mevcut `uploads` klasörünü temizleyip yedekteki dosyaları geri kopyalar

### Veritabanını temizleme

```powershell
.\VERITABANI_TEMIZLE.bat
```

- kullanıcılar, oturumlar, testler, sorular, soru tekrar istatistikleri, notlar, not tekrar istatistikleri, çizimler ve analiz tabloları sıfırlanır
- `artifacts/api-server/uploads` klasörü temizlenir
- istenirse önce otomatik yedek alır

### DB arayüzleri

```powershell
.\DB_AC.bat
```

Bu script pgAdmin veya DBeaver açmak için bağlantı bilgilerini hazırlar.

## Manuel Geliştirme Komutları

API typecheck:

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Web typecheck:

```powershell
pnpm --filter @workspace/yks-tracker run typecheck
```

API build:

```powershell
pnpm --filter @workspace/api-server run build
```

Web build:

```powershell
pnpm --filter @workspace/yks-tracker run build
```

API smoke testi:

```powershell
pnpm smoke:api
```

Tüm CI kontrolünü yerelde çalıştırmak için:

```powershell
pnpm run ci:check
```

Windows masaüstü paketi:

```powershell
pnpm run desktop:dist:win
```

macOS masaüstü paketi:

```powershell
pnpm run desktop:dist:mac
```

Schema push:

```powershell
pnpm --filter @workspace/db run push
```

## Güvenlik ve Gizlilik Notları

- `.env`, `.env_postgres`, backup dosyaları, uploads klasörü ve API key değerleri git'e gönderilmez.
- Görsel yüklemelerde dosya türü ve gerçek dosya imzası API tarafında doğrulanır.
- Upload dosya adları rastgele üretilir ve path traversal engellenir.
- Admin upload temizliği production ortamında `ADMIN_TOKEN` ister.
- AI analizi yerel cihaz önbelleğine yazılır; analiz ekranındaki “AI önbelleğini temizle” butonu bu kaydı kaldırır.

## Performans Notları

- Sayfalar lazy-load edildiği için ilk açılış daha hafiftir.
- Soru görselleri yüklenmeden önce istemci tarafında makul boyuta küçültülür.
- `Soru Havuzu` içinde ağır bileşenler isteğe bağlı yüklenir.
- `Not Akışı` ve `Soru Tekrarı`, veriyi batch halinde çeker ve kaydırma sırasında yeni öğeleri hazırlar.
- Çizim sistemi Mac tarafında özel cursor yerine daha stabil yerel imleç davranışıyla çalışır.

## Git ve Temizlik

Repoda şu dosyalar git'e gönderilmez:

- `.env`
- `.env_postgres`
- `node_modules/`
- `.pnpm-store/`
- `backups/`
- `artifacts/api-server/uploads/`
- `dist/`
- `*.log`
- `*.tsbuildinfo`

Örnek ortam dosyaları repoda tutulur:

- `.env.example`
- `.env_postgres.example`

GitHub'a yüklenen sürümde kullanıcıya özel veriler ve API key değerleri bulunmamalıdır. Taze clone sonrasında `KURULUM.bat` çalıştırmak gerekir.

## Önerilen Akış

1. `BASLAT.bat` ile projeyi aç
2. uygulamayı test et
3. gerekiyorsa `YEDEK_AL.bat` ile yedek al
4. geliştirme sonunda `DURDUR.bat` ile kapat
