# Transcript Ingestion Edge Function

Supabase Edge Function for ingesting audio transcripts into the database.

## Purpose

This function receives transcripts from external transcription services and inserts them into the `transcripts` table, where the worker process picks them up for AI card generation.

## Architecture

```
Transcription Service → HTTP POST → Edge Function → Database → Worker Process
```

## Features

- ✅ Single transcript insertion
- ✅ Batch transcript insertion (multiple at once)
- ✅ Automatic timestamp handling
- ✅ Text length validation (100K character limit)
- ✅ CORS enabled for external services
- ✅ Health check endpoint
- ⚠️ HTTP-only (no WebSocket/SSE support)

## API Endpoints

### Health Check

```bash
GET /functions/v1/transcript-ingestion
```

Returns service status and timestamp.

### Single Transcript Insert

```bash
POST /functions/v1/transcript-ingestion
```

**Request Body**:
```json
{
  "event_id": "uuid",
  "text": "Transcript text here",
  "timestamp": "2025-01-04T12:00:00Z"  // optional, defaults to now
}
```

**Response**:
```json
{
  "ok": true,
  "transcript": {
    "id": 123,
    "text": "Transcript text here",
    "ts": "2025-01-04T12:00:00Z"
  }
}
```

### Batch Transcript Insert

```bash
POST /functions/v1/transcript-ingestion
```

**Request Body**:
```json
{
  "event_id": "uuid",
  "batch": [
    { "text": "First chunk", "timestamp": "2025-01-04T12:00:00Z" },
    { "text": "Second chunk", "timestamp": "2025-01-04T12:01:00Z" }
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "inserted": 2,
  "transcripts": [
    { "id": 123, "text": "First chunk", "ts": "2025-01-04T12:00:00Z" },
    { "id": 124, "text": "Second chunk", "ts": "2025-01-04T12:01:00Z" }
  ]
}
```

## Integration with Transcription Services

### Deepgram

```javascript
// Deepgram sends transcript chunks via HTTP POST
async function sendTranscript(eventId, text, timestamp) {
  await fetch(`${SUPABASE_URL}/functions/v1/transcript-ingestion`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_id: eventId,
      text: text,
      timestamp: timestamp
    })
  });
}
```

### AssemblyAI

```javascript
// Similar HTTP POST pattern
async function sendTranscript(eventId, text) {
  await fetch(`${SUPABASE_URL}/functions/v1/transcript-ingestion`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_id: eventId,
      text: text
    })
  });
}
```

## Local Testing

```bash
# Start Supabase locally
supabase start

# Health check
curl -i --location --request GET 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

# Single transcript
curl -i --location --request POST 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
  --header 'Content-Type: application/json' \
  --data '{"event_id":"00000000-0000-0000-0000-000000000000","text":"Test transcript"}'

# Batch transcripts
curl -i --location --request POST 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
  --header 'Content-Type: application/json' \
  --data '{"event_id":"00000000-0000-0000-0000-000000000000","batch":[{"text":"Chunk 1"},{"text":"Chunk 2"}]}'
```

## Security

- Uses service role key for database access (bypasses RLS)
- JWT verification disabled (`verify_jwt = false`) to allow external services
- Text length validation prevents abuse (100K character limit)
- CORS allows calls from any origin (needed for external services)

## Limitations

- **WebSocket/SSE not supported**: Edge Functions are HTTP-only
- Real-time services must send HTTP POSTs for each chunk
- Function lifetime: ~50 seconds max

## Deployment

```bash
# Deploy to Supabase Cloud
supabase functions deploy transcript-ingestion
```

## Related Documentation

- [Worker Process](../worker/index.ts) - Processes inserted transcripts
- [Database Schema](../../migrations/20251031000000_init_schema.sql) - Transcripts table
- [Architecture Analysis](../../../../dev_docs/20251103_141940_TRANSCRIPT_INGESTION_ANALYSIS.md)

