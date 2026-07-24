@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

echo.
echo ============================================
echo  Exam-Prep Masaustu Uygulama Build
echo ============================================
echo.
echo Bu bilgisayar sunucu olacaksa once BASLAT.bat ile web/API acilir.
echo Windows uygulamasi bu build ile uretilir.
echo Mac paketi icin ayni komutu macOS uzerinde pnpm run desktop:dist:mac olarak calistirin.
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [HATA] pnpm bulunamadi. Once kurun: npm i -g pnpm
  pause
  exit /b 1
)

echo [1/4] Bagimliliklar kontrol ediliyor...
call pnpm install
if errorlevel 1 (
  echo [HATA] pnpm install basarisiz.
  pause
  exit /b 1
)

echo [2/4] Web ve API tip/build kontrolleri calistiriliyor...
call pnpm run typecheck
if errorlevel 1 (
  echo [HATA] Typecheck basarisiz.
  pause
  exit /b 1
)

call pnpm --filter @workspace/api-server run build
if errorlevel 1 (
  echo [HATA] API build basarisiz.
  pause
  exit /b 1
)

call pnpm --filter @workspace/yks-tracker run build
if errorlevel 1 (
  echo [HATA] Web build basarisiz.
  pause
  exit /b 1
)

echo [3/4] Windows masaustu paketleri uretiliyor...
echo        - Setup (kurulum): Exam Prep Setup 0.0.0.exe
echo        - Portable: Exam Prep 0.0.0.exe
call pnpm run desktop:dist:win
if errorlevel 1 (
  echo [HATA] Masaustu build basarisiz.
  pause
  exit /b 1
)

echo [4/4] Tamamlandi.
echo.
echo Cikti klasoru:
echo   artifacts\desktop-shell\release
echo.
echo Senkron kullanim:
echo   1. Sunucu bilgisayarda BASLAT.bat calissin.
echo   2. Diger cihazdaki uygulamada Sunucu Adresini Degistir menusuyle http://SUNUCU_IP:24486 girilsin.
echo.
pause
