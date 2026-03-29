@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo  Exam-Prep Yedekten Geri Yukleme
echo ============================================
echo.

echo Mevcut yedekler:
if exist "backups\*.sql" (
  dir /b "backups\*.sql"
) else (
  echo backups klasorunde .sql yedek bulunamadi.
  pause
  exit /b 1
)

echo.
set /p BACKUP_NAME=Yuklemek istedigin yedek dosya adini yaz (ornek: exam_prep_20260327-120000.sql): 
set "BACKUP_FILE=backups\%BACKUP_NAME%"

if not exist "%BACKUP_FILE%" (
  echo [HATA] Dosya bulunamadi: %BACKUP_FILE%
  pause
  exit /b 1
)

echo.
echo UYARI: Mevcut tum veriler silinip bu yedek geri yuklenecek.
set /p CONFIRM=Devam etmek icin EVET yaz: 
if /I not "%CONFIRM%"=="EVET" (
  echo Islem iptal edildi.
  pause
  exit /b 0
)

echo [1/3] Veritabani baglantisi kontrol ediliyor...
docker exec exam-prep-postgres pg_isready -U postgres >nul 2>nul
if errorlevel 1 (
  echo [HATA] Veritabani konteyneri acik degil.
  echo Once BASLAT.bat ile sistemi baslatin.
  pause
  exit /b 1
)

echo [2/3] Mevcut veri temizleniyor...
docker exec exam-prep-postgres psql -U postgres -d exam_prep -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >nul
if errorlevel 1 (
  echo [HATA] Mevcut veri temizlenemedi.
  pause
  exit /b 1
)

echo [3/3] Yedek geri yukleniyor...
type "%BACKUP_FILE%" | docker exec -i exam-prep-postgres psql -U postgres -d exam_prep >nul
if errorlevel 1 (
  echo [HATA] Geri yukleme basarisiz.
  pause
  exit /b 1
)

echo.
echo Tamamlandi. Yedek basariyla geri yuklendi.
pause
