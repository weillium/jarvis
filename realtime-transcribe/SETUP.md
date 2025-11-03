# Setup Guide: Realtime Transcription Service

Complete guide to get the realtime transcription service running locally with Docker.

## Prerequisites

- Docker Desktop installed and running
- OpenAI API key with Realtime API access
- Supabase CLI installed (`npm install -g supabase-cli`)

## Step-by-Step Setup

### 1. Configure Environment

```bash
cd realtime-transcribe
cp env.example .env
```

Edit `.env` with your values:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-key-here

# Supabase Configuration
SUPABASE_URL=http://host.docker.internal:54421
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-supabase

# Server Configuration (defaults are fine)
HTTP_PORT=3001
WEBSOCKET_PORT=8080
```

**Get your Supabase service role key**:
```bash
cd ../  # Go back to project root
supabase status
# Look for "service_role key" in the output
```

### 2. Start Supabase Locally

In the project root:

```bash
# Make sure you're in /Users/will-liao/Desktop/Coding/Git/jarvis
supabase start

# Wait for all services to start
# Take note of the service_role key shown
```

You should see output like:
```
         API URL: http://127.0.0.1:54421
       DB URL: postgresql://postgres:postgres@127.0.0.1:54422/postgres
   Studio URL: http://127.0.0.1:54423
     anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  <-- Use this one
```

### 3. Verify Database Schema

Ensure the transcripts table exists:

```bash
supabase db reset  # This will run all migrations
```

Or check manually:
```bash
supabase db inspect | grep transcripts
```

### 4. Build and Start the Service

```bash
cd realtime-transcribe

# Build the Docker image
docker-compose build

# Start the service
docker-compose up -d

# Watch logs
docker-compose logs -f realtime-transcribe
```

You should see:
```
[server] Starting WebSocket bridge service...
[server] HTTP health check: http://localhost:3001/health
[server] WebSocket server: ws://localhost:8080
[server] Ready! Waiting for client connections...
```

### 5. Test the Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"ok":true,"service":"realtime-transcribe","timestamp":"2025-01-04T12:00:00.000Z","uptime":5.123}
```

### 6. Test WebSocket Connection

Install wscat (if not already installed):
```bash
npm install -g wscat
```

Connect:
```bash
wscat -c "ws://localhost:8080?event_id=test-event-123"
```

You should see:
```
Connected (press CTRL+C to quit)
> {"type":"connected","sessionId":"test-event-123-1234567890","timestamp":"..."}
```

Press CTRL+C to exit.

## Next Steps

### Client-Side Integration

Create the client component to capture and send audio. See:
- `web/features/events/components/live-transcribe.tsx` (to be created)

### Visualize Transcripts

Integrate live transcript display in the event page:
- `web/app/(app)/events/[eventId]/live/page.tsx`

## Troubleshooting

### Service Won't Start

Check logs:
```bash
docker-compose logs realtime-transcribe
```

Common issues:
- Missing environment variables
- Port conflict (3001 or 8080 already in use)
- Incorrect Supabase URL (must use `host.docker.internal` from Docker)

### Database Connection Issues

Verify Supabase is running:
```bash
supabase status
```

Check the URL:
```bash
# From Docker container
docker-compose exec realtime-transcribe sh
# In container
curl http://host.docker.internal:54421
```

### WebSocket Connection Fails

Check firewall/routing:
```bash
# From host
telnet localhost 8080
# Should connect
```

Verify service is listening:
```bash
netstat -an | grep 8080
```

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│   Your Browser/Client                   │
│   (Captures microphone audio)           │
└───────────────┬─────────────────────────┘
                │ WebSocket (ws://localhost:8080)
                ↓
┌─────────────────────────────────────────┐
│   realtime-transcribe Container         │
│   (OpenAI Realtime API Bridge)          │
│   - Receives audio                      │
│   - Sends to OpenAI                     │
│   - Receives transcripts                │
│   - Inserts to database                 │
└───────────────┬─────────────────────────┘
                │ HTTP API
                ↓
┌─────────────────────────────────────────┐
│   Supabase (host.docker.internal:54421) │
│   - transcripts table                   │
└───────────────┬─────────────────────────┘
                │ Poll every 1s
                ↓
┌─────────────────────────────────────────┐
│   Worker Service                        │
│   - Processes transcripts               │
│   - Generates AI cards                  │
└─────────────────────────────────────────┘
```

## Useful Commands

```bash
# View logs
docker-compose logs -f realtime-transcribe

# Restart service
docker-compose restart realtime-transcribe

# Stop service
docker-compose down

# Rebuild after code changes
docker-compose up --build -d

# Enter container
docker-compose exec realtime-transcribe sh

# Check container health
docker ps | grep realtime-transcribe
```

## Production Deployment

For production, you'll need to:
1. Use proper secrets management (not .env files)
2. Update SUPABASE_URL to production URL
3. Set up proper SSL/TLS for WebSocket
4. Configure rate limiting
5. Add monitoring and logging
6. Scale horizontally if needed

See README.md for more details.

