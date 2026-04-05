@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_PASS=postgres"
set "DOCKER_CONTAINER=exam-prep-postgres"
set "UPLOADS_DIR=artifacts\api-server\uploads"

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

echo.
echo ============================================
echo  Veritabani Temizleme (Tum Veriler)
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
echo   - notes
echo   - questions
echo   - uploads klasoru
echo.

set /p TAKE_BACKUP=Temizlemeden once yedek almak ister misiniz? (E/H): 
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

set "SQL=TRUNCATE TABLE test_result_topic_stats, test_result_summaries, test_session_progress, test_solutions, test_session_questions, test_sessions, drawings, notes, questions RESTART IDENTITY CASCADE;"

docker ps --format "{{.Names}}" | findstr /i /c:"%DOCKER_CONTAINER%" >nul 2>nul
if not errorlevel 1 (
  echo [1/2] Docker uzerinden veritabani temizleniyor...
  docker exec -i "%DOCKER_CONTAINER%" psql -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL%" >nul
) else (
  where psql >nul 2>nul
  if errorlevel 1 (
    echo [HATA] Ne Docker konteyneri acik ne de psql bulundu.
    pause
    exit /b 1
  )
  echo [1/2] Lokal psql ile veritabani temizleniyor...
  set "PGPASSWORD=%DB_PASS%"
  psql -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" -c "%SQL%" >nul
)

if errorlevel 1 (
  echo [HATA] Veritabani temizlenemedi.
  pause
  exit /b 1
)

echo [2/2] Uploads klasoru temizleniyor...
if exist "%UPLOADS_DIR%" (
  rmdir /s /q "%UPLOADS_DIR%" >nul 2>nul
)
mkdir "%UPLOADS_DIR%" >nul 2>nul

echo.
echo Tamamlandi. Veritabani verileri sifirlandi.
pause
