#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Stop Markdown Previews
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⏹️
# @raycast.packageName comarkserv

# Documentation:
# @raycast.description Stops the comarkserv servers that "Preview Markdown" started.
# @raycast.author Rigo-m
# @raycast.authorURL https://github.com/Rigo-m/comarkserv

set -uo pipefail

state="${XDG_STATE_HOME:-$HOME/.local/state}/comarkserv/raycast"
count=0

for entry in "$state"/*; do
  [ -f "$entry" ] || continue
  case "$entry" in *.log) continue ;; esac
  read -r pid _ < "$entry" || true
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    # npx starts comarkserv as a child process, so the children stop too.
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null && count=$((count + 1))
  fi
  rm -f "$entry" "$entry.log"
done

if [ "$count" -eq 1 ]; then
  echo "Stopped 1 preview server"
else
  echo "Stopped $count preview servers"
fi
