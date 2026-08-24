#!/usr/bin/env bash
# Runs run_verification_backfill.py under a watchdog that force-restarts it
# if it ever goes quiet for too long.
#
# Why this exists: confirmed live that a backfill run can freeze completely
# (0% CPU, no progress) after tens of hours, traced to the Scrapfly SDK's
# async_scrape() running a synchronous call in a background thread pool —
# asyncio-level timeouts can stop OUR code from waiting on a hung call, but
# they don't free the underlying stuck thread, so leaked threads can
# eventually exhaust the pool. Smaller --chunk-size in the Python script
# bounds how much leakage accumulates before a reset; this watchdog is the
# second line of defense — a full process kill+restart guarantees forward
# progress no matter what caused the freeze, since the backfill is fully
# resumable (progress is durable via last_verified_at in the database).
#
# Usage: ./scripts/run_verification_backfill_supervised.sh [extra args passed through]
# Stop with: touch /tmp/verification_backfill.stop

set -u
cd "$(dirname "$0")/.."

LOG=/tmp/verification_backfill.log
STALE_SECONDS=600   # no log output for 10 min => assume frozen, restart
STOP_FILE=/tmp/verification_backfill.stop
DONE_SENTINEL=/tmp/verification_backfill.done

rm -f "$STOP_FILE" "$DONE_SENTINEL"

while true; do
  if [ -f "$STOP_FILE" ]; then
    echo "[supervisor] $(date) stop file found, exiting" >> "$LOG"
    rm -f "$STOP_FILE"
    break
  fi

  echo "[supervisor] $(date) starting backfill process" >> "$LOG"
  PYTHONPATH=. .venv/bin/python scripts/run_verification_backfill.py "$@" >> "$LOG" 2>&1 &
  PID=$!

  while kill -0 "$PID" 2>/dev/null; do
    if [ -f "$STOP_FILE" ]; then
      echo "[supervisor] $(date) stop file found, killing PID $PID" >> "$LOG"
      kill -9 "$PID" 2>/dev/null
      rm -f "$STOP_FILE"
      exit 0
    fi

    if [ -f "$LOG" ]; then
      last_mtime=$(stat -f "%m" "$LOG" 2>/dev/null || stat -c "%Y" "$LOG" 2>/dev/null)
      now=$(date +%s)
      age=$((now - last_mtime))
      if [ "$age" -gt "$STALE_SECONDS" ]; then
        echo "[supervisor] $(date) no log output for ${age}s — assuming frozen, killing PID $PID" >> "$LOG"
        kill -9 "$PID" 2>/dev/null
        break
      fi
    fi

    sleep 30
  done

  if [ -f "$DONE_SENTINEL" ]; then
    echo "[supervisor] $(date) backfill completed cleanly" >> "$LOG"
    break
  fi

  echo "[supervisor] $(date) process exited/killed, restarting in 10s" >> "$LOG"
  sleep 10
done
