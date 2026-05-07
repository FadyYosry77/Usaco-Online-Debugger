#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required but was not found on PATH."
  echo "Install Node.js, then rerun this script."
  exit 1
fi

if ! command -v g++ >/dev/null 2>&1; then
  echo "g++ is required but was not found on PATH."
  exit 1
fi

if ! command -v gdb >/dev/null 2>&1; then
  echo "gdb is required but was not found on PATH."
  exit 1
fi

PNPM_CMD=(pnpm)

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    if corepack enable >/dev/null 2>&1 && corepack prepare pnpm@10.11.0 --activate >/dev/null 2>&1; then
      PNPM_CMD=(pnpm)
    elif command -v npx >/dev/null 2>&1; then
      PNPM_CMD=(npx -y pnpm@10.11.0)
    else
      echo "pnpm is required but was not found on PATH."
      echo "Install it with: npm install -g pnpm@10.11.0"
      exit 1
    fi
  elif command -v npx >/dev/null 2>&1; then
    PNPM_CMD=(npx -y pnpm@10.11.0)
  else
    echo "pnpm is required but was not found on PATH."
    echo "Install it with: npm install -g pnpm@10.11.0"
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  "${PNPM_CMD[@]}" install --frozen-lockfile
fi

"${PNPM_CMD[@]}" build
mkdir -p chrome-extension
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete apps/extension/dist/ chrome-extension/
else
  rm -rf chrome-extension
  mkdir -p chrome-extension
  cp -R apps/extension/dist/. chrome-extension/
fi
"${PNPM_CMD[@]}" start:backend
