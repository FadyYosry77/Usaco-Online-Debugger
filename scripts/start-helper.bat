@echo off
setlocal
cd /d "%~dp0\.."

set "PORT=3777"
set "BACKEND_URL=http://127.0.0.1:%PORT%"
set "LOG_DIR=apps\backend\.usaco-helper"
set "LOG_FILE=%LOG_DIR%\backend.log"

echo.
echo USACO Local Debug Helper

where node >nul 2>nul
if errorlevel 1 goto missing_node

where g++ >nul 2>nul
if errorlevel 1 goto missing_gpp

where gdb >nul 2>nul
if errorlevel 1 goto missing_gdb

where pnpm >nul 2>nul
if errorlevel 1 (
  where npx >nul 2>nul
  if errorlevel 1 goto missing_pnpm
  set "PNPM=npx -y pnpm@10.11.0"
) else (
  set "PNPM=pnpm"
)

if not exist node_modules (
  echo.
  echo Installing project dependencies...
  %PNPM% install --frozen-lockfile
  if errorlevel 1 goto failed
)

if not exist apps\backend\dist\index.js (
  echo.
  echo Building the backend and extension...
  %PNPM% build
  if errorlevel 1 goto failed
)

if not exist chrome-extension\manifest.json (
  echo.
  echo Building the backend and extension...
  %PNPM% build
  if errorlevel 1 goto failed
)

echo.
echo Preparing the Chrome extension folder...
if not exist chrome-extension mkdir chrome-extension
xcopy apps\extension\dist chrome-extension /E /I /Y >nul

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest '%BACKEND_URL%/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo Starting local backend...
  start "USACO Helper Backend" /min cmd /c "%PNPM% start:backend ^> %LOG_FILE% 2^>^&1"
)

for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest '%BACKEND_URL%/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo.
echo Backend did not start. See %LOG_FILE% for details.
pause
exit /b 1

:ready
echo.
echo Backend is ready: %BACKEND_URL%
echo.
echo Chrome extension folder to select:
echo %cd%\chrome-extension
echo.
start chrome://extensions
start %BACKEND_URL%
echo Almost done:
echo 1. In Chrome, open chrome://extensions.
echo 2. Enable Developer Mode.
echo 3. Click Load unpacked.
echo 4. Select this folder:
echo    %cd%\chrome-extension
echo 5. Open your USACO Guide IDE page and refresh it.
echo.
pause
exit /b 0

:missing_node
echo Node.js 20+ is required. Install it from https://nodejs.org, then run START_USACO_HELPER again.
pause
exit /b 1

:missing_gpp
echo g++ is required. Install GCC/MinGW/MSYS2, then run START_USACO_HELPER again.
pause
exit /b 1

:missing_gdb
echo gdb is required. Install GDB through your compiler toolchain, then run START_USACO_HELPER again.
pause
exit /b 1

:missing_pnpm
echo pnpm is missing and npx is not available. Install pnpm with:
echo npm install -g pnpm@10.11.0
pause
exit /b 1

:failed
echo Setup failed. Check the output above.
pause
exit /b 1
