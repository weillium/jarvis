# Hot Path Flow

1. ASR → `/ws/transcript {event_id, t_start_ms, t_end_ms, text}`
2. Backend updates rolling window + `topic_state`
3. Parallel retrieval: SQL(FTS) + Vector(ANN)
4. If low confidence & time left → Web RAG (allowlist, ≤1500ms)
5. Pack prompt; Together.ai JSON/tool call (≤3000ms)
6. Validate JSON; throttle/merge; add refs
7. Push cards to clients via `/ws/cards`
8. Log metrics & optional feedback
