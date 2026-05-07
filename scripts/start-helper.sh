#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT_DIR="$(pwd)"
PORT="${USACO_HELPER_PORT:-3777}"
BACKEND_URL="http://127.0.0.1:${PORT}"
LOG_DIR="apps/backend/.usaco-helper"
LOG_FILE="${LOG_DIR}/backend.log"

info() {
  printf '\n%s\n' "$1"
}

fail() {
  printf '\n%s\n' "$1" >&2
  printf '%s\n' "Press Enter to close." >&2
  read -r _ || true
  exit 1
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$2"
  fi
}

backend_ok() {
  curl -fsS "${BACKEND_URL}/health" >/dev/null 2>&1
}

open_url() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v google-chrome >/dev/null 2>&1; then
    google-chrome "$url" >/dev/null 2>&1 || true
  elif command -v chromium >/dev/null 2>&1; then
    chromium "$url" >/dev/null 2>&1 || true
  fi
}

sync_extension() {
  mkdir -p chrome-extension
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete apps/extension/dist/ chrome-extension/
  else
    rm -rf chrome-extension
    mkdir -p chrome-extension
    cp -R apps/extension/dist/. chrome-extension/
  fi
}

info "USACO Local Debug Helper"

need_command node "Node.js 20+ is required. Install it from https://nodejs.org, then run START_USACO_HELPER again."
need_command g++ "g++ is required. Install GCC/MinGW/MSYS2, then run START_USACO_HELPER again."
need_command gdb "gdb is required. Install GDB through your compiler toolchain, then run START_USACO_HELPER again."
need_command curl "curl is required to check the local backend. Install curl, then run START_USACO_HELPER again."

PNPM_CMD=(pnpm)
if ! command -v pnpm >/dev/null 2>&1; then
  need_command npx "pnpm is missing and npx is not available. Install pnpm with: npm install -g pnpm@10.11.0"
  PNPM_CMD=(npx -y pnpm@10.11.0)
fi

if [ ! -d node_modules ]; then
  info "Installing project dependencies..."
  "${PNPM_CMD[@]}" install --frozen-lockfile
fi

if [ ! -f apps/backend/dist/index.js ] || [ ! -f chrome-extension/manifest.json ]; then
  info "Building the backend and extension..."
  "${PNPM_CMD[@]}" build
fi

info "Preparing the Chrome extension folder..."
sync_extension

mkdir -p "$LOG_DIR"

if backend_ok; then
  info "Backend is already running at ${BACKEND_URL}."
else
  info "Starting local backend..."
  nohup "${PNPM_CMD[@]}" start:backend >"$LOG_FILE" 2>&1 &

  for _ in $(seq 1 30); do
    if backend_ok; then
      break
    fi
    sleep 1
  done

  if ! backend_ok; then
    tail -n 40 "$LOG_FILE" >&2 || true
    fail "Backend did not start. See ${LOG_FILE} for details."
  fi
fi

info "Backend is ready: ${BACKEND_URL}"
info "Chrome extension folder to select:"
printf '%s\n' "${ROOT_DIR}/chrome-extension"

open_url "chrome://extensions"
open_url "${BACKEND_URL}"

cat <<EOF

Almost done:
1. In Chrome, open chrome://extensions.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select this folder:
   ${ROOT_DIR}/chrome-extension
5. Open your USACO Guide IDE page and refresh it.

Keep this terminal open if you want to see this message.
The backend keeps running in the background.

EOF

read -r -p "Press Enter to close this helper window." _ || true
