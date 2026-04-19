@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_PASS=postgres"
set "DOCKER_CONTAINER=exam-prep-postgres"
set "UPLOADS_DIR=artifacts\api-server\uploads"
set "MODE=CLEAN"
if /I "%~1"=="/DRYRUN" set "MODE=DRYRUN"

if exist ".env" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$line=(Get-Content '.env' | Select-String '^DATABASE_URL=' | Select-Object -First 1).Line; if($line){$u=$line -replace '^DATABASE_URL=',''; try{$x=[uri]$u; $pw=''; if($x.UserInfo -match '^[^:]+:(.+)$'){$pw=$matches[1]}; Write-Output ($x.Host+'|'+$x.Port+'|'+$x.AbsolutePath.TrimStart('/')+'|'+$x.UserInfo.Split(':')[0]+'|'+$pw)}catch{}}"`) do (
    for /f "tokens=1,2,3,4,5 delims=|" %%B in ("%%A") do (
      if not "%%B"=="" set "DB_HOST=%%B"
      if not "%%C"=="" set "DB_PORT=%%C"
      if not "%%D"=="" set "DB_NAME=%%D"
      if not "%%E"=="" set "DB_USER=%%E"
      if not "%%F"=="" set "DB_PASS=%%F"
    )
  )
)
if exist ".env_postgres" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$db='';$user='';$pass='';Get-Content '.env_postgres' | ForEach-Object { if($_ -match '^POSTGRES_DB=(.+)$'){$db=$matches[1]}; if($_ -match '^POSTGRES_USER=(.+)$'){$user=$matches[1]}; if($_ -match '^POSTGRES_PASSWORD=(.+)$'){$pass=$matches[1]} }; Write-Output ('localhost|5432|'+$db+'|'+$user+'|'+$pass)"`) do (
    for /f "tokens=1,2,3,4,5 delims=|" %%B in ("%%A") do (
      if "%DB_NAME%"=="exam_prep" if not "%%D"=="" set "DB_NAME=%%D"
      if "%DB_USER%"=="postgres" if not "%%E"=="" set "DB_USER=%%E"
      if "%DB_PASS%"=="postgres" if not "%%F"=="" set "DB_PASS=%%F"
    )
  )
)

echo.
echo ============================================
if /I "%MODE%"=="DRYRUN" (
  echo  Veritabani Temizleme Dogrulama ^(DRY-RUN^)
) else (
  echo  Veritabani Temizleme ^(Tum Veriler^)
)
echo ============================================
echo.
echo Silinecek tablolar:
echo   - drawings
echo   - test_session_progress
echo   - test_solutions
echo   - test_session_questions
echo   - test_sessions
echo   - test_result_topic_stats
echo   - test_result_summaries
echo   - analytics_ai_insights
echo   - question_review_stats
echo   - note_review_stats
echo   - notes
echo   - questions
echo   - auth_sessions
echo   - users
echo   - uploads klasoru
echo.

set "SQL=TRUNCATE TABLE analytics_ai_insights, test_result_topic_stats, test_result_summaries, test_session_progress, test_solutions, test_session_questions, test_sessions, drawings, question_review_stats, note_review_stats, notes, questions, auth_sessions, users RESTART IDENTITY CASCADE;"
set "SQL_DRYRUN=BEGIN; %SQL% ROLLBACK;"

if /I not "%MODE%"=="DRYRUN" (
  set /p TAKE_BACKUP=Temizlemeden once yedek almak ister misiniz? ^(E/H^): 
  if /I "%TAKE_BACKUP%"=="E" (
    call "%~dp0YEDEK_AL.bat"
    if errorlevel 1 (
      echo [HATA] Yedek alma basarisiz. Temizleme islemi durduruldu.
      pause
      exit /b 1
    )
  )

  echo.
  set /p CONFIRM=Devam etmek icin EVET yazin: 
  if /I not "%CONFIRM%"=="EVET" (
    echo Islem iptal edildi.
    pause
    exit /b 0
  )
)

docker ps --format "{{.Names}}" 2>nul | findstr /i /c:"%DOCKER_CONTAINER%" >nul 2>nul
if not errorlevel 1 (
  if /I "%MODE%"=="DRYRUN" (
    echo [1/2] Docker uzerinden SQL dogrulamasi yapiliyor ^(ROLLBACK^)...
    docker exec -i "%DOCKER_CONTAINER%" psql -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL_DRYRUN%" >nul
  ) else (
    echo [1/2] Docker uzerinden veritabani temizleniyor...
    docker exec -i "%DOCKER_CONTAINER%" psql -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL%" >nul
  )
) else (
  where psql >nul 2>nul
  if errorlevel 1 (
    echo [BILGI] psql bulunamadi. Node ^+ pg fallback kullaniliyor...
    set "SQL_FOR_NODE=%SQL%"
    if /I "%MODE%"=="DRYRUN" set "SQL_FOR_NODE=%SQL_DRYRUN%"
    set "DB_CLEAN_SQL=%SQL_FOR_NODE%"
    set "DATABASE_URL_FALLBACK=postgresql://%DB_USER%:%DB_PASS%@%DB_HOST%:%DB_PORT%/%DB_NAME%"
    pushd "lib\db"
    node --env-file-if-exists=../../.env --input-type=module -e "import pg from 'pg'; const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_FALLBACK; const pool = new pg.Pool({ connectionString }); await pool.query(process.env.DB_CLEAN_SQL || ''); await pool.end();" >nul
    set "NODE_FALLBACK_EXIT=%ERRORLEVEL%"
    popd
    if not "%NODE_FALLBACK_EXIT%"=="0" (
      echo [HATA] Ne Docker konteyneri acik ne de psql bulundu; Node fallback de basarisiz oldu.
      pause
      exit /b 1
    )
    goto cleanup_done
  )
  if /I "%MODE%"=="DRYRUN" (
    echo [1/2] Lokal psql ile SQL dogrulamasi yapiliyor ^(ROLLBACK^)...
  ) else (
    echo [1/2] Lokal psql ile veritabani temizleniyor...
  )
  set "PGPASSWORD=%DB_PASS%"
  if /I "%MODE%"=="DRYRUN" (
    psql -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL_DRYRUN%" >nul
  ) else (
    psql -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL%" >nul
  )
)
:cleanup_done

if errorlevel 1 (
  if /I "%MODE%"=="DRYRUN" (
    echo [HATA] SQL dogrulamasi basarisiz.
  ) else (
    echo [HATA] Veritabani temizlenemedi.
  )
  pause
  exit /b 1
)

if /I "%MODE%"=="DRYRUN" (
  echo [2/2] Uploads klasoru korunuyor ^(DRY-RUN^).
) else (
  echo [2/2] Uploads klasoru temizleniyor...
  if exist "%UPLOADS_DIR%" (
    rmdir /s /q "%UPLOADS_DIR%" >nul 2>nul
  )
  mkdir "%UPLOADS_DIR%" >nul 2>nul
)

echo.
if /I "%MODE%"=="DRYRUN" (
  echo Tamamlandi. SQL dogrulamasi basarili.
) else (
  echo Tamamlandi. Veritabani verileri sifirlandi.
)
pause
