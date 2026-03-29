@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================
echo  YKS Exam Prep - Veritabani Yedek Alma
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

if not exist "backups" mkdir "backups"

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "TS=%%T"
set "BACKUP_FILE=backups\exam_prep_%TS%.sql"

echo.
echo Yedekleme Bilgileri:
echo   - Veritabani: %DB_NAME%
echo   - Host: %DB_HOST%
echo   - Port: %DB_PORT%
echo   - Kullanici: %DB_USER%
echo   - Hedef: %BACKUP_FILE%
echo.

echo [1/2] Veritabani baglantisi kontrol ediliyor...

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

echo [2/2] Yedek aliniyor...

if "%USE_DOCKER%"=="1" (
    docker exec %DOCKER_CONTAINER% pg_dump -U %DB_USER% -d %DB_NAME% --clean --if-exists > "%BACKUP_FILE%"
) else (
    if defined PGPASSWORD (
        pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% --clean --if-exists > "%BACKUP_FILE%"
    ) else (
        pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% --clean --if-exists -W > "%BACKUP_FILE%"
    )
)

if errorlevel 1 (
    echo [HATA] Yedek alma basarisiz.
    if exist "%BACKUP_FILE%" del "%BACKUP_FILE%"
    pause
    exit /b 1
)

for %%I in ("%BACKUP_FILE%") do set "SIZE=%%~zI"
if %SIZE% lss 100 (
    echo [HATA] Yedek dosyasi cok kucuk, hata olabilir.
    del "%BACKUP_FILE%"
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Yedekleme Basarili!
echo ============================================
echo.
echo Yedek dosyasi: %BACKUP_FILE%
echo Boyut: %SIZE% bytes
echo.
echo Son 5 yedek:
dir /b /o-d "backups\*.sql" 2>nul | findstr /n "." | findstr "^[1-5]:"
echo.
pause
