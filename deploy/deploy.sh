#!/usr/bin/env bash
# Pull the latest main on the server, rebuild the API container and check health.
set -euo pipefail
HOST="${DEPLOY_HOST:-neobody}"
API_URL="${API_URL:-https://94-131-95-178.sslip.io/api}"
ssh "$HOST" 'cd ~/sedona && git pull --ff-only && docker compose -f deploy/docker-compose.yml up -d --build'
sleep 3
curl -fsS "$API_URL/health" && echo
