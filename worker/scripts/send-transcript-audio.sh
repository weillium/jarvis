#!/bin/bash

set -euo pipefail

DEFAULT_EVENT_ID="db6eb756-a8e9-4c59-bafd-59f83e72ff4e"
DEFAULT_B64_FILE="/Users/will-liao/Downloads/output.b64"
DEFAULT_WORKER_URL="http://localhost:3001"

EVENT_ID="${1:-$DEFAULT_EVENT_ID}"
B64_FILE="${2:-$DEFAULT_B64_FILE}"
WORKER_URL="${3:-$DEFAULT_WORKER_URL}"

if [ ! -f "$B64_FILE" ]; then
  echo "Base64 file not found: $B64_FILE" >&2
  exit 1
fi

# Remove newlines to ensure the base64 string is JSON-safe
AUDIO_B64=$(tr -d '\n' < "$B64_FILE")

TMP_PAYLOAD=$(mktemp)
trap 'rm -f "$TMP_PAYLOAD"' EXIT

{
  printf '{\n'
  printf '  "event_id": "%s",\n' "$EVENT_ID"
  printf '  "audio_base64": "%s",\n' "$AUDIO_B64"
  printf '  "is_final": true,\n'
  printf '  "sample_rate": 16000,\n'
  printf '  "encoding": "pcm_s16le",\n'
  printf '  "duration_ms": 2000\n'
  printf '}\n'
} > "$TMP_PAYLOAD"

curl -sS -X POST "${WORKER_URL}/sessions/transcript/audio" \
  -H "Content-Type: application/json" \
  -d @"$TMP_PAYLOAD"

echo

