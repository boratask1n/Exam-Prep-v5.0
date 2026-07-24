@echo off
setlocal
cd /d "%~dp0..\.."

echo.
echo ============================================
echo  Veritabani Temizleme SQL Dogrulama
echo ============================================
echo Bu islem veri silmez. TRUNCATE komutunu
echo transaction icinde calistirip ROLLBACK yapar.
echo.

call "%~dp0VERITABANI_TEMIZLE.bat" /DRYRUN
exit /b %errorlevel%
