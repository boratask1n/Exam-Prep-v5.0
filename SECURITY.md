# Güvenlik Politikası

Bu uygulama kişisel / yerel kullanım odaklıdır. Varsayılan kurulumda API ve web servisleri aynı yerel ağdan erişilebilir şekilde çalışabilir.

## Hassas Dosyalar

Aşağıdaki dosyalar repoya eklenmemelidir:

- `.env`
- `.env_postgres`
- `backups/`
- `artifacts/api-server/uploads/`
- API anahtarları
- veritabanı dump dosyaları

## Yerel Ağ Kullanımı

Uygulamayı yalnızca kendi bilgisayarında kullanmak istersen `.env` içinde şu değeri kullanabilirsin:

```env
HOST=127.0.0.1
```

Aynı modem / yerel ağ üzerinden erişim için:

```env
HOST=0.0.0.0
```

Bu durumda Windows Firewall ve ağ güvenliği sorumluluğu kullanıcıdadır.

## Admin İşlemleri

`/api/admin/cleanup-uploads` endpoint'i production modda token ister. Token kullanmak için `.env` içine şunu ekle:

```env
ADMIN_TOKEN=uzun-rastgele-bir-deger
```

İsteklerde `x-admin-token` header'ı aynı değerle gönderilmelidir.

## Görsel Yükleme

Soru görseli yükleme akışı şu kontrolleri yapar:

- sadece JPEG, PNG ve WEBP kabul edilir
- varsayılan üst limit 8 MB'tır
- dosya adı uygulama tarafından üretilir
- uploads dizini dışına dosya okuma/yazma engellenir

Limit değiştirmek için:

```env
MAX_UPLOAD_BYTES=8388608
API_PAYLOAD_LIMIT=12mb
```
