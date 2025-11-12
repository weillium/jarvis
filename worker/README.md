# Worker

The worker hosts the long-running agents that ingest context, orchestrate pipelines, and stream results back to the web client. It contains the runtime, pipelines, adapters, and supporting services needed to operate cards, facts, and transcripts agents in production.

## Getting Started
- Install dependencies: `pnpm --dir worker install`
- Start the worker locally: `pnpm --dir worker start`
- See `QUICKSTART.md` for environment requirements and detailed workflows.

## Entry Points
- `bootstrap/server/run-worker.ts` boots the HTTP interface that the platform uses to coordinate workers.
- `runtime/runtime-manager.ts` is the in-memory orchestrator that wires processors, sessions, and monitoring.
- `index.ts` exposes public worker APIs so other packages can drive pipelines programmatically.

## Directory Guide
- `bootstrap/` – service wiring and dependency boot logic (env loading, logging setup, pipeline registration).
  - `env.ts` centralizes config resolution.
  - `pipeline.ts` assembles context/processing pipelines with injected services.
  - `services.ts` and `logging.ts` expose factories consumed by runtime and HTTP entry points.
- `context/` – multi-phase context generation pipeline (blueprints, glossary expansion, chunking, pricing).
  - `pipeline/blueprint` handles research documents, LLM runners, prompt construction, and persistence.
  - `pipeline/chunks` loads sources, chunks prompts, and manages chunk persistence.
  - `pipeline/glossary` and `glossary-builder.ts` manage term extraction, merging, and storage.
  - `pipeline/orchestrator` coordinates phase sequencing and status reporting.
  - `utils/pricing` tracks budget constraints per event.
- `enrichment/` – pre-context data gathering enrichers and shared contracts.
  - `enrichers/` contains individual adapters (web search, Wikipedia, document extractors).
- `lib/` – reusable domain utilities (context normalization, document helpers, text transforms, card payload shaping).
  - `context-normalization.ts` standardizes context payload formats.
  - `documents/` and `text/` provide parsing, chunking, and prompt-formatting helpers.
- `services/observability/` – observability primitives (structured logging, metrics, checkpoints, status updates).
  - `checkpoint-manager.ts` resumes pipelines after interruptions.
  - `status-updater.ts` pushes progress to external systems.
- `policies/` – runtime policy definitions for cards, facts, and transcripts agents.
- `polling/` – background pollers that trigger context refresh, regeneration, and session lifecycle events.
  - `context-poller.ts`, `blueprint-poller.ts`, and `regeneration-poller.ts` target specific pipeline stages.
  - `session-startup-poller.ts` handles bootstrapping transports and sessions.
- `processing/` – post-context processors that emit agent-specific payloads.
  - `cards-processor.ts`, `facts-processor.ts`, `transcript-processor.ts` transform normalized context into runtime-ready DTOs.
- `prompts/` – prompt templates and builders shared across agent pipelines.
  - Agent-specific prompt builders live in `cards`, `facts`, `glossary`, `realtime`, and `transcript` files.
- `runtime/` – runtime services, budgeters, coordinators, and agent-specific orchestration logic.
  - `event-processor.ts` orchestrates high-level runtime flows.
  - `facts/` and `cards/` hold specialized budgeters and salience logic.
  - `orchestrator/` provides session orchestration (coordinators, status services).
- `scripts/` – local maintenance and debugging scripts (PCM generation, setup validation).
- `bootstrap/server/` – worker HTTP server wrapper and CLI entry point.
  - `run-worker.ts` is the CLI entry, `http-server.ts` hosts the request handlers.
- `services/` – external service integrations (model selection, OpenAI, SSE, Supabase repositories).
  - `model-management/` resolves provider metadata and model availability.
  - `supabase/` contains repositories, DTO mappers, and the Supabase gateway client.
- `sessions/` – session factory, adapters, and agent profile registries for realtime/stateless transports.
  - `agent-profiles/` houses per-agent realtime/stateless profiles plus shared tooling.
  - `session-adapters/` exposes drivers, handlers, and shared utilities for both transports.
- `state/` – durable in-memory stores backing incremental agent state (ring buffers, facts and cards stores).
- `tests/` – worker-specific automated tests.
- `types/` – shared TypeScript types for runtime, sessions, Supabase DTOs, and OpenAI signatures.
  - Includes ambient `.d.ts` shims (e.g., `pdf-parse.d.ts`).

## Cross-Cutting Patterns
- DTO-first contracts at every I/O boundary (Supabase, OpenAI, WebSocket) with runtime validation.
- No `any` types; prefer `unknown` with explicit guards.
- Treat React Query as the single source of truth for server state when interacting with web handlers.
- Wrap JSON parsing through the shared safe helpers rather than calling `JSON.parse` directly.
- Keep cards, transcripts, and facts agents isolated across runtime, processing, and session layers.

## Observability & Prompts
- Facts prompt budgeting streams detailed telemetry via `services/observability/status-updater.ts`:
  - `facts_budget` contains selection counts, overflow, summaries, merged cluster totals, merged fact provenance, and token usage.
  - Real-time values appear in the web Agent Sessions panel (“Facts Prompt Budget” card). Historical snapshots persist when sessions close.
- Worker logs include `[context] Facts Agent` entries that show token totals, selection ratio, and merged cluster counts per cycle.
- Tune thresholds by editing constants in `runtime/facts/prompt-budgeter.ts` (`FACTS_BUDGET_DEFAULTS`, `FAST_DECAY_THRESHOLD`, etc.) to react quickly to telemetry.


