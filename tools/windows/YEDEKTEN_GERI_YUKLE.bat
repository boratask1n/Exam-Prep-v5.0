@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_PASS=postgres"
set "DOCKER_CONTAINER=exam-prep-postgres"
set "UPLOADS_DST=artifacts\api-server\uploads"

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
echo  Yedekten Geri Yukleme
echo ============================================
echo.

if not exist "backups" (
  echo [HATA] backups klasoru bulunamadi.
  pause
  exit /b 1
)

echo Mevcut yedekler:
for /f "delims=" %%D in ('dir /b /ad /o-d "backups"') do echo   %%D
echo.

set /p BACKUP_NAME=Geri yuklemek istediginiz yedek klasorunu yazin: 
if "%BACKUP_NAME%"=="" (
  echo [HATA] Yedek adi bos olamaz.
  pause
  exit /b 1
)

set "BACKUP_DIR=backups\%BACKUP_NAME%"
set "DUMP_FILE=%BACKUP_DIR%\database.sql"
set "UPLOADS_SRC=%BACKUP_DIR%\uploads"

if not exist "%DUMP_FILE%" (
  echo [HATA] Dump dosyasi bulunamadi: %DUMP_FILE%
  pause
  exit /b 1
)

echo.
echo UYARI: Mevcut veriler silinip secilen yedek yuklenecek.
set /p CONFIRM=Devam icin EVET yazin: 
if /I not "%CONFIRM%"=="EVET" (
  echo Islem iptal edildi.
  pause
  exit /b 0
)

docker ps --format "{{.Names}}" 2>nul | findstr /i /c:"%DOCKER_CONTAINER%" >nul 2>nul
if not errorlevel 1 (
  echo [1/3] Docker uzerinden veritabani geri yukleniyor...
  type "%DUMP_FILE%" | docker exec -i "%DOCKER_CONTAINER%" psql -U "%DB_USER%" -d "%DB_NAME%" >nul
) else (
  where psql >nul 2>nul
  if errorlevel 1 (
    echo [HATA] Ne Docker konteyneri acik ne de psql bulundu.
    pause
    exit /b 1
  )
  echo [1/3] Lokal psql ile veritabani geri yukleniyor...
  set "PGPASSWORD=%DB_PASS%"
  type "%DUMP_FILE%" | psql -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" >nul
)

if errorlevel 1 (
  echo [HATA] Veritabani geri yukleme basarisiz.
  pause
  exit /b 1
)

echo [2/3] Uploads klasoru temizleniyor...
if exist "%UPLOADS_DST%" (
  rmdir /s /q "%UPLOADS_DST%" >nul 2>nul
)
mkdir "%UPLOADS_DST%" >nul 2>nul

echo [3/3] Uploads geri yukleniyor...
if exist "%UPLOADS_SRC%" (
  robocopy "%UPLOADS_SRC%" "%UPLOADS_DST%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS >nul
  if errorlevel 8 (
    echo [UYARI] Uploads geri yuklenirken bir hata olustu.
  )
) else (
  echo [BILGI] Yedekte uploads klasoru yok, atlandi.
)

echo.
echo ============================================
echo  GERI YUKLEME TAMAMLANDI
echo ============================================
echo Yedek: %BACKUP_NAME%
echo.
pause
