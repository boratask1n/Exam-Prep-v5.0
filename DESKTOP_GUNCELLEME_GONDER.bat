@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo  Desktop Guncelleme Gonder
echo ============================================
echo.

call node artifacts\desktop-shell\scripts\publish-update.cjs
if errorlevel 1 (
  echo.
  echo [HATA] Desktop guncelleme paketi hazirlanamadi.
  pause
  exit /b 1
)

echo.
echo [TAMAM] Guncelleme paketi hazir.
echo Klasor:
echo   artifacts\desktop-shell\publish\desktop-updates
echo.
pause
