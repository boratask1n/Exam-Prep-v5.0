# Katkı Rehberi

Bu proje yerel kullanım odaklı bir YKS çalışma uygulamasıdır. Değişiklik yaparken mevcut veri akışını, bat dosyalarını ve PostgreSQL şemasını birlikte düşünmek önemlidir.

## Geliştirme Akışı

1. Bağımlılıkları kur:
   ```powershell
   pnpm install
   ```
2. Veritabanını hazırla:
   ```powershell
   pnpm --filter @workspace/db run push
   ```
3. Kontrolleri çalıştır:
   ```powershell
   pnpm typecheck
   pnpm build
   pnpm smoke:api
   ```

## Değişiklik Kuralları

- `.env`, `.env_postgres`, `backups/`, `uploads/` ve kişisel API anahtarları commitlenmemelidir.
- DB şeması değişirse `VERITABANI_TEMIZLE.bat`, `YEDEK_AL.bat`, `YEDEKTEN_GERI_YUKLE.bat` ve README kontrol edilmelidir.
- Ağır React bileşenleri doğrudan ana bundle'a eklenmemeli, mümkünse lazy-load edilmelidir.
- Kullanıcıya görünen metinler Türkçe ve UTF-8 uyumlu olmalıdır.

## PR Öncesi Kontrol

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:api`
