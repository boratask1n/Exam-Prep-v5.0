# Katkı Rehberi

Bu proje yerel kullanım odaklı bir YKS çalışma uygulamasıdır. Değişiklik yaparken mevcut veri akışını, Windows scriptlerini ve PostgreSQL şemasını birlikte düşünmek önemlidir.

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
- DB şeması değişirse `tools/windows/VERITABANI_TEMIZLE.bat`, `tools/windows/YEDEK_AL.bat`, `tools/windows/YEDEKTEN_GERI_YUKLE.bat` ve README güncellenmelidir.
- Ağır React bileşenleri doğrudan ana bundle'a eklenmemeli, mümkünse lazy-load edilmelidir.
- Kullanıcıya görünen metinler Türkçe ve UTF-8 uyumlu olmalıdır.

## PR Öncesi Kontrol

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:api`
