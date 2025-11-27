# Worker Quick Start Guide

## ✅ Your Setup Status

Your `.env` file already exists with required variables configured!

## 🚀 Quick Launch Steps

### 0. Use Node.js 25

```bash
nvm use
# or, if nvm is unavailable
corepack env use node@25.1.0
```

> The repository root includes `.nvmrc` / `.node-version` so `nvm use` or `nodenv` will automatically select Node.js 25.1.0. If you rely on Corepack directly, `corepack env use node@25.1.0` ensures the worker runs under the same runtime before invoking pnpm.

### 0a. Set SSE Endpoint (Required for Live UI Updates)

Add `SSE_ENDPOINT` to your `worker/.env` so it matches the origin that serves the web UI (for local dev this is typically `http://localhost:3000`, for staging/production use the deployed HTTPS URL). The worker pushes session enrichment to `/api/agent-sessions/:event_id/status`; if this value is missing or still pointed at localhost, cards and facts will only refresh after you tab away and React Query refetches.

```bash
# worker/.env
SSE_ENDPOINT="https://your-web-app.example.com"
```

### 0b. Image Generation & Fetching (Optional)

For card visual support, add image fetching API keys to `worker/.env`:

```bash
# Image fetching - at minimum, set Pexels (free API key from https://www.pexels.com/api/)
PEXELS_API_KEY="your-pexels-api-key"

# Optional: Google Image Search fallback (requires Google Custom Search API)
GOOGLE_API_KEY="your-google-api-key"
GOOGLE_SEARCH_ENGINE_ID="your-search-engine-id"

# Optional: Exa API key (used as final fallback for image search)
EXA_API_KEY="your-exa-api-key"
```

Restart the worker after updating variables so the configuration is picked up.

### 1. Verify Setup (Optional but Recommended)

```bash
cd worker
pnpm check-setup
```

This will verify:
- ✓ All environment variables are set
- ✓ Supabase connection works
- ✓ OpenAI connection works

### 2. Install Dependencies (if needed)

```bash
cd worker
pnpm install
```

### 3. Start the Worker

```bash
cd worker
pnpm dev
```

Or using tsx directly:
```bash
cd worker
npx tsx index.ts
```

## 📊 Expected Output

When the worker starts successfully, you should see:

```
2025-11-04T12:00:00.000Z Worker/Orchestrator starting...
2025-11-04T12:00:00.100Z [orchestrator] Initializing...
2025-11-04T12:00:00.200Z [orchestrator] Subscribed to transcript events
2025-11-04T12:00:00.300Z [orchestrator] Resuming 0 events
2025-11-04T12:00:00.400Z Worker/Orchestrator running...
```

## 🔍 What the Worker Does

1. **Polls every 3 seconds** for agents with status `'prepping'`
2. **Builds context database** when it finds a prepping agent
3. **Polls every 5 seconds** for live events with ready agents
4. **Subscribes to Supabase Realtime** for transcript processing

## 🐛 Troubleshooting

### Worker won't start

**Check dependencies:**
```bash
cd worker
pnpm install
```

**Check environment:**
```bash
cd worker
pnpm check-setup
```

### Worker starts but doesn't process agents

**Check agent status in database:**
- Agent should have status `'prepping'`
- Worker polls every 3 seconds, so it should pick it up quickly

**Check logs for errors:**
- Look for `[prep] error` messages
- Look for `[context] Error` messages

### Connection errors

**Supabase connection:**
- Verify Supabase is running: `supabase status` (for local)
- Check `SUPABASE_URL` in `.env` matches your instance

**OpenAI connection:**
- Verify API key is valid and has credits
- Check rate limits aren't exceeded

## 📝 Next Steps

Once the worker is running:

1. Create a new event in the UI (or use existing event)
2. Agent should be created with status `'prepping'`
3. Worker should detect it within 3 seconds
4. Watch logs for: `[prep] preparing agent...`
5. Context chunks should appear in the database
6. Agent status should change to `'context_complete'`
7. Check the context database visualization on the live event page

## 🔗 Related Documentation

- Full guide: `../dev_docs/20251103_181500_WORKER_LAUNCH_GUIDE.md`
- Architecture: `../dev_docs/20251103_175400_ORCHESTRATOR_EVENT_CREATION_FLOW.md`
- Context building: `../dev_docs/20251103_175800_STEP2_CONTEXT_DATABASE_CONSTRUCTION.md`

