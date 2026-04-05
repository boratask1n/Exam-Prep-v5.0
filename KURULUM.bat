@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo  Exam-Prep Ilk Kurulum
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [HATA] pnpm bulunamadi. Once kurun: npm i -g pnpm
  pause
  exit /b 1
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

echo [1/6] Bagimliliklar yukleniyor...
call pnpm install
if errorlevel 1 (
  echo [HATA] pnpm install basarisiz.
  pause
  exit /b 1
)

echo [2/6] PostgreSQL baslatiliyor...
docker compose up -d postgres
if errorlevel 1 (
  echo [HATA] PostgreSQL baslatilamadi.
  pause
  exit /b 1
)

echo [3/6] PostgreSQL hazir olmasi bekleniyor...
set "_pg_wait=0"
:wait_pg
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

echo [4/6] Veritabani semasi uygulanuyor...
call pnpm --filter @workspace/db run push
if errorlevel 1 (
  echo [HATA] Schema push basarisiz.
  pause
  exit /b 1
)

echo [5/6] Tip kontrolu calistiriliyor...
call pnpm typecheck
if errorlevel 1 (
  echo [HATA] Typecheck basarisiz.
  pause
  exit /b 1
)

echo [6/6] Uretim build'leri hazirlaniyor...
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

echo.
echo ============================================
echo  Kurulum Tamamlandi
echo ============================================
echo Sonraki adim:
echo   BASLAT.bat  -> uygulamayi calistirir
echo   DURDUR.bat  -> uygulamayi kapatir
echo.
pause
