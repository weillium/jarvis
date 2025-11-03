#!/bin/bash
# Quick test script for Step 3 API routes
# 
# Prerequisites:
# 1. Next.js dev server running: cd web && pnpm dev
# 2. Supabase running: cd supabase && supabase start
# 3. An event created in database with a valid UUID

set -e

BASE_URL="http://localhost:3000"
EVENT_ID="${1:-00000000-0000-0000-0000-000000000000}"

echo "Testing Step 3 API Routes"
echo "========================="
echo ""
echo "Using event_id: $EVENT_ID"
echo ""

# Test 1: /api/ingest
echo "Test 1: POST /api/ingest"
echo "-----------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_id\": \"$EVENT_ID\",
    \"seq\": 1,
    \"text\": \"This is a test transcript about volcanic rock formations in Hawaii.\",
    \"final\": true
  }")

echo "Response: $RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ /api/ingest test passed"
else
  echo "❌ /api/ingest test failed"
  echo "Response: $RESPONSE"
fi

echo ""
echo "Test 2: GET /api/stream (SSE)"
echo "-----------------------------"
echo "Opening SSE stream for 10 seconds..."
echo ""

# Test SSE stream (timeout after 10 seconds)
timeout 10 curl -N "$BASE_URL/api/stream?event_id=$EVENT_ID" 2>/dev/null || true

echo ""
echo "✅ SSE stream test completed"
echo ""
echo "Note: If you see 'connected' events, the stream is working!"
echo "To see live updates, ensure:"
echo "  1. Worker is running (cd worker && npx tsx index.ts)"
echo "  2. Event is live (is_live = true)"
echo "  3. Agent is running (status = 'running')"

