# Exam-Prep

Exam-Prep, YKS calisma surecini tek yerde toplamak icin gelistirilmis yerel bir uygulamadir. Soru havuzu, test olusturma ve cozme, analiz ekranlari, AI destekli oneriler, notlar ve cizim araclarini ayni proje icinde birlestirir.

## Neler Var

- Soru havuzu ve filtreli test olusturma
- Test modu, sonuc ekrani ve cozum / kontrol akisi
- Analiz merkezi ve grafikler
- Gemini destekli analiz onerileri ve AI test onerileri
- TYT / AYT bazli sticky note sistemi
- Not ve soru uzerinde cizim
- PostgreSQL tabanli kalici veri saklama

## Klasor Yapisi

- `artifacts/yks-tracker`: React + Vite web uygulamasi
- `artifacts/api-server`: Express API
- `lib/db`: Drizzle schema ve veritabani komutlari
- `lib/api-zod`, `lib/api-client-react`: ortak API tipleri
- `backups`: veritabani yedekleri

## Gereksinimler

- Node.js
- `pnpm`
- Docker Desktop

## Ortam Dosyalari

Ilk acilista `BASLAT.bat` eksik dosyalari otomatik olusturur.

- `.env.example` -> `.env`
- `.env_postgres.example` -> `.env_postgres`

Temel degiskenler:

```env
DATABASE_URL=postgresql://<db_user>:<db_password>@<db_host>:5432/<db_name>
API_PORT=8080
WEB_PORT=24486
API_URL=http://localhost:8080
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

Gemini kullanmak istemiyorsan `GEMINI_API_KEY` bos kalabilir. Bu durumda AI tarafinda sadece yerel / kural tabanli fallback davranislari gorunur.

## Hizli Baslat

Windows uzerinde en kolay yol:

```powershell
.\KURULUM.bat
.\BASLAT.bat
```

Ilk kez clone alan bir kullanici icin onerilen akis:

```powershell
git clone <repo-url>
cd Exam-Prep
.\KURULUM.bat
.\BASLAT.bat
```

Bu script:

- gerekli `.env` dosyalarini orneklerden olusturur
- bagimliliklari kurar
- PostgreSQL konteynerini baslatir
- schema push uygular
- typecheck ve production build alir

`BASLAT.bat` ise:

- bagimliliklari kontrol eder
- PostgreSQL konteynerini baslatir
- schema push uygular
- API ve web uygulamasini ayri pencerelerde acir

Acilan adresler:

- Web: `http://localhost:24486`
- API saglik kontrolu: `http://localhost:8080/api/health`

## Durdurma

```powershell
.\DURDUR.bat
```

Bu script acik API / web pencerelerini kapatir ve PostgreSQL konteynerini durdurur.

## Veritabani ve Bakim Scriptleri

### Yedek alma

```powershell
.\YEDEK_AL.bat
```

- PostgreSQL dump alir
- `artifacts/api-server/uploads` klasorunu da yedekler
- yedekleri `backups/backup-YYYYMMDD-HHMMSS` altina yazar

### Yedekten geri yukleme

```powershell
.\YEDEKTEN_GERI_YUKLE.bat
```

- secilen dump dosyasini geri yukler
- mevcut `uploads` klasorunu temizleyip yedekteki dosyalari geri kopyalar

### Veritabanini temizleme

```powershell
.\VERITABANI_TEMIZLE.bat
```

- testler, sorular, notlar, cizimler ve analiz tablolari sifirlanir
- `artifacts/api-server/uploads` klasoru de temizlenir
- istenirse once otomatik yedek alir

### DB arayuzleri

```powershell
.\DB_AC.bat
```

Bu script pgAdmin veya DBeaver acmak icin baglanti bilgilerini hazirlar.

## Manuel Gelistirme Komutlari

Tum repo icin tip kontrolu:

```powershell
pnpm typecheck
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

## Kullanima Hazirlik Notlari

- Docker konteyner adi: `exam-prep-postgres`
- Web portu: `24486`
- API portu: `8080`
- Uygulama yerel agda da acilabilir
- Kalici veriler Docker volume icinde saklanir

## Git ve Temizlik

Repoda su dosyalar git'e gonderilmez:

- `.env`
- `.env_postgres`
- `node_modules/`
- `.pnpm-store/`
- `backups/`
- `artifacts/api-server/uploads/`
- `dist/`
- `*.log`
- `*.tsbuildinfo`

Ornek ortam dosyalari repoda tutulur:

- `.env.example`
- `.env_postgres.example`

GitHub'a yuklenen surumde:

- kullaniciya ozel `.env` dosyalari yoktur
- lokal veritabani dump / backup dosyalari yoktur
- `uploads` klasorundeki lokal dosyalar yoktur
- node_modules ve runtime loglari yoktur

Bu nedenle taze clone sonrasi `KURULUM.bat` calistirmak gerekir.

## Onerilen Akis

1. `BASLAT.bat` ile projeyi ac
2. uygulamayi test et
3. gerekiyorsa `YEDEK_AL.bat` ile yedek al
4. gelistirme sonunda `DURDUR.bat` ile kapat

## Not

Bu README mevcut proje yapisina gore guncellendi. Eski path veya artik kullanilmayan script referanslari kaldirildi.
