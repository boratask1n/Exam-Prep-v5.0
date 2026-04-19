@echo off
setlocal
cd /d "%~dp0..\.."

echo.
echo ============================================
echo  Exam-Prep Masaustu Ac
echo ============================================
echo.
echo Sunucu bu bilgisayarsa BASLAT.bat calismali.
echo Baska bir sunucuya baglanacaksan uygulamadaki Exam Prep > Sunucu Adresini Degistir menusunu kullan.
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [HATA] pnpm bulunamadi. Once kurun: npm i -g pnpm
  pause
  exit /b 1
)

call pnpm --filter @workspace/desktop-shell run dev
pause
