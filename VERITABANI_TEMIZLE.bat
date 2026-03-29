@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==========================================
echo   VERITABANI TEMIZLEME ARACI
echo ==========================================
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
echo ==========================================
echo   UYARI: BU ISLEM GERI ALINAMAZ!
echo ==========================================
echo.
echo Asagidaki tum tablolardaki veriler silinecek:
echo   - drawings (Cizimler)
echo   - test_session_questions (Test soru iliskileri)
echo   - test_sessions (Test oturumlari)
echo   - questions (Sorular)
echo.
echo Veritabani: %DB_NAME%
echo Host: %DB_HOST%
echo Port: %DB_PORT%
echo.

set /p CONFIRM="Tum verileri silmek istediginize emin misiniz? (EVET/HAYIR): "
if /I not "%CONFIRM%"=="EVET" (
    echo.
    echo [BILGI] Islem iptal edildi. Veritabani degismedi.
    pause
    exit /b 0
)

echo.
echo [ISLEM] Veritabani temizleniyor...
echo.

REM SQL komutlarini gecici dosyaya yaz
set "TEMP_SQL=%TEMP%\db_reset_%RANDOM%.sql"
(
echo -- Foreign key sirasina gore tablolari temizle
echo TRUNCATE TABLE drawings CASCADE;
echo TRUNCATE TABLE test_session_questions CASCADE;
echo TRUNCATE TABLE test_sessions CASCADE;
echo TRUNCATE TABLE questions CASCADE;
echo.
echo -- Sequence'leri sifirla
echo ALTER SEQUENCE IF EXISTS drawings_id_seq RESTART WITH 1;
echo ALTER SEQUENCE IF EXISTS test_session_questions_id_seq RESTART WITH 1;
echo ALTER SEQUENCE IF EXISTS test_sessions_id_seq RESTART WITH 1;
echo ALTER SEQUENCE IF EXISTS questions_id_seq RESTART WITH 1;
) > "%TEMP_SQL%"

REM SQL komutlarini calistir
echo [BILGI] SQL komutlari calistiriliyor...

if "%USE_DOCKER%"=="1" (
    echo [BILGI] Docker ile calistiriliyor...
    docker exec -i %DOCKER_CONTAINER% psql -U %DB_USER% -d %DB_NAME% < "%TEMP_SQL%"
) else (
    echo [BILGI] psql ile calistiriliyor...
    set "PGPASSWORD="
    for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "$url = (Get-Content '%ENV_FILE%' | Select-String '^DATABASE_URL=') -replace 'DATABASE_URL=',''; if ($url -match 'postgresql://[^:]+:([^@]+)@') { $matches[1] } else { '' }"`) do set "PGPASSWORD=%%p"
    
    if defined PGPASSWORD (
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%TEMP_SQL%"
    ) else (
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -W -f "%TEMP_SQL%"
    )
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [HATA] Veritabani temizlenirken hata olustu!
    echo.
    del /q "%TEMP_SQL%" 2>nul
    pause
    exit /b 1
)

REM Gecici dosyayi temizle
del /q "%TEMP_SQL%" 2>nul

echo.
echo ==========================================
echo   [BASARILI] Veritabani temizlendi!
echo ==========================================
echo.
echo - Tum tablolar bosaltildi
echo - ID sequence'leri sifirlandi
echo - Tablo yapilari korundu
echo.
pause
