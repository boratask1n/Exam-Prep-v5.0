@echo off
setlocal
cd /d "%~dp0"
set "LAN_IP="

echo.
echo ============================================
echo  Exam-Prep Kolay Baslatma
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [HATA] pnpm bulunamadi.
  echo Lutfen once kur: npm install -g pnpm
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [HATA] Docker bulunamadi.
  echo Lutfen Docker Desktop kurup ac.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [BILGI] .env dosyasi olusturuldu.
  ) else (
    echo [HATA] .env.example dosyasi bulunamadi.
    pause
    exit /b 1
  )
)

echo [1/4] Bagimliliklar kontrol ediliyor...
call pnpm install
if errorlevel 1 (
  echo [HATA] pnpm install basarisiz.
  pause
  exit /b 1
)

echo [2/4] PostgreSQL baslatiliyor...
docker compose up -d
if errorlevel 1 (
  echo [HATA] Docker veritabani baslatilamadi.
  pause
  exit /b 1
)

echo [BILGI] PostgreSQL baglantisi hazir olana kadar bekleniyor...
set "_pg_wait=0"
:wait_pg
docker exec exam-prep-postgres pg_isready -U postgres -d exam_prep >nul 2>nul
if not errorlevel 1 goto pg_ready
set /a "_pg_wait+=1"
if %_pg_wait% GEQ 45 (
  echo [HATA] PostgreSQL hazir olmadi ^(yaklasik 90 saniye sonra zaman asimi^).
  echo Docker Desktop acik mi ve konteyner calisiyor mu kontrol et.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_pg
:pg_ready

echo [3/4] Veritabani semasi uygulanıyor...
call pnpm --filter @workspace/db run push
if errorlevel 1 (
  echo [HATA] Veritabani semasi uygulanamadi.
  echo .env icindeki DATABASE_URL bilgisini kontrol et.
  pause
  exit /b 1
)

echo [4/4] Sunucular aciliyor...
start "Exam-Prep API" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/api-server run dev"
start "Exam-Prep Web" cmd /k "cd /d ""%~dp0"" && pnpm --filter @workspace/yks-tracker run dev"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*vEthernet*' } ^| Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip = '127.0.0.1' }; Write-Output $ip"`) do set "LAN_IP=%%I"

echo.
echo Tamamlandi.
echo Bu bilgisayardan: http://localhost:24486
echo Agdan erisim icin: http://%LAN_IP%:24486
echo API kontrol: http://localhost:8080/api/health
echo API kontrol (ag): http://%LAN_IP%:8080/api/health
echo.
echo Not: Ilk acilista 20-60 saniye bekleyin.
pause
