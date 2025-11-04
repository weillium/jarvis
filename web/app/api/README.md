# API Routes - Step 3 Implementation

## Routes Created

### 1. `/api/ingest` - Transcript Ingestion

**Purpose**: Accept transcript chunks from clients and insert into database.

**Endpoint**: `POST /api/ingest`

**Request Body**:
```json
{
  "event_id": "uuid",
  "seq": 1,
  "at_ms": 1234567890,
  "speaker": "speaker_1",
  "text": "Transcript text here",
  "final": true
}
```

**Response**:
```json
{
  "ok": true,
  "transcript_id": 123,
  "seq": 1,
  "timestamp": "2025-11-03T..."
}
```

**How it works**:
1. Validates input (event_id, text, etc.)
2. Inserts transcript into `transcripts` table
3. Orchestrator automatically processes via Supabase Realtime subscription
4. Returns acknowledgment

---

### 2. `/api/stream` - Server-Sent Events Stream

**Purpose**: Stream live cards and facts updates to frontend.

**Endpoint**: `GET /api/stream?event_id=<uuid>`

**Response**: SSE stream with events:
```
data: {"type": "connected", "event_id": "...", "timestamp": "..."}

data: {"type": "card", "payload": {...}, "for_seq": 1, "timestamp": "..."}

data: {"type": "fact_update", "event": "INSERT", "payload": {...}, "timestamp": "..."}

data: {"type": "heartbeat", "timestamp": "..."}
```

**How it works**:
1. Subscribes to `agent_outputs` table (for cards)
2. Subscribes to `facts` table (for fact updates)
3. Streams updates as SSE events
4. Sends heartbeat every 30 seconds to keep connection alive
5. Handles client disconnection gracefully

---

## Environment Variables Required

Add to `web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Note**: `SUPABASE_SERVICE_ROLE_KEY` is required for server-side operations. It's not exposed to the client.

---

## Testing

### Test `/api/ingest`

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "your-event-uuid",
    "seq": 1,
    "text": "This is a test transcript about volcanic formations.",
    "final": true
  }'
```

Expected response:
```json
{
  "ok": true,
  "transcript_id": 123,
  "seq": 1,
  "timestamp": "2025-11-03T..."
}
```

### Test `/api/stream`

```bash
curl -N http://localhost:3000/api/stream?event_id=your-event-uuid
```

Expected output:
```
data: {"type":"connected","event_id":"...","timestamp":"..."}

data: {"type":"card","payload":{...},"for_seq":1,"timestamp":"..."}

data: {"type":"heartbeat","timestamp":"..."}
```

---

## Integration Flow

```
Client → POST /api/ingest
           ↓
      Insert into transcripts table
           ↓
      Supabase Realtime event
           ↓
      Orchestrator processes (via subscription)
           ↓
      Generate card → Insert into agent_outputs
           ↓
      Supabase Realtime event
           ↓
      GET /api/stream → SSE stream to client
```

---

## Error Handling

### `/api/ingest` Errors:
- `400`: Invalid input (missing event_id, invalid text, etc.)
- `500`: Database error or internal server error

### `/api/stream` Errors:
- `400`: Missing or invalid event_id
- Connection errors handled gracefully (client disconnect)

---

## Next Steps

1. **Update frontend** to use these routes:
   - Connect to `/api/stream` for live updates
   - Send transcripts to `/api/ingest` (if client-side)

2. **Add authentication** (if needed):
   - Verify user has access to event
   - Add auth middleware

3. **Add rate limiting** (if needed):
   - Prevent abuse of `/api/ingest`
   - Limit concurrent SSE connections

