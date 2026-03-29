@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo  Exam-Prep Yedek Alma
echo ============================================
echo.

if not exist "backups" mkdir "backups"

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "TS=%%T"
set "BACKUP_FILE=backups\exam_prep_%TS%.sql"

echo [1/2] Veritabani baglantisi kontrol ediliyor...
docker exec exam-prep-postgres pg_isready -U postgres >nul 2>nul
if errorlevel 1 (
  echo [HATA] Veritabani konteyneri acik degil.
  echo Once BASLAT.bat ile sistemi baslatin.
  pause
  exit /b 1
)

echo [2/2] Yedek aliniyor...
docker exec exam-prep-postgres pg_dump -U postgres -d exam_prep > "%BACKUP_FILE%"
if errorlevel 1 (
  echo [HATA] Yedek alma basarisiz.
  pause
  exit /b 1
)

echo.
echo Tamamlandi.
echo Yedek dosyasi: %BACKUP_FILE%
pause
