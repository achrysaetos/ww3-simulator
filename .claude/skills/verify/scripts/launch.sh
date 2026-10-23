#!/usr/bin/env bash
# Builds the game and serves the production bundle on PORT (default 4650) for a verification run.
# Refuses to start if something else owns the port. Writes the server pid to $VERIFY_STATE/preview.pid.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${PORT:-4650}"
STATE="${VERIFY_STATE:-/tmp/ww3-verify/state}"
mkdir -p "$STATE"
cd "$ROOT"
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "port $PORT already answers; run doctor.sh, or cleanup.sh if it is ours, or pick another PORT" >&2
  exit 1
fi
[ -d node_modules ] || npm ci
[ "${SKIP_BUILD:-0}" = 1 ] || npm run build >"$STATE/build.log" 2>&1 || { tail -30 "$STATE/build.log"; exit 1; }
nohup node_modules/.bin/vite preview --port "$PORT" --strictPort >"$STATE/preview.log" 2>&1 &
echo $! >"$STATE/preview.pid"
echo "$PORT" >"$STATE/preview.port"
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then echo "ready http://localhost:$PORT/ (pid $(cat "$STATE/preview.pid"))"; exit 0; fi
  sleep 0.5
done
echo "preview did not answer on $PORT; log:" >&2; tail -20 "$STATE/preview.log" >&2; exit 1
