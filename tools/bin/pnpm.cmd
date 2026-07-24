@echo off
setlocal
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
set "LOCAL_PNPM=%~dp0..\pnpm\node_modules\pnpm\bin\pnpm.cjs"
if exist "%LOCAL_PNPM%" (
  "%NODE_EXE%" "%LOCAL_PNPM%" %*
  exit /b %ERRORLEVEL%
)

if exist "%APPDATA%\npm\pnpm.cmd" (
  call "%APPDATA%\npm\pnpm.cmd" %*
  exit /b %ERRORLEVEL%
)

if exist "%LOCALAPPDATA%\pnpm\pnpm.cmd" (
  call "%LOCALAPPDATA%\pnpm\pnpm.cmd" %*
  exit /b %ERRORLEVEL%
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [HATA] pnpm calistirilamadi. Node.js ve npm kurulu olmali.
  exit /b 1
)

call npm exec --yes pnpm@10.33.0 -- %*
exit /b %ERRORLEVEL%
