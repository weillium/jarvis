# Security & Privacy Notes

- Web fetch allowlist file: `services/backend/config/allowlist.txt`
- Data retention: card logs kept 30 days; transcripts not stored
- Secrets: `TOGETHER_API_KEY`, `DEEPGRAM_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- CORS origins: `https://your-web.app`
- WebSocket auth: JWT required on connect; close with 4401 if invalid
