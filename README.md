# Exam-Prep

Exam-Prep, YKS çalışma sürecini tek yerde toplamak için geliştirilmiş yerel bir uygulamadır. Soru havuzu, test oluşturma ve çözme, analiz ekranları, AI destekli öneriler, notlar, not akışı ve çizim araçlarını aynı proje içinde birleştirir.

## Neler Var

- Soru havuzu ve filtreli test oluşturma
- Test modu, sonuç ekranı ve çözüm / kontrol akışı
- Analiz merkezi ve grafikler
- Gemini destekli analiz önerileri ve AI test önerileri
- TYT / AYT bazlı not sistemi
- Aktif geri çağırma mantığıyla çalışan `Not Akışı`
- Not ve soru üzerinde çizim
- PostgreSQL tabanlı kalıcı veri saklama

## Klasör Yapısı

- `artifacts/yks-tracker`: React + Vite web uygulaması
- `artifacts/api-server`: Express API
- `lib/db`: Drizzle schema ve veritabanı komutları
- `lib/api-zod`, `lib/api-client-react`: ortak API tipleri
- `backups`: veritabanı yedekleri

## Gereksinimler

- Node.js
- `pnpm`
- Docker Desktop

## Ortam Dosyaları

İlk açılışta `BASLAT.bat` eksik dosyaları otomatik oluşturur.

- `.env.example` → `.env`
- `.env_postgres.example` → `.env_postgres`

Temel değişkenler:

```env
DATABASE_URL=postgresql://<db_user>:<db_password>@<db_host>:5432/<db_name>
API_PORT=8080
WEB_PORT=24486
API_URL=http://localhost:8080
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

Gemini kullanmak istemiyorsan `GEMINI_API_KEY` boş kalabilir. Bu durumda AI tarafında yalnızca yerel / kural tabanlı fallback davranışları görünür.

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
- schema push uygular
- API ve web için ayrı typecheck çalıştırır
- production build alır

`BASLAT.bat` ise:

- bağımlılıkları kontrol eder
- PostgreSQL konteynerini başlatır
- schema push uygular
- API ve web uygulamasını ayrı pencerelerde açar
- API sağlık kontrolünü bekler

Açılan adresler:

- Web: `http://localhost:24486`
- API sağlık kontrolü: `http://localhost:8080/api/health`

## Durdurma

```powershell
.\DURDUR.bat
```

Bu script açık API / web pencerelerini kapatır ve PostgreSQL konteynerini durdurur.

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

- testler, sorular, notlar, çizimler ve analiz tabloları sıfırlanır
- `artifacts/api-server/uploads` klasörü de temizlenir
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

Schema push:

```powershell
pnpm --filter @workspace/db run push
```

## Kullanıma Hazırlık Notları

- Docker konteyner adı: `exam-prep-postgres`
- Web portu: `24486`
- API portu: `8080`
- Uygulama yerel ağda da açılabilir
- Kalıcı veriler Docker volume içinde saklanır

## Performans Notu

- Sayfalar lazy-load edildiği için ilk açılış daha hafiftir.
- Çizim sistemi Mac tarafında özel cursor yerine daha stabil yerel imleç davranışıyla çalışır.
- `Soru Havuzu` içinde ağır bileşenler isteğe bağlı yüklenecek şekilde ayrılmıştır.
- `Not Akışı`, notları tekrar mantığına göre batch halinde çeker.

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

GitHub'a yüklenen sürümde:

- kullanıcıya özel `.env` dosyaları yoktur
- API key değerleri yoktur
- lokal veritabanı dump / backup dosyaları yoktur
- `uploads` klasöründeki lokal dosyalar yoktur
- node_modules ve runtime logları yoktur

Bu nedenle taze clone sonrası `KURULUM.bat` çalıştırmak gerekir.

## Önerilen Akış

1. `BASLAT.bat` ile projeyi aç
2. uygulamayı test et
3. gerekiyorsa `YEDEK_AL.bat` ile yedek al
4. geliştirme sonunda `DURDUR.bat` ile kapat

## Not

Bu README mevcut proje yapısına göre güncellendi. Eski path veya artık kullanılmayan script referansları kaldırıldı.
