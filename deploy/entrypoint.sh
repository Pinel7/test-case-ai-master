#!/bin/bash
# entrypoint.sh — fix data dir permissions, then run gunicorn as appuser

# Ensure data directory exists and is writable by appuser
mkdir -p /home/appuser/.TestCaseAI
chown -R appuser:appuser /home/appuser/.TestCaseAI

# Drop privileges and run
exec su appuser -c "gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-8000} \
  --timeout 120 \
  --max-requests 1000 \
  --max-requests-jitter 50"
