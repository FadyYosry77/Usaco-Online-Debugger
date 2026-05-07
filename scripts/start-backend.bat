@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required but was not found on PATH.
  echo Install Node.js, then rerun this script.
  exit /b 1
)

where g++ >nul 2>nul
if errorlevel 1 (
  echo g++ is required but was not found on PATH.
  exit /b 1
)

where gdb >nul 2>nul
if errorlevel 1 (
  echo gdb is required but was not found on PATH.
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if not errorlevel 1 (
    corepack enable >nul 2>nul
    corepack prepare pnpm@10.11.0 --activate >nul 2>nul
  )

  where pnpm >nul 2>nul
  if errorlevel 1 (
    where npx >nul 2>nul
    if errorlevel 1 (
      echo pnpm is required but was not found on PATH.
      echo Install it with: npm install -g pnpm@10.11.0
      exit /b 1
    )
    set "PNPM=npx -y pnpm@10.11.0"
  ) else (
    set "PNPM=pnpm"
  )
) else (
  set "PNPM=pnpm"
)

if "%PNPM%"=="" (
    echo pnpm is required but was not found on PATH.
    echo Install it with: npm install -g pnpm@10.11.0
    exit /b 1
)

if not exist node_modules (
  %PNPM% install --frozen-lockfile
)

%PNPM% build
xcopy apps\extension\dist chrome-extension /E /I /Y >nul
%PNPM% start:backend
