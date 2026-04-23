@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PATH=%~dp0tools\bin;C:\Program Files\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"

echo.
echo ============================================
echo  Exam-Prep Ilk Kurulum
echo ============================================
echo.

if not exist "node_modules\.modules.yaml" (
  echo [BILGI] Bagimliliklar eksik, BAGIMLILIKLARI_INDIR.bat calisiyor...
  call "%~dp0BAGIMLILIKLARI_INDIR.bat" /NOPAUSE
  if errorlevel 1 (
    echo [HATA] Bagimlilik kurulumu basarisiz.
    pause
    exit /b 1
  )
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker bulunamadi. Docker Desktop kurup acin.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [BILGI] .env olusturuldu.
  ) else (
    echo [HATA] .env.example bulunamadi.
    pause
    exit /b 1
  )
)

if not exist ".env_postgres" (
  if exist ".env_postgres.example" (
    copy /y ".env_postgres.example" ".env_postgres" >nul
    echo [BILGI] .env_postgres olusturuldu.
  ) else (
    echo [HATA] .env_postgres.example bulunamadi.
    pause
    exit /b 1
  )
)

if not exist "artifacts\api-server\uploads" (
  mkdir "artifacts\api-server\uploads" >nul 2>nul
)

echo [1/8] Bagimliliklar hazir.

echo [2/8] PostgreSQL baslatiliyor...
docker compose up -d postgres
if errorlevel 1 (
  powershell -NoProfile -Command "$c = [Net.Sockets.TcpClient]::new(); $a = $c.BeginConnect('127.0.0.1', 5432, $null, $null); if ($a.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($a); $c.Close(); exit 0 } else { $c.Close(); exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo [HATA] PostgreSQL baslatilamadi.
    pause
    exit /b 1
  )
  echo [BILGI] Docker komutu basarisiz oldu ama PostgreSQL 5432 portunda calisiyor, devam ediliyor.
)

echo [3/8] PostgreSQL hazir olmasi bekleniyor...
set "_pg_wait=0"
:wait_pg
powershell -NoProfile -Command "$c = [Net.Sockets.TcpClient]::new(); $a = $c.BeginConnect('127.0.0.1', 5432, $null, $null); if ($a.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($a); $c.Close(); exit 0 } else { $c.Close(); exit 1 }" >nul 2>nul
if not errorlevel 1 goto pg_ready
for /f "delims=" %%S in ('docker inspect -f "{{.State.Health.Status}}" exam-prep-postgres 2^>nul') do set "PG_HEALTH=%%S"
if /i "!PG_HEALTH!"=="healthy" goto pg_ready
set /a _pg_wait+=1
if !_pg_wait! GEQ 60 (
  echo [HATA] PostgreSQL healthy durumuna gecmedi.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_pg
:pg_ready

echo [4/8] Veritabani semasi uygulaniyor...
call pnpm --filter @workspace/db run push
if errorlevel 1 (
  echo [HATA] Schema push basarisiz.
  pause
  exit /b 1
)

echo [5/8] Tip kontrolu calistiriliyor...
call pnpm run typecheck:libs
if errorlevel 1 (
  echo [HATA] Kutuphane typecheck basarisiz.
  pause
  exit /b 1
)

call pnpm --filter @workspace/api-server run typecheck
if errorlevel 1 (
  echo [HATA] API typecheck basarisiz.
  pause
  exit /b 1
)

call pnpm --filter @workspace/yks-tracker run typecheck
if errorlevel 1 (
  echo [HATA] Web typecheck basarisiz.
  pause
  exit /b 1
)

echo [6/8] Uretim build'leri hazirlaniyor...
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

echo [7/8] API smoke testi calistiriliyor...
call pnpm smoke:api
if errorlevel 1 (
  echo [HATA] API smoke testi basarisiz.
  pause
  exit /b 1
)

echo [8/8] Kurulum kontrolleri tamamlandi...

echo.
echo ============================================
echo  Kurulum Tamamlandi
echo ============================================
echo Sonraki adim:
echo   BASLAT.bat  ^-^> uygulamayi calistirir
echo   DURDUR.bat  ^-^> uygulamayi kapatir
echo.
pause
