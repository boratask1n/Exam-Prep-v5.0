@echo off
setlocal
cd /d "%~dp0"

set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=exam_prep"
set "DB_USER=postgres"
set "DB_PASS=postgres"

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
echo  Exam-Prep Veritabani Arayuzu
echo ============================================
echo Baglanti bilgileri:
echo   Host     : %DB_HOST%
echo   Port     : %DB_PORT%
echo   Database : %DB_NAME%
echo   User     : %DB_USER%
echo   Password : %DB_PASS%
echo ============================================
echo.

echo Secenekler:
echo   1^) pgAdmin 4 ac
echo   2^) DBeaver ac
echo   3^) Her ikisini ac
echo   4^) Sadece baglanti bilgilerini goster
echo.

set /p CHOICE=Seciminiz ^(1/2/3/4^): 
if "%CHOICE%"=="1" goto open_pgadmin
if "%CHOICE%"=="2" goto open_dbeaver
if "%CHOICE%"=="3" goto open_both
if "%CHOICE%"=="4" goto done

echo [UYARI] Gecersiz secim. Sadece bilgiler gosterildi.
goto done

:open_pgadmin
call :start_pgadmin
goto done

:open_dbeaver
call :start_dbeaver
goto done

:open_both
call :start_pgadmin
call :start_dbeaver
goto done

:start_pgadmin
set "PGADMIN_PATH="
if exist "%ProgramFiles%\pgAdmin 4\runtime\pgAdmin4.exe" set "PGADMIN_PATH=%ProgramFiles%\pgAdmin 4\runtime\pgAdmin4.exe"
if exist "%ProgramFiles%\pgAdmin 4\bin\pgAdmin4.exe" set "PGADMIN_PATH=%ProgramFiles%\pgAdmin 4\bin\pgAdmin4.exe"
if exist "%ProgramFiles(x86)%\pgAdmin 4\runtime\pgAdmin4.exe" set "PGADMIN_PATH=%ProgramFiles(x86)%\pgAdmin 4\runtime\pgAdmin4.exe"
if exist "%ProgramFiles(x86)%\pgAdmin 4\bin\pgAdmin4.exe" set "PGADMIN_PATH=%ProgramFiles(x86)%\pgAdmin 4\bin\pgAdmin4.exe"
if exist "%LOCALAPPDATA%\Programs\pgAdmin 4\runtime\pgAdmin4.exe" set "PGADMIN_PATH=%LOCALAPPDATA%\Programs\pgAdmin 4\runtime\pgAdmin4.exe"
if exist "%LOCALAPPDATA%\Programs\pgAdmin 4\bin\pgAdmin4.exe" set "PGADMIN_PATH=%LOCALAPPDATA%\Programs\pgAdmin 4\bin\pgAdmin4.exe"
if defined PGADMIN_PATH (
  echo [OK] pgAdmin aciliyor...
  set "PGADMIN_USER_DATA_DIR=%LOCALAPPDATA%\pgadmin4-runtime-profile"
  set "PGADMIN_CACHE_DIR=%PGADMIN_USER_DATA_DIR%\cache"
  set "PGADMIN_MEDIA_CACHE_DIR=%PGADMIN_USER_DATA_DIR%\media-cache"
  if not exist "%PGADMIN_USER_DATA_DIR%" mkdir "%PGADMIN_USER_DATA_DIR%" >nul 2>nul
  if not exist "%PGADMIN_CACHE_DIR%" mkdir "%PGADMIN_CACHE_DIR%" >nul 2>nul
  if not exist "%PGADMIN_MEDIA_CACHE_DIR%" mkdir "%PGADMIN_MEDIA_CACHE_DIR%" >nul 2>nul
  start "pgAdmin 4" "%PGADMIN_PATH%" --user-data-dir="%PGADMIN_USER_DATA_DIR%" --disk-cache-dir="%PGADMIN_CACHE_DIR%" --media-cache-dir="%PGADMIN_MEDIA_CACHE_DIR%" --disable-application-cache
) else (
  echo [BILGI] pgAdmin bulunamadi. Kurulum: https://www.pgadmin.org/download/
)
exit /b 0

:start_dbeaver
set "DBEAVER_PATH="
if exist "%ProgramFiles%\DBeaver\dbeaver.exe" set "DBEAVER_PATH=%ProgramFiles%\DBeaver\dbeaver.exe"
if exist "%ProgramFiles%\DBeaver Community\dbeaver.exe" set "DBEAVER_PATH=%ProgramFiles%\DBeaver Community\dbeaver.exe"
if exist "%ProgramFiles(x86)%\DBeaver\dbeaver.exe" set "DBEAVER_PATH=%ProgramFiles(x86)%\DBeaver\dbeaver.exe"
if defined DBEAVER_PATH (
  echo [OK] DBeaver aciliyor...
  start "DBeaver" "%DBEAVER_PATH%"
) else (
  echo [BILGI] DBeaver bulunamadi. Kurulum: https://dbeaver.io/download/
)
exit /b 0

:done
echo.
echo Not: Uygulama docker ile calisiyorsa once BASLAT.bat ile postgres'i acik tutun.
echo.
pause
