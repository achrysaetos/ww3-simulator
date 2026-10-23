#!/usr/bin/env bash
# Read-only: is the instance launch.sh started still worth driving?
STATE="${VERIFY_STATE:-/tmp/ww3-verify/state}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
ok=1
pid="$(cat "$STATE/preview.pid" 2>/dev/null)"; port="$(cat "$STATE/preview.port" 2>/dev/null || echo 4650)"
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "ok   preview pid $pid alive"; else echo "FAIL no live preview pid in $STATE (run launch.sh)"; ok=0; fi
if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/" | grep -q 200; then echo "ok   http://localhost:$port/ answers 200"; else echo "FAIL port $port does not answer"; ok=0; fi
if [ -d "$ROOT/dist" ]; then
  newer="$(find "$ROOT/src" "$ROOT/index.html" -newer "$ROOT/dist/index.html" -type f 2>/dev/null | head -3)"
  if [ -z "$newer" ]; then echo "ok   dist is newer than src"; else echo "WARN src changed after the build (rerun launch.sh after cleanup.sh): $newer"; fi
else echo "FAIL no dist/ build"; ok=0; fi
[ -x /opt/pw-browsers/chromium ] || [ -e /opt/pw-browsers/chromium ] && echo "ok   chromium at /opt/pw-browsers/chromium" || { echo "FAIL chromium missing"; ok=0; }
[ $ok = 1 ]
