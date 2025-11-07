#!/bin/bash

set -euo pipefail

DEFAULT_EVENT_ID="db6eb756-a8e9-4c59-bafd-59f83e72ff4e"
DEFAULT_INPUT_FILE="/Users/will-liao/Downloads/output_24khz.pcm"
DEFAULT_WORKER_URL="http://localhost:3001"
DEFAULT_SAMPLE_RATE=24000
DEFAULT_ENCODING="pcm_s16le"

EVENT_ID="${1:-$DEFAULT_EVENT_ID}"
INPUT_FILE="${2:-$DEFAULT_INPUT_FILE}"
WORKER_URL="${3:-$DEFAULT_WORKER_URL}"
SAMPLE_RATE="${4:-$DEFAULT_SAMPLE_RATE}"
ENCODING="${5:-$DEFAULT_ENCODING}"

if [ ! -f "$INPUT_FILE" ]; then
  echo "Input file not found: $INPUT_FILE" >&2
  exit 1
fi

INPUT_EXTENSION="${INPUT_FILE##*.}"
AUDIO_B64=""
DURATION_MS=2000

if [ "$INPUT_EXTENSION" = "pcm" ]; then
  BYTES_PER_SAMPLE=2

  PCM_SIZE_BYTES=$(stat -f%z "$INPUT_FILE")
  if [ "$PCM_SIZE_BYTES" -lt $((SAMPLE_RATE * BYTES_PER_SAMPLE / 10)) ]; then
    echo "PCM buffer too small (<100ms of audio): $PCM_SIZE_BYTES bytes" >&2
    exit 1
  fi

  AUDIO_B64=$(base64 < "$INPUT_FILE" | tr -d '\n')
  SAMPLE_COUNT=$((PCM_SIZE_BYTES / BYTES_PER_SAMPLE))
  DURATION_MS=$(awk -v samples="$SAMPLE_COUNT" -v rate="$SAMPLE_RATE" 'BEGIN { printf "%.0f", (samples / rate) * 1000 }')
else
  AUDIO_B64=$(tr -d '\n' < "$INPUT_FILE")
fi

if [ -z "$AUDIO_B64" ]; then
  echo "Failed to produce base64-encoded audio payload" >&2
  exit 1
fi

TMP_PAYLOAD=$(mktemp)
trap 'rm -f "$TMP_PAYLOAD"' EXIT

{
  printf '{\n'
  printf '  "event_id": "%s",\n' "$EVENT_ID"
  printf '  "audio_base64": "%s",\n' "$AUDIO_B64"
  printf '  "is_final": true,\n'
  printf '  "sample_rate": %s,\n' "$SAMPLE_RATE"
  printf '  "encoding": "%s",\n' "$ENCODING"
  printf '  "duration_ms": %s\n' "$DURATION_MS"
  printf '}\n'
} > "$TMP_PAYLOAD"

curl -sS -X POST "${WORKER_URL}/sessions/transcript/audio" \
  -H "Content-Type: application/json" \
  -d @"$TMP_PAYLOAD"

echo

