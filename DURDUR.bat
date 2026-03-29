@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo  Exam-Prep Temiz Kapatma
echo ============================================
echo.

echo [1/3] Uygulama pencereleri kapatiliyor...
taskkill /FI "WINDOWTITLE eq Exam-Prep API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep Web*" /T /F >nul 2>nul

echo [2/3] Acik node surecleri kontrol ediliyor...
for /f "tokens=2 delims=," %%P in ('tasklist /v /fo csv ^| findstr /i "Exam-Prep API Exam-Prep Web"') do (
  taskkill /PID %%~P /T /F >nul 2>nul
)

echo [3/3] Veritabani konteyneri durduruluyor...
docker compose stop >nul 2>nul

echo.
echo Tamamlandi. Uygulama ve veritabani durduruldu.
echo Tekrar baslatmak icin BASLAT.bat dosyasina cift tiklayin.
pause
