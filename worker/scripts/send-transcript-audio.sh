#!/bin/bash

set -euo pipefail

DEFAULT_EVENT_ID="db6eb756-a8e9-4c59-bafd-59f83e72ff4e"
DEFAULT_INPUT_PATH="/Users/will-liao/Downloads/output_24khz_mono.pcm"
DEFAULT_WORKER_URL="http://localhost:3001"

EVENT_ID="${1:-$DEFAULT_EVENT_ID}"
INPUT_PATH="${2:-$DEFAULT_INPUT_PATH}"
WORKER_URL="${3:-$DEFAULT_WORKER_URL}"

SAMPLE_RATE=24000
BYTES_PER_SAMPLE=2
REQUIRED_BYTES=$((SAMPLE_RATE * BYTES_PER_SAMPLE / 10))
MAX_BASE64_BYTES=1000000
BASE64_OVERHEAD_PERCENT=34
SAFETY_MARGIN_BYTES=5000

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd ffprobe
require_cmd ffmpeg
require_cmd base64
require_cmd curl
require_cmd bc

estimate_base64_size() {
  local raw_bytes="$1"
  echo $(( (raw_bytes * (100 + BASE64_OVERHEAD_PERCENT)) / 100 + SAFETY_MARGIN_BYTES ))
}

calculate_trim_bytes() {
  local raw_bytes="$1"
  local estimated_b64=$(estimate_base64_size "$raw_bytes")
  if [ "$estimated_b64" -le "$MAX_BASE64_BYTES" ]; then
    echo 0
    return
  fi

  local target_raw=$(( (MAX_BASE64_BYTES - SAFETY_MARGIN_BYTES) * 100 / (100 + BASE64_OVERHEAD_PERCENT) ))
  local frame_size=$((BYTES_PER_SAMPLE))
  target_raw=$((target_raw / frame_size * frame_size))

  if [ "$target_raw" -le 0 ]; then
    echo -1
  else
    echo "$target_raw"
  fi
}

convert_to_pcm() {
  local input="$1"
  local output="$2"

  if [[ "${input##*.}" == "pcm" ]]; then
    cp "$input" "$output"
    return
  fi

  local codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$input" || echo "")
  local rate=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$input" || echo "0")
  local channels=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 "$input" || echo "0")

  if [[ "$codec" == "pcm_s16le" && "$rate" == "24000" && "$channels" == "1" ]]; then
    cp "$input" "$output"
    return
  fi

  echo "Normalizing audio → 24kHz mono PCM" >&2
  ffmpeg -y -loglevel error -i "$input" -ac 1 -ar 24000 -f s16le -acodec pcm_s16le "$output"
}

trim_pcm_to_limit() {
  local input="$1"
  local output="$2"
  local raw_bytes="$3"

  local trim_bytes=$(calculate_trim_bytes "$raw_bytes")
  if [ "$trim_bytes" -eq -1 ]; then
    echo "Audio too long to fit within server limit" >&2
    exit 1
  fi

  if [ "$trim_bytes" -gt 0 ]; then
    echo "Trimming PCM to $trim_bytes bytes to fit size limit" >&2
    dd if="$input" of="$output" bs=1 count="$trim_bytes" iflag=fullblock >/dev/null 2>&1
  else
    cp "$input" "$output"
  fi
}

if [ ! -f "$INPUT_PATH" ]; then
  echo "Input file not found: $INPUT_PATH" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

PCM_PATH="$TMP_DIR/input_24khz.pcm"
convert_to_pcm "$INPUT_PATH" "$PCM_PATH"

PCM_SIZE_BYTES=$(stat -f%z "$PCM_PATH")
if [ "$PCM_SIZE_BYTES" -lt "$REQUIRED_BYTES" ]; then
  echo "PCM buffer too small (<100ms of audio): $PCM_SIZE_BYTES bytes" >&2
  exit 1
fi

TRIMMED_PCM="$TMP_DIR/trimmed.pcm"
trim_pcm_to_limit "$PCM_PATH" "$TRIMMED_PCM" "$PCM_SIZE_BYTES"
PCM_PATH="$TRIMMED_PCM"
PCM_SIZE_BYTES=$(stat -f%z "$PCM_PATH")

AUDIO_B64=$(base64 < "$PCM_PATH" | tr -d '\n')
if [ -z "$AUDIO_B64" ]; then
  echo "Failed to encode PCM payload" >&2
  exit 1
fi

SAMPLE_COUNT=$((PCM_SIZE_BYTES / BYTES_PER_SAMPLE))
DURATION_MS=$(awk -v samples="$SAMPLE_COUNT" -v rate="$SAMPLE_RATE" 'BEGIN { printf "%.0f", (samples / rate) * 1000 }')

PAYLOAD="$TMP_DIR/payload.json"
cat <<JSON >"$PAYLOAD"
{
  "event_id": "$EVENT_ID",
  "audio_base64": "$AUDIO_B64",
  "is_final": true,
  "sample_rate": $SAMPLE_RATE,
  "encoding": "pcm_s16le",
  "duration_ms": $DURATION_MS
}
JSON

