#!/bin/sh
# Start everything the API needs inside one container:
# Redis (job store, cache, queue), the RQ worker (runs basic-pitch), then the API itself.
set -e

# Redis only holds temporary jobs and cache, so skip saving to disk.
redis-server --daemonize yes --dir /tmp --save "" --appendonly no

# Wait until Redis answers before starting anything that needs it.
until redis-cli ping >/dev/null 2>&1; do sleep 0.2; done

# The worker runs in the background. The API and worker share /tmp, where uploads wait for the worker.
rq worker --url "$REDIS_URL" &

# "exec" makes uvicorn the main process, so the container stops cleanly when the host stops it.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}"
