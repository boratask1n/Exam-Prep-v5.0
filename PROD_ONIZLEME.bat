@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "LAN_IP="

echo.
echo ============================================
echo  Exam-Prep Production Onizleme
echo ============================================
echo.

echo [1/6] Eski API ve Web surecleri kapatiliyor...
taskkill /FI "WINDOWTITLE eq Exam-Prep API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep Web*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep Web Preview*" /T /F >nul 2>nul

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8080 .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":24486 .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
)

echo [2/6] Gerekli araclar kontrol ediliyor...
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
    echo [HATA] .env ve .env.example bulunamadi.
    pause
    exit /b 1
  )
)

if not exist ".env_postgres" (
  if exist ".env_postgres.example" (
    copy /y ".env_postgres.example" ".env_postgres" >nul
    echo [BILGI] .env_postgres olusturuldu.
  ) else (
    echo [HATA] .env_postgres ve .env_postgres.example bulunamadi.
    pause
    exit /b 1
  )
)

if not exist "artifacts\api-server\uploads" (
  mkdir "artifacts\api-server\uploads" >nul 2>nul
)

if not exist "node_modules\.modules.yaml" (
  echo [BILGI] Bagimliliklar eksik, pnpm install calisiyor...
  call pnpm install
  if errorlevel 1 (
    echo [HATA] pnpm install basarisiz.
    pause
    exit /b 1
  )
)

echo [3/6] PostgreSQL baslatiliyor...
docker compose up -d postgres
if errorlevel 1 (
  echo [HATA] Docker PostgreSQL baslatilamadi.
  pause
  exit /b 1
)

echo [4/6] PostgreSQL hazirligi bekleniyor...
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

echo [5/6] Veritabani semasi ve production build hazirlaniyor...
call pnpm --filter @workspace/db run push >nul
if errorlevel 1 (
  echo [HATA] Veritabani semasi uygulanamadi.
  pause
  exit /b 1
)

call pnpm --filter @workspace/yks-tracker run build
if errorlevel 1 (
  echo [HATA] Frontend production build basarisiz.
  pause
  exit /b 1
)

echo [6/6] API ve Production Preview aciliyor...
start "Exam-Prep API" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/api-server run dev"

echo [BILGI] API saglik kontrolu bekleniyor...
set "_api_wait=0"
:wait_api
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/health -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto api_ready
set /a _api_wait+=1
if !_api_wait! GEQ 45 (
  echo [HATA] API saglik yaniti zamaninda gelmedi. API penceresindeki hatayi kontrol edin.
  echo Web Preview baslatilmadi.
  goto launch_done
)
timeout /t 2 /nobreak >nul
goto wait_api
:api_ready
echo [OK] API hazir.
start "Exam-Prep Web Preview" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/yks-tracker run serve -- --port 24486 --strictPort"

:launch_done
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*vEthernet*' } ^| Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip = '127.0.0.1' }; Write-Output $ip"`) do set "LAN_IP=%%I"

echo.
echo Tamamlandi.
echo Production Preview: http://localhost:24486
echo Production Preview (ag): http://%LAN_IP%:24486
echo API: http://localhost:8080/api/health
echo API (ag): http://%LAN_IP%:8080/api/health
echo.
pause
