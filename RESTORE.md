# Exam Prep Restore Notlari

Bu repo kaynak kodu geri getirmek ve sunucuyu yeniden kurmak icin yeterli olacak
sekilde hazirlanir. Temiz kurulum icin:

```powershell
BAGIMLILIKLARI_INDIR.bat
KURULUM.bat
BASLAT.bat
```

`BAGIMLILIKLARI_INDIR.bat`, Node/npm/pnpm durumunu kontrol edip proje
bagimliliklarini indirir. `KURULUM.bat`, `.env.example` ve
`.env_postgres.example` dosyalarindan lokal calisan varsayilan ayarlari
olusturur.

## Neler Geri Gelir?

Kaynak koddan geri gelenler:

- API server
- React web uygulamasi
- Desktop Electron shell
- Docker/PostgreSQL/Caddy ayarlari
- Windows kurulum ve baslatma scriptleri
- Mac DMG build ayarlari

Kaynak koddan otomatik geri gelmeyenler:

- Mevcut veritabani kayitlari
- Yuklenen soru gorselleri
- `.env` icindeki ozel API key degerleri

Bu veriler icin ayrica runtime yedegi gerekir.

## Runtime Yedegi Alma

Sunucu calisir durumdayken:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-runtime-data.ps1
```

Bu komut `backups/runtime-YYYYMMDD-HHMMSS` klasorune su dosyalari yazar:

- `exam_prep.dump`
- `uploads.zip`

## Runtime Yedegi Geri Yukleme

Yeni kurulumdan sonra:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-runtime-data.ps1 -BackupPath backups\runtime-YYYYMMDD-HHMMSS
```

Sonra:

```powershell
BASLAT.bat
```

## MacBook'ta DMG Build

```bash
pnpm install
pnpm run desktop:dist:mac
```

DMG dosyasi:

```text
artifacts/desktop-shell/release/
```
