#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${SMOKE_PORT:-3010}"
LOG_FILE="${ROOT_DIR}/.smoke-server.log"

PORT="$PORT" node dev-server.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sS "http://localhost:${PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Server stopped unexpectedly. Logs:"
    cat "$LOG_FILE"
    exit 1
  fi
done

HOME_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/")"
if [[ "$HOME_STATUS" != "200" ]]; then
  echo "FAIL: GET / returned $HOME_STATUS"
  exit 1
fi

API_RESPONSE="$(curl -sS -X POST "http://localhost:${PORT}/api/lead" \
  -H 'Content-Type: application/json' \
  -d '{"source":"smoke_test","lead":{"fullName":"Smoke Test","email":"smoke@test.com","company":"Webeska","budget":"20k-50k","priority":"Valider le flux local sans erreur"}}')"

if [[ "$API_RESPONSE" == *'"ok":true'* ]] || [[ "$API_RESPONSE" == *'"reason":"missing_resend_api_key"'* ]]; then
  echo "PASS: smoke test ok"
  echo "API: $API_RESPONSE"
  exit 0
fi

echo "FAIL: unexpected API response"
echo "$API_RESPONSE"
exit 1
