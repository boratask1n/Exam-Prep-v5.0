@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo  Exam-Prep Durdurma
echo ============================================
echo.

echo [1/3] Acik uygulama pencereleri kapatiliyor...
taskkill /FI "WINDOWTITLE eq Exam-Prep API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep Web*" /T /F >nul 2>nul

echo [2/3] Artik kalan surecler temizleniyor...
for /f "tokens=2 delims=," %%P in ('tasklist /v /fo csv ^| findstr /i "Exam-Prep API Exam-Prep Web"') do (
  taskkill /PID %%~P /T /F >nul 2>nul
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8080 .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":24486 .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
)

echo [3/3] PostgreSQL durduruluyor...
where docker >nul 2>nul
if not errorlevel 1 (
  docker compose stop postgres >nul 2>nul
)

echo.
echo Tamamlandi. Uygulama kapatildi.
pause
