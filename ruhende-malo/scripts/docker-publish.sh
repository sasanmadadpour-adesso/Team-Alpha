#!/usr/bin/env bash
# Build a multi-arch image (NAS CPUs: amd64 or arm64) and push it to Docker Hub.
# Usage: scripts/docker-publish.sh <dockerhub-user> [tag]      (run `docker login` first)
set -euo pipefail
USER_NAME="${1:?usage: $0 <dockerhub-user> [tag]}"
TAG="${2:-latest}"
IMAGE="$USER_NAME/ruhend"
cd "$(dirname "$0")/.."
docker buildx inspect ruhend-builder >/dev/null 2>&1 || docker buildx create --name ruhend-builder --driver docker-container >/dev/null
docker buildx build --builder ruhend-builder --platform linux/amd64,linux/arm64 \
  -t "$IMAGE:$TAG" $( [ "$TAG" = latest ] || echo "-t $IMAGE:latest" ) --push .
echo "Pushed $IMAGE:$TAG"
