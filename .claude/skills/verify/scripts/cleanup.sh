#!/usr/bin/env bash
# Stops only the preview server launch.sh started. Evidence under /tmp/ww3-verify/runs is kept.
STATE="${VERIFY_STATE:-/tmp/ww3-verify/state}"
pid="$(cat "$STATE/preview.pid" 2>/dev/null)"
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; sleep 0.5
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
  echo "stopped preview pid $pid"
else echo "no preview of ours running"; fi
rm -f "$STATE/preview.pid" "$STATE/preview.port"
