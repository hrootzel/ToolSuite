#!/usr/bin/env sh
PORT=8000
URL="http://localhost:${PORT}/"

# Try to open browser if available
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
fi

exec python3 -m http.server "$PORT"
