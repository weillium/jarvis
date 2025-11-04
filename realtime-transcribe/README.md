# Realtime Transcription Service

WebSocket bridge service for OpenAI Realtime API transcription integration.

## Overview

This service bridges real-time audio streams from clients to OpenAI's Realtime API and stores transcripts in the database. It enables live transcription during events with low latency.

## Architecture

```
Client → WebSocket → This Service → OpenAI Realtime API
                                              ↓
                                         Transcript
                                              ↓
                                    Database Insert
                                              ↓
                                           Worker
```

## Features

- ✅ WebSocket server for real-time audio streaming
- ✅ OpenAI Realtime API integration
- ✅ Automatic database inserts
- ✅ Session tracking and management
- ✅ Graceful shutdown handling
- ✅ Health check endpoints
- ✅ Docker support

## Prerequisites

- Node.js 20+
- pnpm 10.20.0+
- OpenAI API key with Realtime API access
- Supabase database with transcripts table

## Installation

```bash
cd realtime-transcribe
pnpm install
```

## Configuration

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
SUPABASE_URL=http://localhost:54421
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
HTTP_PORT=3001
WEBSOCKET_PORT=8080
```

## Development

```bash
# Start in development mode (with hot reload)
pnpm dev

# Build TypeScript
pnpm build

# Start production server
pnpm start
```

## Docker

### Build

```bash
docker build -t realtime-transcribe .
```

### Run

```bash
docker run -p 3001:3001 -p 8080:8080 --env-file .env realtime-transcribe
```

Or with Docker Compose (see docker-compose.yml):

```bash
docker-compose up
```

## Testing

### Health Check

```bash
curl http://localhost:3001/health
```

### WebSocket Connection

```bash
# Using wscat
npm install -g wscat
wscat -c "ws://localhost:8080?event_id=test-event"
```

## API

### WebSocket Endpoint

**URL**: `ws://localhost:8080?event_id={EVENT_ID}`

**Client Messages**:
- Audio data (binary buffer)
- `{"type": "ping"}` - Health check
- `{"type": "close"}` - Request disconnect

**Server Messages**:
- `{"type": "connected"}` - Connection established
- `{"type": "transcript"}` - New transcript received
- `{"type": "error"}` - Error occurred
- `{"type": "pong"}` - Response to ping

### HTTP Endpoint

**GET /health** - Health check

Response:
```json
{
  "ok": true,
  "service": "realtime-transcribe",
  "timestamp": "2025-11-04T12:00:00.000Z",
  "uptime": 123.45
}
```

## Integration

### Client Side

See `web/features/events/components/live-transcribe.tsx` for client integration example.

### Database

Transcripts are automatically inserted into the `transcripts` table:
- `event_id`: UUID of the event
- `text`: Transcript text
- `ts`: Timestamp
- `id`: Auto-generated

### Worker

The existing worker service (`worker/index.ts`) automatically processes new transcripts into AI cards.

## Troubleshooting

### Connection Issues

- Ensure `SUPABASE_URL` is accessible from the container
- Verify `OPENAI_API_KEY` has Realtime API access
- Check WebSocket port (8080) is not blocked

### OpenAI API

- Verify OpenAI Realtime API availability
- Check API key permissions
- Monitor rate limits

### Database

- Ensure transcripts table exists
- Verify service role key permissions
- Check database connectivity

## License

ISC



