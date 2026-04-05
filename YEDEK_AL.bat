@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_PASS=postgres"
set "DOCKER_CONTAINER=exam-prep-postgres"

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

if not exist "backups" mkdir "backups"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "TS=%%T"
set "BACKUP_NAME=backup-%TS%"
set "BACKUP_DIR=backups\%BACKUP_NAME%"
set "DUMP_FILE=%BACKUP_DIR%\database.sql"
set "UPLOADS_SRC=artifacts\api-server\uploads"
set "UPLOADS_DST=%BACKUP_DIR%\uploads"

mkdir "%BACKUP_DIR%" >nul 2>nul

echo.
echo ============================================
echo  Veritabani Yedekleme
echo ============================================
echo Yedek klasoru: %BACKUP_DIR%
echo.

docker ps --format "{{.Names}}" | findstr /i /c:"%DOCKER_CONTAINER%" >nul 2>nul
if not errorlevel 1 (
  echo [1/3] Docker uzerinden DB dump aliniyor...
  docker exec "%DOCKER_CONTAINER%" pg_dump -U "%DB_USER%" -d "%DB_NAME%" --clean --if-exists > "%DUMP_FILE%"
) else (
  where pg_dump >nul 2>nul
  if errorlevel 1 (
    echo [HATA] Ne Docker konteyneri acik ne de pg_dump bulundu.
    rd /s /q "%BACKUP_DIR%" >nul 2>nul
    pause
    exit /b 1
  )
  echo [1/3] Lokal pg_dump ile DB dump aliniyor...
  set "PGPASSWORD=%DB_PASS%"
  pg_dump -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" --clean --if-exists > "%DUMP_FILE%"
)

if errorlevel 1 (
  echo [HATA] Veritabani yedegi olusturulamadi.
  rd /s /q "%BACKUP_DIR%" >nul 2>nul
  pause
  exit /b 1
)

for %%I in ("%DUMP_FILE%") do set "DUMP_SIZE=%%~zI"
if "%DUMP_SIZE%"=="" set "DUMP_SIZE=0"
if %DUMP_SIZE% LSS 100 (
  echo [HATA] Dump dosyasi cok kucuk, islem iptal edildi.
  rd /s /q "%BACKUP_DIR%" >nul 2>nul
  pause
  exit /b 1
)

echo [2/3] Uploads klasoru yedekleniyor...
if exist "%UPLOADS_SRC%" (
  mkdir "%UPLOADS_DST%" >nul 2>nul
  robocopy "%UPLOADS_SRC%" "%UPLOADS_DST%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS >nul
  if errorlevel 8 (
    echo [UYARI] Uploads klasoru yedeklenirken bir hata olustu.
  )
) else (
  echo [BILGI] Uploads klasoru bulunamadi, atlandi.
)

echo [3/3] Metadata yaziliyor...
(
  echo {
  echo   "name": "%BACKUP_NAME%",
  echo   "createdAt": "%DATE% %TIME%",
  echo   "dbName": "%DB_NAME%",
  echo   "dbHost": "%DB_HOST%",
  echo   "dumpFile": "database.sql"
  echo }
) > "%BACKUP_DIR%\metadata.json"

echo.
echo ============================================
echo  YEDEK TAMAMLANDI
echo ============================================
echo Klasor: %BACKUP_DIR%
echo Dump:   %DUMP_FILE%
echo Boyut:  %DUMP_SIZE% bytes
echo.
pause
