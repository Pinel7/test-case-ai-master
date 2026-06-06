#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== TestForge Deploy ==="

# Build
echo "Building Docker image..."
docker compose -f docker-compose.yml build "$@"

# Bring down old container gracefully
echo "Stopping old container..."
docker compose -f docker-compose.yml down --remove-orphans

# Start new container
echo "Starting new container..."
docker compose -f docker-compose.yml up -d

# Clean up old images
echo "Cleaning up..."
docker image prune -f

echo "=== Deploy complete ==="
echo "Container: $(docker compose -f docker-compose.yml ps -q app)"
