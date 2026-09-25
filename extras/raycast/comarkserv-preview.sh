#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Preview Markdown
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📝
# @raycast.packageName comarkserv
# @raycast.argument1 { "type": "text", "placeholder": "File or folder (default: the Finder selection)", "optional": true }

# Documentation:
# @raycast.description Opens a markdown file or a folder in comarkserv, with live reload. With no argument, it opens the Finder selection.
# @raycast.author Rigo-m
# @raycast.authorURL https://github.com/Rigo-m/comarkserv

# Environment variables:
#   COMARKSERV_COMMAND       The command that starts comarkserv. Default: comarkserv, else npx comarkserv.
#   COMARKSERV_ARGS          More options for comarkserv, for example "--theme base16:nord".
#   COMARKSERV_OPEN_COMMAND  The command that opens the URL. Default: open.

set -euo pipefail

# Your default options for comarkserv. For example: COMARKSERV_ARGS="--theme omarchy"
COMARKSERV_ARGS="${COMARKSERV_ARGS:-}"

# Raycast starts a script with a short PATH. These are the usual places of node and comarkserv.
export PATH="$HOME/Library/pnpm:$HOME/.local/share/pnpm:$HOME/.volta/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

state="${XDG_STATE_HOME:-$HOME/.local/state}/comarkserv/raycast"
mkdir -p "$state"

target="${1:-}"
if [ -z "$target" ]; then
  target=$(osascript <<'APPLESCRIPT' 2>/dev/null || true
tell application "Finder"
  set picked to selection as alias list
  if (count of picked) > 0 then return POSIX path of (item 1 of picked)
  if (count of windows) > 0 then return POSIX path of (target of front window as alias)
end tell
APPLESCRIPT
)
fi
target="${target/#\~/$HOME}"
if [ -z "$target" ] || [ ! -e "$target" ]; then
  echo "Select a markdown file or a folder in Finder"
  exit 1
fi

if [ -d "$target" ]; then
  root=$(cd "$target" && pwd -P)
  file=""
else
  root=$(cd "$(dirname "$target")" && pwd -P)
  file=$(basename "$target")
fi

# One server for each folder. A second preview of the same folder uses the server that runs.
key=$(printf '%s' "$root" | shasum | cut -c1-16)
url=""
if [ -f "$state/$key" ]; then
  read -r pid url < "$state/$key" || true
  kill -0 "${pid:-0}" 2>/dev/null || url=""
fi

if [ -z "$url" ]; then
  if [ -n "${COMARKSERV_COMMAND:-}" ]; then
    read -r -a command <<< "$COMARKSERV_COMMAND"
  elif command -v comarkserv >/dev/null 2>&1; then
    command=(comarkserv)
  else
    command=(npx --yes comarkserv)
  fi
  read -r -a extra <<< "$COMARKSERV_ARGS"
  log="$state/$key.log"
  NO_COLOR=1 nohup "${command[@]}" "$root" --silent ${extra[@]+"${extra[@]}"} > "$log" 2>&1 &
  pid=$!
  # The server prints its URL when it is ready. npx can take some seconds for the first download.
  for _ in $(seq 1 300); do
    # The class excludes control characters, so color codes around the URL do not matter.
    url=$(grep -m 1 'Local' "$log" | grep -oE 'https?://[^[:space:][:cntrl:]]+' | head -1 || true)
    [ -n "$url" ] && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if [ -z "$url" ]; then
    echo "comarkserv did not start. See $log"
    exit 1
  fi
  # Line 1: the process and the URL. Line 2: the folder, for the Raycast extension.
  printf '%s %s\n%s\n' "$pid" "$url" "$root" > "$state/$key"
fi

if [ -n "$file" ]; then
  url="$url$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$file")"
fi
"${COMARKSERV_OPEN_COMMAND:-open}" "$url"
echo "Previewing $(basename "$root")${file:+/$file}"
