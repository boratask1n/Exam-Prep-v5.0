@echo off
setlocal
cd /d "%~dp0"

set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%~dp0tools\bin;%PATH%"
set "PNPM_CMD=%~dp0tools\bin\pnpm.cmd"

echo.
echo ============================================
echo  Exam-Prep Bagimliliklari Indir
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo Node.js LTS kur: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [HATA] npm bulunamadi. Node.js kurulumunu kontrol et.
  pause
  exit /b 1
)

echo [1/4] Node ve npm hazir.
node --version
call npm --version

echo.
echo [2/4] pnpm kontrol ediliyor...
call "%PNPM_CMD%" --version
if errorlevel 1 (
  echo [BILGI] pnpm global olarak kuruluyor...
  call npm install -g pnpm@10.33.0
  if errorlevel 1 (
    echo [HATA] pnpm kurulumu basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo [3/4] Proje bagimliliklari indiriliyor...
call "%PNPM_CMD%" install --frozen-lockfile
if errorlevel 1 (
  echo [UYARI] Frozen lockfile ile kurulum olmadi, normal pnpm install deneniyor...
  call "%PNPM_CMD%" install
  if errorlevel 1 (
    echo [HATA] Bagimlilik kurulumu basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo [4/4] Runtime klasorleri hazirlaniyor...
if not exist "artifacts\api-server\uploads" mkdir "artifacts\api-server\uploads" >nul 2>nul

echo.
echo ============================================
echo  Bagimliliklar Hazir
echo ============================================
echo Sonraki adim:
echo   KURULUM.bat  ^-^> ilk kurulum ve kontroller
echo   BASLAT.bat   ^-^> uygulamayi calistirir
echo.
if /I not "%~1"=="/NOPAUSE" pause
