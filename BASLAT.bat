@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PATH=%~dp0tools\bin;C:\Program Files\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"
set "LAN_IP="
set "WEB_PORT=8082"
set "LEGACY_WEB_PORT=80"
set "API_PORT=8080"


echo.
echo ============================================
echo  Exam-Prep Baslatma
echo ============================================
echo.

echo [0/6] Eski uygulama surecleri temizleniyor...
docker compose stop caddy >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%API_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%WEB_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%LEGACY_WEB_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":24486 .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Exam-Prep Web*" /T /F >nul 2>nul

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [BILGI] pnpm bulunamadi, bagimlilik indirici calistiriliyor...
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

echo [1/6] Bagimliliklar kontrol ediliyor...
if not exist "node_modules\.modules.yaml" (
  echo [BILGI] Bagimliliklar eksik, pnpm install calisiyor...
  call "%~dp0BAGIMLILIKLARI_INDIR.bat" /NOPAUSE
  if errorlevel 1 (
    echo [HATA] Bagimlilik kurulumu basarisiz.
    pause
    exit /b 1
  )
) else (
  echo [OK] Bagimliliklar mevcut, install adimi atlandi.
)

echo [2/6] PostgreSQL baslatiliyor...
docker compose up -d postgres
if errorlevel 1 (
  powershell -NoProfile -Command "$c = [Net.Sockets.TcpClient]::new(); $a = $c.BeginConnect('127.0.0.1', 5432, $null, $null); if ($a.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($a); $c.Close(); exit 0 } else { $c.Close(); exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo [HATA] Docker PostgreSQL baslatilamadi.
    pause
    exit /b 1
  )
  echo [BILGI] Docker komutu basarisiz oldu ama PostgreSQL 5432 portunda calisiyor, devam ediliyor.
)

echo [3/6] PostgreSQL hazir olmasi bekleniyor...
set "_pg_wait=0"
:wait_pg
powershell -NoProfile -Command "$c = [Net.Sockets.TcpClient]::new(); $a = $c.BeginConnect('127.0.0.1', 5432, $null, $null); if ($a.AsyncWaitHandle.WaitOne(2000)) { $c.EndConnect($a); $c.Close(); exit 0 } else { $c.Close(); exit 1 }" >nul 2>nul
if not errorlevel 1 goto pg_ready
for /f "delims=" %%S in ('docker inspect -f "{{.State.Health.Status}}" exam-prep-postgres 2^>nul') do set "PG_HEALTH=%%S"
if /i "!PG_HEALTH!"=="healthy" goto pg_ready
set /a _pg_wait+=1
if !_pg_wait! GEQ 60 (
  echo [HATA] PostgreSQL healthy durumuna gecmedi.
  echo Docker Desktop ve konteyner durumunu kontrol edin.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_pg
:pg_ready

echo [4/6] Veritabani semasi guncelleniyor...
call pnpm --filter @workspace/db run push
if errorlevel 1 (
  echo [HATA] Veritabani semasi uygulanamadi.
  pause
  exit /b 1
)

echo [5/6] API ve Web aciliyor...
if not exist "artifacts\api-server\dist\index.mjs" (
  echo [BILGI] API build eksik, hazirlaniyor...
  call pnpm --filter @workspace/api-server run build
  if errorlevel 1 (
    echo [HATA] API build basarisiz.
    pause
    exit /b 1
  )
)
start "Exam-Prep API" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/api-server run start"

echo [BILGI] API saglik kontrolu bekleniyor...
set "_api_wait=0"
:wait_api
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:%API_PORT%/api/health -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto api_ready
set /a _api_wait+=1
if !_api_wait! GEQ 45 (
  echo [HATA] API saglik yaniti zamaninda gelmedi. API penceresindeki hatayi kontrol edin.
  echo Web baslatilmadi; API olmadan Vite /api proxy hatasi verir.
  goto launch_done
)
timeout /t 2 /nobreak >nul
goto wait_api
:api_ready
echo [OK] API hazir.
echo [BILGI] Web aciliyor...
if not exist "artifacts\yks-tracker\dist\public\index.html" (
  echo [BILGI] Web build eksik, hazirlaniyor...
  call pnpm --filter @workspace/yks-tracker run build
  if errorlevel 1 (
    echo [HATA] Web build basarisiz.
    pause
    exit /b 1
  )
)
start "Exam-Prep Web" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/yks-tracker run start"
echo [BILGI] HTTPS proxy aciliyor...
docker compose up -d caddy
if errorlevel 1 (
  echo [HATA] Caddy HTTPS proxy baslatilamadi. Docker Desktop ve 80/443 portlarini kontrol edin.
  goto launch_done
)
:launch_done

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*vEthernet*' } ^| Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip = '127.0.0.1' }; Write-Output $ip"`) do set "LAN_IP=%%I"

echo.
echo Tamamlandi.
echo Web: https://examduck.mooo.com
echo Web (DuckDNS): https://examduck.duckdns.org
echo Web (yerel ic port): http://localhost:%WEB_PORT%
echo API: http://localhost:%API_PORT%/api/health
echo.
pause
