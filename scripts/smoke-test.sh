#!/usr/bin/env sh
set -eu

BASE_URL="${1:-http://localhost:8000}"
FRONT_URL="${2:-http://localhost:5173}"

echo "== Frontend routes =="
for path in / /alerts /containers /reports; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${FRONT_URL}${path}")
  echo "${path} -> ${code}"
done

echo "== Backend routes =="
for path in \
  /api/health \
  /api/ready \
  /api/routes \
  /api/dashboard/metrics \
  /api/system/overview \
  /api/containers \
  /api/alerts \
  /api/events \
  /api/reports \
  /api/notifications/config
do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")
  echo "${path} -> ${code}"
done
