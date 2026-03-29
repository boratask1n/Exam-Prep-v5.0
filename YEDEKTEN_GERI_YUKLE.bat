@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo  YKS Exam Prep - Yedekten Geri Yukleme
echo ============================================
echo.

REM .env dosyasindan DATABASE_URL oku
set "ENV_FILE=.env"
set "DATABASE_URL="
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_HOST=localhost"
set "DB_PORT=5432"

if not exist "%ENV_FILE%" (
    echo [UYARI] .env dosyasi bulunamadi, varsayilan ayarlar kullanilacak.
) else (
    REM PowerShell ile URL parse et
    for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "$url = (Get-Content '%ENV_FILE%' | Select-String '^DATABASE_URL=') -replace 'DATABASE_URL=',''; if ($url -match 'postgresql://([^:]+):[^@]+@([^:]+):([^/]+)/(.+)') { Write-Host ('{0}|{1}|{2}|{3}' -f $matches[1],$matches[2],$matches[3],$matches[4]) }"`) do (
        for /f "tokens=1,2,3,4 delims=|" %%b in ("%%a") do (
            set "DB_USER=%%b"
            set "DB_HOST=%%c"
            set "DB_PORT=%%d"
            set "DB_NAME=%%e"
        )
    )
)

set "DOCKER_CONTAINER=exam-prep-postgres"
set "USE_DOCKER=0"

docker ps --format "{{.Names}}" | findstr /i /c:"%DOCKER_CONTAINER%" >nul 2>&1
if %ERRORLEVEL% == 0 (
    set "USE_DOCKER=1"
    echo [BILGI] Docker konteyneri bulundu: %DOCKER_CONTAINER%
) else (
    echo [BILGI] Docker konteyneri bulunamadi, psql kullanilacak.
)

echo.
echo Mevcut yedekler:
dir /b /o-d "backups\*.sql" 2>nul
if %ERRORLEVEL% neq 0 (
    echo [HATA] backups klasorunde yedek dosyasi bulunamadi.
    pause
    exit /b 1
)

echo.
set /p BACKUP_NAME=Yuklemek istediginiz yedek dosyasinin adini yazin: 
set "BACKUP_FILE=backups\%BACKUP_NAME%"

if not exist "%BACKUP_FILE%" (
    echo [HATA] Dosya bulunamadi: %BACKUP_FILE%
    pause
    exit /b 1
)

echo.
echo ============================================
echo  UYARI: BU ISLEM GERI ALINAMAZ!
echo ============================================
echo.
echo Mevcut veriler SILINECEK ve secilen yedek yuklenecek:
echo   - Veritabani: %DB_NAME%
echo   - Host: %DB_HOST%
echo   - Yedek: %BACKUP_NAME%
echo.
set /p CONFIRM=Devam etmek icin EVET yazin: 
if /I not "%CONFIRM%"=="EVET" (
    echo Islem iptal edildi.
    pause
    exit /b 0
)

echo.
echo [1/3] Veritabani baglantisi kontrol ediliyor...

if "%USE_DOCKER%"=="1" (
    docker exec %DOCKER_CONTAINER% pg_isready -U %DB_USER% >nul 2>nul
    if errorlevel 1 (
        echo [HATA] Docker veritabani konteyneri hazir degil.
        pause
        exit /b 1
    )
) else (
    set "PGPASSWORD="
    for /f "tokens=*" %%a in ('findstr /B "DATABASE_URL=" "%ENV_FILE%"') do (
        set "url=%%a"
        for /f "delims=:@" %%p in ("!url!") do (
            set "temp=%%p"
            for /f "delims=" %%q in ("!temp:*:=!") do (
                if not "%%q"=="" set "PGPASSWORD=%%q"
            )
        )
    )
    
    pg_isready -h %DB_HOST% -p %DB_PORT% -U %DB_USER% >nul 2>nul
    if errorlevel 1 (
        echo [HATA] Veritabanina baglanilamadi.
        pause
        exit /b 1
    )
)

echo [2/3] Mevcut veriler temizleniyor...

if "%USE_DOCKER%"=="1" (
    docker exec %DOCKER_CONTAINER% psql -U %DB_USER% -d %DB_NAME% -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >nul 2>&1
) else (
    if defined PGPASSWORD (
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >nul 2>&1
    ) else (
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -W -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >nul 2>&1
    )
)

if errorlevel 1 (
    echo [HATA] Mevcut veriler temizlenemedi.
    pause
    exit /b 1
)

echo [3/3] Yedek geri yukleniyor...

if "%USE_DOCKER%"=="1" (
    type "%BACKUP_FILE%" | docker exec -i %DOCKER_CONTAINER% psql -U %DB_USER% -d %DB_NAME% >nul 2>&1
) else (
    if defined PGPASSWORD (
        type "%BACKUP_FILE%" | psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% >nul 2>&1
    ) else (
        type "%BACKUP_FILE%" | psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -W >nul 2>&1
    )
)

if errorlevel 1 (
    echo [HATA] Geri yukleme basarisiz.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Geri Yukleme Tamamlandi!
echo ============================================
echo.
echo Yedek basariyla geri yuklendi: %BACKUP_NAME%
echo.
pause
