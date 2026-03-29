# Exam-Prep (Yerel Kurulum)

Bu proje bilgisayarında ve ayni agdaki cihazlarda calisir.

## Docker Desktop (Windows)

`BASLAT.bat` veritabani icin **Docker** kullanir; Docker yoksa once asagidakileri yap:

1. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) indir ve kur.
2. Kurulum **WSL 2** onerirse etkinlestir (Docker Desktop genelde yonlendirir).
3. Kurulumdan sonra **Docker Desktop** uygulamasini ac; sistem tepsisinde balina ikonu **hazir** olana kadar bekle.
4. Dogrulama (PowerShell veya `cmd`): `docker version` ve `docker compose version` hata vermemeli.

Sadece veritabanini elle baslatmak icin proje klasorunde: `docker compose up -d`

## Hizli Baslat

1. `BASLAT.bat` dosyasina cift tikla.
2. Acilan pencereleri kapatma (API + Web calisir).
3. Tarayici:
   - Bu bilgisayar: `http://localhost:24486`
   - Ayni ag: `http://<LAN_IP>:24486` (BASLAT sonunda ekranda yazar)

## Durdurma

- `DURDUR.bat` dosyasina cift tikla.

## Veri Kaliciligi

- Veriler PostgreSQL Docker volume icinde saklanir.
- Normal kapat/ac yapinca veriler silinmez.
- `docker compose down -v` komutunu calistirma (volume siler).

## Yedek Alma ve Geri Yukleme

- Yedek al: `YEDEK_AL.bat`
- Yedekten yukle: `YEDEKTEN_GERI_YUKLE.bat`

Yedekler `backups` klasorune `.sql` olarak kaydedilir.

## Cizim Kisa Notlar

- **Soru Havuzu / Resim Uzeri Cizim**: Kalici kayit (Kaydet butonuyla).
- **Test ici resim ustu kalem**: Gecici, test bitince temizlenir.
- Resim ustu modda:
  - Mouse wheel ile dikey kaydirma
  - `Shift + wheel` ile yatay kaydirma
  - Scrollbar ile manuel kaydirma