echo "Sending $(printf '%.2f' "$(bc -l <<< "$PCM_SIZE_BYTES / 1024")") KiB (${DURATION_MS} ms) to $WORKER_URL" >&2

HTTP_RESPONSE=$(curl -sS -w '\nHTTP_STATUS:%{http_code}\n' -X POST "${WORKER_URL}/sessions/transcript/audio" \
  -H "Content-Type: application/json" \
  --data-binary @"$PAYLOAD") || {
  echo "curl failed" >&2
  exit 1
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1 | cut -d: -f2)

if [[ "$HTTP_STATUS" != "202" ]]; then
  echo "Request failed (HTTP $HTTP_STATUS):" >&2
  echo "$HTTP_BODY" >&2
  exit 1
fi

echo "Success (HTTP $HTTP_STATUS)"
PCM_SIZE_BYTES=$(stat -f%z "$PCM_PATH")
if [ "$PCM_SIZE_BYTES" -lt "$REQUIRED_BYTES" ]; then
  echo "PCM buffer too small (<100ms of audio): $PCM_SIZE_BYTES bytes" >&2
  exit 1
fi

estimate_trimmed_size() {
  local raw_bytes="$1"
  echo $((raw_bytes / BYTES_PER_SAMPLE))
}

calculate_trim_bytes() {
  local raw_bytes="$1"
  local estimated_b64=$(estimate_base64_size "$raw_bytes")
  if [ "$estimated_b64" -le "$MAX_BASE64_BYTES" ]; then
    echo 0
    return
  fi

  local target_raw=$(( (MAX_BASE64_BYTES - SAFETY_MARGIN_BYTES) * 100 / (100 + BASE64_OVERHEAD_PERCENT) ))
  local frame_size=$((BYTES_PER_SAMPLE * 1))
  target_raw=$((target_raw / frame_size * frame_size))

  if [ "$target_raw" -le 0 ]; then
    echo -1
  else
    echo "$target_raw"
  fi
}

TRIM_BYTES=$(calculate_trim_bytes "$PCM_SIZE_BYTES")
if [ "$TRIM_BYTES" -eq -1 ]; then
  echo "Audio too long to fit within server limit" >&2
  exit 1
fi

TRIMMED_PCM="$TMP_DIR/trimmed.pcm"
if [ "$TRIM_BYTES" -gt 0 ]; then
  echo "Trimming PCM to $TRIM_BYTES bytes to fit size limit" >&2
  dd if="$PCM_PATH" of="$TRIMMED_PCM" bs=1 count="$TRIM_BYTES" iflag=fullblock >/dev/null 2>&1
  PCM_PATH="$TRIMMED_PCM"
  PCM_SIZE_BYTES=$TRIM_BYTES
fi

AUDIO_B64=$(base64 < "$PCM_PATH" | tr -d '\n')
#!/bin/bash

set -euo pipefail

DEFAULT_EVENT_ID="db6eb756-a8e9-4c59-bafd-59f83e72ff4e"
DEFAULT_INPUT_PATH="/Users/will-liao/Downloads/output_24khz_mono.pcm"
DEFAULT_WORKER_URL="http://localhost:3001"

EVENT_ID="${1:-$DEFAULT_EVENT_ID}"
INPUT_PATH="${2:-$DEFAULT_INPUT_PATH}"
WORKER_URL="${3:-$DEFAULT_WORKER_URL}"

SAMPLE_RATE=24000
BYTES_PER_SAMPLE=2
REQUIRED_BYTES=$((SAMPLE_RATE * BYTES_PER_SAMPLE / 10)) # 100ms minimum
MAX_BASE64_BYTES=1000000
BASE64_OVERHEAD_PERCENT=34
SAFETY_MARGIN_BYTES=5000

estimate_base64_size() {
  local raw_bytes="$1"
  echo $(( (raw_bytes * (100 + BASE64_OVERHEAD_PERCENT)) / 100 + SAFETY_MARGIN_BYTES ))
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd ffprobe
require_cmd ffmpeg
require_cmd base64
require_cmd curl
require_cmd bc

if [ ! -f "$INPUT_PATH" ]; then
  echo "Input file not found: $INPUT_PATH" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

PCM_PATH="$TMP_DIR/input_24khz.pcm"

convert_to_pcm() {
  local input="$1"
  local output="$2"

  if [[ "${input##*.}" == "pcm" ]]; then
    cp "$input" "$output"
    return
  fi

  local codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$input" || echo "")
  local rate=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$input" || echo "0")
  local channels=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 "$input" || echo "0")

  if [[ "$codec" == "pcm_s16le" && "$rate" == "24000" && "$channels" == "1" ]]; then
    cp "$input" "$output"
    return
  fi

  echo "Normalizing audio → 24kHz mono PCM" >&2
  ffmpeg -y -loglevel error -i "$input" -ac 1 -ar 24000 -f s16le -acodec pcm_s16le "$output"
}

convert_to_pcm "$INPUT_PATH" "$PCM_PATH"



