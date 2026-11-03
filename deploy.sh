#!/bin/sh
# Install this reviewed script on the host at /opt/dogfight/deploy.sh (chmod 750).
set -eu
cd /opt/dogfight
case "$1" in ghcr.io/*@sha256:*) ;; *) echo 'Expected an immutable GHCR digest' >&2; exit 1;; esac
previous=$(cat current-image 2>/dev/null || true)
export IMAGE="$1"
docker compose -f compose.deploy.yaml pull game
if ! docker compose -f compose.deploy.yaml up -d --wait --wait-timeout 90; then
  if [ -n "$previous" ]; then
    export IMAGE="$previous"
    docker compose -f compose.deploy.yaml up -d --wait --wait-timeout 90
  fi
  exit 1
fi
if [ -n "$previous" ]; then printf '%s\n' "$previous" > previous-image; fi
printf '%s\n' "$IMAGE" > current-image
