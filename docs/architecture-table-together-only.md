# Jarvis — Full Architecture (Together.ai Only)

| Component | Role | Hosting | Stack | Deployment | Dependencies | Input | Interfaces | Performance | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Web App (Organizer + Audience) | Event setup; live card stream | Vercel (or AWS Amplify) | Next.js (Node 18+), Tailwind | Static/SSR; CDN cached | Socket.io client, JWT auth | → UI state | WS /ws/cards, HTTP /api/cards/history, POST /api/feedback | FP ≤1.5s; render ≤120ms | Public screen mode; deep links |
| iOS/Android App | Mobile audience UI | App Stores via Expo EAS | React Native (Expo) | OTA via EAS | SecureStore, Push, WS | Scan QR/deeplink → UI | WS /ws/cards; HTTP history/feedback; Push register | Join ≤3s; resume ≤1s | Haptics optional; A11y |
| Backend Orchestrator API | REST + WS hub; runtime loop | Render/Railway (or ECS Fargate) | Node.js + Express + Socket.io (TS) | Horizontally scalable | Ajv, pino, prom-client | Transcript + bundle → cards | WS /ws/transcript (in), /ws/cards (out); HTTP /api/*; /health | P95 ≤5s | Rolling window, topic_state, throttles |
| Meta-Agent (Compile Job) | Build per-event bundle once | Same backend (in-process) or Cloud Run | Python/Node CLI | On-demand task | Scrapers, embedder | In: title, speakers, seed → Out: /bundles/<eventId>/* | Triggered by POST /api/events | ≤3 min/20 docs | Read-only in live session |
| Runtime LLM (Together) | Compose cards; tool-call retrieval | Together.ai (managed) | Phi-4-Mini-Instruct / Llama-3.1-8B | Provider autoscale | JSON mode + tools | Prompt → JSON cards | HTTPS SDK | Timeout 3000ms | No Ollama in this config |
| ASR | Live transcription | Deepgram/Whisper API | Streaming WS/HTTP | Provider autoscale | — | Audio → transcript frames | Push to WS /ws/transcript | 200–1000ms chunks | Client capture or relay |
| Structured Store | Canonical facts, templates, policies | Local file with backend | SQLite (FTS5 + json1) | One file/event | better-sqlite3 | Compile → read-only | In-proc access | FTS ≤200ms | Deterministic truth source |
| Vector Store | Semantic recall | Local file with backend | sqlite-vec | Single file | sqlite-vec | Embed at compile → ANN runtime | In-proc access | ANN ≤300ms | Path to LanceDB later |
| Web RAG Fetcher | Guardrailed open-web fallback | Inside backend | fetch + parser | In-proc | Allowlist | Query → short snippets + URLs | HTTPS; timeout ≤1500ms | ≤20% of cards | Always cite |
| Telemetry & Analytics | Metrics, logs, feedback | Supabase/Postgres + Grafana | Prom metrics; pino logs | Light usage | prom-client, pg | Emit counters → dashboards | HTTP ingest/batch | Alerts on P95>5s, JSON invalid>1% | PII-safe |
| Push Notifications | Start alerts; follow-ups | Expo Notifications | APNS/FCM | Managed | Expo SDK | Tokens ↔ reminders | POST /api/push/register | — | Optional MVP |
| Secrets & Config | Keys, tokens, flags | Doppler / Secrets Manager | Env injection | — | — | Env → processes | .env/.json | Rotate quarterly | 12-factor |
