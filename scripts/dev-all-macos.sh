#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is intended for macOS only."
  exit 1
fi

if ! command -v osascript >/dev/null 2>&1; then
  echo "osascript not found. Please install/enable AppleScript support."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

open_terminal_process() {
  local title="$1"
  local command="$2"

  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd \"$ROOT_DIR\" && echo '[$title] starting...' && $command"
end tell
EOF
}

open_terminal_process "api" "npm run dev"
open_terminal_process "sync-worker" "npm run dev:worker:sync"
open_terminal_process "sync-scheduler" "npm run dev:worker:scheduler -- --loop"
open_terminal_process "callback-worker" "npm run dev:worker:callback"
open_terminal_process "callback-scheduler" "npm run dev:worker:callback:scheduler -- --loop"

echo "Launched 5 Terminal windows for API + workers/schedulers."