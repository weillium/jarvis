# Launch Checklist: Realtime Transcription Service

Use this checklist to verify everything is working before deploying.

## ✅ Pre-Launch Checklist

### Infrastructure
- [ ] Docker Desktop is running
- [ ] Ports 3001 and 8080 are available
- [ ] Supabase is running locally (`supabase start`)
- [ ] Service role key copied from Supabase output

### Configuration
- [ ] `.env` file created from `env.example`
- [ ] `OPENAI_API_KEY` set correctly
- [ ] `SUPABASE_URL` set to `http://host.docker.internal:54421`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set correctly
- [ ] HTTP_PORT set to 3001 (or custom)
- [ ] WEBSOCKET_PORT set to 8080 (or custom)

### Build
- [ ] Dependencies installed (`pnpm install`)
- [ ] TypeScript builds successfully (`pnpm build`)
- [ ] Docker image builds (`docker-compose build`)
- [ ] No build errors or warnings

### Database
- [ ] Supabase migrations applied (`supabase db reset`)
- [ ] Transcripts table exists
- [ ] Can connect to database from host
- [ ] Service role key has insert permissions

## ✅ Launch Checklist

### Start Service
- [ ] Run `docker-compose up -d`
- [ ] Container starts successfully
- [ ] No errors in logs (`docker-compose logs`)
- [ ] Health check passes (`curl http://localhost:3001/health`)

### WebSocket
- [ ] WebSocket server starts on port 8080
- [ ] Can connect via wscat (`wscat -c "ws://localhost:8080?event_id=test"`)
- [ ] Receives connection confirmation
- [ ] Ping/pong works

### Database Integration
- [ ] Service connects to Supabase
- [ ] No connection errors in logs
- [ ] Can insert test record manually

### Worker Integration
- [ ] Worker service is running
- [ ] Worker polls transcripts table
- [ ] Test transcripts are picked up

## ⚠️ Next Steps (Not Complete)

### OpenAI Integration
- [ ] OpenAI SDK methods verified
- [ ] Realtime API session creates successfully
- [ ] Can send audio to OpenAI
- [ ] Receives transcript events
- [ ] Handles audio format correctly

### Client Integration
- [ ] Client component created
- [ ] Audio capture works
- [ ] WebSocket connection stable
- [ ] Audio sends to service
- [ ] Transcripts received

### UI Integration
- [ ] Component added to live page
- [ ] Start/stop recording works
- [ ] Transcripts display in real-time
- [ ] Errors handled gracefully
- [ ] Styling appropriate

## 🐛 Troubleshooting

### Service Won't Start
- [ ] Check Docker logs: `docker-compose logs realtime-transcribe`
- [ ] Verify .env file exists and is valid
- [ ] Check port conflicts: `netstat -an | grep -E '3001|8080'`
- [ ] Ensure Supabase is running: `supabase status`

### WebSocket Issues
- [ ] Test connection: `wscat -c "ws://localhost:8080?event_id=test"`
- [ ] Check firewall settings
- [ ] Verify service is listening: `netstat -an | grep 8080`

### Database Issues
- [ ] Test Supabase connection: `curl http://localhost:54421`
- [ ] Verify service role key
- [ ] Check from container: `docker-compose exec realtime-transcribe sh`
- [ ] In container: `curl http://host.docker.internal:54421`

### OpenAI Issues
- [ ] Verify API key is valid
- [ ] Check OpenAI account has Realtime API access
- [ ] Review logs for API errors
- [ ] Test API key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`

## 📊 Success Criteria

### Basic Functionality
- ✅ Service starts and runs
- ✅ Health check returns 200
- ✅ WebSocket accepts connections
- ⏳ Can send audio to OpenAI
- ⏳ Receives transcripts
- ⏳ Inserts to database
- ⏳ Worker processes transcripts

### User Experience
- ⏳ Audio capture works in browser
- ⏳ Transcripts appear in real-time
- ⏳ Can start/stop recording
- ⏳ Errors are user-friendly
- ⏳ Performance is acceptable

### Production Readiness
- ⏳ Authentication implemented
- ⏳ Rate limiting configured
- ⏳ Monitoring in place
- ⏳ Error logging works
- ⏳ Scaling tested

## 📝 Notes

Add any issues or observations here:

```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

## 🎯 Next Actions

Based on checklist completion:

1. If all basic checks pass → Proceed to OpenAI integration
2. If service won't start → Review troubleshooting section
3. If OpenAI not working → Verify SDK implementation
4. If client not working → Build audio capture component
5. If UI not working → Integrate to live page

---

**Last Updated**: 2025-01-04  
**Status**: Infrastructure ready, awaiting OpenAI implementation



